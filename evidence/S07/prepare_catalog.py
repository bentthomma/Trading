#!/usr/bin/env python3
"""Build the S07 catalogue from actually executed audit results; no market access."""
from pathlib import Path
import argparse,hashlib,json,sys
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'data/quality'))
from teil6_audit import canonical,sha,file_sha,EXPECTED_ARCHIVE

def build(source:Path,out:Path):
    if out.exists():raise ValueError('OUTPUT_EXISTS_NO_OVERWRITE')
    r=json.loads((source/'data-quality-report.json').read_text());v=json.loads((source/'dataset-version.json').read_text())
    if r['archive_sha256']!=EXPECTED_ARCHIVE or not r['fx_full_scan_performed']:raise ValueError('FULL_SCAN_REQUIRED')
    for name,h in v['outputs'].items():
        if file_sha(source/name)!=h:raise ValueError('AUDIT_OUTPUT_CHANGED')
    out.mkdir(parents=True)
    main=[x for x in r['fx'] if x['cohort']=='main_2024_2025'];pilot=[x for x in r['fx'] if x['cohort']=='rejected_pilot']
    def product(id,kind,res,availability='verified_bytes',quarantined=False,modes=None,**extra):
        return {'id':id,'kind':kind,'resolution':res,'availability':availability,'quarantined':quarantined,'research_modes':modes or [],'rights_clearance':False,'production_authority':False,'website_redistribution_authorized':False,**extra}
    products=[
        product('binance-spot-h1-raw','raw_trade_ohlcv','1h',modes=['raw_ohlcv_audit'],symbols=list(r['crypto']['symbols']),rows=r['crypto']['source_rows'],archive_files=240,archive_sha256=EXPECTED_ARCHIVE,price_unit='USDT per base asset',timestamp_rule='UTC; ms through 2024, us from 2025',broker_symbol_mapping=None,historical_tick_and_lot_filters=None),
        product('binance-open-legacy','derived_open_prices','1h',modes=['legacy_representation_audit'],rows=r['crypto']['aligned_rows'],values=175220,sha256=r['crypto']['derived_table']['original_sha256'],numeric_semantics='float64 round-trip text, not source-exact decimal',selection_basis='retrospective full-bar quality filter',point_in_time_eligible=False,intrabar_path=False,executable_quotes=False),
        product('binance-open-exact-v1','derived_open_prices','1h',modes=['exact_open_audit','segmented_open_to_open'],rows=r['crypto']['aligned_rows'],sha256=r['crypto']['derived_table']['new_exact_sha256'],dataset_version=v['id'],transform_sha256=v['audit_transform'],lineage_sha256=v['outputs']['point-lineage.csv'],numeric_semantics='original decimal strings retained',selection_basis='retrospective full-bar quality filter',point_in_time_eligible=False,imputed_values=0,missing_hours=r['crypto']['aligned_missing_bar_count'],intrabar_path=False,executable_quotes=False),
        product('histdata-eurusd-ticks-main','raw_bid_ask_quotes','tick',quarantined=any(x['backward_timestamps'] or x['crossed_quotes'] or x['invalid_format_or_time'] for x in main),modes=[],diagnostic_reader_allowed=True,rows=sum(x['rows'] for x in main),months=[x['month'] for x in main],time_rule='documented fixed EST; observed backward jump remains unresolved',volume_semantics='unavailable; zero is provider placeholder',venue=None,broker_symbol_mapping=None,historical_tick_and_lot_filters=None,partitions=[{'month':x['month'],'zip_sha256':x['zip_sha256'],'csv_sha256':x['csv_sha256'],'rows':x['rows'],'quarantined_for_replay':bool(x['backward_timestamps'] or x['crossed_quotes'] or x['invalid_format_or_time']),'source_member':x['archive_member']} for x in main]),
        product('histdata-eurusd-pilot-200401','raw_bid_ask_quotes','tick',quarantined=True,rows=pilot[0]['rows'],crossed_quotes=pilot[0]['crossed_quotes'],archive_member=pilot[0]['archive_member'],zip_sha256=pilot[0]['zip_sha256'],reason='previously rejected pilot, not automatically repaired or merged'),
        product('monthly-factor-portfolios','monthly_research_returns','monthly',availability='not_loaded_in_this_package',reason='Required by S07, not present among the 753 Teil6 archive members. Historical narrative is not row verification.'),
        product('synthetic-decoder-counterexamples','synthetic_test_rows','test_only',availability='test_code',reason='Only tests/data/test_teil6_audit.py; no observed history or performance claim'),
        product('equity-history','market_history','unknown',availability='absent_from_inspected_archive',reason='No point-in-time universe, splits/dividends/delistings or price series in this input.'),
        product('gold-silver-history','market_history','unknown',availability='absent_from_inspected_archive',reason='Historical bot positions or symbol strings are not time series.'),
        product('other-fx-history','market_history','unknown',availability='absent_from_inspected_archive',reason='Only EURUSD tick inputs were present.')]
    registry={'schema':'extremelab.dataset-registry/v1','scope':'Teil6 audited preparation, not full S07 acceptance','base_revision':'e69a917a5cac207d0c9f88a2a98f69bf56d524b1','archive':{'filename':'Adaptive_Trading_Lab_Teil6.zip','bytes':264138803,'sha256':EXPECTED_ARCHIVE,'file_id':'file_00000000b2348210afb4652b9007760e','raw_storage':'external private original input; not committed to git'},'audit_transform':{'path':'data/quality/teil6_audit.py','sha256':r['auditor_sha256'],'historical_original_transform_replayed':False},'dataset_version':v['id'],'products':products,'formal_status_changed':False}
    coverage={'schema':'extremelab.coverage-grid/v1','products':[{'id':p['id'],'availability':p['availability'],'granularity':p['resolution'],'quarantined':p['quarantined'],'reviewed_modes':p['research_modes'],'live_or_commercial_authority':False} for p in products],'limitations':{'crypto_missing_hours':r['crypto']['aligned_missing_bar_count'],'crypto_quarantined_source_rows':r['crypto']['quarantined_rows'],'fx_months_scanned':len(main),'fx_rows_scanned':sum(x['rows'] for x in main),'fx_clock_reversals':sum(x['backward_timestamps'] for x in main),'fx_session_or_completeness_certification':False,'monthly_series_loaded':False,'brokers_connected':0}}
    quality=r
    monthly=ROOT/'data/catalog/master-monthly-v1'
    if monthly.exists():
        from master_monthly_audit import merge_catalog
        registry,coverage,quality=merge_catalog(registry,coverage,r,monthly)
    (out/'dataset-registry.json').write_bytes(canonical(registry));(out/'coverage-grid.json').write_bytes(canonical(coverage));(out/'data-quality-report.json').write_bytes(canonical(quality))
    return registry
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--audit',type=Path,required=True);p.add_argument('--output',type=Path,required=True);args=p.parse_args();build(args.audit,args.output)
