#!/usr/bin/env python3
"""Full broker-free audit replay, data-bound tests and targeted mutation checks."""
from __future__ import annotations
import argparse,datetime,hashlib,importlib.util,json,os,re,shutil,subprocess,sys,tempfile
from pathlib import Path
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[2]
def sha(p):
    with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def snapshot(root):return {p.relative_to(root).as_posix():sha(p) for p in root.rglob('*') if p.is_file() and '.git' not in p.relative_to(root).parts}
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--archive',type=Path,required=True);ap.add_argument('--output',type=Path,required=True);a=ap.parse_args()
    out=a.output.resolve();archive=a.archive.resolve()
    if out==ROOT or ROOT in out.parents:raise SystemExit('OUTPUT_MUST_BE_EXTERNAL')
    out.mkdir(parents=True,exist_ok=False)
    report={'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'uid':os.getuid(),'python':sys.version,'commands':[],'scope':'S07 Teil6 data audit, not formal acceptance','broker_actions':False,'native_compiler_started':False,'trading_simulation_run':False}
    env={k:v for k,v in os.environ.items() if not k.startswith('GIT_')};env.update(PYTHONDONTWRITEBYTECODE='1',GIT_CONFIG_NOSYSTEM='1',GIT_CONFIG_GLOBAL=os.devnull,GIT_ALLOW_PROTOCOL='file',EXTREMELAB_TEIL6=str(archive),EXTREMELAB_DATA_RESULT=str(out/'audit'))
    def call(name,cmd,cwd=ROOT,extra=None,expected_failure=False):
        p=subprocess.run(list(map(str,cmd)),cwd=cwd,env={**env,**(extra or {})},capture_output=True,text=True,timeout=480)
        (out/(name+'.stdout')).write_text(p.stdout);(out/(name+'.stderr')).write_text(p.stderr)
        report['commands'].append({'name':name,'command':list(map(str,cmd)),'exit_code':p.returncode,'stdout_sha256':hashlib.sha256(p.stdout.encode()).hexdigest(),'stderr_sha256':hashlib.sha256(p.stderr.encode()).hexdigest()})
        if expected_failure:
            if p.returncode==0 or 'AssertionError' not in p.stderr:raise ValueError('MUTATION_NOT_DETECTED:'+name)
        elif p.returncode:raise ValueError(name+' failed')
        return p
    try:
        before=snapshot(ROOT);input_sha=sha(archive)
        guard=ROOT/'baseline/s01_reference/tools/no_connect.py'
        if sha(guard)!='c325318380f4ab85900fc1535b9790abfb84389f60393924e1fdf416c218ea10':raise ValueError('GUARD_CHANGED')
        spec=importlib.util.spec_from_file_location('guard',guard);g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g);g.install()
        call('network_probe',[sys.executable,'-B','-c',"import socket,errno;s=socket.socket();\ntry:s.connect(('127.0.0.1',9))\nexcept OSError as e:assert e.errno==errno.EPERM;print('CONNECT_DENIED_EPERM')\nelse:raise AssertionError('NETWORK_NOT_DENIED')"])
        report['network_connections_denied']=True
        call('full_original_audit',[sys.executable,'-B','data/quality/teil6_audit.py','--archive',archive,'--output',out/'audit'])
        generated=out/'audit';expected=ROOT/'data/catalog/teil6-v1'
        if snapshot(generated)!=snapshot(expected):raise ValueError('DATA_REPLAY_DIFFERS')
        call('catalogue',[sys.executable,'-B','evidence/S07/prepare_catalog.py','--audit',generated,'--output',out/'catalogue'])
        for p in (out/'catalogue').iterdir():
            if p.read_bytes()!=(ROOT/'evidence/S07'/p.name).read_bytes():raise ValueError('CATALOGUE_DIFFERS:'+p.name)
        p=call('data_methods',[sys.executable,'-B','-m','unittest','discover','-s','tests/data','-p','test_teil6_audit.py','-v'])
        report['unique_test_methods']=int(re.search(r'Ran (\d+) tests',p.stderr).group(1))
        mutations=[('ohlc_validation',"if low>min(op,close) or high<max(op,close) or low>high:","if False:",'DecodeTests.test_ohlc_inconsistency_rejected'),('clock_reversal',"if delta<0:","if False:",'OriginalArchiveTests.test_real_original_clock_pair_through_decoder'),('resolution_compatibility',"if mode not in product.get('research_modes',[]):","if False:",'CompatibilityTests.test_open_only_rejects_intrabar')]
        report['mutations']=[]
        for name,old,new,test in mutations:
            with tempfile.TemporaryDirectory(prefix='s07-mutation-') as td:
                path=Path(td)/'teil6_audit.py';s=(ROOT/'data/quality/teil6_audit.py').read_text()
                if s.count(old)!=1:raise ValueError('MUTATION_TARGET_NOT_UNIQUE')
                path.write_text(s.replace(old,new))
                call('mutation_'+name,[sys.executable,'-B','-m','unittest','test_teil6_audit.'+test,'-v'],cwd=ROOT/'tests/data',extra={'EXTREMELAB_AUDITOR':str(path)},expected_failure=True)
                report['mutations'].append({'case':name,'detected':True})
        if before!=snapshot(ROOT):raise ValueError('CHECKOUT_CHANGED')
        if sha(archive)!=input_sha:raise ValueError('SOURCE_ARCHIVE_CHANGED')
        data=json.loads((generated/'data-quality-report.json').read_text());main=[x for x in data['fx'] if x['cohort']=='main_2024_2025']
        report.update(archive_sha256=input_sha,checkout_files_unchanged=len(before),replayed_output_files=len(snapshot(generated)),catalogue_files_replayed=3,crypto_source_rows=data['crypto']['source_rows'],fx_main_rows=sum(x['rows'] for x in main),fx_pilot_rows=sum(x['rows'] for x in data['fx'] if x['cohort']=='rejected_pilot'),status='passed_private_data_preparation_only',exit_code=0)
    except Exception as e:report.update(status='failed',error=repr(e),exit_code=1)
    report['finished_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat();(out/'execution.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False,indent=2));return report['exit_code']
if __name__=='__main__':raise SystemExit(main())
