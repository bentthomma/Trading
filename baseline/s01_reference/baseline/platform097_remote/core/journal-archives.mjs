/** Confirmed archival of Core journal reports. No source record is deleted,
 * migrated to another build, reactivated or interpreted as a writer handover. */
import {backup} from 'node:sqlite';
import {Worker} from 'node:worker_threads';
import {createHash} from 'node:crypto';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,lstatSync,realpathSync,readdirSync,chmodSync,linkSync,unlinkSync,rmSync,existsSync,openSync,closeSync,fsyncSync,constants} from 'node:fs';
import {open} from 'node:fs/promises';
import {join} from 'node:path';
import {fail,object,HubError} from './errors.mjs';
import {canonical,digest} from './schema.mjs';
import {ENGINE_JOURNAL_PROFILE} from './engine-journal.mjs';
import {isUUID,ARCHIVE_MAX_BYTES} from './journal-archive-format.mjs';
export const ARCHIVE_DISK_BUDGET=512*1024*1024;
export const ARCHIVE_FILE_LIMIT=32;
const receiptKey=id=>'journalarchive:v1:job:'+id;
const checksum=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const denied=(code='JOURNAL_ARCHIVE_UNAVAILABLE',status=409)=>fail(code,'Das Journalarchiv ist nicht bestätigt. Quellbelege und Handelsrechte bleiben unverändert.',status);
function safeError(e){const c=e?.code;return typeof c==='string'&&/^[A-Z_0-9]{1,100}$/.test(c)?c:'JOURNAL_ARCHIVE_FAILED';}
// File-based workers must not inherit an inline parent program. Preserve every
// other runtime flag, including permission, policy and loader restrictions.
export function archiveWorkerExecArgv(args){
 const out=[];for(let i=0;i<args.length;i++){const a=args[i];if(['--input-type','--eval','-e','--print','-p'].includes(a)){i++;continue;}if(['--input-type=','--eval=','--print='].some(prefix=>a.startsWith(prefix)))continue;out.push(a);}return out;
}
export class JournalArchives {
 constructor(control,{sourcePlatform='unknown',assertAvailable=()=>{}}={}){this.control=control;this.store=control.store;this.now=control.now;this.sourcePlatform=sourcePlatform;this.assertAvailable=assertAvailable;this.root=join(this.store.directory,'journal-archives');this.closed=false;this.active=null;this.workers=new Set();this.downloads=new Set();}
 #available(){if(this.closed)denied('JOURNAL_ARCHIVE_CLOSED',503);this.assertAvailable();}
 #directory(){
  this.#available();const parent=realpathSync(this.store.directory);if(!existsSync(this.root))mkdirSync(this.root,{mode:0o700});
  const st=lstatSync(this.root);if(st.isSymbolicLink()||!st.isDirectory()||realpathSync(this.root)!==join(parent,'journal-archives'))denied('JOURNAL_ARCHIVE_PATH_INVALID');
  if(process.platform!=='win32')chmodSync(this.root,0o700);return this.root;
 }
 #scope(botId){const b=this.control.rawBot(botId);let m;try{m=JSON.parse(b.manifest);}catch{denied('JOURNAL_ARCHIVE_SOURCE_INVALID');}if(m.id!==ENGINE_JOURNAL_PROFILE||m.version!=='1.0.0'||!m.capabilities.telemetry)denied('JOURNAL_PROFILE_REQUIRED');return {botId:b.id,lifecycleRevision:b.lifecycle_revision,manifestId:m.id,manifestVersion:m.version,allObservedAccountScopes:true};}
 preview(botId,actor){
  this.control.requireHuman(actor);this.#available();const scope=this.#scope(botId),p='enginejournal:v1:'+botId+':';
  const n=this.store.db.prepare('SELECT count(*) n FROM kv WHERE key>=? AND key<?').get(p+'event:',p+'event:\uffff').n;
  const streams=this.store.db.prepare('SELECT value FROM kv WHERE key>=? AND key<? ORDER BY key').all(p+'stream:',p+'stream:\uffff');
  const totals=this.store.get(p+'totals');
  return {supported:true,botId,reviewDigest:digest(scope),scope,available:n>0,eventCount:n,streamCount:streams.length,estimatedSourceEventBytes:totals?.eventBytes??0,
   snapshotPolicy:'consistent_copy_when_confirmed',includesAllObservedAccountsForProfile:true,containsPrivateTradeData:true,sourceRowsDeleted:false,grantsTrading:false,nativeHandoverConfirmed:false,
   warning:'Historisches Archiv aller im Core gespeicherten Quellen dieses Profils. Keine Broker-Vollständigkeit, keine neue Laufzeitfreigabe und kein Nachweis eines gestoppten Writers.'};
 }
 #readJob(id){
  let x;try{x=this.store.get(receiptKey(id));}catch{denied('JOURNAL_ARCHIVE_RECEIPT_INVALID');}
  if(x===null)return null;
  if(!object(x)||Object.keys(x).sort().join(',')!==['schemaVersion','requestId','botId','reviewDigest','status','createdAt','receipt'].sort().join(',')||x.schemaVersion!==1||x.requestId!==id||!isUUID(x.requestId)||!isUUID(x.botId)||!checksum(x.reviewDigest)||!['preparing','verified'].includes(x.status)||!Number.isFinite(Date.parse(x.createdAt))||x.status==='verified'&&(!object(x.receipt)||x.receipt.archiveId!==id||x.receipt.botId!==x.botId||!checksum(x.receipt.sha256)||!Number.isSafeInteger(x.receipt.bytes)||x.receipt.bytes<1||x.receipt.bytes>ARCHIVE_MAX_BYTES)||x.status==='preparing'&&x.receipt!==null)denied('JOURNAL_ARCHIVE_RECEIPT_INVALID');return x;
 }
 list(botId,actor){
  this.control.requireHuman(actor);this.#available();this.#scope(botId);
  const keys=this.store.db.prepare("SELECT key FROM kv WHERE key>=? AND key<? ORDER BY rowid DESC").all('journalarchive:v1:job:','journalarchive:v1:job:\uffff');
  const items=[];for(const {key}of keys){const job=this.#readJob(key.slice('journalarchive:v1:job:'.length));if(job.botId===botId)items.push({archiveId:job.requestId,reviewDigest:job.reviewDigest,status:job.status==='verified'?'verified_receipt':'unconfirmed',createdAt:job.createdAt,receipt:job.receipt,downloadAvailable:job.status==='verified'});}
  return {botId,archives:items,grantsTrading:false,rowsDeleted:false,filesRevalidatedOnDownload:true};
 }
 #worker(data){
  this.#available();return new Promise((resolve,reject)=>{
   // Let Node inherit its own test/permission/runtime context normally. Its
   // internal test-process execArgv also contains global flags which cannot be
   // supplied explicitly to a Worker. Override ONLY when the parent was an
   // inline/eval program; keep all remaining security/policy options unchanged.
   const parentArgs=process.execArgv,workerArgs=archiveWorkerExecArgv(parentArgs);
   const launchArgs=workerArgs.length===parentArgs.length?{}:{execArgv:workerArgs};
   const w=new Worker(new URL('./journal-archive-worker.mjs',import.meta.url),{workerData:data,...launchArgs,resourceLimits:{maxOldGenerationSizeMb:256}});this.workers.add(w);let answer=false;
   const timer=setTimeout(()=>{w.terminate();const e=new Error('JOURNAL_ARCHIVE_TIMEOUT');e.code='JOURNAL_ARCHIVE_TIMEOUT';reject(e);},120000);timer.unref();
   w.once('message',message=>{answer=true;clearTimeout(timer);if(message?.ok===true&&object(message.result))resolve(message.result);else{const e=new Error(message?.code??'JOURNAL_ARCHIVE_FAILED');e.code=safeError(message);reject(e);}});
   w.once('error',error=>{clearTimeout(timer);reject(error)});
   w.once('exit',code=>{this.workers.delete(w);clearTimeout(timer);if(!answer){const e=new Error('JOURNAL_ARCHIVE_WORKER_EXIT');e.code='JOURNAL_ARCHIVE_WORKER_EXIT';reject(e);}});
  });
 }
 #path(id){if(!isUUID(id))denied('JOURNAL_ARCHIVE_ID_INVALID',400);return join(this.#directory(),'journal-'+id+'.ndjson');}
 #cleanupStages(requestId){
  // Only private staging directories bearing this exact job marker and known
  // scratch filenames. Never traverse a symlink or delete arbitrary contents.
  for(const name of readdirSync(this.root)){
   if(!/^\.work-[A-Za-z0-9]{6}$/.test(name))continue;const dir=join(this.root,name);let marker;
   try{const st=lstatSync(dir),mp=join(dir,'stage.json'),ms=lstatSync(mp);if(!st.isDirectory()||st.isSymbolicLink()||!ms.isFile()||ms.isSymbolicLink()||ms.size>1024)continue;marker=JSON.parse(readFileSync(mp,'utf8'));}catch{continue;}
   if(!object(marker)||Object.keys(marker).length!==3||marker.schemaVersion!==1||marker.archiveId!==requestId||!isUUID(marker.botId))continue;
   const allowed=new Set(['stage.json','snapshot.sqlite','snapshot.sqlite-wal','snapshot.sqlite-shm','snapshot.sqlite-journal','journal.partial']);
   const children=readdirSync(dir);if(children.some(child=>!allowed.has(child)||!lstatSync(join(dir,child)).isFile()||lstatSync(join(dir,child)).isSymbolicLink()))continue;
   rmSync(dir,{recursive:true,force:true});
  }
 }
 #diskCapacity(){let count=0,size=0;for(const name of readdirSync(this.#directory())){if(!/^journal-[a-f0-9-]{36}\.ndjson$/.test(name))continue;const st=lstatSync(join(this.root,name));if(!st.isFile()||st.isSymbolicLink())denied('JOURNAL_ARCHIVE_PATH_INVALID');count++;size+=st.size;}return {count,size};}
 #checkResult(result,job){if(result.archiveId!==job.requestId||result.botId!==job.botId||result.scopeDigest!==job.reviewDigest||!checksum(result.sha256)||result.historicalOnly!==true||result.executionGrant!==false||!Number.isSafeInteger(result.bytes)||result.bytes>ARCHIVE_MAX_BYTES)denied('JOURNAL_ARCHIVE_RESULT_INVALID');}
 create(botId,input,actor){
  this.control.requireHuman(actor);this.#available();
  if(!object(input)||Object.keys(input).length!==2||!isUUID(input.requestId)||!checksum(input.reviewDigest))denied('JOURNAL_ARCHIVE_REQUEST_INVALID',400);
  const old=this.#readJob(input.requestId);if(old&&(old.botId!==botId||old.reviewDigest!==input.reviewDigest))denied('JOURNAL_ARCHIVE_REQUEST_CONFLICT');
  if(this.active){if(this.active.id===input.requestId&&this.active.botId===botId)return this.active.promise;denied('JOURNAL_ARCHIVE_BUSY');}
  const current=this.preview(botId,actor);if(!old&&(!current.available||current.reviewDigest!==input.reviewDigest))denied(current.available?'JOURNAL_ARCHIVE_REVIEW_CHANGED':'JOURNAL_ARCHIVE_EMPTY');
  const promise=this.#create(botId,input,actor,old).finally(()=>{if(this.active?.id===input.requestId)this.active=null;});
  this.active={id:input.requestId,botId,promise};return promise;
 }
 async #create(botId,input,actor,old){
  let stage=null;
  try{
   const finalPath=this.#path(input.requestId);let job=old;
   if(old?.status==='verified'){
    const result=await this.#worker({operation:'verify',path:finalPath});this.#available();this.control.requireHuman(actor);this.#checkResult(result,job);
    if(canonical(result)!==canonical(job.receipt))denied('JOURNAL_ARCHIVE_RECEIPT_MISMATCH');this.#cleanupStages(job.requestId);return {created:false,duplicate:true,receipt:job.receipt,grantsTrading:false};
   }
   if(!job){if(this.store.db.prepare("SELECT count(*) n FROM kv WHERE key>=? AND key<?").get('journalarchive:v1:job:','journalarchive:v1:job:\uffff').n>=128)denied('JOURNAL_ARCHIVE_JOB_BUDGET',507);job={schemaVersion:1,requestId:input.requestId,botId,reviewDigest:input.reviewDigest,status:'preparing',createdAt:new Date(this.now()).toISOString(),receipt:null};this.store.transaction(()=>{this.store.set(receiptKey(job.requestId),job);this.store.event('journalarchive.prepared',{archiveId:job.requestId,brokerAction:false},actor.id,botId);});}
   let result;
   if(existsSync(finalPath)){
    // Reconcile a published artifact after a lost receipt/response. Never replace
    // it with a new snapshot under the same request ID.
    result=await this.#worker({operation:'verify',path:finalPath});this.#checkResult(result,job);
   }else{
    const capacity=this.#diskCapacity();if(capacity.count>=ARCHIVE_FILE_LIMIT||capacity.size>=ARCHIVE_DISK_BUDGET)denied('JOURNAL_ARCHIVE_STORAGE_BUDGET',507);
    const current=this.preview(botId,actor);if(!current.available||current.reviewDigest!==input.reviewDigest)denied('JOURNAL_ARCHIVE_REVIEW_CHANGED');
    stage=mkdtempSync(join(this.root,'.work-'));writeFileSync(join(stage,'stage.json'),JSON.stringify({schemaVersion:1,archiveId:job.requestId,botId}),{flag:'wx',mode:0o600});const databasePath=join(stage,'snapshot.sqlite'),outputPath=join(stage,'journal.partial');
    await backup(this.store.db,databasePath);this.#available();if(process.platform!=='win32')chmodSync(databasePath,0o600);
    result=await this.#worker({operation:'create',databasePath,outputPath,archiveId:job.requestId,botId,reviewDigest:job.reviewDigest,createdAt:new Date(this.now()).toISOString(),sourcePlatform:this.sourcePlatform});
    this.#available();this.control.requireHuman(actor);this.#checkResult(result,job);
    const latestCapacity=this.#diskCapacity();if(latestCapacity.count>=ARCHIVE_FILE_LIMIT||latestCapacity.size+result.bytes>ARCHIVE_DISK_BUDGET)denied('JOURNAL_ARCHIVE_STORAGE_BUDGET',507);
    if(process.platform!=='win32')chmodSync(outputPath,0o400);
    linkSync(outputPath,finalPath);unlinkSync(outputPath); // atomic no-clobber publication, same filesystem
    if(process.platform!=='win32'){const fd=openSync(this.root,constants.O_RDONLY);try{fsyncSync(fd)}finally{closeSync(fd)}}
   }
   this.#available();this.control.requireHuman(actor);
   this.store.transaction(()=>{const current=this.#readJob(job.requestId);if(!current||current.botId!==botId||current.reviewDigest!==job.reviewDigest)denied('JOURNAL_ARCHIVE_REQUEST_CONFLICT');this.store.set(receiptKey(job.requestId),{...job,status:'verified',receipt:result});this.store.event('journalarchive.verified',{archiveId:job.requestId,sha256:result.sha256,eventCount:result.eventCount,gapStreams:result.gaps.length,rowsDeleted:false,executionGrant:false},actor.id,botId);});
   this.#cleanupStages(job.requestId);return {created:true,duplicate:false,receipt:result,grantsTrading:false};
  }catch(e){if(e instanceof HubError)throw e;fail(safeError(e),'Das Archiv konnte nicht vollständig bestätigt werden. Die Originalbelege wurden nicht gelöscht; dieselbe Anfrage kann nach Prüfung wiederholt werden.',503);}
  finally{if(stage)rmSync(stage,{recursive:true,force:true});}
 }
 async download(botId,id,actor){
  this.control.requireHuman(actor);this.#available();this.#scope(botId);const job=this.#readJob(id);
  if(!job||job.botId!==botId)denied('JOURNAL_ARCHIVE_NOT_FOUND',404);if(job.status!=='verified')denied('JOURNAL_ARCHIVE_UNCONFIRMED');
  const path=this.#path(id);let handle;
  try{
   const before=lstatSync(path);if(!before.isFile()||before.isSymbolicLink()||before.size!==job.receipt.bytes)denied('JOURNAL_ARCHIVE_FILE_CHANGED');
   handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));this.downloads.add(handle);const st=await handle.stat();if(st.ino!==before.ino||st.dev!==before.dev)denied('JOURNAL_ARCHIVE_FILE_CHANGED');
   const hasher=createHash('sha256'),buf=Buffer.alloc(65536);let pos=0;
   while(pos<st.size){const {bytesRead}=await handle.read(buf,0,Math.min(buf.length,st.size-pos),pos);if(!bytesRead)denied('JOURNAL_ARCHIVE_FILE_CHANGED');hasher.update(buf.subarray(0,bytesRead));pos+=bytesRead;this.#available();}
   const after=await handle.stat();if(hasher.digest('hex')!==job.receipt.sha256||st.size!==after.size||st.mtimeMs!==after.mtimeMs)denied('JOURNAL_ARCHIVE_FILE_CHANGED');
   this.#available();this.control.requireHuman(actor);const h=handle;handle=null;
   return {receipt:job.receipt,filename:'journal-'+id+'.ndjson',handle:h,close:async()=>{this.downloads.delete(h);await h.close()}};
  }catch(e){if(e instanceof HubError)throw e;fail(safeError(e),'Die Archivdatei fehlt oder stimmt nicht mit ihrem bestätigten Beleg überein.',409);}
  finally{if(handle){this.downloads.delete(handle);await handle.close();}}
 }
 async drain(){await Promise.allSettled([...this.workers].map(w=>w.terminate()));if(this.active)await Promise.allSettled([this.active.promise]);await Promise.allSettled([...this.downloads].map(h=>h.close()));this.downloads.clear();}
 async close(){this.closed=true;await this.drain();}
}
