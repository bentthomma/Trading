"""Small source-reference integrity checks; no fabricated product implementation."""
import copy,json,sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'tools'))
from check_interface_map import audit
class SourceMap(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.m=json.loads((ROOT/'evidence/S01/interface-map.json').read_text());cls.b=json.loads((ROOT/'vendor-manifests/S01_INTERFACE_SOURCE_BINDINGS.json').read_text())
 def reject(self,m=None,b=None,code=''):
  r=audit(ROOT,map_override=m,bindings_override=b);self.assertFalse(r['consistent']);self.assertIn(code,[x['code'] for x in r['errors']])
 def test_exact_sources_and_document_refs(self):
  r=audit(ROOT);self.assertTrue(r['consistent'],r);self.assertEqual((r['source_bindings'],r['interfaces'],r['exact_production_matches']),(23,12,5));self.assertEqual(r['predecessor_reconstructed'],344)
 def test_stale_file_hash(self):
  b=copy.deepcopy(self.b);b['sources'][0]['sha256']='0'*64;self.reject(b=b,code='SOURCE_HASH')
 def test_invented_anchor(self):
  b=copy.deepcopy(self.b);b['sources'][0]['evidence'][0]['anchor']='absent imaginary gateway';self.reject(b=b,code='EVIDENCE_ANCHOR')
 def test_invented_mcp_name(self):
  m=copy.deepcopy(self.m);m['interfaces'][4]['protocol']['mcp_tool']='get_position_reconciliation';self.reject(m=m,code='MCP_NAME_NOT_IN_ORIGINAL')
 def test_wrong_http_route(self):
  m=copy.deepcopy(self.m);m['interfaces'][1]['protocol']['route']='/api/bridge/imaginary';self.reject(m=m,code='ROUTE_NOT_IN_ORIGINAL')
 def test_unbound_source(self):
  m=copy.deepcopy(self.m);m['interfaces'][0]['source_ids'].append('nonexistent');self.reject(m=m,code='UNBOUND_SOURCE')
 def test_missing_relay_as_complete(self):
  m=copy.deepcopy(self.m);m['interfaces'][8]['proof_status']='source_bound_static_only';self.reject(m=m,code='MISSING_RELAY_AS_COMPLETE')
 def test_native_execution_not_self_declared(self):
  m=copy.deepcopy(self.m);m['native_execution']=True;self.reject(m=m,code='UNAUTHORISED_PROMOTION')
if __name__=='__main__':unittest.main()
