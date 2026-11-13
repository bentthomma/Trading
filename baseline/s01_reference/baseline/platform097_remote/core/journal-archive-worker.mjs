import {validateLineage} from './journal-build-lineage.mjs';
/** Isolated CPU/file validation. Reads an immutable SQLite backup, never the live
 * trading connection. It does not query/export grants or invoke a shell,
 * network or broker. A worker thread is a resource boundary, not a separate
 * OS security sandbox; its temporary full database copy stays private. */
import {parentPort,workerData} from 'node:worker_threads';
import {DatabaseSync} from 'node:sqlite';
import {openSync,closeSync,writeSync,fsyncSync,lstatSync,unlinkSync} from 'node:fs';
import {canonical,digest} from './schema.mjs';
import {inspectDatabaseSchema} from './store.mjs';
import {ENGINE_JOURNAL_PROFILE,validateOriginalPlan} from './engine-journal.mjs';
import {ARCHIVE_FORMAT,ARCHIVE_SAFETY,ARCHIVE_MAX_BYTES,ARCHIVE_MAX_LINE,JournalArchiveCheck,verifyJournalArchive,checkArchiveStream,checkArchiveReceipt,archiveFailure} from './journal-archive-format.mjs';
import {createHash} from 'node:crypto';
function parse(v){try{return JSON.parse(v);}catch{archiveFailure('JOURNAL_ARCHIVE_SOURCE_INVALID');}}
function createArchive(job){
 const f=lstatSync(job.databasePath);if(!f.isFile()||f.isSymbolicLink())archiveFailure('JOURNAL_ARCHIVE_PATH_INVALID');
 const db=new DatabaseSync(job.databasePath,{readOnly:true});let fd=null;
 try{
  db.exec('PRAGMA query_only=ON; BEGIN;');if(!inspectDatabaseSchema(db).schemaCompatible)archiveFailure('JOURNAL_ARCHIVE_DATABASE_INVALID');
  const bot=db.prepare('SELECT id,name,manifest,lifecycle_revision FROM bots WHERE id=?').get(job.botId);if(!bot)archiveFailure('BOT_NOT_FOUND');
  const manifest=parse(bot.manifest);if(manifest.id!==ENGINE_JOURNAL_PROFILE||manifest.version!=='1.0.0'||!manifest.capabilities.telemetry)archiveFailure('JOURNAL_PROFILE_REQUIRED');
  const prefix='enginejournal:v1:'+job.botId+':',all=t=>db.prepare('SELECT key,value FROM kv WHERE key>=? AND key<? ORDER BY key').all(prefix+t+':',prefix+t+':\uffff');
  const get=k=>{const x=db.prepare('SELECT value FROM kv WHERE key=?').get(k);return x?parse(x.value):null;};
  const streamRows=all('stream');if(!streamRows.length)archiveFailure('JOURNAL_ARCHIVE_EMPTY');if(streamRows.length>256)archiveFailure('JOURNAL_ARCHIVE_LIMIT');
  const streams=streamRows.map(row=>{const s=parse(row.value);const keys=['streamId','account','build','cursor','highWater','stored','lastReceivedAt','runtimeId','coreEpoch'];if(Object.keys(s).length!==keys.length||keys.some(k=>!Object.hasOwn(s,k))||row.key!==prefix+'stream:'+s.streamId)archiveFailure('JOURNAL_ARCHIVE_SOURCE_INVALID');const {coreEpoch,...value}=s;return checkArchiveStream(value);});
  streams.sort((a,b)=>a.streamId<b.streamId?-1:a.streamId>b.streamId?1:0);
  const lineages=all('lineage').map(row=>{const h=parse(row.value),stream=streams.find(s=>s.streamId===h.streamId);if(!stream||row.key!==prefix+'lineage:'+h.streamId)archiveFailure('JOURNAL_ARCHIVE_BUILD_HISTORY_INVALID');try{return validateLineage(h,{botId:bot.id,streamId:stream.streamId,account:stream.account,build:stream.build,cursor:stream.cursor});}catch{archiveFailure('JOURNAL_ARCHIVE_BUILD_HISTORY_INVALID');}});
  const binding=get(prefix+'binding');if(!binding||!streams.some(s=>s.streamId===binding.streamId&&canonical(s.account)===canonical(binding.account)))archiveFailure('JOURNAL_ARCHIVE_SOURCE_INVALID');
  const totals=get(prefix+'totals');if(!totals||Object.keys(totals).length!==1||!Number.isSafeInteger(totals.eventBytes))archiveFailure('JOURNAL_ARCHIVE_SOURCE_INVALID');
  const sourceScope={botId:bot.id,lifecycleRevision:bot.lifecycle_revision,manifestId:manifest.id,manifestVersion:manifest.version,allObservedAccountScopes:true};
  if(digest(sourceScope)!==job.reviewDigest)archiveFailure('JOURNAL_ARCHIVE_REVIEW_CHANGED');
  const header={record:'header',format:ARCHIVE_FORMAT,version:lineages.length?2:1,archiveId:job.archiveId,createdAt:job.createdAt,sourcePlatform:job.sourcePlatform,bot:{id:bot.id,name:bot.name,manifestId:manifest.id,manifestVersion:manifest.version,lifecycleRevision:bot.lifecycle_revision},streams,safety:ARCHIVE_SAFETY,...(lineages.length?{lineages}:{})};
  fd=openSync(job.outputPath,'wx',0o600);const bodyHash=createHash('sha256');const check=new JournalArchiveCheck();let count=0,eventBytes=0,totalBytes=0;
  function write(record,body=true){const bytes=Buffer.from(canonical(record)+'\n');totalBytes+=bytes.length;if(bytes.length>ARCHIVE_MAX_LINE||totalBytes>ARCHIVE_MAX_BYTES)archiveFailure('JOURNAL_ARCHIVE_LIMIT');let done=0;while(done<bytes.length){const n=writeSync(fd,bytes,done,bytes.length-done);if(n<=0)archiveFailure('JOURNAL_ARCHIVE_WRITE_FAILED');done+=n;}if(body)bodyHash.update(bytes);check.push(bytes);}
  write(header);const ids=new Map(),expectedPlanKeys=new Set(),streamCursors=new Map(streams.map(s=>[s.streamId,BigInt(s.cursor)]));
  const events=db.prepare('SELECT key,value FROM kv WHERE key>=? AND key<? ORDER BY rowid').iterate(prefix+'event:',prefix+'event:\uffff');
  for(const row of events){const r=parse(row.value);checkArchiveReceipt(r);if(row.key!==prefix+'event:'+r.event.eventId)archiveFailure('JOURNAL_ARCHIVE_SOURCE_INVALID');
   const pointer=get(prefix+'sequence:'+r.streamId+':'+r.event.sequence);if(!pointer||Object.keys(pointer).length!==1||pointer.eventId!==r.event.eventId)archiveFailure('JOURNAL_ARCHIVE_SOURCE_INVALID');
   if(r.event.type==='plan.recorded'&&BigInt(r.event.sequence)<=streamCursors.get(r.streamId))expectedPlanKeys.add(prefix+'plan:'+digest({account:r.account,id:r.event.payload.planId}));
   count++;eventBytes+=Buffer.byteLength(JSON.stringify(r.event));ids.set(r.event.eventId,{streamId:r.streamId,sequence:r.event.sequence,type:r.event.type,payloadHash:r.event.payloadHash,account:r.account});write({record:'event',receipt:r});
  }
  const pointers=db.prepare('SELECT count(*) n FROM kv WHERE key>=? AND key<?').get(prefix+'sequence:',prefix+'sequence:\uffff').n;
  if(!count||pointers!==count||eventBytes!==totals.eventBytes)archiveFailure('JOURNAL_ARCHIVE_SOURCE_INVALID');
  // Check immutable plan projections too: a valid raw archive must not conceal a
  // damaged source plan index. Other projections are deliberately NOT exported
  // as actionable state; they can merge and supersede multiple source events.
  for(const row of db.prepare('SELECT key,value FROM kv WHERE key>=? AND key<? ORDER BY key').iterate(prefix+'plan:',prefix+'plan:\uffff')){const x=parse(row.value);validateOriginalPlan(x.plan);const source=ids.get(x.eventId);if(!source||source.type!=='plan.recorded'||source.streamId!==x.streamId||source.sequence!==x.sequence||canonical(source.account)!==canonical(x.account)||x.planHash!==digest(x.plan)||source.payloadHash!==x.planHash||row.key!==prefix+'plan:'+digest({account:x.account,id:x.plan.planId})||!expectedPlanKeys.delete(row.key))archiveFailure('JOURNAL_ARCHIVE_PLAN_INDEX_INVALID');}
  if(expectedPlanKeys.size)archiveFailure('JOURNAL_ARCHIVE_PLAN_INDEX_INVALID');
  write({record:'seal',algorithm:'sha256',contentSHA256:bodyHash.digest('hex'),eventCount:count,eventBytes},false);
  fsyncSync(fd);closeSync(fd);fd=null;db.exec('COMMIT');const memoryCheck=check.finish(),diskCheck=verifyJournalArchive(job.outputPath);
  if(canonical(memoryCheck)!==canonical(diskCheck))archiveFailure('JOURNAL_ARCHIVE_REREAD_MISMATCH');return diskCheck;
 }finally{if(fd!==null)closeSync(fd);db.close();}
}
if(parentPort){
 try{const result=workerData.operation==='create'?createArchive(workerData):workerData.operation==='verify'?verifyJournalArchive(workerData.path):archiveFailure('JOURNAL_ARCHIVE_OPERATION_INVALID');parentPort.postMessage({ok:true,result});}
 catch(error){parentPort.postMessage({ok:false,code:typeof error.code==='string'&&/^[A-Z_0-9]{1,100}$/.test(error.code)?error.code:'JOURNAL_ARCHIVE_FAILED'});}
}
export {createArchive};
