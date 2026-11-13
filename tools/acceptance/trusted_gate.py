#!/usr/bin/env python3
"""Read-only S00 preflight. Never finishes a plan step or executes PR code."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

PLAN_SHA = 'bdf130088d8a8fe57b69c88f39b7234460bda3dc363d2e3d8a8ff3a2521466c5'
GUARD_SHA = 'a595bff55fe744e508493950e2ce3f85a15754b77855c1b9a18c63a469cbde48'
GUARD_TEST_SHA = 'c88bd3158d69530a7e5bd54b009bde331d4c761c7eb050590b91065e7f896575'
BASELINE_PREFIX = "governance/masterplan/"
RUNTIME_PREFIXES = ("tools/acceptance/",)
RUNTIME_FILES = {".github/workflows/plan-gates.yml", "governance/ci-policy.json"}


class GateError(RuntimeError):
    pass


def clean_environment():
    # Trusted checks must not inherit executable paths, user Git configuration,
    # replacement refs, provider credentials or loader/proxy settings.
    allowed = {"TMPDIR", "TMP", "TEMP", "SYSTEMROOT", "WINDIR"}
    env = {name: value for name, value in os.environ.items() if name in allowed}
    env.update(PATH=os.defpath, LC_ALL="C", PYTHONDONTWRITEBYTECODE="1",
               GIT_TERMINAL_PROMPT="0", GIT_CONFIG_NOSYSTEM="1",
               GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_SYSTEM=os.devnull,
               GIT_NO_REPLACE_OBJECTS="1", GIT_NO_LAZY_FETCH="1",
               GIT_ALLOW_PROTOCOL="", GIT_PROTOCOL_FROM_USER="0",
               GIT_ATTR_NOSYSTEM="1", GIT_PAGER="", PAGER="")
    return env


def run(command, cwd, *, env=None):
    result = subprocess.run(command, cwd=cwd, env=env or clean_environment(),
                            capture_output=True, text=True, timeout=180)
    return {"command": command, "exit_code": result.returncode,
            "stdout": result.stdout, "stderr": result.stderr}


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def assert_trusted_files(repo):
    expected = {
        "governance/masterplan/plan.json": PLAN_SHA,
        "governance/masterplan/control/planctl.py": GUARD_SHA,
        "governance/masterplan/control/test_planctl.py": GUARD_TEST_SHA,
    }
    for name, sha in expected.items():
        path = repo / name
        if path.is_symlink() or not path.resolve().is_relative_to(repo):
            raise GateError("Trusted input must be an ordinary file: " + name)
        if hashlib.sha256(path.read_bytes()).hexdigest() != sha:
            raise GateError("Pinned baseline differs: " + name)
    return expected


def check_additional_protection(paths, enforce_runtime):
    for name in paths:
        if name == BASELINE_PREFIX.rstrip("/") or name.startswith(BASELINE_PREFIX):
            raise GateError("Canonical baseline is immutable during S00: " + name)
        if enforce_runtime and (name in RUNTIME_FILES or name.startswith(RUNTIME_PREFIXES)):
            raise GateError("Validator changes need an explicit versioned bootstrap/amendment: " + name)


def check_candidate_symlinks(repo, revision, paths):
    # Raw metadata only. No checkout, filters, textconv or symlink target reads.
    result = subprocess.run(["git", "-c", "core.hooksPath=/dev/null", "ls-tree", "-r", "-z", revision],
                            cwd=repo, env=clean_environment(), capture_output=True, timeout=60)
    if result.returncode:
        raise GateError("Cannot inspect candidate tree")
    changed = set(paths)
    for entry in result.stdout.split(b"\0"):
        if not entry:
            continue
        metadata, name = entry.split(b"\t", 1)
        if metadata.split(b" ", 1)[0] == b"120000" and name.decode("utf-8", "strict") in changed:
            raise GateError("S00 does not introduce or change symbolic links")


def run_preflight(repo, base, head, worktree_revision, output_dir, *, enforce_runtime=False):
    repo, output_dir = Path(repo).resolve(), Path(output_dir).resolve()
    if output_dir.is_relative_to(repo):
        raise GateError("Reports must be outside the repository")
    output_dir.mkdir(parents=True, exist_ok=True)
    report = {
        "schema_version": 1, "step_id": "S00", "plan_sha256": PLAN_SHA,
        "base_revision": base, "head_revision": head, "worktree_revision": worktree_revision,
        "origin": "local_preflight", "s00_completed": False,
        "identity_verified_externally": False, "state_mutated": None,
        "candidate_code_executed": not enforce_runtime, "status": "failed", "commands": [],
        "runtime_source": "trusted_base" if enforce_runtime else "local_bootstrap_candidate",
        "limits": ["Cleanliness covers only worktree_revision, not an unobserved developer workspace.",
                   "This preflight does not verify branch rules or advance the masterplan."]}
    state_path = repo / "governance/masterplan/control/state.json"
    before = None
    try:
        for revision in (base, head, worktree_revision):
            if not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", revision):
                raise GateError("Revisions must be full lowercase commit IDs")
        report["pinned_files"] = assert_trusted_files(repo)
        before = state_path.read_bytes()
        collector = repo / "tools/acceptance/collect_changes.py"
        command = [sys.executable, "-I", "-B", str(collector), "--repo", str(repo),
                   "--base", base, "--head", head, "--worktree-revision", worktree_revision,
                   "--output", str(output_dir / "changes.json"), "--require-clean"]
        result = run(command, repo)
        report["commands"].append(result)
        if result["exit_code"]:
            raise GateError("Real Git change collection failed")
        changes = json.loads((output_dir / "changes.json").read_text())
        paths = changes["changed_files"]
        check_additional_protection(paths, enforce_runtime)
        check_candidate_symlinks(repo, head, paths)
        write_json(output_dir / "changed-files.json", paths)
        guard = repo / "governance/masterplan/control/planctl.py"
        prefix = [sys.executable, "-I", "-B", str(guard), "--project-root", str(repo)]
        commands = [prefix + ["validate"],
                    prefix + ["scope", "S00", "--changed-files", str(output_dir / "changed-files.json")],
                    [sys.executable, "-I", "-B", "-m", "unittest", "discover", "-s",
                     str(guard.parent), "-p", "test_planctl.py", "-v"],
                    [sys.executable, "-I", "-B", "-m", "unittest", "discover", "-s",
                     str(repo / "tools/acceptance"), "-p", "test_*.py", "-v"]]
        for command in commands:
            result = run(command, repo)
            report["commands"].append(result)
            if result["exit_code"]:
                raise GateError("Read-only check failed: " + " ".join(command))
        if state_path.read_bytes() != before:
            raise GateError("A read-only check changed the plan state")
        # Catch test byproducts or concurrent modifications as well.
        result = run([sys.executable, "-I", "-B", str(collector), "--repo", str(repo),
                      "--base", base, "--head", head, "--worktree-revision", worktree_revision,
                      "--output", str(output_dir / "changes-after.json"), "--require-clean"], repo)
        report["commands"].append(result)
        if result["exit_code"]:
            raise GateError("Workspace changed during validation")
        after = json.loads((output_dir / "changes-after.json").read_text())
        if after["changed_files"] != paths:
            raise GateError("Change set changed during validation")
        report.update(status="passed_local_checks", changed_files=paths,
                      independent_review="not_verified", branch_protection="not_verified")
    except (GateError, OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        report["error"] = str(error)
    finally:
        if before is not None:
            try:
                report["state_mutated"] = state_path.read_bytes() != before
            except OSError:
                report["state_mutated"] = True
            if report["state_mutated"]:
                report.update(status="failed", error="Read-only validation changed or removed the plan state")
    write_json(output_dir / "preflight.json", report)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, type=Path)
    parser.add_argument("--base", required=True)
    parser.add_argument("--head", required=True)
    parser.add_argument("--worktree-revision")
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--enforce-trusted-runtime", action="store_true")
    args = parser.parse_args()
    result = run_preflight(args.repo, args.base, args.head, args.worktree_revision or args.head,
                           args.output_dir, enforce_runtime=args.enforce_trusted_runtime)
    print(json.dumps({key: result.get(key) for key in
                      ("step_id", "status", "head_revision", "s00_completed", "error")}))
    return 0 if result["status"] == "passed_local_checks" else 1


if __name__ == "__main__":
    raise SystemExit(main())
