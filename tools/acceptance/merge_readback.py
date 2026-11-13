#!/usr/bin/env python3
"""Offline-only, read-only *observer* of a previously executed two-parent Git merge.

This is not a merge writer, status publisher, independent reviewer, S00 completion
or authorization mechanism. It operates on local Git objects and *caller-supplied*
readback snapshots. It does not make network calls or write GitHub/broker state.
`git merge-tree --write-tree` runs only in a disposable verified object copy.
No source configuration, replacement refs, hooks or merge drivers are loaded.

Accepted policy is deliberately narrower than GitHub's full merge settings:
  - exact pinned GitHub-reported original root, tested head, tested base;
  - exactly two merge parents in that order (base, head);
  - final tree must equal the deterministic clean three-way merge-tree;
  - two independent ref reads must still point to the same final commit;
  - no reviewer approval is required; Git object/source checks remain.
Squash, rebase, octopus, fast-forward, and manual conflict resolution are not
interpreted as success by this candidate. No platform authenticity is conferred
on JSON snapshots supplied by the caller.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys

# In isolated Python (-I), only the sibling source pinned by the candidate is loaded.
# No imports from the ambient working directory or PYTHONPATH are required.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from github_s00 import CIError
from merge_object_view import MergeObjectView, BoundaryError
from git_object_boundary import InspectionError

SHA1 = re.compile(r"[0-9a-f]{40}\Z")
SHA256 = re.compile(r"[0-9a-f]{64}\Z")
BRANCH = re.compile(r"[A-Za-z0-9._/-]+\Z")


class ReadbackError(RuntimeError):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def need(condition: bool, code: str) -> None:
    if not condition:
        raise ReadbackError(code)


def sha(value: object, label: str) -> str:
    need(type(value) is str and SHA1.fullmatch(value) is not None, label + "_INVALID")
    return value


def member(obj: object, key: str) -> object:
    need(type(obj) is dict and key in obj, "MISSING_" + key.upper())
    return obj[key]


def select(obj: object, *keys: str) -> object:
    for key in keys:
        obj = member(obj, key)
    return obj


def reference_sha(ref: object, expected_ref: str) -> str:
    need(select(ref, "ref") == "refs/heads/" + expected_ref, "BRANCH_NAME_MISMATCH")
    need(select(ref, "object", "type") == "commit", "BRANCH_REF_NOT_COMMIT")
    return sha(select(ref, "object", "sha"), "BRANCH_REF_SHA")


def verify(repo: Path, pinned: dict, snapshot: dict) -> dict:
    """Verify observational consistency; never grant a release/plan permission."""
    need(type(pinned) is dict and type(snapshot) is dict, "INPUT_MALFORMED")
    root = sha(member(pinned, "trusted_root_sha"), "TRUSTED_ROOT_SHA")
    base = sha(member(pinned, "validated_base_sha"), "PINNED_BASE_SHA")
    head = sha(member(pinned, "validated_head_sha"), "PINNED_HEAD_SHA")
    repo_id = member(pinned, "repository_id")
    need(type(repo_id) is int and repo_id > 0, "REPOSITORY_ID_INVALID")
    pr_number = member(pinned, "pr_number")
    need(type(pr_number) is int and pr_number > 0, "PR_NUMBER_INVALID")
    branch = member(pinned, "base_ref")
    need(type(branch) is str and BRANCH.fullmatch(branch) is not None
         and not branch.startswith("/") and ".." not in branch
         and "//" not in branch and not branch.endswith("/")
         and not branch.endswith(".lock"), "BASE_REF_INVALID")
    need(base != head, "BASE_HEAD_IDENTICAL")

    pr = member(snapshot, "pr")
    need(select(pr, "number") == pr_number and type(pr["number"]) is int,
         "PR_NUMBER_CHANGED")
    need(select(pr, "state") == "closed" and select(pr, "merged") is True,
         "PR_NOT_MERGED")
    need(type(member(pr, "merged_at")) is str and bool(pr["merged_at"]),
         "MERGE_TIMESTAMP_MISSING")
    need(select(pr, "head", "sha") == head, "PR_HEAD_CHANGED")
    need(select(pr, "base", "ref") == branch, "PR_BASE_REF_CHANGED")
    need(select(pr, "base", "repo", "id") == repo_id and
         type(pr["base"]["repo"]["id"]) is int, "PR_REPOSITORY_CHANGED")
    merged = sha(select(pr, "merge_commit_sha"), "MERGE_COMMIT_SHA")

    left = reference_sha(member(snapshot, "branch_ref_before"), branch)
    right = reference_sha(member(snapshot, "branch_ref_after"), branch)
    need(left == merged and right == merged, "POST_MERGE_BRANCH_MOVED")
    observed_commit = member(snapshot, "commit")
    need(sha(select(observed_commit, "sha"), "API_COMMIT_SHA") == merged,
         "PROVIDER_COMMIT_ID_CHANGED")

    try:
        with MergeObjectView(repo, branch, merged) as view:
            view.validate_graph(root, base, head, merged)
            for child in (base, head, merged):
                view.ancestor(root, child)
            expected_parents = [base, head]
            tree, parents = view.info(merged)
            need(parents == expected_parents, "MERGE_PARENTS_MISMATCH")
        
            provider_tree = sha(select(observed_commit, "commit", "tree", "sha"), "API_TREE_SHA")
            need(provider_tree == tree, "PROVIDER_TREE_DISAGREES_WITH_GIT")
            api_parents = member(observed_commit, "parents")
            need(type(api_parents) is list and len(api_parents) == 2, "PROVIDER_PARENTS_INVALID")
            need([sha(select(p, "sha"), "API_PARENT_SHA") for p in api_parents] == parents,
                 "PROVIDER_PARENTS_DISAGREE_WITH_GIT")
        
            expected_tree = view.merge_tree(base, head)
            need(expected_tree == tree, "MERGE_RESULT_TREE_CHANGED")
    except BoundaryError as error:
        raise ReadbackError(error.code) from None
    except InspectionError as error:
        code = str(error)
        if code == "LOCAL_OBJECT_READ_FAILED":
            code = "LOCAL_GIT_OBJECT_UNAVAILABLE"
        raise ReadbackError(code) from None
    except (OSError, UnicodeError, ValueError):
        raise ReadbackError("LOCAL_GIT_EVIDENCE_UNREADABLE") from None

    return {
        "verdict": "OBSERVED_MERGE_INTEGRITY_ONLY",
        "git_original_root_sha": root,
        "validated_base_sha": base,
        "validated_head_sha": head,
        "observed_merge_sha": merged,
        "observed_result_tree_sha": tree,
        "recomputed_result_tree_sha": expected_tree,
        "independent_review_required": False,
        "branch_readbacks": 2,
        "merge_strategy": "TWO_PARENT_CLEAN_MERGE_ONLY",
        "provider_snapshot_authenticated_by_this_tool": False,
        "broker_actions": False,
        "github_writes": False,
        "s00_completed": False,
        "release_authorized": False,
    }


def no_duplicates(pairs):
    output = {}
    for key, value in pairs:
        if key in output:
            raise ReadbackError("DUPLICATE_JSON_MEMBER")
        output[key] = value
    return output


def parse_json(path: Path) -> dict:
    # Intentionally small offline snapshots; large provider captures are not required here.
    need(path.is_file() and path.stat().st_size <= 4_000_000, "SNAPSHOT_FILE_MISSING_OR_TOO_LARGE")
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=no_duplicates,
                      parse_constant=lambda value: (_ for _ in ()).throw(ReadbackError("NONFINITE_JSON")))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True, help="isolated offline local Git clone")
    parser.add_argument("--binding", type=Path, required=True)
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--result", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        result = verify(args.repo, parse_json(args.binding), parse_json(args.snapshot))
        exit_code = 0
    except (ReadbackError, CIError, OSError, subprocess.TimeoutExpired,
            subprocess.SubprocessError, ValueError, TypeError, KeyError, json.JSONDecodeError) as error:
        # Never print environment variables, provider payloads, credentials or raw errors.
        result = {
            "verdict": "UNVERIFIED",
            "reason": error.code if isinstance(error, ReadbackError) else "INTERNAL_OR_INPUT_ERROR",
            "s00_completed": False,
            "release_authorized": False,
            "github_writes": False,
            "broker_actions": False,
        }
        exit_code = 2
    args.result.parent.mkdir(parents=True, exist_ok=True)
    args.result.write_text(json.dumps(result, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, sort_keys=True))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
