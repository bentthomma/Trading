"""Real local Git/plan-controller regression tests for the owner-authorized policy.

No GitHub, broker, native bot, or network is used. The subject is the original
controller amended in place; no alternate status writer is supplied here.
"""
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('owner_planctl', ROOT / 'governance/masterplan/control/planctl.py')
ctlmod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ctlmod)


class OwnerCompletionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='owner-git-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.plan_path = self.root / 'governance/masterplan/plan.json'
        self.plan_path.parent.mkdir(parents=True)
        (self.root / 'tools/acceptance').mkdir(parents=True)
        shutil.copyfile(ROOT / 'tools/acceptance/collect_changes.py', self.root / 'tools/acceptance/collect_changes.py')
        self.plan = {'schema_version': 1, 'plan_id': 'offline-regression', 'version': '1.2.0',
                     'global_rules': {'max_in_progress': 2, 'required_independent_review': False,
                                      'evidence_source': 'local_git_verified'},
                     'steps': [self.step('S00'), self.step('S01', ['S00'])]}
        self.write(self.plan_path, self.plan)
        self.ctl = ctlmod.Controller(self.plan_path, self.root)
        self.ctl.lock()
        self.git('init', '-q')
        self.git('add', '.')
        self.git('commit', '-qm', 'original offline fixture')
        self.base = self.git('rev-parse', 'HEAD')
        self.ctl.start('S00', 'same-actor')
        self.proof = self.root / 'evidence/S00/result.json'
        self.proof.parent.mkdir(parents=True)
        self.write(self.proof, {'actual_fixture': True, 'result': 'pass'})
        self.git('add', 'evidence/S00/result.json')
        self.git('commit', '-qm', 'committed test proof')
        self.head = self.git('rev-parse', 'HEAD')
        self.path = self.root / 'evidence/S00/completion.json'
        self.data = {'schema_version': 1, 'step_id': 'S00', 'plan_sha256': self.ctl.plan_hash,
                     'actor': 'same-actor', 'base_revision': self.base, 'head_revision': self.head,
                     'changed_files': ['evidence/S00/result.json'],
                     'artifacts': {'evidence/S00/result.json': hashlib.sha256(self.proof.read_bytes()).hexdigest()},
                     'checks': [{'id': 'S00-C01', 'status': 'pass', 'summary': 'Executed fixture assertion',
                                 'proof_artifacts': ['evidence/S00/result.json']}]}
        self.save()

    @staticmethod
    def step(sid, deps=None):
        return {'id': sid, 'title': 'Controlled fixture ' + sid, 'enabled': True,
                'dependencies': deps or [], 'allowed_paths': [f'evidence/{sid}/**', 'src/**'],
                'forbidden_paths': ['src/secrets/**'], 'required_artifacts': [f'evidence/{sid}/result.json'],
                'checks': [{'id': sid+'-C01', 'description': 'Real fixture proof'}]}

    @staticmethod
    def write(path, obj):
        path.write_text(json.dumps(obj, ensure_ascii=False, indent=2)+'\n')

    def save(self):
        self.write(self.path, self.data)

    def git(self, *args):
        env = {k:v for k,v in os.environ.items() if not k.startswith('GIT_')}
        env.update(GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=os.devnull,
                   GIT_CONFIG_SYSTEM=os.devnull, GIT_ALLOW_PROTOCOL='', GIT_TERMINAL_PROMPT='0')
        p = subprocess.run(['/usr/bin/git', '-c', 'user.name=LocalTest', '-c', 'user.email=local@example.invalid',
                            '-c', 'core.hooksPath='+os.devnull, '-C', str(self.root), *args], env=env,
                           capture_output=True, text=True, timeout=30)
        self.assertEqual(p.returncode, 0, p.stderr)
        return p.stdout.strip()

    def reject(self):
        before=self.ctl.state_path.read_bytes()
        with self.assertRaises(ctlmod.PlanError):
            self.ctl.finish('S00', str(self.path))
        self.assertEqual(self.ctl.state_path.read_bytes(), before)

    def test_same_actor_finishes_without_reviewer_and_unlocks_next(self):
        result = self.ctl.verify('S00', str(self.path))
        self.assertTrue(result['git_binding']['source_worktree_clean_except_completion_metadata'])
        self.assertFalse(result['independent_review_required'])
        self.ctl.finish('S00', str(self.path))
        state=self.ctl.state()['steps']['S00']
        self.assertNotIn('reviewer',state)
        self.assertEqual(state['actor'],'same-actor')
        self.assertEqual(self.ctl.next()['ready_steps'],['S01'])

    def test_invented_revision_cannot_finish(self):
        self.data['head_revision']='f'*40;self.save();self.reject()

    def test_missing_changed_file_cannot_finish(self):
        self.data['changed_files']=[];self.save();self.reject()

    def test_declared_fake_changed_file_cannot_finish(self):
        self.data['changed_files'].append('src/never-changed.py');self.save();self.reject()

    def test_uncommitted_proof_change_even_with_updated_hash_cannot_finish(self):
        self.proof.write_text('{"replacement":true}')
        self.data['artifacts']['evidence/S00/result.json']=hashlib.sha256(self.proof.read_bytes()).hexdigest()
        self.save();self.reject()

    def test_extra_untracked_file_cannot_finish(self):
        (self.root/'unexpected.txt').write_text('unverified');self.reject()

    def test_extra_ignored_file_cannot_finish(self):
        (self.root/'.git/info/exclude').write_text('ignored-secret\n')
        (self.root/'ignored-secret').write_text('synthetic only');self.reject()

    def test_head_advanced_after_verify_cannot_finish(self):
        self.ctl.verify('S00', str(self.path))
        self.git('commit','--allow-empty','-qm','new unchecked head')
        self.reject()

    def test_failed_check_cannot_finish(self):
        self.data['checks'][0]['status']='fail';self.save();self.reject()

    def test_wrong_actor_cannot_finish(self):
        self.data['actor']='other';self.save();self.reject()

    def test_wrong_artifact_hash_cannot_finish(self):
        self.data['artifacts']['evidence/S00/result.json']='0'*64;self.save();self.reject()

    def test_actual_out_of_scope_commit_cannot_finish(self):
        (self.root/'website').mkdir();(self.root/'website/product.js').write_text('not permitted')
        self.git('add','website');self.git('commit','-qm','out of scope')
        self.data['head_revision']=self.git('rev-parse','HEAD')
        self.data['changed_files'].append('website/product.js');self.save();self.reject()

    def test_nested_controller_change_requires_an_amendment_not_finish(self):
        f=self.root/'governance/masterplan/control/planctl.py'
        f.write_text('unauthorized runtime change')
        self.git('add',str(f.relative_to(self.root)));self.git('commit','-qm','runtime changed')
        self.data['head_revision']=self.git('rev-parse','HEAD')
        self.data['changed_files'].append(f.relative_to(self.root).as_posix())
        self.save();self.reject()

    def test_mutable_state_cannot_be_used_as_test_proof(self):
        name=self.ctl.state_path.relative_to(self.root).as_posix()
        self.data['artifacts'][name]=hashlib.sha256(self.ctl.state_path.read_bytes()).hexdigest()
        self.save();self.reject()

    def test_completion_symlink_is_rejected(self):
        stored=self.path.read_bytes();self.path.unlink()
        target=self.root/'evidence/S00/alias.json';target.write_bytes(stored)
        self.path.symlink_to(target.name);self.reject()

    def test_removed_dependency_is_not_bypassed_by_missing_reviewer(self):
        with self.assertRaises(ctlmod.PlanError):self.ctl.start('S01','same-actor')

    def test_second_finish_is_rejected_without_mutating_state(self):
        self.ctl.finish('S00',str(self.path));self.reject()

    def test_old_reviewer_policy_cannot_be_silently_run_by_new_controller(self):
        plan=copy.deepcopy(self.plan);plan['global_rules']['required_independent_review']=True
        with self.assertRaises(ctlmod.PlanError):ctlmod.validate_plan(plan)

    def test_resume_needs_reason_not_a_second_identity(self):
        self.ctl.block('S00','same-actor','fixture issue')
        self.ctl.resume('S00','same-actor','fixture corrected')
        self.assertEqual(self.ctl.state()['steps']['S00']['status'],'pending')

    def test_versioned_amendment_does_not_need_a_reviewer(self):
        self.ctl.block('S00','same-actor','pause for amendment')
        self.ctl.resume('S00','same-actor','continue as new version')
        old=self.ctl.plan_hash;self.plan['version']='1.2.1'
        self.plan['steps'][0]['title']='Updated fixture title'
        self.write(self.plan_path,self.plan)
        new=ctlmod.Controller(self.plan_path,self.root)
        path=self.root/'amendment.json'
        self.write(path,{'schema_version':1,'plan_id':self.plan['plan_id'],
                        'previous_plan_sha256':old,'new_plan_sha256':new.plan_hash,
                        'previous_version':'1.2.0','new_version':'1.2.1','author':'same-actor',
                        'reason':'explicit fixture amendment','affected_steps':['S00','S01']})
        result=new.relock(str(path))
        self.assertTrue(result['relocked'])
        self.assertNotIn('reviewer',new.locked()['amendment'])


