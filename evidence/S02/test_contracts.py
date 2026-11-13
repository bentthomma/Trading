"""S02 contracts: real independent Python/JavaScript implementations, offline."""
from pathlib import Path
import copy, importlib.util, json, os, subprocess, unittest
R=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('s02_domain', R/'adapters/contracts/v1/domain.py')
domain=importlib.util.module_from_spec(spec);spec.loader.exec_module(domain)
G=json.loads((R/'contracts/domain/v1/golden-events.json').read_text())
E={e['kind']:e for e in G['events']}
NODE=os.environ.get('S02_NODE','node')

def request(kind='OrderIntent'):
    return {'event':copy.deepcopy(E[kind]),'catalog':copy.deepcopy(G['catalog'])}
def setpath(obj,path,val):
    parts=path.split('.')
    for k in parts[:-1]:obj=obj[int(k)] if isinstance(obj,list) else obj[k]
    if isinstance(obj,list):obj[int(parts[-1])]=val
    else:obj[parts[-1]]=val

def mutate(kind='OrderIntent', changes=None, catalog_changes=None):
    r=request(kind)
    for p,v in (changes or {}).items():setpath(r['event'],p,v)
    for p,v in (catalog_changes or {}).items():setpath(r['catalog'],p,v)
    for rows in r['catalog'].values():
        for e in rows:e['payload_hash']=domain.fingerprint(e['payload'])
    r['event']['payload_hash']=domain.fingerprint(r['event']['payload'])
    if kind=='OrderIntent' and catalog_changes:
        r['event']['payload']['policy_hash']=r['catalog']['policies'][0]['payload_hash']
        r['event']['payload_hash']=domain.fingerprint(r['event']['payload'])
    return r

def js_many(rows):
    proc=subprocess.run([NODE,str(R/'adapters/contracts/v1/domain.mjs')],input=''.join((v if isinstance(v,str) else json.dumps(v,ensure_ascii=True))+'\n' for v in rows),text=True,capture_output=True,timeout=25)
    if proc.returncode:raise AssertionError(proc.stderr)
    output=[json.loads(s) for s in proc.stdout.splitlines()]
    if len(output)!=len(rows):raise AssertionError('RESULT_COUNT')
    return output

def py_one(r):
    try:
        if isinstance(r,str):r=domain.strict_load(r)
        e=domain.validate_event(r['event'],r.get('catalog'))
        return {'ok':True,'canonical':domain.canonical(e),'sha256':domain.fingerprint(e)}
    except (ValueError,TypeError,KeyError,OverflowError,UnicodeError):return {'ok':False}

