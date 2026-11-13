"""Pure S02 contract validation. No IO, credentials, broker or state writer.

JSON Schema validates shape; the code below validates exact units, time and
version bindings. Catalogs must be provided by a trusted caller. Passing this
validator is NOT an execution grant. It is not a production integration.
"""
from __future__ import annotations
from pathlib import Path
from fractions import Fraction
from datetime import datetime
import hashlib
import json
import re
import sys
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[3]
SCHEMA = json.loads((ROOT/'contracts/domain/v1/schema.json').read_text())
Draft202012Validator.check_schema(SCHEMA)
VALIDATOR = Draft202012Validator(SCHEMA)
MAX_UINT = 18446744073709551615
DECIMAL = re.compile(r'^(0|-?[1-9][0-9]*|-?(0|[1-9][0-9]*)\.[0-9]*[1-9])$')
TIME = re.compile(r'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$')

class ContractError(ValueError):
    pass

def need(condition: bool, code: str) -> None:
    if not condition:
        raise ContractError(code)

def strict_load(text: str):
    need(len(text.encode('utf-8')) <= 1_000_000, 'DOCUMENT_TOO_LARGE')
    def pairs(items):
        result = {}
        for key, value in items:
            need(key not in result, 'DUPLICATE_JSON_KEY')
            result[key] = value
        return result
    def no_constant(value):
        raise ContractError('NONFINITE_JSON_NUMBER')
    try:
        value = json.loads(text, object_pairs_hook=pairs, parse_constant=no_constant)
        _unicode(value)
        return value
    except (ValueError, UnicodeError, RecursionError) as e:
        if isinstance(e, ContractError):
            raise
        raise ContractError('INVALID_JSON') from e

def _unicode(value, depth=0):
    need(depth <= 32, 'MAX_DEPTH')
    if isinstance(value, str):
        value.encode('utf-8', 'strict')
    elif isinstance(value, dict):
        for k,v in value.items():
            _unicode(k,depth+1); _unicode(v,depth+1)
    elif isinstance(value,list):
        for v in value: _unicode(v,depth+1)

def canonical(value) -> str:
    """Project-specific canonical JSON: ASCII escapes, sorted keys, no floats.

    Economic values are strings. Non-ASCII UTF-16 escapes use lowercase hex.
    DEL (0x7f) is escaped too. No claim of RFC8785/JCS interoperability.
    """
    _unicode(value)
    result = json.dumps(value, sort_keys=True, ensure_ascii=True, separators=(',',':'), allow_nan=False)
    return result.replace(chr(127), '\\u007f')

def fingerprint(value) -> str:
    return hashlib.sha256(canonical(value).encode('ascii')).hexdigest()

def number(value: str) -> Fraction:
    need(isinstance(value,str) and len(value)<=80 and bool(DECIMAL.fullmatch(value)), 'DECIMAL_NONCANONICAL')
    return Fraction(value)

def check_time(value):
    if value is None: return
    need(isinstance(value,str) and bool(TIME.fullmatch(value)), 'TIMESTAMP_FORMAT')
    try: datetime.strptime(value,'%Y-%m-%dT%H:%M:%S.%fZ')
    except ValueError as e: raise ContractError('TIMESTAMP_CALENDAR') from e

def _walk(value):
    yield value
    if isinstance(value,dict):
        for v in value.values(): yield from _walk(v)
    elif isinstance(value,list):
        for v in value: yield from _walk(v)

def _catalog_event(catalog, group, identifier, kind):
    rows = catalog.get(group, []) if isinstance(catalog,dict) else []
    matches = [v for v in rows if v.get('kind')==kind and v.get('payload',{}).get('version_id')==identifier]
    need(len(matches)==1, 'VERSION_NOT_RESOLVED')
    e = matches[0]
    validate_event(e, {'instruments': [], 'policies': []})
    return e

