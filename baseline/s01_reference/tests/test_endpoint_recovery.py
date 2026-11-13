"""Recovery-boundary and actual original UI-patch tests; no provider connection."""
import copy,hashlib,json,os,shutil,subprocess,sys,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
import recover_endpoint_sources as rec
from no_connect import install
CAP=json.loads((ROOT/'evidence/S01/S01_ENDPOINT_PROVIDER_CAPTURES.json').read_text())
UID={r['path']:r['vercel_source_uid'] for r in json.loads((ROOT/'vendor-manifests/vercel_prod_source_tree.json').read_text())['files']}

class RecoveryBoundary(unittest.TestCase):
 def test_five_original_sources_reconstruct_exactly(self):
  self.assertEqual(len(CAP),5)
  for c in CAP:
   self.assertEqual(rec.reconstruct(c,UID[c['path']]),(ROOT/'baseline/vercel_recovered'/c['path']).read_bytes())
 def test_truncated_prefix_cannot_be_promoted_to_complete(self):
  for c in CAP:
   if c['capture_status']=='truncated':
    x=copy.deepcopy(c);x.update(capture_status='complete',omittedStringChars=0,method='complete_connector_response')
    with self.assertRaises(rec.RecoveryError):rec.reconstruct(x,UID[x['path']])
 def test_provider_uid_is_not_replaceable_by_capture(self):
  x=copy.deepcopy(CAP[0]);x['vercel_source_uid']='0'*40
  with self.assertRaisesRegex(rec.RecoveryError,'PROVIDER_UID_MISMATCH'):rec.reconstruct(x,UID[x['path']])
 def test_malformed_base64_is_rejected(self):
  x=copy.deepcopy(CAP[0]);x['data_base64']+='!'
  with self.assertRaisesRegex(rec.RecoveryError,'INVALID_BASE64'):rec.reconstruct(x,UID[x['path']])
 def test_wrong_donor_hash_and_overlap_fail(self):
  c=next(x for x in CAP if x['path']=='src/api/socket.js')
  for field,value,why in [('donor_sha256','0'*64,'DONOR_HASH'),('donor_suffix_start',c['donor_suffix_start']+1,'OVERLAP'),('overlap_bytes',79,'OVERLAP')]:
   x=copy.deepcopy(c);x[field]=value
   with self.assertRaisesRegex(rec.RecoveryError,why):rec.reconstruct(x,UID[x['path']])
 def test_required_transformations_are_not_optional(self):
  for c in CAP:
   if 'transformation' in c:
    x=copy.deepcopy(c);x['transformation']='as-is'
    with self.assertRaises(rec.RecoveryError):rec.reconstruct(x,UID[x['path']])
 def test_unknown_transformation_and_length_are_rejected(self):
  c=next(x for x in CAP if x['capture_status']=='truncated')
  x=copy.deepcopy(c);x['transformation']='invent_missing_code'
  with self.assertRaisesRegex(rec.RecoveryError,'UNKNOWN_TRANSFORMATION'):rec.reconstruct(x,UID[x['path']])
  x=copy.deepcopy(c);x['omittedStringChars']+=4
  with self.assertRaisesRegex(rec.RecoveryError,'ENCODED_LENGTH'):rec.reconstruct(x,UID[x['path']])
 def test_write_reproduction_is_exclusive(self):
  with tempfile.TemporaryDirectory() as t:
   d=Path(t);self.assertEqual(rec.run(d)['source_files_reproduced'],5)
   old={p.relative_to(d).as_posix():p.read_bytes() for p in d.rglob('*') if p.is_file()}
   with self.assertRaisesRegex(rec.RecoveryError,'OUTPUT_EXISTS'):rec.run(d)
   self.assertEqual(old,{p.relative_to(d).as_posix():p.read_bytes() for p in d.rglob('*') if p.is_file()})
 def test_output_path_traversal_and_symlink_are_rejected(self):
  with tempfile.TemporaryDirectory() as t:
   d=Path(t)
   for value in ['../outside','/absolute','src/../x','src//x','src\\x']:
    with self.assertRaises(rec.RecoveryError):rec.safe_file(d,value)
   (d/'src').symlink_to(ROOT/'baseline/vercel_recovered/src',target_is_directory=True)
   with self.assertRaisesRegex(rec.RecoveryError,'SYMLINK'):rec.run(d)

 def test_current_inventory_counts_and_missing_paths_agree(self):
  def load(name):return json.loads((ROOT/name).read_text())
  m=load('vendor-manifests/S01_VERIFIED_RECOVERED_PRODUCTION_SOURCES.json')
  missing=[r['path'] for r in m['sources'] if r['status']=='not_recovered'];n=59-len(missing)
  self.assertEqual(n,36);self.assertEqual(len(missing),23)
  lock=load('evidence/S01/baseline-lock.json')['source_tree_prod_v5']
  self.assertEqual(lock['full_bytes_preserved_locally'],n);self.assertEqual(lock['missing_paths'],missing)
  pm=load('evidence/S01/path-map.json');self.assertEqual(pm['current_recovered_source_count'],n);self.assertEqual(pm['current_missing_source_paths'],missing)
  repro=load('evidence/S01/reproduction-report.json')['website_full_build']
  self.assertEqual(repro['source_files_recovered_current'],n);self.assertEqual(repro['source_files_unavailable_current'],len(missing))
  self.assertIn('36 von 59',(ROOT/'evidence/S01/version-crosswalk.md').read_text())
  self.assertIn('23 fehlen.',(ROOT/'evidence/S01/version-crosswalk.md').read_text())

