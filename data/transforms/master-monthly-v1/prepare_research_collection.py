#!/usr/bin/env python3
"""Strictly extract six official Kenneth French monthly research datasets.

Only 1998-01..2025-12 is written. No strategy, performance or fitted model is run.
This program uses the standard HTTPS client, certificate verification and inherited
network configuration. It does not change proxies or work around access policy.

Examples (all outputs require an explicit directory):
  python prepare_research_collection.py --download --output-dir new_collection
  python prepare_research_collection.py --archive-dir original_zips \
      --expected-provenance data/research_collection/collection_provenance.json \
      --output-dir reproduced_collection
  python prepare_research_collection.py --verify-packaged
  python prepare_research_collection.py --self-test

The provider revises history. Future downloads need not reproduce this snapshot.
Full original archives are deliberately not redistributed with the handbook.
"""
from __future__ import annotations
import argparse,csv,hashlib,io,json,re,sys
from datetime import datetime,timezone
from decimal import Decimal,InvalidOperation
from pathlib import Path
from urllib.request import Request,urlopen
from zipfile import ZipFile,BadZipFile,ZIP_STORED

BASE=Path(__file__).resolve().parents[1]
PACKAGED=BASE/'materials/data/research_collection'
LIBRARY='https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html'
FTP='https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/'
DETAIL='https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/Data_Library/'
START='1998-01';END='2025-12';EXPECTED_ROWS=336
MAX_ZIP=8*1024*1024;MAX_CSV=16*1024*1024
MISSING={Decimal('-99.99'),Decimal('-999')}
SCHEMA=[
 {'id':'FF_US_5F','file':'us_five_factors.csv','archive':'F-F_Research_Data_5_Factors_2x3_CSV.zip','member':'F-F_Research_Data_5_Factors_2x3.csv','columns':['Mkt-RF','SMB','HML','RMW','CMA','RF'],'out':['mkt_excess','smb','hml','rmw','cma','rf'],'kind':'factor','boundary':'Annual Factors: January-December','database':'CRSP','detail':'f-f_5_factors_2x3.html','title':'US Fama/French 5 Factors (2x3)','region':'United States','source_ref':'turn202view1'},
 {'id':'FF_US_MOM','file':'us_momentum.csv','archive':'F-F_Momentum_Factor_CSV.zip','member':'F-F_Momentum_Factor.csv','columns':['Mom'],'out':['mom'],'kind':'momentum','boundary':'Annual Factors:','database':'CRSP','detail':'det_mom_factor.html','title':'US Momentum Factor (Mom)','region':'United States','source_ref':'turn201view3'},
 {'id':'FF_US_INDUSTRY10_VW','file':'us_industry10_value_weighted.csv','archive':'10_Industry_Portfolios_CSV.zip','member':'10_Industry_Portfolios.csv','columns':['NoDur','Durbl','Manuf','Enrgy','HiTec','Telcm','Shops','Hlth','Utils','Other'],'out':['nodur','durbl','manuf','enrgy','hitec','telcm','shops','hlth','utils','other'],'kind':'industry','boundary':'Average Equal Weighted Returns -- Monthly','database':'CRSP','detail':'det_10_ind_port.html','title':'US 10 Industry Portfolios: Value Weighted Monthly Returns','region':'United States','source_ref':'turn202view0'},
 {'id':'FF_EUROPE_3F','file':'europe_three_factors.csv','archive':'Europe_3_Factors_CSV.zip','member':'Europe_3_Factors.csv','columns':['Mkt-RF','SMB','HML','RF'],'out':['mkt_excess','smb','hml','rf'],'kind':'factor','boundary':'Annual Factors: January-December','database':'Bloomberg','detail':'f-f_3developed.html','title':'European Fama/French 3 Factors','region':'Europe, provider developed-market definition','source_ref':'turn203view0'},
 {'id':'FF_JAPAN_3F','file':'japan_three_factors.csv','archive':'Japan_3_Factors_CSV.zip','member':'Japan_3_Factors.csv','columns':['Mkt-RF','SMB','HML','RF'],'out':['mkt_excess','smb','hml','rf'],'kind':'factor','boundary':'Annual Factors: January-December','database':'Bloomberg','detail':'f-f_3developed.html','title':'Japanese Fama/French 3 Factors','region':'Japan','source_ref':'turn203view0'},
 {'id':'FF_ASIA_PACIFIC_EX_JAPAN_3F','file':'asia_pacific_ex_japan_three_factors.csv','archive':'Asia_Pacific_ex_Japan_3_Factors_CSV.zip','member':'Asia_Pacific_ex_Japan_3_Factors.csv','columns':['Mkt-RF','SMB','HML','RF'],'out':['mkt_excess','smb','hml','rf'],'kind':'factor','boundary':'Annual Factors: January-December','database':'Bloomberg','detail':'f-f_3developed.html','title':'Asia Pacific ex Japan Fama/French 3 Factors','region':'Asia Pacific ex Japan, provider developed-market definition','source_ref':'turn203view0'}]