class NoReviewerMergeTests(unittest.TestCase):
    setUp = OwnerCompletionTests.setUp
    step = staticmethod(OwnerCompletionTests.step)
    write = staticmethod(OwnerCompletionTests.write)
    save = OwnerCompletionTests.save
    git = OwnerCompletionTests.git

    def merge_fixture(self):
        spec=importlib.util.spec_from_file_location('merge_without_reviewer', ROOT/'tools/acceptance/merge_readback.py')
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        branch=self.git('branch','--show-current')
        self.git('switch','-c','fixture-feature')
        f=self.root/'evidence/S00/extra.json';f.write_text('{"fixture":true}')
        self.git('add','evidence/S00/extra.json');self.git('commit','-qm','feature')
        head=self.git('rev-parse','HEAD');self.git('switch',branch)
        self.git('merge','--no-ff','fixture-feature','-m','fixture merge')
        merged=self.git('rev-parse','HEAD');tree=self.git('rev-parse','HEAD^{tree}')
        pinned={'trusted_root_sha':self.base,'validated_base_sha':self.head,
                'validated_head_sha':head,'repository_id':1,'pr_number':1,'base_ref':branch}
        ref={'ref':'refs/heads/'+branch,'object':{'type':'commit','sha':merged}}
        snapshot={'pr':{'number':1,'state':'closed','merged':True,'merged_at':'2026-11-13T00:00:00Z',
                        'head':{'sha':head},'base':{'ref':branch,'repo':{'id':1}},'merge_commit_sha':merged},
                  'branch_ref_before':copy.deepcopy(ref),'branch_ref_after':copy.deepcopy(ref),
                  'commit':{'sha':merged,'commit':{'tree':{'sha':tree}},'parents':[{'sha':self.head},{'sha':head}]}}
        return module,pinned,snapshot

    def test_real_merge_without_review_payload_passes_object_checks(self):
        m,p,s=self.merge_fixture();v=m.verify(self.root,p,s)
        self.assertEqual(v['verdict'],'OBSERVED_MERGE_INTEGRITY_ONLY')
        self.assertFalse(v['independent_review_required']);self.assertFalse(v['release_authorized'])

    def test_forged_tree_still_fails_without_reviewer(self):
        m,p,s=self.merge_fixture();s['commit']['commit']['tree']['sha']='f'*40
        with self.assertRaises(m.ReadbackError):m.verify(self.root,p,s)

    def test_post_merge_head_movement_still_fails(self):
        m,p,s=self.merge_fixture();self.git('commit','--allow-empty','-qm','unvalidated new commit')
        with self.assertRaises(m.ReadbackError):m.verify(self.root,p,s)


