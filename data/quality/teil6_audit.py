#!/usr/bin/env python3
"""Read-only, versioned audit of the supplied Teil6 archive; no fetching or trading.
Original source bytes are never changed. A new exact-decimal projection is an
explicit research candidate, not an executable quote feed or rights clearance.
"""
from __future__ import annotations
import argparse, calendar, collections, csv, datetime as dt, hashlib, io, json, re, sys, zipfile
from decimal import Decimal
from pathlib import Path, PurePosixPath
EXPECTED_ARCHIVE = 'cf2dd5842c6a22a15e82f6d19d7c16cf404d6b613640289dfe663e525bcdef3d'
PREFIX = 'adaptive_trading_lab/data_real/'
SYMBOLS = ('BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT')
UTC = dt.timezone.utc
HOUR_US = 3_600_000_000
START_US = int(dt.datetime(2021,1,1,tzinfo=UTC).timestamp())*1_000_000
END_US = int(dt.datetime(2026,1,1,tzinfo=UTC).timestamp())*1_000_000
DECIMAL = re.compile(r'(?:0|[1-9][0-9]*)(?:\.[0-9]+)?\Z', re.ASCII)
TICK = re.compile(rb'([0-9]{8}) ([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{3}),([0-9]+)\.([0-9]{6}),([0-9]+)\.([0-9]{6}),([0-9]+)\Z')
class AuditError(ValueError): pass

def sha(data: bytes) -> str: return hashlib.sha256(data).hexdigest()
def file_sha(path: Path) -> str:
    with path.open('rb') as f: return hashlib.file_digest(f,'sha256').hexdigest()
def canonical(obj) -> bytes:
    return (json.dumps(obj,ensure_ascii=False,sort_keys=True,indent=2,allow_nan=False)+'\n').encode()
def strict_json(raw: bytes):
    def pairs(items):
        d={}
        for k,v in items:
            if k in d: raise AuditError('DUPLICATE_JSON_KEY:'+k)
            d[k]=v
        return d
    return json.loads(raw,object_pairs_hook=pairs,parse_constant=lambda x: (_ for _ in ()).throw(AuditError('NONFINITE_JSON:'+x)))
def safe_members(z):
    names=z.namelist()
    if len(names)!=len(set(names)): raise AuditError('DUPLICATE_ARCHIVE_MEMBER')
    for i in z.infolist():
        p=PurePosixPath(i.filename)
        if p.is_absolute() or '..' in p.parts or '\\' in i.filename or (i.external_attr>>16)&0o170000==0o120000:
            raise AuditError('UNSAFE_ARCHIVE_MEMBER:'+i.filename)
    return names

def number(s):
    if not isinstance(s,str) or not DECIMAL.fullmatch(s): raise AuditError('BAD_DECIMAL')
    v=Decimal(s)
    if not v.is_finite(): raise AuditError('NONFINITE_DECIMAL')
    return v

def bar(row,month):
    if len(row)!=12: raise AuditError('BAR_COLUMN_COUNT')
    y,m=map(int,month.split('-')); unit='us' if month>='2025-01' else 'ms';mul=1 if unit=='us' else 1000
    if not row[0].isdigit() or not row[6].isdigit() or not row[8].isdigit(): raise AuditError('BAR_INTEGER_FIELD')
    opened,closed=int(row[0])*mul,int(row[6])*mul
    lo=int(dt.datetime(y,m,1,tzinfo=UTC).timestamp())*1_000_000
    hi=lo+calendar.monthrange(y,m)[1]*24*HOUR_US
    if not lo<=opened<hi: raise AuditError('TIMESTAMP_UNIT_OR_MONTH')
    if opened%HOUR_US: raise AuditError('OFF_HOUR_GRID')
    if closed<opened: raise AuditError('CLOSE_BEFORE_OPEN')
    op,high,low,close,vol=[number(x) for x in row[1:6]]
    qvol=number(row[7]); taker=number(row[9]); tqvol=number(row[10]); number(row[11])
    if min(op,high,low,close)<=0: raise AuditError('SPOT_PRICE_NONPOSITIVE')
    if low>min(op,close) or high<max(op,close) or low>high: raise AuditError('OHLC_INCONSISTENT')
    if taker>vol or tqvol>qvol: raise AuditError('TAKER_EXCEEDS_TOTAL')
    reasons=[]
    if closed-opened != HOUR_US-mul: reasons.append('nonstandard_close_duration')
    if int(row[8])<=0: reasons.append('no_trades')
    if vol<=0: reasons.append('no_base_volume')
    if qvol<=0: reasons.append('no_quote_volume')
    return opened, reasons, unit

