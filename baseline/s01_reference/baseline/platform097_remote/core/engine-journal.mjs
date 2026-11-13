import {readLineage,buildForSequence,buildHoldKey} from './journal-build-lineage.mjs';
/**
 * Durable inbox and projections of reports from the paired Ready20 engine.
 * This is not a broker adapter or an execution grant. Original plans remain
 * immutable; source gaps and conflicts remain visible. All economic numbers
 * and broker identifiers stay strings. Schema-2 KV rows participate in the
 * existing FULL-synchronous SQLite transactions, backups and integrity checks.
 */
import {randomUUID} from 'node:crypto';
import {fail,object} from './errors.mjs';
import {canonical,digest} from './schema.mjs';
import {validateDecimal,compareDecimal,subtractDecimal} from './planning/decimal.mjs';

export const ENGINE_JOURNAL_PROFILE='th3rev.ready20.v1';
export const JOURNAL_MAX_BYTES=65536;
export const JOURNAL_MAX_EVENTS=128;
export const JOURNAL_MAX_STORED_EVENTS=100000;
export const JOURNAL_MAX_STORED_BYTES=268435456;
const MAX_SEQUENCE=9223372036854775807n;
const prefix=id=>'enginejournal:v1:'+id+':';
const invalid=(code='JOURNAL_INVALID')=>fail(code,'Die Engine-Meldung passt nicht zum Journalvertrag.',400);
const conflict=(code='JOURNAL_CONFLICT')=>fail(code,'Journalbelege widersprechen einem bereits gespeicherten Stand. Abgleich erforderlich.',409);
const detach=v=>JSON.parse(JSON.stringify(v));
function exact(v,keys){if(!object(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))invalid();}
function text(v,max=100){if(typeof v!=='string'||!v.length||v.length>max||/[\u0000-\u001f\u007f-\u009f]/u.test(v))invalid();return v;}
function id(v){text(v);if(!/^[A-Za-z0-9_.:-]+$/.test(v))invalid();return v;}
function code(v){if(typeof v!=='string'||! /^[A-Z][A-Z_0-9]{0,79}$/.test(v))invalid();return v;}
function integer(v,max=100000){if(!Number.isSafeInteger(v)||v<0||v>max)invalid();return v;}
function time(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v))invalid();const n=Date.parse(v);if(!Number.isFinite(n)||new Date(n).toISOString()!==v)invalid();return n;}
function decimal(v,{positive=false,nonnegative=false}={}){try{validateDecimal(v);if(positive&&compareDecimal(v,'0')<=0||nonnegative&&compareDecimal(v,'0')<0)invalid();}catch{invalid('JOURNAL_DECIMAL_INVALID');}return v;}
function optionalDecimal(v){if(v!==null)decimal(v);}
function hash(v){if(typeof v!=='string'||! /^[a-f0-9]{64}$/.test(v))invalid('JOURNAL_HASH_INVALID');}
function sequence(v){if(typeof v!=='string'||! /^[1-9][0-9]{0,18}$/.test(v)||BigInt(v)>MAX_SEQUENCE)invalid('JOURNAL_SEQUENCE_INVALID');return BigInt(v);}
function account(a){exact(a,['broker','id','environment','currency']);text(a.broker);text(a.id);if(a.environment!=='demo'||typeof a.currency!=='string'||!/^[A-Z0-9]{3,12}$/.test(a.currency))invalid('JOURNAL_ACCOUNT_INVALID');}
function side(v){if(!['buy','sell'].includes(v))invalid();}
function nullableId(v){if(v!==null)id(v);}
function orderAmounts(p){
  if(p.requestedUnits!==null)decimal(p.requestedUnits,{positive:true});
  for(const k of ['filledUnits','remainingUnits'])if(p[k]!==null){decimal(p[k],{nonnegative:true});if(p.requestedUnits!==null&&compareDecimal(p[k],p.requestedUnits)>0)invalid('JOURNAL_QUANTITY_CONFLICT');}
  // A cancelled/expired remainder can leave the sum below the original size,
  // but a reported fill plus still-working remainder cannot exceed it.
  if(p.requestedUnits!==null&&p.filledUnits!==null&&p.remainingUnits!==null&&compareDecimal(p.filledUnits,subtractDecimal(p.requestedUnits,p.remainingUnits))>0)invalid('JOURNAL_QUANTITY_CONFLICT');
}

