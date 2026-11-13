#!/usr/bin/env python3
"""Verify the private Control/ACK candidate against original Hub sources.
Linux, libseccomp, Python 3, GNU patch and Node >=24.10; unprivileged UID.
Only AF_UNIX transport. No native runtime, broker or provider is launched.
"""
from pathlib import Path
import argparse,hashlib,json,os,re,shutil,socket,subprocess,sys,tempfile,time
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[3];AUDIT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'tools'))
from unix_http_offline import install
from run_interface_checks import stage
H=lambda b:hashlib.sha256(b).hexdigest()
def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--node',type=Path,required=True);ap.add_argument('--reports-dir',type=Path,required=True);a=ap.parse_args()
 assert os.geteuid()!=0,'RUN_UNPRIVILEGED'
 node=a.node.resolve();logs=a.reports_dir.resolve();assert node.is_file();assert logs!=ROOT and ROOT not in logs.parents
 logs.mkdir(parents=True,exist_ok=False);install()
 # Confirm the guard is active in the runner; children inherit it.
 denied=[]
 for fam in [socket.AF_INET,socket.AF_INET6]:
  try:s=socket.socket(fam,socket.SOCK_STREAM)
  except PermissionError:denied.append(fam)
  else:s.close();raise AssertionError('IP_SOCKET_NOT_BLOCKED')
 assert len(denied)==2
 r={'work_id':'S01-CONTROL-ACK-BOUNDARY','status':'running','formal_acceptance':False,'started_utc':datetime.now(timezone.utc).isoformat(),'uid':os.geteuid(),'python':sys.version,'node_sha256':H(node.read_bytes()),'network':'Inherited seccomp: only AF_UNIX socket/socketpair; IPv4/IPv6 creation probes denied. Not a general sandbox.','native_sdk_executed':False,'sources':'10 original source files; real Hub HTTP/session/MCP/SQLite; synthetic bridge messages and injectable clock.','executions':[],'unique_success_names':[]}
 env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1','NODE_DISABLE_COLORS':'1'}
 def run(label,cmd,cwd=ROOT,extra=None,mode='ok',expected_count=None,markers=()):
  start=time.monotonic();p=subprocess.run([str(x) for x in cmd],cwd=cwd,env={**env,**(extra or {})},stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=120)
  logfile=logs/(label+'.log');logfile.write_text(p.stdout)
  row={'label':label,'command':[str(x) for x in cmd],'cwd':str(cwd),'exitcode':p.returncode,'seconds':round(time.monotonic()-start,3),'log':logfile.name,'log_sha256':H(logfile.read_bytes())};r['executions'].append(row)
  if mode=='assertion_fail':
   assert p.returncode!=0 and 'ERR_ASSERTION' in p.stdout and 'ERR_MODULE_NOT_FOUND' not in p.stdout,p.stdout
   assert int(re.search(r'^# fail (\d+)$',p.stdout,re.M)[1])==expected_count,p.stdout
   assert int(re.search(r'^# tests (\d+)$',p.stdout,re.M)[1])==expected_count,p.stdout
   assert all(x in p.stdout for x in markers),p.stdout
   row['expected_assertion_failures']=expected_count
  elif mode=='integrity_fail':assert p.returncode==2 and 'REJECTED' in p.stdout,p.stdout
  else:
   assert p.returncode==0,p.stdout
   if '--test' in list(map(str,cmd)):
    n=int(re.search(r'^# tests (\d+)$',p.stdout,re.M)[1]);passed=int(re.search(r'^# pass (\d+)$',p.stdout,re.M)[1]);assert n==passed and '# fail 0' in p.stdout and '# skipped 0' in p.stdout and '# cancelled 0' in p.stdout,p.stdout
    if expected_count is not None:assert n==expected_count,p.stdout
    names=re.findall(r'^ok \d+ - (.+)$',p.stdout,re.M);assert len(names)==n,p.stdout
    assert not set(names)&set(r['unique_success_names']),'DUPLICATE_COUNT'
    r['unique_success_names']+=names;row['successful_unique_methods']=n
  return p.stdout
 test=AUDIT/'control_ack.test.mjs'
 def nodeargs(*files,pattern=None):return [node,'--test','--test-reporter=tap','--test-concurrency=1',*(['--test-name-pattern='+pattern] if pattern else []),*files]
 try:
  run('01_package_before',[sys.executable,'-B',ROOT/'verify_package.py'])
  version=run('02_node',[node,'--version']).strip();r['node_version']=version
  major,minor,*_=map(int,version.lstrip('v').split('.'));assert major>24 or major==24 and minor>=10
  run('03_source_bindings',[sys.executable,'-B',AUDIT/'check_sources.py'])
  run('04_original_interface_bindings',[sys.executable,'-B',ROOT/'tools/check_interface_map.py'])
  run('05_inventory_consistency',[sys.executable,'-B',ROOT/'tools/check_inventory_consistency.py'])
  with tempfile.TemporaryDirectory(prefix='s01-control-ack-') as tmp:
   platform=Path(tmp)/'Trading_Local';platform.mkdir();r['original_files_staged']=stage(platform)
   before={p.relative_to(platform).as_posix():H(p.read_bytes()) for p in platform.rglob('*') if p.is_file()}
   extra={'S01_INTERFACE_PLATFORM':str(platform)};source=platform/'core/control.mjs';original=source.read_bytes()
   run('06_original_counterexamples',nodeargs(test,pattern='^C(?:0[123]|17) '),extra=extra,mode='assertion_fail',expected_count=4,markers=['NO_COMMAND_AT_EXACT_DEADLINE','EXACT_DEADLINE_ACK_IS_LATE','SELECT_MUST_EXCLUDE_EXACT_DEADLINE','COMMAND_MUST_BE_VALID_AT_RESPONSE_DECISION_TIME'])
   patch=shutil.which('patch');assert patch,'GNU_PATCH_REQUIRED'
   run('07_patch_forward',[patch,'--batch','--forward','-p1','-i',AUDIT/'control-deadline.patch'],cwd=platform)
   candidate=(AUDIT/'candidate/core/control.mjs').read_bytes();assert source.read_bytes()==candidate,'PATCH_NOT_EXACT'
   run('08_candidate_routes',nodeargs(test),extra=extra,expected_count=17)
   regression_files=['tests/core.mjs','tests/profile-ready20.mjs','tests/lifecycle-core.mjs','tests/account-entry-guard.mjs']
   run('09_original_control_regressions',nodeargs(*regression_files),cwd=platform,extra=extra)
   run('10_original_fault_regressions',nodeargs('tests/review-core.mjs',pattern='^(runtime fault|bridge token rotation|fault reset|a matching late ACK)'),cwd=platform,extra=extra,expected_count=4)
   mutations=[
    ('inclusive_expiry',"status='pending' AND expires_at<=?","status='pending' AND expires_at<?",'^C02 ','EXACT_DEADLINE_ACK_IS_LATE'),
    ('inclusive_selection',"status='pending' AND expires_at>?","status='pending' AND expires_at>=?",'^C03 ','SELECT_MUST_EXCLUDE_EXACT_DEADLINE'),
    ('unbound_response_clock','serverTime:iso(responseTime)','serverTime:iso(this.now())','^C17 ','COMMAND_MUST_BE_VALID_AT_RESPONSE_DECISION_TIME')]
   r['mutations']=[]
   for name,old,new,pattern,marker in mutations:
    s=candidate.decode();assert s.count(old)==1;source.write_text(s.replace(old,new))
    try:run('11_mutation_'+name,nodeargs(test,pattern=pattern),extra=extra,mode='assertion_fail',expected_count=1,markers=[marker]);r['mutations'].append({'name':name,'detected':True,'source':'temporary copy/core/control.mjs'})
    finally:source.write_bytes(candidate)
   run('12_patch_reverse',[patch,'--batch','-R','-p1','-i',AUDIT/'control-deadline.patch'],cwd=platform)
   assert source.read_bytes()==original,'REVERSE_NOT_EXACT'
   after={p.relative_to(platform).as_posix():H(p.read_bytes()) for p in platform.rglob('*') if p.is_file()}
   assert after==before,'STAGED_ORIGINAL_CHANGED';r['original_files_restored_exactly']=len(before)
  r['package_tampering']=[]
  with tempfile.TemporaryDirectory(prefix='s01-control-integrity-') as tmp:
   cp=Path(tmp)/'package';shutil.copytree(ROOT,cp);target=cp/'evidence/S01/control-ack-audit/candidate/core/control.mjs';original=target.read_bytes()
   for name in ['bytes_changed','unexpected_file','symlink']:
    if name=='bytes_changed':target.write_bytes(original+b'\n// synthetic tamper\n')
    elif name=='unexpected_file':(cp/'UNEXPECTED.txt').write_text('synthetic')
    else:target.unlink();target.symlink_to(AUDIT/'candidate/core/control.mjs')
    try:run('13_package_'+name,[sys.executable,'-B',cp/'verify_package.py'],cwd=cp,mode='integrity_fail');r['package_tampering'].append({'name':name,'detected':True})
    finally:
     if name=='unexpected_file':(cp/'UNEXPECTED.txt').unlink()
     else:
      if target.is_symlink():target.unlink()
      target.write_bytes(original)
  run('14_package_after',[sys.executable,'-B',ROOT/'verify_package.py'])
  r.update(status='passed',successful_unique_methods=len(r['unique_success_names']),known_open_boundary_methods=['C16'],static_native_source_only_methods=['C15'],original_counterexample_methods=4,mutation_counterexamples_separate=3,package_integrity_negatives_separate=3)
 except Exception as e:r.update(status='failed',error=type(e).__name__+': '+str(e));print(str(e),file=sys.stderr)
 finally:
  r['finished_utc']=datetime.now(timezone.utc).isoformat();(logs/'execution.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({k:v for k,v in r.items() if k not in ['executions','unique_success_names','error']},ensure_ascii=False,indent=2));return 0 if r['status']=='passed' else 2
if __name__=='__main__':raise SystemExit(main())
