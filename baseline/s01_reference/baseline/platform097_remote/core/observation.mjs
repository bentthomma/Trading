/**
 * Observer ingress. This module records claims from a paired, read-only cBot.
 * It does not validate broker authenticity and never authorises trading.
 * Schema 2 KV storage is deliberately reused: bounded state + one latest
 * observation per profile, not a second database or an unbounded tick journal.
 */
import {randomUUID} from 'node:crypto';
import {fail,object} from './errors.mjs';
import {canonical,digest} from './schema.mjs';

export const OBSERVER_ID='th3rev.observer.v1';
export const OBSERVATION_MAX_BYTES=524288;
export const OBSERVATION_TTL_MS=15000;
const MAX_SEQUENCE=9223372036854775807n;
const stateKey=id=>'observer:v1:state:'+id;
const dataKey=id=>'observer:v1:latest:'+id;
const isObserver=b=>{const m=typeof b.manifest==='string'?JSON.parse(b.manifest):b.manifest;return m?.id===OBSERVER_ID;};
const invalid=(code='OBSERVATION_INVALID')=>fail(code,'Die Beobachtung passt nicht zum lesenden Laufzeitvertrag.',400);
const storageInvalid=()=>fail('OBSERVATION_STORAGE_INVALID','Die gespeicherte Beobachtung ist nicht konsistent. Keine neue Kopplung aus unvollständigen Daten ableiten.',409);
function exact(v,keys){if(!object(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))invalid();}
function text(v,max=100){if(typeof v!=='string'||!v.length||v.length>max||/[\u0000-\u001f\u007f-\u009f]/u.test(v))invalid();return v;}
function ident(v){text(v);if(!/^[A-Za-z0-9_-]+$/.test(v))invalid();return v;}
function decimal(v,{positive=false}={}){
  if(typeof v!=='string'||!/^(-?)(0|[1-9][0-9]{0,23})(?:\.[0-9]{1,18})?$/.test(v))invalid('OBSERVATION_DECIMAL_INVALID');
  const n=scaled(v);if(v.startsWith('-')&&n===0n||positive&&n<=0n)invalid('OBSERVATION_DECIMAL_INVALID');return v;
}
// Exact comparisons only. Values are persisted and exposed as decimal strings.
function scaled(v){const sign=v.startsWith('-')?-1n:1n;const [a,b='']=v.replace(/^-/,'').split('.');return sign*BigInt(a+b.padEnd(18,'0'));}
function timestamp(v){
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v))invalid('OBSERVATION_TIME_INVALID');
  const n=Date.parse(v);if(!Number.isFinite(n)||new Date(n).toISOString()!==v)invalid('OBSERVATION_TIME_INVALID');return n;
}
function optionalPrice(v){if(v!==null)decimal(v,{positive:true});}
function rows(v,max,check){if(!Array.isArray(v)||v.length>max)invalid('OBSERVATION_LIMIT');const seen=new Set();for(const x of v){check(x);if(seen.has(x.id))invalid('OBSERVATION_DUPLICATE_ID');seen.add(x.id);}}
function direction(v){if(!['buy','sell'].includes(v))invalid();}