class ActivePolicyTests(unittest.TestCase):
    def test_active_plan_retains_risk_design_and_scope_restrictions(self):
        p=json.loads((ROOT/'governance/masterplan/plan.json').read_text())
        rules=p['global_rules']
        self.assertFalse(rules['required_independent_review'])
        for name in ('public_github_writes_authorized','broker_actions_authorized','live_trading_authorized_by_plan'):
            self.assertFalse(rules[name])
        self.assertTrue(rules['no_force_completion'])
        self.assertEqual(rules['evidence_source'],'local_git_verified')
        self.assertTrue(rules['immutable_paths'])
        for s in p['steps']:
            self.assertNotIn('reviewer',s)
            self.assertTrue(s['checks']);self.assertTrue(s['required_artifacts'])
        for s in p['steps']:
            if s['id'] in ['S30','S31','S32','S33','S34','S35']:
                self.assertTrue(s['entry_checks'])

    def test_current_ci_and_merge_paths_have_no_mandatory_review_api(self):
        for name in ('tools/acceptance/github_s00.py','.github/workflows/plan-gates.yml','tools/acceptance/merge_readback.py'):
            t=(ROOT/name).read_text()
            self.assertNotIn('/reviews?',t)
            self.assertNotIn('select_review(',t)
            self.assertNotIn('validated_reviews_sha256',t)
        policy=json.loads((ROOT/'governance/ci-policy.json').read_text())
        self.assertNotIn('reviewer_user_ids',policy)
        self.assertFalse(policy['independent_review_required'])

if __name__=='__main__':
    unittest.main()
