import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {HUMAN} from './control.mjs';
import {fail} from './errors.mjs';
import {REMOTE20_ORIGIN,REMOTE20_PATH,REMOTE20_INTERVAL,REMOTE20_ROWS,validateRemotePair20,validateRemoteProjection20,sameAccount20} from '../integrations/vercel-view20/lib/projection.mjs';
const KEY='remote-view20:configuration',SLOT='remote-view20:last-slot',SECRET='remote-view20-device-token';
const sha=x=>createHash('sha256').update(x).digest('hex');
const binding=a=>a?{broker:a.broker,id:a.id,environment:a.environment,currency:a.currency}:null;
function snapshot(control,pair,now){
 const bot=control.bot(pair.botId);if(bot.lifecycle?.archived===true||bot.archivedAt)fail('REMOTE_BOT_ARCHIVED','Das gekoppelte Botprofil ist archiviert.',409);
 const base={schemaVersion:1,kind:'th3rev20_readonly',writesAllowed:false,deviceId:pair.deviceId,botId:pair.botId,account:pair.account,slot:String(Math.floor(now/REMOTE20_INTERVAL)),capturedAt:new Date(now).toISOString(),positions:[],orders:[],plans:[],engine:null,truncated:false};
 if(bot.manifest.id==='th3rev.observer.v1'){
  const view=control.observation.view(bot.id,HUMAN),o=view.observation;if(!o||!sameAccount20(pair.account,o.account))fail('REMOTE_ACCOUNT_UNCONFIRMED','Passende Beobachterdaten für dieses Konto fehlen.',409);
  Object.assign(base,{source:{kind:'paired_observer',fresh:view.fresh===true,sourceAt:o.observedAt,reason:view.reason,runtimeId:view.runtimeId,nonAtomic:true},counts:{positions:o.coverage.positionCount,orders:o.coverage.orderCount,plans:0,positionCountIsOpenInventory:true},truncated:!o.coverage.positionsComplete||!o.coverage.ordersComplete||o.positions.length>REMOTE20_ROWS||o.orders.length>REMOTE20_ROWS});
  base.positions=o.positions.slice(0,REMOTE20_ROWS).map(p=>({id:p.id,symbol:p.symbol,side:p.side,entry:p.entry,units:p.units,stop:p.stop,target:p.target,net:p.net,planId:null,exitMode:p.exitMode,sourceAt:o.observedAt}));
  base.orders=o.orders.slice(0,REMOTE20_ROWS).map(p=>({id:p.id,intentId:null,planId:null,positionId:null,symbol:p.symbol,side:p.side,state:'observed_'+p.kind,requestedUnits:p.units,filledUnits:null,remainingUnits:null,sourceAt:o.observedAt}));
 }else if(bot.manifest.id==='th3rev.ready20.v1'){
  const v=control.engineJournal.view(bot.id,HUMAN,{limit:20});if(!v.available||!sameAccount20(pair.account,v.account))fail('REMOTE_ACCOUNT_UNCONFIRMED','Passende Engineberichte für dieses Konto fehlen.',409);
  Object.assign(base,{source:{kind:'paired_engine_report',fresh:v.fresh===true&&v.gap!==true&&v.status?.fresh===true,sourceAt:v.status?.sourceTime??null,reason:v.reason??(v.gap===true?'ENGINE_JOURNAL_GAP':v.status?.fresh?'REPORTS_ARE_NOT_FULL_BROKER_INVENTORY':'ENGINE_STATUS_NOT_CURRENT'),runtimeId:bot.runtimeId??null,nonAtomic:true},counts:{positions:v.counts.positions,orders:v.counts.orders,plans:v.counts.plans,positionCountIsOpenInventory:false},truncated:v.truncated});
  base.positions=v.positions.map(({report:p,sourceTime})=>({id:p.positionId,symbol:p.symbol,side:p.side,entry:p.entry,units:p.units,stop:p.stop,target:p.target,net:p.net,planId:p.planId,exitMode:p.exitMode,sourceAt:sourceTime}));
  const plans=new Map(v.plans.map(r=>[r.plan.planId,r.plan]));
  base.orders=v.orders.map(({report:p,sourceTime})=>({id:p.brokerOrderId,intentId:p.intentId,planId:p.planId,positionId:p.positionId,symbol:plans.get(p.planId)?.symbol??null,side:plans.get(p.planId)?.side??null,state:p.state,requestedUnits:p.requestedUnits,filledUnits:p.filledUnits,remainingUnits:p.remainingUnits,sourceAt:sourceTime}));
  base.plans=v.plans.map(({plan:p})=>({planId:p.planId,symbol:p.symbol,side:p.side,entry:p.entry,stop:p.stop,target:p.target,units:p.units,riskCash:p.riskCash,currency:p.currency,reason:p.reason,createdAt:p.createdAt,validUntil:p.validUntil,maxHoldSeconds:p.exit.maxHoldSeconds,halfLifeSeconds:p.exit.halfLifeSeconds}));
  if(v.status){const p=v.status.report;base.engine={blocked:p.blocked,reason:p.reason,readySymbols:p.readySymbols,totalSymbols:p.totalSymbols,candidateScenarios:p.candidateScenarios,pendingCount:p.pendingCount,positionCount:p.positionCount,reasons:p.decisionReasons.slice(0,REMOTE20_ROWS)};}
 }else fail('REMOTE_PROFILE_UNSUPPORTED','Nur der 2.0-Observer oder die 2.0-Demo-Engine kann gekoppelt werden.',409);
 // Bound cache writes to one 8-KB unit. Counts and truncation remain explicit.
 while(gzipSync(JSON.stringify(base)).length>5600){
  const lists=[base.plans,base.orders,base.positions].sort((a,b)=>b.length-a.length);if(!lists[0].length)fail('REMOTE_COMPACT_LIMIT','Die begrenzte Fernansicht ist zu gross.',413);lists[0].pop();base.truncated=true;
 }
 return validateRemoteProjection20(base,now);
}
export class RemoteView20{
 constructor({control,vault,fetchImpl=fetch,now=Date.now}){this.control=control;this.store=control.store;this.vault=vault;this.fetch=fetchImpl;this.now=now;this.epoch=0;this.flight=null;this.abort=null;this.closed=false;this.lastAck=null;this.lastError=null;this.nextAt=0;}
 status(){const c=this.store.get(KEY);return {supported:true,configured:!!c,enabled:c?.enabled===true,deviceId:c?.deviceId??null,botId:c?.botId??null,account:c?.account??null,origin:REMOTE20_ORIGIN,page:REMOTE20_ORIGIN+'/revolution.html',intervalMilliseconds:REMOTE20_INTERVAL,expiresAt:c?.expiresAt??null,lastAcknowledgedAt:this.lastAck,lastError:this.lastError,writesAllowed:false,storesBrokerCredentials:false,revocationMaximumSeconds:300,maximumRowsPerCategory:REMOTE20_ROWS};}
 pairingRequest(botId,actor){this.control.requireHuman(actor);const bot=this.control.bot(botId);let account;
  if(bot.manifest.id==='th3rev.observer.v1')account=binding(this.control.observation.view(botId,HUMAN).observation?.account);
  else if(bot.manifest.id==='th3rev.ready20.v1')account=binding(this.control.engineJournal.view(botId,HUMAN).account);
  if(!account)fail('REMOTE_ACCOUNT_UNCONFIRMED','Zuerst den passenden 2.0-Bot lokal verbinden und seine Kontodaten empfangen.',409);
  return {botId,account,origin:REMOTE20_ORIGIN,page:REMOTE20_ORIGIN+'/revolution.html',writesAllowed:false};
 }
 async connect(input,actor){
  this.control.requireHuman(actor);if(this.closed)fail('SHUTDOWN','Der lokale Dienst wird beendet.',503);let pair;try{pair=validateRemotePair20(input);}catch{fail('REMOTE_PAIR_INVALID','Die Kopplungsdatei ist ungültig oder gehört nicht zur vorgesehenen Vercel-Seite.');}
  if(Date.parse(pair.expiresAt)<=this.now()||Date.parse(pair.issuedAt)>this.now()+5000)fail('REMOTE_PAIR_EXPIRED','Die Kopplungsdatei ist abgelaufen oder ihre Uhrzeit liegt in der Zukunft.',409);
  snapshot(this.control,pair,this.now());const epoch=++this.epoch;this.abort?.abort();await this.vault.set(SECRET,pair.token);
  if(this.closed||epoch!==this.epoch)fail('REMOTE_CONNECTION_CHANGED','Die Kopplung wurde während des Speicherns geändert.',409);
  const {token,...safe}=pair;this.store.set(KEY,{...safe,enabled:true});this.store.set(SLOT,null);this.lastError=null;this.lastAck=null;this.nextAt=0;
  this.store.event('remoteview.connected',{deviceId:pair.deviceId,botId:pair.botId,readOnly:true},actor.id,pair.botId);return this.status();
 }
 disconnect(actor){
  this.control.requireHuman(actor);++this.epoch;this.abort?.abort();
  // Disable the producer durably before attempting secret-file cleanup. A DPAPI
  // file failure must not keep scheduled exports active after disconnect.
  this.store.transaction(()=>{this.store.set(KEY,null);this.store.set(SLOT,null);});
  this.lastAck=null;this.lastError=null;this.nextAt=0;let secretCleanupPending=false;
  try{this.vault.delete(SECRET);}catch{secretCleanupPending=true;this.lastError='REMOTE_SECRET_CLEANUP_REQUIRED';}
  return {...this.status(),remoteRevocationRequired:true,secretCleanupPending};
 }
 tick(){if(this.closed||this.flight||this.now()<this.nextAt)return this.flight??Promise.resolve();const c=this.store.get(KEY);if(!c?.enabled)return Promise.resolve();const run=this.#send(c);this.flight=run;run.finally(()=>{if(this.flight===run)this.flight=null;}).catch(()=>{});return run;}
 async #send(c){
  const epoch=this.epoch,abort=new AbortController();this.abort=abort;let timer;
  try{
   if(Date.parse(c.expiresAt)<=this.now())fail('REMOTE_PAIR_EXPIRED','Onlinekopplung abgelaufen.',409);
   const token=await this.vault.get(SECRET);if(this.closed||epoch!==this.epoch)return;if(!token)fail('REMOTE_SECRET_UNAVAILABLE','Die geschützten Online-Zugangsdaten fehlen.',409);
   const value=snapshot(this.control,c,this.now()),prior=this.store.get(SLOT);if(prior?.deviceId===c.deviceId&&BigInt(prior.slot)>=BigInt(value.slot)){this.nextAt=(Number(prior.slot)+1)*REMOTE20_INTERVAL;return;}
   // Persist the slot before transmission. A lost reply or Core restart never
   // publishes different contents under the same slot. Next slot is a full view.
   this.store.set(SLOT,{deviceId:c.deviceId,slot:value.slot});const raw=JSON.stringify(value),expected=sha(raw);timer=setTimeout(()=>abort.abort(),8000);
   const response=await this.fetch(REMOTE20_ORIGIN+REMOTE20_PATH+'?action=receive',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:raw,signal:abort.signal,redirect:'error',credentials:'omit'});
   if(this.closed||epoch!==this.epoch)return;if(!response.ok)fail(response.status===401||response.status===403?'REMOTE_ACCESS_DENIED':'REMOTE_SERVER_UNAVAILABLE','Die Onlineübertragung wurde nicht bestätigt.',409);
   const reader=response.body?.getReader();if(!reader)fail('REMOTE_ACK_INVALID','Bestätigung der Onlineübertragung fehlt.',502);let size=0,parts=[];
   for(;;){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>8192){await reader.cancel();fail('REMOTE_ACK_INVALID','Onlinebestätigung ist ungültig.',502);}parts.push(Buffer.from(x.value));}
   const ack=JSON.parse(Buffer.concat(parts).toString('utf8'));if(ack.accepted!==true||ack.grantsTrading!==false||ack.deviceId!==c.deviceId||ack.slot!==value.slot||ack.payloadHash!==expected)fail('REMOTE_ACK_INVALID','Onlinebestätigung passt nicht zum gesendeten Stand.',502);
   if(this.closed||epoch!==this.epoch)return;this.lastAck=new Date(this.now()).toISOString();this.lastError=null;
  }catch(error){if(!this.closed&&epoch===this.epoch)this.lastError=/^[A-Z][A-Z0-9_]{2,70}$/.test(error?.code||'')?error.code:'REMOTE_TRANSPORT_FAILED';}
  finally{clearTimeout(timer);if(this.abort===abort)this.abort=null;if(!this.closed&&epoch===this.epoch)this.nextAt=(Math.floor(this.now()/REMOTE20_INTERVAL)+1)*REMOTE20_INTERVAL;}
 }
 close(){if(!this.closed){this.closed=true;++this.epoch;this.abort?.abort();}return this.flight??Promise.resolve();}
}