export function validateOriginalPlan(p){
  exact(p,['planId','revision','scenarioId','intentId','symbol','side','orderKind','configRevision','createdAt','entry','stop','target','units','riskCash','marginEstimate','costEstimate','currency','timeframes','exit','validUntil','reasonCode','reason','score']);
  for(const k of ['planId','scenarioId','intentId'])id(p[k]);text(p.symbol);side(p.side);
  if(p.revision!==1||!['market_range','limit','stop','stop_limit'].includes(p.orderKind))invalid('ORIGINAL_PLAN_INVALID');
  integer(p.configRevision,Number.MAX_SAFE_INTEGER);const created=time(p.createdAt),expires=time(p.validUntil);
  if(expires<=created)invalid('ORIGINAL_PLAN_EXPIRED');
  for(const k of ['entry','stop','target'])decimal(p[k]);
  decimal(p.units,{positive:true});for(const k of ['riskCash','marginEstimate','costEstimate'])decimal(p[k],{nonnegative:true});
  if(typeof p.currency!=='string'||! /^[A-Z0-9]{3,12}$/.test(p.currency))invalid();
  const order=compareDecimal(p.stop,p.entry),target=compareDecimal(p.target,p.entry);
  if(p.side==='buy'?(order>=0||target<=0):(order<=0||target>=0))invalid('ORIGINAL_PLAN_GEOMETRY');
  exact(p.timeframes,['contextSeconds','setupSeconds','triggerSeconds']);
  integer(p.timeframes.contextSeconds,604800);for(const k of ['setupSeconds','triggerSeconds'])if(integer(p.timeframes[k],604800)<1)invalid();
  exact(p.exit,['atr','minimumTargetDistance','halfLifeSeconds','maxHoldSeconds','activationAtr','trailAtr']);
  for(const k of ['atr','halfLifeSeconds','maxHoldSeconds'])decimal(p.exit[k],{positive:true});
  for(const k of ['minimumTargetDistance','activationAtr','trailAtr'])decimal(p.exit[k],{nonnegative:true});
  code(p.reasonCode);text(p.reason,500);
  if(p.score!==null&&(typeof p.score!=='number'||!Number.isFinite(p.score)||Math.abs(p.score)>1e6))invalid();
  return detach(p);
}

const ORDER_STATES=new Set(['reserved','dispatching','working','partially_filled','filled','cancel_requested','remainder_cancelled','remainder_expired','rejected_no_fill','outcome_unknown']);
const TERMINAL_ORDER_STATES=new Set(['filled','remainder_cancelled','remainder_expired','rejected_no_fill']);
// These are explicit conflicts reported by the exact native reducer, not a
// generic old transport callback. Keeping a previous terminal badge must never
// conceal a real late fill or a newly reported economic contradiction.
const NATIVE_ECONOMIC_CONFLICTS=new Set(['NATIVE_QUANTITY_CONFLICT','LATE_EXECUTION_REOPENS_RESERVATION','DEAL_DUPLICATE_CONFLICT',
  'BROKER_FILLED_BELOW_EXECUTION','NATIVE_VOLUME_SEMANTICS_CONFLICT','WORKING_ORDER_WITH_NO_REMAINING',
  'EXECUTION_EXCEEDS_ORIGINAL_UNITS','ORIGINAL_ORDER_UNITS_MISMATCH','UNOBSERVED_POSITION_EXPOSURE',
  'CLOSING_DEAL_LINK_CONFLICT','CLOSING_POSITION_OWNERSHIP_UNKNOWN']);
