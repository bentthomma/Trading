import hashlib,json,re,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def readjson(name):return json.loads((ROOT/name).read_text(encoding='utf-8'))
class S01Tests(unittest.TestCase):
 def setUp(self):
  self.lock=readjson('evidence/S01/baseline-lock.json');self.tree=readjson('vendor-manifests/vercel_prod_source_tree.json');self.prev=readjson('vendor-manifests/vercel_preview19_source_tree.json');self.repro=readjson('evidence/S01/reproduction-report.json');self.gate=readjson('evidence/S01/GATE_STATUS.json')
 def test_official_dependency_unchanged(self):
  self.assertEqual(self.gate['dependency_status'],'S00_NOT_ACCEPTED');self.assertEqual(self.gate['s01_official_status'],'pending');self.assertFalse(self.gate['finish_authorized'])
  self.assertFalse(self.lock['official_S00_accepted']);self.assertFalse(self.lock['official_S01_started'])
 def test_no_broker_github_release_writes_claimed(self):
  self.assertFalse(self.lock['broker_actions_authorized']);self.assertFalse(self.lock['github_write_authorized']);self.assertFalse(self.lock['release_authorized']);self.assertFalse(self.gate['runtime_release_authorized'])
 def test_source_tree_has_59_unique_exact_provider_ids(self):
  rows=self.tree['files'];self.assertEqual(len(rows),self.tree['file_count']);self.assertEqual(len(rows),59)
  self.assertEqual(len({f['path'] for f in rows}),59);self.assertEqual(len({f['vercel_source_uid'] for f in rows}),59)
  for item in rows:
   self.assertRegex(item['vercel_source_uid'],r'\A[0-9a-f]{40}\Z');self.assertTrue(item['path'].startswith('src/'));self.assertNotIn('..',Path(item['path']).parts)
 def test_no_remote_source_marked_locally_preserved(self):
  self.assertFalse(self.tree['complete_byte_backup']);self.assertEqual(self.lock['source_tree_prod_v2']['materialized_full_files'],0)
  self.assertTrue(all(not x['bytes_preserved_locally'] and not x['independent_full_file_hash_verified'] for x in self.tree['files']))
 def test_website_response_truncation_is_visible(self):
  c={}
  for x in self.tree['files']:c[x['retrieval_status']]=c.get(x['retrieval_status'],0)+1
  self.assertEqual(c,{'content_read_complete_not_materialized':8,'content_response_truncated_prefix_only':8,'provider_listing_only':43})
  for p in ['src/assets.0','src/skin.0','src/bot-src.0','src/live-overlay.b64']:
   self.assertEqual(next(r for r in self.tree['files'] if r['path']==p)['retrieval_status'],'content_response_truncated_prefix_only')
 def test_eight_real_stages_listed_but_not_claimed_built(self):
  stages=self.repro['website_full_build']['build_stages'];self.assertEqual(len(stages),8)
  self.assertTrue(set('src/'+s for s in stages).issubset({i['path'] for i in self.tree['files']}))
  self.assertFalse(self.repro['website_full_build']['build_executed']);self.assertEqual(self.repro['website_full_build']['status'],'blocked_capability')
 def test_native19_not_relabelled(self):
  self.assertFalse(self.prev['original_release_binary_bytes_recovered']);self.assertFalse(self.prev['original_release_zip_bytes_recovered']);self.assertEqual(len(self.prev['source_files']),3)
  self.assertFalse(self.lock['native_derivative']['original_engine_19_equivalent']);self.assertFalse(self.lock['native_derivative']['binary_rebuilt'])
 def test_historical_runtime_evidence_retained_not_rerun(self):
  z=self.repro['historical_preacceptance_executions'];self.assertEqual(z['node_version'],'v24.11.1');self.assertEqual(z['source_archive_sha256'],self.lock['sources'][3]['sha256'])
  self.assertEqual([z[k]['pass'] for k in ['target_group','observation_group']],[79,91])
  self.assertEqual([z[k]['returncode'] for k in ['target_group','observation_group']],[0,0]);self.assertFalse(z['generator']['binary_build'])
 def test_selected_build_source_mapping_not_treated_as_repo(self):
  pm=readjson('evidence/S01/path-map.json');ids={x['path']:x['vercel_source_uid'] for x in self.tree['files']}
  for x in pm['paths']:
   if x.get('source_archive')=='vercel-production-deployment-source-tree':
    self.assertEqual(x['source_uid'],ids[x['path']]);self.assertEqual(x['status'],'provider_mapped_not_materialized_no_integration')
 def test_candidate_donor_has_no_accidental_promotion(self):
  dm=readjson('evidence/S01/donor-map.json');by={x['component']:x for x in dm['entries']}
  self.assertEqual(by['Production website (Vercel source input tree)']['classification'],'reference_only');self.assertEqual(by['Original Engine 1.9 delivery preview']['classification'],'unresolved')
 def test_plan_file_unchanged_hash_if_bundled(self):
  path=ROOT/'baseline/masterplan_1_1_0_plan.json'
  if path.exists():self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),self.gate['plan_sha256'])
 def test_manifest_consistency_if_present(self):
  p=ROOT/'MANIFEST.json'
  if not p.exists():return
  d=json.loads(p.read_text());self.assertIn('files',d)
  disk={f.relative_to(ROOT).as_posix():f for f in ROOT.rglob('*') if f.is_file() and f.name!='MANIFEST.json' and '__pycache__' not in f.parts}
  self.assertEqual(set(disk),set(d['files']))
  for name,sha in d['files'].items():self.assertEqual(hashlib.sha256(disk[name].read_bytes()).hexdigest(),sha,name)
if __name__=='__main__':unittest.main(verbosity=2)
