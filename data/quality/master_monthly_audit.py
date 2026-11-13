#!/usr/bin/env python3
"""Audit preserved monthly research inputs, not a strategy or a provider downloader."""
from __future__ import annotations
import argparse,copy,csv,hashlib,importlib.util,io,json,re,sys,tempfile,zipfile
from decimal import Decimal
from pathlib import Path,PurePosixPath
sys.dont_write_bytecode=True
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'data/quality'))
from teil6_audit import canonical,sha,file_sha,strict_json,AuditError,gate
LOCK=ROOT/'evidence/S07/master-monthly/source-binding.json'
COL='materials/data/research_collection/'
LAB='materials/data/lab04/'
DECIMAL=re.compile(r'-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?')


def load_module(path:Path,name:str):
    spec=importlib.util.spec_from_file_location(name,path)
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod


def source_bytes(path:Path,lock:dict|None=None)->dict[str,bytes]:
    lock=lock or strict_json(LOCK.read_bytes())
    digest=file_sha(path)
    if digest not in (lock['master_archive']['sha256'],lock['subset_archive']['sha256']):
        raise AuditError('SOURCE_ARCHIVE_CHANGED')
    with zipfile.ZipFile(path) as z:
        names=z.namelist()
        if len(names)!=len(set(names)):raise AuditError('DUPLICATE_ARCHIVE_MEMBER')
        for n in names:
            p=PurePosixPath(n)
            if p.is_absolute() or '..' in p.parts or '\\' in n:raise AuditError('UNSAFE_SOURCE_PATH')
        if digest==lock['subset_archive']['sha256'] and set(names)!=set(lock['members']):
            raise AuditError('SOURCE_MEMBER_SET_CHANGED')
        data={}
        for n,row in lock['members'].items():
            raw=z.read(n)
            if len(raw)!=row['bytes'] or sha(raw)!=row['sha256']:raise AuditError('SOURCE_MEMBER_CHANGED:'+n)
            data[n]=raw
        return data


def ordinal(p:str)->int:
    if not re.fullmatch(r'[0-9]{4}-[0-9]{2}',p):raise AuditError('INVALID_PERIOD')
    y,m=map(int,p.split('-'))
    if not 1900<=y<=2100 or not 1<=m<=12:raise AuditError('INVALID_PERIOD')
    return y*12+m-1


def profile(raw:bytes,columns:list[str],total_columns:set[str],*,start='1998-01',months=336):
    reader=csv.reader(io.StringIO(raw.decode('utf-8'),newline=''),strict=True)
    if next(reader,None)!=['period']+columns:raise AuditError('EXACT_HEADER_REQUIRED')
    rows=[];mins={};maxs={};zeros=0
    for i,row in enumerate(reader):
        if len(row)!=len(columns)+1:raise AuditError('ROW_WIDTH')
        if ordinal(row[0])!=ordinal(start)+i:raise AuditError('MONTH_GAP_DUPLICATE_OR_ORDER')
        mapped={'period':row[0]}
        for col,s in zip(columns,row[1:],strict=True):
            if len(s)>128 or DECIMAL.fullmatch(s) is None:raise AuditError('NONCANONICAL_DECIMAL')
            v=Decimal(s)
            if not v.is_finite() or v in {Decimal('-.9999'),Decimal('-9.99')}:raise AuditError('MISSING_OR_NONFINITE')
            if col in total_columns and v<=-1:raise AuditError('NONPOSITIVE_GROSS_TOTAL_RETURN')
            mapped[col]=s;mins[col]=min(mins.get(col,v),v);maxs[col]=max(maxs.get(col,v),v);zeros+=v==0
        rows.append(mapped)
    if len(rows)!=months:raise AuditError('FIXED_WINDOW_INCOMPLETE')
    return rows,{'rows':len(rows),'first_period':rows[0]['period'],'last_period':rows[-1]['period'],
      'numeric_columns':len(columns),'numeric_values':len(rows)*len(columns),'missing_or_nonfinite_values':0,
      'duplicate_months':0,'missing_months':0,'zero_cells':int(zeros),'min':{k:str(v) for k,v in mins.items()},
      'max':{k:str(v) for k,v in maxs.items()}}


