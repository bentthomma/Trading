#!/usr/bin/env python3
"""Collect a real Git object diff and an explicitly identified worktree.

No checkout, fetch, hooks, external diff/textconv or configured content filters
are executed. Call this trusted file, not a copy supplied by a PR. Repositories
must be quiescent. Sparse/assume-unchanged indexes, unmerged indexes, ambiguous
paths and configured content filters fail closed. Ignored files count as dirty.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile


class CollectionError(Exception):
    """No complete and trustworthy change report could be produced."""


OID = re.compile(r"(?:[0-9a-f]{40}|[0-9a-f]{64})\Z")
MODES = {"000000", "100644", "100755", "120000", "160000"}
MAX_OUTPUT = 64 * 1024 * 1024
DIFF = ["--raw", "-z", "--no-abbrev", "--no-ext-diff", "--no-textconv",
        "--find-renames=50%", "--find-copies=50%", "--find-copies-harder",
        "--ita-visible-in-index"]


def full_oid(value: str) -> str:
    if not OID.fullmatch(value):
        raise CollectionError("A full lowercase 40- or 64-character commit ID is required.")
    return value


def path_text(raw: bytes) -> str:
    try:
        value = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise CollectionError("Non-UTF-8 Git paths are unsupported; no files were omitted.") from exc
    # LF, tabs, leading '-' and Unicode are legitimate names, never line-split.
    if (not value or "\x00" in value or "\\" in value or value.startswith("/")
            or re.match(r"^[A-Za-z]:", value)
            or any(part in {"", ".", ".."} for part in value.split("/"))):
        raise CollectionError("Unsafe/ambiguous Git path: " + repr(value))
    return value


def nul_records(raw: bytes) -> list[bytes]:
    if raw and not raw.endswith(b"\0"):
        raise CollectionError("Malformed NUL-delimited Git output.")
    return raw[:-1].split(b"\0") if raw else []


def no_symlink_components(path: Path, include_leaf: bool = True) -> None:
    probe = path if include_leaf else path.parent
    for item in [*reversed(probe.parents), probe]:
        try:
            mode = item.lstat().st_mode
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(mode):
            raise CollectionError("Symlink path component is not followed: " + repr(str(item)))


class Git:
    def __init__(self, repo: Path):
        self.repo = Path(os.path.abspath(repo))
        no_symlink_components(self.repo)
        if (self.repo / ".git").is_symlink():
            raise CollectionError("Repository Git metadata symlink is not followed.")
        binary = shutil.which("git", path=os.defpath)
        if not binary:
            raise CollectionError("System Git is unavailable.")
        self.env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
        self.env.update({"PATH": os.defpath, "LC_ALL": "C", "GIT_CONFIG_NOSYSTEM": "1",
                         "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_SYSTEM": os.devnull,
                         "GIT_OPTIONAL_LOCKS": "0", "GIT_NO_REPLACE_OBJECTS": "1",
                         "GIT_NO_LAZY_FETCH": "1", "GIT_ALLOW_PROTOCOL": "",
                         "GIT_PROTOCOL_FROM_USER": "0",
                         "GIT_ATTR_NOSYSTEM": "1", "GIT_TERMINAL_PROMPT": "0",
                         "GIT_PAGER": "", "PAGER": ""})
        self.prefix = [binary, "--no-pager", "-c", "core.hooksPath=" + os.devnull,
                       "-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false",
                       "-c", "core.fileMode=true", "-c", "core.ignoreStat=false",
                       "-c", "core.trustctime=true", "-c", "core.checkStat=default",
                       "-c", "submodule.recurse=false", "-c", "diff.external=",
                       "-c", "core.attributesFile=" + os.devnull,
                       "-c", "core.excludesFile=" + os.devnull, "-C", str(self.repo)]
        if self.run("rev-parse", "--is-bare-repository").strip() != b"false":
            raise CollectionError("A non-bare worktree is required.")
        top = Path(os.fsdecode(self.run("rev-parse", "--show-toplevel").rstrip(b"\n")))
        if top != self.repo:
            raise CollectionError("--repo must identify the worktree root exactly.")
        # Even a status/diff may invoke a clean filter. Refuse these rather than
        # executing repo-configured programs or silently changing their meaning.
        filters = self.run("config", "--null", "--name-only", "--get-regexp",
                           r"^filter\..*\.(clean|smudge|process)$", ok=(0, 1))
        if filters:
            raise CollectionError("Configured Git content filters are unsupported (execution refused).")
        if self.run("config", "--null", "--name-only", "--get-regexp",
                    r"^(extensions\.partialclone|remote\..*\.promisor)$", ok=(0, 1)):
            raise CollectionError("Partial/promisor repositories are unsupported; implicit fetching is refused.")
        graft_path = Path(os.fsdecode(self.run("rev-parse", "--git-path", "info/grafts").rstrip(b"\n")))
        graft_path = graft_path if graft_path.is_absolute() else self.repo / graft_path
        if graft_path.exists() or graft_path.is_symlink():
            raise CollectionError("Legacy grafted history is unsupported; real commit ancestry is required.")

    def run(self, *args: str, ok: tuple[int, ...] = (0,)) -> bytes:
        try:
            result = subprocess.run(self.prefix + list(args), env=self.env,
                                    stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, timeout=90, check=False)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise CollectionError("Git operation unavailable or timed out: " + args[0]) from exc
        if result.returncode not in ok:
            # Git stderr can include configured values; do not echo it.
            raise CollectionError(f"Git {args[0]} failed (exit {result.returncode}).")
        if len(result.stdout) > MAX_OUTPUT:
            raise CollectionError("Git output exceeds the explicit collection limit.")
        return result.stdout

    def commit(self, value: str) -> str:
        full_oid(value)
        found = self.run("rev-parse", "--verify", "--end-of-options", value + "^{commit}").strip()
        if found != value.encode("ascii"):
            raise CollectionError("Revision is not the exact supplied commit object.")
        return value

    def head(self) -> str:
        try:
            return full_oid(self.run("rev-parse", "--verify", "HEAD^{commit}").strip().decode("ascii"))
        except UnicodeError as exc:
            raise CollectionError("Invalid HEAD object ID.") from exc


def raw_diff(raw: bytes, stage: str) -> list[dict]:
    fields = nul_records(raw)
    result = []
    i = 0
    while i < len(fields):
        header = fields[i]
        i += 1
        if not header.startswith(b":"):
            raise CollectionError("Malformed raw Git diff header.")
        try:
            old_mode, new_mode, old_oid, new_oid, status = header[1:].decode("ascii").split(" ")
        except (UnicodeError, ValueError) as exc:
            raise CollectionError("Malformed raw Git diff metadata.") from exc
        if (old_mode not in MODES or new_mode not in MODES
                or not OID.fullmatch(old_oid) or not OID.fullmatch(new_oid)
                or not re.fullmatch(r"[ADMT]|[RC][0-9]{1,3}", status)):
            raise CollectionError("Unsupported/unmerged Git diff record.")
        count = 2 if status[0] in "RC" else 1
        if i + count > len(fields):
            raise CollectionError("Incomplete raw Git diff path pair.")
        paths = [path_text(x) for x in fields[i:i + count]]
        i += count
        old_path = None if status == "A" else paths[0]
        new_path = None if status == "D" else paths[-1]
        entry = {"stage": stage, "status": status, "old_path": old_path,
                 "new_path": new_path, "paths": paths,
                 "old_mode": old_mode, "new_mode": new_mode,
                 "old_oid": old_oid, "new_oid": new_oid,
                 "is_gitlink": "160000" in (old_mode, new_mode)}
        if entry["is_gitlink"]:
            entry["submodule"] = {"old_commit": old_oid if old_mode == "160000" and set(old_oid) != {"0"} else None,
                                  "new_commit": new_oid if new_mode == "160000" and set(new_oid) != {"0"} else None,
                                  "change_status": status}
        result.append(entry)
    return result


def path_kind(repo: Path, name: str) -> str:
    path = repo / name
    no_symlink_components(path, include_leaf=False)
    try:
        mode = path.lstat().st_mode
    except FileNotFoundError:
        return "absent"
    if stat.S_ISLNK(mode):
        return "symlink"
    if stat.S_ISDIR(mode):
        return "directory"
    if stat.S_ISREG(mode):
        return "regular"
    raise CollectionError("Special worktree file is unsupported: " + repr(name))


def worktree_snapshot(git: Git, revision: str, depth: int = 0) -> dict:
    if depth > 8:
        raise CollectionError("Submodule nesting exceeds the explicit collection limit.")
    flags = nul_records(git.run("ls-files", "-v", "-z"))
    if any(not x or chr(x[0]).islower() or x[:1] == b"S" for x in flags):
        raise CollectionError("Sparse/skip-worktree or assume-unchanged index flags are unsupported.")
    index = git.run("ls-files", "--stage", "-z")
    links = []
    for entry in nul_records(index):
        try:
            info, name = entry.split(b"\t", 1)
            mode, oid, index_stage = info.decode("ascii").split(" ")
        except (ValueError, UnicodeError) as exc:
            raise CollectionError("Malformed Git index metadata.") from exc
        name = path_text(name)
        no_symlink_components(git.repo / name, include_leaf=False)
        if index_stage != "0":
            raise CollectionError("Unmerged index is unsupported; no clean report is possible.")
        if mode == "160000":
            links.append((name, full_oid(oid)))
    staged = raw_diff(git.run("diff", "--cached", *DIFF,
                             "--ignore-submodules=none", revision, "--"), "staged")
    unstaged = raw_diff(git.run("diff", *DIFF, "--ignore-submodules=dirty", "--"), "unstaged")
    untracked = [path_text(x) for x in nul_records(git.run("ls-files", "--others", "--exclude-standard", "-z"))]
    ignored = [path_text(x) for x in nul_records(git.run("ls-files", "--others", "--ignored", "--exclude-standard", "-z"))]
    kinds = {name: path_kind(git.repo, name) for name in sorted(set(untracked + ignored))}
    modules = []
    for name, index_commit in links:
        kind = path_kind(git.repo, name)
        item = {"path": name, "index_commit": index_commit, "head_commit": None,
                "state": "uninitialized", "dirty": False, "worktree": None}
        if kind == "absent":
            item.update(state="absent", dirty=True)
        elif kind in {"regular", "symlink"}:
            item.update(state="type_changed_to_" + kind, dirty=True)
        elif kind == "directory":
            marker = git.repo / name / ".git"
            if marker.is_symlink():
                raise CollectionError("Submodule Git metadata symlink is not followed.")
            if marker.exists():
                child = Git(git.repo / name)
                head = child.head()
                child_snapshot = worktree_snapshot(child, head, depth + 1)
                item.update(head_commit=head, state="initialized", worktree=child_snapshot,
                            dirty=head != index_commit or not child_snapshot["clean"])
            elif any((git.repo / name).iterdir()):
                raise CollectionError("Uninitialized submodule contains uninspectable files: " + repr(name))
        modules.append(item)
    clean = not (staged or unstaged or untracked or ignored or any(m["dirty"] for m in modules))
    return {"staged": staged, "unstaged": unstaged, "untracked": sorted(untracked),
            "ignored": sorted(ignored), "untracked_kinds": kinds, "submodules": modules,
            "index_fingerprint": hashlib.sha256(index).hexdigest(), "clean": clean}


def snapshot_paths(snapshot: dict, prefix: str = "") -> set[str]:
    paths = {prefix + path for entry in snapshot["staged"] + snapshot["unstaged"] for path in entry["paths"]}
    paths.update(prefix + path for path in snapshot["untracked"] + snapshot["ignored"])
    for module in snapshot["submodules"]:
        if module["dirty"]:
            paths.add(prefix + module["path"])
        if module["worktree"]:
            paths.update(snapshot_paths(module["worktree"], prefix + module["path"] + "/"))
    return paths


def collect(repo: Path, base: str, head: str, worktree_revision: str | None = None) -> dict:
    git = Git(repo)
    base, head = git.commit(base), git.commit(head)
    revision = git.commit(worktree_revision or head)
    if git.head() != revision:
        raise CollectionError("Actual checked-out HEAD differs from worktree_revision.")
    git.run("merge-base", "--is-ancestor", base, head)
    commits = raw_diff(git.run("diff", *DIFF, "--ignore-submodules=none", base, head, "--"), "commit")
    first = worktree_snapshot(git, revision)
    second = worktree_snapshot(git, revision)
    if first != second or git.head() != revision:
        raise CollectionError("Worktree/index/HEAD changed during collection; retry when quiescent.")
    paths = {path for entry in commits for path in entry["paths"]} | snapshot_paths(first)
    return {"schema_version": 1, "base_revision": base, "head_revision": head,
            "worktree_revision": revision,
            "mode": "committed_diff_with_trusted_base_worktree" if revision != head else "head_checkout",
            "candidate_head_checked_out": revision == head,
            "changed_files": sorted(paths), "commit_changes": commits,
            "worktree_changes": first["staged"] + first["unstaged"],
            "untracked_files": first["untracked"], "ignored_untracked_files": first["ignored"],
            "untracked_kinds": first["untracked_kinds"], "submodules": first["submodules"],
            "clean_worktree": first["clean"], "index_fingerprint": first["index_fingerprint"],
            "consistency": "two_identical_observed_worktree_snapshots",
            "scope_note": "Cleanliness describes worktree_revision only; candidate objects are compared without checkout. Ignored files count as dirty. Global Git configuration is disabled."}


def write_report(output: Path, report: dict, git: Git) -> None:
    output = Path(os.path.abspath(output))
    no_symlink_components(output)
    if not output.parent.is_dir():
        raise CollectionError("Report parent directory must already exist.")
    forbidden_roots = [git.repo]
    for flag in ["--absolute-git-dir", "--git-common-dir"]:
        raw = Path(os.fsdecode(git.run("rev-parse", flag).rstrip(b"\n")))
        forbidden_roots.append(Path(os.path.abspath(raw if raw.is_absolute() else git.repo / raw)))
    if any(output.is_relative_to(root) for root in forbidden_roots):
        raise CollectionError("Report output must be outside the worktree and its Git metadata.")
    # Atomically replace a report, never follow an output symlink or write into
    # the candidate tree. The caller owns this external parent directory.
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=output.parent,
                                         prefix=".changes-", delete=False) as handle:
            temporary = Path(handle.name)
            json.dump(report, handle, ensure_ascii=True, indent=2)
            handle.write("\n")
        no_symlink_components(output)
        os.replace(temporary, output)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, type=Path)
    parser.add_argument("--base", required=True)
    parser.add_argument("--head", required=True)
    parser.add_argument("--worktree-revision", help="Full checked-out commit; defaults to --head.")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--require-clean", action="store_true")
    args = parser.parse_args(argv)
    try:
        report = collect(args.repo, args.base, args.head, args.worktree_revision)
        report["require_clean"] = args.require_clean
        report["accepted"] = not args.require_clean or report["clean_worktree"]
        write_report(args.output, report, Git(args.repo))
        if not report["accepted"]:
            print("Change collection rejected: inspected worktree is dirty (including ignored files).", file=sys.stderr)
            return 1
        return 0
    except (CollectionError, OSError) as exc:
        print("Change collection failed: " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
