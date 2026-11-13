"""Build/check the S02 path decision and a NON-ACTIVE plan amendment.

No activation, checkout, extraction, download, controller replacement or broker access.
The active plan remains 1.2.0 while native C01 evidence is missing.
"""
from pathlib import Path, PurePosixPath
from functools import lru_cache
import argparse, copy, hashlib, json, re, zipfile

ROOT = Path(__file__).resolve().parents[2]
BASE_HASH = 'bdf130088d8a8fe57b69c88f39b7234460bda3dc363d2e3d8a8ff3a2521466c5'
BASE_REVISION = '87ba4e86b791db28ca95d0e51342d979c4a1cc91'
ARCHIVE = 'baseline/s01_reference/baseline/original_platform097.zip'
ARCHIVE_HASH = '6530c9c46cab0c6f411fdb682f3c74d4c9140742e698aa48c835bc60ba190c6d'
PREFIX = 'Th3R3v0lut10n_Technik_1_0_Arbeitsstand_0_9_7/Trading_Local/'
TARGET = 'product/Trading_Local/'
OUT = 'evidence/S02/path-decision'

# These replace proposed namespaces where a real module already exists.
# A star expands ONLY over named archive members. It does not grant a new recursive write scope.
REUSE = {
 ('S04','adapters/ctrader/observer/**'): ['integrations/ctrader-observer20/observer/src/*', 'integrations/ctrader-observer20/observer/tests/*'],
 ('S04','apps/hub/ingest/**'): ['core/observation.mjs','core/reconciliation-read20.mjs','core/reconciliation20.mjs'],
 ('S06','apps/hub/journal/**'): ['core/engine-journal.mjs','core/journal-archive-format.mjs','core/journal-archive-worker.mjs','core/journal-archives.mjs','core/journal-build-lineage.mjs','integrations/ctrader-th3revolution20/src/Th3JournalOutbox20.cs','integrations/ctrader-th3revolution20/src/Th3JournalProtocol20.cs','integrations/ctrader-th3revolution20/src/Th3JournalDispatch20.cs'],
 ('S06','apps/hub/storage/**'): ['core/store.mjs','core/profile-lock.mjs','core/maintenance-journal.mjs','core/restore.mjs'],
 ('S08','adapters/ctrader/host/**'): ['sdk/HubBridge.cs','sdk/HubProtocol.cs','sdk/HubContracts.cs','sdk/CallbackRuntimeDispatcher.cs','core/observer-process.mjs','core/target-runtime-reports.mjs'],
 ('S08','apps/hub/supervisor/**'): ['core/application.mjs','core/capabilities.mjs','core/system-check.mjs','core/target-admissions.mjs','core/target-admission-context.mjs','core/target-admission-worker.mjs'],
 ('S12','adapters/ctrader/protection/**'): ['integrations/ctrader-th3revolution20/src/ExtremeLabExitAdapter19.cs','integrations/ctrader-th3revolution20/src/Th3FrozenExitAdapter20.cs','integrations/ctrader-th3revolution20/src/Th3FrozenExitRecovery20.cs','integrations/ctrader-th3revolution20/src/Th3SessionAdapter20.cs','integrations/ctrader-th3revolution20/src/Th3SessionRules20.cs'],
 ('S21','apps/hub/remote-view/**'): ['core/remote-view20.mjs'],
 ('S21','adapters/remote-projection/**'): ['integrations/vercel-view20/lib/http.mjs','integrations/vercel-view20/lib/projection.mjs','integrations/vercel-view20/lib/service.mjs','integrations/vercel-view20/api/revolution.js'],
 ('S22','apps/hub/mcp/**'): ['core/mcp.mjs','core/registry.mjs'],
 ('S23','apps/hub/control/**'): ['core/control.mjs','core/schema.mjs'],
 ('S23','adapters/ctrader/commands/**'): ['sdk/HubBridge.cs','sdk/HubProtocol.cs','sdk/HubContracts.cs','sdk/CallbackRuntimeDispatcher.cs'],
 ('S25','apps/hub/migrations/**'): ['core/store.mjs','core/maintenance.mjs','core/maintenance-journal.mjs','core/restore.mjs','core/package-integrity.mjs','core/profile-lock.mjs'],
}

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')

def read(root, path):
    p = root / path
    if p.is_symlink() or any(x.is_symlink() for x in p.parents if x != root.parent):
        raise ValueError('SYMLINK_SOURCE:' + path)
    return p.read_bytes()

