#!/usr/bin/env python3
"""Reproduce the bounded private Python-relay correction without broker access.

Requires Linux/libseccomp, Python, aiohttp and patch. All child processes can
create AF_UNIX sockets only. This is a network guard, not a general sandbox.
Logs must be written to a new directory outside the immutable source package.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile
from unix_http_offline import install

ROOT = Path(__file__).resolve().parents[1]
PROPOSAL = ROOT / 'proposals/relay-snapshot-guard'


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def totals(text, expected, *, failures=0):
    match = re.search(r'^METHODS (\d+) FAIL (\d+) ERROR (\d+) SKIP (\d+)$', text, re.M)
    if match is None or tuple(map(int, match.groups())) != (expected, failures, 0, 0):
        raise AssertionError('Unexpected unittest totals: ' + text[-1600:])
    return dict(zip(('tests', 'failures', 'errors', 'skipped'), map(int, match.groups())))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--reports-dir', required=True)
    args = parser.parse_args()
    reports = Path(args.reports_dir).resolve()
    if reports.is_relative_to(ROOT):
        raise ValueError('Reports must be outside the package')
    reports.mkdir(parents=True, exist_ok=False)
    summary = {
        'schema': 'extremelab-relay-snapshot-execution/v1',
        'work_id': 'S01-RELAY-SNAPSHOT-GUARD',
        'started_utc': datetime.now(timezone.utc).isoformat(),
        'uid': os.getuid(), 'python': sys.version,
        'manifest_sha256': digest(ROOT / 'MANIFEST.json'),
        'executions': [], 'success': False,
        'original_website_inputs': 38, 'missing_website_inputs': 21,
        'production_integration': False, 'canonical_gate_changed': False,
        'network_scope': 'real HTTP/WebSocket over Unix sockets; AF_INET/INET6/PACKET denied',
        'broker_or_account_access': False,
    }
    try:
        with tempfile.TemporaryDirectory(prefix='xl-snapshot-run-') as td:
            temp = Path(td)
            env = {'PATH': '/usr/bin:/bin', 'HOME': str(temp), 'TMPDIR': str(temp),
                   'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'PYTHONDONTWRITEBYTECODE': '1'}

            def run(label, cmd, *, cwd=ROOT, extra=None, expected=0, timeout=60):
                started = time.monotonic()
                process = subprocess.run([str(x) for x in cmd], cwd=cwd,
                    env={**env, **(extra or {})}, close_fds=True, preexec_fn=install,
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=timeout)
                text = process.stdout.decode('utf-8', 'replace')
                (reports / (label + '.log')).write_text(text)
                row = {'label': label, 'command': [str(x) for x in cmd],
                       'returncode': process.returncode,
                       'elapsed_seconds': round(time.monotonic() - started, 3),
                       'log_sha256': hashlib.sha256(process.stdout).hexdigest()}
                summary['executions'].append(row)
                if process.returncode != expected:
                    raise AssertionError(f'{label}: exit {process.returncode}, expected {expected}; {text[-1600:]}')
                return text, row

            text, _ = run('01_package_before', [sys.executable, '-B', 'verify_package.py'])
            summary['verified_files_before'] = json.loads(text)['verified_files']
            contract = json.loads((PROPOSAL / 'proposal.json').read_text())
            original = ROOT / 'baseline/relay_snapshot/relay.py'
            candidate = PROPOSAL / 'relay.py'
            assert digest(original) == contract['original_sha256']
            assert digest(candidate) == contract['proposal_sha256']
            assert digest(ROOT / 'baseline/original_engine121_source.zip') == contract['original_archive_sha256']
            assert digest(ROOT / 'baseline/original_live_bridge132.zip') == '42437c3573a16f60be2c745d1765d0d4e5106d61a4e44c8730ef0f21733249ef'
            bindings = {}
            with zipfile.ZipFile(ROOT / 'baseline/original_engine121_source.zip') as archive:
                for source, dest in [
                    ('relay/relay.py', 'relay.py'),
                    ('evidence/wire-fixture.json', 'wire-fixture.json'),
                    ('src/ExtremeLabMobile.cs', 'ExtremeLabMobile.cs')]:
                    data = archive.read('ExtremeLab_1_2_1_Integrationskandidat/' + source)
                    target = ROOT / 'baseline/relay_snapshot' / dest
                    assert data == target.read_bytes()
                    bindings[dest] = digest(target)
            with zipfile.ZipFile(ROOT / 'baseline/original_live_bridge132.zip') as archive:
                target = ROOT / 'baseline/relay_snapshot/test_relay_legacy.py'
                assert archive.read('ExtremeLab_Live_Bridge_1_3_2/tests/test_relay.py') == target.read_bytes()
                bindings['test_relay_legacy.py'] = digest(target)
            summary['verified_source_bindings'] = bindings

            # Check actual patch application, not a Python substitute for patch.
            patchroot = temp / 'patch-roundtrip'
            (patchroot / 'relay').mkdir(parents=True)
            target = patchroot / 'relay/relay.py'
            shutil.copy2(original, target)
            patch = PROPOSAL / 'relay-snapshot.diff'
            run('02_patch_forward', ['/usr/bin/patch', '--batch', '--fuzz=0', '-p1', '-i', patch], cwd=patchroot)
            assert target.read_bytes() == candidate.read_bytes()
            run('03_patch_reverse', ['/usr/bin/patch', '--batch', '--fuzz=0', '-R', '-p1', '-i', patch], cwd=patchroot)
            assert target.read_bytes() == original.read_bytes()
            summary['native_patch_roundtrip'] = 'exact_proposal_and_original_bytes'

            unit = [sys.executable, '-B', 'tools/run_relay_snapshot_unit.py']
            for label, name in [
                ('04_original_scalar_counterexample', 'NativeHTTPTests.test_ws_ack_then_invalid_snapshot_is_diagnostic_not_500'),
                ('05_original_string_counterexample', 'NativeHTTPTests.test_string_candles_never_become_complete_over_http')]:
                text, row = run(label, [*unit, '--test', name],
                    extra={'S01_RELAY_SOURCE': str(original)}, expected=1)
                row['counts'] = totals(text, 1, failures=1)
                row['meaning'] = 'Original behavior violates correction contract; excluded from passing methods'
            text, row = run('06_candidate_snapshot', unit)
            row['counts'] = totals(text, 19)
            text, row = run('07_original_storage_regressions', [*unit, '--legacy'])
            row['counts'] = totals(text, 24)
            for label, filename, count in [
                ('08_inventory_policy', 'test_s01_candidate.py', 12),
                ('09_inventory_sources', 'test_s01_recovery.py', 8)]:
                text, row = run(label, [sys.executable, '-B', '-m', 'unittest', 'discover', '-s', 'tests', '-p', filename, '-v'])
                assert re.search(r'Ran ' + str(count) + r' tests? in ', text) and '\nOK\n' in text
                row['methods'] = count

            before = candidate.read_text()
            variants = [
                ('10_mutation_discard_diagnosis',
                 '                    if invalid_payloads:\n                        complete=False',
                 '                    invalid_payloads=[]\n                    if invalid_payloads:\n                        complete=False',
                 'NativeHTTPTests.test_string_candles_never_become_complete_over_http'),
                ('11_mutation_complete_override',
                 '                    if invalid_payloads:\n                        complete=False',
                 '                    if invalid_payloads:\n                        pass',
                 'NativeHTTPTests.test_string_candles_never_become_complete_over_http'),
                ('12_mutation_partial_unknown_total',
                 '                    if invalid_payloads or not contiguous or (declared_ok and complete is not True):',
                 '                    if not contiguous or (declared_ok and complete is not True):',
                 'StoreTests.test_unknown_total_with_bad_payload_is_still_partial')]
            for label, old, new, method in variants:
                assert before.count(old) == 1, label
                mutant = temp / (label + '.py')
                mutant.write_text(before.replace(old, new))
                text, row = run(label, [*unit, '--test', method],
                    extra={'S01_RELAY_SOURCE': str(mutant)}, expected=1)
                row['counts'] = totals(text, 1, failures=1)
                row['behavior_regression_detected'] = True
                assert 'AssertionError:' in text and 'ImportError:' not in text

            for label, kind, reason in [
                ('13_package_changed_bytes', 'bytes', 'HASH_MISMATCH'),
                ('14_package_extra_file', 'extra', 'SOURCE_FILE_SET_MISMATCH'),
                ('15_package_symlink', 'link', 'SYMLINK_NOT_ALLOWED')]:
                copy = temp / label
                shutil.copytree(ROOT, copy, ignore=shutil.ignore_patterns('__pycache__'))
                if kind == 'bytes':
                    file = copy / 'proposals/relay-snapshot-guard/relay.py'
                    file.write_bytes(file.read_bytes() + b'\n# synthetic damage\n')
                elif kind == 'extra':
                    (copy / 'unexpected.txt').write_text('synthetic test')
                else:
                    (copy / 'unexpected-link').symlink_to('README.md')
                text, row = run(label, [sys.executable, '-B', 'verify_package.py'], cwd=copy, expected=2)
                assert reason in text
                row['expected_rejection'] = reason
            text, _ = run('16_package_after', [sys.executable, '-B', 'verify_package.py'])
            summary['verified_files_after'] = json.loads(text)['verified_files']
            assert summary['verified_files_before'] == summary['verified_files_after']
            summary['distinct_methods'] = {'new_source_store_http': 19, 'unchanged_original_storage': 24,
                                           'inventory': 20, 'total': 63}
            summary['original_counterexamples_reproduced'] = 2
            summary['behavior_mutations_detected'] = 3
            summary['package_tamper_rejected'] = 3
            summary['success'] = True
    except BaseException as exc:
        summary['error'] = f'{type(exc).__name__}: {exc}'
        raise
    finally:
        summary['finished_utc'] = datetime.now(timezone.utc).isoformat()
        (reports / 'execution.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'success': True, 'distinct_methods': 63, 'reports': str(reports)}))


if __name__ == '__main__':
    main()