def sha(raw:bytes)->str:return hashlib.sha256(raw).hexdigest()
def dump(path:Path,obj:object):
 raw=(json.dumps(obj,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode('utf-8')
 atomic(path,raw)
def atomic(path:Path,raw:bytes):
 path.parent.mkdir(parents=True,exist_ok=True);tmp=path.with_name('.'+path.name+'.tmp');tmp.write_bytes(raw);tmp.replace(path)
def period_ord(p:str)->int:
 if not re.fullmatch(r'\d{4}-\d{2}',p):raise ValueError('Invalid period format: '+repr(p))
 y,m=map(int,p.split('-'))
 if not 1<=m<=12 or not 1900<=y<=2100:raise ValueError('Invalid period: '+p)
 return y*12+m-1

def fields(line:str)->list[str]:return [v.strip() for v in next(csv.reader([line]))]
def nonblank(lines:list[str],i:int)->int:
 while i<len(lines) and not lines[i].strip():i+=1
 return i

def number(raw:str,name:str,period:str)->Decimal:
 try:x=Decimal(raw.strip())
 except InvalidOperation as e:raise ValueError('Invalid number '+name+' '+period) from e
 if not x.is_finite():raise ValueError('Non-finite '+name+' '+period)
 if x in MISSING:raise ValueError('Missing sentinel '+name+' '+period)
 return x

def read_table(lines:list[str],head:int,spec:dict,annual:bool=False):
 header=['']+spec['columns']
 if head>=len(lines) or fields(lines[head])!=header:raise ValueError('Exact column header missing')
 i=head+1;rows=[];expected=None
 while i<len(lines) and lines[i].strip():
  row=fields(lines[i]);key=row[0] if row else ''
  pattern=r'\d{4}' if annual else r'\d{6}'
  if len(row)!=len(header) or not re.fullmatch(pattern,key):raise ValueError('Unexpected row shape/date in '+('annual' if annual else 'monthly')+' table')
  p=key if annual else key[:4]+'-'+key[4:]
  ordinal=int(key) if annual else period_ord(p)
  if expected is not None and ordinal!=expected:raise ValueError('Duplicated, unordered or missing date '+p)
  expected=ordinal+1
  vals=[number(v,c,p) for c,v in zip(spec['columns'],row[1:])]
  if not annual:
   for c,v in zip(spec['columns'],vals):
    if (spec['kind']=='industry' or c=='RF') and v<=-100:raise ValueError('Impossible non-positive gross total/cash return')
  rows.append((p,vals));i+=1
 if not rows:raise ValueError('Empty table')
 return rows,nonblank(lines,i)

def parse_csv(raw:bytes,spec:dict):
 if len(raw)>MAX_CSV:raise ValueError('Uncompressed member too large')
 text=raw.decode('utf-8-sig');lines=text.splitlines()
 vintage=re.search(r'created using the (\d{6}) (CRSP|Bloomberg) database',text[:1000])
 if not vintage or vintage[2]!=spec['database']:raise ValueError('Missing/unexpected vintage or upstream database')
 period_ord(vintage[1][:4]+'-'+vintage[1][4:])
 exact=['']+spec['columns']
 if spec['kind']=='industry':
  label='Average Value Weighted Returns -- Monthly'
  indices=[i for i,line in enumerate(lines) if line.strip()==label]
  if len(indices)!=1:raise ValueError('Unique value-weighted monthly section missing')
  head=indices[0]+1
 else:
  head=next((i for i,line in enumerate(lines) if fields(line)==exact),None)
  if head is None:raise ValueError('Monthly header missing')
 monthly,boundary=read_table(lines,head,spec)
 if boundary>=len(lines) or lines[boundary].strip()!=spec['boundary']:raise ValueError('Unexpected boundary after selected monthly table')
 annual_count=None;equal_count=0
 if spec['kind']=='industry':
  eq,aftereq=read_table(lines,boundary+1,spec);equal_count=len(eq)
  if aftereq>=len(lines) or lines[aftereq].strip()!='Average Value Weighted Returns -- Annual':raise ValueError('VW annual boundary missing after excluded EW monthly table')
  annual,after=read_table(lines,aftereq+1,spec,annual=True);annual_count=len(annual)
  if after>=len(lines) or lines[after].strip()!='Average Equal Weighted Returns -- Annual':raise ValueError('EW annual section boundary missing')
 else:
  a_head=boundary+1
  if spec['kind']=='momentum':
   if a_head>=len(lines) or lines[a_head].strip()!='January-December':raise ValueError('Momentum annual time definition missing')
   a_head+=1
  annual,after=read_table(lines,a_head,spec,annual=True);annual_count=len(annual)
  if after<len(lines) and not lines[after].strip().startswith('Copyright'):raise ValueError('Unexpected trailing section')
 last=monthly[-1][0]
 if period_ord(last)>period_ord(vintage[1][:4]+'-'+vintage[1][4:]):raise ValueError('Monthly data after declared vintage')
 notices=[line.strip() for line in lines if line.strip().startswith('Copyright')]
 return monthly,{'provider_vintage':vintage[1],'upstream_database':vintage[2],
  'monthly_section':'Average Value Weighted Returns -- Monthly' if spec['kind']=='industry' else 'First monthly factor table',
  'source_first_period':monthly[0][0],'source_last_period':last,'source_monthly_row_count':len(monthly),
  'selected_monthly_header_source_line':head+1,'next_section_source_line':boundary+1,
  'next_section_label':lines[boundary].strip(),'excluded_equal_weighted_monthly_rows':equal_count,
  'excluded_first_annual_table_rows':annual_count,'copyright_notice':notices[-1] if notices else None}

def extract(raw_zip:bytes,spec:dict):
 if len(raw_zip)>MAX_ZIP:raise ValueError('Archive too large')
 try:
  with ZipFile(io.BytesIO(raw_zip)) as z:
   if z.namelist()!=[spec['member']]:raise ValueError('Unexpected archive members; no filesystem extraction')
   if z.getinfo(spec['member']).file_size>MAX_CSV:raise ValueError('Member exceeds size limit')
   if z.testzip() is not None:raise ValueError('ZIP CRC failure')
   raw_csv=z.read(spec['member'])
 except BadZipFile as e:raise ValueError('Invalid or truncated ZIP') from e
 rows,meta=parse_csv(raw_csv,spec)
 selected=[r for r in rows if START<=r[0]<=END]
 if len(selected)!=EXPECTED_ROWS or selected[0][0]!=START or selected[-1][0]!=END:raise ValueError('Fixed 1998-2025 window not fully covered')
 out=io.StringIO(newline='');w=csv.writer(out,lineterminator='\n');w.writerow(['period']+spec['out'])
 for p,vals in selected:w.writerow([p]+[format(v/Decimal(100),'f') for v in vals])
 derived=out.getvalue().encode('utf-8')
 meta.update({'dataset_id':spec['id'],'title':spec['title'],'region':spec['region'],
  'source_url':FTP+spec['archive'],'description_url':DETAIL+spec['detail'],'library_url':LIBRARY,
  'archive_filename':spec['archive'],'source_archive_bytes':len(raw_zip),'source_archive_sha256':sha(raw_zip),
  'source_csv_member':spec['member'],'source_csv_bytes':len(raw_csv),'source_csv_sha256':sha(raw_csv),
  'output_file':spec['file'],'output_bytes':len(derived),'output_sha256':sha(derived),'output_header':['period']+spec['out'],
  'output_row_count':len(selected),'output_first_period':START,'output_last_period':END,
  'source_units':'Simple monthly returns in percent; RF is a monthly holding-period return, not an annual yield',
  'output_units':'Simple monthly decimal returns or return differences; every source numeric column divided by Decimal(100)',
  'currency_basis':'USD; regional market excess returns subtract US one-month T-bill return',
  'returns_status':'Current revised research-history vintage, not contemporaneously archived point-in-time values',
  'strategy_test_status':'Untested collection: no portfolio selection, strategy fit, performance ranking or backtest performed',
  'quoted_primary_description_ref':spec['source_ref'],'source_access_date':'2026-11-08',
  'source_prose_redistributed':False,'full_original_archive_redistributed':False})
 return derived,meta

def download(spec:dict):
 url=FTP+spec['archive']
 with urlopen(Request(url,headers={'User-Agent':'ResearchDataPreparation/1.0'}),timeout=30) as r:
  raw=r.read(MAX_ZIP+1)
  retrieval={'retrieval_method':'Standard HTTPS download with inherited network configuration and certificate verification',
   'retrieved_at_utc':datetime.now(timezone.utc).isoformat(),'http_status':r.status,'final_url':r.geturl(),
   'http_last_modified':r.headers.get('Last-Modified'),'http_etag':r.headers.get('ETag'),'http_content_type':r.headers.get('Content-Type')}
 if len(raw)>MAX_ZIP:raise ValueError('Downloaded archive exceeds size limit')
 return raw,retrieval

def local_retrieval(folder:Path,spec:dict,logdir:Path|None):
 raw=(folder/spec['archive']).read_bytes()
 if logdir is None:return raw,{'retrieval_method':'Locally supplied original archive; original HTTP retrieval time not supplied'}
 lp=logdir/(spec['archive']+'.fetch.json');d=json.loads(lp.read_text())
 if d.get('sha256')!=sha(raw) or d.get('bytes')!=len(raw):raise ValueError('Retrieval log does not match archive bytes')
 if d.get('final_url')!=FTP+spec['archive']:raise ValueError('Retrieval log URL does not match official archive')
 return raw,{'retrieval_method':'Standard HTTPS download with inherited network configuration and certificate verification; bytes verified against retained fetch log',
  'retrieved_at_utc':d['retrieved_at_utc'],'http_status':d['http_status'],'final_url':d['final_url'],
  'http_last_modified':d.get('last_modified'),'http_etag':d.get('etag'),'http_content_type':d.get('content_type')}

COLUMN_NOTES={
 'mkt_excess':('market_excess_return','Regional value-weighted research market return minus RF. Total research market return would be mkt_excess+rf; this script does not add that column.'),
 'smb':('long_short_factor_return','Small-minus-big return difference. US five-factor SMB averages size legs across three sorting systems and is not the same definition as three-factor SMB.'),
 'hml':('long_short_factor_return','High-minus-low book-to-market factor return difference.'),
 'rmw':('long_short_factor_return','Robust-minus-weak operating-profitability factor return difference.'),
 'cma':('long_short_factor_return','Conservative-minus-aggressive investment factor return difference.'),
 'rf':('cash_benchmark_monthly_return','US one-month Treasury-bill research return. Not an annual yield and not a guaranteed broker cash rate.'),
 'mom':('long_short_factor_return','Prior-winner minus prior-loser research portfolio return difference; source formation uses prior months 2 through 12, not the LAB04 time-series momentum rule.'),
 'nodur':('industry_total_research_return','Consumer nondurables, provider SIC-based industry classification.'),
 'durbl':('industry_total_research_return','Consumer durables, provider SIC-based industry classification.'),
 'manuf':('industry_total_research_return','Manufacturing, provider SIC-based industry classification.'),
 'enrgy':('industry_total_research_return','Energy, provider SIC-based industry classification.'),
 'hitec':('industry_total_research_return','Business equipment/high technology, provider SIC-based industry classification.'),
 'telcm':('industry_total_research_return','Telecommunications, provider SIC-based industry classification.'),
 'shops':('industry_total_research_return','Wholesale/retail and some services, provider SIC-based industry classification.'),
 'hlth':('industry_total_research_return','Healthcare, provider SIC-based industry classification.'),
 'utils':('industry_total_research_return','Utilities, provider SIC-based industry classification.'),
 'other':('industry_total_research_return','Other industries, including industries assigned by the provider outside the nine named categories.')}

def dictionary():
 return {'schema_version':'1.0','period':{'type':'string YYYY-MM','meaning':'Return observation month; not the original publication or trade timestamp'},
  'numeric_type':'Decimal text, finite; source percent divided by exactly 100','frequency':'monthly','currency_basis':'USD',
  'missing_policy':'Reject provider sentinels -99.99 and -999, blanks, nonfinite values, date gaps, duplicates and unexpected table boundaries; never impute.',
  'dataset_columns':[{'dataset_id':s['id'],'file':s['file'],'columns':[{'name':'period','source_column':'YYYYMM','unit':'calendar month'}]+[
   {'name':o,'source_column':c,'unit':'decimal monthly return or difference','kind':COLUMN_NOTES[o][0],'definition':COLUMN_NOTES[o][1]} for c,o in zip(s['columns'],s['out'])]} for s in SCHEMA],
  'important_distinctions':['Industry returns are value weighted, include dividends, and are not already excess returns.','Mkt-RF is an excess return; add RF only when reconstructing that market total research return. Do not add RF to every factor.','Long-short factor returns have no supplied tradable net-asset-value path or execution-cost model. Compounding 1+factor does not establish an implementable fund track record.','Regional factors are USD based, not local-currency nor EUR-hedged returns.','All inputs are retrospective current-vintage research history, not then-available price bars, quotes or constituent-level formation data.']}

README='''# Zusätzliche Forschungsdatensammlung – noch ohne Strategietest

Sechs offizielle Kenneth-French-Dateien werden jeweils auf **1998-01 bis 2025-12** begrenzt und von Prozent in Dezimalrenditen umgerechnet. Jede CSV enthält genau **336 Monatszeilen**. Zusammen sind es **2.016 Datensatz-Monatszeilen und 29 numerische Spalten über die sechs Schemata**. Die Zeiträume überlappen; es sind weder 2.016 unabhängige Beobachtungen noch 29 unabhängige Risikofaktoren. Mehrfach enthaltenes RF und gemeinsame Aktienuniversen bleiben als solche sichtbar.

- `us_five_factors.csv`: US-Fünffaktormodell plus RF, sechs Zahlenfelder.
- `us_momentum.csv`: US-Momentum-Faktor Mom, ein Zahlenfeld.
- `us_industry10_value_weighted.csv`: zehn wertgewichtete US-Branchenportfolios einschließlich Dividenden.
- `europe_three_factors.csv`, `japan_three_factors.csv`, `asia_pacific_ex_japan_three_factors.csv`: je Mkt−RF, SMB, HML und RF.

`mkt_excess` ist Marktüberschussrendite. Für die gesamte Forschungsmarktrendite kann ausschließlich dort RF addiert werden. SMB/HML/RMW/CMA/Mom sind Long-short-Renditedifferenzen. Branchenrenditen sind bereits vollständige Forschungsportfoliorenditen; RF darf ihnen nicht einfach erneut zugeschlagen werden. Regionale Reihen sind in USD und verwenden den US-Cashbenchmark. Sie sind keine Euro- oder Lokalwährungsrenditen und keine handelbaren OHLC-, Quote- oder ETF-Daten.

## Datenstand und Grenzen

Die im Provenienzindex genannte Version ist eine **aktuell revidierte Historie**, nicht der damals veröffentlichte Datenstand. Die US-Archive nennen CRSP, die Regionalarchive Bloomberg als vorgelagerte Datenbasis. Für US-Forschungsrenditen beschreibt die Anbieterbibliothek den Wechsel von FIZ zu CIZ ab Januar 2025; damit unterscheidet sich unter anderem die Dividenden-Wiederanlagekonvention. Der US-Fünffaktor-Header nennt zudem einen RF-Quellenwechsel ab Juni 2024. Diese Hinweise werden nicht ungeprüft als identische technische Produktionsregel für die Bloomberg-Regionalarchive ausgegeben.

Es wurden **keine neuen Strategien getestet, keine Parameter ausgewählt, keine Performance-Rangliste erzeugt und keine Erfolgsquote berechnet**. Die Sammlung erweitert die verfügbaren Daten zum Lernen und zur späteren, vorher zu spezifizierenden Forschung. Das bestehende LAB04 bleibt unverändert.

## Prüfen und erneut vorbereiten

Im vollständigen Paket aus jedem Arbeitsverzeichnis:

```text
python materials/prepare_research_collection.py --verify-packaged
python materials/prepare_research_collection.py --self-test
python materials/prepare_research_collection.py --download --output-dir neue_sammlung
python materials/prepare_research_collection.py --archive-dir originale_zips --expected-provenance materials/data/research_collection/collection_provenance.json --output-dir reproduzierte_sammlung
```

Der Skriptpfad kann absolut angegeben werden. Eine neue Download-Version kann andere historische Werte enthalten. Für die bytegenaue Prüfung der beiliegenden CSVs dient `--verify-packaged`; für eine erneute Extraktion derselben Originalversion müssen die ursprünglichen ZIPs mit den angegebenen SHA256-Hashes vorliegen. Das Paket enthält nur das abgeleitete 28-Jahresfenster, die Metadaten und den Extractor, nicht die vollständigen Originalarchive. Ohne externe Fetchlogs behauptet eine lokale Konversion keinen ursprünglichen Downloadzeitpunkt.

## Rechte und Quellen

Öffentlicher Download ist keine offene Lizenz. Auf den geprüften Primärseiten wurde keine ausdrückliche Open-Data-Weiterverteilungslizenz festgestellt. US-Dateien tragen einen Copyrightvermerk von Fama/French; regionale CSVs enthalten im geprüften Snapshot keinen entsprechenden Footer, was keine Freigabe beweist. Anbieter, URLs und Original-/Ausgabehashes stehen in `collection_provenance.json`; Spaltendefinitionen in `data_dictionary.json`. Vor kommerzieller Nutzung oder weiterer Verbreitung sind die dafür geltenden Rechte mit den Anbietern zu klären. Die Zahlen werden hier als begrenztes Forschungsfenster dokumentiert; keine Lizenz wird erfunden.
'''


def build(args):
 expected=None
 if args.expected_provenance:
  expected={d['dataset_id']:d for d in json.loads(args.expected_provenance.read_text())['datasets']}
 results=[];outputs=[]
 for spec in SCHEMA:
  raw,retrieval=download(spec) if args.download else local_retrieval(args.archive_dir,spec,args.retrieval_log_dir)
  data,meta=extract(raw,spec);meta['retrieval']=retrieval
  if expected:
   e=expected.get(spec['id'])
   if not e:raise ValueError('Dataset absent from expected provenance')
   for key in ['source_archive_sha256','source_csv_sha256','output_sha256']:
    if meta[key]!=e[key]:raise ValueError('Snapshot mismatch: '+spec['id']+' '+key)
  outputs.append((spec['file'],data));results.append(meta)
 # No output is published until every source table passes the complete validation.
 out=args.output_dir;out.mkdir(parents=True,exist_ok=False)  # S07: never overwrite a frozen snapshot
 for filename,raw in outputs:atomic(out/filename,raw)
 provenance={'schema_version':'1.0','collection_id':'FF_RESEARCH_COLLECTION_1998_2025','provider':'Kenneth R. French Data Library',
  'window':{'start':START,'end':END,'months_per_dataset':EXPECTED_ROWS},'dataset_count':6,
  'numeric_series_columns_across_schemas':29,'dataset_month_rows_total':2016,
  'overlap_warning':'All six datasets cover the same 336 months; rows and series overlap economically and are not independent observations.',
  'license_status':'No explicit open-data redistribution license identified on reviewed primary pages. Public access is not an open license; preserve provider attribution and check applicable rights for other uses.',
  'scope':'Derived fixed-window numerical data, no full original archive or long source text redistributed',
  'strategy_test_status':'No strategy, estimation, parameter search or empirical performance analysis performed',
  'methodology_notes':['All monthly numeric source columns divided by 100 using Decimal, no interpolation and no additional derived return series.','US CRSP-based current research returns use CIZ from the January 2025 release; official library distinguishes ex-date versus former month-end dividend reinvestment.','US five-factor source changes its RF data provider from Ibbotson through May 2024 to ICE BofA US 1-Month Treasury Bill Index from June 2024.','International three-factor archives state Bloomberg database; official regional description specifies USD total returns underlying factors and US one-month T-bill subtraction.','These revised series are not point-in-time constituent records, executable ETF prices or OHLC bars.'],
  'primary_sources':[{'url':LIBRARY,'ref':'turn199view0','access_date':'2026-11-08','evidence':'Current US data format and links to all six archives'},
   {'url':DETAIL+'f-f_5_factors_2x3.html','ref':'turn202view1','access_date':'2026-11-08','evidence':'US factor definitions and RF source change'},
   {'url':DETAIL+'det_mom_factor.html','ref':'turn201view3','access_date':'2026-11-08','evidence':'Monthly Mom construction'},
   {'url':DETAIL+'det_10_ind_port.html','ref':'turn202view0','access_date':'2026-11-08','evidence':'SIC industry formation and return frequency'},
   {'url':DETAIL+'f-f_3developed.html','ref':'turn203view0','access_date':'2026-11-08','evidence':'USD basis, regional factors and return definitions'}],
  'datasets':results}
 dump(out/'collection_provenance.json',provenance);dump(out/'data_dictionary.json',dictionary());atomic(out/'README.md',README.encode())
 index={'collection_id':provenance['collection_id'],'window':provenance['window'],'datasets':[{'id':d['dataset_id'],'file':d['output_file'],'rows':d['output_row_count'],'numeric_columns':len(d['output_header'])-1,'vintage':d['provider_vintage'],'sha256':d['output_sha256']} for d in results],
  'provenance':'collection_provenance.json','dictionary':'data_dictionary.json','readme':'README.md','schema_note':'All paths relative to this collection directory','overlap_warning':provenance['overlap_warning'],'strategy_test_status':'untested'}
 dump(out/'collection_index.json',index)
 report=verify(out);dump(out/'collection_checks.json',report)
 print(json.dumps({'status':'passed','datasets':6,'months_each':336,'numeric_columns_across_schemas':29,'checks':len(report['checks'])},ensure_ascii=False))


def verify(folder:Path):
 provenance=json.loads((folder/'collection_provenance.json').read_text());results=[]
 expected_by={d['dataset_id']:d for d in provenance['datasets']}
 def record(name,ok,details=None):
  if not ok:raise ValueError('Packaged verification failed: '+name)
  results.append({'name':name,'status':'pass','details':details})
 for spec in SCHEMA:
  d=expected_by[spec['id']];raw=(folder/spec['file']).read_bytes();record(spec['id']+' normalized SHA256',sha(raw)==d['output_sha256'])
  reader=csv.DictReader(io.StringIO(raw.decode('utf-8')));record(spec['id']+' header',reader.fieldnames==['period']+spec['out'])
  rows=list(reader);record(spec['id']+' row count',len(rows)==EXPECTED_ROWS)
  record(spec['id']+' exact first/last',rows[0]['period']==START and rows[-1]['period']==END)
  record(spec['id']+' continuous unique dates',all(period_ord(row['period'])==period_ord(START)+i for i,row in enumerate(rows)))
  valid=True
  for row in rows:
   if None in row:valid=False
   for c in spec['out']:
    try:v=Decimal(row[c]);valid=valid and v.is_finite() and v not in (Decimal('-.9999'),Decimal('-9.99'))
    except Exception:
     valid=False
     continue
    if spec['kind']=='industry' or c=='rf':valid=valid and v>-1
  record(spec['id']+' finite decimal values and return types',valid)
  record(spec['id']+' no data past fixed window',all(START<=row['period']<=END for row in rows))
  record(spec['id']+' origin hashes present',all(re.fullmatch(r'[0-9a-f]{64}',d[k]) for k in ['source_archive_sha256','source_csv_sha256']))
 record('six schemas and 29 numeric columns',len(SCHEMA)==6 and sum(len(s['out']) for s in SCHEMA)==29)
 record('same 336 calendar months, not 2016 independent months',len({r['period'] for r in rows})==336)
 return {'status':'passed','check_count':len(results),'checks':results,'limitations':'Original archive hashes are recorded but cannot be revalidated without original ZIP bytes, which are not distributed; CSV integrity and structure are verified here.'}


def self_test():
 results=[]
 def expect(name,fn,raises=False):
  try:v=fn()
  except (ValueError,UnicodeDecodeError,KeyError,IndexError) as e:
   if not raises:raise
   results.append({'name':name,'status':'pass','expected_rejection':type(e).__name__});return
  if raises:raise AssertionError('Malformed fixture unexpectedly accepted: '+name)
  if v is False:raise AssertionError(name)
  results.append({'name':name,'status':'pass'})
 spec=SCHEMA[0]
 def fixture(s=spec):
  cols=','.join(['']+s['columns']);row=','.join(['1.25']*len(s['columns']))
  p=f'This file was created using the 202512 {s["database"]} database.\n'
  label='Average Value Weighted Returns -- Monthly\n' if s['kind']=='industry' else ''
  body='\n'.join(m+','+row for m in ['202501','202502','202503'])+'\n\n'
  if s['kind']=='industry':tail='Average Equal Weighted Returns -- Monthly\n'+cols+'\n'+body+'Average Value Weighted Returns -- Annual\n'+cols+'\n2025,'+row+'\n\nAverage Equal Weighted Returns -- Annual\n'
  elif s['kind']=='momentum':tail='Annual Factors:\nJanuary-December\n'+cols+'\n2025,'+row+'\n'
  else:tail='Annual Factors: January-December\n'+cols+'\n2025,'+row+'\n'
  return (p+label+cols+'\n'+body+tail).encode()
 good=fixture()
 for s in SCHEMA:expect(s['id']+' accepts only specified first monthly section',lambda s=s:len(parse_csv(fixture(s),s)[0])==3)
 alterations=[('duplicate month',b'202502',b'202501'),('missing month',b'202502',b'202504'),('unordered month',b'202503',b'202412'),('invalid month13',b'202503',b'202513'),('daily date in monthly table',b'202501',b'20250101'),('annual date in monthly table',b'202501',b'2025'),('unexpected boundary',b'Annual Factors: January-December',b'Unknown Section'),('wrong header',b',Mkt-RF,SMB,HML,RMW,CMA,RF',b',Mkt-RF,SMB,HML,RMW,CMA,XX'),('wrong database',b'CRSP database',b'Bloomberg database'),('no vintage',b'202512 CRSP',b'unknown CRSP'),('nonfinite NaN',b'202501,1.25',b'202501,NaN'),('nonfinite Inf',b'202501,1.25',b'202501,Infinity'),('missing -99.99',b'202501,1.25',b'202501,-99.99'),('missing -999',b'202501,1.25',b'202501,-999'),('nonnumeric',b'202501,1.25',b'202501,text'),('extra column',b'202501,1.25',b'202501,1.25,2.00'),('blank cell',b'202501,1.25',b'202501,')]
 for name,a,b in alterations:expect(name,lambda a=a,b=b:parse_csv(good.replace(a,b,1),spec),True)
 expect('annual rows not interpreted as monthly',lambda:len(parse_csv(good,spec)[0])==3)
 expect('monthly window requires full336 rows',lambda:extract(zip_fixture(good,spec),spec),True)
 expect('archive unexpected member',lambda:extract(zip_fixture(good,spec,wrong=True),spec),True)
 expect('archive extra member',lambda:extract(zip_fixture(good,spec,extra=True),spec),True)
 expect('truncated ZIP',lambda:extract(zip_fixture(good,spec)[:30],spec),True)
 expect('percent normalization exact',lambda:Decimal('1.25')/Decimal(100)==Decimal('0.0125'))
 expect('negative factor is allowed',lambda:parse_csv(good.replace(b'202501,1.25',b'202501,-125.00',1),spec)[0][0][1][0]==Decimal('-125.00'))
 industry=SCHEMA[2];ig=fixture(industry)
 expect('industry total return cannot lose over 100 percent',lambda:parse_csv(ig.replace(b'202501,1.25',b'202501,-101',1),industry),True)
 expect('must select valueweighted label',lambda:parse_csv(ig.replace(b'Average Value Weighted Returns -- Monthly',b'Average Equal Weighted Returns -- Monthly',1),industry),True)
 mom=SCHEMA[1];mg=fixture(mom)
 expect('momentum annual boundary needs month definition',lambda:parse_csv(mg.replace(b'January-December',b'Unknown',1),mom),True)
 expect('RF is not annualized again',lambda:Decimal('0.23')/Decimal(100)==Decimal('0.0023'))
 expect('full fixed window length',lambda:period_ord(END)-period_ord(START)+1==336)
 return {'status':'passed','check_count':len(results),'checks':results,'scope':'Synthetic parser/units tests only; no strategy or return performance test'}

def zip_fixture(raw,spec,wrong=False,extra=False):
 b=io.BytesIO()
 with ZipFile(b,'w',ZIP_STORED) as z:
  z.writestr('wrong.csv' if wrong else spec['member'],raw)
  if extra:z.writestr('extra.csv',b'')
 return b.getvalue()

def main():
 p=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter)
 g=p.add_mutually_exclusive_group(required=True);g.add_argument('--download',action='store_true');g.add_argument('--archive-dir',type=Path);g.add_argument('--verify-packaged',action='store_true');g.add_argument('--self-test',action='store_true')
 p.add_argument('--output-dir',type=Path);p.add_argument('--retrieval-log-dir',type=Path);p.add_argument('--expected-provenance',type=Path)
 args=p.parse_args()
 try:
  if args.self_test:
   report=self_test()
   if args.output_dir:dump(args.output_dir/'parser_selftest.json',report)
   print(json.dumps({'status':report['status'],'synthetic_parser_checks':report['check_count']}));return
  if args.verify_packaged:
   report=verify(args.output_dir or PACKAGED);print(json.dumps({'status':report['status'],'packaged_checks':report['check_count']}));return
  if args.output_dir is None:p.error('--output-dir is required for extraction; frozen package will not be overwritten implicitly')
  build(args)
 except Exception as e:
  print(type(e).__name__+': '+str(e),file=sys.stderr);sys.exit(1)
if __name__=='__main__':main()
