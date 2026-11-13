#!/usr/bin/env python3
"""Untrusted, read-only PR candidate check for S00 bootstrap review.

The checked-out PR head contains the workflow's code. Unlike the protected
pull_request_target gate, this code is *not a trust boundary*, and its output
can never approve a step or a real release. No credentials or broker access.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys

REPO_NAME = "bentthomma/Trading"
REPO_ID = 1454517485
DEFAULT_BRANCH = "main"
FIRST_REMOTE_COMMIT = "1a5cfe9d3139276f5432c79a8ee0be1938b7066c"
HEX_SHA = re.compile(r"[0-9a-f]{40}")


class CandidateError(ValueError):
    pass


def validate_candidate_event(event: dict, env: dict, checkout: str) -> dict:
    """Require an exact head checkout and the intended target, not a PR merge tree."""
    if env.get('GITHUB_ACTIONS') != 'true' or env.get('GITHUB_EVENT_NAME') != 'pull_request':
        raise CandidateError('Only a normal pull_request event may execute candidate checks')
    if env.get('GITHUB_REPOSITORY') != REPO_NAME:
        raise CandidateError('Wrong GitHub repository')
    if not isinstance(event, dict):
        raise CandidateError('Invalid event payload')
    pr = event.get('pull_request') or {}
    if not isinstance(pr, dict):
        raise CandidateError('Invalid pull request payload')
    base, head = pr.get('base') or {}, pr.get('head') or {}
    if not isinstance(base, dict) or not isinstance(head, dict):
        raise CandidateError('Invalid PR revisions')
    base_repo = base.get('repo') or {}
    if not isinstance(base_repo, dict):
        raise CandidateError('Invalid repository identity')
    if (base_repo.get('full_name') != REPO_NAME or type(base_repo.get('id')) is not int or base_repo.get('id') != REPO_ID
            or base.get('ref') != DEFAULT_BRANCH):
        raise CandidateError('PR must target the approved repository/main')
    if pr.get('state') != 'open':
        raise CandidateError('PR is no longer open')
    number = event.get('number')
    if type(number) is not int or number < 1:
        raise CandidateError('Invalid pull request number')
    if not all(isinstance(value, str) and HEX_SHA.fullmatch(value)
               for value in (base.get('sha'), head.get('sha'), checkout)):
        raise CandidateError('Invalid base/head/checkout revision')
    if checkout != head['sha']:
        raise CandidateError('Checked-out candidate is not the declared PR head')
    return {
        'pull_request': number, 'base_revision': base['sha'], 'head_revision': head['sha'],
        'checkout_revision': checkout,
        'workflow_revision': env.get('GITHUB_WORKFLOW_SHA') or env.get('GITHUB_SHA'),
        'first_import_from_original_commit': base['sha'] == FIRST_REMOTE_COMMIT,
    }


def run_candidate(repo: Path, output_dir: Path, event: dict, env: dict):
    if output_dir.resolve().is_relative_to(repo.resolve()):
        raise CandidateError('Report output must remain outside candidate repository')
    output_dir.mkdir(parents=True, exist_ok=True)
    report = {
        'schema_version': 1, 'step_id': 'S00', 'status': 'failed',
        'evidence_class': 'untrusted_candidate_self_test', 's00_completed': False,
        'candidate_code_executed': True, 'identity_verified_externally': False,
        'branch_protection_verified': False, 'controlled_progress_writer_verified': False,
        'security_note': 'Runs PR-authored code without secrets or write permissions. No approval authority.',
    }
    try:
        raw = subprocess.check_output(['git', '-c', 'core.hooksPath=/dev/null', 'rev-parse', 'HEAD'],
                                      cwd=repo, text=True, timeout=30).strip()
        details = validate_candidate_event(event, env, raw)
        report.update(details)
        import importlib.util
        first_import = details['first_import_from_original_commit']
        module_name = 'first_import_candidate' if first_import else 'trusted_gate'
        path = repo / ('tools/acceptance/' + module_name + '.py')
        spec = importlib.util.spec_from_file_location('candidate_' + module_name, path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        if first_import:
            report['validation_path'] = 'exact_first_import_self_test'
            test = module.run_first_import(repo, details['base_revision'], raw, output_dir)
            expected_status = 'passed_untrusted_first_import_checks'
        else:
            report['validation_path'] = 'regular_immutable_baseline'
            test = module.run_preflight(repo, details['base_revision'], raw, raw, output_dir,
                                        enforce_runtime=False)
            expected_status = 'passed_local_checks'
        report['self_test_status'] = test['status']
        report['state_mutated'] = test.get('state_mutated')
        if test['status'] != expected_status:
            raise CandidateError('Candidate local checks failed: ' + test.get('error', 'see preflight report'))
        report['status'] = 'passed_untrusted_candidate_checks'
    except (CandidateError, KeyError, ValueError, OSError, subprocess.SubprocessError) as err:
        report['error'] = str(err)
    (output_dir / 'candidate-ci.json').write_text(json.dumps(report, indent=2) + '\n',encoding='utf-8')
    return report


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--repo', type=Path, required=True)
    p.add_argument('--output-dir', type=Path, required=True)
    args = p.parse_args()
    event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text(encoding='utf-8'))
    report = run_candidate(args.repo.resolve(), args.output_dir.resolve(), event, dict(os.environ))
    print(json.dumps({k:report.get(k) for k in ('status','s00_completed','head_revision','error')}))
    return 0 if report['status'] == 'passed_untrusted_candidate_checks' else 1


if __name__ == '__main__':
    sys.exit(main())
