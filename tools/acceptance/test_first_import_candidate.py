"""Bounded byte-contract fixtures; hosted CI identity is deliberately NOT tested.
Real Git end-to-end tests live outside this suite to avoid recursive self-tests.
"""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import types
import unittest
from unittest.mock import patch

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('bootstrap_fixture',HERE/'first_import_candidate.py')
bootstrap=importlib.util.module_from_spec(spec);spec.loader.exec_module(bootstrap)
ROOT=HERE.parents[1]
HEAD='a'*40

class FakeGit:
    def __init__(self,files,modes):
        self.files=files;self.modes=modes;self.current=HEAD;self.base_tree=bootstrap.FIRST_TREE
        self.objects={};self.tip={}
        for path,data in files.items():
            oid=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
            self.objects[oid]=data;self.tip[path]={'mode':modes[path],'oid':oid}
    def commit(self,ref):return ref
    def head(self):return self.current
    def run(self,*args,**kwargs):
        if args[0]=='merge-base':return b''
        if args[0]=='rev-parse':return self.base_tree.encode()+b'\n'
        if args[0]=='cat-file':return self.objects[args[2]]
        if args[0]=='ls-tree':
            entries=({'README.md':{'mode':'100644','oid':bootstrap.README_BLOB}}
                     if args[-1]==bootstrap.FIRST_REMOTE_COMMIT else self.tip)
            return b''.join(f"{r['mode']} {'commit' if r['mode']=='160000' else 'blob'} {r['oid']}\t{p}".encode()+b'\0' for p,r in sorted(entries.items()))
        raise AssertionError(args)

class FirstImportContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Synthetic immutable bytes keep this test independent of later normal
        # documentation changes. Exact production pins are checked by the real
        # Git end-to-end test; no runtime checker constant is changed on disk.
        manifest=json.loads((ROOT/bootstrap.MANIFEST).read_bytes())
        cls.original_modes={r['path']:r['mode'] for r in manifest['files']}
        cls.original_modes[bootstrap.MANIFEST]='100644'
        cls.original={r['path']:(b'# Trading' if r['path']=='README.md' else
                      ('synthetic unit fixture: '+r['path']).encode()) for r in manifest['files']}
        for row in manifest['files']:
            data=cls.original[row['path']]
            row['size_bytes']=len(data);row['sha256']=hashlib.sha256(data).hexdigest()
        cls.fixture_immutable_hash=bootstrap.digest_json([r for r in manifest['files']
                                                        if r['path'] not in bootstrap.MUTABLE_PATHS])
        cls.original[bootstrap.MANIFEST]=(json.dumps(manifest)+'\n').encode()
    def setUp(self):
        self.files=dict(self.original);self.modes=dict(self.original_modes)
    def manifest(self):return json.loads(self.files[bootstrap.MANIFEST])
    def put(self,value):self.files[bootstrap.MANIFEST]=(json.dumps(value)+'\n').encode()
    def refresh(self):
        m=self.manifest();m['files']=[{'path':p,'mode':self.modes[p],'size_bytes':len(d),
            'sha256':hashlib.sha256(d).hexdigest()} for p,d in sorted(self.files.items()) if p!=bootstrap.MANIFEST]
        m['file_count']=len(m['files']);self.put(m)
    def check(self,base=None,git=None):
        g=git or FakeGit(self.files,self.modes)
        module=types.SimpleNamespace(Git=lambda _:g)
        with patch.object(bootstrap,'load_sibling',return_value=module), patch.object(bootstrap,'IMMUTABLE_SHA256',self.fixture_immutable_hash):
            return bootstrap.inspect_import(ROOT,base or bootstrap.FIRST_REMOTE_COMMIT,HEAD)
    def rejected(self):
        with self.assertRaises(bootstrap.ImportCheckError):self.check()
    def test_valid_full_byte_contract_is_not_independent_approval(self):
        r=self.check();self.assertFalse(r['independent_authenticity_verified']);self.assertTrue(r['manifest_is_self_asserted'])
        self.assertEqual(r['file_count'],len(self.original))
    def test_noninitial_base_is_not_eligible(self):
        with self.assertRaises(bootstrap.ImportCheckError):self.check(base='b'*40)
    def test_wrong_checkout_rejected(self):
        g=FakeGit(self.files,self.modes);g.current='b'*40
        with self.assertRaises(bootstrap.ImportCheckError):self.check(git=g)
    def test_wrong_base_tree_rejected(self):
        g=FakeGit(self.files,self.modes);g.base_tree='b'*40
        with self.assertRaises(bootstrap.ImportCheckError):self.check(git=g)
    def test_readme_change_rejected_even_with_new_manifest(self):
        self.files['README.md']=b'changed';self.refresh();self.rejected()
    def test_missing_file_rejected(self):
        self.files.pop('docs/plan/S00_RUNBOOK.md');self.refresh();self.rejected()
    def test_extra_private_path_rejected_with_new_manifest(self):
        self.files['secrets/credentials.json']=b'{}';self.modes['secrets/credentials.json']='100644'
        self.refresh();self.rejected()
    def test_mode_change_rejected_with_new_manifest(self):
        self.modes['tools/acceptance/candidate_ci.py']='100755';self.refresh();self.rejected()
    def test_symlink_rejected(self):
        self.modes['docs/plan/S00_RUNBOOK.md']='120000';self.rejected()
    def test_submodule_rejected(self):
        self.modes['docs/plan/S00_RUNBOOK.md']='160000';self.rejected()
    def test_manifest_changed_file_hash_rejected(self):
        m=self.manifest();m['files'][0]['sha256']='0'*64;self.put(m);self.rejected()
    def test_manifest_size_mismatch_rejected(self):
        m=self.manifest();m['files'][0]['size_bytes']+=1;self.put(m);self.rejected()
    def test_duplicate_file_row_rejected(self):
        m=self.manifest();m['files'][1]=copy.deepcopy(m['files'][0]);self.put(m);self.rejected()
    def test_manifest_rows_must_be_sorted(self):
        m=self.manifest();m['files'].reverse();self.put(m);self.rejected()
    def test_manifest_self_entry_rejected(self):
        m=self.manifest();m['files'][0]['path']=bootstrap.MANIFEST;self.put(m);self.rejected()
    def test_manifest_unknown_fields_rejected(self):
        m=self.manifest();m['s00_completed']=True;self.put(m);self.rejected()
    def test_manifest_types_and_identity_not_coerced(self):
        for key,value in [('schema_version',True),('file_count',True),('base_commit','b'*40),
                          ('source_commit','c'*40),('purpose','trusted_gate'),('files',{})]:
            with self.subTest(key=key):
                self.files=dict(self.original);m=self.manifest();m[key]=value;self.put(m);self.rejected()
    def test_manifest_invalid_row_metadata_rejected(self):
        for key,value in [('path',None),('size_bytes',True),('sha256',7),('mode',100644)]:
            with self.subTest(key=key):
                self.files=dict(self.original);m=self.manifest();m['files'][0][key]=value;self.put(m);self.rejected()
    def test_all_immutable_input_classes_remain_pinned_after_rehash(self):
        for name in ['governance/masterplan/plan.json','governance/masterplan/control/planctl.py',
                     'governance/masterplan/control/test_planctl.py','governance/masterplan/control/state.json',
                     'governance/masterplan/steps/S00.md','assets/design/approved/A01-r04.png',
                     'tools/acceptance/trusted_gate.py','tools/acceptance/collect_changes.py',
                     'governance/ci-policy.json','governance/masterplan/governance/amendments/AM-002-user-removes-reviewer.json']:
            with self.subTest(path=name):
                self.files=dict(self.original);self.files[name]+=b'\n';self.refresh();self.rejected()
    def test_mutable_code_requires_manifest_refresh(self):
        self.files['tools/acceptance/candidate_ci.py']+=b'\n# proposed change\n';self.rejected()
        self.refresh();r=self.check();self.assertFalse(r['independent_authenticity_verified'])
    def test_invalid_json_rejected(self):
        self.files[bootstrap.MANIFEST]=b'{';self.rejected()
    def test_duplicate_json_keys_rejected(self):
        with self.assertRaises(bootstrap.ImportCheckError):bootstrap.strict_json('{"x":1,"x":2}')
    def test_nonfinite_json_rejected(self):
        for value in ['NaN','Infinity','-Infinity']:
            with self.assertRaises(bootstrap.ImportCheckError):bootstrap.strict_json('{"x":'+value+'}')
    def test_unsafe_tree_path_rejected(self):
        for name in ['../secret','a/../x','/absolute','a\\b','bad\npath']:
            with self.subTest(path=name):
                self.files=dict(self.original);self.modes=dict(self.original_modes)
                self.files[name]=b'x';self.modes[name]='100644';self.rejected()

if __name__=='__main__':unittest.main()