def lineage_rows(identifier,member,rows,columns,digest):
    for i,r in enumerate(rows,2):
        for c in columns:yield [identifier,r['period'],member,str(i),c,r[c],digest,'preserved_derived_csv_not_upstream_raw']


def series_differences(series):
    us=series['FF_US_5F'];lab=series['FF_US_MARKET_CASH_MONTHLY'];out=[]
    for i,(u,l) in enumerate(zip(us,lab,strict=True),2):
        if u['period']!=l['period']:raise AuditError('JOIN_PERIOD_MISMATCH')
        value=Decimal(u['mkt_excess'])+Decimal(u['rf']);delta=Decimal(l['risky_return'])-value
        if delta:out.append({'comparison':'LAB04_total_minus_US5F_reconstructed_total','period':u['period'],'line':i,'left':l['risky_return'],'right':str(value),'delta':str(delta)})
    for name in ['FF_EUROPE_3F','FF_JAPAN_3F','FF_ASIA_PACIFIC_EX_JAPAN_3F']:
        for i,(u,r) in enumerate(zip(us,series[name],strict=True),2):
            if u['period']!=r['period']:raise AuditError('JOIN_PERIOD_MISMATCH')
            delta=Decimal(r['rf'])-Decimal(u['rf'])
            if delta:out.append({'comparison':name+'_RF_minus_US5F_RF','period':u['period'],'line':i,'left':r['rf'],'right':u['rf'],'delta':str(delta)})
    return out


def version_id(binding,outputs):return sha(canonical({'binding':binding,'outputs':outputs}))


