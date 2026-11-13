from pathlib import Path
import tempfile,shutil,json,hashlib,subprocess,sys,os,argparse
P=Path(__file__).resolve().parents[1]
ap=argparse.ArgumentParser();ap.add_argument('--reports-dir',required=True,type=Path);args=ap.parse_args();LOGS=args.reports_dir.resolve();LOGS.mkdir(parents=True,exist_ok=True)
if LOGS==P or P in LOGS.parents:raise RuntimeError('Mutation logs must be outside the package')
sys.path.insert(0,str(P/'tools'));from no_connect import install
rows=[]
for name,before,after,testname in [
 ('remove_viewer_publish_boundary',"if(msg.type==='publish'&&role==='producer'){","if(msg.type==='publish'){",'socket: signed viewer reads synthetic snapshot but cannot publish or trade'),
 ('remove_origin_prefilter','if(!browser&&req.headers.origin){','if(false){','socket: cross-origin or invalid browser cookie is rejected before transport admission')]:
 with tempfile.TemporaryDirectory(prefix='s01-mutant-') as td:
  t=Path(td);shutil.copytree(P/'baseline/vercel_recovered',t/'baseline/vercel_recovered');(t/'tests').mkdir();shutil.copy2(P/'tests/endpoint_dispatch.test.mjs',t/'tests/endpoint_dispatch.test.mjs');(t/'vendor-manifests').mkdir()
  f=t/'baseline/vercel_recovered/src/api/socket.js';s=f.read_text();assert s.count(before)==1;s=s.replace(before,after);f.write_text(s)
  m=json.loads((P/'vendor-manifests/S01_VERIFIED_RECOVERED_PRODUCTION_SOURCES.json').read_text())
  for r in m['sources']:
   if r['path']=='src/api/socket.js':r['sha256']=hashlib.sha256(f.read_bytes()).hexdigest()
  (t/'vendor-manifests/S01_VERIFIED_RECOVERED_PRODUCTION_SOURCES.json').write_text(json.dumps(m))
  # Rebind ONLY isolated test copy hash so behavior, not the hash gate, detects mutation.
  p=subprocess.run(['node','--experimental-vm-modules','--test','--test-name-pattern',testname,'tests/endpoint_dispatch.test.mjs'],cwd=t,capture_output=True,text=True,preexec_fn=install,timeout=20)
  expected='not ok 1 - '+testname
  detected=p.returncode==1 and expected in p.stdout and 'Original source bytes changed' not in p.stdout
  rows.append({'mutation':name,'target':'src/api/socket.js','test':testname,'returncode':p.returncode,'detected_by_behavior_not_hash_gate':detected,'scope':'temporary copy only; test manifest rebound deliberately for mutation execution, not provider provenance or release'})
  (LOGS/(name+'.log')).write_text(p.stdout+'\n'+p.stderr)
  assert detected,(name,p.stdout)
(LOGS/'mutation_results.json').write_text(json.dumps({'mutations':rows,'unique_test_methods_added':0,'baseline_modified':False},indent=2)+'\n')
print(json.dumps({'mutations':rows,'all_detected':all(x['detected_by_behavior_not_hash_gate'] for x in rows),'added_unique_test_methods':0},indent=2))
