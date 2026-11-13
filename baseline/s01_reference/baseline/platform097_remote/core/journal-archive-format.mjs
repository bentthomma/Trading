import {validateLineage,buildForSequence} from './journal-build-lineage.mjs';
/** Historical journal export, never an execution/restore instruction.
 * Stream/plan/build identities remain exact. A valid checksum proves file
 * integrity against a trusted receipt, not broker authenticity or a flat account.
 */
import {createHash} from 'node:crypto';
import {openSync,closeSync,fstatSync,readSync,constants,lstatSync} from 'node:fs';
import {canonical,digest} from './schema.mjs';
import {validateJournalEvent,JOURNAL_MAX_STORED_EVENTS,JOURNAL_MAX_STORED_BYTES} from './engine-journal.mjs';
export const ARCHIVE_FORMAT='th3rev.core-journal.archive';
export const ARCHIVE_MAX_BYTES=400*1024*1024;
export const ARCHIVE_MAX_LINE=1024*1024;
export const ARCHIVE_SAFETY=Object.freeze({historicalOnly:true,executionGrant:false,restoresRuntime:false,brokerIndependentlyVerified:false,includesCompleteBrokerHistory:false});
export const archiveFailure=(code='JOURNAL_ARCHIVE_INVALID')=>{const e=new Error(code);e.code=code;throw e;};
export const isUUID=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
export function shape(v,keys){if(v===null||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))archiveFailure();}
const text=(v,max=100)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\u0000-\u001f\u007f-\u009f]/u.test(v);
const id=v=>text(v)&&/^[A-Za-z0-9_.:-]+$/.test(v);
const seq=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(v)&&BigInt(v)<=9223372036854775807n;
export function archiveTime(v){if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString()!==v)archiveFailure();return Date.parse(v);}
export function checkArchiveAccount(a){shape(a,['broker','id','environment','currency']);if(!text(a.broker)||!text(a.id)||a.environment!=='demo'||!text(a.currency,12)||!/^[A-Z0-9]{3,12}$/.test(a.currency))archiveFailure();}
export function checkArchiveBuild(b){shape(b,['engine','version','sourceHash']);if(b.engine!=='Th3Revolution20'||!text(b.version,50)||typeof b.sourceHash!=='string'||!/^[a-f0-9]{64}$/.test(b.sourceHash))archiveFailure();}
export function checkArchiveStream(s){
 shape(s,['streamId','account','build','cursor','highWater','stored','lastReceivedAt','runtimeId']);
 if(!id(s.streamId)||!seq(s.cursor)||!seq(s.highWater)||BigInt(s.cursor)>BigInt(s.highWater)||!Number.isSafeInteger(s.stored)||s.stored<1||s.stored>JOURNAL_MAX_STORED_EVENTS||BigInt(s.stored)<BigInt(s.cursor)||BigInt(s.stored)>BigInt(s.highWater)||!id(s.runtimeId))archiveFailure();
 checkArchiveAccount(s.account);checkArchiveBuild(s.build);archiveTime(s.lastReceivedAt);return s;
}
export function checkArchiveReceipt(r){
 shape(r,['fingerprint','streamId','account','build','receivedAt','event']);
 if(!id(r.streamId)||typeof r.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(r.fingerprint))archiveFailure();
 checkArchiveAccount(r.account);checkArchiveBuild(r.build);const at=archiveTime(r.receivedAt);
 try{validateJournalEvent(r.event,at);}catch{archiveFailure('JOURNAL_ARCHIVE_EVENT_INVALID');}
 if(r.fingerprint!==digest({streamId:r.streamId,account:r.account,build:r.build,event:r.event}))archiveFailure('JOURNAL_ARCHIVE_EVENT_HASH');
 return r;
}
export class JournalArchiveCheck {
 constructor(){this.header=null;this.seal=null;this.lineages=new Map();this.streams=new Map();this.ids=new Set();this.plans=new Map();this.records=0;this.eventBytes=0;this.scopeSet=new Set();this.buildSet=new Set();this.content=createHash('sha256');this.fileHash=createHash('sha256');this.bytes=0;}
 push(line){
  if(!Buffer.isBuffer(line)||line.length>ARCHIVE_MAX_LINE||line.length<3||line[line.length-1]!==10)archiveFailure('JOURNAL_ARCHIVE_LINE_INVALID');
  this.bytes+=line.length;if(this.bytes>ARCHIVE_MAX_BYTES)archiveFailure('JOURNAL_ARCHIVE_LIMIT');
  const str=new TextDecoder('utf-8',{fatal:true}).decode(line.subarray(0,-1));let x;try{x=JSON.parse(str);}catch{archiveFailure();}
  if(canonical(x)!==str)archiveFailure('JOURNAL_ARCHIVE_NONCANONICAL');
  this.fileHash.update(line);if(this.seal)archiveFailure('JOURNAL_ARCHIVE_TRAILING_DATA');
  if(!this.header){
   shape(x,['record','format','version','archiveId','createdAt','sourcePlatform','bot','streams','safety',...(x.version===2?['lineages']:[])]);
   if(x.record!=='header'||x.format!==ARCHIVE_FORMAT||![1,2].includes(x.version)||!isUUID(x.archiveId)||!text(x.sourcePlatform,40)||canonical(x.safety)!==canonical(ARCHIVE_SAFETY)||!Array.isArray(x.streams)||x.streams.length<1||x.streams.length>256)archiveFailure();
   shape(x.bot,['id','name','manifestId','manifestVersion','lifecycleRevision']);if(!isUUID(x.bot.id)||!text(x.bot.name)||x.bot.manifestId!=='th3rev.ready20.v1'||x.bot.manifestVersion!=='1.0.0'||!Number.isSafeInteger(x.bot.lifecycleRevision)||x.bot.lifecycleRevision<0)archiveFailure();archiveTime(x.createdAt);
   let previous=null;for(const s of x.streams){checkArchiveStream(s);if(this.streams.has(s.streamId)||previous!==null&&previous>=s.streamId)archiveFailure();previous=s.streamId;this.streams.set(s.streamId,{source:s,sequences:new Set(),highest:0n,count:0});this.scopeSet.add(canonical(s.account));this.buildSet.add(canonical(s.build));}
   if(x.version===2){
    if(!Array.isArray(x.lineages)||!x.lineages.length||x.lineages.length>256)archiveFailure('JOURNAL_ARCHIVE_BUILD_HISTORY_INVALID');let last=null;
    for(const history of x.lineages){const stream=this.streams.get(history?.streamId)?.source;if(!stream||this.lineages.has(history.streamId)||last!==null&&last>=history.streamId)archiveFailure('JOURNAL_ARCHIVE_BUILD_HISTORY_INVALID');
     try{validateLineage(history,{botId:x.bot.id,streamId:stream.streamId,account:stream.account,build:stream.build,cursor:stream.cursor});}catch{archiveFailure('JOURNAL_ARCHIVE_BUILD_HISTORY_INVALID');}
     if(history.transitions.some(t=>archiveTime(t.confirmedAt)>archiveTime(x.createdAt)))archiveFailure('JOURNAL_ARCHIVE_TIME_CONFLICT');
     this.lineages.set(history.streamId,history);this.buildSet.add(canonical(history.originBuild));for(const t of history.transitions)this.buildSet.add(canonical(t.toBuild));last=history.streamId;
    }
   }
   this.header=x;this.content.update(line);return;
  }
  if(x.record==='event'){
   shape(x,['record','receipt']);checkArchiveReceipt(x.receipt);const r=x.receipt,s=this.streams.get(r.streamId);
   if(!s||canonical(s.source.account)!==canonical(r.account)||canonical(buildForSequence(this.lineages.get(r.streamId),r.event.sequence,s.source.build))!==canonical(r.build))archiveFailure('JOURNAL_ARCHIVE_SOURCE_MISMATCH');
   if(this.ids.has(r.event.eventId)||s.sequences.has(r.event.sequence))archiveFailure('JOURNAL_ARCHIVE_DUPLICATE');
   const history=this.lineages.get(r.streamId);if(history)for(const t of history.transitions){if(BigInt(r.event.sequence)>BigInt(t.afterSequence)&&archiveTime(r.receivedAt)<archiveTime(t.confirmedAt)||BigInt(r.event.sequence)<=BigInt(t.afterSequence)&&archiveTime(r.receivedAt)>archiveTime(t.confirmedAt))archiveFailure('JOURNAL_ARCHIVE_BUILD_TIME_CONFLICT');}
   if(archiveTime(r.receivedAt)>archiveTime(this.header.createdAt))archiveFailure('JOURNAL_ARCHIVE_TIME_CONFLICT');
   this.ids.add(r.event.eventId);s.sequences.add(r.event.sequence);s.count++;if(BigInt(r.event.sequence)>s.highest)s.highest=BigInt(r.event.sequence);
   this.records++;this.eventBytes+=Buffer.byteLength(JSON.stringify(r.event));if(this.records>JOURNAL_MAX_STORED_EVENTS||this.eventBytes>JOURNAL_MAX_STORED_BYTES)archiveFailure('JOURNAL_ARCHIVE_LIMIT');
   if(r.event.type==='plan.recorded'){const key=canonical([r.account,r.event.payload.planId]),hash=digest(r.event.payload),old=this.plans.get(key);if(old&&old!==hash)archiveFailure('JOURNAL_ARCHIVE_PLAN_CONFLICT');this.plans.set(key,hash);}
   this.content.update(line);return;
  }
  shape(x,['record','algorithm','contentSHA256','eventCount','eventBytes']);
  if(x.record!=='seal'||x.algorithm!=='sha256'||x.contentSHA256!==this.content.digest('hex')||x.eventCount!==this.records||x.eventBytes!==this.eventBytes)archiveFailure('JOURNAL_ARCHIVE_SEAL_INVALID');this.seal=x;
 }
 finish(){
  if(!this.header||!this.seal)archiveFailure('JOURNAL_ARCHIVE_INCOMPLETE');
  const gaps=[];
  for(const [streamId,s]of this.streams){let n=1n;while(s.sequences.has(String(n)))n++;if(String(n-1n)!==s.source.cursor||String(s.highest)!==s.source.highWater||s.count!==s.source.stored)archiveFailure('JOURNAL_ARCHIVE_CURSOR_CONFLICT');if(s.source.cursor!==s.source.highWater)gaps.push({streamId,cursor:s.source.cursor,highWater:s.source.highWater});}
  return {archiveId:this.header.archiveId,botId:this.header.bot.id,scopeDigest:digest({botId:this.header.bot.id,lifecycleRevision:this.header.bot.lifecycleRevision,manifestId:this.header.bot.manifestId,manifestVersion:this.header.bot.manifestVersion,allObservedAccountScopes:true}),sourcePlatform:this.header.sourcePlatform,createdAt:this.header.createdAt,bytes:this.bytes,sha256:this.fileHash.digest('hex'),contentSHA256:this.seal.contentSHA256,eventCount:this.records,eventBytes:this.eventBytes,streamCount:this.streams.size,accountScopes:this.scopeSet.size,sourceBuilds:this.buildSet.size,originalPlans:this.plans.size,gaps,historicalOnly:true,executionGrant:false,sourceIsBrokerVerified:false,...(this.header.version===2?{buildTransitionCount:[...this.lineages.values()].reduce((n,h)=>n+h.transitions.length,0)}:{})};
 }
}
// Reopen and read the actual bytes, bounded line size. No re-hashing an in-memory
// object instead of checking the written artifact. The reader rejects symlinks.
export function verifyJournalArchive(path){
 const info=lstatSync(path);if(!info.isFile()||info.isSymbolicLink()||info.size>ARCHIVE_MAX_BYTES)archiveFailure('JOURNAL_ARCHIVE_PATH_INVALID');
 const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
 try{
  const a=fstatSync(fd);if(a.ino!==info.ino||a.dev!==info.dev||a.size!==info.size)archiveFailure('JOURNAL_ARCHIVE_FILE_CHANGED');
  const check=new JournalArchiveCheck(),buf=Buffer.alloc(65536);let remainder=Buffer.alloc(0),position=0,n;
  while((n=readSync(fd,buf,0,buf.length,position))>0){position+=n;const chunk=remainder.length?Buffer.concat([remainder,buf.subarray(0,n)]):Buffer.from(buf.subarray(0,n));let start=0;for(let i=0;i<chunk.length;i++)if(chunk[i]===10){check.push(chunk.subarray(start,i+1));start=i+1;}remainder=Buffer.from(chunk.subarray(start));if(remainder.length>ARCHIVE_MAX_LINE)archiveFailure('JOURNAL_ARCHIVE_LINE_INVALID');}
  if(remainder.length)archiveFailure('JOURNAL_ARCHIVE_INCOMPLETE');const b=fstatSync(fd);if(b.ino!==a.ino||b.size!==a.size||b.mtimeMs!==a.mtimeMs)archiveFailure('JOURNAL_ARCHIVE_FILE_CHANGED');
  return check.finish();
 }finally{closeSync(fd);}
}