def audit(archive:Path,out:Path):
    if out.exists() or out.is_symlink():raise AuditError('OUTPUT_EXISTS_NO_OVERWRITE')
    lock=strict_json(LOCK.read_bytes());data=source_bytes(archive,lock)
    provenance=strict_json(data[COL+'collection_provenance.json']);index=strict_json(data[COL+'collection_index.json'])
    pm={d['dataset_id']:d for d in provenance['datasets']};im={d['id']:d for d in index['datasets']}
    if len(pm)!=6 or len(im)!=6:raise AuditError('DATASET_IDENTITIES')
    lineage=[];products=[];series={}
    with tempfile.TemporaryDirectory(prefix='monthly-original-') as td:
        root=Path(td)
        for n,raw in data.items():p=root/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(raw)
        original=load_module(root/'materials/prepare_research_collection.py','preserved_collection')
        verification=original.verify(root/COL)
        schema=original.SCHEMA
        for s in schema:
            d=pm[s['id']];member=COL+s['file'];raw=data[member]
            if sha(raw)!=d['output_sha256'] or im[s['id']]['sha256']!=sha(raw):raise AuditError('PROVENANCE_HASH_MISMATCH')
            cols=s['out'];tot=set(cols) if s['kind']=='industry' else {'rf'}
            rows,stats=profile(raw,cols,tot)
            if d['output_row_count']!=stats['rows'] or d['output_header']!=['period']+cols:raise AuditError('PROVENANCE_SCHEMA_MISMATCH')
            series[s['id']]=rows;lineage.extend(lineage_rows(s['id'],member,rows,cols,sha(raw)))
            kinds={c:original.COLUMN_NOTES[c][0] for c in cols}
            products.append({'id':s['id'],'member':member,'sha256':sha(raw),'profile':stats,'columns':kinds,
                'vintage_declared':d['provider_vintage'],'upstream_database_declared':d['upstream_database'],
                'upstream_archive_sha256_declared':d['source_archive_sha256'],'upstream_csv_sha256_declared':d['source_csv_sha256'],
                'upstream_archive_available':False,'raw_to_derived_replay_executed':False,
                'transform_member':'materials/prepare_research_collection.py','transform_sha256':sha(data['materials/prepare_research_collection.py'])})
    lp=strict_json(data[LAB+'lab04_data_provenance.json']);raw=data[LAB+'input.csv']
    if sha(raw)!=lp['output_sha256']:raise AuditError('LAB04_INPUT_HASH')
    rows,stats=profile(raw,['risky_return','cash_return'],{'risky_return','cash_return'})
    series[lp['dataset_id']]=rows
    lineage.extend(lineage_rows(lp['dataset_id'],LAB+'input.csv',rows,['risky_return','cash_return'],sha(raw)))
    development=data[LAB+'development_input.csv'];prefix=lp['development_prefix']
    if sha(development)!=prefix['sha256'] or development!=b'\n'.join(raw.splitlines()[:prefix['row_count']+1])+b'\n':raise AuditError('DEVELOPMENT_PREFIX_CHANGED')
    profile(development,['risky_return','cash_return'],{'risky_return','cash_return'},months=264)
    if data[LAB+'development/input_development.csv']!=development or data[LAB+'final/input_full.csv']!=raw:raise AuditError('ARCHIVED_RUN_INPUT_CHANGED')
    for f in ['protocol.json','provenance.json','selection_lock.json']:
        if data[LAB+'development/'+f]!=data[LAB+'final/'+f]:raise AuditError('HISTORICAL_RUN_BINDING_CHANGED')
    protocol=strict_json(data[LAB+'lab04_protocol.json'])
    if data[LAB+'development/protocol.json']!=data[LAB+'lab04_protocol.json']:raise AuditError('PROTOCOL_COPY_CHANGED')
    products.append({'id':lp['dataset_id'],'member':LAB+'input.csv','sha256':sha(raw),'profile':stats,
        'columns':{'risky_return':'total_research_market_return','cash_return':'cash_benchmark_monthly_return'},
        'vintage_declared':lp['provider_vintage'],'upstream_database_declared':'CRSP',
        'upstream_archive_sha256_declared':lp['source_archive_sha256'],'upstream_csv_sha256_declared':lp['source_csv_sha256'],
        'upstream_archive_available':False,'raw_to_derived_replay_executed':False,
        'transform_member':'materials/prepare_lab04_data.py','transform_sha256':sha(data['materials/prepare_lab04_data.py'])})
    if any(p['upstream_archive_sha256_declared'] in [sha(v) for v in data.values()] for p in products):raise AuditError('RAW_AVAILABILITY_NEEDS_REASSESSMENT')
    differences=series_differences(series);market=[v for v in differences if v['comparison'].startswith('LAB04')]
    report={'schema':'extremelab.master-monthly-audit/v1','scope':'private_source_and_unit_audit_not_new_strategy_test',
      'master_archive':lock['master_archive'],'preserved_members_verified':len(data),'products':products,
      'counts':{'datasets':len(products),'calendar_months':len({r['period'] for rows in series.values() for r in rows}),
        'dataset_month_rows':sum(len(rows) for rows in series.values()),'numeric_cells':len(lineage),
        'collection_only_numeric_cells':sum(p['profile']['numeric_values'] for p in products[:-1])},
      'original_packaged_verifier_assertions':verification['check_count'],
      'cross_series':{'market_difference_months':len(market),'market_max_abs_delta_decimal':str(max(abs(Decimal(x['delta'])) for x in market)),
        'rf_difference_rows_across_three_regional_series':len(differences)-len(market),
        'rf_distinct_disagreement_months':sorted({x['period'] for x in differences if not x['comparison'].startswith('LAB04')}),
        'automatic_substitution_allowed':False,'cause_verified':False,'performance_impact_measured':False},
      'historical_run_binding':{'development_months':264,'full_months':336,'terminal_window_months':72,
        'development_is_exact_prefix':True,'development_and_final_inputs_match':True,'protocol_and_selection_lock_preserved':True,
        'holdout_has_already_been_used':True,'holdout_may_be_claimed_new_unseen_test':False,
        'signal_timing':protocol['signal_timing'],'holdout_start':protocol['holdout_start'],'holdout_end':protocol['holdout_end'],
        'new_backtest_executed':False},
      'limits':{'original_provider_archives_present':0,'original_provider_archives_expected':7,
        'raw_transform_parity':'blocked_original_provider_zips_not_in_master_archive',
        'monthly_observation_is_publication_time':False,'point_in_time_certified':False,
        'tradable_quotes':False,'broker_account_currency':'not_implied_by_USD_research_return',
        'commercial_or_redistribution_rights_granted':False,'native_tests_executed':False}}
    stream=io.StringIO(newline='');writer=csv.writer(stream,lineterminator='\n');writer.writerow(['dataset_id','period','derived_member','derived_line','column','decimal_value','derived_sha256','lineage_level']);writer.writerows(lineage)
    outputs={'monthly-profile.json':canonical(report),'series-differences.json':canonical(differences),'point-lineage.csv':stream.getvalue().encode()}
    binding={'master_archive_sha256':lock['master_archive']['sha256'],'source_lock_sha256':file_sha(LOCK),'auditor_sha256':file_sha(Path(__file__)),
      'original_transforms':{n:sha(data[n]) for n in ['materials/prepare_research_collection.py','materials/prepare_lab04_data.py']},
      'guarded_transform_sha256':file_sha(ROOT/'data/transforms/master-monthly-v1/prepare_research_collection.py')}
    hashes={n:sha(raw) for n,raw in outputs.items()}
    outputs['dataset-version.json']=canonical({'schema':'extremelab.monthly-catalogue-version/v1','id':version_id(binding,hashes),'binding':binding,'outputs':hashes,'data_rewritten':False})
    out.mkdir(parents=True,exist_ok=False)
    for n,raw in outputs.items():(out/n).write_bytes(raw)
    return report


