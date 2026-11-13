/** Passive comparison of two already authorised Core views.
 * These are separate reports from paired cBots, not independent broker proof.
 * No inferred ownership, labels, commands, FLAT state or execution permission.
 */
import {validateObservation} from './observation.mjs';
import {validateOriginalPlan,validateJournalEvent} from './engine-journal.mjs';
import {digest} from './schema.mjs';
import {validateDecimal,compareDecimal} from './planning/decimal.mjs';

export const RECONCILIATION20_TTL_MS=15000;
// An explicit presentation bound, not a measured native execution guarantee.
export const RECONCILIATION20_MAX_SKEW_MS=5000;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v,max=100)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\u0000-\u001f\u007f-\u009f]/u.test(v);
const id=v=>text(v)&&/^[A-Za-z0-9_.:-]+$/.test(v);
const account=v=>object(v)&&text(v.broker)&&text(v.id)&&v.environment==='demo'&&typeof v.currency==='string'&&/^[A-Z0-9]{3,12}$/.test(v.currency);
const sameAccount=(a,b)=>account(a)&&account(b)&&['broker','id','environment','currency'].every(k=>a[k]===b[k]);
const scope=a=>account(a)?Object.fromEntries(['broker','id','environment','currency'].map(k=>[k,a[k]])):null;
const copy=v=>v===undefined?null:JSON.parse(JSON.stringify(v));
const sequence=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(v)&&BigInt(v)<=9223372036854775807n;
const stamp=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(Date.parse(v)).toISOString()===v;
const age=(at,now)=>stamp(at)&&Number.isSafeInteger(now)?now-Date.parse(at):null;
const recent=value=>value!==null&&value>=0&&value<=RECONCILIATION20_TTL_MS;
const unique=a=>[...new Set(a)];
const issue=(code,level='unknown',field=null)=>({code,level,field,attribution:'not_determined'});

