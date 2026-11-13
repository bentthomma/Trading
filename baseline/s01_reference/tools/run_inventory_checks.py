#!/usr/bin/env python3
"""Run source-inventory tests and the original bounded first build stage offline.

Reports must be external. Requires Linux/libseccomp, Python+Brotli and Node.
No package installation, external network, user data, broker or bot startup.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from no_connect import install

ROOT=Path(__file__).resolve().parents[1]


def main() -> int:
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--reports-dir',type=Path,required=True);args=ap.parse_args()
    report=args.reports_dir.resolve()
    if report==ROOT or ROOT in report.parents:raise ValueError('REPORTS_MUST_BE_EXTERNAL')
    if os.geteuid()==0:raise RuntimeError('RUN_AS_UNPRIVILEGED_USER')
    report.mkdir(parents=True,exist_ok=False)
    install()
    with socket.socket() as s:
        try:s.connect(('127.0.0.1',9));raise RuntimeError('NETWORK_NOT_BLOCKED')
        except PermissionError:pass
    result={'schema':'extremelab-inventory-execution/v1','work_id':'S01-INVENTORY-CONSOLIDATION','started_utc':datetime.now(timezone.utc).isoformat(),'uid':os.geteuid(),'python':sys.version,'network':'Inherited Linux seccomp denies connect/sendto/sendmsg/sendmmsg; not a general sandbox. Real connect probe denied.','executions':[],'status':'running','new_product_tests':0,'new_product_source_files':0,'github_writes':False,'deployments':False,'broker_or_account_actions':False}
    env={'PATH':os.environ.get('PATH',''),'HOME':os.environ.get('HOME','/tmp'),'LANG':'C.UTF-8','PYTHONDONTWRITEBYTECODE':'1','PYTHONPATH':str(ROOT/'tests')+os.pathsep+str(ROOT/'tools')}
    def run(label,cmd,*,cwd=ROOT,expected=0,methods=None,contains=None):
        start=time.monotonic();cp=subprocess.run(cmd,cwd=cwd,env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=90)
        log=report/(label+'.log');log.write_text(cp.stdout)
        row={'label':label,'command':[str(x) for x in cmd],'returncode':cp.returncode,'elapsed_seconds':round(time.monotonic()-start,3),'log':log.name,'log_sha256':hashlib.sha256(log.read_bytes()).hexdigest()};result['executions'].append(row)
        if cp.returncode!=expected:raise RuntimeError(f'{label}: unexpected exit {cp.returncode}: {cp.stdout[-3000:]}')
        if methods is not None:
            if not re.search(r'Ran '+str(methods)+r' tests? in ',cp.stdout) or '\nOK\n' not in cp.stdout or 'skipped=' in cp.stdout:raise RuntimeError('TEST_COUNT_OR_RESULT_MISMATCH: '+label)
            row['test_methods']=methods
        if contains and contains not in cp.stdout:raise RuntimeError('MISSING_EXPECTED_DIAGNOSTIC: '+label)
        return cp.stdout
    try:
        result['node']=run('00_node',['node','--version']).strip()
        run('01_package_before',[sys.executable,'-B','verify_package.py'])
        before=run('02_original_stale_inventory',[sys.executable,'-B','tools/check_inventory_consistency.py','--legacy','--root',str(ROOT/'baseline/inventory_checkpoint')],expected=2)
        assert len(json.loads(before)['errors'])==8
        text=run('03_current_inventory',[sys.executable,'-B','tools/check_inventory_consistency.py']);result['inventory']=json.loads(text)
        run('04_new_consistency_tests',[sys.executable,'-B','-m','unittest','discover','-s','tests','-p','test_inventory_consistency.py','-v'],methods=20)
        run('05_original_policy_regressions',[sys.executable,'-B','-m','unittest','discover','-s','tests','-p','test_s01_candidate.py','-v'],methods=12)
        run('06_original_source_regressions',[sys.executable,'-B','-m','unittest','discover','-s','tests','-p','test_s01_recovery.py','-v'],methods=8)
        text=run('07_real_original_first_build_stage',[sys.executable,'-B','tools/check_build_boundary.py']);build=json.loads(text)
        assert build['full_pipeline_successful'] is False and build['first_stage_attempt']['original_asset_outputs_verified']==5
        result['original_first_stage']=build
        mutations=[
            ('08_mutation_stale_current', 'errors.extend(legacy_disagreements(root))','pass  # intentional mutation', 'test_stale_reproduction_counts_are_rejected'),
            ('09_mutation_provider_uid', "require(hashlib.sha1(raw).hexdigest()==ids[p],'SOURCE_UID_MISMATCH',p)","require(True,'SOURCE_UID_MISMATCH',p)",'test_private_proposal_cannot_replace_original_with_rebound_local_hash'),
            ('10_mutation_intermediate_boundary',"require(x['final_deployment_identity_verified'] is False,'INTERMEDIATE_AS_FINAL',x['path'])","require(True,'INTERMEDIATE_AS_FINAL',x['path'])",'test_intermediate_reader_cannot_be_promoted')]
        for label,old,new,method in mutations:
            with tempfile.TemporaryDirectory(prefix='s01-inventory-mutant-') as td:
                p=Path(td)/'pkg';shutil.copytree(ROOT,p);f=p/'tools/check_inventory_consistency.py';code=f.read_text();assert code.count(old)==1;f.write_text(code.replace(old,new))
                # This subprocess must import the mutated checker, not the real one.
                script="import sys,unittest;sys.path.insert(0,'tests');import test_inventory_consistency as t;s=unittest.TestSuite([t.InventoryConsistency(%r)]);r=unittest.TextTestRunner(verbosity=2).run(s);raise SystemExit(not r.wasSuccessful())"%method
                run(label,[sys.executable,'-B','-c',script],cwd=p,expected=1,contains='FAIL:')
        with tempfile.TemporaryDirectory(prefix='s01-inventory-tamper-') as td:
            p=Path(td)/'pkg';shutil.copytree(ROOT,p)
            f=p/'evidence/S01/S01_CURRENT_INVENTORY.json';original=f.read_bytes();f.write_bytes(original+b'\n')
            run('11_tamper_bytes',[sys.executable,'-B','verify_package.py'],cwd=p,expected=2,contains='HASH_MISMATCH');f.write_bytes(original)
            extra=p/'unexpected.txt';extra.write_text('test-only')
            run('12_tamper_extra',[sys.executable,'-B','verify_package.py'],cwd=p,expected=2,contains='SOURCE_FILE_SET_MISMATCH');extra.unlink()
            extra.symlink_to(f)
            run('13_tamper_symlink',[sys.executable,'-B','verify_package.py'],cwd=p,expected=2,contains='SYMLINK_NOT_ALLOWED')
        run('14_package_after',[sys.executable,'-B','verify_package.py'])
        result.update(status='passed',successful_distinct_test_methods=40,new_inventory_methods=20,existing_inventory_regression_methods=20,legacy_disagreements_reproduced=8,checker_mutations_detected=3,package_tamper_rejections=3,original_first_stage_full_build_passed=False,complete_website_build=False,native_build=False,formal_acceptance=False)
        rc=0
    except Exception as exc:
        result.update(status='failed',error=repr(exc));rc=1
    finally:
        result['finished_utc']=datetime.now(timezone.utc).isoformat();(report/'execution.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps({'status':result['status'],'report':str(report/'execution.json'),'test_methods':result.get('successful_distinct_test_methods'),'formal_acceptance':False}))
    return rc

if __name__=='__main__':raise SystemExit(main())
