#!/usr/bin/env python3
"""Reproduce S01 interface mapping against unchanged originals, offline.
Requires Linux/libseccomp, Python 3, Node >=24.10 (node:sqlite), unprivileged UID.
No native/broker/cloud process is run. AF_UNIX is the only permitted socket family.
"""
from __future__ import annotations
import argparse,hashlib,json,os,re,shutil,stat,subprocess,sys,tempfile,time,zipfile
from datetime import datetime,timezone
from pathlib import Path,PurePosixPath
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from unix_http_offline import install
from check_interface_map import ARCHIVE_SHA
PREFIX='Th3R3v0lut10n_Technik_1_0_Arbeitsstand_0_9_7/Trading_Local/'
def h(b):return hashlib.sha256(b).hexdigest()
def stage(destination):
 ar=ROOT/'baseline/original_platform097.zip'
 if h(ar.read_bytes())!=ARCHIVE_SHA:raise ValueError('ORIGINAL_ARCHIVE_CHANGED')
 count=0
 with zipfile.ZipFile(ar) as z:
  seen=set()
  for item in z.infolist():
   if not item.filename.startswith(PREFIX) or item.is_dir():continue
   rel=item.filename[len(PREFIX):];p=PurePosixPath(rel)
   if not rel or p.is_absolute() or '..' in p.parts or '\\' in rel or rel in seen or stat.S_ISLNK(item.external_attr>>16):raise ValueError('UNSAFE_ORIGINAL_MEMBER')
   seen.add(rel);q=destination/rel;q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(z.read(item));count+=1
 return count

