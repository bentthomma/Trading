"""Tests execute the existing controller; no fake native pass or step completion."""
from pathlib import Path
import copy, hashlib, importlib.util, json, os, shutil, subprocess, sys, tempfile, unittest, zipfile
from unittest.mock import patch
import path_resolution as paths
ROOT = paths.ROOT
spec=importlib.util.spec_from_file_location('actual_plan_controller',ROOT/'governance/masterplan/control/planctl.py')
ctl=importlib.util.module_from_spec(spec);spec.loader.exec_module(ctl)

class Paths(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.docs=paths.make();cls.candidate=paths.candidate_plan(documents=cls.docs)
        cls.original=json.loads((ROOT/'governance/masterplan/plan.json').read_text())
        cls.original_state=json.loads((ROOT/'governance/masterplan/control/state.json').read_text())

    def test_01_exact_33_steps_and_49_preserved_source_files(self):
        result=paths.validate_documents(documents=self.docs)
        self.assertEqual((result['steps'],result['exact_source_files']),(33,49))
        with zipfile.ZipFile(ROOT/paths.ARCHIVE) as z:
            for r in self.docs['resolution.json']['sources']:
                b=z.read(r['member']);self.assertEqual(hashlib.sha256(b).hexdigest(),r['sha256'])
                self.assertEqual(len(b),r['bytes']);self.assertFalse((ROOT/r['target']).exists())
                self.assertEqual(r['target'],paths.TARGET+r['member'][len(paths.PREFIX):])

    def test_02_only_paths_scope_status_notes_and_version_change(self):
        proposed=copy.deepcopy(self.candidate);old=copy.deepcopy(self.original)
        self.assertEqual(proposed['global_rules'],old['global_rules'])
        proposed['version']=old['version']
        for a,b in zip(proposed['steps'],old['steps']):
            for k in ('allowed_paths','scope_status','path_resolution_note'):a[k]=b[k]
        self.assertEqual(proposed,old)
        self.assertFalse(proposed['global_rules']['required_independent_review'])
        self.assertFalse(proposed['global_rules']['broker_actions_authorized'])
        self.assertFalse(proposed['global_rules']['public_github_writes_authorized'])

    def test_03_original_controller_accepts_every_intended_concrete_scope(self):
        with self.temporary_controller() as c:
            for step in c.plan['steps'][3:]:
                sample=[p[:-2]+'probe.md' if p.endswith('/**') else p for p in step['allowed_paths']]
                self.assertTrue(c.check_scope(step['id'],sample)['scope_valid'])

    def test_04_original_relock_preserves_real_prior_completions_and_native_block(self):
        with self.temporary_controller() as c:
            result=c.relock(paths.OUT+'/AM-003.proposed.json')
            self.assertEqual(result['reset_steps'],self.docs['AM-003.proposed.json']['affected_steps'])
            state=c.state()
            for sid in ('S00','S01','S02'):self.assertEqual(state['steps'][sid],self.original_state['steps'][sid])
            self.assertEqual(c.next()['ready_steps'],[])
            self.assertEqual(c.next()['blocked_scope'],[])
            self.assertEqual(state['steps']['S02']['status'],'blocked')

    def test_05_relock_does_not_allow_S03_start_while_S02_blocked(self):
        with self.temporary_controller() as c:
            c.relock(paths.OUT+'/AM-003.proposed.json')
            before=c.state_path.read_bytes()
            with self.assertRaises(ctl.PlanError):c.start('S03','offline-test-actor')
            self.assertEqual(c.state_path.read_bytes(),before)

    def test_06_incomplete_affected_steps_rejected_without_state_write(self):
        with self.temporary_controller() as c:
            self.replace_amendment(c,lambda x:x['affected_steps'].pop())
            previous=(c.state_path.read_bytes(),c.lock_path.read_bytes())
            with self.assertRaises(ctl.PlanError):c.relock(paths.OUT+'/AM-003.proposed.json')
            self.assertEqual((c.state_path.read_bytes(),c.lock_path.read_bytes()),previous)

    def test_07_wrong_candidate_hash_rejected_without_state_write(self):
        with self.temporary_controller() as c:
            self.replace_amendment(c,lambda x:x.update(new_plan_sha256='0'*64))
            previous=(c.state_path.read_bytes(),c.lock_path.read_bytes())
            with self.assertRaises(ctl.PlanError):c.relock(paths.OUT+'/AM-003.proposed.json')
            self.assertEqual((c.state_path.read_bytes(),c.lock_path.read_bytes()),previous)

    def test_08_design_protection_and_no_hidden_broker_scopes(self):
        with self.temporary_controller() as c:
            for sid,rel in [('S03','product/Trading_Local/public/app.js'),('S21','apps/web/styles/unsafe.css'),('S21','product/Trading_Local/public/app.js'),('S30','product/Trading_Local/core/control.mjs'),('S31','product/Trading_Local/sdk/HubBridge.cs'),('S04','product/Trading_Local/core/store.mjs'),('S04','baseline/evil.cs'),('S04','product/Trading_Local/.env')]:
                with self.subTest(step=sid,path=rel),self.assertRaises(ctl.PlanError):c.check_scope(sid,[rel])
            for s in c.plan['steps']:
                old=next(x for x in self.original['steps'] if x['id']==s['id'])
                self.assertEqual(s.get('entry_checks'),old.get('entry_checks'))
                self.assertEqual(s['forbidden_paths'],old['forbidden_paths'])

    def test_09_independent_write_collision_rejected(self):
        changed=copy.deepcopy(paths.REUSE);changed[('S07','data/catalog/**')]=['core/store.mjs']
        with patch.object(paths,'REUSE',changed),self.assertRaisesRegex(ValueError,'INDEPENDENT_WRITE_OVERLAP'):paths.make()

    def test_10_traversal_and_secrets_never_become_write_targets(self):
        for rel in ['../x','x/../y','/tmp/x','x\\y','x//y','C:/x','x/.env','x/.env.sample','baseline/source.cs','x/credentials.json','x/.git/config','x\nx']:
            with self.subTest(path=rel),self.assertRaises(ValueError):paths.safe_path(rel)
        self.assertEqual(paths.safe_path('docs/ui/baseline/**',glob=True),'docs/ui/baseline/**')

    def test_11_sensitivity_and_unknown_source_changes_rejected(self):
        for name,change in [('resolution.json',lambda x:x['sources'][0].update(sha256='0'*64)),('resolution.json',lambda x:x.update(status='active')),('plan-changes.json',lambda x:x.update(broker_actions_authorized=True)),('plan-changes.json',lambda x:x['steps'][0].update(scope_status='proposed'))]:
            d=copy.deepcopy(self.docs);change(d[name])
            with self.subTest(name=name),self.assertRaisesRegex(ValueError,'DECISION_CHANGED'):paths.validate_documents(documents=d)

    def test_12_original_glob_semantics_match_overlap_results(self):
        for a,b,result in [('core/x/**','core/x',True),('core/x/**','core/xy/a.cs',False),('core/x/**','core/x/y/**',True),('product/a.cs','product/b.cs',False),('product/a.cs','product/a.cs',True)]:
            self.assertEqual(paths.overlaps(a,b),result)
        for pair in self.docs['resolution.json']['scope_overlap_pairs']:
            self.assertTrue(pair['dependency_ordered'])
            for a,b in pair['paths']:
                witness=b[:-2]+'sample.txt' if b.endswith('/**') else b
                witness2=a[:-2]+'sample.txt' if a.endswith('/**') else a
                self.assertTrue(ctl.matches_glob(witness,a)or ctl.matches_glob(witness2,b))

    def test_13_generation_never_overwrites_existing_decision_or_active_plan(self):
        before={p:(ROOT/p).read_bytes()for p in ['governance/masterplan/plan.json','governance/masterplan/control/plan.lock.json','governance/masterplan/control/state.json',paths.OUT+'/resolution.json']}
        with self.assertRaisesRegex(ValueError,'OUTPUT_EXISTS_NO_OVERWRITE'):paths.write()
        self.assertEqual(before,{p:(ROOT/p).read_bytes()for p in before})

    def test_14_symlink_source_read_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            r=Path(td);(r/'source').write_text('real');(r/'alias').symlink_to(r/'source')
            with self.assertRaisesRegex(ValueError,'SYMLINK_SOURCE'):paths.read(r,'alias')

    def test_15_missing_source_cannot_be_declared_recovered(self):
        changed=copy.deepcopy(paths.REUSE);changed[('S21','adapters/remote-projection/**')]=['lib/relay.mjs']
        with patch.object(paths,'REUSE',changed),self.assertRaisesRegex(ValueError,'SOURCE_NOT_PRESENT'):paths.make()

    def test_16_running_card_blocks_original_relock(self):
        with self.temporary_controller(use_candidate=False) as old:
            old.resume('S02','offline-test-actor','isolated original-controller precondition test, no native pass')
            old.start('S02','offline-test-actor')
            before=(old.state_path.read_bytes(),old.lock_path.read_bytes())
            old.plan_path.write_bytes(paths.encoded(self.candidate))
            current=ctl.Controller(old.plan_path,old.root)
            with self.assertRaises(ctl.PlanError):current.relock(paths.OUT+'/AM-003.proposed.json')
            self.assertEqual((current.state_path.read_bytes(),current.lock_path.read_bytes()),before)

    def test_17_current_source_bindings_remain_valid(self):
        import check_sources
        self.assertEqual(check_sources.check(ROOT)['bound_sources'],30)
        self.assertEqual(hashlib.sha256((ROOT/'governance/masterplan/plan.json').read_bytes()).hexdigest(),paths.BASE_HASH)
        self.assertFalse((ROOT/'evidence/S02/completion.json').exists())

    def test_18_proposal_is_deterministic_and_has_no_executable_external_steps(self):
        self.assertEqual(paths.make(),self.docs)
        self.assertEqual(self.docs['AM-003.proposed.json']['new_plan_sha256'],paths.sha(paths.encoded(self.candidate)))
        for r in self.docs['resolution.json']['steps']:
            for relation in r['relations']:
                if relation['classification']=='reuse_exact_archive_members':
                    self.assertNotIn(relation['logical'],r['resolved_paths'])
                    self.assertTrue(all(not '*'in p for p in relation['targets']))

    def test_19_full_plan_export_is_external_exact_and_never_overwrites(self):
        with tempfile.TemporaryDirectory() as td:
            dest=Path(td)/'export';paths.export_candidate(dest)
            raw=(dest/'plan-1.2.1.proposed.json').read_bytes()
            self.assertEqual(paths.sha(raw),self.docs['AM-003.proposed.json']['new_plan_sha256'])
            self.assertEqual(json.loads(raw),self.candidate)
            with self.assertRaisesRegex(ValueError,'OUTPUT_EXISTS_NO_OVERWRITE'):paths.export_candidate(dest)
        with self.assertRaisesRegex(ValueError,'EXPORT_MUST_BE_EXTERNAL'):paths.export_candidate(ROOT/'should-not-exist')
        self.assertFalse((ROOT/'should-not-exist').exists())
        self.assertFalse((ROOT/paths.OUT/'plan-1.2.1.proposed.json').exists())

    def test_20_delta_cannot_change_gates_or_relabel_prior_steps(self):
        for alter in [lambda d:d['plan-changes.json']['steps'][0].update(dependencies=[]),
                      lambda d:d['plan-changes.json']['steps'][0].update(id='S00'),
                      lambda d:d['plan-changes.json']['steps'].pop()]:
            d=copy.deepcopy(self.docs);alter(d)
            with self.assertRaises(ValueError):paths.candidate_plan(documents=d)

    def test_21_existing_bootstrap_pin_is_revision_specific_not_new_plan_approval(self):
        sp=importlib.util.spec_from_file_location('actual_trusted_gate',ROOT/'tools/acceptance/trusted_gate.py')
        gate=importlib.util.module_from_spec(sp);sp.loader.exec_module(gate)
        self.assertEqual(gate.assert_trusted_files(ROOT)['governance/masterplan/plan.json'],paths.BASE_HASH)
        with self.temporary_controller() as c:
            # Call the real bootstrap check: it must NOT approve a changed plan merely
            # because the separate generic plan controller can structurally relock it.
            with self.assertRaisesRegex(gate.GateError,'Pinned baseline differs'):
                gate.assert_trusted_files(c.root)

    def test_22_pending_control_patch_is_bound_not_silently_downgraded(self):
        overlay=self.docs['resolution.json']['pending_overlays'][0]
        original=next(r for r in self.docs['resolution.json']['sources'] if r['target']==overlay['target'])
        self.assertEqual(paths.sha((ROOT/overlay['candidate_path']).read_bytes()),overlay['candidate_sha256'])
        self.assertNotEqual(overlay['candidate_sha256'],original['sha256'])
        self.assertEqual(overlay['status'],'preserved_private_proposal_not_activated')
        self.assertFalse((ROOT/overlay['target']).exists())

    @staticmethod
    def replace_amendment(c,change):
        p=c.root/paths.OUT/'AM-003.proposed.json';d=json.loads(p.read_text());change(d);p.write_bytes(paths.encoded(d))

    @classmethod
    def temporary_controller(cls,use_candidate=True):
        from contextlib import contextmanager
        @contextmanager
        def scope():
            with tempfile.TemporaryDirectory(prefix='s02-existing-controller-')as td:
                root=Path(td);mp=root/'governance/masterplan';mp.mkdir(parents=True)
                shutil.copytree(ROOT/'governance/masterplan/control',mp/'control')
                (mp/'plan.json').write_bytes(paths.encoded(cls.candidate) if use_candidate else (ROOT/'governance/masterplan/plan.json').read_bytes())
                out=root/paths.OUT;out.mkdir(parents=True)
                (out/'AM-003.proposed.json').write_bytes(paths.encoded(cls.docs['AM-003.proposed.json']))
                yield ctl.Controller(mp/'plan.json',root)
        return scope()

if __name__=='__main__':unittest.main(verbosity=2)