// Observer strings may contain trailing zeros, unlike journal canonical decimals.
// Normalisation uses strings only and preserves the original displayed value.
function canonicalDecimal(v){
  if(typeof v!=='string'||! /^-?(0|[1-9][0-9]{0,23})(?:\.[0-9]{1,18})?$/.test(v))throw Error('DECIMAL_INVALID');
  let result=v.includes('.')?v.replace(/0+$/,'').replace(/\.$/,''):v;
  if(result==='-0')throw Error('DECIMAL_INVALID');
  return validateDecimal(result);
}
function compare(a,b){return compareDecimal(canonicalDecimal(a),canonicalDecimal(b));}
function values(p){return p?{entry:p.entry,units:p.units,stop:p.stop,target:p.target,net:p.net}:null;}
function readObserver(view,now){
  const result={available:false,valid:false,fresh:false,reasons:[],account:null,runtimeId:null,sequence:null,observedAt:null,receivedAt:null,sourceAgeMilliseconds:null,receiptAgeMilliseconds:null,coverage:null,partial:true,nonAtomicSnapshot:true,brokerIndependentlyVerified:false,positions:[]};
  if(!object(view)||view.available!==true){result.reasons.push('OBSERVER_UNAVAILABLE');return result;}
  result.available=true;
  try{
    if(view.supported!==true||view.writesAllowed!==false||view.source!=='paired_observer'||view.brokerIndependentlyVerified!==false||view.nonAtomicSnapshot!==true||!stamp(view.receivedAt)||!stamp(view.observedAt))throw Error();
    // Reuse ingress shape validation at the historical capture time. Freshness
    // is recomputed separately; valid old evidence stays readable as history.
    const raw=validateObservation(view.observation,Date.parse(view.observedAt));
    if(view.runtimeId!==raw.runtimeId||view.sequence!==raw.sequence||view.observedAt!==raw.observedAt||digest(view.coverage)!==digest(raw.coverage)||digest(view.build)!==digest(raw.build))throw Error();
    result.valid=true;result.account=scope(raw.account);result.runtimeId=raw.runtimeId;result.sequence=raw.sequence;
    result.observedAt=raw.observedAt;result.receivedAt=view.receivedAt;result.sourceAgeMilliseconds=age(raw.observedAt,now);result.receiptAgeMilliseconds=age(view.receivedAt,now);
    result.coverage=copy(raw.coverage);result.positions=raw.positions;result.partial=view.status==='partial'||!raw.coverage.positionsComplete||!raw.coverage.ordersComplete||!raw.coverage.symbolsComplete;
    if(view.fresh!==true||view.reason!==null||!['fresh','partial'].includes(view.status))result.reasons.push(text(view.reason,100)?view.reason:'OBSERVER_NOT_CURRENT');
    if(!recent(result.sourceAgeMilliseconds))result.reasons.push(result.sourceAgeMilliseconds<0?'OBSERVER_SOURCE_TIME_FUTURE':'OBSERVER_SOURCE_STALE');
    if(!recent(result.receiptAgeMilliseconds))result.reasons.push(result.receiptAgeMilliseconds<0?'OBSERVER_RECEIPT_TIME_FUTURE':'OBSERVER_RECEIPT_STALE');
    result.fresh=result.reasons.length===0;
  }catch{result.valid=false;result.fresh=false;result.positions=[];result.reasons.push('OBSERVER_VIEW_INVALID');}
  result.reasons=unique(result.reasons);return result;
}
function rowScope(row,view){
  return object(row)&&row.source==='paired_engine_report'&&row.independentBrokerProof===false&&sameAccount(row.account,view.account)
    &&id(row.streamId)&&id(row.eventId)&&sequence(row.sequence)&&row.sequence!=='0'&&(row.sourceTime===null||stamp(row.sourceTime));
}
function readEngine(view,now){
  const result={available:false,valid:false,fresh:false,reasons:[],account:null,currentStreamId:null,lastReceivedAt:null,receiptAgeMilliseconds:null,gap:true,partial:true,runtimeBinding:'core_view_only_record_runtime_not_exposed',runtimeId:null,independentBrokerProof:false,positions:[],plans:[],counts:null};
  if(!object(view)||view.available!==true){result.reasons.push('ENGINE_UNAVAILABLE');return result;}
  result.available=true;
  try{
    if(view.supported!==true||view.writesAllowed!==false||view.source!=='paired_engine_report'||view.independentBrokerProof!==false||view.plansAreExecutionGrants!==false||!account(view.account)||!id(view.currentStreamId)||!stamp(view.lastReceivedAt)||typeof view.gap!=='boolean'||typeof view.truncated!=='boolean'||!object(view.counts))throw Error();
    for(const key of ['plans','positions','orders','streams'])if(!Array.isArray(view[key])||view[key].length>(key==='streams'?32:100)||!Number.isSafeInteger(view.counts[key])||view.counts[key]<view[key].length)throw Error();
    const streams=new Set();for(const stream of view.streams){
      if(!object(stream)||!id(stream.streamId)||streams.has(stream.streamId)||!sequence(stream.cursor)||!sequence(stream.highWater)||BigInt(stream.cursor)>BigInt(stream.highWater)||!object(stream.build)||stream.build.engine!=='Th3Revolution20'||!text(stream.build.version,50)||! /^[a-f0-9]{64}$/.test(stream.build.sourceHash))throw Error();
      streams.add(stream.streamId);
    }
    result.account=scope(view.account);result.currentStreamId=view.currentStreamId;result.lastReceivedAt=view.lastReceivedAt;result.receiptAgeMilliseconds=age(view.lastReceivedAt,now);
    result.gap=view.gap||view.streams.some(s=>s.cursor!==s.highWater);result.partial=view.truncated||['plans','positions','orders','streams'].some(k=>view.counts[k]>view[k].length);result.counts=copy(view.counts);
    if(!streams.has(view.currentStreamId))result.reasons.push('ENGINE_CURRENT_STREAM_NOT_IN_VIEW');
    if(view.fresh!==true||view.reason!==null)result.reasons.push(text(view.reason,100)?view.reason:'ENGINE_NOT_CURRENT');
    if(!recent(result.receiptAgeMilliseconds))result.reasons.push(result.receiptAgeMilliseconds<0?'ENGINE_RECEIPT_TIME_FUTURE':'ENGINE_RECEIPT_STALE');
    let rowsValid=true;
    for(const row of view.positions){
      try{
        if(!rowScope(row,view))throw Error();
        // This checks a projection's shape, not a new wire receipt or signature.
        validateJournalEvent({eventId:row.eventId,sequence:row.sequence,sourceTime:row.sourceTime,type:'position.reported',correlationId:null,causationId:null,payloadHash:digest(row.report),payload:row.report},Math.max(now,stamp(row.sourceTime)?Date.parse(row.sourceTime):now));
        result.positions.push(copy(row));
      }catch{rowsValid=false;result.reasons.push('ENGINE_POSITION_VIEW_INVALID');}
    }
    for(const row of view.plans){
      try{
        if(!rowScope(row,view)||row.planHash!==digest(row.plan))throw Error();
        const plan=validateOriginalPlan(row.plan);if(plan.currency!==view.account.currency)throw Error();
        result.plans.push({...copy(row),plan});
      }catch{rowsValid=false;result.reasons.push('ENGINE_ORIGINAL_PLAN_INVALID');}
    }
    result.valid=rowsValid;result.fresh=rowsValid&&result.reasons.length===0;
  }catch{result.valid=false;result.fresh=false;result.positions=[];result.plans=[];result.reasons.push('ENGINE_VIEW_INVALID');}
  result.reasons=unique(result.reasons);return result;
}
function keyed(rows,getId){const map=new Map();for(const row of rows){const key=getId(row);if(!map.has(key))map.set(key,[]);map.get(key).push(row);}return map;}
function engineRecord(row,source,now){
  if(!row)return null;
  const sourceAge=age(row.sourceTime,now),reasons=[];
  if(!source.fresh)reasons.push(...source.reasons);
  if(row.fresh!==true)reasons.push('ENGINE_RECORD_NOT_CURRENT');
  if(row.streamId!==source.currentStreamId)reasons.push('ENGINE_RECORD_OTHER_STREAM');
  if(!recent(sourceAge))reasons.push(sourceAge<0?'ENGINE_RECORD_TIME_FUTURE':row.sourceTime===null?'ENGINE_RECORD_TIME_UNKNOWN':'ENGINE_RECORD_STALE');
  return {values:values(row.report),planId:row.report.planId,symbol:row.report.symbol,side:row.report.side,exitMode:row.report.exitMode,reason:row.report.reason,
    sourceTime:row.sourceTime,sourceAgeMilliseconds:sourceAge,eventId:row.eventId,sequence:row.sequence,streamId:row.streamId,runtimeId:null,runtimeBinding:source.runtimeBinding,
    fresh:reasons.length===0,reasons:unique(reasons),presence:compare(row.report.units,'0')===0?'reported_closed':'reported_open'};
}
function originalPlan(row,plans,engine,issues){
  const planId=row?.report.planId??null;
  if(planId===null){issues.push(issue('ORIGINAL_PLAN_UNKNOWN'));return {state:'unknown',reason:'NO_ORIGINAL_PLAN_LINK',planId:null,values:null};}
  const candidates=plans.get(planId)??[];
  if(candidates.length!==1){const code=candidates.length>1?'ORIGINAL_PLAN_AMBIGUOUS':engine.partial?'ORIGINAL_PLAN_NOT_IN_LOADED_VIEW':'ORIGINAL_PLAN_UNAVAILABLE';issues.push(issue(code));return {state:'unknown',reason:code,planId,values:null};}
  const saved=candidates[0],plan=saved.plan;
  if(plan.symbol!==row.report.symbol||plan.side!==row.report.side){issues.push(issue('ORIGINAL_PLAN_IDENTITY_CONFLICT','attention'));return {state:'conflict',reason:'ORIGINAL_PLAN_IDENTITY_CONFLICT',planId,values:null};}
  return {state:'available',reason:null,planId,planHash:saved.planHash,sourceTime:saved.sourceTime,streamId:saved.streamId,
    source:'paired_engine_original_plan',immutableStoredPlan:true,nativeProtectionConfirmed:false,
    values:{entry:plan.entry,units:plan.units,stop:plan.stop,target:plan.target,riskCash:plan.riskCash,marginEstimate:plan.marginEstimate,costEstimate:plan.costEstimate,currency:plan.currency},
    revision:plan.revision,configRevision:plan.configRevision,createdAt:plan.createdAt,validUntil:plan.validUntil,timeframes:copy(plan.timeframes),exit:copy(plan.exit)};
}
function comparedField(engine,observer,field,identityOkay){
  const e=engine?.values[field]??null,o=observer?.values[field]??null;
  const relation=!engine||!observer||!identityOkay?'not_comparable':e===null&&o===null?'both_absent':e===null?'engine_absent':o===null?'observer_absent':compare(e,o)===0?'equal':'different';
  return {engine:e,observer:o,relation};
}
function originalRelation(current,original,side,field){
  if(!current||!original)return 'unknown';const value=current[field];if(value===null)return 'missing';
  const c=compare(value,original[field]);if(c===0)return 'same';
  if(field==='stop')return (side==='buy'?c>0:c<0)?'tighter':'wider';
  if(field==='units')return c>0?'above_original_requested':'below_original_requested';
  return 'changed';
}
function sourceOutput(source){const {positions,plans,...publicFields}=source;return publicFields;}

