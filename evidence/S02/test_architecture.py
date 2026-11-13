from pathlib import Path
import importlib.util,json,shutil,tempfile,unittest
R=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('sources',R/'evidence/S02/check_sources.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Architecture(unittest.TestCase):
    def test_actual_source_bytes_and_all_future_cards_bound(self):
        result=m.check();self.assertEqual(result['contract_types'],12);self.assertEqual(result['future_scope_entries'],33)
    def test_research_matrix_cannot_be_promoted_to_grant(self):
        self.mutate('evidence/S02/capability-matrix.json',lambda x:x.update(capability_document_is_authority=True),'UNAUTHORISED_GRANT')
    def test_broker_capability_cannot_be_added_to_research(self):
        def change(x):next(p for p in x['principals']if p['id']=='research_worker')['capabilities'].append('broker.execute')
        self.mutate('evidence/S02/capability-matrix.json',change,'UNAUTHORISED_GRANT')
    def test_scope_activation_cannot_be_inferred_from_draft(self):
        self.mutate('evidence/S02/scope-resolution-draft.json',lambda x:x.update(active=True),'UNAUTHORISED_SCOPE_ACTIVATION')
    def test_unknown_donor_is_not_a_source(self):
        self.mutate('evidence/S02/scope-resolution-draft.json',lambda x:x['steps'][0]['source_ids'].append('invented-source'),'INVENTED_SOURCE_ID')
    def test_all_wire_records_present_without_native_broker_dependency(self):
        t=(R/'adapters/contracts/v1/native/DomainModels.cs').read_text();k=json.loads((R/'evidence/S02/domain-contract.json').read_text())['domain_types']
        for name in k:self.assertIn('record '+name+'\n',t)
        for name in ['double','decimal','cAlgo.API','Broker.Execute']:self.assertNotIn(name,t)
        self.assertIn('string? MaximumPositions',t);self.assertIn('AccountState',t)
    def mutate(self,rel,change,code):
        # New metadata in a temporary repository view; no baseline file is changed.
        with tempfile.TemporaryDirectory(prefix='s02-boundary-')as d:
            r=Path(d);paths=['evidence/S02','governance/masterplan','vendor-manifests','evidence/S01','contracts/domain/v1']
            for p in paths:shutil.copytree(R/p,r/p,dirs_exist_ok=True)
            # Archive content and immutable baseline are read-only symlinks in this temporary test view;
            # final package independently rejects all symlinks.
            (r/'baseline').symlink_to(R/'baseline',target_is_directory=True)
            f=r/rel;x=json.loads(f.read_text());change(x);f.write_text(json.dumps(x))
            with self.assertRaisesRegex(ValueError,code):m.check(r)
if __name__=='__main__':unittest.main(verbosity=2)
