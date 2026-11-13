#!/usr/bin/env python3
"""Stage the pinned public subset in a NEW directory; no network and no git push."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import tempfile

SOURCE_REVISION = "66b04bfc8a46f0ef6b5b69b06f9b8c168f124783"
MANIFEST_SHA256 = "d76c06594d27ed499efec53dea717f5c23899f36da40dcecb59a09ef38c631f8"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def stage(source: Path, manifest: Path, destination: Path) -> dict:
    source, manifest, destination = source.absolute(), manifest.absolute(), destination.absolute()
    if destination.exists() or destination.is_symlink():
        raise ValueError("DESTINATION_EXISTS_NOT_OVERWRITTEN")
    if not destination.parent.is_dir():
        raise ValueError("DESTINATION_PARENT_MISSING")
    for path in [source, manifest, destination.parent]:
        if any(item.is_symlink() for item in [path, *path.parents]):
            raise ValueError("SYMLINK_NOT_ALLOWED")
    if not manifest.is_file() or sha(manifest) != MANIFEST_SHA256:
        raise ValueError("MANIFEST_HASH_MISMATCH")
    data = json.loads(manifest.read_text())
    if data["source_revision"] != SOURCE_REVISION:
        raise ValueError("MANIFEST_REVISION_MISMATCH")
    def git(*args: str) -> str:
        return subprocess.check_output(["git", "-c", "core.hooksPath=/dev/null",
                                        "-C", str(source), *args], text=True).strip()
    if git("rev-parse", "HEAD") != SOURCE_REVISION:
        raise ValueError("SOURCE_REVISION_CHANGED_REVIEW_NEW_SNAPSHOT_FIRST")
    if git("status", "--porcelain=v1", "--untracked-files=all"):
        raise ValueError("SOURCE_WORKTREE_NOT_CLEAN")
    seen: set[str] = set()
    for item in data["files"]:
        rel = PurePosixPath(item["path"])
        if (rel.is_absolute() or ".." in rel.parts or "\\" in item["path"]
                or item["path"] in seen or ".git" in rel.parts
                or item["path"].startswith((".github/workflows/", "private_inputs/", "secrets/"))):
            raise ValueError("UNSAFE_EXPORT_PATH")
        seen.add(item["path"])
        original = source.joinpath(*rel.parts)
        if not original.is_file() or any(p.is_symlink() for p in [original, *original.parents]):
            raise ValueError("SOURCE_NOT_REGULAR_FILE")
        if original.stat().st_size != item["bytes"] or sha(original) != item["sha256"]:
            raise ValueError("SOURCE_BYTES_CHANGED: " + item["path"])
    with tempfile.TemporaryDirectory(prefix=".extremelab-export-", dir=destination.parent) as tmp:
        result = Path(tmp) / "snapshot"
        result.mkdir()
        for item in data["files"]:
            target = result / item["path"]
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source / item["path"], target)
            if sha(target) != item["sha256"]:
                raise ValueError("COPY_HASH_MISMATCH")
        receipt = {"status": "staged_only_not_uploaded", "source_revision": SOURCE_REVISION,
                   "selected_files": len(data["files"]), "excluded_files": len(data["excluded"]),
                   "source_total_files": data["source_total_files"],
                   "manifest_sha256": MANIFEST_SHA256, "private_history_exported": False,
                   "complete_private_test_workspace": False, "public_upload": False}
        (result / "PUBLIC_SNAPSHOT_RECEIPT.json").write_text(json.dumps(receipt, indent=2) + "\n")
        if destination.exists() or destination.is_symlink():
            raise ValueError("DESTINATION_APPEARED_NOT_OVERWRITTEN")
        result.rename(destination)
        return receipt


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(stage(args.source, args.manifest, args.destination), indent=2))
        return 0
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as exc:
        print(f"EXPORT_FAILED: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