def verified_report(folder:Path):
    v=strict_json((folder/'dataset-version.json').read_bytes())
    if version_id(v['binding'],v['outputs'])!=v['id']:raise AuditError('MONTHLY_VERSION_CHANGED')
    if v['binding']['auditor_sha256']!=file_sha(Path(__file__)) or v['binding']['source_lock_sha256']!=file_sha(LOCK):raise AuditError('MONTHLY_CODE_BINDING_CHANGED')
    if v['binding']['guarded_transform_sha256']!=file_sha(ROOT/'data/transforms/master-monthly-v1/prepare_research_collection.py'):raise AuditError('MONTHLY_TRANSFORM_CHANGED')
    for n,h in v['outputs'].items():
        if n not in ['monthly-profile.json','series-differences.json','point-lineage.csv'] or file_sha(folder/n)!=h:raise AuditError('MONTHLY_OUTPUT_CHANGED')
    if len(v['outputs'])!=3:raise AuditError('MONTHLY_OUTPUT_SET_CHANGED')
    return strict_json((folder/'monthly-profile.json').read_bytes()),v


def merge_catalog(registry,coverage,quality,folder:Path):
    report,v=verified_report(folder);reg=copy.deepcopy(registry);cov=copy.deepcopy(coverage);q=copy.deepcopy(quality)
    product=next(p for p in reg['products'] if p['id']=='monthly-factor-portfolios')
    product.update(availability='verified_derived_collection',reason='Seven preserved monthly derived datasets; full provider ZIPs remain unavailable.',
        members=[p['id'] for p in report['products']],dataset_version=v['id'],raw_transform_replay=False)
    for p in report['products']:
        if any(old['id']==p['id'] for old in reg['products']):raise AuditError('DUPLICATE_PRODUCT_ID')
        reg['products'].append({'id':p['id'],'kind':'monthly_research_returns','resolution':'monthly','availability':'verified_bytes',
           'quarantined':False,'research_modes':['monthly_returns_audit'],'rows':p['profile']['rows'],'sha256':p['sha256'],
           'dataset_version':v['id'],'point_in_time_eligible':False,'raw_source_replay_verified':False,
           'columns':p['columns'],'source_archive':report['master_archive']['sha256'],'derived_member':p['member'],
           'rights_clearance':False,'production_authority':False,'website_redistribution_authorized':False})
    reg['scope']='Teil6 + preserved Master monthly data audit; no full S07 acceptance'
    reg['master_monthly']={'version':v['id'],'report':'data/catalog/master-monthly-v1/monthly-profile.json','raw_provider_archives_present':0}
    cov['products']=[{'id':p['id'],'availability':p['availability'],'granularity':p['resolution'],'quarantined':p['quarantined'],'reviewed_modes':p['research_modes'],'live_or_commercial_authority':False} for p in reg['products']]
    cov['limitations'].update(monthly_series_loaded=True,monthly_raw_provider_parity=False,monthly_unique_calendar_months=report['counts']['calendar_months'])
    reg['dataset_version_scope']='teil6_original_component_only'
    reg['catalogue_version']=sha(canonical(reg))
    cov['catalogue_version']=reg['catalogue_version']
    q['master_monthly']=report
    return reg,cov,q

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--archive',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    result=audit(a.archive,a.output);print(json.dumps(result['counts'],sort_keys=True))
