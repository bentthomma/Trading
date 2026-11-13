#!/usr/bin/env python3
"""Reproduce current S01 checks without broker/network; logs outside the package.

Linux + libseccomp required. No npm install or private-service credentials used.
Runtime packages absent from this machine remain an explicit integration gap.
"""
from pathlib import Path
import argparse,datetime,hashlib,json,os,re,shutil,subprocess,sys,tempfile
from no_connect import install
ROOT=Path(__file__).resolve().parents[1]

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--reports-dir',required=True,type=Path);a=ap.parse_args()
 logs=a.reports_dir.resolve()
 if logs==ROOT or ROOT in logs.parents:raise RuntimeError('Logs must be outside the immutable package')
 logs.mkdir(parents=True,exist_ok=True)
 out={'work_id':'S01-ENDPOINTRECOVERY-20261113','executed_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'uid':os.getuid(),'node':subprocess.check_output(['node','--version'],text=True).strip(),'python':sys.version.split()[0], 'scope':'Private source recovery and original handler dispatch; no native WebSocket/provider integration','commands':[], 'known_unfixed_compatibility_gap':'api/live.js sends gzip for Accept-Encoding gzip;q=0 on a large synthetic response; one characterization test, not conformance success','prior_receiver_tests_rerun':False,'native_csharp_build':False,'broker_actions':False,'publication':False}
 def run(name,args,cwd=ROOT,expected=(0,),data=False):
  env={'PATH':os.environ.get('PATH',''),'HOME':str(logs),'TMPDIR':'/tmp','PYTHONDONTWRITEBYTECODE':'1','PYTHONHASHSEED':'0'}
  p=subprocess.run(args,cwd=cwd,env=env,capture_output=True,text=True,preexec_fn=install,timeout=45)
  (logs/(name+'.log')).write_text(p.stdout+'\n--- STDERR ---\n'+p.stderr)
  rec={'name':name,'returncode':p.returncode,'expected_exitcodes':list(expected),'expected_outcome_observed':p.returncode in expected,'log':name+'.log'}
  if name=='python_tests':
   q=re.search(r'Ran (\d+) tests?',p.stderr);rec['test_methods']=int(q.group(1)) if q else None
  if name in ['endpoint_dispatch','original_security']:
   for key in ['tests','pass','fail','skipped']:
    q=re.search(r'^# '+key+r' (\d+)\s*$',p.stdout,re.M);rec[key]=int(q.group(1)) if q else None
  if data and p.returncode==0:rec['result']=json.loads(p.stdout)
  out['commands'].append(rec)
  if p.returncode not in expected:raise RuntimeError(name+' failed; inspect '+str(logs/(name+'.log')))
  return p
 run('package_before',[sys.executable,'-B','verify_package.py'],data=True)
 probe=run('network_deny_probe',[sys.executable,'-c',"import socket,errno; s=socket.socket();\ntry: s.connect(('127.0.0.1',9)); raise AssertionError('network allowed')\nexcept PermissionError as e: assert e.errno==errno.EPERM; print('CONNECT_DENIED_EPERM')"])
 assert 'CONNECT_DENIED_EPERM' in probe.stdout
 run('reconstruction',[sys.executable,'-B','tools/recover_endpoint_sources.py'],data=True)
 run('python_tests',[sys.executable,'-B','-m','unittest','discover','-s','tests','-p','test_*.py','-v'])
 run('endpoint_dispatch',['node','--experimental-vm-modules','--test','tests/endpoint_dispatch.test.mjs'])
 with tempfile.TemporaryDirectory(prefix='s01-original-security-') as t:
  t=Path(t);(t/'tests').mkdir();(t/'lib').mkdir()
  shutil.copy2(ROOT/'baseline/recovery_donors/security.test.mjs',t/'tests/security.test.mjs')
  shutil.copy2(ROOT/'baseline/vercel_recovered/src/lib/security.mjs',t/'lib/security.mjs')
  run('original_security',['node','--test','tests/security.test.mjs'],cwd=t)
 run('behavior_mutations',[sys.executable,'-B','tools/check_behavior_mutations.py','--reports-dir',str(logs/'mutations')],data=True)
 # Import missing originals directly, without adapters. Errors are preserved, not ignored.
 dependencies=[]
 for name,needle in [('api/account-chart.js','market-reader.mjs'),('api/live.js','relay.mjs'),('api/socket.js',"Cannot find package 'ws'"),('api/probe.js',"Cannot find package 'ws'")]:
  uri=(ROOT/'baseline/vercel_recovered/src'/name).as_uri()
  p=run('native_import_'+Path(name).stem,['node','--input-type=module','-e','await import('+json.dumps(uri)+')'],expected=(1,))
  assert 'ERR_MODULE_NOT_FOUND' in p.stderr and needle in p.stderr,(name,p.stderr)
  dependencies.append({'source':name,'exit':p.returncode,'missing':needle,'native_integration':'NOT_TESTED_MISSING_DEPENDENCY'})
 out['native_import_gaps']=dependencies
 run('first_stage_build',[sys.executable,'-B','tools/check_build_boundary.py'],data=True)
 run('package_after',[sys.executable,'-B','verify_package.py'],data=True)
 counted=[x for x in out['commands'] if x['name'] in ['python_tests','endpoint_dispatch','original_security']]
 out['unique_test_methods']=sum(x.get('test_methods',x.get('tests',0)) for x in counted)
 out['network_restriction']='Linux seccomp denies connect,sendto,sendmsg,sendmmsg in all test children; no general sandbox or native WebSocket conformance claim'
 out['scope_result']='OFFLINE_PACKAGE_CHECKS_PASSED_WITH_KNOWN_COMPATIBILITY_GAP_AND_INCOMPLETE_PRODUCTION_BUILD'
 out['product_acceptance']=False;out['full_website_build']=False
 (logs/'result.json').write_text(json.dumps(out,indent=2)+'\n')
 print(json.dumps(out,indent=2))
if __name__=='__main__':main()
