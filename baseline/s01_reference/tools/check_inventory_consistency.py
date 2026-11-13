#!/usr/bin/env python3
"""Read-only S01 inventory contract over actual archived source bytes.

This is not a plan controller or release gate. It neither writes product data nor
promotes the formal status. The external archive hash anchors this package; its
own manifest is an integrity aid, not an independent source of trust.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import stat
from pathlib import Path, PurePosixPath
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
WORK = 'S01-INVENTORY-CONSOLIDATION'
CAT = 'vendor-manifests/S01_VERIFIED_RECOVERED_PRODUCTION_SOURCES.json'
TREE = 'vendor-manifests/vercel_prod_source_tree.json'
CURRENT = 'evidence/S01/S01_CURRENT_INVENTORY.json'
PLAN_HASH = '60303e48156a187d065ad66e884398a71853e955a4acc1322ab8d9dd9d97ae7d'


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_regular(root: Path, rel: str) -> bytes:
    """Do not follow links or allow an inventory path outside the package."""
    q = PurePosixPath(rel)
    if not rel or q.is_absolute() or '..' in q.parts or '\\' in rel:
        raise ValueError('UNSAFE_PATH:' + rel)
    p = root
    for part in q.parts:
        p = p / part
        if stat.S_ISLNK(p.lstat().st_mode):
            raise ValueError('SYMLINK:' + rel)
    if not stat.S_ISREG(p.lstat().st_mode):
        raise ValueError('NOT_REGULAR:' + rel)
    return p.read_bytes()


def legacy_disagreements(root: Path) -> list[dict[str, Any]]:
    """Check the real operative fields; works on the original, unmodified package."""
    load = lambda rel: json.loads(read_regular(root, rel))
    cat = load(CAT)
    recovered = sum(x['status'] == 'byte_recovered' for x in cat['sources'])
    total = len(cat['sources']); missing = total - recovered
    errors: list[dict[str, Any]] = []
    def issue(code: str, field: str, observed: Any, expected: Any) -> None:
        errors.append(dict(code=code, field=field, observed=observed, expected=expected))
    lock = load('evidence/S01/baseline-lock.json')
    repro = load('evidence/S01/reproduction-report.json')['website_full_build']
    for key, expected in [('source_files_recovered_current', recovered), ('source_files_unavailable_current', missing)]:
        if repro.get(key) != expected: issue('CURRENT_COUNT_MISMATCH', 'website_full_build.'+key, repro.get(key), expected)
    for match in re.findall(r'(\d+)/59', repro['reason']):
        if int(match) != recovered: issue('CURRENT_REASON_STALE','website_full_build.reason',repro['reason'],recovered)
    for text in lock['remaining_gaps']:
        m = re.search(r'(\d+) byte-identical, (\d+) unmaterialized', text)
        if m and tuple(map(int,m.groups())) != (recovered,missing): issue('CURRENT_GAP_STALE','remaining_gaps',text,[recovered,missing])
    pm = load('evidence/S01/path-map.json')
    for text in pm['unresolved']:
        m = re.search(r'(\d+) of 59',text)
        if m and int(m[1]) != missing: issue('CURRENT_PATH_GAP_STALE','unresolved',text,missing)
    dm = load('evidence/S01/donor-map.json')
    web = next(x for x in dm['entries'] if x['component']=='Production website (Vercel source input tree)')
    m = re.search(r'(\d+) source inputs missing',web['boundary'])
    if m and int(m[1]) != missing: issue('CURRENT_DONOR_GAP_STALE','boundary',web['boundary'],missing)
    for count in re.findall(r'(\d+)/59',web.get('current_proof','')):
        if int(count) != recovered: issue('CURRENT_DONOR_PROOF_STALE','current_proof',web['current_proof'],recovered)
    text = read_regular(root,'evidence/S01/version-crosswalk.md').decode()
    first = re.search(r'(\d+) von 59 Eingabedateien',text)
    if first and int(first[1]) != recovered: issue('CURRENT_CROSSWALK_STALE','opening current table',first[0],recovered)
    return errors


def audit(root: Path = ROOT) -> dict[str, Any]:
    root = root.resolve()
    errors: list[dict[str, Any]] = []
    def fail(code: str, detail: Any) -> None: errors.append({'code':code,'detail':detail})
    def require(ok: bool, code: str, detail: Any) -> None:
        if not ok: fail(code,detail)
    def load(rel: str) -> Any: return json.loads(read_regular(root,rel))
    try:
        errors.extend(legacy_disagreements(root))
        cat,tree,cur=load(CAT),load(TREE),load(CURRENT)
        original_manifest=load('baseline/inventory_checkpoint/ORIGINAL_MANIFEST.json')['files']
        require(digest(read_regular(root,TREE))==original_manifest[TREE],'PROVIDER_TREE_CHANGED',TREE)
        require(digest(read_regular(root,'baseline/masterplan_1_1_0_plan.json'))==PLAN_HASH,'PLAN_CHANGED','masterplan')
        rows=cat['sources'];paths=[x['path'] for x in rows];trows=tree['files'];tpaths=[x['path'] for x in trows]
        require(len(paths)==59 and len(set(paths))==59 and set(paths)==set(tpaths),'SOURCE_UNIVERSE_MISMATCH',paths)
        ids={x['path']:x['vercel_source_uid'] for x in trows}
        require(cat['original_deployment']==tree['deployment_id']==cur['production_deployment'],'DEPLOYMENT_BINDING_MISMATCH','catalog/tree/current')
        require(cur['work_id']==WORK and cat['inventory_work_id']==WORK,'WORK_ID_MISMATCH','current epoch')
        require(cur['catalog_path']==CAT and cur['catalog_sha256']==digest(read_regular(root,CAT)),'CATALOG_BINDING_MISMATCH',CAT)
        require(cur['provider_tree_path']==TREE and cur['provider_tree_sha256']==digest(read_regular(root,TREE)),'TREE_BINDING_MISMATCH',TREE)
        prefix_paths={x['path'] for x in trows if x['retrieval_status']=='content_response_truncated_prefix_only'}
        access=load('evidence/S01/S01_INVENTORY_SOURCE_ACCESS.json')
        observation=access['source_read']
        require(observation['truncated'] is True and observation['full_hash_verified'] is False and observation['full_bytes_preserved'] is False,'PREFIX_OVERCLAIM',observation)
        require(observation['file_id']==ids.get(observation['source_path']),'PREFIX_SOURCE_MISMATCH',observation['source_path'])
        prefix_paths.add(observation['source_path'])
        full=[];missing=[];prefix=[];metadata=[]
        for row in rows:
            p=row['path'];rel='baseline/vercel_recovered/'+p
            require(row['source_uid_sha1']==ids.get(p),'SOURCE_ID_CHANGED',p)
            require(row.get('source_integrated') is False,'SOURCE_INTEGRATION_CLAIM',p)
            if row['status']=='byte_recovered':
                full.append(p)
                try: raw=read_regular(root,rel)
                except (ValueError,OSError) as exc: fail('SOURCE_READ_ERROR',str(exc));continue
                require(hashlib.sha1(raw).hexdigest()==ids[p],'SOURCE_UID_MISMATCH',p)
                require(digest(raw)==row.get('sha256') and len(raw)==row.get('bytes'),'SOURCE_LOCAL_HASH_MISMATCH',p)
                require(row.get('bytes_present') is True and row.get('source_classification')=='complete','SOURCE_CLASSIFICATION_MISMATCH',p)
                require(row.get('classification') in (None,'verified_source_not_integration_approved'),'SOURCE_CAPABILITY_CONFLATED',p)
            else:
                missing.append(p)
                require(row['status']=='not_recovered' and row['bytes_present'] is False,'MISSING_SOURCE_OVERCLAIM',p)
                require(not (root/rel).exists() and not (root/rel).is_symlink(),'MISSING_SOURCE_HAS_PLACEHOLDER',p)
                if p in prefix_paths:
                    prefix.append(p);expected='prefix_only'
                else:metadata.append(p);expected='missing_bytes_metadata_only'
                require(row.get('source_classification')==expected,'PREFIX_OR_METADATA_MISCLASSIFIED',p)
        disk=[]
        for p in (root/'baseline/vercel_recovered').rglob('*'):
            if p.is_symlink(): fail('SOURCE_SYMLINK',str(p.relative_to(root)))
            elif p.is_file():disk.append(p.relative_to(root/'baseline/vercel_recovered').as_posix())
        require(set(disk)==set(full),'ORIGINAL_FILE_SET_MISMATCH',disk)
        counts={'source_total':len(rows),'complete_original_inputs':len(full),'prefix_only_inputs':len(prefix),'metadata_only_inputs':len(metadata),'unavailable_full_inputs':len(missing)}
        for k,v in counts.items():require(cur.get(k)==v,'CURRENT_INDEX_COUNT_MISMATCH',k)
        require(cat['source_total']==len(rows) and cat['source_recovered']==len(full) and cat['source_blocked']==len(missing),'CATALOG_COUNT_MISMATCH','totals')
        require(sorted(cur['missing_paths'])==sorted(missing),'CURRENT_MISSING_PATHS_MISMATCH','current inventory')
        require(cur['newly_recovered_inputs']==0,'UNSUPPORTED_NEW_SOURCE_CLAIM','No new original inputs in this consolidation')
        require(cat['fully_recovered_website'] is False and cat['deploy_authorized'] is False and cat['plan_finish_authorized'] is False,'CATALOG_RELEASE_CLAIM','catalog flags')
        ref={'path':CURRENT,'sha256':digest(read_regular(root,CURRENT))}
        for name in ['baseline-lock.json','donor-map.json','path-map.json','reproduction-report.json','S01_CAPABILITY_MATRIX.json']:
            require(load('evidence/S01/'+name).get('current_inventory')==ref,'CROSS_DOCUMENT_BINDING_MISMATCH',name)
        lock=load('evidence/S01/baseline-lock.json');pm=load('evidence/S01/path-map.json');rep=load('evidence/S01/reproduction-report.json');cap=load('evidence/S01/S01_CAPABILITY_MATRIX.json')
        require(lock['work_id']==pm['current_work_id']==WORK,'STALE_CURRENT_WORK_ID','five-file handoff')
        require(pm['current_recovered_source_count']==len(full) and sorted(pm['current_missing_source_paths'])==sorted(missing),'PATH_MAP_COUNT_MISMATCH','current paths')
        mapped={x['path']:x for x in pm['paths']}
        require(len(mapped)==len(pm['paths']),'DUPLICATE_PATH_MAP','paths')
        for row in rows:
            m=mapped.get(row['path'],{})
            if row['status']=='byte_recovered':require(m.get('source_sha256')==row['sha256'] and m.get('status')=='source_bytes_verified_private_no_integration','RECOVERED_PATH_MAP_MISMATCH',row['path'])
        for x in pm['generated_intermediate_outputs']:
            require(x['final_deployment_identity_verified'] is False,'INTERMEDIATE_AS_FINAL',x['path'])
            require(digest(read_regular(root,x['stored_at']))==x['sha256'],'INTERMEDIATE_HASH_MISMATCH',x['path'])
        capability={x['id']:x for x in cap['capabilities']}
        ci=capability['complete_input_inventory']
        require((ci['available_original_inputs'],ci['missing_original_inputs'],ci['total'])==(len(full),len(missing),len(rows)) and sorted(ci['missing_paths'])==sorted(missing),'CAPABILITY_COUNT_MISMATCH','capabilities')
        for name in ['complete_website_build','final_reader_after_skin','engine19_original_build']:
            require(capability[name]['status']=='blocked_capability','BLOCKED_CAPABILITY_PROMOTED',name)
        require(rep['website_full_build']['status']=='blocked_capability' and rep['website_full_build']['build_executed'] is False,'FULL_BUILD_OVERCLAIM','reproduction report')
        require(rep['native_binary_build']['binary_built'] is False,'NATIVE_BUILD_OVERCLAIM','reproduction report')
        require('full_runtime' in rep['historical_execution_fields'] and 'historical' in rep['evidence_epoch_note'].lower(),'HISTORICAL_TESTS_RELABELLED','reproduction report')
        require(rep['current_reproduction_scope']['work_id']==WORK,'EXECUTION_SCOPE_MISMATCH','reproduction report')
        for flag in ['formal_acceptance','independent_review_completed','product_integration_authorized','runtime_capability_released','complete_website_build','native_binary_build']:
            require(cur.get(flag) is False,'GATE_OR_CAPABILITY_OVERCLAIM',flag)
        gate=load(cur['formal_gate_path'])
        require(digest(read_regular(root,cur['formal_gate_path']))==original_manifest[cur['formal_gate_path']]==cur['formal_gate_sha256'],'GATE_CHECKPOINT_CHANGED','Historical counts remain untouched')
        require(gate['finish_authorized'] is False and gate['s01_official_status']=='pending','FORMAL_FINISH_OVERCLAIM','gate')
        require(all(lock[x] is False for x in ['official_S00_accepted','official_S01_started','release_authorized','github_write_authorized','broker_actions_authorized']),'AUTHORIZATION_CHANGED','baseline lock')
        for s in cur['source_archive_availability']:
            declared=next(x for x in lock['sources'] if x['id']==s['id'])
            require(declared['current_archive_paths']==s['current_archive_paths'],'ARCHIVE_LOCATION_MISMATCH',s['id'])
            if s['current_archive_paths']:
                require(s['availability']=='complete_archive_bundled','ARCHIVE_CLASSIFICATION_MISMATCH',s['id'])
                for rel in s['current_archive_paths']:require(digest(read_regular(root,rel))==s['sha256']==declared['sha256'],'ARCHIVE_HASH_MISMATCH',s['id'])
            else:require(s['availability']=='historical_source_record_only_not_bundled','ABSENT_ARCHIVE_AS_COMPLETE',s['id'])
        # Reconstruction ties changed documents to the preserved predecessor; all
        # unchanged original and proposal bytes are validated, not just counted.
        reconstructed=0
        for rel,sha in original_manifest.items():
            cp='baseline/inventory_checkpoint/'+rel
            candidate=cp if (root/cp).exists() else rel
            if digest(read_regular(root,candidate))==sha:reconstructed+=1
            else:fail('PREDECESSOR_BYTES_LOST',rel)
        require(access['production_alias']['alias']==cur['production_domain'].split('/')[2] and access['production_alias']['deployment_id']==cur['production_deployment'],'ALIAS_BINDING_MISMATCH','production domain')
        require(cur['development_scope']['repository_sources_installed'] is False and cur['development_scope']['production_to_development_repository_binding_verified'] is False,'DEVELOPMENT_BRANCH_OVERCLAIM','private local directory, not installed branch')
        result={'work_id':WORK,'counts':counts,'reconstructed_predecessor_files':reconstructed,'production_originals_unchanged':len(full),'formal_acceptance':False,'product_integration':False,'independent_review':False,'errors':errors,'consistent':not errors}
        return result
    except (OSError,ValueError,KeyError,TypeError,StopIteration) as exc:
        fail('INVENTORY_UNREADABLE',str(exc))
        return {'work_id':WORK,'consistent':False,'errors':errors,'formal_acceptance':False}


def main() -> int:
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--root',type=Path,default=ROOT);ap.add_argument('--legacy',action='store_true',help='Only audit legacy operative fields; never grants acceptance')
    args=ap.parse_args()
    if args.legacy:
        issues=legacy_disagreements(args.root);result={'consistent':not issues,'errors':issues,'formal_acceptance':False}
    else:result=audit(args.root)
    print(json.dumps(result,ensure_ascii=False,indent=2))
    return 0 if result['consistent'] else 2

if __name__=='__main__':raise SystemExit(main())
