#!/usr/bin/env python3
"""Read-only source bindings and as-is map checks. Not a controller or approval.

Hashes prove byte identity; anchors help locate evidence. Neither is a proof of
all semantic prose, authenticity of a future edit, or native/cloud execution.
"""
from __future__ import annotations
import argparse,hashlib,json,stat,zipfile
from pathlib import Path,PurePosixPath
ROOT=Path(__file__).resolve().parents[1]
ARCHIVE_SHA='6530c9c46cab0c6f411fdb682f3c74d4c9140742e698aa48c835bc60ba190c6d'
PLAN_SHA='60303e48156a187d065ad66e884398a71853e955a4acc1322ab8d9dd9d97ae7d'
MAP='evidence/S01/interface-map.json'
BINDINGS='vendor-manifests/S01_INTERFACE_SOURCE_BINDINGS.json'
def sha(b):return hashlib.sha256(b).hexdigest()
def regular(root,rel):
 p=PurePosixPath(rel)
 if not rel or p.is_absolute() or '..' in p.parts or '\\' in rel:raise ValueError('UNSAFE_PATH')
 q=root
 for part in p.parts:
  q=q/part
  if q.is_symlink():raise ValueError('SYMLINK')
 if not stat.S_ISREG(q.stat().st_mode):raise ValueError('NOT_REGULAR')
 return q.read_bytes()
def audit(root=ROOT,*,map_override=None,bindings_override=None):
 errors=[]
 def need(ok,code,detail=''):
  if not ok:errors.append({'code':code,'detail':detail})
 try:
  m=json.loads(regular(root,MAP)) if map_override is None else map_override
  b=json.loads(regular(root,BINDINGS)) if bindings_override is None else bindings_override
  need(m['work_id']==b['work_id']=='S01-INTERFACE-MAP','WORK_BINDING')
  need(m['source_bindings']==BINDINGS and m['source_bindings_sha256']==sha(regular(root,BINDINGS)),'BINDING_FILE_HASH')
  ar=regular(root,b['archive']['path']);need(sha(ar)==b['archive']['sha256']==ARCHIVE_SHA,'ARCHIVE_HASH')
  need(sha(regular(root,'baseline/masterplan_1_1_0_plan.json'))==m['masterplan_sha256']==PLAN_SHA,'PLAN_HASH')
  z=zipfile.ZipFile(root/b['archive']['path']);ids=set();values={}
  for s in b['sources']:
   need(s['id'] not in ids,'DUPLICATE_SOURCE',s['id']);ids.add(s['id'])
   if s['kind']=='archive_member':
    need(s['archive']==b['archive']['path'],'ARCHIVE_PATH',s['id']);raw=z.read(s['member'])
   elif s['kind']=='package_file':raw=regular(root,s['path'])
   else:raise ValueError('UNKNOWN_SOURCE_KIND')
   values[s['id']]=raw.decode()
   need(sha(raw)==s['sha256'] and len(raw)==s['bytes'],'SOURCE_HASH',s['id'])
   lines=raw.decode().splitlines(keepends=True)
   for e in s['evidence']:
    need(1<=e['start_line']<=e['line']<=e['end_line']<=len(lines),'EVIDENCE_RANGE',s['id'])
    need(e['anchor'] in lines[e['line']-1],'EVIDENCE_ANCHOR',s['id'])
    need(sha(''.join(lines[e['start_line']-1:e['end_line']]).encode())==e['excerpt_sha256'],'EXCERPT_HASH',s['id'])
  for x in b['exact_production_matches']:
   raw=regular(root,x['production_path']);need(x['archive']==b['archive']['path'] and raw==z.read(x['member']) and sha(raw)==x['sha256'],'PRODUCTION_MATCH',x['production_path'])
  rows={}
  for row in m['interfaces']:
   need(row['id'] not in rows,'DUPLICATE_INTERFACE',row['id']);rows[row['id']]=row
   need(bool(row['source_ids']) and set(row['source_ids'])<=ids,'UNBOUND_SOURCE',row['id'])
   need(bool(row['limits']) and bool(row['semantics']),'MISSING_BOUNDARY',row['id'])
   need(row['proof_status'] not in ['approved','production_verified','complete'],'UNJUSTIFIED_PROOF_STATUS',row['id'])
  for key in ['formal_acceptance','S02_started','product_sources_changed','native_execution','cloud_execution','broker_action']:need(m[key] is False,'UNAUTHORISED_PROMOTION',key)
  need(b['native_runtime_executed'] is False and b['independent_review'] is False,'UNAUTHORISED_SOURCE_PROMOTION')
  need(m['inventory']=={'complete':38,'total':59,'missing_complete':21,'new_recovered':0},'INVENTORY_COUNT')
  for row_id,source_id in [('IF-01','server'),('IF-02','server'),('IF-03','server'),('IF-05','server')]:
   need(rows[row_id]['protocol']['route'] in values[source_id],'ROUTE_NOT_IN_ORIGINAL',row_id)
  name=rows['IF-05']['protocol']['mcp_tool']
  need("tool('"+name+"'" in values['registry'] and "name==='"+name+"'" in values['registry'],'MCP_NAME_NOT_IN_ORIGINAL')
  need(rows['IF-09']['proof_status']=='blocked_missing_original_dependency','MISSING_RELAY_AS_COMPLETE')
  need(not (root/'baseline/vercel_recovered/src/lib/relay.mjs').exists(),'MISSING_RELAY_REPLACED')
  need(rows['IF-08']['proof_status']=='source_bound_static_only','BROWSER_EXECUTION_OVERCLAIM')
  need(rows['IF-12']['proof_status']=='source_only_not_executed','NATIVE_EXECUTION_OVERCLAIM')
  for path in ['evidence/S01/path-map.json','evidence/S01/donor-map.json']:
   ref=json.loads(regular(root,path))['interface_reference_audit'];need(ref['path']==MAP and ref['sha256']==sha(regular(root,MAP)) and ref['formal_acceptance'] is False,'DOCUMENT_REFERENCE',path)
  old=json.loads(regular(root,'baseline/interface_checkpoint/ORIGINAL_MANIFEST.json'))['files'];reconstructed=0;unchanged=0
  for rel,h in old.items():
   cp='baseline/interface_checkpoint/'+rel
   if (root/cp).exists():actual=regular(root,cp)
   else:actual=regular(root,rel)
   need(sha(actual)==h,'PREDECESSOR_LOST',rel);reconstructed+=sha(actual)==h
   unchanged+=sha(regular(root,rel))==h
  result=dict(work_id=m['work_id'],consistent=not errors,source_bindings=len(ids),exact_production_matches=len(b['exact_production_matches']),interfaces=len(rows),predecessor_reconstructed=reconstructed,predecessor_unchanged_at_original_path=unchanged,errors=errors,formal_acceptance=False)
  return result
 except (OSError,ValueError,KeyError,TypeError,IndexError,zipfile.BadZipFile) as e:
  return {'consistent':False,'errors':errors+[{'code':'UNREADABLE','detail':str(e)}],'formal_acceptance':False}
if __name__=='__main__':
 a=argparse.ArgumentParser(description=__doc__);a.add_argument('--root',type=Path,default=ROOT);opt=a.parse_args();r=audit(opt.root);print(json.dumps(r,indent=2,ensure_ascii=False));raise SystemExit(0 if r['consistent'] else 2)
