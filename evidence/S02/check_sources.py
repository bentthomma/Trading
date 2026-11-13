"""Validate bound original bytes and the S02 artifact graph. No source mutation."""
from pathlib import Path, PurePosixPath
import hashlib,json,zipfile
R=Path(__file__).resolve().parents[2]
def sha(b):return hashlib.sha256(b).hexdigest()
def check(root=R):
    data=json.loads((root/'evidence/S02/source-bindings.json').read_text()); seen=set()
    reference=data['reference_manifest'];raw=(root/reference['path']).read_bytes()
    if sha(raw)!=reference['sha256']:raise ValueError('REFERENCE_MANIFEST_CHANGED')
    original=json.loads(raw);selected=set(reference['source_ids']);bound=[]
    for source in original['sources']:
        if source['id'] in selected:
            row=dict(source)
            if row['kind']!='archive_member':raise ValueError('UNSUPPORTED_REFERENCE_KIND')
            row['archive']=reference['archive_prefix']+row['archive'];bound.append(row)
    if {v['id']for v in bound}!=selected:raise ValueError('MISSING_REFERENCED_SOURCE')
    data['sources']=bound+data['additional_sources']
    for name,h in data['archives'].items():
        p=root/name
        if sha(p.read_bytes())!=h:raise ValueError('ARCHIVE_CHANGED:'+name)
        with zipfile.ZipFile(p) as z:
            if z.testzip() is not None:raise ValueError('ARCHIVE_CRC')
    for s in data['sources']:
        if s['id'] in seen:raise ValueError('DUPLICATE_SOURCE_ID')
        seen.add(s['id'])
        if s['kind']=='archive_member':
            member=PurePosixPath(s['member'])
            if member.is_absolute() or '..'in member.parts:raise ValueError('UNSAFE_MEMBER')
            with zipfile.ZipFile(root/s['archive']) as z:b=z.read(s['member'])
        else:b=(root/s['path']).read_bytes()
        if sha(b)!=s['sha256'] or len(b)!=s['bytes']:raise ValueError('SOURCE_CHANGED:'+s['id'])
        lines=b.decode('utf8').splitlines()
        for a in s.get('evidence',[])+s.get('s02_additional_anchors',[]):
            if a['anchor']not in lines[a['line']-1]:raise ValueError('ANCHOR_CHANGED')
            excerpt='\n'.join(lines[a['start_line']-1:a['end_line']])+'\n'
            if sha(excerpt.encode())!=a['excerpt_sha256']:raise ValueError('ANCHOR_HASH_CHANGED')
    meta=json.loads((root/'evidence/S02/domain-contract.json').read_text())
    if sha((root/meta['schema_path']).read_bytes())!=meta['schema_sha256']:raise ValueError('SCHEMA_BINDING_CHANGED')
    matrix=json.loads((root/'evidence/S02/capability-matrix.json').read_text())
    if matrix['capability_document_is_authority'] is not False or matrix['default']!='deny' or matrix['installed_by_this_package']:raise ValueError('UNAUTHORISED_GRANT')
    for p in matrix['principals']:
        if p['id'] in ('website_ui','research_worker','mcp_reader','mcp_proposer'):
            if 'broker.execute' not in p['forbidden'] or 'broker.execute' in p['capabilities']:raise ValueError('UNAUTHORISED_GRANT')
    scope=json.loads((root/'evidence/S02/scope-resolution-draft.json').read_text())
    plan=json.loads((root/'governance/masterplan/plan.json').read_text())
    if scope['active'] or scope['plan_sha256']!=data['plan_sha256']:raise ValueError('UNAUTHORISED_SCOPE_ACTIVATION')
    steps={s['id']:s for s in plan['steps'] if s['id']not in ('S00','S01','S02')}
    if {s['step_id'] for s in scope['steps']}!=set(steps) or len(scope['steps'])!=len(steps):raise ValueError('MISSING_FUTURE_SCOPE')
    for s in scope['steps']:
        if s['proposed_target_paths']!=steps[s['step_id']]['allowed_paths']:raise ValueError('UNREVIEWED_SCOPE_CHANGE')
        if not set(s['source_ids'])<=seen:raise ValueError('INVENTED_SOURCE_ID')
    state=json.loads((root/'governance/masterplan/control/state.json').read_text())
    if [state['steps'][s]['status'] for s in ('S00','S01')]!=['passed','passed']:raise ValueError('PRIOR_COMPLETION_CHANGED')
    return {'bound_sources':len(seen),'bound_archives':len(data['archives']),'contract_types':len(meta['domain_types']),'future_scope_entries':len(steps),'public_or_broker_activation':False}
if __name__=='__main__':print(json.dumps(check(),indent=2))
