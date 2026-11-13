"""Original-stage tests; negative characterizations are not product fixes."""
from pathlib import Path
import json,shutil,sys,tempfile,unittest,zipfile
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from addon_build_audit import SOURCE,DONOR,ARCHIVE_ROOT,EXPECTED,pinned_inputs,prepare,run_node,sha,tree,observe_skin_writers,audit

class AddonBuildAudit(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='s01-build-test-')
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.work=self.root/'stage'
        prepare(self.work)

    def build(self):
        p=run_node(['build-account-addon.mjs'],self.work)
        self.assertEqual(p.returncode,0,p.stderr)
        return p

    def test_real_build_matches_all_six_donor_and_bundle_sources(self):
        bindings=pinned_inputs();self.build()
        with zipfile.ZipFile(DONOR) as z:
            for name in EXPECTED:
                data=(self.work/name).read_bytes()
                self.assertEqual(data,z.read(ARCHIVE_ROOT+name),name)
                self.assertEqual(sha(data),bindings['generated'][name]['sha256'])
                self.assertEqual(data,(ROOT/'baseline/derived_account_stage'/name).read_bytes())

    def test_real_generated_entrypoint_resolves_without_module_stubs(self):
        self.build()
        p=run_node(['--input-type=module','-e',"const a=await import('./api/account-live.js');const b=await import('./lib/account-handler.mjs');const c=await import('./lib/ctrader-readonly.mjs');if(a.default!==b.default||a.createHandler!==b.createHandler||typeof c.readSnapshot!=='function')throw Error('BAD_LINKAGE');console.log('NATIVE_ESM_LINKAGE_OK');"],self.work)
        self.assertEqual(p.returncode,0,p.stderr)
        self.assertIn('NATIVE_ESM_LINKAGE_OK',p.stdout)

    def test_corrupt_bundle_fails_before_any_file_is_changed(self):
        p=self.work/'account-addon.br';data=p.read_bytes();p.write_bytes(bytes([data[0]^1])+data[1:])
        before=tree(self.work)
        res=run_node(['build-account-addon.mjs'],self.work)
        self.assertNotEqual(res.returncode,0)
        self.assertIn('ACCOUNT_ADDON_INTEGRITY',res.stderr)
        self.assertEqual(tree(self.work),before)

    def test_missing_index_leaves_six_generated_files_despite_failure(self):
        # Characterizes a known nontransactional build boundary; does not assert safety.
        (self.work/'public/index.html').unlink()
        res=run_node(['build-account-addon.mjs'],self.work)
        self.assertNotEqual(res.returncode,0)
        self.assertIn('ENOENT',res.stderr)
        expected=pinned_inputs()['generated']
        for name in EXPECTED:self.assertEqual(sha((self.work/name).read_bytes()),expected[name]['sha256'])
        self.assertFalse((self.work/'public/index.html').exists())

    def test_mid_write_failure_preserves_earlier_partial_output(self):
        # Synthetic filesystem obstruction, not a product-code substitution.
        (self.work/'lib/account-handler.mjs').mkdir()
        res=run_node(['build-account-addon.mjs'],self.work)
        self.assertNotEqual(res.returncode,0)
        self.assertIn('EISDIR',res.stderr)
        self.assertEqual(sha((self.work/'lib/ctrader-readonly.mjs').read_bytes()),pinned_inputs()['generated']['lib/ctrader-readonly.mjs']['sha256'])
        self.assertFalse((self.work/'public/konto-live.html').exists())

    def test_replaying_earlier_stage_removes_later_view_link_until_view_replay(self):
        self.build()
        p=run_node(['build-revolution20.mjs'],self.work)
        self.assertEqual(p.returncode,0,p.stderr)
        complete=tree(self.work)
        for name in ('index.html','konto-live.html'):
            self.assertEqual((self.work/'public'/name).read_text().count('id="th3rev20-link"'),1)
        self.build()
        self.assertEqual((self.work/'public/konto-live.html').read_text().count('id="th3rev20-link"'),0)
        self.assertEqual((self.work/'public/index.html').read_text().count('id="th3rev20-link"'),1)
        p=run_node(['build-revolution20.mjs'],self.work)
        self.assertEqual(p.returncode,0,p.stderr)
        self.assertEqual(tree(self.work),complete)

    def test_partial_skin_source_does_not_certify_final_reader_or_final_page(self):
        p=observe_skin_writers()
        self.assertEqual(p['overwrites_of_addon_members'],['lib/ctrader-readonly.mjs','public/konto-live.html'])
        self.assertEqual(len(p['observed_bundle_members']),8)
        self.assertFalse(p['full_skin_stage_executed'])
        self.assertFalse(p['final_deployment_reader_verified'])
        self.assertFalse((SOURCE/'build-ui.mjs').exists())
        for i in range(9):self.assertFalse((SOURCE/f'skin.{i}').exists())

    def test_generated_files_do_not_inflate_original_input_recovery(self):
        bound=pinned_inputs()
        self.assertEqual((bound['full_provider_input_count'],bound['missing_provider_input_count'],bound['provider_total']),(36,23,59))
        self.assertEqual(len(EXPECTED),6)
        for name in EXPECTED:self.assertFalse((SOURCE/name).exists(),name)
        proof=json.loads((ROOT/'evidence/S01/S01_ADDON_GENERATED_SOURCES.json').read_text())
        self.assertEqual(proof['classification'],'verified_intermediate_stage_outputs_not_final_deployment_sources')
        self.assertFalse(proof['full_website_build'])
        self.assertEqual({x['path'] for x in proof['outputs']},set(EXPECTED))

    def test_export_refuses_existing_directory_without_changing_it(self):
        export=self.root/'existing';export.mkdir();(export/'keep.txt').write_text('previous work')
        before=tree(export)
        with self.assertRaisesRegex(ValueError,'REFUSE_OVERWRITE_EXPORT'):
            audit(self.root/'logs',export)
        self.assertEqual(tree(export),before)

if __name__=='__main__':unittest.main()
