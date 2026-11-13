"""Real archived monthly data plus explicitly synthetic parser/copy-safety cases."""
import contextlib,copy,csv,hashlib,importlib.util,io,json,os,tempfile,types,unittest,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def module(path,name):
    s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
A=module(Path(os.environ.get('EXTREMELAB_MONTHLY_AUDITOR',ROOT/'data/quality/master_monthly_audit.py')),'monthly')
SOURCE=Path(os.environ['EXTREMELAB_MONTHLY_SOURCE'])
RESULT=Path(os.environ.get('EXTREMELAB_MONTHLY_RESULT',ROOT/'data/catalog/master-monthly-v1'))
FIX=Path(os.environ.get('EXTREMELAB_COLLECTION_TRANSFORM',ROOT/'data/transforms/master-monthly-v1/prepare_research_collection.py'))


def fixture(spec):
    header=','.join(['']+spec['columns']);values=','.join('1.25' if c!='RF' else '0.15' for c in spec['columns'])
    body='\n'.join(f'{y}{m:02d},{values}' for y in range(1998,2026) for m in range(1,13))+'\n\n'
    prefix=f'This file was created using the 202609 {spec["database"]} database.\n'
    if spec['kind']=='industry':
        return (prefix+'Average Value Weighted Returns -- Monthly\n'+header+'\n'+body+'Average Equal Weighted Returns -- Monthly\n'+header+'\n'+body+'Average Value Weighted Returns -- Annual\n'+header+'\n2025,'+values+'\n\nAverage Equal Weighted Returns -- Annual\n').encode()
    tail='Annual Factors:\nJanuary-December\n' if spec['kind']=='momentum' else 'Annual Factors: January-December\n'
    return (prefix+header+'\n'+body+tail+header+'\n2025,'+values+'\n').encode()


def write_inputs(root,transform):
    root.mkdir()
    for s in transform.SCHEMA:
        with zipfile.ZipFile(root/s['archive'],'w') as z:z.writestr(s['member'],fixture(s))


class ActualData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data=A.source_bytes(SOURCE);cls.r=json.loads((RESULT/'monthly-profile.json').read_text())
    def test_original_archived_derived_hashes(self):
        for p in self.r['products']:self.assertEqual(A.sha(self.data[p['member']]),p['sha256'])
    def test_all_seven_schemas_and_actual_cell_count(self):
        self.assertEqual(self.r['counts'],{'datasets':7,'calendar_months':336,'dataset_month_rows':2352,'numeric_cells':10416,'collection_only_numeric_cells':9744})
    def test_every_cell_lineage_matches_preserved_original(self):
        rows=list(csv.DictReader((RESULT/'point-lineage.csv').open()))
        by={p['member']:list(csv.DictReader(io.StringIO(self.data[p['member']].decode()))) for p in self.r['products']}
        self.assertEqual(len(rows),10416)
        for x in rows:
            s=by[x['derived_member']][int(x['derived_line'])-2]
            self.assertEqual((s['period'],s[x['column']]),(x['period'],x['decimal_value']))
            self.assertEqual(x['lineage_level'],'preserved_derived_csv_not_upstream_raw')
    def test_cross_series_disagreements_preserved(self):
        d=json.loads((RESULT/'series-differences.json').read_text());market=[x for x in d if x['comparison'].startswith('LAB04')]
        self.assertEqual(len(market),87);self.assertEqual(max(abs(A.Decimal(x['delta'])) for x in market),A.Decimal('.0006'))
        self.assertEqual([(x['period'],x['left'],x['right']) for x in d if x['comparison'].startswith('FF_EUROPE')],[('2025-07','0.0035','0.0034')])
    def test_provider_archive_hash_is_not_claimed_verified_bytes(self):
        self.assertEqual(self.r['limits']['original_provider_archives_present'],0)
        self.assertTrue(all(not p['upstream_archive_available'] and not p['raw_to_derived_replay_executed'] for p in self.r['products']))
    def test_original_lab_prefix_and_completed_holdout_are_not_new_evidence(self):
        h=self.r['historical_run_binding'];self.assertEqual((h['development_months'],h['full_months'],h['terminal_window_months']),(264,336,72));self.assertTrue(h['holdout_has_already_been_used']);self.assertFalse(h['holdout_may_be_claimed_new_unseen_test']);self.assertFalse(h['new_backtest_executed'])
    def test_archive_tamper_denied(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)/'changed.zip';p.write_bytes(SOURCE.read_bytes()+b'changed')
            with self.assertRaisesRegex(A.AuditError,'SOURCE_ARCHIVE_CHANGED'):A.source_bytes(p)
    def test_audit_cannot_overwrite_existing_directory(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td);(p/'marker').write_text('keep')
            with self.assertRaisesRegex(A.AuditError,'OUTPUT_EXISTS'):A.audit(SOURCE,p)
            self.assertEqual((p/'marker').read_text(),'keep')
    def test_dataset_version_binds_sources_and_auditor(self):
        v=json.loads((RESULT/'dataset-version.json').read_text());self.assertEqual(A.version_id(v['binding'],v['outputs']),v['id'])
        changed=copy.deepcopy(v['binding']);changed['master_archive_sha256']='0'*64;self.assertNotEqual(A.version_id(changed,v['outputs']),v['id'])
    def test_mutated_catalog_report_is_denied(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td)
            for f in RESULT.iterdir():
                if f.is_file():(p/f.name).write_bytes(f.read_bytes())
            (p/'monthly-profile.json').write_text('{}')
            with self.assertRaisesRegex(A.AuditError,'MONTHLY_OUTPUT_CHANGED'):A.verified_report(p)