class Contracts(unittest.TestCase):
    def compare(self,rows,allowed):
        js=js_many(rows)
        for n,(r,j) in enumerate(zip(rows,js)):
            with self.subTest(case=n):
                p=py_one(r)
                self.assertEqual(p['ok'],allowed,(n,'python',p))
                self.assertEqual(j['ok'],allowed,(n,'javascript',j))
                if allowed:self.assertEqual(p,j)
    def test_twelve_typed_events_roundtrip_byte_identical(self):
        self.assertEqual(len(E),12)
        self.compare([{'event':e,'catalog':G['catalog']} for e in G['events']],True)
    def test_large_ids_and_uint64_are_strings_not_ieee_numbers(self):
        self.compare([mutate(changes={'sequence':'18446744073709551615','payload.expected_account_revision':'18446744073709551615'}),mutate('Run',{'payload.seed':'18446744073709551615'})],True)
        self.compare([mutate(changes={'sequence':'18446744073709551616'}),mutate(changes={'sequence':'0'}),mutate(changes={'payload.expected_account_revision':'18446744073709551616'})],False)
    def test_unknown_fields_at_every_nesting_level_rejected(self):
        self.compare([mutate(changes={p:True}) for p in ['approved','payload.approved','payload.quantity.approved','payload.account.approved','times.approved','coverage.approved']],False)
    def test_all_envelope_versions_and_payload_hash_required(self):
        rows=[]
        for f in ['schema_version','source_schema_version','data_version','payload_hash','instrument_version','policy_version']:
            r=request();del r['event'][f];rows.append(r)
        rows.extend([mutate(changes={'schema_version':'extremelab.domain/2.0.0'}),mutate(changes={'instrument_version':'unknown-instrument'}),mutate(changes={'policy_version':'unknown-policy'})])
        self.compare(rows,False)
    def test_payload_hash_is_checked_without_trusting_input(self):
        r=request();r['event']['payload']['quantity']['value']='0.02';self.compare([r],False)
    def test_noncanonical_decimals_rejected(self):
        self.compare([mutate(changes={'payload.quantity.value':v}) for v in ['-0','+1','01','1.0','0.010','1e3','NaN','Infinity','-Infinity',' 1','1\n','1,0']],False)
    def test_nonfinite_raw_json_and_duplicate_keys_rejected(self):
        text=json.dumps(request())
        self.compare([text.replace('"value": "0.01"','"value": '+v) for v in ['NaN','Infinity','-Infinity','1e9999']]+[text.replace('"kind": "OrderIntent"','"kind": "OrderIntent", "kind": "OrderIntent"')],False)
    def test_raw_economic_numbers_rejected(self):
        self.compare([mutate(changes={'payload.quantity.value':v}) for v in [1,1.2,True,None]],False)
    def test_terminal_newlines_cannot_bypass_anchored_types(self):
        self.compare([mutate(changes={'event_id':'event\n'}),mutate(changes={'sequence':'7\n'}),mutate(changes={'payload.account.currency':'CHF\n','account_ref.currency':'CHF\n'})],False)
    def test_units_and_versions_are_not_inferred_from_symbol(self):
        self.compare([mutate(changes={p:v}) for p,v in [('payload.quantity.unit','pieces'),('payload.quantity.unit','pip'),('payload.quantity.conversion_version','guessed'),('payload.limit_price.currency','CHF'),('payload.limit_price.per_unit','lots'),('payload.distance.unit','USD'),('payload.distance.instrument_version','other')]],False)
    def test_exact_lots_conversion_and_volume_grid(self):
        self.compare([mutate(changes={'payload.quantity.value':'1000','payload.quantity.unit':'units'}),mutate(changes={'payload.quantity.value':'0.01','payload.quantity.unit':'lots'})],True)
        self.compare([mutate(changes={'payload.quantity.value':v}) for v in ['0','-0.01','0.01001','999999999999999999999']],False)
    def test_exact_tick_grid_not_float_tolerance(self):
        self.compare([mutate(changes={'payload.limit_price.value':'1.2345600000000000000000000000000000000001'})],False)
        self.compare([mutate(changes={'payload.limit_price.value':'1.23457'})],True)
    def test_high_precision_cashflow_exact_and_no_forced_instrument(self):
        self.compare([mutate('Cashflow',{'instrument_version':None,'payload.kind':'deposit','payload.related_deal_id':None,'payload.amount.value':'123456789012345678901234567890.12345678901234567890123456789'})],True)
        self.compare([mutate('Cashflow',{'payload.amount.currency':'USD'})],False)
    def test_microsecond_distinctions_survive(self):
        rows=[mutate('Quote',{'times.event_time':'2026-11-13T12:00:00.000001Z'}),mutate('Quote',{'times.event_time':'2026-11-13T12:00:00.000002Z'})]
        self.compare(rows,True);out=js_many(rows);self.assertNotEqual(out[0]['sha256'],out[1]['sha256'])
    def test_calendar_timezone_and_leap_second_errors_rejected(self):
        self.compare([mutate('Quote',{'times.event_time':v}) for v in ['2026-02-29T12:00:00.000000Z','2026-11-31T12:00:00.000000Z','0000-01-01T00:00:00.000000Z','2026-11-13T12:00:60.000000Z','2026-11-13T12:00:00.000Z','2026-11-13T12:00:00.000000+00:00']],False)
    def test_future_information_and_expired_orders_rejected(self):
        self.compare([mutate(changes={'times.features_ready_at':'2026-11-13T12:00:00.000001Z'}),mutate(changes={'times.available_at':'2026-11-13T12:00:00.000001Z'}),mutate(changes={'payload.expires_at':'2026-11-13T12:00:00.000000Z'}),mutate(changes={'times.received_at':None})],False)
    def test_catalog_must_be_exact_unique_valid_and_current(self):
        rows=[]
        r=request();r['catalog']['instruments']*=2;rows.append(r)
        r=request();r['catalog']['policies']=[];rows.append(r)
        rows += [mutate(catalog_changes={'instruments.0.payload.tick_size':'0'}),mutate(catalog_changes={'policies.0.payload.status':'draft'}),mutate(catalog_changes={'policies.0.payload.effective_from':'2027-01-01T00:00:00.000000Z'}),mutate(catalog_changes={'policies.0.payload.revision':'8'}),mutate(catalog_changes={'policies.0.payload.maximum_positions':'0'})]
        self.compare(rows,False)
    def test_risk_ratios_not_percent_misinterpretation(self):
        self.compare([mutate('PolicyVersion',{'payload.risk_per_trade.value':'3'}),mutate('PolicyVersion',{'payload.risk_per_trade.unit':'percent'}),mutate('PolicyVersion',{'payload.total_risk.value':'0.001'})],False)
    def test_unknown_account_and_incomplete_data_never_executable(self):
        self.compare([mutate(changes={'payload.account.model':'unknown','account_ref.model':'unknown'}),mutate(changes={'coverage.completeness':'unknown','coverage.gap_state':'unknown'}),mutate(changes={'coverage.truncated':True}),mutate(changes={'coverage.gap_state':'gap'}),mutate(changes={'account_state':'unknown'}),mutate(changes={'account_state':'stale'})],False)
    def test_explicit_no_count_cap_differs_from_zero_new_entries(self):
        self.compare([mutate(catalog_changes={'policies.0.payload.maximum_positions':None})],True)
        self.compare([mutate(catalog_changes={'policies.0.payload.maximum_positions':'0'})],False)
    def test_unknown_position_is_not_flat_or_protected(self):
        self.compare([request('Position')],True)
        self.compare([mutate('Position',{'payload.broker_protection_status':'confirmed'})],False)
    def test_order_variant_discriminator_and_policy_restrictions(self):
        self.compare([mutate(changes={'payload.order_type':'market'}),mutate(changes={'payload.order_type':'stop'}),mutate(changes={'payload.side':'sell'}),mutate(changes={'payload.account.environment':'live','account_ref.environment':'live'})],False)
    def test_signals_cannot_be_relabelled_as_orders(self):
        self.compare([mutate('SignalIntent',{'kind':'OrderIntent'}),mutate('SignalIntent',{'kind':'BrokerOrder'}),mutate('SignalIntent',{'payload.source_run_id':'other-run'})],False)
    def test_market_bar_and_feature_integrity(self):
        self.compare([mutate('Quote',{'payload.ask.value':'1.2'}),mutate('Bar',{'payload.high.value':'1.2344'}),mutate('Bar',{'payload.timeframe_seconds':'0'}),mutate('FeatureSnapshot',{'payload.features.0.absolute_tolerance':'-0.001'})],False)
    def test_instrument_and_policy_unknown_fields_not_trusted(self):
        self.compare([mutate(catalog_changes={'instruments.0.payload.permit_all':True}),mutate(catalog_changes={'policies.0.payload.permit_all':True})],False)
    def test_observation_missing_times_remains_explicit_null(self):
        self.compare([mutate('Position',{'times.event_time':None,'times.available_at':None,'times.features_ready_at':None,'times.decision_at':None,'times.execution_not_before':None,'coverage.completeness':'unknown','coverage.gap_state':'unknown','coverage.source_sequence_through':None})],True)
    def test_reordered_objects_have_same_hash_but_not_reordered_arrays(self):
        row=request('FeatureSnapshot');rev=json.loads(json.dumps(row),object_pairs_hook=lambda p:dict(reversed(p)))
        self.assertEqual(js_many([row,rev])[0],js_many([row,rev])[1])
    def test_control_characters_and_schema_depth_rejected(self):
        text=json.dumps(request())
        self.compare([text.replace('"offline-fixture"','"\\ud800"')],False)
        r=request();nested={}
        for _ in range(35):nested={'a':nested}
        r['event']['unexpected']=nested;self.compare([r],False)

if __name__=='__main__':unittest.main(verbosity=2)
