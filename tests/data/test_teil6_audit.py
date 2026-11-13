"""Data-bound and adversarial tests. Synthetic rows are only decoder counterexamples."""
import copy,csv,datetime as dt,hashlib,importlib.util,io,json,os,tempfile,unittest,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
MOD=Path(os.environ.get('EXTREMELAB_AUDITOR',ROOT/'data/quality/teil6_audit.py'))
spec=importlib.util.spec_from_file_location('audit',MOD);a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
ARCHIVE=Path(os.environ['EXTREMELAB_TEIL6']);RESULT=Path(os.environ['EXTREMELAB_DATA_RESULT'])

def base_bar():
    return ['1609459200000','1.00000000','2.00000000','0.50000000','1.50000000','10.00000000','1609462799999','15.00000000','5','5.00000000','7.00000000','0']
def tick(t='20240201 000000246',bid='1.080760',ask='1.080780',volume='0'):
    return f'{t},{bid},{ask},{volume}\n'.encode()

class DecodeTests(unittest.TestCase):
    def test_ms_bar(self):self.assertEqual(a.bar(base_bar(),'2021-01')[1:],([], 'ms'))
    def test_microsecond_switch(self):
        r=base_bar();r[0]='1735689600000000';r[6]='1735693199999999';self.assertEqual(a.bar(r,'2025-01')[1:],([], 'us'))
    def test_wrong_unit_rejected(self):
        r=base_bar();r[0]='1735689600000';r[6]='1735693199999'
        with self.assertRaisesRegex(a.AuditError,'TIMESTAMP_UNIT'):a.bar(r,'2025-01')
    def test_unknown_column_rejected(self):
        with self.assertRaisesRegex(a.AuditError,'COLUMN'):a.bar(base_bar()+['extra'],'2021-01')
    def test_nonfinite_prices_rejected(self):
        for val in ['NaN','Infinity','-Infinity','nan']:
            r=base_bar();r[2]=val
            with self.subTest(val=val),self.assertRaises(a.AuditError):a.bar(r,'2021-01')
    def test_decimal_newline_not_accepted(self):
        with self.assertRaises(a.AuditError):a.number('1.25\n')
    def test_spot_nonpositive_rejected(self):
        r=base_bar();r[3]='0'
        with self.assertRaisesRegex(a.AuditError,'NONPOSITIVE'):a.bar(r,'2021-01')
    def test_ohlc_inconsistency_rejected(self):
        r=base_bar();r[2]='0.9'
        with self.assertRaisesRegex(a.AuditError,'OHLC'):a.bar(r,'2021-01')
    def test_trade_volume_quarantine_is_not_deletion(self):
        r=base_bar();r[5]=r[7]=r[8]=r[9]=r[10]='0';r[6]='1609462790000'
        self.assertEqual(set(a.bar(r,'2021-01')[1]),{'nonstandard_close_duration','no_trades','no_base_volume','no_quote_volume'})
    def test_missing_bar_count_not_distance(self):
        r=a.runs([a.START_US,a.START_US+a.HOUR_US]);self.assertEqual(r[0]['missing_bar_count'],2)
    def test_tick_crossed_quotes_not_swapped(self):
        r=a.tick_scan(io.BytesIO(tick(bid='1.1'+'00000',ask='1.080780')),'202402');self.assertEqual(r['crossed_quotes'],1)
    def test_equal_times_distinct_quotes_preserved(self):
        r=a.tick_scan(io.BytesIO(tick()+tick(bid='1.080750')),'202402')
        self.assertEqual((r['rows'],r['same_time_adjacent_rows'],r['same_time_different_adjacent_quotes'],r['exact_adjacent_duplicates']),(2,1,1,0))
    def test_adjacent_duplicate_not_silently_removed(self):
        r=a.tick_scan(io.BytesIO(tick()+tick()),'202402');self.assertEqual((r['rows'],r['exact_adjacent_duplicates']),(2,1))
    def test_invalid_time_and_month_reported(self):
        for stamp in ['20240230 000000000','20240201 250000000','20240301 000000000','20240201 000060000']:
            with self.subTest(stamp=stamp):self.assertEqual(a.tick_scan(io.BytesIO(tick(t=stamp)),'202402')['invalid_format_or_time'],1)
    def test_nonchronological_tick_detected(self):
        r=a.tick_scan(io.BytesIO(tick(t='20240201 000001000')+tick()),'202402');self.assertEqual(r['backward_timestamps'],1)
    def test_nonadjacent_repeated_timestamp_is_not_hidden(self):
        r=a.tick_scan(io.BytesIO(tick()+tick(t='20240201 000001000')+tick()),'202402')
        self.assertEqual(r['exact_adjacent_duplicates'],0)
        self.assertEqual((r['duplicate_timestamp_rows_within_day'],r['exact_duplicate_rows_within_day']),(1,1))
    def test_zero_volume_is_explicit_placeholder(self):
        self.assertEqual(a.tick_scan(io.BytesIO(tick()),'202402')['zero_volume_placeholders'],1)
    def test_fixed_est_not_summer_dst(self):
        self.assertEqual(a.tick_utc('20240701 000000123'),'2024-07-01T05:00:00.123+00:00')
        self.assertEqual(a.tick_utc('20240101 000000123'),'2024-01-01T05:00:00.123+00:00')
    def test_invalid_json_not_coerced(self):
        for raw in [b'{"x":1,"x":2}',b'{"x":NaN}']:
            with self.assertRaises(a.AuditError):a.strict_json(raw)
    def test_unsafe_archive_path_rejected(self):
        for name in ['../raw.csv','/raw.csv','a\\b.csv']:
            mem=io.BytesIO()
            with zipfile.ZipFile(mem,'w') as z:z.writestr(name,b'x')
            with zipfile.ZipFile(io.BytesIO(mem.getvalue())) as z,self.assertRaises(a.AuditError):a.safe_members(z)
    def test_duplicate_archive_member_rejected(self):
        import warnings
        mem=io.BytesIO()
        with warnings.catch_warnings():
            warnings.simplefilter('ignore')
            with zipfile.ZipFile(mem,'w') as z:z.writestr('a',b'1');z.writestr('a',b'2')
        with zipfile.ZipFile(io.BytesIO(mem.getvalue())) as z,self.assertRaises(a.AuditError):a.safe_members(z)
    def test_existing_output_not_overwritten(self):
        with tempfile.TemporaryDirectory() as t:
            p=Path(t);(p/'marker').write_text('keep')
            with self.assertRaisesRegex(a.AuditError,'OUTPUT_EXISTS'):a.audit(ARCHIVE,p)
            self.assertEqual((p/'marker').read_text(),'keep')

class OriginalArchiveTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.r=json.loads((RESULT/'data-quality-report.json').read_text());cls.version=json.loads((RESULT/'dataset-version.json').read_text())
    def test_actual_archive_identity(self):self.assertEqual(a.file_sha(ARCHIVE),a.EXPECTED_ARCHIVE)
    def test_all_240_archives_and_original_gap_counts(self):
        r=self.r['crypto'];self.assertEqual((r['source_archives'],r['source_rows'],r['quarantined_rows'],r['aligned_rows'],r['aligned_missing_bar_count']),(240,175240,20,43805,19));self.assertTrue(r['historical_quality_summary_reproduced'])
        self.assertTrue(all(x['raw_missing_bar_count']==14 and x['quarantined_rows']==5 for x in r['symbols'].values()))
    def test_original_float_representation_not_exact_decimal(self):
        d=self.r['crypto']['derived_table'];self.assertGreater(d['decimal_text_deviations'],0);self.assertEqual(d['different_float64_values'],0);self.assertEqual(d['checked_values'],175220)
    def test_all_exact_output_points_trace_to_raw(self):
        sources=json.loads((RESULT/'crypto-source-files.json').read_text());by_month={}
        with zipfile.ZipFile(ARCHIVE) as z:
            for s in sources:
                raw=z.read(s['archive_member']);self.assertEqual(a.sha(raw),s['zip_sha256'])
                with zipfile.ZipFile(io.BytesIO(raw)) as nested:
                    data=nested.read(s['csv_member']);self.assertEqual(a.sha(data),s['csv_sha256']);by_month[(s['symbol'],s['month'])]=list(csv.reader(io.StringIO(data.decode())))
        rows=list(csv.DictReader(io.StringIO((RESULT/'common_open_prices_exact.csv').read_text())));loc=list(csv.DictReader(io.StringIO((RESULT/'point-lineage.csv').read_text())));self.assertEqual(len(rows),len(loc))
        points=0
        for r,l in zip(rows,loc,strict=True):
            self.assertEqual(r['timestamp'],l['timestamp']);self.assertEqual(l['source_month'],r['timestamp'][:7])
            for symbol in a.SYMBOLS:
                raw=by_month[(symbol,l['source_month'])][int(l[symbol+'_csv_line'])-1]
                self.assertEqual(r['price_'+symbol],raw[1]);self.assertEqual(a.iso(a.bar(raw,l['source_month'])[0]),r['timestamp']);points+=1
        self.assertEqual(points,175220)
    def test_all_output_hashes_bound(self):
        for name,h in self.version['outputs'].items():self.assertEqual(a.file_sha(RESULT/name),h)
        self.assertEqual(self.version['audit_transform'],a.file_sha(MOD))
    def test_dataset_identity_changes_on_code_or_input_change(self):
        args=[self.version['raw_archive'],self.version['audit_transform'],self.r['crypto']['derived_table']['new_exact_sha256'],self.r['crypto']['derived_table']['lineage_sha256']]
        self.assertEqual(a.dataset_version_id(*args),self.version['id'])
        for i in range(4):
            changed=args.copy();changed[i]='0'*64
            self.assertNotEqual(a.dataset_version_id(*changed),self.version['id'])
    def test_main_fx_and_pilot_never_combined(self):
        self.assertTrue(self.r['fx_full_scan_performed']);main=[r for r in self.r['fx'] if r['cohort']=='main_2024_2025'];pilot=[r for r in self.r['fx'] if r['cohort']=='rejected_pilot']
        self.assertEqual(len(main),22);self.assertEqual(len(pilot),1);self.assertEqual(pilot[0]['month'],'200401');self.assertGreater(pilot[0]['crossed_quotes'],0)
        self.assertTrue(all(r['invalid_format_or_time']==0 for r in main))
    def test_october2025_clock_reversal_is_preserved(self):
        r=next(r for r in self.r['fx'] if r['month']=='202510')
        self.assertEqual(r['backward_timestamps'],1)
        p=next(p for p in r['sample_problems'] if p['problem']=='BACKWARD_TIMESTAMP')
        self.assertEqual((p['previous_line'],p['line'],p['delta_ms']),(1185416,1185417,-3598189))
    def test_real_original_clock_pair_through_decoder(self):
        r=next(r for r in self.r['fx'] if r['month']=='202510');p=next(p for p in r['sample_problems'] if p['problem']=='BACKWARD_TIMESTAMP')
        with zipfile.ZipFile(ARCHIVE) as z,zipfile.ZipFile(io.BytesIO(z.read(r['archive_member']))) as n,n.open(r['csv_member']) as f:
            selected=[]
            for line,raw in enumerate(f,1):
                if line in [p['previous_line'],p['line']]:selected.append(raw)
                if line==p['line']:break
        self.assertEqual(a.sha(selected[0]),p['previous_row_sha256'])
        scan=a.tick_scan(io.BytesIO(b''.join(selected)),'202510');self.assertEqual(scan['backward_timestamps'],1)
    def test_utc_reports_and_original_problem_rows(self):
        with zipfile.ZipFile(ARCHIVE) as z:
            for report in self.r['fx']:
                self.assertEqual(report['first_utc'],a.tick_utc(report['first_local_timestamp']))
                raw=z.read(report['archive_member']);self.assertEqual(a.sha(raw),report['zip_sha256'])
                if report['sample_problems']:
                    wanted={p['line']:p for p in report['sample_problems']}
                    with zipfile.ZipFile(io.BytesIO(raw)) as nz,nz.open(report['csv_member']) as f:
                        for line,row in enumerate(f,1):
                            if line in wanted:self.assertEqual(a.sha(row),wanted[line]['row_sha256'])
                            if line>=max(wanted):break