class DecimalWindow(unittest.TestCase):
    def good(self):return b'period,mkt_excess,rf\n1998-01,0.0125,0.0015\n1998-02,-1.25,0\n'
    def read(self,raw):return A.profile(raw,['mkt_excess','rf'],{'rf'},months=2)
    def test_factors_not_required_to_be_positive_or_greater_than_minus_one(self):self.assertEqual(self.read(self.good())[0][1]['mkt_excess'],'-1.25')
    def test_total_return_must_have_positive_gross(self):
        with self.assertRaisesRegex(A.AuditError,'NONPOSITIVE_GROSS'):self.read(self.good().replace(b',0\n',b',-1\n'))
    def test_nonfinite_or_blank_cells_rejected(self):
        for value in [b'NaN',b'Infinity',b'',b'1e2',b' 0.1',b'0.1\n']:
            with self.subTest(value=value),self.assertRaises((A.AuditError,csv.Error)):self.read(self.good().replace(b'0.0125',value))
    def test_scaled_missing_sentinels_rejected(self):
        for value in [b'-0.9999',b'-9.99']:
            with self.subTest(value=value),self.assertRaisesRegex(A.AuditError,'MISSING'):self.read(self.good().replace(b'0.0125',value))
    def test_duplicate_gap_and_reversed_months_rejected(self):
        for value in [b'1998-01',b'1998-03',b'1997-12',b'1998-13']:
            with self.subTest(value=value),self.assertRaises(A.AuditError):self.read(self.good().replace(b'1998-02',value))
    def test_unexpected_columns_are_not_ignored(self):
        with self.assertRaisesRegex(A.AuditError,'HEADER'):self.read(self.good().replace(b'mkt_excess',b'price'))
    def test_short_row_and_missing_month_rejected(self):
        for raw in [self.good().replace(b',0\n',b'\n'),self.good().splitlines()[0]+b'\n']:
            with self.subTest(raw=raw),self.assertRaises(A.AuditError):self.read(raw)


