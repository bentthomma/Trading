#!/usr/bin/env python3
"""Offline forensic inspection of exported ExtremeLab XL2 log messages.

No network, broker, order routing, strategy changes or live claims.
Treat positions as a historical, non-atomic snapshot, not live PnL.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re

STAMP = re.compile(r"^\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2}")
# XL2 markers are headers, not arbitrary words inside a quoted JSON value.
MARKER = re.compile(r"^(?:\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2}(?:\.\d+)?\s+)?\s*(?:(?:stdout|stderr)\s+[PF]\s+)?(?:[A-Za-z]+\s*\|\s*)?XL2(?:[ \t]+|$)")
ISO = re.compile(r"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})\Z")
REQUIRED = frozenset(("schema", "seq", "run", "utc", "kind", "data"))
MAX_SEQUENCE = (1 << 63) - 1
MAX_JOIN_LINES = 128
MAX_RECORD_CHARS = 2_000_000


class AuditError(ValueError):
    pass


def epoch_ns(iso: str) -> int:
    """Exact UTC nanoseconds; never silently truncate .NET's 100 ns timestamps."""
    match = ISO.fullmatch(iso) if isinstance(iso, str) else None
    if not match:
        raise AuditError('Invalid timezone-qualified timestamp')
    base, fraction, zone = match.groups()
    if zone != 'Z' and (int(zone[1:3]) > 23 or int(zone[4:]) > 59):
        raise AuditError('Invalid timezone offset')
    try:
        value = datetime.fromisoformat(base + ('+00:00' if zone == 'Z' else zone))
        delta = value.astimezone(timezone.utc) - datetime(1970, 1, 1, tzinfo=timezone.utc)
    except (ValueError, OverflowError) as exc:
        raise AuditError('Invalid calendar timestamp') from exc
    return (delta.days * 86400 + delta.seconds) * 1_000_000_000 + int((fraction or '').ljust(9, '0'))


def dt(iso: str) -> datetime:
    epoch_ns(iso)
    return datetime.fromisoformat(iso.replace('Z', '+00:00'))


def _no_constant(value):
    raise AuditError('NON_FINITE_JSON: ' + value)


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise AuditError('DUPLICATE_JSON_KEY: ' + key)
        result[key] = value
    return result


def strict_loads(value):
    return json.loads(value, parse_float=Decimal, parse_constant=_no_constant,
                      object_pairs_hook=_unique_object)


def _event_valid(event, physical_line):
    if not isinstance(event, dict) or not REQUIRED.issubset(event):
        raise AuditError(f'Missing XL2 envelope on line {physical_line}')
    if type(event['schema']) is not int or event['schema'] != 2:
        raise AuditError('UNSUPPORTED_XL2_SCHEMA')
    if type(event['seq']) is not int or not 1 <= event['seq'] <= MAX_SEQUENCE:
        raise AuditError('INVALID_SEQUENCE')
    if not isinstance(event['run'], str) or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,128}', event['run']):
        raise AuditError('INVALID_RUN')
    if not isinstance(event['kind'], str) or not re.fullmatch(r'[A-Z][A-Z0-9_]{0,127}', event['kind']):
        raise AuditError('INVALID_KIND')
    if not isinstance(event['data'], dict):
        raise AuditError('INVALID_DATA_OBJECT')
    epoch_ns(event['utc'])
    if 'receivedUtc' in event:
        epoch_ns(event['receivedUtc'])