export function validateObservation(v,now){
  if(!object(v))invalid();
  if(Buffer.byteLength(JSON.stringify(v),'utf8')>OBSERVATION_MAX_BYTES)invalid('OBSERVATION_LIMIT');
  exact(v,['schemaVersion','botId','runtimeId','bootId','account','build','sequence','captureStartedAt','observedAt','actualRevision','mode','writesAllowed','nonAtomicSnapshot','coverage','positions','orders','symbols']);
  if(v.schemaVersion!==1||v.mode!=='observer'||v.writesAllowed!==false||v.nonAtomicSnapshot!==true||v.actualRevision!==0)invalid('OBSERVER_READ_ONLY');
  ident(v.botId);ident(v.runtimeId);ident(v.bootId);
  // The alpha.3 sender uses a unique startup UUID for both fields.
  if(v.bootId!==v.runtimeId)invalid('OBSERVATION_BOOT_MISMATCH');
  if(typeof v.sequence!=='string'||!/^[1-9][0-9]{0,18}$/.test(v.sequence)||BigInt(v.sequence)>MAX_SEQUENCE)invalid('OBSERVATION_SEQUENCE_INVALID');
  const start=timestamp(v.captureStartedAt),observed=timestamp(v.observedAt);
  if(start>observed||observed-start>10000||observed>now+5000||now-observed>120000)invalid('OBSERVATION_TIME_INVALID');
  exact(v.account,['broker','id','environment','type','currency','equity','balance']);
  text(v.account.broker);text(v.account.id);text(v.account.currency,12);
  if(v.account.environment!=='demo'||v.account.type!=='hedged'||! /^[A-Z0-9]{3,12}$/.test(v.account.currency))invalid('OBSERVATION_ACCOUNT_INVALID');
  decimal(v.account.equity);decimal(v.account.balance);
  exact(v.build,['engine','version','sourceHash']);text(v.build.engine);text(v.build.version,50);
  if(v.build.engine!=='Th3RevolutionObserver20'||!/^2\.0\.0-alpha\.[1-9][0-9]*$/.test(v.build.version)||typeof v.build.sourceHash!=='string'||! /^[a-f0-9]{64}$/.test(v.build.sourceHash))invalid('OBSERVATION_BUILD_INVALID');
  rows(v.positions,250,p=>{
    exact(p,['id','symbol','side','entry','units','stop','target','net','entryAt','planId','exitMode']);
    ident(p.id);text(p.symbol);direction(p.side);decimal(p.entry,{positive:true});decimal(p.units,{positive:true});optionalPrice(p.stop);optionalPrice(p.target);decimal(p.net);
    if(timestamp(p.entryAt)>observed+5000||p.planId!==null||p.exitMode!=='observed_only')invalid('OBSERVATION_PLAN_UNSUPPORTED');
  });
  rows(v.orders,250,p=>{
    exact(p,['id','symbol','side','kind','entry','units','stop','target','expiresAt','planId']);
    ident(p.id);text(p.symbol);direction(p.side);if(!['limit','stop','stopLimit','unknown'].includes(p.kind))invalid();
    decimal(p.entry,{positive:true});decimal(p.units,{positive:true});optionalPrice(p.stop);optionalPrice(p.target);if(p.expiresAt!==null)timestamp(p.expiresAt);if(p.planId!==null)invalid('OBSERVATION_PLAN_UNSUPPORTED');
  });
  rows(v.symbols,256,s=>{
    exact(s,['id','marketOpen','quoteAt','bid','ask','nextCloseAt']);text(s.id);
    if(![true,false,null].includes(s.marketOpen)||(s.bid===null)!==(s.ask===null))invalid();
    optionalPrice(s.bid);optionalPrice(s.ask);
    if(s.bid!==null&&scaled(s.bid)>scaled(s.ask))invalid('OBSERVATION_CROSSED_QUOTE');
    if(s.quoteAt!==null&&(timestamp(s.quoteAt)>observed+5000||s.bid===null))invalid('OBSERVATION_TIME_INVALID');
    if(s.nextCloseAt!==null)timestamp(s.nextCloseAt);
  });
  exact(v.coverage,['positionsComplete','ordersComplete','symbolsComplete','historyComplete','positionCount','orderCount','symbolCount']);
  if(v.coverage.historyComplete!==false)invalid('OBSERVATION_HISTORY_UNSUPPORTED');
  for(const [name,count,items] of [['positionsComplete','positionCount',v.positions],['ordersComplete','orderCount',v.orders],['symbolsComplete','symbolCount',v.symbols]]){
    const n=v.coverage[count];if(!Number.isSafeInteger(n)||n<items.length||n>100000||typeof v.coverage[name]!=='boolean'||v.coverage[name]!== (n===items.length))invalid('OBSERVATION_COVERAGE_INVALID');
  }
  const symbols=new Set(v.symbols.map(s=>s.id));
  if(v.coverage.symbolsComplete&&[...v.positions,...v.orders].some(p=>!symbols.has(p.symbol)))invalid('OBSERVATION_SYMBOL_COVERAGE');
  // A newly parsed copy prevents a caller mutating data after validation.
  return JSON.parse(JSON.stringify(v));
}

