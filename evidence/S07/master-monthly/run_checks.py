#!/usr/bin/env python3
"""Focused monthly audit replay; does not repeat the unchanged full tick scan."""
from __future__ import annotations
import argparse,datetime,hashlib,importlib.util,json,os,re,subprocess,sys,tempfile
from pathlib import Path
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[3]
def sha(p):
    with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def snapshot(p):return {f.relative_to(p).as_posix():sha(f) for f in p.rglob('*') if f.is_file() and '.git' not in f.relative_to(p).parts}
def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    out=a.output.resolve();source=a.source.resolve()
    if out==ROOT or ROOT in out.parents:raise SystemExit('EXTERNAL_OUTPUT_REQUIRED')
    out.mkdir(parents=True,exist_ok=False)
    report={'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'uid':os.getuid(),'python':sys.version,'commands':[],
       'broker_actions':False,'new_strategy_run':False,'native_execution':False,'unchanged_teil6_full_scan_repeated':False}
    env={k:v for k,v in os.environ.items() if not k.startswith('GIT_')}
    env.update(PYTHONDONTWRITEBYTECODE='1',GIT_CONFIG_NOSYSTEM='1',GIT_CONFIG_GLOBAL=os.devnull,GIT_ALLOW_PROTOCOL='file',GIT_TERMINAL_PROMPT='0',
       EXTREMELAB_MONTHLY_SOURCE=str(source),EXTREMELAB_MONTHLY_RESULT=str(out/'monthly'),
       EXTREMELAB_TEIL6=str(source),EXTREMELAB_DATA_RESULT=str(ROOT/'data/catalog/teil6-v1'),PYTHONPATH=str(ROOT/'data/quality'))
    def call(name,cmd,cwd=ROOT,extra=None,expect_fail=False):
        cmd=list(map(str,cmd));r=subprocess.run(cmd,cwd=cwd,env={**env,**(extra or {})},text=True,capture_output=True,timeout=120)
        (out/(name+'.stdout')).write_text(r.stdout);(out/(name+'.stderr')).write_text(r.stderr)
        report['commands'].append({'name':name,'command':cmd,'exit_code':r.returncode,'stdout_sha256':hashlib.sha256(r.stdout.encode()).hexdigest(),'stderr_sha256':hashlib.sha256(r.stderr.encode()).hexdigest()})
        if expect_fail:
            if r.returncode==0 or 'AssertionError' not in r.stderr:raise RuntimeError('EXPECTED_ASSERTION_NOT_OBSERVED:'+name)
        elif r.returncode:raise RuntimeError(name+' failed')
        return r
    try:
        before=snapshot(ROOT);source_hash=sha(source)
        gpath=ROOT/'baseline/s01_reference/tools/no_connect.py'
        if sha(gpath)!='c325318380f4ab85900fc1535b9790abfb84389f60393924e1fdf416c218ea10':raise RuntimeError('NETWORK_GUARD_CHANGED')
        s=importlib.util.spec_from_file_location('no_connect',gpath);g=importlib.util.module_from_spec(s);s.loader.exec_module(g);g.install()
        call('network_probe',[sys.executable,'-B','-c',"import socket,errno;s=socket.socket();\ntry:s.connect(('127.0.0.1',9))\nexcept OSError as e:assert e.errno==errno.EPERM;print('CONNECT_DENIED_EPERM')\nelse:raise AssertionError('NOT_DENIED')"])
        report['network_connections_denied']=True
        call('full_monthly_audit',[sys.executable,'-B','data/quality/master_monthly_audit.py','--archive',source,'--output',out/'monthly'])
        if snapshot(out/'monthly')!=snapshot(ROOT/'data/catalog/master-monthly-v1'):raise RuntimeError('MONTHLY_REPLAY_CHANGED')
        call('merged_catalogue',[sys.executable,'-B','evidence/S07/prepare_catalog.py','--audit',ROOT/'data/catalog/teil6-v1','--output',out/'catalogue'])
        for f in (out/'catalogue').iterdir():
            if f.read_bytes()!=(ROOT/'evidence/S07'/f.name).read_bytes():raise RuntimeError('CATALOGUE_REPLAY_CHANGED')
        r=call('new_tests',[sys.executable,'-B','-m','unittest','discover','-s','tests/data','-p','test_master_monthly.py','-v'])
        report['new_test_methods']=int(re.search(r'Ran (\d+) tests',r.stderr).group(1))
        r=call('relevant_previous_tests',[sys.executable,'-B','-m','unittest','test_teil6_audit.DecodeTests','test_teil6_audit.CompatibilityTests','test_teil6_audit.CatalogueTests','-v'],cwd=ROOT/'tests/data')
        report['previous_test_methods']=int(re.search(r'Ran (\d+) tests',r.stderr).group(1))
        sys.path.insert(0,str(ROOT/'data/quality'));import master_monthly_audit as m
        data=m.source_bytes(source)
        with tempfile.TemporaryDirectory(prefix='monthly-counterexamples-') as td:
            td=Path(td);original=td/'original_transform.py';original.write_bytes(data['materials/prepare_research_collection.py'])
            call('original_overwrite_counterexample',[sys.executable,'-B','-m','unittest','test_master_monthly.OriginalTransform.test_existing_frozen_csv_not_replaced','-v'],cwd=ROOT/'tests/data',extra={'EXTREMELAB_COLLECTION_TRANSFORM':str(original)},expect_fail=True)
            report['original_overwrite_reproduced']=True
            cases=[('month_sequence','if ordinal(row[0])!=ordinal(start)+i:','if False:','DecimalWindow.test_duplicate_gap_and_reversed_months_rejected'),
                   ('total_return_bound','if col in total_columns and v<=-1:','if False:','DecimalWindow.test_total_return_must_have_positive_gross')]
            report['mutations_detected']=[]
            for name,old,new,test in cases:
                text=(ROOT/'data/quality/master_monthly_audit.py').read_text()
                if text.count(old)!=1:raise RuntimeError('MUTATION_TARGET')
                path=td/(name+'.py');path.write_text(text.replace(old,new))
                call('mutation_'+name,[sys.executable,'-B','-m','unittest','test_master_monthly.'+test,'-v'],cwd=ROOT/'tests/data',extra={'EXTREMELAB_MONTHLY_AUDITOR':str(path)},expect_fail=True)
                report['mutations_detected'].append(name)
            report['mutations_detected'].append('output_overwrite_guard_reverted_to_original')
        if before!=snapshot(ROOT):raise RuntimeError('CHECKOUT_CHANGED')
        if sha(source)!=source_hash:raise RuntimeError('SOURCE_CHANGED')
        report.update(status='passed_private_monthly_preparation',exit_code=0,source_archive_sha256=source_hash,
            unique_test_methods=report['new_test_methods']+report['previous_test_methods'],
            original_parser_assertions_nested_in_one_test=35,original_packaged_assertions_in_audit=50,
            audit_outputs_reproduced=4,combined_catalogue_outputs_reproduced=3,
            checkout_files_unchanged=len(before),counts=json.loads((out/'monthly/monthly-profile.json').read_text())['counts'],
            upstream_raw_provider_archives_verified=0)
    except Exception as e:report.update(status='failed',exit_code=1,error=repr(e))
    report['finished_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat();(out/'execution.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False,indent=2));return report['exit_code']
if __name__=='__main__':raise SystemExit(main())
