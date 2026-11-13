#!/usr/bin/env python3
"""Read-only validation of S03 documentation against immutable original Git sources.

Does not execute UI, connect to a broker, start a plan card or grant acceptance.
Optional --documents-root allows testing a detached documentation overlay.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import struct
import subprocess
import zipfile

BASE = 'b9845dc9f0434bd6ee7a94af239625a58f6b9135'
IDS = ['A01-r04','A02-r03','A03-r03','A04-r03','A05-r03']
NAV = ['Übersicht','Beobachtung','Forschung','Positionen']
STATES = {'loading','empty','delayed','stale','partial','error','permission_denied','draft','pending_confirmation','rejected','conflict','result'}
SCREENS = {'overview','observation','research','positions','settings'}
BINDINGS = {'bot_state','active_approach','market_count','position_count','job_count','market_chart','observed_setup','setup_details','recent_decisions','positions_preview','research_preview','equity','free_margin','open_pnl','market_timeframes','data_freshness','activity_counts','inspection_history','market_selection','small_chart','jobs','trial_context','comparison','research_result','new_trial','cancel_trial','knowledge','positions_inventory','position_totals','position_chart','original_plan','current_protection','position_history','open_plan','operating_mode','entry_policy','protection_policy','limits','connection','change_diff','check_changes','confirm_changes','discard_draft','progress_detail'}
FILES = ['design-baseline.json','screen-state-matrix.json','source-bindings.json','reference-preservation-report.json','data-bindings.json','work-status.json']

def require(condition: bool, code: str) -> None:
    if not condition:
        raise ValueError(code)

def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def secure_path(root: Path, relative: str) -> Path:
    rel = PurePosixPath(relative)
    require(not rel.is_absolute() and bool(rel.parts) and '..' not in rel.parts and '\\' not in relative, 'UNSAFE_PATH')
    cur = root
    for part in rel.parts:
        cur = cur / part
        require(not cur.is_symlink(), 'SYMLINK_SOURCE')
    require(cur.is_file(), 'SOURCE_MISSING:' + relative)
    return cur

def git(root: Path, *args: str) -> bytes:
    env = {k:v for k,v in os.environ.items() if not k.startswith('GIT_')}
    env.update({'GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':os.devnull,'GIT_NO_REPLACE_OBJECTS':'1','GIT_TERMINAL_PROMPT':'0'})
    return subprocess.run(['/usr/bin/git','-c','core.hooksPath='+os.devnull,'-C',str(root),*args], env=env,check=True,capture_output=True,timeout=30).stdout

def load(root: Path, p: str) -> dict:
    return json.loads(secure_path(root,p).read_text(encoding='utf-8'))


def check_field_trace(docs: Path, bindings: dict, matrix: dict, sources: dict, raw_sources: dict) -> dict:
    """Check structured source/field references; no implicit runtime/UI acceptance."""
    trace=load(docs,'evidence/S03/field-contracts.json')
    require(trace['source_base_revision']==BASE and trace['scope']=='documentation_and_source_examples_only','FIELD_TRACE_BASE')
    require(trace['product_ui_verified'] is False and trace['formal_completion'] is False,'FIELD_TRACE_FALSE_PASS')
    contracts={x['id']:x for x in trace['contracts']}
    expected_routes={
      'hub_bot':('GET','/api/hub/bots/{botId}'),
      'observer':('GET','/api/hub/bots/{botId}/observation'),
      'journal_projection':('GET','/api/hub/bots/{botId}/journal?limit={1..100}'),
      'reconciliation':('GET','/api/hub/reconciliation20?engineBotId={id}&observerBotId={id}'),
      'remote_projection':(None,None),
      'configuration_history':('GET','/api/hub/bots/{botId}/configuration-history'),
      'proposal_create':('POST','/api/hub/bots/{botId}/proposals'),
      'proposal_confirm':('POST','/api/hub/proposals/{proposalId}/confirm'),
      'proposal_cancel':('POST','/api/hub/proposals/{proposalId}/cancel')}
    require(set(contracts)==set(expected_routes) and len(contracts)==len(trace['contracts']),'CONTRACT_SET')
    for key,contract in contracts.items():
        require((contract['method'],contract['route'])==expected_routes[key],'CONTRACT_ROUTE')
        require(bool(contract['anchors']) and bool(contract['caveat']),'CONTRACT_UNBOUND')
        require(len(contract['fields'])==len(set(contract['fields'])),'DUPLICATE_FIELD')
    rules={x['id']:x for x in trace['rules']}
    require(set(rules)=={'quality_axes','row_freshness','reported_inventory','report_not_protection','account_selection','no_free_margin_derivation','projection_not_timeline','proposal_not_application'} and len(rules)==len(trace['rules']),'SEMANTIC_RULE_SET')
    anchors=0
    for item in [*contracts.values(),*rules.values()]:
        for a in item['anchors']:
            require(a['source_id'] in sources,'UNBOUND_ANCHOR')
            raw=raw_sources[a['source_id']]; lines=raw.decode('utf-8').splitlines(keepends=True)
            start,end=a['start_line'],a['end_line']
            require(type(start) is int and type(end) is int and 1<=start<=end<=len(lines),'ANCHOR_RANGE')
            excerpt=''.join(lines[start-1:end]).encode()
            require(digest(excerpt)==a['excerpt_sha256'] and a['first_contains'] in lines[start-1] and a['last_contains'] in lines[end-1],'ANCHOR_CHANGED')
            anchors+=1
    components={x['binding_id']:x for x in trace['components']}
    require(set(components)==BINDINGS and len(components)==len(trace['components']),'FIELD_COMPONENT_SET')
    require(trace['counts']=={'components':len(components),'contracts':len(contracts),'rules':len(rules)},'FIELD_COUNTS')
    by_id={x['id']:x for x in bindings['bindings']}
    for key,c in components.items():
        require(c['screen_id']==by_id[key]['screen_id'] and by_id[key]['field_contract_ref']=='field-contracts.json#'+key,'FIELD_SCREEN_BINDING')
        require(c['production_ui_connected'] is False,'FIELD_UI_CLAIM')
        require(c['mapping_level'] in ['existing_source_fields','partial_source_target_open','target_contract_open'],'FIELD_MAPPING_LEVEL')
        require(c['target_contract_open'] is (by_id[key]['binding_status']=='open_target_contract') and c['missing_contract']==by_id[key]['open_contract'],'OPEN_CONTRACT_DRIFT')
        cid=c['contract_id']
        if cid is None:
            require(c['field_paths']==[] and c['mapping_level']=='target_contract_open' and c['target_contract_open'],'UNBOUND_FIELD_PATH')
        else:
            require(cid in contracts and set(c['field_paths'])<=set(contracts[cid]['fields']),'UNBOUND_FIELD_PATH')
        if c['mapping_level']=='existing_source_fields':require(bool(c['field_paths']) and not c['target_contract_open'],'FALSE_IDENTIFIED_SOURCE')
    for key in ['recent_decisions','inspection_history','position_history']:
        c=components[key]
        require(c['target_contract_open'] and c['mapping_level']=='partial_source_target_open' and c['contract_id']=='journal_projection','PROJECTED_HISTORY_PROMOTED')
    require(components['free_margin']['field_paths']==[] and components['free_margin']['target_contract_open'],'FREE_MARGIN_INVENTED')
    require('observation.account.freeMargin' in contracts['observer']['absent_fields'] and 'observation.account.freeMargin' not in contracts['observer']['fields'],'FREE_MARGIN_INVENTED')
    require(components['original_plan']['contract_id']=='reconciliation' and 'positions[].originalPlan.state' in components['original_plan']['field_paths'],'PLAN_IDENTITY_LOST')
    for key,cid in [('check_changes','proposal_create'),('confirm_changes','proposal_confirm'),('discard_draft','proposal_cancel')]:
        require(components[key]['contract_id']==cid and components[key]['target_contract_open'],'ACTION_STAGE_CONFLATION')
    compound=matrix['compound_state_requirements']
    expected_compound={'fresh_but_partial':'quality_axes','fresh_feed_stale_row':'row_freshness','engine_reports_no_observed_positions':'reported_inventory','reported_agreement_no_native_proof':'report_not_protection','free_margin_unavailable':'no_free_margin_derivation','pending_after_confirm':'proposal_not_application'}
    require({x['id']:x['source_rule'] for x in compound}==expected_compound and len(compound)==len(expected_compound),'COMPOUND_STATE_COVERAGE')
    for x in compound:require(bool(x['visible']) and bool(x['forbidden']),'COMPOUND_STATE_SEMANTICS')
    examples=load(docs,'evidence/S03/source-examples.json')
    require(examples['synthetic_only'] is True and examples['ui_verified'] is False and examples['broker_connected'] is False,'EXAMPLE_FALSE_RUNTIME')
    require(examples['source_archive_sha256']==sources['reconciliation']['archive_sha256'],'EXAMPLE_SOURCE_BINDING')
    e={x['id']:x for x in examples['cases']}
    require(len(e)==len(examples['cases'])==7,'EXAMPLE_SET')
    require(e['fresh_partial']['source_fresh'] is True and e['fresh_partial']['status']=='incomplete' and e['fresh_partial']['current_pair'] is False,'FRESH_COMPLETE_CONFLATED')
    require(e['fresh_feed_stale_row']['source_fresh'] is True and e['fresh_feed_stale_row']['row_fresh'] is False,'ROW_FRESHNESS_CONFLATED')
    require(e['empty_observer_historical_report']['observed_positions']==0 and e['empty_observer_historical_report']['loaded_reports']==1 and e['empty_observer_historical_report']['flat_confirmed'] is False,'EMPTY_FLAT_CONFLATED')
    require(all(e['reported_agreement'][k] is False for k in ['native_protection_confirmed','broker_independently_verified','flat_confirmed','trade_granted']),'REPORT_CONFIRMED_PROTECTION')
    require(e['reported_agreement']['position_id']=='9007199254740993' and e['reported_agreement']['entry']=='1.100000000000000001','NATIVE_ID_OR_PRICE_ROUNDED')
    require('freeMargin' not in e['observer_no_free_margin']['account_keys'] and e['observer_no_free_margin']['invented_free_margin_rejected'] is True,'FREE_MARGIN_INVENTED')
    require(e['journal_is_projection']['has_events'] is False and e['journal_is_projection']['has_decisions'] is False,'PROJECTED_HISTORY_PROMOTED')
    require(e['account_scope_mismatch']['joined_rows']==0 and e['account_scope_mismatch']['account_matched'] is False,'ACCOUNT_SCOPE_LOST')
    return {'field_contracts':len(contracts),'source_line_anchors':anchors,'compound_states':len(compound),'original_source_example_cases':len(e)}

def check(root: Path, documents_root: Path | None = None) -> dict:
    root = root.resolve(); docs = (documents_root or root).resolve()
    require(git(root,'rev-parse',BASE+'^{commit}').decode().strip()==BASE,'BASE_UNAVAILABLE')
    ds = {f: load(docs,'evidence/S03/'+f) for f in FILES}
    b,m,s,p,d,w = (ds[x] for x in FILES)
    require(b['base_revision']==BASE and s['base_revision']==BASE,'BASE_CHANGED')
    require(b['status']=='prepared_not_activated' and b['formal_step_status']=='pending','FALSE_FORMAL_COMPLETION')
    require(w['official_status']=='pending' and w['official_state_changed'] is False,'FALSE_FORMAL_COMPLETION')
    sources = s['sources']; require(s['source_count']==len(sources),'SOURCE_COUNT')
    # Anchor hashes in original Git objects, not only in this new manifest.
    archive_cache = {}; raw_sources = {}
    for id,src in sources.items():
        if src['kind']=='repository_file':
            path=secure_path(root,src['path']); raw=path.read_bytes()
            original=git(root,'show',BASE+':'+src['path'])
            require(raw==original,'SOURCE_CHANGED:'+id)
        elif src['kind']=='archive_member':
            name=src['archive']; path=secure_path(root,name)
            if name not in archive_cache:
                blob=path.read_bytes(); require(blob==git(root,'show',BASE+':'+name),'ARCHIVE_CHANGED')
                archive_cache[name]=blob
            require(digest(archive_cache[name])==src['archive_sha256'],'ARCHIVE_HASH')
            rel=PurePosixPath(src['member']); require(not rel.is_absolute() and '..' not in rel.parts,'UNSAFE_MEMBER')
            with zipfile.ZipFile(path) as z: raw=z.read(src['member'])
        else:
            raise ValueError('SOURCE_KIND')
        require(digest(raw)==src['sha256'] and len(raw)==src['bytes'],'SOURCE_BINDING:'+id)
        raw_sources[id]=raw
    approval=load(root,sources['approval']['path']); inv=load(root,sources['reference-inventory']['path'])
    require([r['id'] for r in b['references']]==IDS,'REFERENCE_SET')
    require([r['id'] for r in approval['references']]==IDS,'ORIGINAL_REFERENCE_SET')
    imap={x['id']:x for x in inv['references']}; amap={x['id']:x for x in approval['references']}
    for ref in b['references']:
        raw=secure_path(root,ref['source_path']).read_bytes(); ar=amap[ref['id']]
        require(ref['source_path']=='governance/masterplan/'+ar['path'],'REFERENCE_PATH')
        require(digest(raw)==ref['sha256']==ar['sha256']==imap[ref['id']]['sha256'],'REFERENCE_HASH')
        require(raw[:8]==b'\x89PNG\r\n\x1a\n','NOT_PNG')
        require(struct.unpack('>II',raw[16:24])==(ref['width_px'],ref['height_px']),'REFERENCE_DIMENSION')
        require(ref['css_viewport'] is None and ref['device_pixel_ratio'] is None,'FAKE_VIEWPORT')
        require(ref['approval_scope']=='desktop_baseline' and ref['implemented'] is False,'FALSE_REFERENCE_ACCEPTANCE')
        require(ref['approval_date']==approval['date'] and ref['approval_timezone']==approval['timezone'],'APPROVAL_DATE')
    ae=b['approval_evidence']; require(ae['user_evidence']==approval['user_evidence'] and ae['approved_scope']==['desktop_baseline'] and ae['new_approval_given'] is False,'APPROVAL_SCOPE')
    require(b['navigation']['main']==NAV and b['navigation']['settings_entry']=='Zahnrad' and b['navigation']['strategy_catalog'] is False,'NAVIGATION')
    require(b['navigation']['setup_card_instances']==[{'screen_id':'overview','component_id':'observed_setup'}],'SETUP_DUPLICATE')
    for k,val in b['limits'].items():
        require(val is (k=='desktop_concept_approved'),'FALSE_RUNTIME_ACCEPTANCE:'+k)
    require(b['visual_start_values']['tokens_implemented'] is False,'TOKEN_IMPLEMENTED')
    require(p['reference_count']==5 and p['product_acceptance'] is False and p['new_images_generated'] is False and p['reference_files_modified'] is False,'PRESERVATION_CLAIM')
    require([x['id'] for x in p['references']]==IDS,'PRESERVATION_IDS')
    for x in p['references']:
        ref=next(r for r in b['references'] if r['id']==x['id'])
        require(x['path']==ref['source_path'] and x['sha256_observed']==x['sha256_expected']==ref['sha256'] and x['dimensions']==[ref['width_px'],ref['height_px']],'PRESERVATION_BINDING')
    require({x['id'] for x in m['screens']}==SCREENS and len(m['screens'])==5,'SCREEN_SET')
    listed=[]
    for screen in m['screens']:
        require(screen['primary_navigation'] is (screen['id']!='settings'),'SETTINGS_NAV')
        require(screen['setup_instances']==(1 if screen['id']=='overview' else 0),'SETUP_DUPLICATE')
        require({x['state'] for x in screen['states']}==STATES and len(screen['states'])==12,'STATES_INCOMPLETE')
        require(screen['product_verified'] is False and all(x['implementation_status']=='NOT_RUN' for x in screen['states']),'STATE_FALSE_PASS')
        listed += screen['component_ids']
    require(set(listed)==BINDINGS and len(listed)==len(BINDINGS),'COMPONENT_COVERAGE')
    require({x['id'] for x in d['bindings']}==BINDINGS and len(d['bindings'])==len(BINDINGS)==d['binding_count'],'BINDING_COVERAGE')
    for item in d['bindings']:
        require(item['screen_id'] in SCREENS and item['id'] in next(x for x in m['screens'] if x['id']==item['screen_id'])['component_ids'],'BINDING_SCREEN')
        require(bool(item['source_ids']) and set(item['source_ids'])<=set(sources),'UNBOUND_SOURCE')
        require(all(isinstance(item[k],str) and item[k].strip() for k in ['meaning','time_reference','unit_or_identity','ack_rule','failure_rule']),'MISSING_SEMANTICS')
        require(item['product_runtime_verified'] is False and item['optimistic_financial_success_allowed'] is False,'FALSE_EFFECT')
        require(item['authority'] in ['read_only_projection','research_only','proposal_only','separate_explicit_authorization'],'IMPLICIT_AUTHORITY')
        require(item['binding_status'] in ['open_target_contract','source_contract_identified_not_integrated'],'IMPLICIT_INTEGRATION')
        require(item['binding_status']!='open_target_contract' or bool(item['open_contract']),'EMPTY_OPEN_CONTRACT')
    field_result=check_field_trace(docs,d,m,sources,raw_sources)
    tpl=load(root,sources['visual-template']['path'])
    require(m['test_cases']==tpl['test_cases'] and len(m['test_cases'])==32,'PRODUCT_CASES_CHANGED')
    require(m['transition_checks']==tpl['transition_checks'] and len(m['transition_checks'])==14,'TRANSITIONS_CHANGED')
    require(m['responsive_checks']==tpl['responsive_checks'],'RESPONSIVE_CHANGED')
    require(m['all_product_cases_executed'] is False and m['source_template_sha256']==sources['visual-template']['sha256'],'FALSE_PRODUCT_RUN')
    routes=load(docs,'docs/ui/navigation/route-compatibility.json')
    require(routes['main_navigation']==NAV and routes['settings_entry']=='Zahnrad' and routes['changes_installed'] is False,'ROUTES_ACTIVATED')
    rmap={x['id']:x for x in routes['routes']}
    require(set(rmap)=={'root','journal','account','remote','unrecovered'},'ROUTE_SET')
    require({k:v['source_url'] for k,v in rmap.items()}=={'root':'/','journal':None,'account':'/konto-live.html','remote':'/revolution.html','unrecovered':None},'INVENTED_ROUTE')
    for x in rmap.values():require(set(x['source_ids'])<=set(sources),'ROUTE_SOURCE')
    # All original tracked files, including plan/state/approved images, remain byte-identical.
    unchanged=0
    for raw in git(root,'ls-tree','-rz',BASE).split(b'\0'):
        if not raw:continue
        meta,path=raw.split(b'\t',1); mode,kind,oid=meta.split()
        require(kind==b'blob' and mode in (b'100644',b'100755'),'UNEXPECTED_BASE_FILE_TYPE')
        name=path.decode('utf-8'); file=secure_path(root,name)
        content=file.read_bytes(); git_blob=hashlib.sha1(b'blob '+str(len(content)).encode()+b'\0'+content).hexdigest().encode()
        require(git_blob==oid,'BASE_FILE_CHANGED:'+name); unchanged+=1
    require(not (docs/'evidence/S03/completion.json').exists(),'UNAUTHORIZED_COMPLETION')
    return {**field_result,'result':'documentation_consistent','original_files_unchanged':unchanged,'reference_files':5,'source_bindings':len(sources),'display_action_bindings':len(BINDINGS),'screens':5,'screen_state_entries':60,'future_transition_pairs':14,'future_product_cases_not_run':32,'product_tests_executed':0,'formal_S03_completed':False,'plan_or_state_changed':False,'base_revision':BASE}

def main() -> int:
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--repo',type=Path,default=Path(__file__).resolve().parents[2]);parser.add_argument('--documents-root',type=Path);args=parser.parse_args()
    try: print(json.dumps(check(args.repo,args.documents_root),ensure_ascii=False,indent=2));return 0
    except (ValueError,KeyError,OSError,subprocess.SubprocessError,zipfile.BadZipFile) as exc:
        print(json.dumps({'result':'rejected','error':str(exc)},ensure_ascii=False));return 1
if __name__=='__main__':raise SystemExit(main())
