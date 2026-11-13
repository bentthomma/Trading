#!/usr/bin/env python3
"""Exact first-import self-test. NOT a privileged CI gate or plan completion.

Only the original README-only Git commit is eligible. The full Git tree,
byte manifest, modes and all unchanged baseline files are checked. Normal
changes continue to use trusted_gate.run_preflight with its immutable baseline.
All code here is candidate-authored: these checks are evidence, not authority.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys

FIRST_REMOTE_COMMIT = '1a5cfe9d3139276f5432c79a8ee0be1938b7066c'
FIRST_TREE = '47fdd2b4cb70efc67db93f93f178015259204d86'
README_BLOB = '7025cd085c2f9a785685aa3b4b7bae14f827dcd2'
# Historical provenance only, not the revision of all current candidate bytes.
SOURCE_COMMIT = 'e44095e8cb856679d73acc32e3a0f49245451ed2'
MANIFEST = 'governance/s00-first-import-manifest.json'
# These bind names/modes and the complete fixed candidate file set. They do
# not recursively hash this checker or claim independent review of mutable code.
PATH_MODE_SHA256 = 'f17ee65ffa452a17430a7044800112ade0dba0cfd0b61bc9c6996f11f70d8591'
IMMUTABLE_SHA256 = '532161b31587f87acb68627257dc2f1d4692b083d6bc97e9003726a7d33bc41b'
MUTABLE_PATHS = frozenset({
    '.github/workflows/plan-gates.yml',
    'docs/plan/S00_CANDIDATE_CHECKS.md',
    'tools/acceptance/candidate_ci.py',
    'tools/acceptance/first_import_candidate.py',
    'tools/acceptance/test_first_import_candidate.py',
    MANIFEST,
})

class ImportCheckError(ValueError):
    """The first-import self-test cannot establish its bounded byte contract."""


def digest_json(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=True, sort_keys=True,
                                    separators=(',', ':')).encode()).hexdigest()


def load_sibling(name):
    spec = importlib.util.spec_from_file_location('first_import_' + name,
                                                Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def strict_json(data):
    def pairs(items):
        out = {}
        for key, value in items:
            if key in out:
                raise ImportCheckError('Duplicate JSON key: ' + key)
            out[key] = value
        return out
    def invalid(value):
        raise ImportCheckError('Non-finite JSON constant: ' + value)
    try:
        return json.loads(data, object_pairs_hook=pairs, parse_constant=invalid)
    except (ValueError, UnicodeError) as err:
        raise ImportCheckError('Invalid JSON: ' + str(err)) from err


def tree_entries(git, revision):
    raw = git.run('ls-tree', '-r', '-z', '--full-tree', revision)
    if raw and not raw.endswith(b'\0'):
        raise ImportCheckError('Malformed Git tree listing')
    result = {}
    for line in raw.split(b'\0'):
        if not line:
            continue
        metadata, name = line.split(b'\t', 1)
        mode, kind, oid = metadata.decode('ascii').split(' ')
        path = name.decode('utf-8', 'strict')
        if (not path or path.startswith('/') or '\\' in path
                or any(part in ('', '.', '..') for part in path.split('/'))
                or any(ord(c) < 32 for c in path)):
            raise ImportCheckError('Unsafe tree path')
        if kind != 'blob' or mode not in ('100644', '100755'):
            raise ImportCheckError('Only ordinary files are allowed: ' + path)
        if path in result:
            raise ImportCheckError('Duplicate tree path')
        result[path] = {'mode': mode, 'oid': oid}
    return result


def inspect_import(repo: Path, base: str, head: str) -> dict:
    """Read Git objects only. Call collector separately for worktree cleanliness."""
    if base != FIRST_REMOTE_COMMIT:
        raise ImportCheckError('Not the exact first-import base commit')
    collector = load_sibling('collect_changes')
    git = collector.Git(repo)
    git.commit(base); git.commit(head)
    if git.head() != head:
        raise ImportCheckError('Worktree HEAD differs from candidate')
    git.run('merge-base', '--is-ancestor', base, head)
    if git.run('rev-parse', base + '^{tree}').strip().decode() != FIRST_TREE:
        raise ImportCheckError('First-import base tree differs')
    if tree_entries(git, base) != {'README.md': {'mode': '100644', 'oid': README_BLOB}}:
        raise ImportCheckError('Base is not the exact README-only tree')
    entries = tree_entries(git, head)
    if entries.get('README.md') != {'mode': '100644', 'oid': README_BLOB}:
        raise ImportCheckError('Original README was changed or removed')
    names_modes = [[path, entries[path]['mode']] for path in sorted(entries)]
    if digest_json(names_modes) != PATH_MODE_SHA256:
        raise ImportCheckError('Exact allowed path/mode set differs')
    raw_manifest = git.run('cat-file', 'blob', entries[MANIFEST]['oid'])
    manifest = strict_json(raw_manifest)
    keys = {'schema_version', 'purpose', 'base_commit', 'source_commit', 'file_count', 'files'}
    if not isinstance(manifest, dict) or set(manifest) != keys:
        raise ImportCheckError('Invalid manifest fields')
    if (type(manifest['schema_version']) is not int or manifest['schema_version'] != 1
            or manifest['purpose'] != 'untrusted_first_import_self_test'
            or manifest['base_commit'] != FIRST_REMOTE_COMMIT
            or manifest['source_commit'] != SOURCE_COMMIT
            or type(manifest['file_count']) is not int
            or not isinstance(manifest['files'], list)
            or manifest['file_count'] != len(entries) - 1
            or len(manifest['files']) != manifest['file_count']):
        raise ImportCheckError('Invalid manifest identity/count')
    observed = []
    for row in manifest['files']:
        if not isinstance(row, dict) or set(row) != {'path', 'mode', 'size_bytes', 'sha256'}:
            raise ImportCheckError('Invalid manifest file row')
        path = row['path']
        if (not isinstance(path, str) or path == MANIFEST or path not in entries
                or row['mode'] != entries[path]['mode']
                or type(row['size_bytes']) is not int or row['size_bytes'] < 0
                or not isinstance(row['sha256'], str)
                or re.fullmatch(r'[0-9a-f]{64}', row['sha256']) is None):
            raise ImportCheckError('Invalid manifest file metadata')
        blob = git.run('cat-file', 'blob', entries[path]['oid'])
        if len(blob) != row['size_bytes'] or hashlib.sha256(blob).hexdigest() != row['sha256']:
            raise ImportCheckError('Manifest bytes differ: ' + path)
        observed.append(row)
    if [r['path'] for r in observed] != sorted(set(entries) - {MANIFEST}):
        raise ImportCheckError('Manifest must cover each file once in sorted order')
    immutable = [row for row in observed if row['path'] not in MUTABLE_PATHS]
    if digest_json(immutable) != IMMUTABLE_SHA256:
        raise ImportCheckError('Pinned immutable baseline differs')
    return {'base_commit': base, 'head_commit': head, 'base_tree': FIRST_TREE,
            'manifest_sha256': hashlib.sha256(raw_manifest).hexdigest(),
            'file_count': len(entries), 'manifested_files': len(observed),
            'immutable_files': len(immutable), 'path_mode_sha256': PATH_MODE_SHA256,
            'immutable_sha256': IMMUTABLE_SHA256,
            'manifest_is_self_asserted': True, 'independent_authenticity_verified': False}


def run_first_import(repo, base, head, output_dir):
    """Execute proposed code without ever using finish, resume, lock or start."""
    repo, output_dir = Path(repo).resolve(), Path(output_dir).resolve()
    if output_dir.is_relative_to(repo):
        raise ImportCheckError('Reports must remain outside the candidate')
    output_dir.mkdir(parents=True, exist_ok=True)
    gate = load_sibling('trusted_gate')
    collector = load_sibling('collect_changes')
    report = {'schema_version': 1, 'step_id': 'S00', 'status': 'failed',
              'evidence_class': 'untrusted_first_import_self_test', 'commands': [],
              's00_completed': False, 'identity_verified_externally': False,
              'branch_protection_verified': False, 'controlled_progress_writer_verified': False,
              'state_mutated': None,
              'limits': ['Self-test of proposed candidate code, never independent approval.',
                         'No exception to trusted_gate or the locked plan controller.',
                         'A new import candidate needs a new exact manifest; online installation remains separately authorized.']}
    state_path = repo / 'governance/masterplan/control/state.json'
    before = None
    try:
        before = state_path.read_bytes()
        def collect(name):
            command = [sys.executable, '-I', '-B', str(repo / 'tools/acceptance/collect_changes.py'),
                       '--repo', str(repo), '--base', base, '--head', head,
                       '--worktree-revision', head, '--output', str(output_dir / name), '--require-clean']
            result = gate.run(command, repo); report['commands'].append(result)
            if result['exit_code']:
                raise ImportCheckError('Exact clean Git collection failed')
            return strict_json((output_dir / name).read_bytes())
        prior = collect('import-changes-before.json')
        binding = inspect_import(repo, base, head)
        gate.assert_trusted_files(repo)
        report['binding'] = binding
        guard = repo / 'governance/masterplan/control/planctl.py'
        commands = [[sys.executable, '-I', '-B', str(guard), '--project-root', str(repo), 'validate'],
                    [sys.executable, '-I', '-B', '-m', 'unittest', 'discover', '-s',
                     str(guard.parent), '-p', 'test_planctl.py', '-v'],
                    [sys.executable, '-I', '-B', '-m', 'unittest', 'discover', '-s',
                     str(repo / 'tools/acceptance'), '-p', 'test_*.py', '-v']]
        for command in commands:
            result = gate.run(command, repo); report['commands'].append(result)
            if result['exit_code']:
                raise ImportCheckError('First-import read-only check failed')
        after = collect('import-changes-after.json')
        if (after['changed_files'] != prior['changed_files']
                or inspect_import(repo, base, head) != binding):
            raise ImportCheckError('Candidate changed during validation')
        report.update(status='passed_untrusted_first_import_checks',
                      changed_files=prior['changed_files'])
    except (ImportCheckError, collector.CollectionError, gate.GateError, OSError,
            ValueError, KeyError, subprocess.SubprocessError) as err:
        report['error'] = str(err)
    finally:
        if before is not None:
            try:
                report['state_mutated'] = state_path.read_bytes() != before
            except OSError:
                report['state_mutated'] = True
            if report['state_mutated']:
                report.update(status='failed', error='Validation changed or removed plan state')
    gate.write_json(output_dir / 'first-import-preflight.json', report)
    return report
