#!/usr/bin/env python3
"""Restore the exact private ExtremeLab checkpoint locally; never publish it."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile

ARCHIVE_SHA256 = "84577f10365a8017d3fa0caea5421afcaa52949d3d2ea5dc599f178c616c2d3d"
ARCHIVE_BYTES = 34855047
SOURCE_REVISION = "66b04bfc8a46f0ef6b5b69b06f9b8c168f124783"
PACKAGE_ROOT = "ExtremeLab_S06_NativeVertragsbindung"


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def checked_archive(path: Path) -> None:
    if path.is_symlink() or not path.is_file():
        raise ValueError("ARCHIVE_MUST_BE_REGULAR_FILE")
    if path.stat().st_size != ARCHIVE_BYTES or digest(path) != ARCHIVE_SHA256:
        raise ValueError("ARCHIVE_HASH_MISMATCH")
    with zipfile.ZipFile(path) as archive:
        seen: set[str] = set()
        total = 0
        for member in archive.infolist():
            name = PurePosixPath(member.filename)
            mode = member.external_attr >> 16
            if (name.is_absolute() or ".." in name.parts or "\\" in member.filename
                    or not name.parts or name.parts[0] != PACKAGE_ROOT
                    or member.filename in seen or stat.S_ISLNK(mode)):
                raise ValueError("UNSAFE_ARCHIVE_MEMBER")
            seen.add(member.filename)
            total += member.file_size
        if total > 1024 * 1024 * 1024:
            raise ValueError("ARCHIVE_SIZE_LIMIT")
        bad = archive.testzip()
        if bad is not None:
            raise ValueError("ARCHIVE_CRC_MISMATCH")


def restore(archive_path: Path, destination: Path) -> dict:
    archive_path = archive_path.absolute()
    destination = destination.absolute()
    if destination.exists() or destination.is_symlink():
        raise ValueError("DESTINATION_EXISTS_NOT_OVERWRITTEN")
    if not destination.parent.is_dir():
        raise ValueError("DESTINATION_PARENT_MISSING")
    if any(p.is_symlink() for p in [destination.parent, *destination.parent.parents]):
        raise ValueError("DESTINATION_PARENT_SYMLINK")
    if shutil.which("git") is None:
        raise ValueError("GIT_REQUIRED")
    checked_archive(archive_path)
    # Original runners require Linux/WSL and /usr/bin/git. Do not silently substitute.
    if not Path("/usr/bin/git").is_file():
        raise ValueError("ORIGINAL_CHECKOUT_REQUIRES_LINUX_OR_WSL_USR_BIN_GIT")
    with tempfile.TemporaryDirectory(prefix=".extremelab-restore-", dir=destination.parent) as tmp:
        work = Path(tmp)
        extracted = work / "original"
        with zipfile.ZipFile(archive_path) as archive:
            archive.extractall(extracted)
        source = extracted / PACKAGE_ROOT
        result_root = work / "result"
        result_root.mkdir()
        repository = result_root / "repository"
        env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
        subprocess.run([sys.executable, "-B", str(source / "tools/checkout_private.py"),
                        str(repository)], check=True, env=env)
        def git(*args: str) -> str:
            return subprocess.check_output(["git", "-c", "core.hooksPath=/dev/null",
                                            "-C", str(repository), *args], text=True).strip()
        if git("rev-parse", "HEAD") != SOURCE_REVISION or git("remote"):
            raise ValueError("RESTORED_REVISION_OR_REMOTE_MISMATCH")
        file_count = len(git("ls-files").splitlines())
        ref_count = len(git("for-each-ref", "--format=%(refname)", "refs/heads").splitlines())
        if file_count != 705 or ref_count != 14:
            raise ValueError("RESTORED_FILE_OR_REF_COUNT_MISMATCH")
        shutil.copytree(source / "private_inputs", result_root / "private_inputs")
        shutil.copyfile(source / "bundle-lock.json", result_root / "SOURCE_LOCK.json")
        receipt = {"status": "restored_private_only", "source_revision": SOURCE_REVISION,
                   "archive_sha256": ARCHIVE_SHA256, "tracked_files": file_count,
                   "branch_refs": ref_count, "remote": None, "public_upload": False}
        (result_root / "RESTORE_RECEIPT.json").write_text(json.dumps(receipt, indent=2) + "\n")
        if destination.exists() or destination.is_symlink():
            raise ValueError("DESTINATION_APPEARED_NOT_OVERWRITTEN")
        result_root.rename(destination)
        return receipt


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--destination", type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(restore(args.archive, args.destination), indent=2))
        return 0
    except (OSError, ValueError, zipfile.BadZipFile, subprocess.CalledProcessError) as exc:
        print(f"RESTORE_FAILED: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
