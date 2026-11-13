"""Read-only, hash-bound source contract audit. C# is parsed as text, never executed."""
from __future__ import annotations
import argparse, hashlib, json, re, stat, sys, zipfile
from pathlib import Path, PurePosixPath
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
NATIVE='integrations/ctrader-th3revolution20/src/'
def sha(raw): return hashlib.sha256(raw).hexdigest()
def jload(p): return json.loads(Path(p).read_text(encoding='utf-8'))
def safe_path(root,relative):
    rel=PurePosixPath(relative)
    if rel.is_absolute() or '..' in rel.parts or '\\' in relative: raise ValueError('UNSAFE_SOURCE_PATH')
    p=Path(root)
    for part in rel.parts:
        p=p/part
        if p.is_symlink(): raise ValueError('SOURCE_SYMLINK')
    return p
def source_bytes(root,entry):
    p=safe_path(root,entry['path'])
    if not p.is_file():raise ValueError('MISSING_SOURCE:'+entry['path'])
    raw=p.read_bytes()
    if len(raw)!=entry['bytes'] or sha(raw)!=entry['sha256']:raise ValueError('SOURCE_CHANGED:'+entry['path'])
    return raw
def record_fields(text,name):
    m=re.search(r'\brecord\s+'+re.escape(name)+r'\s*\((.*?)\);',text,re.S)
    if not m:raise ValueError('RECORD_NOT_FOUND:'+name)
    return [part.strip().split()[-1].split('=')[0] for part in m.group(1).split(',')]
def exact_fields(text,language,event):
    if language=='cs':
        marker='type == "'+event+'"'
        pos=text.index(marker); fragment=text[pos:]
        m=re.search(r'Exact\(p,\s*(.*?)\);',fragment,re.S)
        return re.findall(r'"([^"]+)"',m.group(1))
    marker="e.type==='"+event+"'"
    pos=text.index(marker);fragment=text[pos:]
    m=re.search(r'exact\(p,\[(.*?)\]\);',fragment,re.S)
    return re.findall(r"'([^']+)'",m.group(1))
def runtime_scan(original):
    """Lexical source scan, not a universal proof against dynamic code generation."""
    files=[]
    imports=[]
    calls=[]
    for p in sorted(Path(original).rglob('*')):
        if not p.is_file() or p.suffix not in {'.mjs','.js'}:continue
        rel=p.relative_to(original).as_posix()
        if any(x in PurePosixPath(rel).parts for x in ['tests','evidence','node_modules','artifacts']):continue
        text=p.read_text();files.append({'path':rel,'sha256':sha(p.read_bytes())})
        for n,line in enumerate(text.splitlines(),1):
            if 'order-lifecycle.mjs' in line: imports.append({'path':rel,'line':n,'text':line.strip()})
            if rel!='core/planning/order-lifecycle.mjs' and re.search(r'\b(createOrderState|reduceOrderEvent|validateOrderState|upgradeOrderState|reconcileOrder)\s*\(',line):
                calls.append({'path':rel,'line':n,'text':line.strip()})
    return {'scope':'All preserved .mjs/.js excluding tests/evidence/node_modules/artifacts; lexical inspection, not dynamic execution trace',
            'files':files,'count':len(files),'module_mentions':imports,'external_named_calls':calls}
