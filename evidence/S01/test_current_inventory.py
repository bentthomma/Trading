"""Real inventory negative probes, restoring altered test-copy files in finally."""
from pathlib import Path
import json,os,unittest
from check_current_inventory import check,load
ROOT=Path(os.environ['EXTREMELAB_INVENTORY_ROOT'])
class CurrentInventory(unittest.TestCase):
 def mutate(self,path,data,expected):
  p=ROOT/path;old=p.read_bytes() if p.exists() else None;p.parent.mkdir(parents=True,exist_ok=True)
  try:
   p.write_bytes(data)
   with self.assertRaisesRegex(ValueError,expected):check(ROOT)
  finally:
   if old is None:p.unlink()
   else:p.write_bytes(old)
 def test_complete_inventory_and_local_policy(self):self.assertEqual(check(ROOT)['counts']['complete_original'],38)
 def test_changed_original_source_rejected(self):
  row=next(x for x in load(ROOT/'vendor-manifests/S01_CLOSEOUT_SOURCE_CATALOG.json')['website']['sources'] if x['full_bytes_available']);p=ROOT/row['storage_path'];self.mutate(row['storage_path'],p.read_bytes()+b'changed','SOURCE_BYTES')
 def test_invented_missing_source_rejected(self):
  row=next(x for x in load(ROOT/'vendor-manifests/S01_CLOSEOUT_SOURCE_CATALOG.json')['website']['sources'] if not x['full_bytes_available']);self.mutate('baseline/s01_reference/baseline/vercel_recovered/'+row['source_path'],b'fake','MISSING_SOURCE_REPLACED')
 def test_stale_catalog_binding_rejected(self):
  p='evidence/S01/path-map.json';j=load(ROOT/p);j['source_catalog']['sha256']='0'*64;self.mutate(p,json.dumps(j).encode(),'DELIVERABLE_BINDING')
 def test_broker_permission_not_granted(self):
  p='evidence/S01/donor-map.json';j=load(ROOT/p);j['broker_actions_authorized']=True;self.mutate(p,json.dumps(j).encode(),'UNAUTHORIZED_PERMISSION')
 def test_no_hidden_reviewer_gate(self):
  p='evidence/S01/closeout-readiness.json';j=load(ROOT/p);j['independent_review_required']=True;self.mutate(p,json.dumps(j).encode(),'REVIEWER_GATE_REINTRODUCED')
if __name__=='__main__':unittest.main()