def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--reports-dir',type=Path,required=True);ap.add_argument('--node',type=Path,required=True);a=ap.parse_args()
 if os.geteuid()==0:raise RuntimeError('RUN_AS_UNPRIVILEGED_USER')
 logs=a.reports_dir.resolve();node=a.node.resolve()
 if logs==ROOT or ROOT in logs.parents:raise ValueError('REPORTS_MUST_BE_EXTERNAL')
 if not node.is_file():raise ValueError('NODE_NOT_FOUND')
 logs.mkdir(parents=True,exist_ok=False)
 install()
 env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1','PYTHONPATH':str(ROOT/'tools')+os.pathsep+str(ROOT/'tests'),'NODE_DISABLE_COLORS':'1'}
 result={'schema':'extremelab-interface-execution/v1','work_id':'S01-INTERFACE-MAP','started_utc':datetime.now(timezone.utc).isoformat(),'uid':os.geteuid(),'python':sys.version,'node_binary_sha256':h(node.read_bytes()),'scope':'Actual server HTTP/auth/SQLite and original projection; local Unix socket transport. Synthetic journal/observer inputs, remote vault/transport doubles. Native C# source only.','network':'seccomp inherited: socket/socketpair families other than AF_UNIX denied; no inherited sockets passed','executions':[],'status':'running','formal_acceptance':False}
 def run(label,args,*,cwd=ROOT,extra=None,methods=None,expect='success'):
  start=time.monotonic();p=subprocess.run([str(x) for x in args],cwd=cwd,env={**env,**(extra or {})},stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=120)
  log=logs/(label+'.log');log.write_text(p.stdout)
  row={'label':label,'command':[str(x) for x in args],'cwd':str(cwd),'exitcode':p.returncode,'elapsed_seconds':round(time.monotonic()-start,3),'log':log.name,'sha256':h(log.read_bytes())};result['executions'].append(row)
  if expect=='assertion_failure':
   assert p.returncode!=0 and '# fail 1' in p.stdout and 'ERR_ASSERTION' in p.stdout,p.stdout
   assert 'ERR_MODULE_NOT_FOUND' not in p.stdout and 'UNEXPECTED_EXTERNAL_ADAPTER' not in p.stdout,p.stdout
   row['expected_assertion_failure']=True
  elif expect=='integrity_rejection':assert p.returncode==2 and 'REJECTED' in p.stdout,p.stdout
  else:assert p.returncode==0,p.stdout
  if methods is not None:
   if '--test' in [str(x) for x in args]:
    n=re.search(r'^# tests (\d+)$',p.stdout,re.M);passes=re.search(r'^# pass (\d+)$',p.stdout,re.M)
    assert n and passes and int(n[1])==int(passes[1])==methods and '# fail 0' in p.stdout and '# skipped 0' in p.stdout,p.stdout
   else:assert re.search(r'Ran '+str(methods)+r' tests? in ',p.stdout) and '\nOK\n' in p.stdout and 'skipped=' not in p.stdout,p.stdout
   row['successful_unique_methods']=methods
  return p.stdout
 try:
  run('01_package_before',[sys.executable,'-B',ROOT/'verify_package.py'])
  version=run('02_runtime',[node,'--version']).strip();result['node_version']=version
  major,minor,*_=map(int,version.lstrip('v').split('.'));assert major>24 or (major==24 and minor>=10),'NEED_NODE_24_10_OR_NEWER'
  run('03_interface_sources',[sys.executable,'-B',ROOT/'tools/check_interface_map.py'])
  run('04_inventory_consistency',[sys.executable,'-B',ROOT/'tools/check_inventory_consistency.py'])
  run('05_reference_negatives',[sys.executable,'-B','-m','unittest','discover','-s','tests','-p','test_interface_map.py','-v'],methods=8)
  run('06_inventory_original',[sys.executable,'-B','-m','unittest','test_s01_candidate','test_s01_recovery','-v'],methods=20)
  with tempfile.TemporaryDirectory(prefix='s01-if-original-') as temp:
   p=Path(temp)/'Trading_Local';p.mkdir();result['original_platform_files']=stage(p)
   original={q.relative_to(p).as_posix():h(q.read_bytes()) for q in p.rglob('*') if q.is_file()}
   extra={'S01_INTERFACE_PLATFORM':str(p)}
   run('07_original_routes',[node,'--test','--test-reporter=tap','--test-concurrency=1',ROOT/'evidence/S01/interface_checks/interface_routes.test.mjs'],extra=extra,methods=13)
   files=['tests/observation.mjs','tests/engine-journal.mjs','tests/reconciliation20.mjs','tests/reconciliation20-tools.mjs','tests/remote-view20.mjs']
   run('08_original_regressions',[node,'--test','--test-reporter=tap','--test-concurrency=1',*files],cwd=p,methods=112)
   mutations=[('broker_identity','core/reconciliation20.mjs',"['broker','id','environment','currency'].every(k=>a[k]===b[k])","['id','environment','currency'].every(k=>a[k]===b[k])",'^I05 '),('inventory_semantics','core/remote-view20.mjs','plans:v.counts.plans,positionCountIsOpenInventory:false','plans:v.counts.plans,positionCountIsOpenInventory:true','^I08 '),('row_source_time','core/remote-view20.mjs','exitMode:p.exitMode,sourceAt:sourceTime','exitMode:p.exitMode,sourceAt:v.status.sourceTime','^I10 ')]
   result['mutations']=[]
   for label,rel,old,new,pattern in mutations:
    path=p/rel;before=path.read_bytes();s=before.decode();assert s.count(old)==1,(label,'not a single exact mutation');path.write_text(s.replace(old,new))
    try:
     run('09_mutation_'+label,[node,'--test','--test-reporter=tap','--test-concurrency=1','--test-name-pattern='+pattern,ROOT/'evidence/S01/interface_checks/interface_routes.test.mjs'],extra=extra,expect='assertion_failure');result['mutations'].append({'name':label,'source':rel,'detected':True,'scope':'temporary staged copy only'})
    finally:path.write_bytes(before)
   after={q.relative_to(p).as_posix():h(q.read_bytes()) for q in p.rglob('*') if q.is_file()}
   assert original==after,'STAGED_ORIGINAL_CHANGED';result['staged_original_files_unchanged']=len(original)
  # Reuse the unchanged package verifier against independent copies of this new ZIP tree.
  result['package_negative_checks']=[]
  with tempfile.TemporaryDirectory(prefix='s01-if-tamper-') as temp:
   cp=Path(temp)/'package';shutil.copytree(ROOT,cp);file=cp/'evidence/S01/interface-map.json';before=file.read_bytes()
   for name in ['modified_bytes','extra_file','symlink']:
    if name=='modified_bytes':file.write_bytes(before+b' ')
    elif name=='extra_file':(cp/'UNEXPECTED.txt').write_text('synthetic integrity test')
    else:file.unlink();file.symlink_to(ROOT/'evidence/S01/interface-map.json')
    try:run('10_package_'+name,[sys.executable,'-B',cp/'verify_package.py'],cwd=cp,expect='integrity_rejection');result['package_negative_checks'].append({'case':name,'detected':True})
    finally:
     if name=='modified_bytes':file.write_bytes(before)
     elif name=='extra_file':(cp/'UNEXPECTED.txt').unlink()
     else:file.unlink();file.write_bytes(before)
  run('11_package_after',[sys.executable,'-B',ROOT/'verify_package.py'])
  result.update(status='passed',successful_unique_test_methods=153,counts={'new_route_methods':13,'new_source_reference_methods':8,'original_behavior_regressions':112,'original_inventory_regressions':20,'mutations_separate':3,'package_negatives_separate':3})
 except Exception as exc:
  result.update(status='failed',failure=type(exc).__name__+': '+str(exc));print(str(exc),file=sys.stderr)
 finally:
  result['finished_utc']=datetime.now(timezone.utc).isoformat();(logs/'execution.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
 print(json.dumps({k:v for k,v in result.items() if k not in ['executions','failure']},indent=2,ensure_ascii=False));return 0 if result['status']=='passed' else 2
if __name__=='__main__':raise SystemExit(main())
