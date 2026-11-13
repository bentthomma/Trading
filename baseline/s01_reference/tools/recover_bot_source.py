#!/usr/bin/env python3
"""Reconstruct the pinned production 1.2.1 source payload. Never execute a bot.

This is a byte recovery tool, not a compiler, updater or release authorizer.
The archive, full payload and each provider segment are independently pinned.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import stat
import zipfile
from pathlib import Path, PurePosixPath
import brotli

ARCHIVE_SHA256 = '8baa784faa8fada648b30ff8b81d99edd21958149dbde1fd5a720459319c3c43'
ARCHIVE_ROOT = 'ExtremeLab_1_2_1_Integrationskandidat/'
PAYLOAD_SHA256 = '9e919ec1a94a5c0c569d7b9f46811ae98fed92a02b74773ef12d1821a14d81a3'
SEGMENTS = (
    (10500, 'c47e00bbee5c0ca058b82f22551fd889bd2c88e4', 'e2036b08e1760ee56a3511b4efa63f5ba06da7b8b6e2e6cbf0b6ea2faf892548'),
    (10500, '2af389e11c004cb94b600bd1b095f769c73b2435', '0e066b8cc210c917727a606690475db0075aa1ecc8aae05d59a35c25a7fbecfd'),
    (10406, '30b8b6e95fe03e4b798bd61768608deef0d126da', 'fe9d96d51756e84a34525d4e4ac0de8909c237f0b01881a4607bb55b7b6a74ed'),
)
EXPECTED_NAMES = frozenset((
    'ExtremeLabCTraderOnlineSocket.cs', 'ExtremeLabCore.cs',
    'ExtremeLabDiagnostics.cs', 'ExtremeLabDiagnosticsIntegration.cs',
    'ExtremeLabExecution.cs', 'ExtremeLabMobile.cs', 'ExtremeLabMobile.csproj',
    'ExtremeLabOnlinePublisher.cs', 'ExtremeLabRecovery.cs',
    'ExtremeLabRuntime.cs', 'ExtremeLabTelemetryOutbox.cs', 'ExtremeLabUI.cs',
))

class RecoveryError(ValueError):
    """A source or integrity condition failed; do not promote any bytes."""

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def validate_source_map(sources: object) -> dict[str, str]:
    if not isinstance(sources, dict) or set(sources) != EXPECTED_NAMES:
        raise RecoveryError('UNEXPECTED_SOURCE_SET')
    if not all(isinstance(v, str) for v in sources.values()):
        raise RecoveryError('NON_TEXT_SOURCE')
    return sources

def read_original_sources(archive: Path) -> tuple[dict[str, str], list[dict]]:
    if archive.is_symlink() or not archive.is_file():
        raise RecoveryError('ARCHIVE_NOT_REGULAR')
    if sha256(archive.read_bytes()) != ARCHIVE_SHA256:
        raise RecoveryError('ORIGINAL_ARCHIVE_HASH_MISMATCH')
    with zipfile.ZipFile(archive) as z:
        names = z.namelist()
        if len(names) != len(set(names)) or z.testzip() is not None:
            raise RecoveryError('INVALID_ARCHIVE')
        for item in z.infolist():
            path = PurePosixPath(item.filename)
            if path.is_absolute() or '..' in path.parts or '\\' in item.filename or stat.S_ISLNK(item.external_attr >> 16):
                raise RecoveryError('UNSAFE_ARCHIVE_MEMBER')
        manifest_name = ARCHIVE_ROOT + 'SHA256SUMS.txt'
        expected = {}
        for line in z.read(manifest_name).decode('utf8').splitlines():
            digest, relative = line.split('  ', 1)
            if relative in expected or not re.fullmatch('[0-9a-f]{64}', digest):
                raise RecoveryError('INVALID_MANIFEST')
            expected[relative] = digest
        if {n.removeprefix(ARCHIVE_ROOT) for n in names if n != manifest_name} != set(expected):
            raise RecoveryError('ARCHIVE_FILE_SET_MISMATCH')
        records = []
        for relative, digest in expected.items():
            data = z.read(ARCHIVE_ROOT + relative)
            if sha256(data) != digest:
                raise RecoveryError('ARCHIVE_MEMBER_HASH_MISMATCH')
            records.append({'path': relative, 'bytes': len(data), 'sha256': digest})
        sources = {n.removeprefix(ARCHIVE_ROOT + 'src/'): z.read(n).decode('utf8')
                   for n in names if n.startswith(ARCHIVE_ROOT + 'src/')}
        return validate_source_map(sources), records

def pack_sources(sources: dict[str, str]) -> bytes:
    validate_source_map(sources)
    data = json.dumps(sources, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf8')
    packed = brotli.compress(data, quality=11)
    if sha256(packed) != PAYLOAD_SHA256:
        raise RecoveryError('BOT_SOURCE_HASH_MISMATCH')
    return packed

def split_verified(packed: bytes) -> tuple[bytes, ...]:
    if len(packed) != sum(row[0] for row in SEGMENTS) or sha256(packed) != PAYLOAD_SHA256:
        raise RecoveryError('BOT_SOURCE_HASH_MISMATCH')
    result = []; offset = 0
    for size, uid, digest in SEGMENTS:
        chunk = packed[offset:offset+size]; offset += size
        if hashlib.sha1(chunk).hexdigest() != uid or sha256(chunk) != digest:
            raise RecoveryError('PROVIDER_SEGMENT_MISMATCH')
        result.append(chunk)
    return tuple(result)

def verify_segments(directory: Path, sources: dict[str, str]) -> dict:
    if {p.name for p in directory.glob('bot-src.*')} != {'bot-src.0', 'bot-src.1', 'bot-src.2'}:
        raise RecoveryError('SEGMENT_FILE_SET_MISMATCH')
    chunks = []
    for i in range(3):
        path = directory / f'bot-src.{i}'
        if path.is_symlink() or not path.is_file():
            raise RecoveryError('SEGMENT_NOT_REGULAR')
        chunks.append(path.read_bytes())
    packed = b''.join(chunks)
    if split_verified(packed) != tuple(chunks):
        raise RecoveryError('SEGMENT_BOUNDARY_MISMATCH')
    recovered = validate_source_map(json.loads(brotli.decompress(packed)))
    if recovered != sources:
        raise RecoveryError('DECODED_SOURCE_DIFFERS')
    return {
        'source_archive_sha256': ARCHIVE_SHA256,
        'payload_sha256': sha256(packed), 'payload_bytes': len(packed),
        'engine_version': '1.2.1', 'engine19_recovered': False,
        'files': [{'path': n, 'bytes': len(sources[n].encode('utf8')), 'sha256': sha256(sources[n].encode('utf8'))} for n in sorted(sources)],
        'segments': [{'path': f'src/bot-src.{i}', 'bytes': len(b), 'sha1': hashlib.sha1(b).hexdigest(), 'sha256': sha256(b)} for i,b in enumerate(chunks)],
        'binary_build_executed': False, 'bot_executed': False,
        'rights_or_independent_release_approval_inferred': False,
    }

def recover(archive: Path, destination: Path) -> dict:
    sources, records = read_original_sources(archive)
    chunks = split_verified(pack_sources(sources))
    # Do not silently merge or replace any existing source directory.
    destination.mkdir(parents=True, exist_ok=False)
    for i, chunk in enumerate(chunks):
        with (destination / f'bot-src.{i}').open('xb') as output:
            output.write(chunk)
    proof = verify_segments(destination, sources)
    proof['original_archive_manifest_verified_files'] = len(records)
    return proof

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(recover(args.archive, args.output), indent=2))
    except (OSError, ValueError, zipfile.BadZipFile) as exc:
        parser.exit(2, f'Recovery rejected: {exc}\n')
