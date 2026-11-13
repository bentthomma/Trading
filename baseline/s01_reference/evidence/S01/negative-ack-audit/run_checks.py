#!/usr/bin/env python3
"""Private ACK-receipt candidate: original Hub/HTTP/SQLite, synthetic inputs.
Requires Linux/libseccomp, unprivileged UID, Python, GNU patch, Node >=24.10.
No IP sockets, SDK build, broker, live/demo bot, cloud or installed data access.
"""
from pathlib import Path
import argparse,hashlib,json,os,re,shutil,socket,subprocess,sys,tempfile,time
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[3];A=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'tools'))
from unix_http_offline import install
from run_interface_checks import stage
H=lambda b:hashlib.sha256(b).hexdigest()
def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--node',required=True,type=Path);ap.add_argument('--reports-dir',required=True,type=Path);args=ap.parse_args()
 assert os.geteuid()!=0,'RUN_UNPRIVILEGED';node=args.node.resolve();logs=args.reports_dir.resolve();assert node.is_file();assert ROOT!=logs and ROOT not in logs.parents
 logs.mkdir(parents=True,exist_ok=False);install()
 for family in [socket.AF_INET,socket.AF_INET6]:
  try:s=socket.socket(family,socket.SOCK_STREAM)
  except PermissionError:pass
  else:s.close();raise AssertionError('NETWORK_NOT_BLOCKED')
 r={'work_id':'S01-NEGATIVE-ACK-RECEIPT','status':'running','started_utc':datetime.now(timezone.utc).isoformat(),'uid':os.geteuid(),'python':sys.version,'node_sha256':H(node.read_bytes()),'formal_acceptance':False,'sdk_executed':False,'network_guard':'Inherited seccomp: only AF_UNIX socket/socketpair; IPv4/IPv6 denial verified. Not a general-purpose sandbox.','executions':[],'unique_success_names':[]}
 env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1','NODE_DISABLE_COLORS':'1'}
 def run(label,cmd,*,cwd=ROOT,extra=None,count=None,mode='ok',markers=()):
  start=time.monotonic();p=subprocess.run(list(map(str,cmd)),cwd=cwd,env={**env,**(extra or {})},stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=120)
  log=logs/(label+'.log');log.write_text(p.stdout);row={'label':label,'command':list(map(str,cmd)),'cwd':str(cwd),'exitcode':p.returncode,'seconds':round(time.monotonic()-start,3),'log':log.name,'sha256':H(log.read_bytes())};r['executions'].append(row)
  if mode=='fail':
   assert p.returncode!=0 and 'ERR_ASSERTION' in p.stdout and 'ERR_MODULE_NOT_FOUND' not in p.stdout and 'ENOENT' not in p.stdout,p.stdout
   assert int(re.search(r'^# tests (\d+)$',p.stdout,re.M)[1])==count and int(re.search(r'^# fail (\d+)$',p.stdout,re.M)[1])==count,p.stdout
   assert all(x in p.stdout for x in markers),p.stdout;row['expected_assertion_failures']=count
  elif mode=='integrity':assert p.returncode==2 and 'REJECTED' in p.stdout,p.stdout
  else:
   assert p.returncode==0,p.stdout
   if '--test' in list(map(str,cmd)):
    n=int(re.search(r'^# tests (\d+)$',p.stdout,re.M)[1]);passed=int(re.search(r'^# pass (\d+)$',p.stdout,re.M)[1]);assert n==passed and '# fail 0' in p.stdout and '# skipped 0' in p.stdout and '# cancelled 0' in p.stdout,p.stdout
    if count is not None:assert n==count,p.stdout
    names=re.findall(r'^ok \d+ - (.+)$',p.stdout,re.M);assert len(names)==n and not set(names)&set(r['unique_success_names']),'DUPLICATE_TEST_COUNT'
    r['unique_success_names']+=names;row['successful_unique_methods']=n
  return p.stdout
 def tests(*files,pattern=None):return [node,'--test','--test-reporter=tap','--test-concurrency=1',*(['--test-name-pattern='+pattern] if pattern else []),*files]
 try:
  run('01_manifest_before',[sys.executable,'-B',ROOT/'verify_package.py'])
  version=run('02_node',[node,'--version']).strip();r['node_version']=version;major,minor,*_=map(int,version.lstrip('v').split('.'));assert major>24 or major==24 and minor>=10
  run('03_bindings',[sys.executable,'-B',A/'check_sources.py']);run('04_inventory',[sys.executable,'-B',ROOT/'tools/check_inventory_consistency.py'])
  with tempfile.TemporaryDirectory(prefix='s01-ack-receipt-') as tmp:
   platform=Path(tmp)/'Trading_Local';platform.mkdir();r['staged_original_files']=stage(platform)
   originals=Path(tmp)/'original';shutil.copytree(platform,originals)
   original_hashes={p.relative_to(platform).as_posix():H(p.read_bytes()) for p in platform.rglob('*') if p.is_file()}
   source=platform/'core/control.mjs';original=source.read_bytes();baseline=(ROOT/'evidence/S01/control-ack-audit/candidate/core/control.mjs').read_bytes();candidate=(A/'candidate/core/control.mjs').read_bytes();source.write_bytes(baseline)
   extra={'S01_INTERFACE_PLATFORM':str(platform),'S01_ACK_ORIGINAL_PLATFORM':str(originals)};test=A/'receipt.test.mjs'
   run('05_predecessor_counterexamples',tests(test,pattern='^R0[123] '),extra=extra,mode='fail',count=3,markers=['EXACT_NEGATIVE_RETRY_MUST_SUCCEED','ALTERED_NEGATIVE_RETRY_MUST_FAIL','DURABLE_RECEIPT_REQUIRED'])
   patch=shutil.which('patch');assert patch
   run('06_incremental_patch',[patch,'--batch','--forward','-p1','-i',A/'negative-ack-receipt.patch'],cwd=platform);assert source.read_bytes()==candidate
   run('07_receipt_tests',tests(test),extra=extra,count=21)
   run('08_deadline_and_authority_regressions',tests(ROOT/'evidence/S01/control-ack-audit/control_ack.test.mjs',pattern='^C(?:0[1-9]|1[0-57]) '),extra=extra,count=16)
   run('09_original_core_regressions',tests('tests/core.mjs','tests/profile-ready20.mjs','tests/lifecycle-core.mjs','tests/account-entry-guard.mjs'),cwd=platform,extra=extra)
   run('10_original_fault_regressions',tests('tests/review-core.mjs',pattern='^(runtime fault|bridge token rotation|fault reset|a matching late ACK)'),cwd=platform,extra=extra,count=4)
   run('11_original_full_restore_fence',tests('tests/maintenance-worker.mjs',pattern='^full restore revokes historical authority'),cwd=platform,extra=extra,count=1)
   r['mutations']=[]
   for name,transform,pattern,marker in [
    ('payload_comparison',lambda s:s.replace('if(recorded.fingerprint!==receipt.fingerprint)', 'if(false)'),'^R02 ','ALTERED_NEGATIVE_RETRY_MUST_FAIL'),
    ('old_current_state_check',lambda s:s.replace("      if(p.status==='applied'||p.status==='rejected'){", "      if(!input.accepted&&canonical(values)!==canonical(JSON.parse(b.actual)))fail('REJECTION_STATE_UNCERTAIN','synthetic regression',409);\n      if(p.status==='applied'||p.status==='rejected'){"),'^R01 ','EXACT_NEGATIVE_RETRY_MUST_SUCCEED'),
    ('transaction_removed',lambda s:s.replace('return this.store.transaction(()=>{','return (()=>{').replace('    });\n  }','    })();\n  }'),'^R06 ','ACK_EVENT_FAILURE_MUST_ROLL_BACK')]:
    text=candidate.decode();start=text.index('  ack(input,actor){');end=text.index('  export(',start);old=text[start:end];new=transform(old);assert old!=new
    source.write_text(text[:start]+new+text[end:])
    try:run('12_mutation_'+name,tests(test,pattern=pattern),extra=extra,mode='fail',count=1,markers=[marker]);r['mutations'].append({'name':name,'detected':True})
    finally:source.write_bytes(candidate)
   run('13_incremental_patch_reverse',[patch,'--batch','-R','-p1','-i',A/'negative-ack-receipt.patch'],cwd=platform);assert source.read_bytes()==baseline
   run('14_deadline_patch_reverse',[patch,'--batch','-R','-p1','-i',ROOT/'evidence/S01/control-ack-audit/control-deadline.patch'],cwd=platform);assert source.read_bytes()==original
   assert {p.relative_to(platform).as_posix():H(p.read_bytes()) for p in platform.rglob('*') if p.is_file()}==original_hashes,'ORIGINAL_STAGE_CHANGED'
   r['original_files_restored']=len(original_hashes)
   assert {p.relative_to(originals).as_posix():H(p.read_bytes()) for p in originals.rglob('*') if p.is_file()}==original_hashes,'LEGACY_STAGE_CHANGED'
  r['package_negative_checks']=[]
  with tempfile.TemporaryDirectory(prefix='s01-ack-receipt-tamper-') as tmp:
   cp=Path(tmp)/'pkg';shutil.copytree(ROOT,cp);target=cp/'evidence/S01/negative-ack-audit/candidate/core/control.mjs';orig=target.read_bytes()
   for kind in ['bytes','extra','symlink']:
    if kind=='bytes':target.write_bytes(orig+b'\n// synthetic tamper\n')
    elif kind=='extra':(cp/'UNEXPECTED.txt').write_text('synthetic')
    else:target.unlink();target.symlink_to(A/'candidate/core/control.mjs')
    try:run('15_tamper_'+kind,[sys.executable,'-B',cp/'verify_package.py'],cwd=cp,mode='integrity');r['package_negative_checks'].append({'case':kind,'detected':True})
    finally:
     if kind=='extra':(cp/'UNEXPECTED.txt').unlink()
     else:
      if target.is_symlink():target.unlink()
      target.write_bytes(orig)
  run('16_manifest_after',[sys.executable,'-B',ROOT/'verify_package.py'])
  r.update(status='passed',successful_unique_methods=len(r['unique_success_names']),counterexamples_separate=3,mutation_tests_separate=3,integrity_negatives_separate=3,static_source_only_tests=['R20','C15'],process_kill_cases=['R19-before','R19-after'],superseded_characterization_not_rerun='C16 describes the old defect; R01/R02 assert its correction, so C16 is not counted as a passing regression.')
 except Exception as e:r.update(status='failed',error=type(e).__name__+': '+str(e));print(str(e),file=sys.stderr)
 finally:
  r['finished_utc']=datetime.now(timezone.utc).isoformat();(logs/'execution.json').write_text(json.dumps(r,indent=2,ensure_ascii=False)+'\n')
 print(json.dumps({k:v for k,v in r.items() if k not in ['executions','unique_success_names','error']},indent=2,ensure_ascii=False));return 0 if r['status']=='passed' else 2
if __name__=='__main__':raise SystemExit(main())
