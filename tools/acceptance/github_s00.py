#!/usr/bin/env python3
"""GitHub-hosted adapter for the read-only S00 preflight; no plan writes."""
from __future__ import annotations

import argparse
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import stat
import tempfile
import subprocess
import sys
import urllib.error
import urllib.request


class CIError(RuntimeError):
    pass


def git_environment():
    """No inherited Git, proxy, loader, PATH, HOME or credential configuration."""
    return {
        "PATH": os.defpath, "LC_ALL": "C", "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_SYSTEM": os.devnull,
        "GIT_TERMINAL_PROMPT": "0", "GIT_NO_REPLACE_OBJECTS": "1",
        "GIT_NO_LAZY_FETCH": "1", "GIT_ALLOW_PROTOCOL": "",
        "GIT_PROTOCOL_FROM_USER": "0", "GIT_ATTR_NOSYSTEM": "1",
        "GIT_PAGER": "", "PAGER": "", "GIT_OPTIONAL_LOCKS": "0",
    }


class S00GitBoundary:
    """Conservative hosted-checkout contract, not a hostile-host sandbox.

    Only a normal, quiescent SHA1 checkout is supported. Local configuration is
    read as an inert copied file without includes, then allowlisted before any
    transport/object operation. Config changes fail closed but concurrent hostile
    host mutation is outside this contract. This class grants no CI authority.
    """
    SAFE_KEYS = {
        "core.repositoryformatversion", "core.filemode", "core.bare",
        "core.logallrefupdates", "core.ignorecase", "core.precomposeunicode",
        "remote.origin.url", "remote.origin.fetch", "remote.origin.tagopt",
        "user.name", "user.email",
    }

    def __init__(self, repo):
        self.repo = Path(os.path.abspath(repo))
        self.env = git_environment()
        self.binary = shutil.which("git", path=os.defpath)
        if not self.binary:
            raise CIError("System Git is unavailable")
        self._regular_ancestry(self.repo, directory=True)
        self.meta = self.repo / ".git"
        self._regular_ancestry(self.meta, directory=True)
        self._regular_ancestry(self.meta / "objects", directory=True)
        self.config = self.meta / "config"
        self._regular_ancestry(self.config)
        if self.config.stat().st_size > 1024 * 1024:
            raise CIError("Git configuration exceeds the supported size")
        self.config_bytes = self.config.read_bytes()
        for path in ("shallow", "config.worktree", "commondir", "info/grafts",
                     "objects/info/alternates", "objects/info/http-alternates"):
            item = self.meta / path
            if item.exists() or item.is_symlink():
                raise CIError("Unsupported Git metadata layout")
        # The parser runs outside the source repo and sees only the copied bytes.
        with tempfile.TemporaryDirectory(prefix="extremelab-config-read-") as td:
            copied = Path(td) / "config"
            copied.write_bytes(self.config_bytes)
            parsed = self._process([self.binary, "config", "--file", str(copied),
                                    "--no-includes", "--null", "--name-only", "--list"],
                                   cwd=td, env=self.env, timeout=30)
        if parsed and not parsed.endswith(b"\0"):
            raise CIError("Malformed Git configuration listing")
        keys = parsed[:-1].split(b"\0") if parsed else []
        for raw in keys:
            try:
                key = raw.decode("utf-8", "strict").lower()
            except UnicodeError as exc:
                raise CIError("Unsupported Git configuration key") from exc
            if key not in self.SAFE_KEYS and not re.fullmatch(r"branch\.[a-z0-9_./-]+\.(remote|merge)", key):
                # Keys themselves may contain URLs/secrets; never echo them.
                raise CIError("Git configuration is outside the reviewed allowlist")
        self.prefix = [self.binary, "--no-pager", "-C", str(self.repo),
                       "-c", "core.hooksPath=" + os.devnull,
                       "-c", "core.fsmonitor=false", "-c", "credential.helper=",
                       "-c", "gc.auto=0", "-c", "maintenance.auto=false",
                       "-c", "http.followRedirects=false", "-c", "http.sslVerify=true",
                       "-c", "protocol.allow=never", "-c", "protocol.https.allow=always"]
        if self.text("rev-parse", "--is-bare-repository") != "false":
            raise CIError("A normal non-bare hosted checkout is required")
        if self.text("rev-parse", "--show-toplevel") != str(self.repo):
            raise CIError("The explicit repository root does not match Git")
        if self.text("rev-parse", "--show-object-format") != "sha1":
            raise CIError("Only the bound GitHub SHA1 format is supported")

    @staticmethod
    def _regular_ancestry(path, *, directory=False):
        for part in (*reversed(path.parents), path):
            if part.is_symlink():
                raise CIError("Git paths must not contain symbolic links")
        try:
            mode = path.lstat().st_mode
        except OSError as exc:
            raise CIError("Required ordinary Git metadata is missing") from exc
        if not (stat.S_ISDIR(mode) if directory else stat.S_ISREG(mode)):
            raise CIError("Unsupported Git metadata file type")

    @staticmethod
    def _process(command, *, cwd, env, timeout):
        try:
            result = subprocess.run(command, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
                                    capture_output=True, timeout=timeout, check=False)
        except (OSError, subprocess.SubprocessError) as exc:
            raise CIError("Isolated Git operation unavailable or timed out") from exc
        if result.returncode:
            raise CIError("Isolated Git operation failed")
        if len(result.stdout) > 1024 * 1024:
            raise CIError("Git output exceeds the supported size")
        return result.stdout

    def _unchanged(self):
        self._regular_ancestry(self.config)
        if self.config.read_bytes() != self.config_bytes:
            raise CIError("Git configuration changed during validation")

    def _run(self, args, *, env=None, timeout=30):
        self._unchanged()
        result = self._process(self.prefix + list(args), cwd=self.repo,
                               env=self.env if env is None else env, timeout=timeout)
        self._unchanged()
        return result

    def text(self, *args):
        try:
            return self._run(args).decode("utf-8", "strict").strip()
        except UnicodeError as exc:
            raise CIError("Invalid Git text response") from exc

    def fetch(self, name, number, base, token):
        if (type(name) is not str or not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", name)
                or type(number) is not int or number <= 0
                or type(base) is not str or not re.fullmatch(r"[0-9a-f]{40}", base)
                or type(token) is not str or not token or "\n" in token or "\r" in token):
            raise CIError("Invalid fixed Git fetch parameters")
        env = dict(self.env)
        auth = base64.b64encode(("x-access-token:" + token).encode()).decode()
        env.update(GIT_ALLOW_PROTOCOL="https", GIT_CONFIG_COUNT="1",
                   GIT_CONFIG_KEY_0="http.https://github.com/.extraheader",
                   GIT_CONFIG_VALUE_0="AUTHORIZATION: basic " + auth)
        # Credentials exist only in this fetch child's environment, never argv.
        self._run(["fetch", "--no-tags", "--no-recurse-submodules",
                   "https://github.com/" + name + ".git",
                   f"+refs/pull/{number}/head:refs/extremelab/s00-head", base],
                  env=env, timeout=120)