def validate_event(e, catalog=None):
    """Return the original object only after all applicable contract checks."""
    _unicode(e)
    error = next(VALIDATOR.iter_errors(e), None)
    need(error is None, 'SCHEMA_REJECTED')
    need(int(e['sequence']) <= MAX_UINT and int(e['sequence']) > 0, 'SEQUENCE_RANGE')
    need(e['payload_hash'] == fingerprint(e['payload']), 'PAYLOAD_HASH_MISMATCH')
    t=e['times']; p=e['payload']; k=e['kind']
    for v in t.values(): check_time(v)
    for item in _walk(p):
        if isinstance(item,str) and TIME.fullmatch(item): check_time(item)
    through=e['coverage']['source_sequence_through']
    need(through is None or int(through)<=MAX_UINT, 'SEQUENCE_RANGE')
    if e['coverage']['completeness']=='complete':
        need(not e['coverage']['truncated'] and e['coverage']['gap_state']=='none', 'COVERAGE_CONFLICT')
    if k=='InstrumentVersion':
        need(p['version_id']==e['instrument_version'], 'INSTRUMENT_BINDING')
        for f in ('tick_size','pip_size','units_per_lot','quantity_step','minimum_quantity','maximum_quantity'):
            need(number(p[f])>0,'INSTRUMENT_RANGE')
        need(number(p['minimum_quantity'])<=number(p['maximum_quantity']),'INSTRUMENT_RANGE')
        return e
    if k=='PolicyVersion':
        need(p['version_id']==e['policy_version'],'POLICY_BINDING')
        need(int(p['revision'])<=MAX_UINT and (p['maximum_positions'] is None or int(p['maximum_positions'])<=MAX_UINT),'REVISION_RANGE')
        need(0<number(p['risk_per_trade']['value'])<=number(p['total_risk']['value'])<=1,'RISK_RANGE')
        need(number(p['minimum_margin_level']['value'])>0,'RISK_RANGE')
        return e
    if k=='Run':
        need(p['run_id']==e['run_id'],'RUN_BINDING')
        need(int(p['seed'])<=MAX_UINT,'SEED_RANGE')
        if p['started_at'] is not None and p['finished_at'] is not None:
            need(p['started_at']<=p['finished_at'],'RUN_TIME_ORDER')
        need(p['status']!='completed' or all(p[x] is not None for x in ('started_at','finished_at','result_hash')),'RUN_COMPLETION_MISSING')
        return e
    if k=='Cashflow':
        need(p['account']==e['account_ref'],'ACCOUNT_BINDING')
        need(p['amount']['currency']==p['account']['currency'],'BOOKING_CURRENCY_MISMATCH')
        if e['instrument_version'] is not None:
            _catalog_event(catalog,'instruments',e['instrument_version'],'InstrumentVersion')
        return e
    if k=='SignalIntent': need(p['source_run_id']==e['run_id'],'RUN_BINDING')
    need(e['instrument_version'] is not None,'INSTRUMENT_MISSING')
    i=_catalog_event(catalog,'instruments',e['instrument_version'],'InstrumentVersion')['payload']
    for item in _walk(p):
        if not isinstance(item,dict): continue
        if set(item)=={'value','currency','per_unit','instrument_version'}:
            need(item['instrument_version']==i['version_id'] and item['currency']==i['quote_currency'] and item['per_unit']==i['base_quantity_unit'],'PRICE_UNIT_MISMATCH')
            need(i['allows_negative_price'] or number(item['value'])>=0,'NEGATIVE_PRICE')
        if set(item)=={'value','unit','instrument_version','conversion_version'}:
            need(item['instrument_version']==i['version_id'] and item['conversion_version']==i['conversion_version'],'QUANTITY_BINDING')
            need(item['unit'] in (i['base_quantity_unit'],'lots'),'QUANTITY_UNIT_MISMATCH')
            need(number(item['value'])>=0,'NEGATIVE_QUANTITY')
        if set(item)=={'value','unit','instrument_version'}:
            need(item['instrument_version']==i['version_id'] and number(item['value'])>=0,'DISTANCE_BINDING')
    if 'account' in p:
        need(p['account']==e['account_ref'],'ACCOUNT_BINDING')
    if k=='Quote': need(number(p['bid']['value'])<=number(p['ask']['value']),'INVERTED_QUOTE')
    if k=='Bar':
        need(int(p['timeframe_seconds'])>0 and int(p['timeframe_seconds'])<=MAX_UINT,'TIMEFRAME_RANGE')
        need(p['open_time']<p['close_time'],'BAR_TIME_ORDER')
        need(number(p['low']['value'])<=min(number(p['open']['value']),number(p['close']['value']))<=max(number(p['open']['value']),number(p['close']['value']))<=number(p['high']['value']),'BAR_OHLC')
    if k=='FeatureSnapshot':
        need(len({v['feature_id'] for v in p['features']})==len(p['features']),'DUPLICATE_FEATURE')
        for f in p['features']: need(number(f['absolute_tolerance'])>=0,'NEGATIVE_TOLERANCE')
    if k=='Position':
        need(p['broker_protection_status']!='confirmed' or p['protection_proof_id'] is not None,'PROTECTION_PROOF_MISSING')
    if k=='Cashflow': need(p['amount']['currency']==p['account']['currency'],'BOOKING_CURRENCY_MISMATCH')
    if k=='OrderIntent':
        need(e['policy_version'] is not None,'POLICY_MISSING')
        pe=_catalog_event(catalog,'policies',e['policy_version'],'PolicyVersion'); policy=pe['payload']
        need(policy['status']=='active' and policy['revision']==p['expected_policy_revision'] and pe['payload_hash']==p['policy_hash'],'POLICY_BINDING')
        need(policy['environment']==p['account']['environment'],'ENVIRONMENT_BINDING')
        need(policy['maximum_positions'] is None or int(policy['maximum_positions'])>0,'POLICY_NO_NEW_POSITIONS')
        need(e['account_state']=='known','ACCOUNT_STATE_UNKNOWN')
        need(p['account']['model']!='unknown','ACCOUNT_MODEL_UNKNOWN')
        need(int(p['expected_account_revision'])<=MAX_UINT,'REVISION_RANGE')
        need(e['coverage']['completeness']=='complete' and e['coverage']['gap_state']=='none' and not e['coverage']['truncated'],'INPUT_COVERAGE_UNKNOWN')
        need(all(v is not None for v in t.values()),'TIME_EVIDENCE_MISSING')
        need(t['event_time']<=t['available_at']<=t['features_ready_at'] and t['received_at']<=t['features_ready_at']<=t['decision_at']<=t['execution_not_before']<p['expires_at'],'CAUSAL_TIME_ORDER')
        need(policy['effective_from']<=t['decision_at'] and i['effective_at']<=t['decision_at'],'VERSION_NOT_YET_EFFECTIVE')
        q=number(p['quantity']['value'])
        if p['quantity']['unit']=='lots': q*=number(i['units_per_lot'])
        need(number(i['minimum_quantity'])<=q<=number(i['maximum_quantity']) and q>0,'VOLUME_RANGE')
        need((q/number(i['quantity_step'])).denominator==1,'VOLUME_GRID')
        for name in ('limit_price','trigger_price','protective_stop'):
            if p[name] is not None:
                need((number(p[name]['value'])/number(i['tick_size'])).denominator==1,'PRICE_GRID')
        need((p['order_type']=='limit')==(p['limit_price'] is not None),'ORDER_LIMIT_FIELDS')
        need((p['order_type']=='stop')==(p['trigger_price'] is not None),'ORDER_STOP_FIELDS')
        need(policy['allow_short'] or p['side']!='sell','POLICY_SHORT_DISABLED')
    return e

def main():
    for line in sys.stdin:
        try:
            request=strict_load(line)
            e=validate_event(request['event'],request.get('catalog'))
            print(json.dumps({'ok':True,'canonical':canonical(e),'sha256':fingerprint(e)},ensure_ascii=True))
        except (ContractError,KeyError,TypeError,ValueError,RecursionError) as exc:
            print(json.dumps({'ok':False,'error':str(exc) if isinstance(exc,ContractError) else 'INVALID_REQUEST'}))

if __name__=='__main__': main()
