"""Negative trust-boundary tests. All identities and GitHub records are fixtures."""
import copy
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import textwrap
import unittest
import urllib.request
import subprocess
import sys
from unittest.mock import patch


def load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


gate = load("trusted_gate")
ci = load("github_s00")
HEAD = "a" * 40




class TrustedBoundaryTests(unittest.TestCase):

    def test_stale_workflow_cannot_validate_a_new_base_with_old_policy(self):
        ci.assert_trusted_revision(HEAD, HEAD)
        with self.assertRaises(ci.CIError):
            ci.assert_trusted_revision("b" * 40, HEAD)

    def test_state_mutation_is_reported_even_when_a_tool_fails_early(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            repo = root / "repo"
            state = repo / "governance/masterplan/control/state.json"
            state.parent.mkdir(parents=True)
            state.write_text('{"original": true}')
            def broken_tool(*args, **kwargs):
                state.write_text('{"unexpected_mutation": true}')
                return {"exit_code": 1, "stdout": "", "stderr": "fixture failure"}
            with patch.object(gate, "assert_trusted_files", return_value={}), patch.object(gate, "run", broken_tool):
                result = gate.run_preflight(repo, HEAD, HEAD, HEAD, root / "reports")
            self.assertTrue(result["state_mutated"])
            self.assertEqual(result["status"], "failed")
            self.assertFalse(result["s00_completed"])

    def test_scope_cannot_rewrite_nested_canonical_guard_even_during_bootstrap(self):
        for name in ("governance/masterplan/plan.json", "governance/masterplan/control/state.json",
                     "governance/masterplan/control/planctl.py", "governance/masterplan/design/approval.json"):
            with self.subTest(name=name), self.assertRaises(gate.GateError):
                gate.check_additional_protection([name], False)

    def test_runtime_cannot_approve_its_own_replacement(self):
        for name in ("tools/acceptance/trusted_gate.py", "tools/acceptance/collect_changes.py",
                     ".github/workflows/plan-gates.yml", "governance/ci-policy.json"):
            with self.subTest(name=name), self.assertRaises(gate.GateError):
                gate.check_additional_protection([name], True)
        gate.check_additional_protection(["docs/plan/ci-exercise.md"], True)

    def test_bootstrap_allows_new_runtime_but_is_not_claimed_as_ci(self):
        gate.check_additional_protection(["tools/acceptance/new.py"], False)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            result = gate.run_preflight(root / "repo", "main", HEAD, HEAD, root / "reports")
            self.assertEqual(result["status"], "failed")
            self.assertFalse(result["s00_completed"])
            self.assertFalse(result["identity_verified_externally"])

    def test_external_test_processes_do_not_inherit_actions_tokens(self):
        with patch.dict(os.environ, {"GITHUB_TOKEN": "fixture", "GH_TOKEN": "fixture",
                                     "EXTREMELAB_READ_TOKEN": "fixture", "EXTREMELAB_STATUS_TOKEN": "fixture",
                                     "ACTIONS_RUNTIME_TOKEN": "fixture", "ACTIONS_ID_TOKEN_REQUEST_TOKEN": "fixture",
                                     "GIT_CONFIG_VALUE_0": "fixture", "PYTHONPATH": "/untrusted"}):
            env = gate.clean_environment()
            for name in ("GITHUB_TOKEN", "GH_TOKEN", "EXTREMELAB_READ_TOKEN", "EXTREMELAB_STATUS_TOKEN",
                         "ACTIONS_RUNTIME_TOKEN", "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
                         "GIT_CONFIG_VALUE_0", "PYTHONPATH"):
                self.assertNotIn(name, env)



    def test_report_cannot_pollute_checked_repository(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with self.assertRaises(gate.GateError):
                gate.run_preflight(root, HEAD, HEAD, HEAD, root / "reports")





        # This fixture is not evidence that a real review integration exists.


    def test_head_base_retarget_and_close_races_are_rejected(self):
        before = {"head": {"sha": HEAD}, "base": {"sha": "b" * 40, "ref": "main", "repo": {"id": 1}},
                  "state": "open"}
        ci.assert_same_pr(before, copy.deepcopy(before))
        for field in ("head", "base", "repo", "ref", "state"):
            after = copy.deepcopy(before)
            if field in ("head", "base"):
                after[field]["sha"] = "c" * 40
            elif field == "repo":
                after["base"]["repo"]["id"] = 2
            elif field == "ref":
                after["base"]["ref"] = "other"
            else:
                after["state"] = "closed"
            with self.subTest(field=field), self.assertRaises(ci.CIError):
                ci.assert_same_pr(before, after)


class ActualPublisherTests(unittest.TestCase):
    """Execute the real inline publisher against a fake HTTP transport, never GitHub."""
    def exercise(self, *, current_head=HEAD, current_base="b" * 40,
                 current_ref="main", current_repo=1, job_result="success"):
        workflow = Path(__file__).resolve().parents[2] / ".github/workflows/plan-gates.yml"
        lines = workflow.read_text().splitlines()
        start = next(i for i, line in enumerate(lines) if "python3 -I -B - <<'PY'" in line) + 1
        end = next(i for i in range(start, len(lines)) if lines[i].strip() == "PY")
        code = compile(textwrap.dedent("\n".join(lines[start:end])), str(workflow), "exec")
        recorded = []
        current = {"head": {"sha": current_head}, "base": {"sha": current_base, "ref": current_ref,
                   "repo": {"id": current_repo}}, "state": "open"}

        class Response(io.BytesIO):
            status = 201

        def transport(request, timeout):
            if request.get_method() == "GET":
                if "/reviews?" in request.full_url:
                    raise AssertionError("Reviewer API must not be called")
                return Response(json.dumps(current).encode())
            recorded.append({"url": request.full_url, "payload": json.loads(request.data)})
            return Response(b"{}")

        with tempfile.TemporaryDirectory() as temporary:
            event_file = Path(temporary) / "event.json"
            event_file.write_text(json.dumps({"number": 1, "pull_request": {"head": {"sha": HEAD}}}))
            env = {"GITHUB_API_URL": "https://api.github.com", "GITHUB_REPOSITORY": "fixture/extremelab",
                   "GITHUB_EVENT_PATH": str(event_file), "GITHUB_RUN_ID": "123",
                   "EXTREMELAB_STATUS_TOKEN": "local-fixture-only", "EXTREMELAB_VALIDATED_HEAD": HEAD,
                   "EXTREMELAB_VALIDATED_BASE": "b" * 40, "EXTREMELAB_VALIDATED_BASE_REF": "main",
                   "EXTREMELAB_VALIDATED_REPOSITORY_ID": "1", "EXTREMELAB_GATE_RESULT": job_result}
            with patch.dict(os.environ, env, clear=True), patch.object(urllib.request, "urlopen", transport), contextlib.redirect_stdout(io.StringIO()):
                try:
                    exec(code, {"__name__": "__main__"})
                except SystemExit as error:
                    self.assertEqual(error.code, 0)
        return recorded

    def test_success_without_review_belongs_to_the_exact_head_and_target(self):
        records = self.exercise()
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["payload"]["state"], "success")
        self.assertTrue(records[0]["url"].endswith("/statuses/" + HEAD))

    def test_superseded_run_does_not_write_a_status_to_a_new_head(self):
        self.assertEqual(self.exercise(current_head="c" * 40), [])

    def test_retarget_to_equal_sha_different_branch_cannot_publish_success(self):
        records = self.exercise(current_ref="other")
        self.assertEqual(records[0]["payload"]["state"], "failure")

    def test_changed_base_or_repository_cannot_publish_success(self):
        for changes in ({"current_base": "c" * 40}, {"current_repo": 2}):
            with self.subTest(changes=changes):
                self.assertEqual(self.exercise(**changes)[0]["payload"]["state"], "failure")

    def test_skipped_or_cancelled_checks_never_publish_success(self):
        for result in ("failure", "skipped", "cancelled"):
            with self.subTest(result=result):
                self.assertEqual(self.exercise(job_result=result)[0]["payload"]["state"], "failure")


class CIOutputFailureTests(unittest.TestCase):
    def exercise(self, fail_output=False):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);repo=root/'repo';out=root/'reports'
            (repo/'governance').mkdir(parents=True);(repo/'tools/acceptance').mkdir(parents=True)
            (repo/'governance/ci-policy.json').write_text(json.dumps({
                'status':'ready_for_ci_exercise','repository_id':1,
                'repository_full_name':'fixture/extremelab','default_branch':'main'}))
            (repo/'tools/acceptance/trusted_gate.py').write_text(
                "def run_preflight(*args, **kwargs):\n    return {'status':'passed_local_checks','state_mutated':False}\n")
            event=root/'event.json';event.write_text(json.dumps({'number':1,'action':'opened'}))
            repository={'id':1,'default_branch':'main'}
            pr={'state':'open','head':{'sha':HEAD},'base':{'sha':'b'*40,'ref':'main','repo':{'id':1}}}
            requests=[]
            def transport(request, timeout):
                requests.append(request.full_url)
                assert '/reviews' not in request.full_url and '/commits?' not in request.full_url
                data=pr if '/pulls/' in request.full_url else repository
                return io.BytesIO(json.dumps(data).encode())
            class Boundary:
                def __init__(self,repo):pass
                def fetch(self,*args):pass
                def text(self,*args):
                    return HEAD if args[-1]=='refs/extremelab/s00-head' else 'b'*40
            output=root/('missing-parent/output' if fail_output else 'output')
            env={'GITHUB_ACTIONS':'true','GITHUB_EVENT_NAME':'pull_request_target',
                 'GITHUB_API_URL':'https://api.github.com','GITHUB_REPOSITORY':'fixture/extremelab',
                 'GITHUB_EVENT_PATH':str(event),'GITHUB_SHA':'b'*40,'GITHUB_RUN_ID':'123',
                 'GITHUB_RUN_ATTEMPT':'1','EXTREMELAB_READ_TOKEN':'synthetic-only','GITHUB_OUTPUT':str(output)}
            with patch.dict(os.environ,env,clear=True), patch.object(sys,'argv',[
                    'github_s00.py','--repo',str(repo),'--output-dir',str(out)]), \
                 patch.object(urllib.request,'urlopen',transport),patch.object(ci,'S00GitBoundary',Boundary), \
                 contextlib.redirect_stdout(io.StringIO()):
                result=ci.main()
            report=json.loads((out/'github-ci.json').read_text())
            self.assertEqual(len(requests),3) # repo plus before/after PR, not review endpoints
            self.assertFalse(report['s00_completed'])
            self.assertFalse(report['identity_verified_externally'])
            return result,report,output.read_text() if output.exists() else ''

    def test_failed_runner_output_write_cannot_leave_success_status(self):
        result,report,_=self.exercise(fail_output=True)
        self.assertEqual(result,1);self.assertEqual(report['status'],'failed')

    def test_exact_ci_binding_passes_without_reviewer_accounts_or_calls(self):
        result,report,output=self.exercise()
        self.assertEqual(result,0);self.assertEqual(report['status'],'passed_ci_preflight')
        self.assertFalse(report['independent_review_required'])
        self.assertIn('validated_head='+HEAD,output)
        self.assertNotIn('review',output)


if __name__ == "__main__":
    unittest.main()
