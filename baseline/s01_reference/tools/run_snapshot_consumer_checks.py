#!/usr/bin/env python3
"""Reproduce the private renderer proposal without IP connections.

Requires Linux, libseccomp, Python, aiohttp, Playwright, Chromium, Node and patch.
Run as an unprivileged user; reports MUST be outside this immutable package.
"""
from __future__ import annotations
import argparse
from datetime import datetime,timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from unix_http_offline import install

def main():
    a=argparse.ArgumentParser();a.add_argument('--reports-dir',required=True);opts=a.parse_args()
    report=Path(opts.reports_dir).resolve()
    if report==ROOT or ROOT in report.parents:raise ValueError('REPORTS_MUST_BE_EXTERNAL')
    if os.geteuid()==0:raise RuntimeError('RUN_AS_UNPRIVILEGED_USER')
    report.mkdir(parents=True,exist_ok=False)
    install()
    result={'schema':'extremelab-snapshot-consumer-execution/v1','work_id':'S01-SNAPSHOT-CONSUMER-GUARD',
        'started_utc':datetime.now(timezone.utc).isoformat(),'uid':os.geteuid(),'python':sys.version,
        'network':'IP socket creation denied by inherited seccomp; real Chromium about:blank DOM and Blob downloads; no browser network requests permitted',
        'scope':'Real SQLite Store projection -> archived journal importer -> DOM -> Blob export -> importer, not final live/skin consumer or Vercel integration',
        'executions':[],'status':'running'}
    env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1','PYTHONPATH':str(ROOT/'tests')+os.pathsep+str(ROOT/'tools')}
    env.pop('S01_CONSUMER_SOURCE',None)
    def run(label,args,*,cwd=ROOT,overrides=None,expected=0,methods=None,failure_contains=None):
        started=time.monotonic()
        cp=subprocess.run(args,cwd=cwd,env={**env,**(overrides or {})},text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=90)
        log=report/(label+'.log');log.write_text(cp.stdout)
        row={'label':label,'command':[str(x) for x in args],'returncode':cp.returncode,
            'elapsed_seconds':round(time.monotonic()-started,3),'log':log.name,
            'log_sha256':hashlib.sha256(log.read_bytes()).hexdigest()}
        result['executions'].append(row)
        if expected=='test_failure':
            assert cp.returncode!=0 and 'Ran 1 test in ' in cp.stdout and ('FAIL:' in cp.stdout or 'ERROR:' in cp.stdout),cp.stdout
            assert failure_contains and failure_contains in cp.stdout,cp.stdout
            row['expected_behavior_failure']=True
            row['required_failure_diagnostic']=failure_contains
        else:assert cp.returncode==expected,cp.stdout
        if methods is not None:
            assert re.search(r'Ran '+str(methods)+r' tests? in ',cp.stdout) and '\nOK\n' in cp.stdout,cp.stdout
            assert 'skipped=' not in cp.stdout
            row['methods']=methods
        return cp.stdout
    try:
        run('01_package_before',[sys.executable,'-B',str(ROOT/'verify_package.py')])
        with tempfile.TemporaryDirectory(prefix='s01-consumer-patch-') as tmp:
            d=Path(tmp);(d/'public').mkdir()
            original=(ROOT/'baseline/recovery_donors/expected_patched_app.js').read_bytes()
            candidate=(ROOT/'proposals/snapshot-consumer-guard/app.js').read_bytes()
            (d/'public/app.js').write_bytes(original)
            patch=str(ROOT/'proposals/snapshot-consumer-guard/app-snapshot-consumer.diff')
            run('02_patch_forward',['/usr/bin/patch','--batch','--fuzz=0','-p1','-i',patch],cwd=d)
            assert (d/'public/app.js').read_bytes()==candidate
            run('03_patch_reverse',['/usr/bin/patch','--batch','--fuzz=0','-R','-p1','-i',patch],cwd=d)
            assert (d/'public/app.js').read_bytes()==original
        run('04_browser_sources',[sys.executable,'-B','-m','unittest','discover','-s','tests','-p','test_snapshot_consumer.py','-v'],methods=16)
        run('05_inventory_policy',[sys.executable,'-B','-m','unittest','discover','-s','tests','-p','test_s01_candidate.py','-v'],methods=12)
        run('06_inventory_sources',[sys.executable,'-B','-m','unittest','discover','-s','tests','-p','test_s01_recovery.py','-v'],methods=8)
        old=str(ROOT/'baseline/recovery_donors/expected_patched_app.js')
        for label,method,needle in [('07_original_malformed','test_invalid_real_snapshot_is_readable_without_losing_raw_events','number 42 is not iterable'),('08_original_metadata','test_valid_real_store_snapshot_renders_and_retains_source_scope',"KeyError: 'snapshot'")]:
            run(label,[sys.executable,'-B','-m','unittest','test_snapshot_consumer.BrowserTests.'+method,'-v'],overrides={'S01_CONSUMER_SOURCE':old},expected='test_failure',failure_contains=needle)
        code=(ROOT/'proposals/snapshot-consumer-guard/app.js').read_text()
        variants=[
            ('09_mutation_shape_guard',"if(ev.kind==='BARS'&&candleList(ev.data.candles))", "if(ev.kind==='BARS')",'test_invalid_real_snapshot_is_readable_without_losing_raw_events','ev.data.candles is not iterable'),
            ('10_mutation_drop_diagnosis','snapshot=snapshotSource(x);','snapshot=null;','test_valid_real_store_snapshot_renders_and_retains_source_scope',"TypeError: 'NoneType' object is not subscriptable"),
            ('11_mutation_export_metadata','gaps:meta.gaps,snapshot:meta.snapshot,invalidCandlePayloads:meta.invalidCandlePayloads','gaps:meta.gaps,invalidCandlePayloads:meta.invalidCandlePayloads','test_download_roundtrip_preserves_diagnosis_and_raw_events',"KeyError: 'snapshot'")]
        with tempfile.TemporaryDirectory(prefix='s01-consumer-mutants-') as tmp:
            for label,old,new,method,needle in variants:
                assert code.count(old)==1,old
                p=Path(tmp)/(label+'.js');p.write_text(code.replace(old,new))
                run(label,[sys.executable,'-B','-m','unittest','test_snapshot_consumer.BrowserTests.'+method,'-v'],overrides={'S01_CONSUMER_SOURCE':str(p)},expected='test_failure',failure_contains=needle)
        with tempfile.TemporaryDirectory(prefix='s01-consumer-tamper-') as tmp:
            d=Path(tmp)/'package';shutil.copytree(ROOT,d)
            target=d/'proposals/snapshot-consumer-guard/app.js';data=target.read_bytes()
            target.write_bytes(data+b'\n// intentional test-only mutation\n')
            text=run('12_tamper_bytes',[sys.executable,'-B',str(d/'verify_package.py')],cwd=d,expected=2)
            assert 'HASH_MISMATCH' in text;target.write_bytes(data)
            extra=d/'unexpected.txt';extra.write_text('test-only')
            text=run('13_tamper_extra',[sys.executable,'-B',str(d/'verify_package.py')],cwd=d,expected=2)
            assert 'SOURCE_FILE_SET_MISMATCH' in text;extra.unlink()
            extra.symlink_to(target)
            text=run('14_tamper_symlink',[sys.executable,'-B',str(d/'verify_package.py')],cwd=d,expected=2)
            assert 'SYMLINK_NOT_ALLOWED' in text
        run('15_package_after',[sys.executable,'-B',str(ROOT/'verify_package.py')])
        result.update(status='passed',successful_distinct_test_methods=36,original_counterexamples=2,
            behavior_mutations_detected=3,package_tamper_rejections=3,native_patch_roundtrip='byte_exact',
            prior_relay_suite_rerun=False,prior_encoding_suite_rerun=False,
            final_website_integration=False,formal_status_changed=False)
    except BaseException as exc:
        result.update(status='failed',error=type(exc).__name__+': '+str(exc))
        raise
    finally:
        result['finished_utc']=datetime.now(timezone.utc).isoformat()
        (report/'execution.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k!='executions'},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