class OriginalUIPatch(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory(prefix='s01-real-patch-');self.w=Path(self.tmp.name);self.f=self.w/'app.js'
  self.f.write_bytes((ROOT/'baseline/derived_assets/public/app.js').read_bytes())
  self.script=ROOT/'baseline/vercel_recovered/src/patch_ui.mjs'
  self.assertEqual(hashlib.sha1(self.script.read_bytes()).hexdigest(),UID['src/patch_ui.mjs'])
 def tearDown(self):self.tmp.cleanup()
 def run_patch(self):
  return subprocess.run(['node',str(self.script),str(self.f)],cwd=self.w,capture_output=True,text=True,timeout=10,preexec_fn=install,env={'PATH':os.environ.get('PATH',''),'HOME':str(self.w),'TMPDIR':str(self.w)})
 def test_real_patch_produces_exact_archived_output(self):
  p=self.run_patch();self.assertEqual(p.returncode,0,p.stderr)
  self.assertEqual(self.f.read_bytes(),(ROOT/'baseline/recovery_donors/expected_patched_app.js').read_bytes())
 def test_second_run_is_rejected_without_file_mutation(self):
  self.assertEqual(self.run_patch().returncode,0);before=self.f.read_bytes();p=self.run_patch()
  self.assertNotEqual(p.returncode,0);self.assertIn('Expected exactly one match',p.stderr);self.assertEqual(self.f.read_bytes(),before)
 def test_missing_late_anchor_does_not_commit_partial_patch(self):
  self.f.write_text(self.f.read_text().replace(" if(!f){$('chart').innerHTML="," if(!f){$('chart').innerHTML ="))
  before=self.f.read_bytes();p=self.run_patch();self.assertNotEqual(p.returncode,0);self.assertEqual(self.f.read_bytes(),before)
 def test_duplicated_anchor_is_rejected_without_mutation(self):
  self.f.write_text(self.f.read_text()+"\n// filter==='open'&&e?.data.Status==='POSITION OFFEN'\n")
  before=self.f.read_bytes();p=self.run_patch();self.assertNotEqual(p.returncode,0);self.assertEqual(self.f.read_bytes(),before)
 def test_recovered_sources_are_syntactically_valid(self):
  for c in CAP:
   p=subprocess.run(['node','--check',str(ROOT/'baseline/vercel_recovered'/c['path'])],capture_output=True,text=True,timeout=10,preexec_fn=install)
   self.assertEqual(p.returncode,0,(c['path'],p.stderr))
if __name__=='__main__':unittest.main(verbosity=2)
