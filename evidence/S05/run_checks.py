#!/usr/bin/env python3
"""Focused S05 golden and original-boundary replay, broker-free and network denied."""
from __future__ import annotations
import argparse,datetime,hashlib,importlib.util,json,os,re,shutil,subprocess,sys,tempfile
from pathlib import Path
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(Path(__file__).resolve().parent))
from check_sources import check,extract,sha

def snapshot(root):return {p.relative_to(root).as_posix():sha(p)for p in root.rglob('*')if p.is_file()and '.git'not in p.relative_to(root).parts}
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--sources',type=Path,required=True);ap.add_argument('--workbook',type=Path,required=True);ap.add_argument('--output',type=Path,required=True);ap.add_argument('--node',default=shutil.which('node'));a=ap.parse_args()
    out=a.output.resolve();sources=a.sources.absolute();workbook=a.workbook.absolute()
    if out==ROOT or ROOT in out.parents:raise SystemExit('EXTERNAL_OUTPUT_REQUIRED')
    out.mkdir(parents=True,exist_ok=False)
    report={'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'uid':os.getuid(),'commands':[],
     'scope':'private_S05_reference_and_original_integration_boundaries','product_installed':False,'broker_actions':False,'CSharp_executed':False,'full_product_acceptance':False}
    env={k:v for k,v in os.environ.items()if not k.startswith('GIT_')}
    env.update(PYTHONDONTWRITEBYTECODE='1',GIT_CONFIG_NOSYSTEM='1',GIT_CONFIG_GLOBAL=os.devnull,GIT_ALLOW_PROTOCOL='file',GIT_TERMINAL_PROMPT='0')
    def call(name,cmd,cwd=ROOT,expect_fail=False,extra=None):
        cmd=list(map(str,cmd));p=subprocess.run(cmd,cwd=cwd,env={**env,**(extra or {})},capture_output=True,text=True,timeout=90)
        (out/(name+'.stdout')).write_text(p.stdout);(out/(name+'.stderr')).write_text(p.stderr)
        report['commands'].append({'name':name,'argv':cmd,'exit_code':p.returncode,'stdout_sha256':hashlib.sha256(p.stdout.encode()).hexdigest(),'stderr_sha256':hashlib.sha256(p.stderr.encode()).hexdigest()})
        if expect_fail:
            if p.returncode==0 or 'AssertionError'not in p.stderr:raise RuntimeError('MUTATION_NOT_CAUGHT:'+name)
        elif p.returncode:raise RuntimeError('FAILED:'+name)
        return p
    try:
        before=snapshot(ROOT);report['sources']=check(sources,workbook);source_hashes=[sha(sources),sha(workbook)]
        guard=ROOT/'baseline/s01_reference/tools/no_connect.py'
        if sha(guard)!='c325318380f4ab85900fc1535b9790abfb84389f60393924e1fdf416c218ea10':raise RuntimeError('GUARD_CHANGED')
        sp=importlib.util.spec_from_file_location('net_guard',guard);g=importlib.util.module_from_spec(sp);sp.loader.exec_module(g);g.install()
        call('network_probe',[sys.executable,'-B','-c',"import socket,errno;s=socket.socket();\ntry:s.connect(('127.0.0.1',9))\nexcept OSError as e:assert e.errno==errno.EPERM;print('CONNECT_DENIED_EPERM')\nelse:raise AssertionError('NETWORK_NOT_BLOCKED')"])
        report['network_connections_denied']=True
        with tempfile.TemporaryDirectory(prefix='s05-originals-')as td:
            td=Path(td);platform,master=extract(sources,workbook,td/'original',ROOT);original_before=snapshot(td/'original')
            env.update(S05_PLATFORM=str(platform),S05_SOURCES=str(sources),S05_WORKBOOK=str(workbook),S05_NODE=str(a.node),S05_LAB03=str(master/'materials/portfolio_lab.py'))
            report['node']=call('node_version',[a.node,'--version']).stdout.strip();report['python']=sys.version
            probe=json.loads(call('original_probe',[a.node,ROOT/'evidence/S05/original_probe.mjs',platform,ROOT/'evidence/S05/golden-ledger.json']).stdout)
            expected=json.loads((ROOT/'evidence/S05/golden-ledger.json').read_text())
            if probe['arithmetic']!=[x['expected']for x in expected['cases']]:raise RuntimeError('ARITHMETIC_MISMATCH')
            (out/'original-observations.json').write_text(json.dumps(probe,ensure_ascii=False,indent=2)+'\n')
            for name,pattern in [('golden_and_schema_tests','test_ledger_reference.py'),('source_tests','test_sources.py')]:
                p=call(name,[sys.executable,'-B','-m','unittest','discover','-s','evidence/S05','-p',pattern,'-v'])
                report[name]=int(re.search(r'Ran (\d+) tests',p.stderr).group(1))
            for name,path,cwd in [('new_original_boundary_tests',ROOT/'evidence/S05/original_orders.test.mjs',ROOT),('original_order_regressions',platform/'tests/planning-orders.mjs',platform)]:
                p=call(name,[a.node,'--test',path],cwd=cwd)
                report[name]=int(re.search(r'# tests (\d+)',p.stdout).group(1))
                if not re.search(r'# fail 0\n',p.stdout) or not re.search(r'# skipped 0\n',p.stdout):raise RuntimeError('INCOMPLETE_NODE_SUITE')
            report['mutations_detected']=[]
            # Run the exact same oracle tests against three deliberately defective copies.
            text=(ROOT/'evidence/S05/mpr1_reference.py').read_text()
            mutants=[('single_side_fee_in_risk','unit_risk = entry - stop + 2*fee','unit_risk = entry - stop + fee','ExactCash.test_normal_loss_and_cash_equations'),
                      ('round_up_quantity','quantity = sized','quantity = sized + 1','ExactCash.test_unfunded_small_cash_is_zero_quantity'),
                      ('double_charge_entry_fee','net=gross-entry_fee-exit_fee','net=gross-entry_fee-exit_fee-entry_fee','ExactCash.test_no_spread_or_slippage_double_deduction')]
            for name,old,new,test in mutants:
                if text.count(old)!=1:raise RuntimeError('MUTATION_ANCHOR')
                path=td/(name+'.py')
                # Only the test copy's package root is rebound; production source stays untouched.
                source=text.replace('ROOT = Path(__file__).resolve().parents[2]',f'ROOT = Path({str(ROOT)!r})').replace(old,new)
                # The explicit identity assertion is disabled in this mutation ONLY so the targeted unittest observes the wrong result.
                if name=='double_charge_entry_fee':source=source.replace("need(ending == cash+net, 'CASH_IDENTITY_BROKEN')",'pass # test mutation only')
                path.write_text(source)
                call('mutation_'+name,[sys.executable,'-B','-m','unittest','test_ledger_reference.'+test,'-v'],cwd=ROOT/'evidence/S05',expect_fail=True,extra={'S05_ORACLE_MUTATION':str(path)})
                report['mutations_detected'].append(name)
            if snapshot(td/'original')!=original_before:raise RuntimeError('ORIGINAL_SOURCE_CHANGED')
            report['extracted_original_files_unchanged']=len(original_before)
        if snapshot(ROOT)!=before:raise RuntimeError('CHECKOUT_CHANGED')
        if [sha(sources),sha(workbook)]!=source_hashes:raise RuntimeError('SOURCE_CHANGED')
        report['unique_test_methods']=sum(report[k]for k in ['golden_and_schema_tests','source_tests','new_original_boundary_tests','original_order_regressions'])
        report['known_defect_characterizations']=3
        report['exact_money_cases_compared']=6;report['case_permutations_in_one_test']=24
        report['native_sender_or_broker_executed']=False
        report.update(status='passed_private_reference_with_explicit_unfixed_fee_ordering_gap',exit_code=0,checkout_files_unchanged=len(before))
    except Exception as e:report.update(status='failed',exit_code=1,error=repr(e))
    report['finished_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat();(out/'execution.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False,indent=2));return report['exit_code']
if __name__=='__main__':raise SystemExit(main())