def safe_path(value, glob=False):
    if not isinstance(value, str) or not value or '\\' in value or ':' in value or value.startswith('/'):
        raise ValueError('UNSAFE_PATH')
    parts = value.split('/')
    if any(p in ('', '.', '..') for p in parts) or any(ord(c) < 32 for c in value):
        raise ValueError('UNSAFE_PATH')
    if glob:
        if any(c in value[:-3] for c in '*?[') or not value.endswith('/**'):
            raise ValueError('UNSUPPORTED_GLOB')
    elif any(c in value for c in '*?['):
        raise ValueError('UNSAFE_EXACT_PATH')
    if parts[0] == 'baseline' or any(p in ('secrets', 'production-data', '.git') for p in parts) or any(p == '.env' or p.startswith('.env.') or 'credentials' in p.lower() for p in parts):
        raise ValueError('PROTECTED_TARGET')
    return value

def overlaps(a, b):
    def covers(g, p):
        return (p == g[:-3] or p.startswith(g[:-2])) if g.endswith('/**') else g == p
    return covers(a,b[:-2]+'__probe__' if b.endswith('/**') else b) or covers(b,a[:-2]+'__probe__' if a.endswith('/**') else a)

def make(root=ROOT):
    root = Path(root).resolve()
    raw = read(root, 'governance/masterplan/plan.json')
    if sha(raw) != BASE_HASH:
        raise ValueError('BASE_PLAN_CHANGED')
    plan = json.loads(raw)
    draft = json.loads(read(root,'evidence/S02/scope-resolution-draft.json'))
    if draft['active'] or draft['plan_sha256'] != BASE_HASH:
        raise ValueError('DRAFT_BINDING_CHANGED')
    archive_raw = read(root, ARCHIVE)
    if sha(archive_raw) != ARCHIVE_HASH:
        raise ValueError('ARCHIVE_CHANGED')
    old_steps = {s['id']:s for s in plan['steps']}
    expected_ids = set(old_steps)-{'S00','S01','S02'}
    if {x['step_id'] for x in draft['steps']} != expected_ids:
        raise ValueError('INCOMPLETE_SCOPE_DRAFT')
    bindings = json.loads(read(root,'evidence/S02/source-bindings.json'))
    known_ids = set(bindings['reference_manifest']['source_ids']) | {s['id'] for s in bindings['additional_sources']}
    if any(not set(d['source_ids']) <= known_ids for d in draft['steps']):
        raise ValueError('UNKNOWN_DONOR_ID')
    selected = {}
    rows = []
    with zipfile.ZipFile(root/ARCHIVE) as z:
        if z.testzip() is not None:
            raise ValueError('ARCHIVE_CRC')
        available = {n[len(PREFIX):]:n for n in z.namelist() if n.startswith(PREFIX) and not n.endswith('/')}
        for d in draft['steps']:
            sid = d['step_id']; step=old_steps[sid]
            if d['proposed_target_paths'] != step['allowed_paths']:
                raise ValueError('DRAFT_PATHS_CHANGED')
            relations=[]; resolved=[]
            for logical in step['allowed_paths']:
                patterns=REUSE.get((sid,logical))
                if patterns:
                    names=[]
                    for pat in patterns:
                        if '*' in pat:
                            # Filename-level wildcard only: no arbitrary recursive source selection.
                            prefix=pat[:-1]
                            hits=[k for k in sorted(available) if k.startswith(prefix) and '/'not in k[len(prefix):]]
                        else:
                            hits=[pat] if pat in available else []
                        if not hits:
                            raise ValueError('SOURCE_NOT_PRESENT:'+pat)
                        names.extend(hits)
                    targets=[]
                    for name in sorted(set(names)):
                        target=safe_path(TARGET+name)
                        member=available[name]; b=z.read(member)
                        info=z.getinfo(member)
                        if ((info.external_attr>>16)&0o170000)==0o120000:
                            raise ValueError('SOURCE_SYMLINK')
                        row={'target':target,'source_archive':ARCHIVE,'archive_sha256':ARCHIVE_HASH,'member':member,'bytes':len(b),'sha256':sha(b),'status':'archived_original_not_materialized','private_patch_selection':'reconcile_bound_S01_proposals_before_first_write; do_not_overwrite_a_newer_worktree'}
                        if target in selected and selected[target]!=row:
                            raise ValueError('CONFLICTING_SOURCE_BYTES')
                        selected[target]=row; targets.append(target)
                        if target not in resolved:resolved.append(target)
                    relations.append({'logical':logical,'classification':'reuse_exact_archive_members','targets':targets,'do_not_create_parallel_module_under':logical})
                else:
                    safe_path(logical,glob=True)
                    # Existing logical scope is an explicit new module/test/doc directory, not recovered source.
                    rel={'logical':logical,'classification':'evidence_namespace' if logical.startswith('evidence/') else 'declared_new_namespace_not_existing_product','targets':[logical], 'read_only_donor_ids':d['source_ids']}
                    if logical.startswith('apps/web/'):
                        rel['missing_final_website_inputs']='21 full inputs unavailable; namespace resolution does not establish final production code or permit placeholder replacement'
                    relations.append(rel);resolved.append(logical)
            for p in resolved:safe_path(p,glob=p.endswith('/**'))
            if sid=='S03' and any(not p.startswith(('docs/','evidence/')) for p in resolved):
                raise ValueError('S03_NOT_DOCUMENTATION_ONLY')
            if sid=='S21' and any(p.endswith(('.css','.scss','.html')) or any('/'+t+'/' in p for t in ('styles','theme','design-system','motion','pages','shell')) for p in resolved):
                raise ValueError('S21_DESIGN_SCOPE')
            rows.append({'step_id':sid,'source_reference_ids':d['source_ids'],'old_paths':step['allowed_paths'],'resolved_paths':resolved,'relations':relations,'source_exclusions':step['exclusions'],'prerequisites_preserved':step['dependencies'],'scope_status_after_activation':'resolved'})
    # Read-only originals are not implicitly assigned for editing just because they are references.
    ids={r['step_id']:r for r in rows}
    @lru_cache(None)
    def ancestors(sid):
        return set(old_steps[sid]['dependencies']) | set().union(*(ancestors(d) for d in old_steps[sid]['dependencies']))
    collisions=[]
    for i,a in enumerate(rows):
        for b in rows[i+1:]:
            found=sorted({(x,y) for x in a['resolved_paths'] for y in b['resolved_paths'] if overlaps(x,y)})
            if not found:continue
            ordered=a['step_id'] in ancestors(b['step_id']) or b['step_id'] in ancestors(a['step_id'])
            collisions.append({'left':a['step_id'],'right':b['step_id'],'paths':[list(p) for p in found],'dependency_ordered':ordered})
            if not ordered:raise ValueError('INDEPENDENT_WRITE_OVERLAP:'+a['step_id']+':'+b['step_id'])
    # The later ACK candidate is already preserved. Mapping the original source must
    # not silently replace that newer proposal during a future materialization.
    overlay_meta_path='baseline/s01_reference/evidence/S01/negative-ack-audit/source-bindings.json'
    overlay_meta_raw=read(root,overlay_meta_path);overlay_meta=json.loads(overlay_meta_raw)
    overlay_path='baseline/s01_reference/evidence/S01/negative-ack-audit/candidate/core/control.mjs'
    if sha(read(root,overlay_path))!=overlay_meta['candidate_sha256']:
        raise ValueError('PENDING_OVERLAY_CHANGED')
    overlays=[{'target':TARGET+'core/control.mjs','candidate_path':overlay_path,
               'candidate_sha256':overlay_meta['candidate_sha256'],
               'source_binding_path':overlay_meta_path,'source_binding_sha256':sha(overlay_meta_raw),
               'status':'preserved_private_proposal_not_activated',
               'action':'explicit three-way original/predecessor/candidate selection required before S23; never overwrite automatically'}]
    resolution={'schema':'extremelab-exact-path-decision/1','status':'prepared_not_activated','base_revision':BASE_REVISION,'base_plan_sha256':BASE_HASH,'candidate_version':'1.2.1','archive':{'path':ARCHIVE,'sha256':ARCHIVE_HASH},'workflow':'new controller not introduced; active plan and lock untouched','target_model':'preserve Trading_Local relative layout under product/Trading_Local; original archive stays immutable; no extraction by this tool','native_gate':'S02-C01 still requires real compilation and execution; no status promotion from this path decision','global_rules_sha256':sha(encoded(plan['global_rules'])),'pending_overlays':overlays,'scope_overlap_pairs':collisions,'sources':sorted(selected.values(),key=lambda x:x['target']),'steps':rows}
    candidate=copy.deepcopy(plan);candidate['version']='1.2.1'
    for s in candidate['steps']:
        if s['id'] not in ids:continue
        s['allowed_paths']=ids[s['id']]['resolved_paths']
        s['scope_status']='resolved'
        s['path_resolution_note']='S02 exact path decision: '+OUT+'/resolution.json (sha256 '+sha(encoded(resolution))+'). Archive members preserve original tree; new namespaces are explicitly unimplemented. No materialization, rights grant, gate removal or product integration.'
    amendment={'schema_version':1,'plan_id':plan['plan_id'],'previous_plan_sha256':BASE_HASH,'new_plan_sha256':sha(encoded(candidate)),'previous_version':plan['version'],'new_version':candidate['version'],'author':'ChatGPT-local','reason':'S02 path resolution prescribed by active plan, no new external authority or reviewer. Prepared only; native C01 is still missing.','affected_steps':sorted(expected_ids),'status':'PREPARED_NOT_ACTIVATED','resolution_sha256':sha(encoded(resolution)),'global_rules_unchanged':True,'source_selection_is_not_product_activation':True,'activation_preconditions':['actual native S02-C01 compiler and roundtrip evidence','C01-C04 evidence bound to exact current source revision','all running cards completed or blocked before original relock','refresh current S02 bindings after scope-only amendment; keep historical S00/S01 evidence'],'rollback':'Discard this proposal or restore the saved private starting bundle; no current sources are overwritten.'}
    changes={'schema':'extremelab-scope-delta/1','base_plan_sha256':BASE_HASH,
             'version':candidate['version'],
             'steps':[{k:s[k] for k in ('id','allowed_paths','scope_status','path_resolution_note')}
                      for s in candidate['steps'] if s['id'] in ids]}
    return {'resolution.json':resolution,'plan-changes.json':changes,'AM-003.proposed.json':amendment}

