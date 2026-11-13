/** Human-confirmed Core journal build ingress transition, not an execution
 * handover. It fences old access and keeps the successor ENTRY-BLOCKED. */
import {randomUUID} from 'node:crypto';
import {backup} from 'node:sqlite';
import {Worker} from 'node:worker_threads';
import {mkdtempSync,rmSync,chmodSync,realpathSync,lstatSync} from 'node:fs';
import {join,resolve,isAbsolute} from 'node:path';
import {fail,object,HubError} from './errors.mjs';
import {canonical,digest} from './schema.mjs';
import {archiveWorkerExecArgv} from './journal-archives.mjs';
import {coreBuildContext} from './core-build-context.mjs';
import {LINEAGE_FORMAT,BUILD_TRANSITION_SAFETY,lineageKey,buildHoldKey,validateLineage,transitionHash,namedId,hashString,isoTime,buildEntryBlocker} from './journal-build-lineage.mjs';
const jobKey=id=>'corebuild:v1:review:'+id;
const denied=(code,status=409)=>fail(code,'Der Core-Buildübergang ist nicht bestätigt. Es wurden keine Handelsrechte erteilt.',status);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
export const BUILD_REVIEW_TTL_MS=300000;
export class CoreBuildTransitions {
 constructor(control,{assertAvailable=()=>{}}={}){this.control=control;this.store=control.store;this.db=control.db;this.now=control.now;this.assertAvailable=assertAvailable;this.closed=false;this.workers=new Set();this.flight=null;}
 #available(){if(this.closed)denied('BUILD_TRANSITION_CLOSED',503);this.assertAvailable();}
 #human(actor){this.#available();this.control.requireHuman(actor);}
 #read(id){let v;try{v=this.store.get(jobKey(id));}catch{denied('BUILD_REVIEW_STORAGE_INVALID');}if(v===null)return null;
  if(!object(v)||Object.keys(v).sort().join(',')!==['schema','reviewId','botId','status','createdAt','expiresAt','reviewDigest','review','receipt'].sort().join(',')||v.schema!==1||v.reviewId!==id||!uuid(id)||!namedId(v.botId)||!['reviewed','confirmed'].includes(v.status)||!isoTime(v.createdAt)||!isoTime(v.expiresAt)||Date.parse(v.expiresAt)-Date.parse(v.createdAt)!==BUILD_REVIEW_TTL_MS||!hashString(v.reviewDigest)||!object(v.review)||v.reviewDigest!==digest(v.review))denied('BUILD_REVIEW_STORAGE_INVALID');
  if(v.status==='reviewed'&&v.receipt!==null||v.status==='confirmed'&&(!object(v.receipt)||v.receipt.transitionId!==id||canonical(v.receipt.safety)!==canonical(BUILD_TRANSITION_SAFETY)||v.receipt.receiptHash!==transitionHash(v.receipt)))denied('BUILD_REVIEW_STORAGE_INVALID');return v;
 }
 #worker(job){return new Promise((yes,no)=>{
  const argv=archiveWorkerExecArgv(process.execArgv),options=argv.length===process.execArgv.length?{}:{execArgv:argv};const worker=new Worker(new URL('./build-transition-worker.mjs',import.meta.url),{workerData:job,...options,resourceLimits:{maxOldGenerationSizeMb:384}});this.workers.add(worker);let answered=false;
  const timeout=setTimeout(()=>{worker.terminate();no(Object.assign(Error(),{code:'BUILD_TRANSITION_TIMEOUT'}));},120000);timeout.unref();
  worker.once('message',m=>{answered=true;clearTimeout(timeout);if(m?.ok===true&&object(m.result))yes(m.result);else no(Object.assign(Error(),{code:m?.code??'BUILD_TRANSITION_WORKER_FAILED'}));});worker.once('error',e=>{clearTimeout(timeout);no(e)});worker.once('exit',()=>{this.workers.delete(worker);clearTimeout(timeout);if(!answered)no(Object.assign(Error(),{code:'BUILD_TRANSITION_WORKER_EXIT'}))});
 });}
 async #inspect(botId,stageDirectory,actor,assertActor){
  this.#human(actor);assertActor();if(typeof stageDirectory!=='string'||!isAbsolute(stageDirectory)||stageDirectory.length>4096)denied('BUILD_STAGE_PATH_INVALID',400);
  const parent=realpathSync(this.store.directory),stage=mkdtempSync(join(parent,'.build-review-'));
  try{const st=lstatSync(stage);if(!st.isDirectory()||st.isSymbolicLink())denied('BUILD_SNAPSHOT_PATH_INVALID');if(process.platform!=='win32')chmodSync(stage,0o700);const databasePath=join(stage,'snapshot.sqlite');await backup(this.db,databasePath);this.#human(actor);assertActor();if(process.platform!=='win32')chmodSync(databasePath,0o600);
   const checked=await this.#worker({botId,stageDirectory:resolve(stageDirectory),databasePath,now:this.now()});this.#human(actor);assertActor();
   if(checked.evidenceDigest!==digest(checked.evidence)||coreBuildContext(this.control,botId,checked.evidence).digest!==checked.coreDigest)denied('BUILD_REVIEW_CHANGED');return checked;
  }catch(e){if(e instanceof HubError)throw e;fail(typeof e.code==='string'&&/^[A-Z0-9_]{1,100}$/.test(e.code)?e.code:'BUILD_TRANSITION_FAILED','Dateien oder Corezustand konnten nicht bestätigt werden. Keine Handelsfreigabe.',409);}
  finally{rmSync(stage,{recursive:true,force:true});}
 }
 #single(key,operation){this.#available();if(this.flight){if(this.flight.key===key)return this.flight.promise;denied('BUILD_TRANSITION_BUSY');}const promise=operation().finally(()=>{if(this.flight?.key===key)this.flight=null;});this.flight={key,promise};return promise;}
 preview(botId,input,actor,{assertActor=()=>{}}={}){
  this.#human(actor);if(!object(input)||Object.keys(input).length!==1||typeof input.stageDirectory!=='string')denied('BUILD_REVIEW_INPUT_INVALID',400);
  return this.#single('preview:'+botId+':'+digest(input),async()=>{
   const checked=await this.#inspect(botId,input.stageDirectory,actor,assertActor),now=this.now();
   const review={format:'th3.core-build-transition.review/1',botId,streamId:checked.evidence.scope.streamId,account:checked.evidence.scope.account,fromBuild:checked.evidence.source.build,toBuild:checked.evidence.target.build,afterSequence:checked.evidence.state.acknowledgedSequence,sourceRuntimeId:checked.sourceRuntimeId,evidence:checked.evidence,evidenceDigest:checked.evidenceDigest,coreDigest:checked.coreDigest,safety:BUILD_TRANSITION_SAFETY};
   const hash=digest(review),keys=this.db.prepare('SELECT key FROM kv WHERE key>=? AND key<? ORDER BY rowid DESC').all('corebuild:v1:review:','corebuild:v1:review:\uffff');
   for(const {key}of keys){const old=this.#read(key.slice('corebuild:v1:review:'.length));if(old?.botId===botId&&old.status==='reviewed'&&old.reviewDigest===hash&&Date.parse(old.expiresAt)>now)return{...old,grantsTrading:false,reused:true};}
   if(keys.length>=128)denied('BUILD_REVIEW_BUDGET',507);const reviewId=randomUUID(),job={schema:1,reviewId,botId,status:'reviewed',createdAt:new Date(now).toISOString(),expiresAt:new Date(now+BUILD_REVIEW_TTL_MS).toISOString(),reviewDigest:hash,review,receipt:null};
   this.store.transaction(()=>{this.#human(actor);assertActor();if(coreBuildContext(this.control,botId,checked.evidence).digest!==checked.coreDigest)denied('BUILD_REVIEW_CHANGED');this.store.set(jobKey(reviewId),job);this.store.event('journal.build_transition_reviewed',{reviewId,fromBuild:review.fromBuild,toBuild:review.toBuild,afterSequence:review.afterSequence,grantsTrading:false},actor.id,botId);});return{...job,grantsTrading:false,reused:false};
  });
 }
 confirm(botId,input,actor,{assertActor=()=>{}}={}){
  this.#human(actor);if(!object(input)||Object.keys(input).length!==3||!uuid(input.reviewId)||!hashString(input.reviewDigest)||input.confirmJournalBuildTransition!==true)denied('BUILD_CONFIRMATION_REQUIRED',400);
  return this.#single('confirm:'+botId+':'+digest(input),async()=>{
   let job=this.#read(input.reviewId);if(!job||job.botId!==botId||job.reviewDigest!==input.reviewDigest)denied('BUILD_REVIEW_NOT_FOUND');
   const replay=()=>{const lineage=validateLineage(this.store.get(lineageKey(botId,job.review.streamId)),{botId,streamId:job.review.streamId,account:job.review.account});const recorded=lineage.transitions.find(x=>x.transitionId===job.reviewId);if(canonical(recorded)!==canonical(job.receipt))denied('BUILD_RECEIPT_LINEAGE_MISMATCH');return{confirmed:true,duplicate:true,receipt:job.receipt,grantsTrading:false,requiresNewPairing:true,requiresNativeWriterHandover:true};};
   if(job.status==='confirmed'){this.#human(actor);assertActor();return replay();}
   if(this.now()<Date.parse(job.createdAt)||this.now()>=Date.parse(job.expiresAt))denied('BUILD_REVIEW_EXPIRED');
   const checked=await this.#inspect(botId,job.review.evidence.stageDirectory,actor,assertActor);
   if(checked.evidenceDigest!==job.review.evidenceDigest||checked.coreDigest!==job.review.coreDigest)denied('BUILD_REVIEW_CHANGED');
   return this.store.transaction(()=>{
    this.#human(actor);assertActor();job=this.#read(input.reviewId);if(job.status==='confirmed')return replay();
    if(this.now()<Date.parse(job.createdAt)||this.now()>=Date.parse(job.expiresAt))denied('BUILD_REVIEW_EXPIRED');
    if(coreBuildContext(this.control,botId,checked.evidence).digest!==job.review.coreDigest)denied('BUILD_REVIEW_CHANGED');
    const r=job.review,key=lineageKey(botId,r.streamId),old=this.store.get(key),prior=old?validateLineage(old,{botId,streamId:r.streamId,account:r.account,build:r.fromBuild,cursor:r.afterSequence}):null;
    const receipt={transitionId:job.reviewId,fromBuild:r.fromBuild,toBuild:r.toBuild,afterSequence:r.afterSequence,confirmedAt:new Date(this.now()).toISOString(),sourceRuntimeId:r.sourceRuntimeId,evidenceDigest:r.evidenceDigest,previousHash:prior?.transitions.at(-1).receiptHash??'0'.repeat(64),safety:BUILD_TRANSITION_SAFETY};receipt.receiptHash=transitionHash(receipt);
    const lineage={format:LINEAGE_FORMAT,botId,streamId:r.streamId,account:r.account,originBuild:prior?.originBuild??r.fromBuild,transitions:[...(prior?.transitions??[]),receipt]};validateLineage(lineage,{botId,streamId:r.streamId,account:r.account,build:r.toBuild,cursor:r.afterSequence});
    const sk='enginejournal:v1:'+botId+':stream:'+r.streamId,stream=this.store.get(sk);
    this.store.set(key,lineage);this.store.set(sk,{...stream,build:r.toBuild,coreEpoch:null});
    this.store.set(buildHoldKey(botId),{schema:1,botId,streamId:r.streamId,account:r.account,transitionId:receipt.transitionId,receiptHash:receipt.receiptHash,retiredRuntimeIds:lineage.transitions.map(x=>x.sourceRuntimeId),requiresNativeWriterHandover:true});
    this.db.prepare("UPDATE tokens SET revoked_at=? WHERE bot_id=? AND kind='bridge' AND revoked_at IS NULL").run(this.now(),botId);this.control.revokeRuntimeGrant(botId);
    this.db.prepare("UPDATE bots SET runtime_id=NULL,last_seen=NULL,sequence=-1,runtime_status='disconnected',runtime_blocked=1 WHERE id=?").run(botId);
    this.store.set(jobKey(job.reviewId),{...job,status:'confirmed',receipt});this.store.event('journal.build_transition_confirmed',{reviewId:job.reviewId,streamId:r.streamId,afterSequence:r.afterSequence,receiptHash:receipt.receiptHash,sourceBuild:r.fromBuild,targetBuild:r.toBuild,oldAccessRevoked:true,...BUILD_TRANSITION_SAFETY},actor.id,botId);
    return{confirmed:true,duplicate:false,receipt,grantsTrading:false,requiresNewPairing:true,requiresNativeWriterHandover:true};
   });
  });
 }
 /** Read-only export of a confirmed, still-held transition. This is a local
  * evidence snapshot, not a signed permit, native activation or entry grant. */
 nativeContext(botId,reviewId,actor){
  this.#human(actor);if(!uuid(reviewId))denied('BUILD_REVIEW_NOT_FOUND',404);
  const job=this.#read(reviewId);if(!job||job.botId!==botId||job.status!=='confirmed')denied('BUILD_CONFIRMED_CONTEXT_REQUIRED');
  const r=job.review,bot=this.control.rawBot(botId),key=lineageKey(botId,r.streamId);
  const lineage=validateLineage(this.store.get(key),{botId,streamId:r.streamId,account:r.account,build:r.toBuild,cursor:r.afterSequence});
  if(canonical(lineage.transitions.at(-1))!==canonical(job.receipt)||buildEntryBlocker(this.store,botId)!=='BUILD_TRANSITION_REQUIRES_HANDOVER')denied('BUILD_HANDOVER_HOLD_REQUIRED');
  if(bot.archived_at!==null||bot.runtime_id!==null||bot.last_seen!==null||bot.runtime_status!=='disconnected'||bot.runtime_blocked!==1)denied('NATIVE_INSTALL_RUNTIME_NOT_QUIESCENT');
  const stream=this.store.get('enginejournal:v1:'+botId+':stream:'+r.streamId);
  if(!stream||stream.cursor!==r.afterSequence||stream.highWater!==r.afterSequence||canonical(stream.build)!==canonical(r.toBuild)||BigInt(stream.stored)!==BigInt(r.afterSequence))denied('NATIVE_INSTALL_STREAM_ADVANCED');
  const activeToken=this.db.prepare("SELECT 1 FROM tokens WHERE bot_id=? AND kind='bridge' AND revoked_at IS NULL LIMIT 1").get(botId);
  if(activeToken)denied('NATIVE_INSTALL_PAIRING_ALREADY_ISSUED');
  const policy=this.store.get('policy'),grants=object(policy)&&policy.blocked===true&&policy.grants===undefined?[]:policy?.grants;if(!object(policy)||typeof policy.blocked!=='boolean'||!Array.isArray(grants)||grants.some(x=>!object(x)||x.botId===botId||(x.accountId===r.account.id&&x.environment===r.account.environment)))denied('NATIVE_INSTALL_GRANT_PRESENT');
  const unresolved=this.db.prepare("SELECT 1 FROM proposals WHERE bot_id=? AND (status IN ('pending','proposed') OR (status='timed_out' AND delivered_at IS NOT NULL AND reason IS NOT 'BOT_ARCHIVED' AND reason IS NOT 'FULL_RESTORE')) LIMIT 1").get(botId);if(unresolved)denied('BUILD_CONFIGURATION_UNRESOLVED');
  const now=this.now(),hold=this.store.get(buildHoldKey(botId));
  const context={format:'th3.core-native-install.snapshot/1',exportedAt:new Date(now).toISOString(),expiresAt:new Date(now+BUILD_REVIEW_TTL_MS).toISOString(),reviewId:job.reviewId,reviewDigest:job.reviewDigest,review:r,receipt:job.receipt,hold,safety:{grantsTrading:false,liveCoreCheckedByNative:false,targetBinaryVerified:false,brokerStateVerified:false,writerHandoverVerified:false,requiresSeparateNativeConsent:true,entryHoldStillRequired:true}};
  return {format:'th3.native-journal-install.context/1',contextDigest:digest(context),context};
 }
 list(botId,actor){this.#human(actor);this.control.rawBot(botId);const rows=this.db.prepare('SELECT key FROM kv WHERE key>=? AND key<? ORDER BY rowid DESC').all('corebuild:v1:review:','corebuild:v1:review:\uffff');return{botId,items:rows.map(x=>this.#read(x.key.slice('corebuild:v1:review:'.length))).filter(x=>x.botId===botId),grantsTrading:false};}
 async drain(){await Promise.allSettled([...this.workers].map(w=>w.terminate()));if(this.flight)await Promise.allSettled([this.flight.promise]);}
 async close(){this.closed=true;await this.drain();}
}
