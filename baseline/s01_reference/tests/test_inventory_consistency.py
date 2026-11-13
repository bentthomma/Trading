"""Exercise real inventory/byte mismatches, not simulated source recovery."""
from __future__ import annotations
import base64
from contextlib import contextmanager
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
import zipfile
import brotli

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from check_inventory_consistency import audit, legacy_disagreements, digest, CAT, CURRENT


def load(root: Path,rel: str):return json.loads((root/rel).read_text())
def save(root: Path,rel: str,value): (root/rel).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')


def rebind(root: Path) -> None:
    """A negative case can have self-consistent metadata and still be false.
    Recompute only mutable local references, never provider IDs or gate hashes.
    """
    cur=load(root,CURRENT);cur['catalog_sha256']=digest((root/CAT).read_bytes());save(root,CURRENT,cur)
    ref={'path':CURRENT,'sha256':digest((root/CURRENT).read_bytes())}
    for name in ['baseline-lock.json','path-map.json','donor-map.json','reproduction-report.json','S01_CAPABILITY_MATRIX.json']:
        rel='evidence/S01/'+name;d=load(root,rel);d['current_inventory']=ref;save(root,rel,d)


class InventoryConsistency(unittest.TestCase):
    @contextmanager
    def copy(self):
        with tempfile.TemporaryDirectory(prefix='s01-inventory-case-') as td:
            p=Path(td)/'package';shutil.copytree(ROOT,p,ignore=shutil.ignore_patterns('__pycache__'))
            yield p

    def rejects(self,p:Path,code:str):
        r=audit(p);self.assertFalse(r['consistent']);self.assertIn(code,{x['code'] for x in r['errors']},r['errors'])

    def test_current_59_sources_and_predecessor_reconstruction(self):
        r=audit(ROOT);self.assertTrue(r['consistent'],r['errors'])
        self.assertEqual(r['counts'],{'source_total':59,'complete_original_inputs':38,'prefix_only_inputs':5,'metadata_only_inputs':16,'unavailable_full_inputs':21})
        self.assertEqual(r['reconstructed_predecessor_files'],320);self.assertFalse(r['formal_acceptance'])

    def test_original_operative_contradictions_reproduced(self):
        old=legacy_disagreements(ROOT/'baseline/inventory_checkpoint')
        self.assertEqual(len(old),8)
        self.assertIn('CURRENT_REASON_STALE',{x['code'] for x in old})
        self.assertIn('CURRENT_CROSSWALK_STALE',{x['code'] for x in old})
        self.assertEqual(legacy_disagreements(ROOT),[])

    def test_stale_reproduction_counts_are_rejected(self):
        with self.copy() as p:
            rel='evidence/S01/reproduction-report.json';d=load(p,rel);d['website_full_build']['source_files_recovered_current']=36;save(p,rel,d)
            self.rejects(p,'CURRENT_COUNT_MISMATCH')

    def test_stale_donor_narrative_is_rejected(self):
        with self.copy() as p:
            rel='evidence/S01/donor-map.json';d=load(p,rel)
            next(x for x in d['entries'] if x['component']=='Production website (Vercel source input tree)')['current_proof']='36/59 sources complete'
            save(p,rel,d);self.rejects(p,'CURRENT_DONOR_PROOF_STALE')

    def test_consistently_rebound_prefix_as_complete_is_rejected(self):
        with self.copy() as p:
            d=load(p,CAT);x=next(x for x in d['sources'] if x['path']=='src/lib/relay.mjs')
            b=b'// only a truncated prefix, never a full original\n';target=p/'baseline/vercel_recovered'/x['path'];target.write_bytes(b)
            x.update(status='byte_recovered',bytes_present=True,source_classification='complete',classification='verified_source_not_integration_approved',bytes=len(b),sha256=digest(b))
            save(p,CAT,d);rebind(p);self.rejects(p,'SOURCE_UID_MISMATCH')

    def test_private_proposal_cannot_replace_original_with_rebound_local_hash(self):
        with self.copy() as p:
            b=(p/'proposals/live-encoding/src/api/live.js').read_bytes();(p/'baseline/vercel_recovered/src/api/live.js').write_bytes(b)
            d=load(p,CAT);x=next(x for x in d['sources'] if x['path']=='src/api/live.js');x['sha256']=digest(b);x['bytes']=len(b);save(p,CAT,d);rebind(p)
            self.rejects(p,'SOURCE_UID_MISMATCH')

    def test_extra_original_file_is_rejected(self):
        with self.copy() as p:
            (p/'baseline/vercel_recovered/src/guessed.mjs').write_text('// not a provider source')
            self.rejects(p,'ORIGINAL_FILE_SET_MISMATCH')

    def test_missing_input_placeholder_rejected_without_incrementing_count(self):
        with self.copy() as p:
            (p/'baseline/vercel_recovered/src/live-overlay.b64').write_bytes(b'')
            self.rejects(p,'MISSING_SOURCE_HAS_PLACEHOLDER')

    def test_duplicate_catalog_path_rejected(self):
        with self.copy() as p:
            d=load(p,CAT);d['sources'][1]=d['sources'][0].copy();save(p,CAT,d);rebind(p)
            self.rejects(p,'SOURCE_UNIVERSE_MISMATCH')

    def test_prefix_metadata_distinction_is_checked(self):
        with self.copy() as p:
            d=load(p,CAT);next(x for x in d['sources'] if x['path']=='src/lib/relay.mjs')['source_classification']='missing_bytes_metadata_only';save(p,CAT,d);rebind(p)
            self.rejects(p,'PREFIX_OR_METADATA_MISCLASSIFIED')

    def test_intermediate_reader_cannot_be_promoted(self):
        with self.copy() as p:
            rel='evidence/S01/path-map.json';d=load(p,rel);d['generated_intermediate_outputs'][0]['final_deployment_identity_verified']=True;save(p,rel,d)
            self.rejects(p,'INTERMEDIATE_AS_FINAL')

    def test_full_build_cannot_be_inferred_from_inventory(self):
        with self.copy() as p:
            rel='evidence/S01/reproduction-report.json';d=load(p,rel);d['website_full_build']['build_executed']=True;save(p,rel,d)
            self.rejects(p,'FULL_BUILD_OVERCLAIM')

    def test_historical_test_total_cannot_be_relabelled_current(self):
        with self.copy() as p:
            rel='evidence/S01/reproduction-report.json';d=load(p,rel);d['historical_execution_fields'].remove('full_runtime');save(p,rel,d)
            self.rejects(p,'HISTORICAL_TESTS_RELABELLED')

    def test_unbundled_historical_archive_cannot_be_claimed_complete(self):
        with self.copy() as p:
            d=load(p,CURRENT);next(x for x in d['source_archive_availability'] if x['id']=='hub080')['availability']='complete_archive_bundled';save(p,CURRENT,d);rebind(p)
            self.rejects(p,'ABSENT_ARCHIVE_AS_COMPLETE')

    def test_formal_gate_is_not_rewritten_to_repair_historical_counts(self):
        with self.copy() as p:
            rel='evidence/S01/GATE_STATUS.json';d=load(p,rel);d['inventory_candidate']='38_of_59_now';save(p,rel,d)
            self.rejects(p,'GATE_CHECKPOINT_CHANGED')

    def test_current_index_cannot_grant_acceptance(self):
        with self.copy() as p:
            d=load(p,CURRENT);d['formal_acceptance']=True;save(p,CURRENT,d);rebind(p)
            self.rejects(p,'GATE_OR_CAPABILITY_OVERCLAIM')

    def test_replaced_source_symlink_rejected_even_if_target_bytes_match(self):
        with self.copy() as p:
            target=p/'baseline/vercel_recovered/src/api/live.js';b=target.read_bytes();external=p.parent/'same-bytes.js';external.write_bytes(b);target.unlink();target.symlink_to(external)
            self.rejects(p,'SOURCE_READ_ERROR')

    def test_catalog_traversal_is_rejected(self):
        with self.copy() as p:
            d=load(p,CAT);d['sources'][0]['path']='../../outside';save(p,CAT,d);rebind(p)
            self.rejects(p,'SOURCE_UNIVERSE_MISMATCH')

    def test_alias_cannot_be_silently_retargeted(self):
        with self.copy() as p:
            rel='evidence/S01/S01_INVENTORY_SOURCE_ACCESS.json';d=load(p,rel);d['production_alias']['deployment_id']='dpl_NOT_THE_BOUND_SOURCE';save(p,rel,d)
            self.rejects(p,'ALIAS_BINDING_MISMATCH')

    def test_original_dashboard_payload_is_not_production_skin(self):
        d=load(ROOT,'evidence/S01/S01_DASHBOARD_SOURCE_DIFFERENTIATION.json')
        archive=ROOT/d['archive_path'];self.assertEqual(digest(archive.read_bytes()),d['archive_sha256'])
        with zipfile.ZipFile(archive) as z:
            m=json.loads(z.read('Dashboard/bundle-manifest.json'));parts=[]
            for c in m['chunks']:
                raw=z.read('Dashboard/'+c['file']);self.assertEqual(hashlib.sha1(raw).hexdigest(),c['sha']);parts.append(raw)
            packed=b''.join(parts);self.assertEqual(digest(packed),m['sourceSha256']);self.assertNotEqual(digest(packed),d['production_skin_expected_sha256'])
            out=json.loads(brotli.decompress(packed));self.assertEqual(len(out),6)
            ids={x['source_uid_sha1'] for x in load(ROOT,CAT)['sources']}
            for name,text in out.items():
                self.assertEqual(digest(text.encode()),m['sourceHashes'][name]);self.assertNotIn(hashlib.sha1(text.encode()).hexdigest(),ids)
        self.assertFalse(d['builder_executed']);self.assertEqual(d['missing_production_inputs_recovered'],0)

if __name__=='__main__':unittest.main(verbosity=2)
