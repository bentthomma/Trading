#!/usr/bin/env python3
"""S06: exact original backup/restore paths plus one private target-binding patch.
No server, provider, native bot, broker or network destination is started.
"""
from __future__ import annotations
import argparse, datetime, hashlib, importlib.util, json, os, re, shutil, subprocess, sys, tempfile, signal
from pathlib import Path
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
sys.path.insert(0,str(ROOT/'evidence/S05'))
from check_sources import check, extract, sha

def snapshot(root):
    return {p.relative_to(root).as_posix():sha(p) for p in root.rglob('*') if p.is_file() and '.git' not in p.relative_to(root).parts}

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--sources',type=Path,required=True);ap.add_argument('--workbook',type=Path,required=True)
    ap.add_argument('--output',type=Path,required=True);ap.add_argument('--node',default=shutil.which('node'));a=ap.parse_args()
    out=a.output.resolve()
    if out==ROOT or ROOT in out.parents:raise SystemExit('EXTERNAL_OUTPUT_REQUIRED')
    out.mkdir(parents=True,exist_ok=False)
    report={'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'uid':os.getuid(),'commands':[],
            'scope':'private_S06_original_restore_paths_and_target_KV_binding','broker_actions':False,
            'product_installed':False,'formal_gate_changed':False,'CSharp_executed':False,
            'server_started':False,'power_loss_test':False,'broker_reconciliation_executed':False}
    env={k:v for k,v in os.environ.items() if not k.startswith('GIT_')}
    env.update(PYTHONDONTWRITEBYTECODE='1',GIT_CONFIG_NOSYSTEM='1',GIT_CONFIG_GLOBAL=os.devnull,GIT_ALLOW_PROTOCOL='file',GIT_TERMINAL_PROMPT='0')
    def call(name,cmd,cwd=ROOT,extra=None,expected=0):
        cmd=list(map(str,cmd));timed_out=False
        with (out/(name+'.stdout')).open('w') as stdout, (out/(name+'.stderr')).open('w') as stderr:
            child=subprocess.Popen(cmd,cwd=cwd,env={**env,**(extra or {})},stdout=stdout,stderr=stderr,start_new_session=True)
            try: child.wait(timeout=45)
            except subprocess.TimeoutExpired:
                timed_out=True;os.killpg(child.pid,signal.SIGKILL);child.wait()
        p=subprocess.CompletedProcess(cmd,child.returncode,(out/(name+'.stdout')).read_text(),(out/(name+'.stderr')).read_text())
        report['commands'].append({'name':name,'argv':cmd,'exit_code':p.returncode,'stdout_sha256':hashlib.sha256(p.stdout.encode()).hexdigest(),'stderr_sha256':hashlib.sha256(p.stderr.encode()).hexdigest()})
        if timed_out:raise RuntimeError('COMMAND_TIMEOUT:'+name)
        if p.returncode!=expected:raise RuntimeError('UNEXPECTED_EXIT:'+name+':'+str(p.returncode))
        return p
    def count(p,wanted):
        values={k:int(v) for k,v in re.findall(r'^# (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$',p.stdout,re.M)}
        if values.get('pass')!=wanted or values.get('tests')!=wanted or any(values.get(k)!=0 for k in ['fail','cancelled','skipped','todo']):raise ValueError('INCOMPLETE_NODE_SUITE:'+str(values))
        return wanted
    try:
        baseline=snapshot(ROOT);binding=json.loads((HERE/'source-bindings.json').read_text())
        report['base_source_check']=check(a.sources.absolute(),a.workbook.absolute())
        for row in binding['bound_repo_files']:
            p=ROOT/row['path']
            if p.is_symlink() or not p.is_file() or sha(p)!=row['sha256'] or p.stat().st_size!=row['bytes']:raise ValueError('BOUND_REPO_FILE_CHANGED:'+row['path'])
        guard=ROOT/'baseline/s01_reference/tools/no_connect.py'
        if sha(guard)!='c325318380f4ab85900fc1535b9790abfb84389f60393924e1fdf416c218ea10':raise ValueError('GUARD_CHANGED')
        spec=importlib.util.spec_from_file_location('s06_network_guard',guard);g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g);g.install()
        call('network_probe',[sys.executable,'-B','-c',"import socket,errno;s=socket.socket();\ntry:s.connect(('127.0.0.1',9))\nexcept OSError as e:assert e.errno==errno.EPERM;print('CONNECT_DENIED_EPERM')\nelse:raise AssertionError('NETWORK_NOT_BLOCKED')"])
        report['network_connections_denied']=True
        report['node']=call('node_version',[a.node,'--version']).stdout.strip();report['python']=sys.version
        with tempfile.TemporaryDirectory(prefix='s06-original-restore-') as tmp:
            temp=Path(tmp);original,_=extract(a.sources.absolute(),a.workbook.absolute(),temp/'original',ROOT);original_before=snapshot(temp/'original')
            for row in binding['original_modules']:
                p=original/row['path']
                if p.is_symlink() or sha(p)!=row['sha256'] or p.stat().st_size!=row['bytes']:raise ValueError('ORIGINAL_MODULE_CHANGED:'+row['path'])
            prior=temp/'prior';shutil.copytree(original,prior)
            fee_patch=ROOT/'evidence/S05/fee-reconciliation/order-lifecycle.patch'
            call('existing_fee_patch',['git','apply',fee_patch],cwd=prior)
            fee_rel='core/planning/order-lifecycle.mjs'
            if sha(prior/fee_rel)!=binding['fee_candidate_sha256']:raise ValueError('FEE_CANDIDATE_CHANGED')
            prior_before=snapshot(prior);candidate=temp/'candidate';shutil.copytree(prior,candidate)
            patch=HERE/'maintenance-target-kv.patch';rel='core/maintenance.mjs'
            call('restore_patch_check',['git','apply','--check',patch],cwd=candidate);call('restore_patch_apply',['git','apply',patch],cwd=candidate)
            if sha(candidate/rel)!=binding['restore_candidate_sha256']:raise ValueError('RESTORE_CANDIDATE_CHANGED')
            candidate_before=snapshot(candidate)
            if [p for p,h in prior_before.items() if candidate_before.get(p)!=h]!=[rel]:raise ValueError('UNEXPECTED_PRODUCT_CHANGE')
            env.update(S06_PLATFORM=str(candidate),S06_ORIGINAL_PLATFORM=str(original),S06_PRIOR_PLATFORM=str(prior),S05_PLATFORM=str(candidate),S05_ORIGINAL_PLATFORM=str(original))
            report['new_restore_test_methods']=count(call('restore_integrity_tests',[a.node,'--test',HERE/'test_restore_integrity.mjs']),22)
            report['original_restore_journal_methods']=count(call('original_restore_and_archive_regressions',[a.node,'--test','tests/maintenance-worker.mjs','tests/journal-archives.mjs'],cwd=candidate),43)
            report['original_restore_journal_methods']+=count(call('original_profile_import_regressions',[a.node,'--test','--test-name-pattern=^(Preview and export |Reviews stay valid |A real SQLite failure |The persistent receipt ring )','tests/restore-review.mjs'],cwd=candidate),4)
            report['original_HTTP_tests_not_part_of_offline_run']=8
            report['existing_fee_regression_methods']=count(call('existing_fee_regressions',[a.node,'--test',ROOT/'evidence/S05/fee-reconciliation/test_deferred_costs.mjs']),38)
            # Same correctness assertions fail on the exact pre-S06 maintenance source.
            p=call('prior_restore_defects',[a.node,'--test','--test-name-pattern=^R(01|02|21) ',HERE/'test_restore_integrity.mjs'],extra={'S06_PLATFORM':str(prior)},expected=1)
            if '# fail 3\n' not in p.stdout or p.stdout.count('ERR_ASSERTION')!=3:raise ValueError('PRIOR_DEFECT_NOT_REPRODUCED')
            report['prior_defect_counterexamples']=3
            text=(candidate/rel).read_text()
            mutants=[('omit_target_binding','kvSha256:targetKvDigest(store.db),','','^R01 '),
                     ('ignore_values','JSON.stringify([row.key,row.value])','JSON.stringify([row.key])','^R01 '),
                     ('skip_worker_comparison','if(digest(target)!==job.targetDigest)','if(false)','^R02 ')]
            report['mutations_detected']=[]
            for name,old,new,pattern in mutants:
                if text.count(old)!=1:raise ValueError('MUTATION_ANCHOR:'+name)
                (candidate/rel).write_text(text.replace(old,new))
                try:
                    p=call('mutation_'+name,[a.node,'--test','--test-name-pattern='+pattern,HERE/'test_restore_integrity.mjs'],expected=1)
                    if '# fail 1\n' not in p.stdout or 'ERR_ASSERTION' not in p.stdout:raise ValueError('MUTATION_NOT_DETECTED:'+name)
                    report['mutations_detected'].append(name)
                finally:(candidate/rel).write_text(text)
            if snapshot(candidate)!=candidate_before or snapshot(prior)!=prior_before:raise ValueError('TEST_SOURCES_CHANGED')
            call('source_patch_reverse',['git','apply','-R',patch],cwd=candidate)
            if snapshot(candidate)!=prior_before:raise ValueError('SOURCE_PATCH_REVERSE_MISMATCH')
            call('source_patch_forward',['git','apply',patch],cwd=candidate)
            if snapshot(candidate)!=candidate_before:raise ValueError('SOURCE_PATCH_FORWARD_MISMATCH')
            if snapshot(temp/'original')!=original_before:raise ValueError('ORIGINALS_CHANGED')
            report['source_patch_roundtrip']=True;report['original_extracted_files_unchanged']=len(original_before)
            report['source_binding']=binding
        if snapshot(ROOT)!=baseline:raise ValueError('CHECKOUT_CHANGED')
        report['checkout_files_unchanged']=len(baseline)
        report['unique_test_methods']=sum(report[k] for k in ['new_restore_test_methods','original_restore_journal_methods','existing_fee_regression_methods'])
        report['test_limitations']=['R15 characterizes missing semantic validation in generic restore, not a fix.',
          'Synthetic order KV key is an explicit test composition, not an installed product namespace.',
          'SQLite state readability is not native/broker reconciliation.',
          'Kill tests cover process interruption, not power failure or target-host durability.',
          'Whole-KV hashing adds linear work and conservatively invalidates any changed KV value; no production-load measurement.']
        report.update(status='passed_private_S06_restore_candidate',exit_code=0)
    except Exception as exc:
        report.update(status='failed',error=repr(exc),exit_code=1)
    report['finished_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    (out/'execution.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False,indent=2));return report['exit_code']
if __name__=='__main__':raise SystemExit(main())