def iso(us): return dt.datetime.fromtimestamp(us//1_000_000,UTC).isoformat()
def runs(times):
    out=[]
    for x in sorted(times):
        if out and x==out[-1][-1]+HOUR_US: out[-1].append(x)
        else: out.append([x])
    return [{'first_missing_open_utc':iso(a[0]),'last_missing_open_utc':iso(a[-1]),'missing_bar_count':len(a)} for a in out]

def check_crypto(z,output: Path):
    names=safe_members(z); invraw=z.read(PREFIX+'source_inventory.json'); inv=strict_json(invraw)
    old=strict_json(z.read(PREFIX+'quality.json'))
    if old['source_inventory_sha256']!=sha(invraw): raise AuditError('INVENTORY_HASH')
    entries=inv['archives'];months=[f'{y}-{m:02}' for y in range(2021,2026) for m in range(1,13)]
    pairs={(e['symbol'],e['month']) for e in entries}
    if len(entries)!=240 or pairs!={(s,m) for s in SYMBOLS for m in months}: raise AuditError('SOURCE_SET')
    used=[PREFIX+e['local_path'] for e in entries]
    observed=[n for n in names if n.startswith(PREFIX+'raw/') and n.endswith('.zip')]
    if sorted(used)!=sorted(observed): raise AuditError('RAW_SET')
    raw_by={s:{} for s in SYMBOLS}; good_by={s:{} for s in SYMBOLS}; exclusions=[]; source_files=[]
    for e in sorted(entries,key=lambda x:(SYMBOLS.index(x['symbol']),x['month'])):
        name=PREFIX+e['local_path'];raw=z.read(name);cs=z.read(PREFIX+e['checksum_local_path'])
        if len(raw)!=e['bytes'] or sha(raw)!=e['sha256'] or sha(cs)!=e['checksum_file_sha256']: raise AuditError('SOURCE_HASH:'+name)
        parts=cs.decode().strip().split()
        if len(parts)!=2 or parts[0]!=sha(raw) or parts[1].lstrip('*')!=PurePosixPath(name).name: raise AuditError('CHECKSUM_BINDING')
        if strict_json(z.read(name+'.metadata.json'))!=e: raise AuditError('SOURCE_METADATA_MISMATCH:'+name)
        with zipfile.ZipFile(io.BytesIO(raw)) as sub:
            subnames=safe_members(sub); expected=PurePosixPath(name).name[:-4]+'.csv'
            if subnames!=[expected]: raise AuditError('CSV_MEMBER_SET')
            data=sub.read(expected)
        src={'archive_member':name,'zip_sha256':sha(raw),'csv_member':expected,'csv_sha256':sha(data),'source_url':e['archive_url'],'timestamp_unit':'us' if e['month']>='2025-01' else 'ms','symbol':e['symbol'],'month':e['month'],'rows':0,'quarantined':0}
        previous=None
        for line,row in enumerate(csv.reader(io.StringIO(data.decode('ascii'))),1):
            t,reasons,unit=bar(row,e['month']);symbol=e['symbol']
            if previous is not None and t<=previous: raise AuditError('NONMONOTONE_OR_DUPLICATE_BAR')
            if t in raw_by[symbol]:raise AuditError('DUPLICATE_BAR_ACROSS_ARCHIVES')
            previous=t; point=(row[1],line,expected,src['zip_sha256'])
            raw_by[symbol][t]=point;src['rows']+=1
            if reasons:
                src['quarantined']+=1; exclusions.append({'symbol':symbol,'timestamp':iso(t),'archive_member':name,'csv_member':expected,'raw_line':line,'reasons':reasons})
            else:good_by[symbol][t]=point
        source_files.append(src)
    for doc in inv['source_documents']:
        b=z.read(PREFIX+doc['local_path'])
        if sha(b)!=doc['sha256'] or len(b)!=doc['bytes']:raise AuditError('SOURCE_DOC_HASH')
    exraw=z.read(PREFIX+'data_quality_exclusions.csv')
    if sha(exraw)!=old['exclusions_csv_sha256']:raise AuditError('EXCLUSIONS_HASH')
    declared=list(csv.DictReader(io.StringIO(exraw.decode())))
    observed={(e['symbol'],e['timestamp']):set(e['reasons']) for e in exclusions}
    recorded={(e['symbol'],e['timestamp']):set(e['reasons'].split(';')) for e in declared}
    if len(declared)!=len(recorded) or observed!=recorded:raise AuditError('EXCLUSIONS_NOT_REPRODUCED')
    expected=set(range(START_US,END_US,HOUR_US));common=set.intersection(*(set(good_by[s]) for s in SYMBOLS));sorted_common=sorted(common)
    raw_table=z.read(PREFIX+'common_open_prices.csv')
    if sha(raw_table)!=old['aligned_csv_sha256']:raise AuditError('DERIVED_TABLE_HASH')
    reader=csv.DictReader(io.StringIO(raw_table.decode()))
    if reader.fieldnames!=['timestamp']+['price_'+s for s in SYMBOLS]:raise AuditError('TABLE_SCHEMA')
    mismatch=0;float_mismatch=0;maxdiff=Decimal(0);first_mismatch=None;rows=0
    for rows,r in enumerate(reader,1):
        if rows>len(sorted_common):raise AuditError('EXTRA_TABLE_ROW')
        t=int(dt.datetime.fromisoformat(r['timestamp']).timestamp())*1_000_000
        if t!=sorted_common[rows-1]:raise AuditError('TABLE_TIMESTAMP')
        for s in SYMBOLS:
            original=good_by[s][t][0]; text=r['price_'+s];value=number(text); delta=abs(value-number(original))
            if delta:
                mismatch+=1;maxdiff=max(maxdiff,delta)
                if first_mismatch is None:first_mismatch={'timestamp':iso(t),'symbol':s,'original_decimal':original,'derived_text':text,'absolute_difference':str(delta)}
            if float(text)!=float(original):float_mismatch+=1
    if rows!=len(common):raise AuditError('MISSING_TABLE_ROW')
    if float_mismatch:raise AuditError('UNEXPLAINED_VALUE_CHANGE')
    exact=io.StringIO(newline='');w=csv.writer(exact,lineterminator='\n');w.writerow(['timestamp']+['price_'+s for s in SYMBOLS])
    lineage=io.StringIO(newline='');l=csv.writer(lineage,lineterminator='\n');l.writerow(['timestamp','source_month']+[s+'_csv_line' for s in SYMBOLS])
    for t in sorted_common:
        w.writerow([iso(t)]+[good_by[s][t][0] for s in SYMBOLS]);l.writerow([iso(t),iso(t)[:7]]+[good_by[s][t][1] for s in SYMBOLS])
    exactb=exact.getvalue().encode();lineb=lineage.getvalue().encode()
    (output/'common_open_prices_exact.csv').write_bytes(exactb);(output/'point-lineage.csv').write_bytes(lineb)
    (output/'crypto-source-files.json').write_bytes(canonical(source_files));(output/'crypto-quarantine.json').write_bytes(canonical(exclusions))
    bysym={s:{'raw_rows':len(raw_by[s]),'accepted_rows':len(good_by[s]),'raw_missing_bar_count':len(expected-set(raw_by[s])),'quarantined_rows':len(raw_by[s])-len(good_by[s]),'raw_missing_ranges':runs(expected-set(raw_by[s])),'accepted_missing_ranges':runs(expected-set(good_by[s]))} for s in SYMBOLS}
    return {'source_archives':len(entries),'source_rows':sum(x['rows'] for x in source_files),'quarantined_rows':len(exclusions),'expected_hours':len(expected),'aligned_rows':len(common),'aligned_missing_bar_count':len(expected-common),'aligned_missing_ranges':runs(expected-common),'symbols':bysym,'historical_quality_summary_reproduced':len(common)==old['common_open_price_rows'] and len(exclusions)==old['quarantined_rows_total'] and len(expected-common)==old['common_missing_hours'],'derived_table':{'original_sha256':sha(raw_table),'decimal_text_deviations':mismatch,'checked_values':rows*4,'different_float64_values':float_mismatch,'maximum_absolute_decimal_difference':str(maxdiff),'first_deviation':first_mismatch,'new_exact_sha256':sha(exactb),'lineage_sha256':sha(lineb)},'provider_checksums':'240 archived checksums plus metadata and inventory; not a digital signature','constraints_not_verified':['historical exchange tick/lot filters','point-in-time universe','broker executable quotes','venue halt causality','intrabar path']}

def tick_values(raw: bytes,days:dict):
    m=TICK.fullmatch(raw.rstrip(b'\r\n'))
    if not m:raise AuditError('TICK_FORMAT')
    day,h,mi,se,ms,b,bd,a,ad,v=m.groups()
    if day not in days:
        date=dt.date(int(day[:4]),int(day[4:6]),int(day[6:]));days[day]=date.toordinal()*86_400_000
    hour,minute,second=int(h),int(mi),int(se)
    if hour>23 or minute>59 or second>59:raise AuditError('TICK_CLOCK')
    ts=days[day]+((hour*60+minute)*60+second)*1000+int(ms)
    return ts,int(b)*1_000_000+int(bd),int(a)*1_000_000+int(ad),int(v),day.decode()

def tick_utc(stamp):
    if stamp is None: return None
    local=dt.datetime.strptime(stamp, '%Y%m%d %H%M%S%f').replace(tzinfo=dt.timezone(dt.timedelta(hours=-5)))
    return local.astimezone(UTC).isoformat(timespec='milliseconds')

def tick_scan(stream,month):
    counts=collections.Counter();days={};prev=None;prevraw=None;first=None;last=None;first_raw=None;last_raw=None;samples=[];digest=hashlib.sha256();largest=0;equal_variations=0;seen={};current_day=None;previous_line=None;prevfull=None
    for n,raw in enumerate(stream,1):
        digest.update(raw);counts['rows']+=1
        try:
            ts,bid,ask,vol,day=tick_values(raw,days)
            if day[:6]!=month:raise AuditError('TICK_OUTSIDE_MONTH')
        except (AuditError,ValueError,OverflowError) as e:
            counts['invalid_format_or_time']+=1
            if len(samples)<8:samples.append({'line':n,'problem':str(e),'row_sha256':sha(raw)})
            continue
        if day!=current_day:
            if current_day is not None and day<current_day:counts['backward_dates']+=1
            current_day=day;seen={}
        normalized=raw.rstrip(b'\r\n')
        if ts in seen:
            counts['duplicate_timestamp_rows_within_day']+=1
            existing=seen[ts]
            if isinstance(existing,bytes):existing={existing};seen[ts]=existing
            if normalized in existing:counts['exact_duplicate_rows_within_day']+=1
            existing.add(normalized)
        else:seen[ts]=normalized
        if first is None:first=ts;first_raw=raw.split(b',')[0].decode()
        last=ts;last_raw=raw.split(b',')[0].decode()
        if bid<=0 or ask<=0:counts['nonpositive_quotes']+=1
        if ask<bid:
            counts['crossed_quotes']+=1
            if len(samples)<8:samples.append({'line':n,'problem':'ASK_BELOW_BID','row_sha256':sha(raw)})
        if ask==bid:counts['locked_quotes']+=1
        if vol==0:counts['zero_volume_placeholders']+=1
        else:counts['nonzero_volume_field']+=1
        if prev is not None:
            delta=ts-prev
            if delta<0:
                counts['backward_timestamps']+=1
                if len(samples)<8:samples.append({'line':n,'previous_line':previous_line,'problem':'BACKWARD_TIMESTAMP','delta_ms':delta,'previous_row_sha256':sha(prevfull),'row_sha256':sha(raw)})
            if delta==0:
                counts['same_time_adjacent_rows']+=1
                if raw.rstrip(b'\r\n')==prevraw:counts['exact_adjacent_duplicates']+=1
                else:equal_variations+=1
            if delta>60_000:counts['gaps_over_60s']+=1
            largest=max(largest,delta)
        prev=ts;prevraw=raw.rstrip(b'\r\n');previous_line=n;prevfull=raw
    for k in ['rows','invalid_format_or_time','nonpositive_quotes','crossed_quotes','locked_quotes','zero_volume_placeholders','nonzero_volume_field','backward_timestamps','same_time_adjacent_rows','exact_adjacent_duplicates','gaps_over_60s','backward_dates','duplicate_timestamp_rows_within_day','exact_duplicate_rows_within_day']:counts.setdefault(k,0)
    return {**dict(counts),'same_time_different_adjacent_quotes':equal_variations,'maximum_gap_ms':largest,'first_local_timestamp':first_raw,'last_local_timestamp':last_raw,'first_utc':tick_utc(first_raw),'last_utc':tick_utc(last_raw),'csv_sha256':digest.hexdigest(),'sample_problems':samples,'time_basis':'fixed EST (UTC-05:00), never America/New_York DST','first_time_key_ms':first,'last_time_key_ms':last,'coverage_note':'No fixed tick interval; gaps include scheduled closures. Calendar/completeness not certified. Equal-time distinct quotes preserved. Adjacent and within-day duplicate counts are separate. No backward dates => within-day check covers all timestamp duplicates. No sorting or deduplication applied.'}

def check_fx(z):
    result=[]; paths=sorted(n for n in safe_members(z) if '/data_fx/' in n and n.endswith('.zip'))
    for name in paths:
        raw=z.read(name);month=PurePosixPath(name).stem[-6:]
        with zipfile.ZipFile(io.BytesIO(raw)) as sub:
            names=safe_members(sub);csvs=[n for n in names if n.endswith('.csv')]
            if len(csvs)!=1:raise AuditError('FX_CSV_MEMBER_SET')
            with sub.open(csvs[0]) as f:r=tick_scan(f,month)
            reports=[{'member':n,'bytes':sub.getinfo(n).file_size,'sha256':sha(sub.read(n))} for n in names if n.endswith('.txt')]
        r.update(archive_member=name,zip_sha256=sha(raw),bytes=len(raw),csv_member=csvs[0],source_status_reports=reports,month=month,cohort='rejected_pilot' if '/rejected_pilots/' in name else 'main_2024_2025')
        result.append(r);print('FX scanned',month,r['rows'],'crossed',r['crossed_quotes'],flush=True,file=sys.stderr)
    previous=None
    for row in result:
        if row['cohort']!='main_2024_2025':continue
        row['boundary_from_previous_month_ms']=None if previous is None else row['first_time_key_ms']-previous['last_time_key_ms']
        row['utc_conversion_status']='documented_fixed_offset_rule_not_independently_certified'
        previous=row
    return result

def gate(product:dict,mode:str,purpose:str):
    """No order/permission API. Only eligible audit modes of a bound product."""
    if purpose!='private_offline_audit':raise AuditError('PURPOSE_NOT_AUTHORIZED')
    if product.get('availability')!='verified_bytes':raise AuditError('DATA_UNAVAILABLE')
    if product.get('quarantined'):raise AuditError('QUARANTINED_DATASET')
    if mode not in product.get('research_modes',[]):raise AuditError('RESOLUTION_OR_SEMANTICS_INCOMPATIBLE')
    return {'compatible':True,'broker_authority':False,'production_use':False,'redistribution':False}

def dataset_version_id(raw_hash, code_hash, table_hash, lineage_hash):
    for h in [raw_hash,code_hash,table_hash,lineage_hash]:
        if not re.fullmatch(r'[0-9a-f]{64}',h): raise AuditError('INVALID_VERSION_HASH')
    return sha(canonical({'raw_archive':raw_hash,'audit_code':code_hash,'exact_table':table_hash,'lineage':lineage_hash}))

def audit(archive:Path,output:Path,include_fx=True):
    if output.exists():raise AuditError('OUTPUT_EXISTS_NO_OVERWRITE')
    if archive.is_symlink() or file_sha(archive)!=EXPECTED_ARCHIVE:raise AuditError('ARCHIVE_IDENTITY')
    output.mkdir(parents=True)
    codehash=file_sha(Path(__file__));report={'archive_sha256':EXPECTED_ARCHIVE,'auditor_sha256':codehash,'original_inputs_unchanged':True,'partial_scope':'Teil6 only; no claim to all historical lab archives','native_or_broker_execution':False}
    with zipfile.ZipFile(archive) as z:
        if z.testzip() is not None:raise AuditError('OUTER_CRC')
        safe_members(z);report['outer_members']=len(z.namelist());report['crypto']=check_crypto(z,output);report['fx']=check_fx(z) if include_fx else []
    report['fx_full_scan_performed']=include_fx
    (output/'data-quality-report.json').write_bytes(canonical(report))
    version=dataset_version_id(EXPECTED_ARCHIVE,codehash,report['crypto']['derived_table']['new_exact_sha256'],report['crypto']['derived_table']['lineage_sha256'])
    (output/'dataset-version.json').write_bytes(canonical({'schema':'extremelab.dataset-version/v1','id':version,'raw_archive':EXPECTED_ARCHIVE,'audit_transform':codehash,'outputs':{p.name:file_sha(p) for p in sorted(output.iterdir()) if p.is_file()},'activation':'private_unactivated_candidate','rights_clearance':False,'source_transform_code_availability':'original historical transformation code absent in Teil6; independent audit/new transform, not original-code replay'}))
    if file_sha(archive)!=EXPECTED_ARCHIVE:raise AuditError('SOURCE_CHANGED_DURING_AUDIT')
    return report
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--archive',type=Path,required=True);ap.add_argument('--output',type=Path,required=True);ap.add_argument('--crypto-only',action='store_true');args=ap.parse_args()
    try:
        result=audit(args.archive,args.output,not args.crypto_only)
        print(json.dumps({'status':'executed','crypto_rows':result['crypto']['source_rows'],'fx_rows':sum(r['rows'] for r in result['fx']),'output':str(args.output)},indent=2))
    except Exception as e:
        print(type(e).__name__+': '+str(e),file=sys.stderr);sys.exit(1)