def parse_export(path: Path):
    """Extend the original reader with lossless physical-line provenance.

    Exactly one exporter-added leading space is removed per continuation.
    A malformed marked event fails the audit; it is never silently skipped.
    All lines, including blank/wrapper/process messages, are accounted for.
    No source contents or private raw payloads are copied into the line map.
    """
    raw = path.read_bytes()
    raw_sha = hashlib.sha256(raw).hexdigest()
    try:
        lines = raw.decode('utf-8-sig').splitlines()
    except UnicodeDecodeError as exc:
        raise AuditError('INVALID_UTF8') from exc
    records, joins, lineage, event_sources, seen = [], [], [], {}, set()
    i = 0
    while i < len(lines):
        start = i
        line = lines[i]
        marker = MARKER.match(line)
        if marker is None:
            category = 'blank' if not line.strip() else ('process_marker' if any(x in line for x in ('Killed', ' started.', 'Starting cBot', 'stopped.')) else 'wrapper_or_other')
            line_info = {'line': i + 1, 'category': category,
                         'text_sha256': hashlib.sha256(line.encode('utf-8')).hexdigest()}
            if category == 'process_marker':
                line_info['marker'] = 'killed' if 'Killed' in line else 'start_or_stop'
            lineage.append(line_info)
            i += 1
            continue
        serialized = line[marker.end():]
        while True:
            if len(serialized) > MAX_RECORD_CHARS:
                raise AuditError('RECORD_SIZE_LIMIT')
            try:
                event = strict_loads(serialized)
                break
            except json.JSONDecodeError as err:
                if (i + 1 >= len(lines) or i - start + 1 >= MAX_JOIN_LINES
                    or STAMP.match(lines[i + 1]) or MARKER.match(lines[i + 1])
                    or not lines[i + 1].startswith(' ') or not lines[i + 1].strip()):
                    raise AuditError(f'Malformed XL2 message on lines {start + 1}-{i + 1}: {err.msg}') from err
                i += 1
                joins.append(i + 1)
                serialized += lines[i][1:]
        _event_valid(event, start + 1)
        identity = (event['run'], event['seq'])
        if identity in seen:
            raise AuditError('DUPLICATE_EVENT_SEQUENCE: ' + str(identity))
        seen.add(identity)
        # This is an audit identity tied to source bytes, not a broker identity/signature.
        eid = raw_sha + ':' + event['run'] + ':' + str(event['seq'])
        event_sources[identity] = {'event_id': eid, 'first_line': start + 1,
                                   'last_line': i + 1, 'json_sha256': hashlib.sha256(serialized.encode()).hexdigest()}
        for n in range(start, i + 1):
            lineage.append({'line': n + 1, 'category': 'event_start' if n == start else 'event_continuation',
                            'event_id': eid, 'text_sha256': hashlib.sha256(lines[n].encode()).hexdigest()})
        records.append(event)
        i += 1
    return records, joins, {'raw_sha256': raw_sha, 'raw_bytes': len(raw),
                            'physical_lines': len(lines), 'lines': lineage,
                            'event_sources': event_sources}


def parse_xl2(path: Path):
    """Compatibility interface of the recovered original parser."""
    records, joins, _ = parse_export(path)
    return records, joins


