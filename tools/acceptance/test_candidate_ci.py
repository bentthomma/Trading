"""Candidate-event fixture tests, not hosted GitHub approvals."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('candidate_ci',Path(__file__).with_name('candidate_ci.py'))
candidate=importlib.util.module_from_spec(spec)
spec.loader.exec_module(candidate)
HEAD='a'*40
BASE=candidate.FIRST_REMOTE_COMMIT

def fixture():
    return {'number':7,'pull_request':{'state':'open','base':{
        'sha':BASE,'ref':'main','repo':{'id':candidate.REPO_ID,'full_name':candidate.REPO_NAME}},
        'head':{'sha':HEAD}}}

def env():
    return {'GITHUB_ACTIONS':'true','GITHUB_EVENT_NAME':'pull_request',
            'GITHUB_REPOSITORY':candidate.REPO_NAME,
            'GITHUB_SHA':'b'*40,'GITHUB_WORKFLOW_SHA':'c'*40}

class CandidateTests(unittest.TestCase):
    def test_accepts_exact_head_and_records_separate_workflow_revision(self):
        result=candidate.validate_candidate_event(fixture(),env(),HEAD)
        self.assertEqual(result['head_revision'],HEAD)
        self.assertEqual(result['workflow_revision'],'c'*40)
        self.assertTrue(result['first_import_from_original_commit'])

    def test_rejects_mismatched_head_base_identity_and_closed_pr(self):
        for alteration in ('head','repo','id','branch','closed','number','event','checkout'):
            with self.subTest(alteration=alteration):
                item=fixture(); e=env(); checkout=HEAD
                if alteration=='head': item['pull_request']['head']['sha']='d'*40
                elif alteration=='repo': item['pull_request']['base']['repo']['full_name']='another/repo'
                elif alteration=='id': item['pull_request']['base']['repo']['id']=123
                elif alteration=='branch': item['pull_request']['base']['ref']='feature'
                elif alteration=='closed': item['pull_request']['state']='closed'
                elif alteration=='number': item['number']='7'
                elif alteration=='event': e['GITHUB_EVENT_NAME']='pull_request_target'
                elif alteration=='checkout': checkout='e'*40
                with self.assertRaises(candidate.CandidateError):
                    candidate.validate_candidate_event(item,e,checkout)

    def test_first_import_check_is_only_marked_for_original_base(self):
        item=fixture();item['pull_request']['base']['sha']='e'*40
        result=candidate.validate_candidate_event(item,env(),HEAD)
        self.assertFalse(result['first_import_from_original_commit'])

    def test_candidate_failure_never_completes_s00_or_verifies_identity(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo=Path(tmp)/'empty-repo'; repo.mkdir()
            with patch.object(candidate.subprocess,'check_output',side_effect=subprocess.CalledProcessError(128,'git')):
                result=candidate.run_candidate(repo,Path(tmp)/'evidence',fixture(),env())
            self.assertEqual(result['status'],'failed')
            self.assertFalse(result['s00_completed'])
            self.assertFalse(result['identity_verified_externally'])

if __name__=='__main__': unittest.main()