def assert_same_pr(before, after):
    fields = [(before["head"]["sha"], after["head"]["sha"]),
              (before["base"]["sha"], after["base"]["sha"]),
              (before["base"]["repo"]["id"], after["base"]["repo"]["id"]),
              (before["base"]["ref"], after["base"]["ref"])]
    if after.get("state") != "open" or any(left != right for left, right in fields):
        raise CIError("PR head/base changed or PR closed during validation")


def assert_trusted_revision(trusted, base):
    if trusted != base:
        raise CIError("Workflow event is stale: trusted checkout must equal the current PR base")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    repo, out = Path(os.path.abspath(args.repo)), args.output_dir.resolve()
    if out.is_relative_to(repo):
        raise CIError("CI reports must be outside the repository")
    out.mkdir(parents=True, exist_ok=True)
    report = {"schema_version": 1, "step_id": "S00", "status": "failed",
              "s00_completed": False, "state_mutated": None,
              "identity_verified_externally": False, "candidate_code_executed": False}
    try:
        if os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("GITHUB_EVENT_NAME") != "pull_request_target":
            raise CIError("This entry point requires the configured GitHub Actions PR-target event")
        # These environment flags are not proof outside the actual hosted run.
        if os.environ.get("GITHUB_API_URL") != "https://api.github.com":
            raise CIError("Only the reviewed github.com API host is supported")
        name = os.environ["GITHUB_REPOSITORY"]
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", name):
            raise CIError("Invalid repository identity")
        event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
        number = event.get("number")
        if type(number) is not int or number <= 0:
            raise CIError("Missing PR number")
        policy = json.loads((repo / "governance/ci-policy.json").read_text())
        if policy.get("status") != "ready_for_ci_exercise":
            raise CIError("Repository CI installation is not configured; local completion is separate")
        token = os.environ.get("EXTREMELAB_READ_TOKEN")
        if not token:
            raise CIError("Read-only Actions token is missing")

        def get(suffix):
            request = urllib.request.Request("https://api.github.com/repos/" + name + suffix,
                headers={"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json",
                         "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "ExtremeLab-S00"})
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)

        repository = get("")
        if (repository["id"] != policy.get("repository_id") or name != policy.get("repository_full_name")
                or repository["default_branch"] != policy.get("default_branch")):
            raise CIError("Repository does not match the configured repository policy")
        before = get(f"/pulls/{number}")
        if (before["base"]["repo"]["id"] != repository["id"]
                or before["base"]["ref"] != repository["default_branch"] or before["state"] != "open"):
            raise CIError("PR must be open and target this repository's default branch")
        head, base, trusted = before["head"]["sha"], before["base"]["sha"], os.environ["GITHUB_SHA"]
        if not all(re.fullmatch(r"[0-9a-f]{40}", value) for value in (head, base, trusted)):
            raise CIError("GitHub returned an invalid commit ID")
        assert_trusted_revision(trusted, base)
        report.update(repository_id=repository["id"], repository_full_name=name, pull_request=number,
                      head_revision=head, base_revision=base, trusted_revision=trusted,
                      run_id=os.environ["GITHUB_RUN_ID"], run_attempt=os.environ["GITHUB_RUN_ATTEMPT"])
        # Read-only fetch of Git objects. No PR checkout or submodule initialization.
        boundary = S00GitBoundary(repo)
        boundary.fetch(name, number, base, token)
        git = boundary.text
        if git("rev-parse", "HEAD") != trusted or git("rev-parse", "refs/extremelab/s00-head") != head:
            raise CIError("Fetched head or trusted checkout differs from GitHub's fixed revision")
        merge_bases = git("merge-base", "--all", base, head).splitlines()
        if len(merge_bases) != 1:
            raise CIError("A unique PR merge-base is required")
        module_path = repo / "tools/acceptance/trusted_gate.py"
        spec = importlib.util.spec_from_file_location("extremelab_trusted_gate", module_path)
        gate = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(gate)
        preflight = gate.run_preflight(repo, merge_bases[0], head, trusted, out, enforce_runtime=True)
        report["state_mutated"] = preflight["state_mutated"]
        if preflight["status"] != "passed_local_checks":
            raise CIError("Trusted scope/test preflight failed; see preflight.json")
        after = get(f"/pulls/{number}")
        assert_same_pr(before, after)
        report.update(status="passed_ci_preflight", identity_verified_externally=False,
                      independent_review_required=False, merge_base=merge_bases[0],
                      identity_scope="repository/commit binding; no separate reviewer identity",
                      branch_protection_verified=False, controlled_progress_writer_verified=False)
        # This output is a CI result, not a S00 completion receipt.
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            output.write("validated_head=" + head + "\n")
            output.write("validated_base=" + base + "\n")
            output.write("validated_base_ref=" + before["base"]["ref"] + "\n")
            output.write("validated_repository_id=" + str(repository["id"]) + "\n")
    except (CIError, OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError,
            urllib.error.URLError) as error:
        # Do not dump HTTP headers, environment, or auth-bearing subprocess input.
        report["status"] = "failed"
        report["error"] = str(error)
    (out / "github-ci.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({key: report.get(key) for key in ("step_id", "status", "s00_completed", "error")}))
    return 0 if report["status"] == "passed_ci_preflight" else 1


if __name__ == "__main__":
    raise SystemExit(main())