def snapshot_state(events):
    """Latest observation must not fall back to an older successful snapshot.

    This only classifies historical exported observations; it never grants trading.
    A valid [] is historical reported emptiness, not current broker confirmation.
    """
    candidates = [r for r in events if r['kind'] == 'POSITIONS']
    result = {'state': 'unknown', 'latest_sequence': None, 'reported_count': None,
              'current_account_confirmed': False, 'new_exposure_allowed': False}
    if len({r['run'] for r in events}) > 1:
        return {**result, 'reason': 'MIXED_RUN_CONTEXT'}
    if not candidates:
        return {**result, 'reason': 'NO_POSITIONS_EVENT'}
    snap = max(candidates, key=lambda r: r['seq'])
    result['latest_sequence'] = snap['seq']
    data = snap['data']
    if not isinstance(data, dict) or not isinstance(data.get('items'), list):
        return {**result, 'reason': 'LATEST_POSITIONS_INVALID'}
    if any(k in data and type(data[k]) is not bool for k in ('success', 'ok', 'complete')):
        return {**result, 'reason': 'INVALID_POSITIONS_COMPLETENESS_FLAG'}
    if (data.get('error') not in (None, '') or data.get('success') is False
        or data.get('ok') is False or data.get('complete') is False):
        return {**result, 'reason': 'LATEST_POSITIONS_FAILED_OR_INCOMPLETE'}
    seen = set()
    for p in data['items']:
        if not isinstance(p, dict) or any(k not in p for k in ('positionId','symbol','net','commission','swap','stop','target','side','entry','entryUtc')):
            return {**result, 'reason': 'POSITION_METADATA_INCOMPLETE'}
        ident = p['positionId']
        if type(ident) is not int and not (isinstance(ident, str) and re.fullmatch(r'[0-9]+', ident)):
            return {**result, 'reason': 'POSITION_ID_INVALID'}
        if int(ident) <= 0 or int(ident) in seen:
            return {**result, 'reason': 'POSITION_ID_DUPLICATE_OR_INVALID'}
        seen.add(int(ident))
        if not isinstance(p['symbol'], str) or not p['symbol'] or p['side'] not in ('Buy','Sell'):
            return {**result, 'reason': 'POSITION_SYMBOL_OR_SIDE_INVALID'}
        try:
            for key in ('net','commission','swap','entry'):
                d(p[key])
            for key in ('stop','target','volume'):
                if key in p and p[key] is not None:
                    d(p[key])
            if epoch_ns(p['entryUtc']) > epoch_ns(snap['utc']):
                raise AuditError('POSITION_ENTRY_IN_FUTURE')
        except (AuditError, ValueError, TypeError, ArithmeticError):
            return {**result, 'reason': 'POSITION_VALUE_OR_TIME_INVALID'}
    return {**result, 'state': 'historical_reported', 'reason': 'VALID_HISTORICAL_EXPORT_NOT_CURRENT_BROKER_READ',
            'reported_count': len(data['items'])}


def sequence_gaps(seqs):
    ordered = sorted(set(seqs))
    return [[a + 1, b - 1] for a, b in zip(ordered, ordered[1:]) if b > a + 1]


def d(value):
    if isinstance(value, bool) or not isinstance(value, (str, int, float, Decimal)):
        raise AuditError('INVALID_NUMERIC_VALUE')
    try:
        result = Decimal(str(value))
    except ArithmeticError as exc:
        raise AuditError('INVALID_NUMERIC_VALUE') from exc
    if not result.is_finite():
        raise AuditError('NON_FINITE_VALUE')
    return result


def money(value):
    return str(d(value).quantize(Decimal('0.01')))


