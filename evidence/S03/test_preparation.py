"""Documentation/provenance tests only; no browser, native, broker or financial tests."""
from pathlib import Path
import copy
import json
import os
import shutil
import subprocess
import tempfile
import unittest
import check_preparation as cp

ROOT=Path(__file__).resolve().parents[2]
class DocumentationChecks(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='extremelab-s03-docs-')
        self.docs=Path(self.tmp.name)
        shutil.copytree(ROOT/'evidence/S03',self.docs/'evidence/S03')
        shutil.copytree(ROOT/'docs/ui',self.docs/'docs/ui')
    def tearDown(self): self.tmp.cleanup()
    def edit(self,name,fn):
        p=self.docs/name; v=json.loads(p.read_text()); fn(v);p.write_text(json.dumps(v,ensure_ascii=False))
    def reject(self,code):
        with self.assertRaisesRegex(ValueError,code): cp.check(ROOT,self.docs)
    def test_actual_sources_and_all_document_bindings(self):
        result=cp.check(ROOT,self.docs)
        self.assertEqual(result['original_files_unchanged'],600)
        self.assertEqual(result['display_action_bindings'],44)
        self.assertEqual(result['product_tests_executed'],0)
    def test_reference_hash_mismatch_rejected(self):
        self.edit('evidence/S03/design-baseline.json',lambda v:v['references'][0].update(sha256='0'*64));self.reject('REFERENCE_HASH')
    def test_old_reference_cannot_replace_approved_one(self):
        self.edit('evidence/S03/design-baseline.json',lambda v:v['references'][0].update(id='A01-r03'));self.reject('REFERENCE_SET')
    def test_image_size_not_assumed_viewport(self):
        self.edit('evidence/S03/design-baseline.json',lambda v:v['references'][0].update(css_viewport={'width':1586,'height':992}));self.reject('FAKE_VIEWPORT')
    def test_recorded_dimensions_match_actual_png(self):
        self.edit('evidence/S03/design-baseline.json',lambda v:v['references'][1].update(width_px=1586));self.reject('REFERENCE_DIMENSION')
    def test_fifth_navigation_entry_rejected(self):
        self.edit('evidence/S03/design-baseline.json',lambda v:v['navigation']['main'].append('Strategien'));self.reject('NAVIGATION')
    def test_duplicate_setup_card_rejected(self):
        self.edit('evidence/S03/screen-state-matrix.json',lambda v:v['screens'][1].update(setup_instances=1));self.reject('SETUP_DUPLICATE')
    def test_silent_missing_metric_binding_rejected(self):
        self.edit('evidence/S03/data-bindings.json',lambda v:v['bindings'].pop());self.reject('BINDING_COVERAGE')
    def test_unknown_source_cannot_support_metric(self):
        self.edit('evidence/S03/data-bindings.json',lambda v:v['bindings'][0].update(source_ids=['invented']));self.reject('UNBOUND_SOURCE')
    def test_open_contract_must_name_real_gap(self):
        self.edit('evidence/S03/data-bindings.json',lambda v:next(x for x in v['bindings'] if x['id']=='jobs').update(open_contract=None));self.reject('EMPTY_OPEN_CONTRACT')
    def test_research_cannot_gain_broker_authority(self):
        self.edit('evidence/S03/data-bindings.json',lambda v:next(x for x in v['bindings'] if x['id']=='new_trial').update(authority='broker.execute'));self.reject('IMPLICIT_AUTHORITY')
    def test_display_cannot_claim_native_effect(self):
        self.edit('evidence/S03/data-bindings.json',lambda v:next(x for x in v['bindings'] if x['id']=='current_protection').update(optimistic_financial_success_allowed=True));self.reject('FALSE_EFFECT')
    def test_mobile_acceptance_not_inherited_from_images(self):
        self.edit('evidence/S03/design-baseline.json',lambda v:v['limits'].update(mobile_verified=True));self.reject('FALSE_RUNTIME_ACCEPTANCE')
    def test_dux_pass_cannot_be_prefilled(self):
        self.edit('evidence/S03/screen-state-matrix.json',lambda v:v['test_cases'][0].update(status='PASS'));self.reject('PRODUCT_CASES_CHANGED')
    def test_exit_transition_must_not_disappear(self):
        self.edit('evidence/S03/screen-state-matrix.json',lambda v:v['transition_checks'].pop());self.reject('TRANSITIONS_CHANGED')
    def test_import_action_is_not_invented_journal_route(self):
        self.edit('docs/ui/navigation/route-compatibility.json',lambda v:next(x for x in v['routes'] if x['id']=='journal').update(source_url='/journal'));self.reject('INVENTED_ROUTE')
    def test_false_formal_completion_rejected(self):
        self.edit('evidence/S03/work-status.json',lambda v:v.update(official_status='passed'));self.reject('FALSE_FORMAL_COMPLETION')
    def test_completion_file_is_not_created_by_preparation(self):
        (self.docs/'evidence/S03/completion.json').write_text('{}');self.reject('UNAUTHORIZED_COMPLETION')
    def test_original_git_source_binding_cannot_be_rebound(self):
        self.edit('evidence/S03/source-bindings.json',lambda v:v['sources']['approval'].update(sha256='f'*64));self.reject('SOURCE_BINDING')
    def test_source_path_traversal_rejected(self):
        self.edit('evidence/S03/source-bindings.json',lambda v:v['sources']['approval'].update(path='../approval.json'));self.reject('UNSAFE_PATH')
    def test_real_controller_still_blocks_unfinished_dependencies(self):
        # Use the existing controller in an isolated new checkout; never modify the project state.
        clone=self.docs/'temporary-project'
        cp.git(ROOT,'clone','--no-hardlinks','--no-local',str(ROOT),str(clone))
        # Local file transport only; no remote network endpoint. Remove temporary origin immediately.
        cp.git(clone,'remote','remove','origin')
        ctl=clone/'governance/masterplan/control/planctl.py'
        state=clone/'governance/masterplan/control/state.json'; before=state.read_bytes()
        import sys
        result=subprocess.run([sys.executable,'-B',str(ctl),'--project-root',str(clone),'start','S03','--actor','offline-document-test'],capture_output=True,text=True,timeout=20)
        self.assertNotEqual(result.returncode,0)
        self.assertIn('S02',result.stdout+result.stderr)
        self.assertEqual(state.read_bytes(),before)


    def field_edit(self,fn):self.edit('evidence/S03/field-contracts.json',fn)
    def example_edit(self,id,fn):self.edit('evidence/S03/source-examples.json',lambda v:fn(next(x for x in v['cases'] if x['id']==id)))
    def test_exact_source_excerpt_must_not_change(self):
        self.field_edit(lambda v:v['contracts'][0]['anchors'][0].update(excerpt_sha256='0'*64));self.reject('ANCHOR_CHANGED')
    def test_invented_free_margin_cannot_be_added_coherently(self):
        def change(v):
            c=next(x for x in v['contracts'] if x['id']=='observer');c['fields'].append('observation.account.freeMargin')
            next(x for x in v['components'] if x['binding_id']=='free_margin')['field_paths'].append('observation.account.freeMargin')
        self.field_edit(change);self.reject('FREE_MARGIN_INVENTED')
    def test_projection_cannot_be_promoted_to_complete_timeline(self):
        self.edit('evidence/S03/data-bindings.json',lambda v:next(x for x in v['bindings'] if x['id']=='recent_decisions').update(binding_status='source_contract_identified_not_integrated',open_contract=None))
        self.field_edit(lambda v:next(x for x in v['components'] if x['binding_id']=='recent_decisions').update(mapping_level='existing_source_fields',target_contract_open=False,missing_contract=None));self.reject('PROJECTED_HISTORY_PROMOTED')
    def test_read_contract_cannot_be_relabelled_trade_route(self):
        self.field_edit(lambda v:v['contracts'][0].update(method='POST',route='/api/orders'));self.reject('CONTRACT_ROUTE')
    def test_confirm_and_proposal_stage_cannot_be_swapped(self):
        self.field_edit(lambda v:next(x for x in v['components'] if x['binding_id']=='confirm_changes').update(contract_id='proposal_create',field_paths=['proposal.status']));self.reject('ACTION_STAGE_CONFLATION')
    def test_compound_states_cannot_be_silently_omitted(self):
        self.edit('evidence/S03/screen-state-matrix.json',lambda v:v['compound_state_requirements'].pop());self.reject('COMPOUND_STATE_COVERAGE')
    def test_fresh_cannot_mean_complete_in_source_example(self):
        self.example_edit('fresh_partial',lambda v:v.update(status='reports_available',current_pair=True));self.reject('FRESH_COMPLETE_CONFLATED')
    def test_fresh_feed_cannot_erase_old_row(self):
        self.example_edit('fresh_feed_stale_row',lambda v:v.update(row_fresh=True));self.reject('ROW_FRESHNESS_CONFLATED')
    def test_zero_loaded_positions_cannot_be_flat_proof(self):
        self.example_edit('empty_observer_historical_report',lambda v:v.update(flat_confirmed=True));self.reject('EMPTY_FLAT_CONFLATED')
    def test_agreement_cannot_be_native_protection_proof(self):
        self.example_edit('reported_agreement',lambda v:v.update(native_protection_confirmed=True));self.reject('REPORT_CONFIRMED_PROTECTION')
    def test_large_id_and_decimal_example_cannot_be_rounded(self):
        self.example_edit('reported_agreement',lambda v:v.update(position_id=9007199254740992,entry=1.1));self.reject('NATIVE_ID_OR_PRICE_ROUNDED')
    def test_original_plan_requires_resolved_plan_state(self):
        self.field_edit(lambda v:next(x for x in v['components'] if x['binding_id']=='original_plan').update(contract_id='journal_projection',field_paths=['plans[].plan']));self.reject('PLAN_IDENTITY_LOST')

if __name__=='__main__':unittest.main(verbosity=2)
