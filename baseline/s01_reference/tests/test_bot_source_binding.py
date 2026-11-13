"""Source recovery and negative cases against the actual original 1.2.1 archive."""
from pathlib import Path
import hashlib,json,shutil,subprocess,sys,tempfile,unittest
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from recover_bot_source import (read_original_sources,pack_sources,split_verified,verify_segments,recover,RecoveryError,PAYLOAD_SHA256,EXPECTED_NAMES)
ARCHIVE=ROOT/'baseline/original_engine121_source.zip'
SOURCE=ROOT/'baseline/vercel_recovered/src'
PROOF=ROOT/'evidence/S01/S01_ENGINE121_PRODUCTION_BINDING.json'

class ProductionSourceBinding(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sources,cls.archive_records=read_original_sources(ARCHIVE)
        cls.proof=json.loads(PROOF.read_text())
    def disposable_segments(self,tmp):
        root=Path(tmp)/'segments';root.mkdir()
        for i in range(3):shutil.copy2(SOURCE/f'bot-src.{i}',root/f'bot-src.{i}')
        return root
    def test_original_archive_manifest_and_exact_twelve_inputs(self):
        self.assertEqual(len(self.archive_records),30)
        self.assertEqual(set(self.sources),EXPECTED_NAMES)
        self.assertIn('<Version>1.2.1</Version>',self.sources['ExtremeLabMobile.csproj'])
        self.assertIn('<TargetFramework>net6.0</TargetFramework>',self.sources['ExtremeLabMobile.csproj'])
        self.assertIn('Version="1.0.21"',self.sources['ExtremeLabMobile.csproj'])
    def test_repack_exactly_matches_three_preserved_provider_segments(self):
        packed=pack_sources(self.sources)
        self.assertEqual(hashlib.sha256(packed).hexdigest(),PAYLOAD_SHA256)
        self.assertEqual(len(packed),31406)
        for i,data in enumerate(split_verified(packed)):
            self.assertEqual(data,(SOURCE/f'bot-src.{i}').read_bytes())
    def test_independent_node_decoder_matches_every_original_file(self):
        run=subprocess.run(['node',str(ROOT/'tools/check_bot_source_node.mjs'),str(SOURCE),str(PROOF)],capture_output=True,text=True,timeout=10)
        self.assertEqual(run.returncode,0,run.stderr)
        result=json.loads(run.stdout);self.assertEqual(result['decoded_files'],12)
        self.assertTrue(result['archive_sources_byte_equal']);self.assertFalse(result['binary_build'])
    def test_changed_csharp_source_is_not_promoted(self):
        changed=dict(self.sources);changed['ExtremeLabCore.cs']+='\n// synthetic mutation\n'
        with self.assertRaisesRegex(RecoveryError,'BOT_SOURCE_HASH_MISMATCH'):pack_sources(changed)
    def test_missing_source_is_not_silently_accepted(self):
        changed=dict(self.sources);del changed['ExtremeLabCore.cs']
        with self.assertRaisesRegex(RecoveryError,'UNEXPECTED_SOURCE_SET'):pack_sources(changed)
    def test_additional_source_is_not_silently_accepted(self):
        changed=dict(self.sources);changed['Unexpected.cs']=''
        with self.assertRaisesRegex(RecoveryError,'UNEXPECTED_SOURCE_SET'):pack_sources(changed)
    def test_non_text_source_rejected(self):
        changed=dict(self.sources);changed['ExtremeLabCore.cs']=None
        with self.assertRaisesRegex(RecoveryError,'NON_TEXT_SOURCE'):pack_sources(changed)
    def test_modified_archive_rejected_before_output_creation(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp=Path(tmp);bad=tmp/'bad.zip';b=ARCHIVE.read_bytes();bad.write_bytes(b[:-1]+bytes([b[-1]^1]))
            destination=tmp/'destination'
            with self.assertRaisesRegex(RecoveryError,'ORIGINAL_ARCHIVE_HASH_MISMATCH'):recover(bad,destination)
            self.assertFalse(destination.exists())
    def test_segment_swap_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            d=self.disposable_segments(tmp);a=(d/'bot-src.0').read_bytes();b=(d/'bot-src.1').read_bytes()
            (d/'bot-src.0').write_bytes(b);(d/'bot-src.1').write_bytes(a)
            with self.assertRaisesRegex(RecoveryError,'BOT_SOURCE_HASH_MISMATCH'):verify_segments(d,self.sources)
    def test_truncated_segment_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            d=self.disposable_segments(tmp);p=d/'bot-src.2';p.write_bytes(p.read_bytes()[:-1])
            with self.assertRaisesRegex(RecoveryError,'BOT_SOURCE_HASH_MISMATCH'):verify_segments(d,self.sources)
    def test_additional_segment_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            d=self.disposable_segments(tmp);(d/'bot-src.3').write_bytes(b'')
            with self.assertRaisesRegex(RecoveryError,'SEGMENT_FILE_SET_MISMATCH'):verify_segments(d,self.sources)
    def test_segment_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            d=self.disposable_segments(tmp);p=d/'bot-src.1';p.unlink();p.symlink_to(SOURCE/'bot-src.1')
            with self.assertRaisesRegex(RecoveryError,'SEGMENT_NOT_REGULAR'):verify_segments(d,self.sources)
    def test_recovery_never_overwrites_existing_destination(self):
        with tempfile.TemporaryDirectory() as tmp:
            d=Path(tmp)/'output';d.mkdir();(d/'keep').write_text('original')
            with self.assertRaises(FileExistsError):recover(ARCHIVE,d)
            self.assertEqual([p.name for p in d.iterdir()],['keep']);self.assertEqual((d/'keep').read_text(),'original')
    def test_clean_recovery_and_existing_sources_do_not_change(self):
        before=hashlib.sha256(ARCHIVE.read_bytes()).hexdigest()
        with tempfile.TemporaryDirectory() as tmp:
            d=Path(tmp)/'output';proof=recover(ARCHIVE,d)
            self.assertEqual(proof['files'],self.proof['files']);self.assertEqual(proof['segments'],self.proof['segments'])
            self.assertFalse(proof['engine19_recovered']);self.assertFalse(proof['bot_executed'])
        self.assertEqual(hashlib.sha256(ARCHIVE.read_bytes()).hexdigest(),before)
    def test_node_decoder_rejects_changed_segment(self):
        with tempfile.TemporaryDirectory() as tmp:
            d=self.disposable_segments(tmp);p=d/'bot-src.0';b=p.read_bytes();p.write_bytes(bytes([b[0]^1])+b[1:])
            run=subprocess.run(['node',str(ROOT/'tools/check_bot_source_node.mjs'),str(d),str(PROOF)],capture_output=True,text=True,timeout=10)
            self.assertNotEqual(run.returncode,0);self.assertIn('SEGMENT_MISMATCH',run.stderr)
    def test_current_artifacts_agree_and_do_not_promote_native_capability(self):
        manifest=json.loads((ROOT/'vendor-manifests/S01_VERIFIED_RECOVERED_PRODUCTION_SOURCES.json').read_text())
        lock=json.loads((ROOT/'evidence/S01/baseline-lock.json').read_text())
        self.assertEqual(manifest['source_recovered'],36);self.assertEqual(manifest['source_blocked'],23)
        self.assertEqual(lock['source_tree_prod_v5']['full_bytes_preserved_locally'],36)
        self.assertEqual(len(lock['source_tree_prod_v5']['missing_paths']),23)
        self.assertFalse(lock['release_authorized']);self.assertFalse(lock['source_tree_prod_v5']['engine19_recovered'])
    def test_actual_build_graph_includes_nested_bot15_and_missing_overlay(self):
        d=json.loads((ROOT/'evidence/S01/S01_BUILD_BOUNDARY_CURRENT.json').read_text())
        self.assertEqual(len(d['top_level_stages']),8)
        self.assertTrue(any(x['path']=='build-bot15.mjs' and not x['complete_source_present'] for x in d['nested_imports']))
        self.assertEqual(d['first_stage_attempt']['expected_missing_input'],'live-overlay.b64')
        self.assertNotEqual(d['first_stage_attempt']['exit_code'],0);self.assertFalse(d['full_pipeline_successful'])
    def test_receiver_evidence_is_historical_fixture_not_new_csharp_build(self):
        d=json.loads((ROOT/'evidence/S01/S01_ORIGINAL_WIRE_REPLAY_CURRENT.json').read_text())
        self.assertEqual(d['fixture_sha256'],'cebbfb3691a7055aa2fbe6d1c81635d7557b59df87b1cf88b98c9d7dfe1f391f')
        self.assertEqual(d['result']['passed'],18);self.assertEqual(d['result']['failed'],0)
        self.assertFalse(d['fixture_newly_generated_by_csharp']);self.assertFalse(d['native_csharp_tests_executed'])
        self.assertTrue(all(x['host'] in ('127.0.0.1','::1') and x['port']==25345 for x in d['observed_test_endpoints']))
if __name__=='__main__':unittest.main(verbosity=2)