def profile(records, joins, raw_sha: str) -> dict:
    if not records:
        raise AuditError("No XL2 events")
    groups: dict[str, list] = defaultdict(list)
    for record in records:
        groups[record['run']].append(record)
    run_summaries = []
    for run, events in sorted(groups.items()):
        seqs = [event['seq'] for event in events]
        if len(set(seqs)) != len(seqs):
            raise AuditError(f"Duplicate sequence numbers in run {run}")
        intervals = sequence_gaps(seqs)
        count = sum(b-a+1 for a,b in intervals)
        missing = [n for a,b in intervals for n in range(a,b+1)] if count <= 10000 else None
        # Sequence coverage applies only to the observed interval, not run lifetime.
        run_summaries.append({
            'run': run, 'events': len(events), 'min_seq': min(seqs),
            'max_seq': max(seqs), 'missing_seq_inside_observed_interval': missing,
            'missing_sequence_intervals': intervals, 'missing_sequence_count': count,
            'min_utc': min(events, key=lambda e: epoch_ns(e['utc']))['utc'],
            'max_utc': max(events, key=lambda e: epoch_ns(e['utc']))['utc'],
            'kinds': dict(sorted(Counter(event['kind'] for event in events).items())),
        })
    latest = max(groups, key=lambda run: max(epoch_ns(r['utc']) for r in groups[run]))
    events = groups[latest]
    observed = snapshot_state(events)
    if observed['state'] != 'historical_reported':
        raise AuditError(observed['reason'])
    snapshots = [r for r in events if r['kind'] == 'POSITIONS']
    statuses = [r for r in events if r['kind'] == 'STATUS']
    if not snapshots or not statuses:
        raise AuditError('No comparable position or status snapshots in the latest run')
    snap = max(snapshots, key=lambda r: r['seq'])
    status = max(statuses, key=lambda r: r['seq'])
    positions = snap['data']['items']
    identifiers = [str(item['positionId']) for item in positions]
    if len(set(identifiers)) != len(identifiers):
        raise AuditError('Duplicate position IDs in the latest snapshot')
    for item in positions:
        if any(k not in item for k in ('symbol','net','commission','swap','stop','target','side','entry','entryUtc')):
            raise AuditError('Snapshot has incomplete position metadata')
    totals = {k: sum((d(p[k]) for p in positions), Decimal('0')) for k in ('net','commission','swap')}
    by_symbol = defaultdict(lambda: Decimal('0'))
    by_side = defaultdict(lambda: Decimal('0'))
    for item in positions:
        by_symbol[item['symbol']] += d(item['net'])
        by_side[item['side']] += d(item['net'])
    st = status['data']
    metrics = {name: money(st[name]) for name in ('openNet','closedNet','openingOwnNet','pnl','accountDelta','residual','historyAvailableOwnClosed','equity','balance')}
    expected_delta = d(st['openNet']) - d(st['openingOwnNet']) + d(st['closedNet'])
    if abs(expected_delta-d(st['pnl'])) > Decimal('0.01'):
        raise AuditError('Run delta cannot be reconciled to status opening/net/closed')
    stopped = sum(p['stop'] is not None for p in positions)
    targeted = sum(p['target'] is not None for p in positions)
    returned = {
        'evidence_type': 'historical_export_reconstruction',
        'raw_sha256': raw_sha, 'total_xl2_events': len(records), 'joined_continuation_lines': joins,
        'runs': run_summaries, 'latest_run': latest,
        'latest_positions_utc': snap['utc'], 'latest_positions_sequence': snap['seq'],
        'latest_status_utc': status['utc'], 'latest_status_sequence': status['seq'],
        'position_count': len(positions), 'symbol_count': len(by_symbol),
        'positive_positions': sum(d(p['net']) > 0 for p in positions),
        'negative_positions': sum(d(p['net']) < 0 for p in positions),
        'positions_with_stop': stopped, 'positions_with_target': targeted,
        'position_net_chf': money(totals['net']), 'commission_field_chf': money(totals['commission']),
        'swap_field_chf': money(totals['swap']),
        'cost_fields_sum_chf': money(totals['commission']+totals['swap']),
        'status': metrics,
        'status_net_minus_positions_net_chf': money(d(st['openNet'])-totals['net']),
        'status_delta_recomputed_chf': money(expected_delta),
        'snapshot_gap_milliseconds': str(Decimal(epoch_ns(snap['utc']) - epoch_ns(status['utc'])) / Decimal(1000000)),
        'by_symbol_chf': {k: money(v) for k,v in sorted(by_symbol.items(),key=lambda t:t[1])},
        'by_side_chf': {k: money(v) for k,v in sorted(by_side.items())},
        'unknowns': [
          'Non-atomic quote, account and position reads',
          'Historical-broker coverage not guaranteed complete',
          'Broker realized-deal and cashflow linkage missing',
          'Position net already incorporates costs; do not subtract listed fields again',
          'Shadow fills omit native pending execution and financing',
          'Current live account and current deployed engine source not present',
        ],
    }
    return returned


def audit(path: Path) -> dict:
    raw_sha = hashlib.sha256(path.read_bytes()).hexdigest()
    records, joins = parse_xl2(path)
    currencies = {r['data'].get('currency') for r in records if r['kind']=='STATUS'}
    if currencies != {'CHF'}:
        raise AuditError('LEGACY_PROFILE_REQUIRES_EXPLICIT_CHF_STATUS')
    return profile(records, joins, raw_sha)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('log', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = audit(args.log)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False)+'\n',encoding='utf-8')
    print(json.dumps({k:result[k] for k in ('total_xl2_events','position_count','position_net_chf','latest_run')}))


if __name__=='__main__':
    main()