const ACTORS=new Set(['unknown','broker_expiry','own_command_confirmed','authenticated_user_command','external_unattributed']);
export function validateJournalEvent(e,now){
  exact(e,['eventId','sequence','sourceTime','type','correlationId','causationId','payloadHash','payload']);id(e.eventId);sequence(e.sequence);
  if(e.sourceTime!==null&&time(e.sourceTime)>now+5000)invalid('JOURNAL_TIME_INVALID');nullableId(e.correlationId);nullableId(e.causationId);hash(e.payloadHash);
  if(digest(e.payload)!==e.payloadHash)invalid('JOURNAL_PAYLOAD_HASH_MISMATCH');
  const p=e.payload;
  if(e.type==='plan.recorded')validateOriginalPlan(p);
  else if(e.type==='order.reported'){
    exact(p,['intentId','planId','label','brokerOrderId','positionId','state','requestedUnits','filledUnits','remainingUnits','reason','actorEvidence']);
    id(p.intentId);nullableId(p.planId);text(p.label);nullableId(p.brokerOrderId);nullableId(p.positionId);
    if(!ORDER_STATES.has(p.state)||!ACTORS.has(p.actorEvidence))invalid();
    orderAmounts(p);
    if(p.planId!==null&&p.requestedUnits===null)invalid('JOURNAL_PLAN_QUANTITY_REQUIRED');
    if(p.state==='remainder_expired'&&p.actorEvidence!=='broker_expiry')invalid('JOURNAL_EXPIRY_ATTRIBUTION');
    code(p.reason);
  }else if(e.type==='position.reported'){
    exact(p,['positionId','planId','symbol','side','units','entry','stop','target','net','exitMode','reason']);id(p.positionId);nullableId(p.planId);text(p.symbol);side(p.side);
    decimal(p.units,{nonnegative:true});decimal(p.entry);for(const k of ['stop','target'])optionalDecimal(p[k]);decimal(p.net);code(p.reason);
    if(!['original_plan','protection_only','observed_only'].includes(p.exitMode)||p.exitMode==='original_plan'&&p.planId===null)invalid('JOURNAL_PLAN_REQUIRED');
  }else if(e.type==='engine.status'){
    exact(p,['candidateScenarios','pendingCount','positionCount','readySymbols','totalSymbols','blocked','reason','decisionReasons']);
    for(const k of ['candidateScenarios','pendingCount','positionCount','readySymbols','totalSymbols'])integer(p[k]);
    if(p.readySymbols>p.totalSymbols||typeof p.blocked!=='boolean'||!Array.isArray(p.decisionReasons)||p.decisionReasons.length>100)invalid();code(p.reason);
    const seen=new Set();for(const r of p.decisionReasons){exact(r,['code','count']);code(r.code);integer(r.count);if(seen.has(r.code))invalid();seen.add(r.code);}
  }else invalid('JOURNAL_EVENT_UNSUPPORTED');
  return detach(e);
}

