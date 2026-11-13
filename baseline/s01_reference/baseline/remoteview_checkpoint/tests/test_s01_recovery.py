"""Validate nonrelease S01 source recovery, not trading functionality."""
import hashlib,json,unittest,brotli
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
REC=ROOT/'vendor-manifests/S01_VERIFIED_RECOVERED_PRODUCTION_SOURCES.json'
D=json.loads(REC.read_text())
class SourceRecovery(unittest.TestCase):
 def test_original_59_source_entries_and_exact_36_recovered(self):
  rows=D['sources'];self.assertEqual(len(rows),59)
  self.assertEqual(len({x['path'] for x in rows}),59)
  self.assertEqual(sum(x['status']=='byte_recovered' for x in rows),36)
  self.assertEqual(sum(x['status']=='not_recovered' for x in rows),23)
  self.assertFalse(D['fully_recovered_website'])
 def test_every_recovered_file_matches_vercel_uid_and_local_sha256(self):
  for r in D['sources']:
   p=ROOT/'baseline/vercel_recovered'/r['path']
   if r['status']=='byte_recovered':
    self.assertTrue(p.is_file(),r['path']);b=p.read_bytes()
    self.assertEqual(hashlib.sha1(b).hexdigest(),r['source_uid_sha1'])
    self.assertEqual(hashlib.sha256(b).hexdigest(),r['sha256'])
    self.assertEqual(len(b),r['bytes'])
   else:
    self.assertFalse(p.exists(),r['path'])
 def test_website_assets_four_chunks_and_five_files(self):
  base=ROOT/'baseline/vercel_recovered/src'
  b=b''.join((base/f'assets.{i}').read_bytes() for i in range(4))
  self.assertEqual(hashlib.sha1(b).hexdigest(),'4fb080ee08dcfbca24cf7c1cd41e5109780ead6f')
  source=json.loads(brotli.decompress(b))
  self.assertEqual(len(source),5)
  for path,raw in source.items():
   self.assertTrue(path.startswith('public/'))
   self.assertEqual((ROOT/'baseline/derived_assets'/path).read_bytes(),raw.encode('utf8'))
 def test_packed_account_addon_has_six_expected_paths(self):
  b=(ROOT/'baseline/vercel_recovered/src/account-addon.br').read_bytes()
  self.assertEqual(hashlib.sha256(b).hexdigest(),'321aa9d5065ade59fc22bac871ea4f2b162c12ade105e3104477a19ae7c88283')
  a=json.loads(brotli.decompress(b));self.assertEqual(set(a),{'lib/ctrader-readonly.mjs','lib/account-handler.mjs','public/konto-live.html','public/konto-live.js','public/konto-live.css','add-account-link.mjs'})
 def test_historical_binary_reproducibility_is_not_claimed(self):
  d=json.loads((ROOT/'evidence/S01/S01_HISTORICAL_VERCEL_BUILD_READBACK.json').read_text())
  a,b=d['builds'];self.assertEqual(a['source_sha256_reported'],b['source_sha256_reported'])
  self.assertNotEqual(a['binary_sha256_reported'],b['binary_sha256_reported'])
  self.assertNotEqual(a['artifact_bytes'],b['artifact_bytes'])
  self.assertTrue(d['historical_external_build_not_local_reproduction'])
 def test_official_s00_s01_and_missing_native_19_still_blocked(self):
  gate=json.loads((ROOT/'evidence/S01/GATE_STATUS.json').read_text())
  self.assertEqual(gate['s01_official_status'],'pending');self.assertEqual(gate['dependency_status'],'S00_NOT_ACCEPTED')
  self.assertFalse(gate['finish_authorized']);self.assertFalse(gate['runtime_release_authorized'])
  preview=json.loads((ROOT/'vendor-manifests/vercel_preview19_source_tree.json').read_text())
  self.assertFalse(preview['original_release_zip_bytes_recovered']);self.assertFalse(preview['original_release_binary_bytes_recovered'])
 def test_partial_replay_never_claims_full_build(self):
  p=json.loads((ROOT/'evidence/S01/S01_PARTIAL_WEBSITE_REPLAY.json').read_text())
  self.assertFalse(p['complete_website_build']);self.assertFalse(p['deployment']);self.assertFalse(p['broker_access'])
  self.assertEqual(p['postbuild_132'],'BLOCKED_EXPECTED_MISSING_LIVE_OVERLAY')
  self.assertTrue(p['addon_repeated_run_byte_idempotent'])
  self.assertTrue(p['view_repeated_run_byte_idempotent'])
  self.assertTrue(p['addon_tamper_rejected_without_public_mutation'])
 def test_primary_path_map_has_no_duplicates_and_recovered_hashes(self):
  a=json.loads((ROOT/'evidence/S01/path-map.json').read_text())['paths'];x={j['path']:j for j in a}
  self.assertEqual(len(a),len(x))
  for r in D['sources']:
   if r['status']=='byte_recovered':
    p=x[r['path']];self.assertEqual(p['status'],'source_bytes_verified_private_no_integration')
    self.assertEqual(p['source_sha256'],r['sha256'])
if __name__=='__main__':unittest.main()
