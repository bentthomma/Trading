"""Five source/schema methods. None compiles or executes C#."""
import copy, importlib.util, json, os, tempfile, unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('s06_static_audit',HERE/'audit_sources.py')
M=importlib.util.module_from_spec(spec);spec.loader.exec_module(M)
ORIGINAL=Path(os.environ['S06_ORIGINAL_PLATFORM'])
class SourceBinding(unittest.TestCase):
    def test_all_bound_originals_and_four_native_js_field_lists_match(self):
        r=M.audit(ORIGINAL)
        self.assertEqual(len(r['journal_wire_types']),4)
        self.assertEqual(r['field_mapping_rows'],28)
        self.assertFalse(r['native_broker_evidence'])
        self.assertEqual(r['CSharp_compilations'],0)
    def test_native_amount_and_wire_summary_are_not_S02_deals(self):
        r=M.audit(ORIGINAL)
        self.assertNotIn('Price',r['native_deal_fields'])
        self.assertNotIn('Commission',r['native_deal_fields'])
        self.assertNotIn('dealId',r['journal_wire_types']['order.reported']['fields'])
        self.assertIn('commission',r['S02_deal_required_fields'])
        self.assertIn('model',r['S02_account_required_fields'])
        self.assertNotIn('Model',r['journal_account_fields'])
    def test_preserved_runtime_sources_have_no_named_order_writer_callers(self):
        r=M.runtime_scan(ORIGINAL)
        self.assertEqual(r['module_mentions'],[])
        self.assertEqual(r['external_named_calls'],[])
        self.assertEqual(r['count'],92)
    def test_changed_or_linked_exact_source_is_not_accepted(self):
        b=M.jload(HERE/'source-bindings.json')['original_modules'][0]
        raw=(ORIGINAL/b['path']).read_bytes()
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);path=root/b['path'];path.parent.mkdir(parents=True);path.write_bytes(raw)
            self.assertEqual(M.source_bytes(root,b),raw)
            path.write_bytes(raw+b'\n')
            with self.assertRaisesRegex(ValueError,'SOURCE_CHANGED'):M.source_bytes(root,b)
            path.unlink();other=root/'bytes.mjs';other.write_bytes(raw);path.symlink_to(other)
            with self.assertRaisesRegex(ValueError,'SOURCE_SYMLINK'):M.source_bytes(root,b)
    def test_S02_does_not_accept_missing_or_unknown_commission_as_zero(self):
        import jsonschema
        schema=M.jload(M.ROOT/'contracts/domain/v1/schema.json')
        event_schema={'$ref':'#/$defs/Deal','$defs':schema['$defs']}
        validator=jsonschema.Draft202012Validator(event_schema)
        events=M.jload(M.ROOT/'contracts/domain/v1/golden-events.json')
        if isinstance(events,dict):
            events=events.get('events',events.get('vectors',events))
        # Locate by structure, not a guessed historical array offset.
        def candidates(v):
            if isinstance(v,dict):
                if {'deal_id','broker_order_id','commission','execution_time'}<=set(v):yield v
                for x in v.values():yield from candidates(x)
            elif isinstance(v,list):
                for x in v:yield from candidates(x)
        deal=next(candidates(events));validator.validate(deal)
        missing=copy.deepcopy(deal);missing.pop('commission')
        self.assertTrue(list(validator.iter_errors(missing)))
        unknown=copy.deepcopy(deal);unknown['commission']=None
        self.assertTrue(list(validator.iter_errors(unknown)))
if __name__=='__main__':unittest.main()