export class EngineJournal {
  constructor(control){this.control=control;this.store=control.store;this.db=control.db;this.now=control.now;this.epoch=randomUUID();}
  #key(botId,type,id){return prefix(botId)+type+':'+id;}
  #get(key,fallback=null){try{return this.store.get(key,fallback);}catch{conflict('JOURNAL_STORAGE_INVALID');}}
  #assertProfile(bot){const m=JSON.parse(bot.manifest);if(m.id!==ENGINE_JOURNAL_PROFILE||m.version!=='1.0.0'||!m.capabilities.telemetry)fail('JOURNAL_PROFILE_REQUIRED','Dieses Botprofil besitzt keinen Engine-Journalvertrag.',409);}
  #binding(value){
    if(value===null)return null;
    try{exact(value,['tokenId','account','streamId']);id(value.tokenId);account(value.account);id(value.streamId);return value;}
    catch{conflict('JOURNAL_STORAGE_INVALID');}
  }
  #storedEvent(value){
    try{
      exact(value,['fingerprint','streamId','account','build','receivedAt','event']);hash(value.fingerprint);id(value.streamId);account(value.account);
      exact(value.build,['engine','version','sourceHash']);if(value.build.engine!=='Th3Revolution20')invalid();text(value.build.version,50);hash(value.build.sourceHash);
      validateJournalEvent(value.event,time(value.receivedAt));
      if(value.fingerprint!==digest({streamId:value.streamId,account:value.account,build:value.build,event:value.event}))invalid();
      return value;
    }catch{conflict('JOURNAL_STORAGE_INVALID');}
  }
  #stream(value){
    try{
      exact(value,['streamId','account','build','cursor','highWater','stored','lastReceivedAt','runtimeId','coreEpoch']);id(value.streamId);account(value.account);
      if(value.cursor!=='0')sequence(value.cursor);if(value.highWater!=='0')sequence(value.highWater);
      if(BigInt(value.cursor)>BigInt(value.highWater))invalid();integer(value.stored,JOURNAL_MAX_STORED_EVENTS);
      if(BigInt(value.stored)<BigInt(value.cursor)||BigInt(value.stored)>BigInt(value.highWater))invalid();
      if(value.lastReceivedAt!==null)time(value.lastReceivedAt);nullableId(value.runtimeId);nullableId(value.coreEpoch);
      exact(value.build,['engine','version','sourceHash']);text(value.build.engine);text(value.build.version,50);hash(value.build.sourceHash);
      return value;
    }catch{conflict('JOURNAL_STORAGE_INVALID');}
  }
  #validateBatch(input,actor){
    exact(input,['schemaVersion','botId','runtimeId','streamId','account','build','events']);
    if(input.schemaVersion!==1||Buffer.byteLength(JSON.stringify(input))>JOURNAL_MAX_BYTES)invalid('JOURNAL_LIMIT');
    id(input.botId);id(input.runtimeId);id(input.streamId);account(input.account);
    exact(input.build,['engine','version','sourceHash']);if(input.build.engine!=='Th3Revolution20')invalid('JOURNAL_BUILD_INVALID');text(input.build.version,50);hash(input.build.sourceHash);
    if(!Array.isArray(input.events)||input.events.length>JOURNAL_MAX_EVENTS)invalid('JOURNAL_LIMIT');
    this.control.assertBridge(actor,input.botId);const b=this.control.rawBot(input.botId);this.#assertProfile(b);
    if(b.runtime_id!==input.runtimeId||b.account_id!==input.account.id||b.environment!==input.account.environment)conflict('JOURNAL_RUNTIME_MISMATCH');
    if(b.last_seen===null||this.now()<b.last_seen||this.now()-b.last_seen>15000||b.runtime_status!=='connected')conflict('JOURNAL_HEARTBEAT_REQUIRED');
    const ids=new Set(),seqs=new Set();const events=input.events.map(e=>{
      const v=validateJournalEvent(e,this.now());if(ids.has(v.eventId)||seqs.has(v.sequence))invalid('JOURNAL_BATCH_DUPLICATE');ids.add(v.eventId);seqs.add(v.sequence);
      if(e.type==='plan.recorded'&&(e.payload.currency!==input.account.currency||e.payload.configRevision>b.revision))invalid('JOURNAL_PLAN_SCOPE');return v;
    });return {...detach(input),events};
  }
  #project(botId,scope,e){
    const p=e.payload,base={source:'paired_engine_report',independentBrokerProof:false,sourceTime:e.sourceTime,eventId:e.eventId,sequence:e.sequence,streamId:scope.streamId,account:scope.account};
    const scopedId=value=>digest({account:scope.account,id:value});
    if(e.type==='plan.recorded'){
      const key=this.#key(botId,'plan',scopedId(p.planId)),old=this.#get(key);
      if(old&&old.planHash!==digest(old.plan))conflict('JOURNAL_STORAGE_INVALID');
      if(old&&canonical(old.plan)!==canonical(p))conflict('ORIGINAL_PLAN_IMMUTABLE');
      if(!old)this.store.set(key,{...base,planHash:digest(p),plan:p,recordedAt:new Date(this.now()).toISOString()});
    }else if(e.type==='order.reported'||e.type==='position.reported'){
      const plan=p.planId===null?null:this.#get(this.#key(botId,'plan',scopedId(p.planId)));
      if(p.planId!==null&&!plan)conflict('JOURNAL_PLAN_NOT_FOUND');
      if(plan&&plan.planHash!==digest(plan.plan))conflict('JOURNAL_STORAGE_INVALID');
      if(e.type==='order.reported'){
        if(plan&&(plan.plan.intentId!==p.intentId||compareDecimal(plan.plan.units,p.requestedUnits)!==0))conflict('JOURNAL_PLAN_IDENTITY_MISMATCH');
        const key=this.#key(botId,'order',scopedId(p.intentId)),old=this.#get(key);
        if(old){
          if(old.report.planId!==null&&p.planId!==null&&old.report.planId!==p.planId||old.report.requestedUnits!==null&&p.requestedUnits!==null&&compareDecimal(old.report.requestedUnits,p.requestedUnits)!==0)conflict('JOURNAL_PLAN_IDENTITY_MISMATCH');
          for(const field of ['brokerOrderId','positionId'])if(old.report[field]!==null&&p[field]!==null&&old.report[field]!==p[field])conflict('JOURNAL_ORDER_IDENTITY_CONFLICT');
          const higherFill=p.filledUnits!==null&&(old.report.filledUnits===null?compareDecimal(p.filledUnits,'0')>0:compareDecimal(p.filledUnits,old.report.filledUnits)>0);
          const economicConflict=p.state==='outcome_unknown'&&NATIVE_ECONOMIC_CONFLICTS.has(p.reason);
          const older=old.sourceTime!==null&&e.sourceTime!==null&&time(e.sourceTime)<time(old.sourceTime);
          // Old equal/lower-volume snapshots are archived by the inbox without
          // changing today's projection. Stronger quantities are monotone facts
          // even when transport/source times arrive out of order.
          if(older&&!higherFill&&!economicConflict)return;
          if(old.report.filledUnits!==null&&p.filledUnits!==null&&compareDecimal(p.filledUnits,old.report.filledUnits)<0)conflict('JOURNAL_FILL_REGRESSION');
          if(TERMINAL_ORDER_STATES.has(old.report.state)&&!TERMINAL_ORDER_STATES.has(p.state)&&!higherFill&&!economicConflict)return;
        }
        const report=old?{...p,planId:p.planId??old.report.planId,requestedUnits:p.requestedUnits??old.report.requestedUnits,brokerOrderId:p.brokerOrderId??old.report.brokerOrderId,positionId:p.positionId??old.report.positionId,filledUnits:p.filledUnits??old.report.filledUnits}:p;
        orderAmounts(report);
        this.store.set(key,{...base,report});
      }else{
        if(plan&&(plan.plan.symbol!==p.symbol||plan.plan.side!==p.side))conflict('JOURNAL_PLAN_IDENTITY_MISMATCH');
        const key=this.#key(botId,'position',scopedId(p.positionId)),old=this.#get(key);
        if(old){
          if(old.report.symbol!==p.symbol||old.report.side!==p.side)conflict('JOURNAL_POSITION_IDENTITY_CONFLICT');
          if(old.report.planId!==null&&p.planId!==null&&old.report.planId!==p.planId)conflict('JOURNAL_PLAN_IDENTITY_MISMATCH');
          if(old.sourceTime!==null&&e.sourceTime!==null&&time(e.sourceTime)<time(old.sourceTime))return;
        }
        this.store.set(key,{...base,report:old?{...p,planId:p.planId??old.report.planId}:p});
      }
    }else{
      const key=this.#key(botId,'status',digest(scope.account)),old=this.#get(key);
      if(old&&old.sourceTime!==null&&e.sourceTime!==null&&time(e.sourceTime)<time(old.sourceTime))return;
      this.store.set(key,{...base,report:p});
    }
  }
  accept(input,actor){
    const v=this.#validateBatch(input,actor),p=prefix(v.botId),stateKey=this.#key(v.botId,'stream',v.streamId),bindingKey=p+'binding';
    const savedStream=this.#get(stateKey),stream=this.#stream(savedStream??{streamId:v.streamId,account:v.account,build:v.build,cursor:'0',highWater:'0',stored:0,lastReceivedAt:null,runtimeId:null,coreEpoch:null});
    const hold=this.#get(buildHoldKey(v.botId));if(hold&&(hold.streamId!==v.streamId||canonical(hold.account)!==canonical(v.account)||hold.retiredRuntimeIds.includes(v.runtimeId)))conflict('JOURNAL_TRANSITION_SCOPE');
    const lineage=savedStream?readLineage(this.store,v.botId,stream):null;
    if(canonical(stream.account)!==canonical(v.account)||canonical(stream.build)!==canonical(v.build))conflict('JOURNAL_STREAM_IDENTITY_MISMATCH');
    const binding=this.#binding(this.#get(bindingKey));
    if(binding?.tokenId===actor.id&&canonical(binding.account)!==canonical(v.account))conflict('JOURNAL_ACCOUNT_BOUND');
    const botCount=this.db.prepare('SELECT count(*) AS n FROM kv WHERE key LIKE ?').get(p+'event:%').n;
    if(botCount>0&&!binding)conflict('JOURNAL_STORAGE_INVALID');
    if(!savedStream){
      const sequencePrefix=this.#key(v.botId,'sequence',v.streamId+':');
      if(this.db.prepare('SELECT 1 FROM kv WHERE key>=? AND key<? LIMIT 1').get(sequencePrefix,sequencePrefix+'\uffff'))conflict('JOURNAL_STORAGE_INVALID');
      if(this.db.prepare('SELECT count(*) AS n FROM kv WHERE key LIKE ?').get(p+'stream:%').n>=256)fail('JOURNAL_STREAM_LIMIT','Journalarchiv vor einer weiteren Quelle sichern.',507);
    }
    const savedTotals=this.#get(p+'totals');if(botCount>0&&savedTotals===null)conflict('JOURNAL_STORAGE_INVALID');
    const totals=savedTotals??{eventBytes:0};if(!object(totals)||Object.keys(totals).length!==1||!Number.isSafeInteger(totals.eventBytes)||totals.eventBytes<0||totals.eventBytes>JOURNAL_MAX_STORED_BYTES)conflict('JOURNAL_STORAGE_INVALID');
    let added=0,duplicates=0,addedBytes=0;const prepared=[];
    for(const e of v.events){
      if(BigInt(e.sequence)>BigInt(stream.cursor)+4096n)conflict('JOURNAL_GAP_TOO_LARGE');
      const eventKey=this.#key(v.botId,'event',e.eventId),seqKey=this.#key(v.botId,'sequence',v.streamId+':'+e.sequence),fingerprint=digest({streamId:v.streamId,account:v.account,build:v.build,event:e});
      const old=this.#get(eventKey),oldSeq=this.#get(seqKey);
      if(old){if(old.fingerprint!==fingerprint||oldSeq?.eventId!==e.eventId)conflict('JOURNAL_EVENT_ID_CONFLICT');this.#storedEvent(old);duplicates++;continue;}
      if(oldSeq)conflict('JOURNAL_SEQUENCE_CONFLICT');
      if(BigInt(e.sequence)<=BigInt(stream.cursor))conflict('JOURNAL_CURSOR_CONFLICT');
      prepared.push({eventKey,seqKey,event:e,fingerprint});added++;addedBytes+=Buffer.byteLength(JSON.stringify(e));
    }
    if(botCount+added>JOURNAL_MAX_STORED_EVENTS)fail('JOURNAL_STORAGE_BUDGET','Das Journalbudget ist erreicht. Kritische Belege wurden nicht verworfen.',507);
    if(totals.eventBytes+addedBytes>JOURNAL_MAX_STORED_BYTES)fail('JOURNAL_STORAGE_BUDGET','Das Journalbudget ist erreicht. Kritische Belege wurden nicht verworfen.',507);
    // Empty polls and verified duplicate receipts acknowledge no new evidence.
    // In particular they cannot rebind old telemetry after a token rotation.
    if(added===0)return {accepted:true,stored:0,duplicates,contiguousSequence:stream.cursor,highWaterSequence:stream.highWater,gap:stream.cursor!==stream.highWater,grantsTrading:false};
    const at=this.now();
    this.store.transaction(()=>{
      this.control.assertBridge(actor,v.botId);
      for(const e of prepared){
        this.store.set(e.eventKey,{fingerprint:e.fingerprint,streamId:v.streamId,account:v.account,build:v.build,receivedAt:new Date(at).toISOString(),event:e.event});
        this.store.set(e.seqKey,{eventId:e.event.eventId});
        if(BigInt(e.event.sequence)>BigInt(stream.highWater))stream.highWater=e.event.sequence;
      }
      // A bounded gap prevents unbounded buffering. Cursor includes only the
      // contiguous durable range whose projections committed in this transaction.
      let next=BigInt(stream.cursor)+1n,applied=0;
      while(next<=BigInt(stream.highWater)&&applied<4096){
        const pointer=this.#get(this.#key(v.botId,'sequence',v.streamId+':'+next));if(!pointer)break;
        const saved=this.#storedEvent(this.#get(this.#key(v.botId,'event',pointer.eventId)));
        if(saved.streamId!==v.streamId||saved.event.eventId!==pointer.eventId||saved.event.sequence!==String(next)||canonical(saved.account)!==canonical(stream.account)||canonical(saved.build)!==canonical(buildForSequence(lineage,saved.event.sequence,stream.build)))conflict('JOURNAL_STORAGE_INVALID');
        this.#project(v.botId,stream,saved.event);stream.cursor=String(next++);applied++;
      }
      stream.stored+=added;
      // Replaying a receipt is not proof of a current running engine.
      if(added>0){stream.lastReceivedAt=new Date(at).toISOString();stream.runtimeId=v.runtimeId;stream.coreEpoch=this.epoch;}
      this.store.set(stateKey,stream);
      this.store.set(p+'totals',{eventBytes:totals.eventBytes+addedBytes});
      this.store.set(bindingKey,{tokenId:actor.id,account:v.account,streamId:v.streamId});
      if(added>0&&stream.stored===added)this.store.event('enginejournal.stream_connected',{streamId:v.streamId,independentBrokerProof:false},actor.id,v.botId);
    });
    return {accepted:true,stored:added,duplicates,contiguousSequence:stream.cursor,highWaterSequence:stream.highWater,gap:stream.cursor!==stream.highWater,grantsTrading:false};
  }
  view(botId,actor,{limit=50}={}){integer(limit,100);if(limit<1)invalid();return this.#readView(botId,actor,limit,false);}
  // Used only by the read-only candidate-review worker, not a larger UI page.
  // All stored projections are checked; the worker memory/timeout budget stays
  // bounded. A resource failure rejects the review instead of hiding rows.
  viewForTargetAdmission(botId,actor){this.control.requireHuman(actor);return this.#readView(botId,actor,JOURNAL_MAX_STORED_EVENTS,true);}
  #readView(botId,actor,limit,complete){
    this.control.requireAccess(actor);const bot=this.control.rawBot(botId);this.#assertProfile(bot);
    const p=prefix(botId),binding=this.#binding(this.#get(p+'binding'));
    if(!binding)return {supported:true,available:false,fresh:false,reason:'NO_ENGINE_JOURNAL',plans:[],orders:[],positions:[],status:null,streams:[],writesAllowed:false};
    const where="key LIKE ? AND json_extract(value,'$.account.broker')=? AND json_extract(value,'$.account.id')=? AND json_extract(value,'$.account.environment')=? AND json_extract(value,'$.account.currency')=?";
    const args=type=>[p+type+':%',binding.account.broker,binding.account.id,binding.account.environment,binding.account.currency];
    const rows=(type,max=limit)=>this.db.prepare('SELECT value FROM kv WHERE '+where+' ORDER BY rowid DESC LIMIT ?').all(...args(type),max).map(r=>JSON.parse(r.value));
    const count=type=>this.db.prepare('SELECT count(*) AS n FROM kv WHERE '+where).get(...args(type)).n;
    const allStreams=rows('stream',256).map(s=>this.#stream(s)),streams=complete?allStreams:allStreams.slice(0,32);
    const lineages=new Map(allStreams.map(s=>[s.streamId,readLineage(this.store,botId,s)]));
    const originalBuild=r=>{const saved=this.#storedEvent(this.#get(this.#key(botId,'event',r.eventId)));return saved.build;};
    const current=allStreams.find(s=>s.streamId===binding.streamId),token=this.db.prepare("SELECT 1 FROM tokens WHERE id=? AND bot_id=? AND kind='bridge' AND revoked_at IS NULL").get(binding.tokenId,botId);
    let reason=bot.archived_at!==null?'ARCHIVED':!token?'ACCESS_REVOKED':!current?'JOURNAL_STORAGE_INVALID':current.runtimeId!==bot.runtime_id?'RUNTIME_REPLACED':current.coreEpoch!==this.epoch?'CORE_RESTART_AWAITING_JOURNAL':bot.runtime_status==='fault'?'RUNTIME_FAULT':bot.runtime_status==='conflict'?'RUNTIME_CONFLICT':bot.runtime_status!=='connected'||bot.last_seen===null||this.now()-bot.last_seen>15000?'HEARTBEAT_STALE':!current.lastReceivedAt||this.now()-Date.parse(current.lastReceivedAt)>15000?'JOURNAL_STALE':null;
    if(current&&(this.now()<Date.parse(current.lastReceivedAt)||bot.last_seen!==null&&this.now()<bot.last_seen))reason='CLOCK_CHANGED';
    const perReport=r=>({...r,sourceBuild:originalBuild(r),originalPlanAvailable:r.report.planId!==undefined&&r.report.planId!==null,fresh:reason===null&&r.streamId===current?.streamId&&canonical(originalBuild(r))===canonical(current?.build)&&r.sourceTime!==null&&this.now()>=Date.parse(r.sourceTime)&&this.now()-Date.parse(r.sourceTime)<=15000,ageMilliseconds:r.sourceTime===null?null:Math.max(0,this.now()-Date.parse(r.sourceTime))});
    const plans=rows('plan').map(r=>({...r,sourceBuild:originalBuild(r)})),orders=rows('order').map(perReport),positions=rows('position').map(perReport),statusRaw=rows('status',1)[0]??null,status=statusRaw?perReport(statusRaw):null;
    for(const r of plans)if(r.planHash!==digest(r.plan))conflict('JOURNAL_STORAGE_INVALID');
    const counts={plans:count('plan'),orders:count('order'),positions:count('position'),streams:allStreams.length};
    return {supported:true,available:true,fresh:reason===null,reason,source:'paired_engine_report',independentBrokerProof:false,account:binding.account,
      gap:allStreams.some(s=>s.cursor!==s.highWater),streams:streams.map(s=>({streamId:s.streamId,cursor:s.cursor,highWater:s.highWater,stored:s.stored,lastReceivedAt:s.lastReceivedAt,build:s.build,...(lineages.get(s.streamId)?{buildLineage:lineages.get(s.streamId)}:{})})),
      currentStreamId:current?.streamId??null,lastReceivedAt:current?.lastReceivedAt??null,ageMilliseconds:current?.lastReceivedAt?Math.max(0,this.now()-Date.parse(current.lastReceivedAt)):null,
      plans,orders,positions,status,counts,limit,truncated:counts.plans>limit||counts.orders>limit||counts.positions>limit||allStreams.length>(complete?256:32),
      writesAllowed:false,plansAreExecutionGrants:false};
  }
}