class OriginalTransform(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory();cls.root=Path(cls.temp.name);data=A.source_bytes(SOURCE)
        for name in ['prepare_research_collection.py','prepare_lab04_data.py']:(cls.root/name).write_bytes(data['materials/'+name])
        cls.orig=module(cls.root/'prepare_research_collection.py','source_original');cls.lab=module(cls.root/'prepare_lab04_data.py','lab_original');cls.fixed=module(FIX,'guarded_transform')
    @classmethod
    def tearDownClass(cls):cls.temp.cleanup()
    def args(self,base,out):return types.SimpleNamespace(download=False,archive_dir=base,expected_provenance=None,retrieval_log_dir=None,output_dir=out)
    def test_patch_is_only_no_overwrite_change(self):
        old=(self.root/'prepare_research_collection.py').read_text();new=FIX.read_text()
        self.assertEqual(new,old.replace('out=args.output_dir;out.mkdir(parents=True,exist_ok=True)','out=args.output_dir;out.mkdir(parents=True,exist_ok=False)  # S07: never overwrite a frozen snapshot'))
    def test_new_folder_build_is_identical_to_original(self):
        with tempfile.TemporaryDirectory() as td,contextlib.redirect_stdout(io.StringIO()):
            root=Path(td);raw=root/'raw';write_inputs(raw,self.orig)
            self.orig.build(self.args(raw,root/'old'));self.fixed.build(self.args(raw,root/'new'))
            for p in (root/'old').iterdir():self.assertEqual(p.read_bytes(),(root/'new'/p.name).read_bytes())
    def test_existing_output_rejected(self):
        with tempfile.TemporaryDirectory() as td,contextlib.redirect_stdout(io.StringIO()):
            root=Path(td);raw=root/'raw';write_inputs(raw,self.orig);out=root/'frozen';out.mkdir();(out/'marker').write_text('keep')
            with self.assertRaises(FileExistsError):self.fixed.build(self.args(raw,out))
            self.assertEqual([p.name for p in out.iterdir()],['marker'])
    def test_existing_frozen_csv_not_replaced(self):
        with tempfile.TemporaryDirectory() as td,contextlib.redirect_stdout(io.StringIO()):
            root=Path(td);raw=root/'raw';write_inputs(raw,self.orig);out=root/'frozen'
            self.orig.build(self.args(raw,out));f=out/'us_momentum.csv';f.write_bytes(b'FROZEN_PREVIOUS_SYNTHETIC_VERSION\n')
            before={p.name:p.read_bytes() for p in out.iterdir()}
            with self.assertRaises(FileExistsError):self.fixed.build(self.args(raw,out))
            self.assertEqual({p.name:p.read_bytes() for p in out.iterdir()},before)
    def test_symlink_output_rejected_without_writes(self):
        with tempfile.TemporaryDirectory() as td,contextlib.redirect_stdout(io.StringIO()):
            root=Path(td);raw=root/'raw';write_inputs(raw,self.orig);target=root/'existing';target.mkdir();out=root/'linked';out.symlink_to(target,target_is_directory=True)
            with self.assertRaises(FileExistsError):self.fixed.build(self.args(raw,out))
            self.assertEqual(list(target.iterdir()),[])
    def test_original_parser_regressions(self):self.assertEqual(self.orig.self_test()['check_count'],35)
    def test_lab_original_exact_percent_and_rf_conversion(self):
        spec={'columns':['Mkt-RF','SMB','HML','RF'],'kind':'factor','database':'CRSP'}
        b=io.BytesIO()
        with zipfile.ZipFile(b,'w') as z:z.writestr(self.lab.EXPECTED_MEMBER,fixture(spec))
        raw,meta=self.lab.convert_archive(b.getvalue(),'1998-01','2025-12')
        rows=list(csv.DictReader(io.StringIO(raw.decode())));self.assertEqual(len(rows),336)
        self.assertEqual((rows[0]['risky_return'],rows[0]['cash_return']),('0.014','0.0015'))
        self.assertFalse(meta['point_in_time_vintage']);self.assertFalse(meta['executable_price_series'])
    def test_malformed_raw_never_writes_partial_collection(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);raw=root/'raw';write_inputs(raw,self.orig);(raw/self.orig.SCHEMA[-1]['archive']).write_bytes(b'not zip')
            with self.assertRaises((ValueError,zipfile.BadZipFile)):self.fixed.build(self.args(raw,root/'out'))
            self.assertFalse((root/'out').exists())
    def test_sentinel_in_real_original_lab_parser_rejected(self):
        spec={'columns':['Mkt-RF','SMB','HML','RF'],'kind':'factor','database':'CRSP'}
        for v in [b'-99.99',b'-999',b'NaN',b'Infinity']:
            with self.subTest(v=v),self.assertRaises(ValueError):self.lab.parse_monthly_csv(fixture(spec).replace(b'199801,1.25',b'199801,'+v,1))


class RegistryBoundary(unittest.TestCase):
    def setUp(self):self.c=json.loads((ROOT/'evidence/S07/dataset-registry.json').read_text())
    def product(self):return next(p for p in self.c['products'] if p['id']=='FF_US_5F')
    def test_registered_monthly_audit_without_execution_authority(self):
        self.assertEqual(len([p for p in self.c['products'] if p['id'].startswith('FF_')]),7)
        result=A.gate(self.product(),'monthly_returns_audit','private_offline_audit');self.assertFalse(result['broker_authority'])
    def test_combined_catalogue_has_own_version_not_the_old_teil6_id(self):
        copy=self.c.copy();version=copy.pop('catalogue_version')
        self.assertEqual(version,A.sha(A.canonical(copy)))
        self.assertNotEqual(version,self.c['dataset_version'])
        self.assertEqual(self.c['dataset_version_scope'],'teil6_original_component_only')
    def test_intrabar_minute_and_point_in_time_claims_denied(self):
        for mode in ['minute_backtest','intrabar_stops','causal_online_decisions']:
            with self.subTest(mode=mode),self.assertRaises(A.AuditError):A.gate(self.product(),mode,'private_offline_audit')
    def test_commercial_live_and_redistribution_not_granted(self):
        for purpose in ['commercial','live_trading','website_redistribution']:
            with self.subTest(purpose=purpose),self.assertRaises(A.AuditError):A.gate(self.product(),'monthly_returns_audit',purpose)
    def test_original_crypto_and_fx_boundaries_preserved(self):
        fx=next(p for p in self.c['products'] if p['id']=='histdata-eurusd-ticks-main');self.assertTrue(fx['quarantined'])
        self.assertEqual([p['month'] for p in fx['partitions'] if p['quarantined_for_replay']],['202510'])
        for id in ['gold-silver-history','equity-history','other-fx-history']:
            self.assertNotEqual(next(p for p in self.c['products'] if p['id']==id)['availability'],'verified_bytes')

if __name__=='__main__':unittest.main()