def candidate_plan(root=ROOT, documents=None):
    # Full plan is derived in memory, never duplicated into the protected Git tree.
    docs=documents if documents is not None else make(root)
    delta=docs['plan-changes.json']
    if delta['base_plan_sha256'] != BASE_HASH:raise ValueError('BASE_PLAN_CHANGED')
    raw=read(Path(root),'governance/masterplan/plan.json')
    if sha(raw)!=BASE_HASH:raise ValueError('BASE_PLAN_CHANGED')
    value=json.loads(raw);value['version']=delta['version']
    changes={r['id']:r for r in delta['steps']}
    if len(changes)!=33 or len(delta['steps'])!=33:raise ValueError('INCOMPLETE_DELTA')
    for s in value['steps']:
        if s['id'] not in changes:continue
        row=changes[s['id']]
        if set(row)!={'id','allowed_paths','scope_status','path_resolution_note'}:raise ValueError('UNSUPPORTED_PLAN_CHANGE')
        for k in ('allowed_paths','scope_status','path_resolution_note'):s[k]=row[k]
    if sha(encoded(value))!=docs['AM-003.proposed.json']['new_plan_sha256']:
        raise ValueError('CANDIDATE_PLAN_HASH_CHANGED')
    return value

def export_candidate(destination,root=ROOT):
    root=Path(root).resolve();dest=Path(destination).absolute()
    # Reject lexical and resolved destinations in the worktree and existing links.
    if dest.is_relative_to(root) or dest.resolve().is_relative_to(root):raise ValueError('EXPORT_MUST_BE_EXTERNAL')
    if any(p.is_symlink() for p in (dest,*dest.parents)):raise ValueError('EXPORT_SYMLINK')
    if dest.exists():raise ValueError('OUTPUT_EXISTS_NO_OVERWRITE')
    docs=make(root);validate_documents(root)
    dest.mkdir(parents=True)
    (dest/'plan-1.2.1.proposed.json').write_bytes(encoded(candidate_plan(root,docs)))
    (dest/'AM-003.proposed.json').write_bytes(encoded(docs['AM-003.proposed.json']))
    return {'status':'exported_not_activated','directory':str(dest),
            'plan_sha256':docs['AM-003.proposed.json']['new_plan_sha256']}