/** Inputs are unmodified results of ObservationService.view and EngineJournal.view.
 * Caller supplies already-authorised views. No state, IO, pairing or permissions
 * are created here. `now` is injected for deterministic expiry checks.
 */
export function reconcilePositionViews20({observerView=null,engineView=null,now=Date.now()}={}){
  if(!Number.isSafeInteger(now)||now<0||now>8640000000000000)throw TypeError('RECONCILIATION_TIME_INVALID');
  const observer=readObserver(observerView,now),engine=readEngine(engineView,now),issues=[];
  const bound=observer.account!==null&&engine.account!==null,same=bound&&sameAccount(observer.account,engine.account);
  if(bound&&!same)issues.push(issue('ACCOUNT_SCOPE_MISMATCH','attention'));
  if(!bound)issues.push(issue('ACCOUNT_SCOPE_NOT_AVAILABLE'));
  if(observer.partial)issues.push(issue('OBSERVER_PARTIAL_COVERAGE'));
  if(engine.partial)issues.push(issue('ENGINE_VIEW_TRUNCATED'));
  if(engine.gap)issues.push(issue('ENGINE_JOURNAL_GAP'));
  if(!observer.fresh)issues.push(...observer.reasons.map(code=>issue(code)));
  if(!engine.fresh)issues.push(...engine.reasons.map(code=>issue(code)));
  const result={schemaVersion:1,computedAt:new Date(now).toISOString(),passive:true,writesAllowed:false,grantsTrading:false,flatConfirmed:false,nativeProtectionConfirmed:false,brokerIndependentlyVerified:false,
    fresh:same&&observer.fresh&&engine.fresh,status:bound&&!same?'account_mismatch':!same?'waiting':!observer.fresh||!engine.fresh?'stale':observer.partial||engine.partial||engine.gap?'incomplete':'reports_available',
    account:same?copy(observer.account):null,accountMatched:same,sources:{observer:sourceOutput(observer),engine:sourceOutput(engine)},issues,positions:[],
    coverage:{observerPositionListComplete:observer.valid&&observer.coverage.positionsComplete,engineHistoricalViewComplete:engine.valid&&!engine.partial,engineIsOpenPositionList:false,historyCanProveOpenQuantity:false},
    limits:{freshnessMilliseconds:RECONCILIATION20_TTL_MS,comparisonSkewMilliseconds:RECONCILIATION20_MAX_SKEW_MS,nonAtomicSources:true,recordRuntimeExposed:false,sessionDeadlineExposed:false},
    summary:{observedPositions:observer.positions.length,loadedEnginePositionReports:engine.positions.length,linkedByNativeId:0,attention:0,notComparable:0}};
  // Never join colliding native IDs from different or unbound account scopes.
  if(!same)return result;
  const observed=keyed(observer.positions,p=>p.id),reported=keyed(engine.positions,p=>p.report.positionId),plans=keyed(engine.plans,p=>p.plan.planId);
  const ids=[...new Set([...observed.keys(),...reported.keys()])].sort();
  for(const positionId of ids){
    const localIssues=[],oRows=observed.get(positionId)??[],eRows=reported.get(positionId)??[];
    const o=oRows.length===1?oRows[0]:null,e=eRows.length===1?eRows[0]:null;
    const ambiguous=oRows.length>1||eRows.length>1;if(ambiguous)localIssues.push(issue('POSITION_ID_AMBIGUOUS','attention'));
    const identityOkay=!!o&&!!e&&!ambiguous&&o.symbol===e.report.symbol&&o.side===e.report.side;
    if(o&&e&&!identityOkay)localIssues.push(issue('POSITION_IDENTITY_CONFLICT','attention'));
    const observerRecord=o?{values:values(o),symbol:o.symbol,side:o.side,entryAt:o.entryAt,observedAt:observer.observedAt,receivedAt:observer.receivedAt,sourceAgeMilliseconds:observer.sourceAgeMilliseconds,runtimeId:observer.runtimeId,sequence:observer.sequence,fresh:observer.fresh,nonAtomicSnapshot:true,presence:'present'}:null;
    const current=engineRecord(e,engine,now),original=originalPlan(e,plans,engine,localIssues);
    const skew=o&&e&&stamp(e.sourceTime)?Math.abs(Date.parse(observer.observedAt)-Date.parse(e.sourceTime)):null;
    const currentPair=identityOkay&&observer.fresh&&current.fresh&&!observer.partial&&!engine.partial&&!engine.gap&&skew!==null&&skew<=RECONCILIATION20_MAX_SKEW_MS;
    const comparisonScope=!identityOkay?'identity_or_pair_unavailable':!observer.fresh||!current.fresh?'stale_or_unknown_time':engine.gap?'journal_gap':observer.partial||engine.partial?'partial_view':skew>RECONCILIATION20_MAX_SKEW_MS?'source_time_skew':'current_complete_pair';
    if(skew!==null&&skew>RECONCILIATION20_MAX_SKEW_MS)localIssues.push(issue('SOURCE_TIME_SKEW'));
    if(current&&!current.fresh)localIssues.push(...current.reasons.map(code=>issue(code)));
    if(o&&!e)localIssues.push(issue('OBSERVER_POSITION_NOT_IN_ENGINE_VIEW'));
    if(!o&&e)localIssues.push(issue(observer.fresh&&observer.coverage?.positionsComplete?'POSITION_NOT_IN_CURRENT_OBSERVER_SNAPSHOT':'OBSERVER_POSITION_PRESENCE_UNKNOWN'));
    const fields=Object.fromEntries(['entry','units','stop','target'].map(field=>[field,comparedField(current,observerRecord,field,identityOkay)]));
    for(const [field,value] of Object.entries(fields))if(['different','engine_absent','observer_absent'].includes(value.relation))localIssues.push(issue('REPORTED_'+field.toUpperCase()+'_DIFFERENCE',currentPair?'attention':'unknown',field));
    if(o&&o.stop===null)localIssues.push(issue('OBSERVED_STOP_MISSING',observer.fresh?'attention':'unknown','stop'));
    if(o&&o.target===null)localIssues.push(issue('OBSERVED_TARGET_MISSING',observer.fresh?'attention':'unknown','target'));
    const originalComparisons={};for(const field of ['stop','target','units']){
      originalComparisons[field]={engine:originalRelation(current?.values,original.values,e?.report.side,field),observer:identityOkay||!e?originalRelation(observerRecord?.values,original.values,o?.side,field):'unknown'};
    }
    if(originalComparisons.stop.observer==='wider')localIssues.push(issue('OBSERVED_STOP_WIDER_THAN_ORIGINAL',observer.fresh?'attention':'unknown','stop'));
    if(originalComparisons.stop.observer==='tighter')localIssues.push(issue('OBSERVED_STOP_TIGHTER_THAN_ORIGINAL','info','stop'));
    if(originalComparisons.units.observer==='above_original_requested')localIssues.push(issue('OBSERVED_UNITS_ABOVE_ORIGINAL_REQUEST',observer.fresh?'attention':'unknown','units'));
    const differs=Object.values(fields).some(v=>['different','engine_absent','observer_absent'].includes(v.relation));
    let health=ambiguous||o&&e&&!identityOkay?'identity_conflict':o&&observer.fresh&&o.stop===null?'observed_stop_missing':o&&observer.fresh&&o.target===null?'observed_target_missing':!o&&current?.presence==='reported_closed'?'closed_report_only':!o?'not_in_observer_snapshot':!e?'unlinked_observation':!currentPair?'comparison_unavailable':differs?'reported_values_differ':original.state!=='available'?'reported_values_agree_original_unknown':'reported_values_agree';
    const level=localIssues.some(x=>x.level==='attention')?'attention':currentPair?'info':'unknown';
    const row={positionId,symbol:o?.symbol??e?.report.symbol??null,side:o?.side??e?.report.side??null,link:identityOkay?'native_position_id':ambiguous?'ambiguous':o&&e?'identity_conflict':o?'observer_only':'engine_only',
      observer:observerRecord,engine:current,originalPlan:original,
      comparison:{scope:comparisonScope,currentPair,sourceSkewMilliseconds:skew,simultaneous:false,exactDecimalComparison:true,fields,original:originalComparisons},
      exitHealth:{state:health,level,nativeProtectionConfirmed:false,executionCapabilityConfirmed:false,riskViolationConfirmed:false,changeAttribution:'not_determined'},
      session:{state:'not_reported',closeDeadline:null,reason:'SESSION_POLICY_NOT_IN_PUBLIC_CONTRACT',originalMaxHoldSeconds:original.exit?.maxHoldSeconds??null},issues:localIssues};
    result.positions.push(row);if(identityOkay)result.summary.linkedByNativeId++;if(level==='attention')result.summary.attention++;if(!currentPair)result.summary.notComparable++;
  }
  return result;
}
