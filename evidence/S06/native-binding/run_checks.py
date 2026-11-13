#!/usr/bin/env python3
"""Source/contract + actual original JS/SQLite boundary checks; no native or broker execution."""
from __future__ import annotations
import argparse, datetime, hashlib, importlib.util, json, os, re, shutil, signal, subprocess, sys, tempfile
from pathlib import Path
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT/'evidence/S05'))
from check_sources import check,extract,sha
def snap(root):
    return {p.relative_to(root).as_posix():sha(p)for p in root.rglob('*') if p.is_file() and '.git' not in p.relative_to(root).parts}
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--sources',required=True,type=Path);ap.add_argument('--workbook',required=True,type=Path)
    ap.add_argument('--output',required=True,type=Path);ap.add_argument('--node',default=shutil.which('node'))
    a=ap.parse_args();out=a.output.absolute()
    if out.is_symlink() or out.exists():raise SystemExit('NEW_OUTPUT_REQUIRED')
    if ROOT==out.resolve() or ROOT in out.resolve().parents:raise SystemExit('EXTERNAL_OUTPUT_REQUIRED')
    out.mkdir(parents=True,exist_ok=False)
    r={'started_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'uid':os.getuid(),'commands':[],
       'CSharp_executed':False,'broker_actions':False,'server_started':False,'product_installed':False,
       'formal_gate_changed':False,'new_product_patch':False,'scope':'private source-bound integration analysis'}
    env={k:v for k,v in os.environ.items()if not k.startswith('GIT_')}
    env.update(PYTHONDONTWRITEBYTECODE='1',GIT_CONFIG_NOSYSTEM='1',GIT_CONFIG_GLOBAL=os.devnull,GIT_ALLOW_PROTOCOL='file',GIT_TERMINAL_PROMPT='0')
    def call(name,cmd,cwd=ROOT,expected=0,extra=None):
        cmd=list(map(str,cmd));timed=False
        with (out/(name+'.stdout')).open('w')as fo,(out/(name+'.stderr')).open('w')as fe:
            child=subprocess.Popen(cmd,cwd=cwd,env={**env,**(extra or {})},stdout=fo,stderr=fe,start_new_session=True)
            try:child.wait(timeout=45)
            except subprocess.TimeoutExpired:
                timed=True;os.killpg(child.pid,signal.SIGKILL);child.wait()
        p=subprocess.CompletedProcess(cmd,child.returncode,(out/(name+'.stdout')).read_text(),(out/(name+'.stderr')).read_text())
        r['commands'].append({'name':name,'argv':cmd,'exit_code':p.returncode,'stdout_sha256':hashlib.sha256(p.stdout.encode()).hexdigest(),'stderr_sha256':hashlib.sha256(p.stderr.encode()).hexdigest()})
        if timed or p.returncode!=expected:raise RuntimeError('COMMAND_FAILED:'+name+':'+str(p.returncode))
        return p
    def count(p,n):
        counts={k:int(v)for k,v in re.findall(r'^# (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$',p.stdout,re.M)}
        if counts.get('tests')!=n or counts.get('pass')!=n or any(counts.get(k)!=0 for k in ['fail','cancelled','skipped','todo']):raise ValueError('INCOMPLETE_SUITE:'+str(counts))
        return n
    try:
        before=snap(ROOT);r['existing_source_check']=check(a.sources.absolute(),a.workbook.absolute(),ROOT)
        gpath=ROOT/'baseline/s01_reference/tools/no_connect.py'
        if sha(gpath)!='c325318380f4ab85900fc1535b9790abfb84389f60393924e1fdf416c218ea10':raise ValueError('GUARD_CHANGED')
        spec=importlib.util.spec_from_file_location('network_guard',gpath);guard=importlib.util.module_from_spec(spec);spec.loader.exec_module(guard);guard.install()
        call('network_probe',[sys.executable,'-B','-c',"import socket,errno;s=socket.socket();\ntry:s.connect(('127.0.0.1',9))\nexcept OSError as e:assert e.errno==errno.EPERM;print('CONNECT_DENIED_EPERM')\nelse:raise AssertionError('CONNECT_ALLOWED')"])
        r['network_connections_denied']=True;r['node']=call('node_version',[a.node,'--version']).stdout.strip();r['python']=sys.version
        with tempfile.TemporaryDirectory(prefix='s06-native-bindings-') as td:
            temp=Path(td);original,_=extract(a.sources.absolute(),a.workbook.absolute(),temp/'original',ROOT);orig_before=snap(temp/'original')
            p=call('source_audit',[sys.executable,'-B',HERE/'audit_sources.py','--original',original,'--output',out/'source-audit.json'])
            r['source_audit_file']='source-audit.json'
            if (out/'source-audit.json').read_bytes()!=(HERE/'source-audit.json').read_bytes():raise ValueError('SOURCE_AUDIT_NOT_REPRODUCED')
            candidate=temp/'candidate';shutil.copytree(original,candidate)
            patch=ROOT/'evidence/S05/fee-reconciliation/order-lifecycle.patch'
            call('existing_fee_patch',['git','apply','--check',patch],cwd=candidate);call('apply_existing_fee_patch',['git','apply',patch],cwd=candidate)
            b=json.loads((HERE/'source-bindings.json').read_text())
            if sha(candidate/'core/planning/order-lifecycle.mjs')!=b['fee_candidate_sha256']:raise ValueError('WRONG_CANDIDATE')
            candidate_before=snap(candidate)
            env.update(S06_PLATFORM=str(candidate),S06_ORIGINAL_PLATFORM=str(original),S06_BINDING_EVIDENCE=str(out/'boundary-results.ndjson'))
            r['new_runtime_methods']=count(call('native_boundary_tests',[a.node,'--test',HERE/'test_native_boundary.mjs']),16)
            p=call('source_schema_tests',[sys.executable,'-B','-m','unittest','discover','-s',HERE,'-p','test_source_binding.py','-v'])
            if not re.search(r'\bRan 5 tests\b',p.stderr) or not p.stderr.rstrip().endswith('OK'):raise ValueError('INCOMPLETE_STATIC_SUITE')
            r['source_schema_methods']=5
            r['original_journal_methods']=count(call('original_engine_journal',[a.node,'--test','tests/engine-journal.mjs'],cwd=candidate),29)
            r['original_observer_methods']=count(call('original_observation',[a.node,'--test','tests/observation.mjs'],cwd=candidate),28)
            r['original_reconciliation_methods']=count(call('original_reconciliation',[a.node,'--test','tests/reconciliation20.mjs'],cwd=candidate),31)
            # Mutate only disposable original JS protection rules; no mutation is a shipped patch.
            rel='core/engine-journal.mjs';text=(candidate/rel).read_text()
            cases=[
              ('extra_fields_accepted','Object.keys(v).length!==keys.length||','','^J04 '),
              ('receipt_claims_trading','return {accepted:true,stored:added,duplicates,contiguousSequence:stream.cursor,highWaterSequence:stream.highWater,gap:stream.cursor!==stream.highWater,grantsTrading:false}','return {accepted:true,stored:added,duplicates,contiguousSequence:stream.cursor,highWaterSequence:stream.highWater,gap:stream.cursor!==stream.highWater,grantsTrading:true}','^J01 '),
              ('noncontiguous_receipt','return {accepted:true,stored:added,duplicates,contiguousSequence:stream.cursor,highWaterSequence:stream.highWater','return {accepted:true,stored:added,duplicates,contiguousSequence:stream.highWater,highWaterSequence:stream.highWater','^J08 ')]
            r['mutations_detected']=[]
            for name,old,new,pattern in cases:
                if text.count(old)!=1:raise ValueError('MUTATION_ANCHOR:'+name)
                (candidate/rel).write_text(text.replace(old,new))
                try:
                    p=call('mutation_'+name,[a.node,'--test','--test-name-pattern='+pattern,HERE/'test_native_boundary.mjs'],
                           expected=1,extra={'S06_BINDING_EVIDENCE':''})
                    if '# fail 1\n'not in p.stdout or 'ERR_ASSERTION'not in p.stdout:raise ValueError('MUTATION_NOT_DETECTED:'+name)
                    r['mutations_detected'].append(name)
                finally:(candidate/rel).write_text(text)
            if snap(candidate)!=candidate_before or snap(temp/'original')!=orig_before:raise ValueError('SOURCE_TREE_CHANGED')
            call('reverse_existing_fee_patch',['git','apply','-R',patch],cwd=candidate)
            if snap(candidate)!=snap(original):raise ValueError('PRIOR_PATCH_REVERSE_FAILED')
            r['original_extracted_files_unchanged']=len(orig_before);r['prior_patch_roundtrip']=True
        if snap(ROOT)!=before:raise ValueError('REPO_CHANGED')
        r['checkout_files_unchanged']=len(before)
        r['unique_test_methods']=sum(r[k]for k in ['new_runtime_methods','source_schema_methods','original_journal_methods','original_observer_methods','original_reconciliation_methods'])
        r['known_open_gap_methods']=['J13 projection payload can differ from intact raw receipt','J14 valid merge cannot be repaired by naive equality']
        r['native_methods_executed']=0
        r.update(status='passed_private_integration_gap_analysis',exit_code=0)
    except Exception as e:r.update(status='failed',error=repr(e),exit_code=1)
    r['finished_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    (out/'execution.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(r,ensure_ascii=False,indent=2));return r['exit_code']
if __name__=='__main__':raise SystemExit(main())