export class ObservationService {
  constructor(control){this.control=control;this.store=control.store;this.db=control.db;this.now=control.now;this.epoch=randomUUID();this.rates=new Map();}
  #state(botId){
    try{
      const s=this.store.get(stateKey(botId),{tokenId:null,activeRuntime:null,retired:[],binding:null,latest:null,accepted:0});
      exact(s,['tokenId','activeRuntime','retired','binding','latest','accepted']);
      if(Buffer.byteLength(JSON.stringify(s))>131072||!Number.isSafeInteger(s.accepted)||s.accepted<0||!Array.isArray(s.retired)||s.retired.length>256||new Set(s.retired).size!==s.retired.length)storageInvalid();
      for(const id of [s.tokenId,s.activeRuntime])if(id!==null)ident(id);for(const id of s.retired)ident(id);
      if(s.activeRuntime!==null&&s.retired.includes(s.activeRuntime))storageInvalid();
      if(s.binding!==null){exact(s.binding,['broker','id','environment','type','currency']);text(s.binding.broker);text(s.binding.id);text(s.binding.currency,12);if(s.binding.environment!=='demo'||s.binding.type!=='hedged')storageInvalid();}
      if(s.latest!==null){
        const m=s.latest;exact(m,['hash','sequence','runtimeId','bootId','tokenId','coreEpoch','observedAt','receivedAt','coverage','account','build']);
        if(typeof m.hash!=='string'||! /^[a-f0-9]{64}$/.test(m.hash)||typeof m.sequence!=='string'||! /^[1-9][0-9]{0,18}$/.test(m.sequence)||BigInt(m.sequence)>MAX_SEQUENCE||!Number.isSafeInteger(m.receivedAt)||m.receivedAt<0||m.receivedAt>8640000000000000)storageInvalid();
        for(const id of [m.runtimeId,m.bootId,m.tokenId,m.coreEpoch])ident(id);timestamp(m.observedAt);if(m.runtimeId!==m.bootId)storageInvalid();
        exact(m.coverage,['positionsComplete','ordersComplete','symbolsComplete','historyComplete','positionCount','orderCount','symbolCount']);
        if(m.coverage.historyComplete!==false||['positionsComplete','ordersComplete','symbolsComplete'].some(k=>typeof m.coverage[k]!=='boolean')||['positionCount','orderCount','symbolCount'].some(k=>!Number.isSafeInteger(m.coverage[k])||m.coverage[k]<0||m.coverage[k]>100000))storageInvalid();
        exact(m.account,['broker','id','environment','type','currency']);text(m.account.broker);text(m.account.id);text(m.account.currency,12);if(m.account.environment!=='demo'||m.account.type!=='hedged')storageInvalid();
        exact(m.build,['engine','version','sourceHash']);text(m.build.engine);text(m.build.version,50);if(typeof m.build.sourceHash!=='string'||! /^[a-f0-9]{64}$/.test(m.build.sourceHash))storageInvalid();
      }
      return s;
    }catch{storageInvalid();}
  }
  #errorStatus(){return {supported:true,available:false,status:'error',fresh:false,reason:'OBSERVATION_STORAGE_INVALID',writesAllowed:false,source:'paired_observer',brokerIndependentlyVerified:false,nonAtomicSnapshot:true,originalPlansAvailable:false,historyAvailable:false};}
  #verifiedStored(botId,m){
    try{
      const value=this.store.get(dataKey(botId));
      // Validate structure at its own observation time: old data stays readable,
      // but its freshness is always decided separately against the current clock.
      const v=validateObservation(value,Date.parse(m.observedAt));
      const account={broker:v.account.broker,id:v.account.id,environment:v.account.environment,type:v.account.type,currency:v.account.currency};
      if(v.botId!==botId||v.runtimeId!==m.runtimeId||v.sequence!==m.sequence||digest(v)!==m.hash||canonical(v.coverage)!==canonical(m.coverage)||canonical(v.build)!==canonical(m.build)||canonical(account)!==canonical(m.account))storageInvalid();
      return v;
    }catch{storageInvalid();}
  }
  #save(botId,s){this.store.set(stateKey(botId),s);}
  #profile(b){
    const m=JSON.parse(b.manifest);
    if(!isObserver(b)||m.version!=='1.0.0'||m.capabilities.liveConfiguration!==false||m.capabilities.telemetry!==true||m.parameters.length!==0)fail('OBSERVATION_PROFILE_REQUIRED','Dieses Profil besitzt keinen passenden lesenden Beobachtervertrag.',409);
  }
  beforeHeartbeat(input,actor,b){
    if(!isObserver(b))return;
    this.#profile(b);
    if(input.environment!=='demo'||input.actualRevision!==0||input.blocked!==true||!object(input.values)||Object.keys(input.values).length)invalid('OBSERVER_READ_ONLY');
    ident(input.runtimeId);const s=this.#state(b.id);
    if(s.tokenId===actor.id){
      if(s.retired.includes(input.runtimeId))fail('OBSERVER_RETIRED_RUNTIME','Diese frühere Beobachterinstanz wurde ersetzt.',409);
      if(s.binding&&s.binding.id!==input.accountId)fail('OBSERVER_ACCOUNT_BOUND','Der Beobachterzugang ist an ein anderes Konto gebunden. Für einen Kontowechsel neu koppeln.',409);
      if(s.activeRuntime!==null&&s.activeRuntime!==input.runtimeId&&s.retired.length>=256)fail('OBSERVER_REPAIR_REQUIRED','Zu viele Instanzwechsel. Beobachterzugang neu koppeln.',409);
    }
  }
  // Called inside the existing Control heartbeat transaction, after validation.
  committedHeartbeat(input,actor,b){
    if(!isObserver(b))return;
    let s=this.#state(b.id);
    if(s.tokenId!==actor.id)s={tokenId:actor.id,activeRuntime:null,retired:[],binding:null,latest:s.latest,accepted:s.accepted};
    if(s.activeRuntime&&s.activeRuntime!==input.runtimeId)s.retired.push(s.activeRuntime);
    s.activeRuntime=input.runtimeId;this.#save(b.id,s);
  }
  accept(input,actor){
    this.control.assertBridge(actor,input?.botId);const b=this.control.rawBot(input.botId);this.#profile(b);
    const v=validateObservation(input,this.now());const s=this.#state(b.id);
    if(b.runtime_id!==v.runtimeId||s.activeRuntime!==v.runtimeId||s.tokenId!==actor.id||b.account_id!==v.account.id||b.environment!==v.account.environment)fail('OBSERVATION_RUNTIME_MISMATCH','Die Beobachtung gehört nicht zur aktuell gekoppelten Laufzeit.',409);
    if(b.last_seen===null||this.now()-b.last_seen>OBSERVATION_TTL_MS||this.now()<b.last_seen||b.runtime_status!=='connected'||b.runtime_blocked!==1)fail('OBSERVATION_HEARTBEAT_REQUIRED','Eine aktuelle lesende Laufzeitbestätigung fehlt.',409);
    const binding={broker:v.account.broker,id:v.account.id,environment:v.account.environment,type:v.account.type,currency:v.account.currency};
    if(s.binding&&canonical(s.binding)!==canonical(binding))fail('OBSERVER_ACCOUNT_BOUND','Kontodaten widersprechen der gekoppelten Identität.',409);
    const hash=digest(v),last=s.latest;
    const comparable=last&&last.runtimeId===v.runtimeId&&last.tokenId===actor.id;
    if(comparable){
      if(canonical(v.build)!==canonical(last.build))fail('OBSERVATION_BUILD_CHANGED','Der Build derselben Laufzeit hat sich verändert. Instanz neu verbinden.',409);
      if(BigInt(v.sequence)<BigInt(last.sequence))fail('OBSERVATION_SEQUENCE_REPLAY','Die Beobachtung ist älter als der bestätigte Stand.',409);
      if(v.sequence===last.sequence){
        if(hash!==last.hash)fail('OBSERVATION_SEQUENCE_CONFLICT','Gleiche Sequenz mit abweichendem Inhalt.',409);
        this.#verifiedStored(b.id,last);
        // Never refresh freshness or core epoch just by replaying an old receipt.
        return {accepted:true,sequence:v.sequence,duplicate:true,grantsTrading:false};
      }
      if(Date.parse(v.observedAt)<Date.parse(last.observedAt))fail('OBSERVATION_TIME_REGRESSION','Die Beobachtungszeit ist zurückgesprungen. Instanz und Uhr prüfen.',409);
    }
    const at=this.now();let rate=this.rates.get(b.id);
    if(!rate||at<rate.from||at-rate.from>=1000)rate={from:at,count:0};
    if(rate.count>=8)fail('OBSERVATION_RATE_LIMIT','Beobachtungen werden zu häufig gesendet.',429);
    rate.count++;if(!this.rates.has(b.id)&&this.rates.size>=256)this.rates.delete(this.rates.keys().next().value);this.rates.set(b.id,rate);
    const meta={hash,sequence:v.sequence,runtimeId:v.runtimeId,bootId:v.bootId,tokenId:actor.id,coreEpoch:this.epoch,observedAt:v.observedAt,receivedAt:at,coverage:v.coverage,account:binding,build:v.build};
    this.store.transaction(()=>{
      this.control.assertBridge(actor,b.id);
      this.store.set(dataKey(b.id),v);
      this.#save(b.id,{...s,binding,latest:meta,accepted:Math.min(Number.MAX_SAFE_INTEGER,(s.accepted||0)+1)});
      if(!last||last.runtimeId!==v.runtimeId||last.tokenId!==actor.id||last.coreEpoch!==this.epoch)this.store.event('observer.observation_connected',{schemaVersion:1,mode:'observer',writesAllowed:false},actor.id,b.id);
    });
    return {accepted:true,sequence:v.sequence,duplicate:false,grantsTrading:false};
  }
  status(raw){
    const b=typeof raw==='string'?this.control.rawBot(raw):raw;
    if(!isObserver(b))return {supported:false,available:false,status:'unsupported',fresh:false,writesAllowed:false};
    let s;try{s=this.#state(b.id);}catch{return this.#errorStatus();}
    const m=s.latest;let reason=null;
    if(m){try{this.#verifiedStored(b.id,m);}catch{return this.#errorStatus();}}
    if(b.archived_at!==null)reason='ARCHIVED';
    else if(!m)reason='NO_OBSERVATION';
    else if(!this.db.prepare("SELECT 1 FROM tokens WHERE id=? AND bot_id=? AND revoked_at IS NULL AND kind='bridge'").get(m.tokenId,b.id))reason='ACCESS_REVOKED';
    else if(m.runtimeId!==b.runtime_id||m.runtimeId!==s.activeRuntime||m.tokenId!==s.tokenId)reason='RUNTIME_REPLACED';
    else if(m.coreEpoch!==this.epoch)reason='CORE_RESTART_AWAITING_OBSERVATION';
    else if(this.now()<m.receivedAt||this.now()+5000<Date.parse(m.observedAt))reason='CLOCK_CHANGED';
    else if(b.last_seen===null||this.now()-b.last_seen>OBSERVATION_TTL_MS||this.now()<b.last_seen||b.runtime_status!=='connected')reason='HEARTBEAT_STALE';
    else if(this.now()-m.receivedAt>OBSERVATION_TTL_MS||this.now()-Date.parse(m.observedAt)>OBSERVATION_TTL_MS)reason='OBSERVATION_STALE';
    const partial=!!m&&(!m.coverage.positionsComplete||!m.coverage.ordersComplete||!m.coverage.symbolsComplete);
    return {supported:true,available:!!m,status:reason?(reason==='NO_OBSERVATION'?'waiting':'stale'):partial?'partial':'fresh',fresh:!reason,reason,
      observedAt:m?.observedAt??null,receivedAt:m?new Date(m.receivedAt).toISOString():null,ageMilliseconds:m?Math.max(0,this.now()-Date.parse(m.observedAt)):null,
      runtimeId:m?.runtimeId??null,sequence:m?.sequence??null,coverage:m?.coverage??null,build:m?.build??null,
      brokerIndependentlyVerified:false,source:'paired_observer',nonAtomicSnapshot:true,historyAvailable:false,originalPlansAvailable:false,writesAllowed:false};
  }
  view(botId,actor){
    this.control.requireAccess(actor);const status=this.status(botId);
    if(!status.available)return {...status,observation:null};
    try{return {...status,observation:this.#verifiedStored(botId,this.#state(botId).latest)};}
    catch{return {...this.#errorStatus(),observation:null};}
  }
}
