#!/usr/bin/env python3
"""Restricted partial offline replay using actual hash-pinned source, no broker or network.

This intentionally does NOT simulate missing live-overlay or skin inputs.
"""
import hashlib,json,os,pathlib,shutil,subprocess,tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE=ROOT/'baseline/vercel_recovered/src';ASSETS=ROOT/'baseline/derived_assets'
LIST=json.loads((ROOT/'vendor-manifests/S01_VERIFIED_RECOVERED_PRODUCTION_SOURCES.json').read_text())['sources']
UIDS={x['path'][4:]:x['source_uid_sha1'] for x in LIST if x['status']=='byte_recovered'}
STEPS=['postbuild-132.mjs','version133.mjs','build-account-addon.mjs','build-revolution20.mjs']
def sha(b):return hashlib.sha256(b).hexdigest()
def tree(p):return {str(f.relative_to(p)):sha(f.read_bytes()) for f in sorted(p.rglob('*')) if f.is_file()}
def run(file, cwd):
 env={'PATH':os.environ.get('PATH',''),'HOME':str(cwd),'TMPDIR':str(cwd)}
 p=subprocess.run(['node',file],cwd=cwd,env=env,capture_output=True,text=True,timeout=20)
 return {'file':file,'returncode':p.returncode,'stdout':p.stdout[-1200:],'stderr':p.stderr[-1200:]}
def main():
 for f in STEPS:
  content=(SOURCE/f).read_bytes()
  assert hashlib.sha1(content).hexdigest()==UIDS[f]
 output={'scope':'Independently replayable subcomponents; NOT full 8-stage website build','runtime':subprocess.run(['node','--version'],capture_output=True,text=True).stdout.strip(),'original_files_sha1_verified':len(UIDS),'external_network_access':False,'broker_access':False,'deployment':False,'complete_website_build':False,'steps':[]}
 with tempfile.TemporaryDirectory(prefix='extremelab-s01-offline-') as tmp:
  wd=pathlib.Path(tmp)
  shutil.copytree(SOURCE,wd,dirs_exist_ok=True)
  shutil.copytree(ASSETS,wd,dirs_exist_ok=True)
  before=tree(wd/'public')
  # Real dependency check: bare assets are NOT the patched live adapter.
  s=run('postbuild-132.mjs',wd); output['steps'].append(s)
  assert s['returncode']!=0 and 'Unexpected live UI source; not patched' in s['stderr']
  assert before==tree(wd/'public'),'Fail-closed stage mutated public files'
  output['postbuild_132']='BLOCKED_EXPECTED_MISSING_LIVE_OVERLAY'
  # Original addon is independently usable on the original asset baseline.
  s=run('build-account-addon.mjs',wd); output['steps'].append(s)
  assert s['returncode']==0,s['stderr']
  assert (wd/'public/konto-live.html').is_file()
  assert (wd/'public/index.html').read_text().count('href="/konto-live.html"')==1
  addon_hash=tree(wd/'public')
  s=run('build-account-addon.mjs',wd);output['steps'].append(s)
  assert s['returncode']==0 and addon_hash==tree(wd/'public')
  output['addon_repeated_run_byte_idempotent']=True
  # View stage independently consumes recovered source + add-on, not a fake UI stage.
  s=run('build-revolution20.mjs',wd);output['steps'].append(s)
  assert s['returncode']==0,s['stderr']
  for n in ['revolution.css','revolution.js','revolution.html','revolution-link.css']:
   assert (wd/'public'/n).read_bytes()==(wd/'view20-public'/n).read_bytes()
  for n in ['index.html','konto-live.html']:
   assert (wd/'public'/n).read_text().count('id="th3rev20-link"')==1
  view_before=tree(wd/'public')
  s=run('build-revolution20.mjs',wd);output['steps'].append(s)
  assert s['returncode']==0 and view_before==tree(wd/'public')
  output['view_repeated_run_byte_idempotent']=True
  output['derived_public_files_after_isolated_subcomponents']=len(view_before)
  output['partial_public_sha256']=sha(json.dumps(view_before,sort_keys=True).encode('utf8'))
  # Original tamper guard: reject a one-byte change in the packed account addon.
  old=(wd/'account-addon.br').read_bytes()
  (wd/'account-addon.br').write_bytes(old[:-1]+bytes([old[-1]^1]))
  protected=tree(wd/'public')
  s=run('build-account-addon.mjs',wd);output['steps'].append(s)
  assert s['returncode']!=0 and 'ACCOUNT_ADDON_INTEGRITY' in s['stderr']
  assert protected==tree(wd/'public')
  output['addon_tamper_rejected_without_public_mutation']=True
 output['overall']='EXPECTED_BLOCKER_WITH_INDEPENDENT_COMPONENTS_VERIFIED'
 print(json.dumps(output,indent=2,ensure_ascii=False))
if __name__=='__main__':main()
