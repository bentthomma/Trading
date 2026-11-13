/** Snapshot identity for an explicitly confirmed journal-only build transition.
 * All checks are local evidence. 'Not recently heard' does not mean 'stopped'. */
import {digest,canonical} from './schema.mjs';
import {fail,object} from './errors.mjs';
import {readLineage,buildEntryBlocker,buildHoldKey,buildForSequence} from './journal-build-lineage.mjs';
import {checkArchiveReceipt} from './journal-archive-format.mjs';
const denied=c=>fail(c,'Buildübergang nicht bestätigt. Journal, Konto und verantwortliche Instanz müssen abgeglichen werden.',409);
export function coreBuildContext(control,botId,evidence,{verifyEvents=false,criticalReferences=[]}={}){
 const {store,db}=control,now=control.now(),bot=control.rawBot(botId);let manifest;try{manifest=JSON.parse(bot.manifest);}catch{denied('BUILD_SOURCE_STORAGE_INVALID');}
 if(bot.archived_at!==null||bot.adapter!=='bridge'||manifest.id!=='th3rev.ready20.v1'||manifest.version!=='1.0.0')denied('BUILD_TRANSITION_PROFILE_REQUIRED');
 const p='enginejournal:v1:'+botId+':',scope=evidence.scope;const read=(key)=>{try{return store.get(key);}catch{denied('BUILD_SOURCE_STORAGE_INVALID');}};
 const stream=read(p+'stream:'+scope.streamId),binding=read(p+'binding'),totals=read(p+'totals'),policy=read('policy');
 if(scope.botId!==botId||!stream||!binding||binding.streamId!==scope.streamId||canonical(binding.account)!==canonical(scope.account)||canonical(stream.account)!==canonical(scope.account)||canonical(stream.build)!==canonical(evidence.source.build))denied('BUILD_SOURCE_IDENTITY_MISMATCH');
 const lineage=readLineage(store,botId,stream);
 if(buildEntryBlocker(store,botId))denied('BUILD_TRANSITION_ALREADY_HELD');
 if(!stream.cursor||stream.cursor==='0'||stream.cursor!==stream.highWater||evidence.state.acknowledgedSequence!==stream.cursor||evidence.state.highestSequence!==stream.cursor||evidence.state.pendingEvents!==0||BigInt(stream.stored)!==BigInt(stream.cursor))denied('BUILD_SOURCE_NOT_DRAINED');
 if(['fault','conflict'].includes(bot.runtime_status))denied('BUILD_SOURCE_RUNTIME_UNCONFIRMED');
 if(!bot.runtime_id||stream.runtimeId!==bot.runtime_id||bot.account_id!==scope.account.id||bot.environment!=='demo'||bot.runtime_blocked!==1)denied('BUILD_SOURCE_RUNTIME_UNCONFIRMED');
 if(bot.last_seen!==null&&(now<bot.last_seen||now-bot.last_seen<=15000))denied('BUILD_SOURCE_RUNTIME_STILL_REPORTED');
 if(Array.isArray(policy?.grants)&&policy.grants.some(g=>g.botId===botId||(g.accountId===scope.account.id&&g.environment===scope.account.environment)))denied('BUILD_SOURCE_GRANT_NOT_WITHDRAWN');
 const proposals=db.prepare("SELECT id,status,revision,base_revision,runtime_id,delivered_at,reason FROM proposals WHERE bot_id=? AND (status IN ('proposed','pending') OR (status='timed_out' AND delivered_at IS NOT NULL AND reason IS NOT 'BOT_ARCHIVED' AND reason IS NOT 'FULL_RESTORE')) ORDER BY id").all(botId);
 if(proposals.length)denied('BUILD_CONFIGURATION_UNRESOLVED');
 if(bot.revision!==bot.actual_revision||bot.actual===null||canonical(JSON.parse(bot.actual))!==canonical(JSON.parse(bot.desired)))denied('BUILD_CONFIGURATION_UNRESOLVED');
 const tokens=db.prepare("SELECT id,created_at,revoked_at FROM tokens WHERE bot_id=? AND kind='bridge' ORDER BY id").all(botId);
 if(!tokens.some(t=>t.id===binding.tokenId&&t.revoked_at===null))denied('BUILD_SOURCE_PAIRING_CHANGED');
 if(verifyEvents){
  const prefix=p+'sequence:'+scope.streamId+':',rows=db.prepare('SELECT key,value FROM kv WHERE key>=? AND key<?').all(prefix,prefix+'\uffff');if(rows.length!==stream.stored)denied('BUILD_SOURCE_INDEX_INVALID');
  const receipts=new Map();let max=0n;
  for(const row of rows){let link;try{link=JSON.parse(row.value);}catch{denied('BUILD_SOURCE_STORAGE_INVALID');}if(!object(link)||Object.keys(link).length!==1||typeof link.eventId!=='string')denied('BUILD_SOURCE_INDEX_INVALID');const r=read(p+'event:'+link.eventId);try{checkArchiveReceipt(r);}catch{denied('BUILD_SOURCE_EVENT_INVALID');}if(row.key!==prefix+r.event.sequence||r.streamId!==scope.streamId||r.event.eventId!==link.eventId||canonical(r.account)!==canonical(scope.account)||canonical(r.build)!==canonical(buildForSequence(lineage,r.event.sequence,stream.build)))denied('BUILD_SOURCE_INDEX_INVALID');receipts.set(r.event.sequence,r);if(BigInt(r.event.sequence)>max)max=BigInt(r.event.sequence);}
  if(max!==BigInt(stream.cursor)||BigInt(receipts.size)!==max)denied('BUILD_SOURCE_NOT_DRAINED');
  for(const k of criticalReferences){const r=receipts.get(k.receipt.sequence);if(!r||r.event.eventId!==k.receipt.eventId||r.event.payloadHash!==k.receipt.payloadHash||k.identityHash!==digest({type:r.event.type,sourceTime:r.event.sourceTime,correlationId:r.event.correlationId,causationId:r.event.causationId,payloadHash:r.event.payloadHash}))denied('BUILD_CRITICAL_RECEIPT_MISSING');}
  for(const r of receipts.values())if(r.event.type==='plan.recorded'){
   const x=read(p+'plan:'+digest({account:r.account,id:r.event.payload.planId}));if(!x||x.planHash!==digest(x.plan)||x.planHash!==r.event.payloadHash||canonical(x.plan)!==canonical(r.event.payload))denied('BUILD_ORIGINAL_PLAN_INDEX_INVALID');
  }
 }
 const context={bot:{id:bot.id,lifecycleRevision:bot.lifecycle_revision,revision:bot.revision,actualRevision:bot.actual_revision,actualHash:digest(JSON.parse(bot.actual)),desiredHash:digest(JSON.parse(bot.desired)),manifestHash:digest(manifest),runtimeId:bot.runtime_id,accountId:bot.account_id,environment:bot.environment,lastSeen:bot.last_seen,runtimeBlocked:bot.runtime_blocked,runtimeStatus:bot.runtime_status},stream,binding,totals,tokens,policyDigest:digest(policy),priorLineage:lineage?digest(lineage):null};
 return{context,digest:digest(context)};
}
