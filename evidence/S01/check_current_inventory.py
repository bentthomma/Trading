"""Check actual source bytes and amended inventory bindings; never change plan state."""
from pathlib import Path
import hashlib,json,subprocess,zipfile

def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def load(p):return json.loads(p.read_text())
def check(root):
 root=Path(root);p=root/'vendor-manifests/S01_CLOSEOUT_SOURCE_CATALOG.json';cat=load(p);catalog_hash=digest(p)
 plan=root/'governance/masterplan/plan.json';rules=load(plan)['global_rules']
 if cat['plan_sha256']!=digest(plan) or cat['plan_version']!='1.2.0':raise ValueError('CURRENT_PLAN_BINDING')
 if rules['required_independent_review'] or rules['evidence_source']!='local_git_verified':raise ValueError('POLICY_BINDING')
 counts={'complete_original':0,'prefix_only':0,'metadata_only':0};seen=set()
 for row in cat['website']['sources']:
  if row['source_path'] in seen:raise ValueError('DUPLICATE_SOURCE')
  seen.add(row['source_path']);counts[row['classification']]+=1
  if row['integration_authorized']:raise ValueError('UNAUTHORIZED_INTEGRATION')
  if row['full_bytes_available']:
   if row['classification']!='complete_original':raise ValueError('CLASSIFICATION')
   p=root/row['storage_path'];raw=p.read_bytes()
   if p.is_symlink() or hashlib.sha256(raw).hexdigest()!=row['sha256'] or hashlib.sha1(raw).hexdigest()!=row['provider_uid_sha1'] or len(raw)!=row['bytes']:raise ValueError('SOURCE_BYTES')
  else:
   if row['storage_path'] is not None or row['classification']=='complete_original':raise ValueError('MISSING_SOURCE_CLAIM')
   if (root/'baseline/s01_reference/baseline/vercel_recovered'/row['source_path']).exists():raise ValueError('MISSING_SOURCE_REPLACED')
 if counts!={'complete_original':38,'prefix_only':5,'metadata_only':16} or len(seen)!=59:raise ValueError('COUNTS')
 for row in cat['preserved_archives']:
  p=root/row['storage_path']
  if digest(p)!=row['sha256'] or p.stat().st_size!=row['bytes']:raise ValueError('ARCHIVE_BYTES')
  with zipfile.ZipFile(p) as z:
   if z.testzip() or len(z.infolist())!=row['zip_entries']:raise ValueError('ARCHIVE_CRC')
 for row in cat['space_reference_sources']:
  if digest(root/row['storage_path'])!=row['sha256'] or row['engine_1_9_identity_verified'] or row['deployment_equivalence_verified']:raise ValueError('SPACE_BINDING')
 for name in ['baseline-lock.json','donor-map.json','reproduction-report.json','path-map.json','closeout-readiness.json']:
  j=load(root/'evidence/S01'/name)
  if j['source_catalog']!={'path':'vendor-manifests/S01_CLOSEOUT_SOURCE_CATALOG.json','sha256':catalog_hash} or j['plan_sha256']!=digest(plan):raise ValueError('DELIVERABLE_BINDING')
  if j['independent_review_required'] is not False:raise ValueError('REVIEWER_GATE_REINTRODUCED')
  for k in ['product_integration_authorized','github_writes_authorized','broker_actions_authorized']:
   if j[k] is not False:raise ValueError('UNAUTHORIZED_PERMISSION')
 if catalog_hash not in (root/'evidence/S01/version-crosswalk.md').read_text():raise ValueError('CROSSWALK_BINDING')
 for row in load(root/'evidence/S01/reference-preservation-map.json')['reconstructed_files']:
  if digest(root/row['canonical_source'])!=row['sha256']:raise ValueError('HISTORICAL_PLAN_CHANGED')
 git=['/usr/bin/git','-c','core.hooksPath=/dev/null','-C',str(root)]
 if subprocess.check_output(git+['remote'],text=True).strip():raise ValueError('REMOTE_PRESENT')
 return {'counts':counts,'total':len(seen),'archives_hash_and_crc':len(cat['preserved_archives']),'space_reference_files':len(cat['space_reference_sources']),'plan_sha256':digest(plan),'catalog_sha256':catalog_hash,'deployment_performed':False,'broker_actions_performed':False,'scope':'Inventory integrity only; missing full build remains blocked_capability'}

if __name__=='__main__':
 import sys
 print(json.dumps(check(Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).resolve().parents[2]),indent=2))
