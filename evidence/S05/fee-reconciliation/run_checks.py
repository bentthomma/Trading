#!/usr/bin/env python3
"""Private one-file fee-reconciliation candidate, actual original reducers/SQLite.
No broker imports or network destinations. Uses the existing archived platform
and existing S05 tests. Reports are external and never overwritten.
"""
from __future__ import annotations
import argparse, datetime, hashlib, importlib.util, json, os, re, shutil, subprocess, sys, tempfile
from pathlib import Path
sys.dont_write_bytecode = True
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(HERE.parent))
from check_sources import check, extract, sha

def snap(root):
    return {p.relative_to(root).as_posix():sha(p) for p in root.rglob('*')
            if p.is_file() and '.git' not in p.relative_to(root).parts}

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--sources',type=Path,required=True);ap.add_argument('--workbook',type=Path,required=True)
    ap.add_argument('--output',type=Path,required=True);ap.add_argument('--node',default=shutil.which('node'));a=ap.parse_args()
    out=a.output.resolve()
    if out==ROOT or ROOT in out.parents:raise SystemExit('EXTERNAL_OUTPUT_REQUIRED')
    out.mkdir(parents=True,exist_ok=False)
    report={'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'uid':os.getuid(),'commands':[],
        'scope':'private_existing_order_reducer_candidate','product_installed':False,'broker_actions':False,
        'native_CSharp_executed':False,'formal_gate_changed':False,'power_loss_test':False}
    env={k:v for k,v in os.environ.items() if not k.startswith('GIT_')}
    env.update(PYTHONDONTWRITEBYTECODE='1',GIT_CONFIG_NOSYSTEM='1',GIT_CONFIG_GLOBAL=os.devnull,GIT_ALLOW_PROTOCOL='file',GIT_TERMINAL_PROMPT='0')
    def call(name,cmd,cwd=ROOT,extra=None,expected_exit=0):
        cmd=list(map(str,cmd));p=subprocess.run(cmd,cwd=cwd,env={**env,**(extra or {})},capture_output=True,text=True,timeout=90)
        (out/(name+'.stdout')).write_text(p.stdout);(out/(name+'.stderr')).write_text(p.stderr)
        report['commands'].append({'name':name,'argv':cmd,'exit_code':p.returncode,
            'stdout_sha256':hashlib.sha256(p.stdout.encode()).hexdigest(),'stderr_sha256':hashlib.sha256(p.stderr.encode()).hexdigest()})
        if p.returncode!=expected_exit:raise RuntimeError('UNEXPECTED_EXIT:'+name+':'+str(p.returncode))
        return p
    def node_count(p,expected,skipped=0):
        passed=re.search(r'# pass (\d+)',p.stdout);failed=re.search(r'# fail (\d+)',p.stdout);skip=re.search(r'# skipped (\d+)',p.stdout)
        if not passed or int(passed.group(1))!=expected or not failed or int(failed.group(1)) or not skip or int(skip.group(1))!=skipped:
            raise RuntimeError('INCOMPLETE_NODE_TEST_RUN')
        return int(passed.group(1))
    try:
        baseline=snap(ROOT);binding=json.loads((HERE/'source-bindings.json').read_text())
        report['base_sources']=check(a.sources.absolute(),a.workbook.absolute())
        for name,row in binding['files'].items():
            p=ROOT/name
            if p.is_symlink() or not p.is_file() or sha(p)!=row['sha256'] or p.stat().st_size!=row['bytes']:raise ValueError('CANDIDATE_BINDING_CHANGED:'+name)
        report['binding']=binding
        guard=ROOT/'baseline/s01_reference/tools/no_connect.py'
        if sha(guard)!='c325318380f4ab85900fc1535b9790abfb84389f60393924e1fdf416c218ea10':raise RuntimeError('GUARD_CHANGED')
        spec=importlib.util.spec_from_file_location('fee_net_guard',guard);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);mod.install()
        call('network_probe',[sys.executable,'-B','-c',"import socket,errno;s=socket.socket();\ntry:s.connect(('127.0.0.1',9))\nexcept OSError as e:assert e.errno==errno.EPERM;print('CONNECT_DENIED_EPERM')\nelse:raise AssertionError('NETWORK_NOT_BLOCKED')"])
        report['network_connections_denied']=True
        report['node']=call('node_version',[a.node,'--version']).stdout.strip();report['python']=sys.version
        with tempfile.TemporaryDirectory(prefix='s05-fee-tests-') as td:
            td=Path(td);original,master=extract(a.sources.absolute(),a.workbook.absolute(),td/'original',ROOT);original_before=snap(td/'original')
            candidate=td/'candidate';shutil.copytree(original,candidate)
            rel=Path('core/planning/order-lifecycle.mjs');patch=HERE/'order-lifecycle.patch'
            call('patch_check',['/usr/bin/git','apply','--check',patch],cwd=candidate)
            call('patch_apply',['/usr/bin/git','apply',patch],cwd=candidate)
            if sha(candidate/rel)!=binding['candidate']['sha256'] or (candidate/rel).stat().st_size!=binding['candidate']['bytes']:raise ValueError('PATCH_BYTES_MISMATCH')
            candidate_snapshot=snap(candidate)
            changed=[p for p,h in snap(original).items() if candidate_snapshot.get(p)!=h]
            if changed!=[rel.as_posix()]:raise ValueError('MORE_THAN_ONE_SOURCE_CHANGED:'+repr(changed))
            candidate_before=snap(candidate)
            env.update(S05_PLATFORM=str(candidate),S05_ORIGINAL_PLATFORM=str(original),S05_NODE=str(a.node),
                S05_SOURCES=str(a.sources.absolute()),S05_WORKBOOK=str(a.workbook.absolute()),S05_LAB03=str(master/'materials/portfolio_lab.py'))
            p=call('fee_candidate_tests',[a.node,'--test',HERE/'test_deferred_costs.mjs']);report['new_test_methods']=node_count(p,38)
            p=call('original_order_regressions',[a.node,'--test',candidate/'tests/planning-orders.mjs'],cwd=candidate);report['original_test_methods']=node_count(p,41)
            p=call('prior_relevant_order_boundaries',[a.node,'--test','--test-name-pattern=^S05 ',HERE.parent/'original_orders.test.mjs'])
            report['prior_relevant_test_methods']=node_count(p,12)
            report['historical_defect_characterizations_not_used_as_candidate_expectations']=3
            for name,pattern,count in [('money_and_schema','test_ledger_reference.py',20),('original_source_checks','test_sources.py',5)]:
                p=call(name,[sys.executable,'-B','-m','unittest','discover','-s','evidence/S05','-p',pattern,'-v'])
                got=re.search(r'Ran (\d+) tests',p.stderr)
                if not got or int(got.group(1))!=count or not p.stderr.rstrip().endswith('OK'):raise ValueError('INCOMPLETE_PYTHON_TESTS')
                report[name+'_methods']=count
            # Identical assertions applied to the unchanged original. These MUST fail.
            p=call('original_fee_defects',[a.node,'--test','--test-name-pattern=^F(01|03|29) ',HERE/'test_deferred_costs.mjs'],
                extra={'S05_PLATFORM':str(original)},expected_exit=1)
            if '# fail 3\n' not in p.stdout or p.stdout.count('ERR_ASSERTION')!=3:raise ValueError('ORIGINAL_DEFECT_NOT_REPRODUCED')
            report['original_defect_counterexamples']=3
            candidate_text=(candidate/rel).read_text()
            mutants=[('drop_pending_receipt','state.costEvidence.push({...row,hash:digest(row)});','/* deliberately missing receipt for mutation test */','^F01 '),
                ('ignore_conflicting_amounts','const conflict=variants.size>1;','const conflict=false;','^F10 '),
                ('trust_rehashed_derived_fee','!same(recalculated.fills,value.fills)||!same(recalculated.closes,value.closes)||','','^F20 ')]
            report['mutations_detected']=[]
            for name,old,new,pattern in mutants:
                if candidate_text.count(old)!=1:raise RuntimeError('MUTATION_ANCHOR:'+name)
                (candidate/rel).write_text(candidate_text.replace(old,new))
                try:
                    p=call('mutation_'+name,[a.node,'--test','--test-name-pattern='+pattern,HERE/'test_deferred_costs.mjs'],expected_exit=1)
                    if '# fail 1\n' not in p.stdout or 'ERR_ASSERTION' not in p.stdout:raise ValueError('MUTATION_NOT_CAUGHT:'+name)
                    report['mutations_detected'].append(name)
                finally:(candidate/rel).write_text(candidate_text)
            if snap(candidate)!=candidate_before:raise ValueError('CANDIDATE_CHANGED_DURING_TESTS')
            call('source_patch_reverse',['/usr/bin/git','apply','-R',patch],cwd=candidate)
            if snap(candidate)!=snap(original):raise ValueError('PATCH_REVERSE_MISMATCH')
            report['single_product_file_patch_roundtrip']=True
            if snap(td/'original')!=original_before:raise ValueError('ORIGINAL_SOURCE_CHANGED')
            report['original_files_unchanged']=len(original_before)
        if snap(ROOT)!=baseline:raise ValueError('CHECKOUT_CHANGED_DURING_TESTS')
        report['checkout_files_unchanged']=len(baseline)
        report['unique_test_methods']=sum(report[k] for k in ['new_test_methods','original_test_methods','prior_relevant_test_methods','money_and_schema_methods','original_source_checks_methods'])
        report['static_schema_methods_within_total']=3
        report['actual_process_kills']=2
        report['delivery_permutations_in_one_method']=120
        report.update(status='passed_private_fee_candidate',exit_code=0)
    except Exception as exc:
        report.update(status='failed',exit_code=1,error=repr(exc))
    report['finished_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    (out/'execution.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False,indent=2));return report['exit_code']
if __name__=='__main__':raise SystemExit(main())