def validate_documents(root=ROOT, documents=None):
    expected=make(root)
    docs=documents if documents is not None else {n:json.loads(read(Path(root),OUT+'/'+n)) for n in expected}
    if set(docs)!=set(expected):raise ValueError('DOCUMENT_SET_CHANGED')
    for name in expected:
        if docs[name]!=expected[name]:raise ValueError('DECISION_CHANGED:'+name)
    res=expected['resolution.json']
    return {'status':'prepared_not_activated','steps':len(res['steps']),'exact_source_files':len(res['sources']),'dependent_overlap_pairs':len(res['scope_overlap_pairs']),'independent_overlap_pairs':0,'active_plan_unchanged':True,'native_gate_passed':False,'new_broker_or_public_authority':False}

def write(root=ROOT):
    docs=make(root);target=Path(root)/OUT
    if target.exists():raise ValueError('OUTPUT_EXISTS_NO_OVERWRITE')
    target.mkdir(parents=True)
    for n,d in docs.items():(target/n).write_bytes(encoded(d))
    return validate_documents(root)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('command',choices=['build','check','export']);p.add_argument('--destination');a=p.parse_args()
    if a.command=='export' and not a.destination:p.error('--destination required')
    result=write() if a.command=='build' else export_candidate(a.destination) if a.command=='export' else validate_documents()
    print(json.dumps(result,ensure_ascii=False,indent=2))