def audit(original,root=ROOT):
    original=Path(original);root=Path(root)
    b=jload(root/'evidence/S06/native-binding/source-bindings.json')
    for entry in b['repo_files']:source_bytes(root,entry)
    archive=safe_path(root,b['original_archive']['path'])
    if sha(archive.read_bytes())!=b['original_archive']['sha256']:raise ValueError('ORIGINAL_ARCHIVE_CHANGED')
    src={}
    with zipfile.ZipFile(archive) as z:
        names=z.namelist()
        for entry in b['original_modules']:
            raw=source_bytes(original,entry)
            matches=[n for n in names if n.endswith('/Trading_Local/'+entry['path'])]
            if len(matches)!=1 or z.read(matches[0])!=raw:raise ValueError('ARCHIVE_MEMBER_MISMATCH')
            src[entry['path']]=raw.decode('utf-8')
    proto=src[NATIVE+'Th3JournalProtocol20.cs']; ledger=src[NATIVE+'Th3NativeOrderLedger20.cs']; engine=src['core/engine-journal.mjs']
    types=['plan.recorded','order.reported','position.reported','engine.status']
    wire={}
    for kind in types:
        # Plan delegates to validateOriginalPlan in JS; avoid falsely claiming an automatic parser for it.
        if kind=='plan.recorded':
            m=re.search(r"exact\(p,\[(.*?)\]\);",engine,re.S);js=re.findall(r"'([^']+)'",m.group(1))
        else:js=exact_fields(engine,'js',kind)
        cs=exact_fields(proto,'cs',kind)
        if cs!=js:raise ValueError('NATIVE_JS_FIELD_SET_DRIFT:'+kind)
        wire[kind]={'fields':js,'matched_by_source_inspection':True,'CSharp_executed':False}
    deals=record_fields(ledger,'NativeDealFact20')
    if set(deals)&{'Price','Fee','Commission','FeeCurrency'}:raise ValueError('NATIVE_DEAL_CONTRACT_CHANGED')
    scan=runtime_scan(original)
    if scan['module_mentions'] or scan['external_named_calls']:raise ValueError('RUNTIME_ORDER_CALLERS_CHANGED_REVIEW_REQUIRED')
    schema=jload(root/'contracts/domain/v1/schema.json')
    if not {'price','commission','source_proof_id','execution_time'}<=set(schema['$defs']['Deal']['required']):raise ValueError('S02_DEAL_CONTRACT_CHANGED')
    if schema['$defs']['Deal']['additionalProperties'] is not False:raise ValueError('S02_OPEN_SCHEMA')
    matrix=jload(root/'evidence/S06/native-binding/field-matrix.json')
    ids=set()
    for row in matrix['rows']:
        if row['id'] in ids or row['source_path'] not in src:raise ValueError('MATRIX_SOURCE_INVALID')
        ids.add(row['id'])
        lines=src[row['source_path']].splitlines()
        if any(not 1<=n<=len(lines) for n in row['source_lines']):raise ValueError('MATRIX_LINE_RANGE_INVALID')
        if row['status'] not in {'explicit_adapter_required','partial_not_drop_in','missing','native_only_not_exported',
           'unavailable_not_zero','not_equivalent','unsupported','identity_link_required','different_schema',
           'precision_qualification','not_connected','read_only_comparison','not_full_backup','open_semantic_gap','merge_contract_required'}:raise ValueError('MATRIX_UNSUPPORTED_STATUS')
    state=jload(root/'governance/masterplan/control/state.json')
    return {
      'audit_scope':'Original source/contract correspondence, no C# runtime or installed writer',
      'base_revision':b['base_revision'],'original_modules_verified':len(src),'repo_sources_verified':len(b['repo_files']),
      'native_deal_fields':deals,'native_identity_fields':record_fields(ledger,'NativeOrderIdentity20'),
      'journal_account_fields':record_fields(proto,'JournalAccount20'),'journal_event_fields':record_fields(proto,'JournalEvent20'),
      'journal_receipt_fields':record_fields(proto,'JournalReceipt20'),'journal_wire_types':wire,
      'S02_deal_required_fields':schema['$defs']['Deal']['required'],
      'S02_account_required_fields':schema['$defs']['AccountRef']['required'],
      'runtime_order_reducer_scan':scan,'field_mapping_rows':len(matrix['rows']),
      'formal_status':{k:state['steps'][k]['status']for k in ['S00','S01','S02','S05','S06']},
      'CSharp_compilations':0,'native_broker_evidence':False,'product_installed':False,
      'historical_native_receipts_are_not_current_test_runs':True}
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--original',required=True,type=Path);ap.add_argument('--output',type=Path)
    a=ap.parse_args();result=audit(a.original);text=json.dumps(result,ensure_ascii=False,indent=2)+'\n'
    if a.output:
        if a.output.exists() or a.output.is_symlink():raise ValueError('OUTPUT_EXISTS')
        a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(text)
    print(text)
if __name__=='__main__':main()