class CompatibilityTests(unittest.TestCase):
    def product(self):return {'availability':'verified_bytes','quarantined':False,'research_modes':['audit','open_to_open_segmented']}
    def test_open_only_rejects_intrabar(self):
        with self.assertRaisesRegex(a.AuditError,'INCOMPATIBLE'):a.gate(self.product(),'intrabar_stops','private_offline_audit')
    def test_monthly_rejects_minute_model(self):
        p=self.product();p['research_modes']=['monthly_returns_audit']
        with self.assertRaises(a.AuditError):a.gate(p,'minute_backtest','private_offline_audit')
    def test_missing_gold_not_usable(self):
        p=self.product();p['availability']='missing'
        with self.assertRaisesRegex(a.AuditError,'UNAVAILABLE'):a.gate(p,'audit','private_offline_audit')
    def test_pilot_not_usable(self):
        p=self.product();p['quarantined']=True
        with self.assertRaisesRegex(a.AuditError,'QUARANTINED'):a.gate(p,'audit','private_offline_audit')
    def test_no_production_or_redistribution(self):
        for purpose in ['live_trading','commercial','website_redistribution']:
            with self.assertRaises(a.AuditError):a.gate(self.product(),'audit',purpose)
        result=a.gate(self.product(),'audit','private_offline_audit');self.assertFalse(result['broker_authority']);self.assertFalse(result['redistribution'])

class CatalogueTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.c=json.loads((ROOT/'evidence/S07/dataset-registry.json').read_text())
    def test_archive_bound_catalogue(self):
        self.assertEqual(self.c['archive']['sha256'],a.EXPECTED_ARCHIVE);self.assertFalse(self.c['formal_status_changed'])
    def test_real_catalogue_excludes_incompatible_experiment(self):
        p=next(p for p in self.c['products'] if p['id']=='binance-open-exact-v1')
        with self.assertRaises(a.AuditError):a.gate(p,'intrabar_stops','private_offline_audit')
    def test_filtered_open_not_approved_at_event_time(self):
        for id in ['binance-open-legacy','binance-open-exact-v1']:
            p=next(p for p in self.c['products'] if p['id']==id)
            self.assertFalse(p['point_in_time_eligible'])
            with self.assertRaises(a.AuditError):a.gate(p,'causal_online_decisions','private_offline_audit')
    def test_clock_conflict_is_quarantined_in_catalogue(self):
        p=next(p for p in self.c['products'] if p['id']=='histdata-eurusd-ticks-main')
        self.assertTrue(p['quarantined']);self.assertEqual([x['month'] for x in p['partitions'] if x['quarantined_for_replay']],['202510'])
    def test_missing_not_replaced_by_synthetic(self):
        for id in ['monthly-factor-portfolios','equity-history','gold-silver-history','other-fx-history']:
            p=next(p for p in self.c['products'] if p['id']==id);self.assertNotEqual(p['availability'],'verified_bytes')
        self.assertTrue(all(not p['production_authority'] and not p['website_redistribution_authorized'] for p in self.c['products']))

if __name__=='__main__':unittest.main()
