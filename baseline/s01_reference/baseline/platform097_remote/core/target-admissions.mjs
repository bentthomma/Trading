/** Records a human-reviewed, still BLOCKED target candidate. There is no
 * activation command, writer grant, process launch or broker write here. */
import {randomUUID} from 'node:crypto';
import {backup} from 'node:sqlite';
import {Worker} from 'node:worker_threads';
import {mkdtempSync,rmSync,chmodSync,realpathSync} from 'node:fs';
import {join,isAbsolute} from 'node:path';
import {fail,object,HubError} from './errors.mjs';
import {canonical,digest} from './schema.mjs';
import {captureTargetAdmission} from './target-admission-context.mjs';
import {TARGET_EVIDENCE_SAFETY} from './target-install-evidence.mjs';
import {archiveWorkerExecArgv} from './journal-archives.mjs';
const prefix='targetadmission:v1:review:',key=id=>prefix+id;
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const exact=(v,names)=>object(v)&&Object.keys(v).length===names.length&&names.every(k=>Object.hasOwn(v,k));
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const no=(code,status=409)=>fail(code,'Zielabgleich nicht bestätigt. Die Handelssperre bleibt bestehen; keine native Aktivierung.',status);
export const TARGET_REVIEW_TTL=300000;
export class TargetAdmissions{
 constructor(control,{assertAvailable=()=>{}}={}){this.control=control;this.store=control.store;this.db=control.db;this.now=control.now;this.assertAvailable=assertAvailable;this.epoch=randomUUID();this.workers=new Set();this.flight=null;this.closed=false;}
 #human(actor,assertActor=()=>{}){if(this.closed)no('TARGET_ADMISSION_CLOSED',503);this.assertAvailable();this.control.requireHuman(actor);assertActor();}
 #read(id){let j;try{j=this.store.get(key(id));}catch{no('TARGET_REVIEW_STORAGE_INVALID');}if(j===null)return null;
  if(!exact(j,['schema','reviewId','botId','status','coreEpoch','createdAt','expiresAt','reviewDigest','review','receipt'])||j.schema!==1||j.reviewId!==id||!uuid(id)||!uuid(j.botId)||!['reviewed','confirmed_blocked'].includes(j.status)||!hash(j.reviewDigest)||j.reviewDigest!==digest(j.review)||!uuid(j.coreEpoch)||!Number.isFinite(Date.parse(j.createdAt))||Date.parse(j.expiresAt)-Date.parse(j.createdAt)!==TARGET_REVIEW_TTL)no('TARGET_REVIEW_STORAGE_INVALID');
  if(!exact(j.review,['format','selection','identity','identityDigest','files','comparison','safety'])||j.review.format!=='th3.target-admission.review/1'||j.review.selection?.botId!==j.botId||j.review.identity?.botId!==j.botId||j.review.identityDigest!==digest(j.review.identity)||j.review.files?.immutableDigest!==digest(j.review.files?.immutable)||canonical(j.review.safety)!==canonical(TARGET_EVIDENCE_SAFETY))no('TARGET_REVIEW_STORAGE_INVALID');
  if(j.status==='reviewed'&&j.receipt!==null)no('TARGET_REVIEW_STORAGE_INVALID');
  if(j.status==='confirmed_blocked'){const r=j.receipt;if(!exact(r,['format','reviewId','reviewDigest','recordedAt','status','identity','immutableEvidenceDigest','activeJournal','firstSample','secondSample','reportComparison','safety','receiptHash'])||r.status!=='REPORTS_CORRELATED_ENTRIES_STILL_BLOCKED'||!Number.isFinite(Date.parse(r.recordedAt))||canonical(r.identity)!==canonical(j.review.identity)||r.immutableEvidenceDigest!==j.review.files.immutableDigest||r.reportComparison?.reportsMatched!==true||canonical(r.firstSample)!==canonical(j.review.comparison.sample)||r.format!=='th3.target-admission.receipt/1'||r.reviewId!==id||r.reviewDigest!==j.reviewDigest||canonical(r.safety)!==canonical(TARGET_EVIDENCE_SAFETY)||r.receiptHash!==digest(Object.fromEntries(Object.entries(r).filter(([k])=>k!=='receiptHash'))))no('TARGET_REVIEW_STORAGE_INVALID');}
  return j;
 }
 #single(id,work){if(this.flight){if(this.flight.id===id)return this.flight.promise;no('TARGET_ADMISSION_BUSY');}const promise=Promise.resolve().then(work).finally(()=>{if(this.flight?.id===id)this.flight=null;});this.flight={id,promise};return promise;}
 #worker(job){return new Promise((resolve,reject)=>{
  const args=archiveWorkerExecArgv(process.execArgv),options=args.length===process.execArgv.length?{}:{execArgv:args};
  const worker=new Worker(new URL('./target-admission-worker.mjs',import.meta.url),{workerData:job,...options,resourceLimits:{maxOldGenerationSizeMb:384}});this.workers.add(worker);let settled=false;
  const finish=(err,value)=>{if(settled)return;settled=true;clearTimeout(timer);err?reject(err):resolve(value);};
  const timer=setTimeout(()=>{finish(Object.assign(Error(),{code:'TARGET_REVIEW_TIMEOUT'}));worker.terminate();},120000);timer.unref();
  worker.once('message',m=>m?.ok&&object(m.result)?finish(null,m.result):finish(Object.assign(Error(),{code:m?.code??'TARGET_WORKER_FAILED'})));
  worker.once('error',err=>finish(err));worker.once('exit',()=>{this.workers.delete(worker);if(!settled)finish(Object.assign(Error(),{code:'TARGET_WORKER_EXIT'}));});
 });}
 async #inspect(selection,actor,assertActor,after=null){
  this.#human(actor,assertActor);const directory=mkdtempSync(join(realpathSync(this.store.directory),'.target-review-'));
  try{
   if(process.platform!=='win32')chmodSync(directory,0o700);const databasePath=join(directory,'snapshot.sqlite');await backup(this.db,databasePath);if(process.platform!=='win32')chmodSync(databasePath,0o600);
   this.#human(actor,assertActor);const result=await this.#worker({selection,databasePath,now:this.now(),engineEpoch:this.control.engineJournal.epoch,observerEpoch:this.control.observation.epoch,after});
   this.#human(actor,assertActor);const current=captureTargetAdmission(this.control,selection);
   if(current.guardDigest!==result.guardDigest)no('TARGET_CHANGED_DURING_REVIEW');
   if(result.files.immutableDigest!==digest(result.files.immutable)||result.identityDigest!==digest(result.identity)||canonical(result.files.immutable.safety)!==canonical(TARGET_EVIDENCE_SAFETY))no('TARGET_WORKER_RESULT_INVALID');
   return result;
  }catch(e){if(e instanceof HubError)throw e;no(typeof e.code==='string'&&/^[A-Z0-9_]{1,100}$/.test(e.code)?e.code:'TARGET_INSPECTION_FAILED');}
  finally{rmSync(directory,{recursive:true,force:true});}
 }
 preview(botId,input,actor,{assertActor=()=>{}}={}){
  this.#human(actor,assertActor);if(!uuid(botId)||!object(input)||Object.keys(input).sort().join(',')!=='artifactPath,installDirectory,observerBotId,transitionId'||!uuid(input.transitionId)||!uuid(input.observerBotId)||['artifactPath','installDirectory'].some(k=>typeof input[k]!=='string'||!isAbsolute(input[k])||input[k].length>4096||input[k].includes('\0')))no('TARGET_PREVIEW_INPUT_INVALID',400);
  const selection={botId,...input};return this.#single('preview:'+digest(selection),async()=>{
   const checked=await this.#inspect(selection,actor,assertActor),now=this.now();
   const review={format:'th3.target-admission.review/1',selection,identity:checked.identity,identityDigest:checked.identityDigest,files:checked.files,comparison:checked.comparison,safety:TARGET_EVIDENCE_SAFETY};
   const reviewDigest=digest(review),ids=this.db.prepare('SELECT key FROM kv WHERE key>=? AND key<?').all(prefix,prefix+'\uffff');if(ids.length>=128)no('TARGET_REVIEW_BUDGET',507);
   const reviewId=randomUUID(),job={schema:1,reviewId,botId,status:'reviewed',coreEpoch:this.epoch,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+TARGET_REVIEW_TTL).toISOString(),reviewDigest,review,receipt:null};
   return this.store.transaction(()=>{this.#human(actor,assertActor);if(captureTargetAdmission(this.control,selection).guardDigest!==checked.guardDigest)no('TARGET_CHANGED_DURING_REVIEW');this.store.set(key(reviewId),job);this.store.event('target.admission_reviewed',{reviewId,transitionId:input.transitionId,reportsMatched:checked.comparison.reportsMatched,issueCodes:checked.comparison.issues.map(x=>x.code),grantsTrading:false},actor.id,botId);return{...job,grantsTrading:false};});
  });
 }
 confirm(botId,input,actor,{assertActor=()=>{}}={}){
  this.#human(actor,assertActor);if(!object(input)||Object.keys(input).sort().join(',')!=='confirmBlockedTarget,reviewDigest,reviewId'||!uuid(input.reviewId)||!hash(input.reviewDigest)||input.confirmBlockedTarget!==true)no('TARGET_CONFIRMATION_REQUIRED',400);
  return this.#single('confirm:'+botId+':'+digest(input),async()=>{
   let job=this.#read(input.reviewId);if(!job||job.botId!==botId||job.reviewDigest!==input.reviewDigest)no('TARGET_REVIEW_NOT_FOUND');
   const replay=()=>({confirmed:true,duplicate:true,historical:true,receipt:job.receipt,grantsTrading:false,entryHoldStillRequired:true});
   if(job.status==='confirmed_blocked')return replay();
   const checkTime=()=>{if(job.coreEpoch!==this.epoch)no('TARGET_CORE_RESTARTED');if(this.now()<Date.parse(job.createdAt)||this.now()>=Date.parse(job.expiresAt))no('TARGET_REVIEW_EXPIRED');};checkTime();
   if(!job.review.comparison.reportsMatched||!job.review.comparison.sample)no('TARGET_INITIAL_REPORTS_NOT_MATCHED');
   const checked=await this.#inspect(job.review.selection,actor,assertActor,job.review.comparison.sample);checkTime();
   if(checked.identityDigest!==job.review.identityDigest||checked.files.immutableDigest!==job.review.files.immutableDigest)no('TARGET_IDENTITY_OR_FILES_CHANGED');
   if(!checked.comparison.reportsMatched)no(checked.comparison.issues[0]?.code??'TARGET_REPORTS_NOT_MATCHED');
   return this.store.transaction(()=>{
    this.#human(actor,assertActor);job=this.#read(input.reviewId);if(job.status==='confirmed_blocked')return replay();checkTime();
    if(captureTargetAdmission(this.control,job.review.selection).guardDigest!==checked.guardDigest)no('TARGET_CHANGED_DURING_REVIEW');
    const receipt={format:'th3.target-admission.receipt/1',reviewId:job.reviewId,reviewDigest:job.reviewDigest,recordedAt:new Date(this.now()).toISOString(),status:'REPORTS_CORRELATED_ENTRIES_STILL_BLOCKED',identity:checked.identity,immutableEvidenceDigest:checked.files.immutableDigest,activeJournal:checked.files.activeJournal,firstSample:job.review.comparison.sample,secondSample:checked.comparison.sample,reportComparison:checked.comparison,safety:TARGET_EVIDENCE_SAFETY};receipt.receiptHash=digest(receipt);
    this.store.set(key(job.reviewId),{...job,status:'confirmed_blocked',receipt});this.store.event('target.admission_recorded_blocked',{reviewId:job.reviewId,receiptHash:receipt.receiptHash,runtimeId:checked.identity.runtimeId,grantsTrading:false,entryHoldStillRequired:true},actor.id,botId);
    return{confirmed:true,duplicate:false,historical:true,receipt,grantsTrading:false,entryHoldStillRequired:true};
   });
  });
 }
 list(botId,actor){this.#human(actor);this.control.rawBot(botId);const ids=this.db.prepare('SELECT key FROM kv WHERE key>=? AND key<? ORDER BY rowid DESC').all(prefix,prefix+'\uffff');if(ids.length>128)no('TARGET_REVIEW_STORAGE_INVALID');return{botId,items:ids.map(x=>this.#read(x.key.slice(prefix.length))).filter(x=>x.botId===botId),grantsTrading:false,entryHoldStillRequired:true};}
 async drain(){await Promise.allSettled([...this.workers].map(w=>w.terminate()));if(this.flight)await Promise.allSettled([this.flight.promise]);}
 async close(){this.closed=true;await this.drain();}
}
