/** No mutation. A selected target must remain paired, blocked and tied to the
 * confirmed lineage. Ordinary pairing/heartbeat is not writer ownership proof. */
import {canonical,digest} from './schema.mjs';
import {object,fail} from './errors.mjs';
import {buildEntryBlocker,buildHoldKey,lineageKey,validateLineage,transitionHash} from './journal-build-lineage.mjs';
const bad=code=>fail(code,'Zielinstanz nicht bestätigt. Die Handelssperre bleibt bestehen.',409);
export function targetAdmissionContext(control,botId,transitionId,observerBotId){
 const {store,db}=control,bot=control.rawBot(botId),observer=control.rawBot(observerBotId);let job;
 try{job=store.get('corebuild:v1:review:'+transitionId);}catch{bad('TARGET_TRANSITION_INVALID');}
 if(!job||job.schema!==1||job.botId!==botId||job.reviewId!==transitionId||job.status!=='confirmed'||job.reviewDigest!==digest(job.review)||job.receipt?.receiptHash!==transitionHash(job.receipt))bad('TARGET_TRANSITION_REQUIRED');
 const r=job.review,hold=store.get(buildHoldKey(botId));if(buildEntryBlocker(store,botId)!=='BUILD_TRANSITION_REQUIRES_HANDOVER'||hold.transitionId!==transitionId)bad('TARGET_HOLD_REQUIRED');
 const lineage=validateLineage(store.get(lineageKey(botId,r.streamId)),{botId,streamId:r.streamId,account:r.account,build:r.toBuild});
 if(canonical(lineage.transitions.at(-1))!==canonical(job.receipt))bad('TARGET_TRANSITION_NOT_LATEST');
 for(const [b,id]of [[bot,'th3rev.ready20.v1'],[observer,'th3rev.observer.v1']]){const m=JSON.parse(b.manifest);if(b.archived_at!==null||b.adapter!=='bridge'||m.id!==id||m.version!=='1.0.0')bad('TARGET_PROFILE_REQUIRED');
  if(!b.runtime_id||b.account_id!==r.account.id||b.environment!=='demo'||b.runtime_status!=='connected'||b.runtime_blocked!==1||b.last_seen===null||control.now()<b.last_seen||control.now()-b.last_seen>15000)bad('TARGET_FRESH_BLOCKED_RUNTIME_REQUIRED');}
 if(bot.id===observer.id||bot.runtime_id===observer.runtime_id||hold.retiredRuntimeIds.includes(bot.runtime_id))bad('TARGET_DISTINCT_RUNTIME_REQUIRED');
 const binding=store.get('enginejournal:v1:'+botId+':binding');
 const token=binding&&db.prepare("SELECT id FROM tokens WHERE id=? AND bot_id=? AND kind='bridge' AND revoked_at IS NULL").get(binding.tokenId,botId);
 if(!token||binding.streamId!==r.streamId||canonical(binding.account)!==canonical(r.account))bad('TARGET_PAIRING_UNCONFIRMED');
 const policy=store.get('policy'),grants=policy?.blocked===true&&policy.grants===undefined?[]:policy?.grants;
 if(!object(policy)||typeof policy.blocked!=='boolean'||!Array.isArray(grants)||grants.some(g=>!object(g)||g.botId===botId||(g.accountId===r.account.id&&g.environment==='demo')))bad('TARGET_GRANT_PRESENT');
 if(bot.revision!==bot.actual_revision||bot.actual===null||canonical(JSON.parse(bot.actual))!==canonical(JSON.parse(bot.desired)))bad('TARGET_CONFIGURATION_UNCONFIRMED');
 const unresolved=db.prepare("SELECT id FROM proposals WHERE bot_id=? AND (status IN ('proposed','pending') OR (status='timed_out' AND delivered_at IS NOT NULL AND reason IS NOT 'BOT_ARCHIVED' AND reason IS NOT 'FULL_RESTORE'))").all(botId);if(unresolved.length)bad('TARGET_CONFIGURATION_UNRESOLVED');
 const other=db.prepare('SELECT id,manifest,runtime_status,runtime_id FROM bots WHERE account_id=? AND environment=? AND id<>? AND archived_at IS NULL').all(r.account.id,'demo',botId);
 if(other.some(x=>JSON.parse(x.manifest).id!=='th3rev.observer.v1'&&x.runtime_id!==null&&x.runtime_status!=='disconnected'))bad('TARGET_OTHER_WRITER_REPORTED');
 const identity={botId,transitionId,transitionHash:job.receipt.receiptHash,holdDigest:digest(hold),runtimeId:bot.runtime_id,tokenId:token.id,observerBotId,observerRuntimeId:observer.runtime_id,
 configuration:{revision:bot.revision,actualRevision:bot.actual_revision,actualHash:digest(JSON.parse(bot.actual)),desiredHash:digest(JSON.parse(bot.desired))},targetBuild:r.toBuild,account:r.account,streamId:r.streamId};
 return{confirmed:{reviewId:job.reviewId,reviewDigest:job.reviewDigest,review:job.review,receipt:job.receipt,hold},identity,identityDigest:digest(identity),policyDigest:digest(policy)};
}
export function captureTargetAdmission(control,selection,{includeViews=false}={}){
 const {botId,transitionId,observerBotId}=selection,state=targetAdmissionContext(control,botId,transitionId,observerBotId);
 // Actual validated existing views, not a second independently maintained copy.
 const actor={id:'local-human',kind:'human'};
 const engine=includeViews?control.engineJournal.viewForTargetAdmission(botId,actor):null,observer=includeViews?control.observation.view(observerBotId,actor):null;
 const p='enginejournal:v1:'+botId+':';
 const guard={identity:state.identity,policyDigest:state.policyDigest,engineStream:control.store.get(p+'stream:'+state.identity.streamId),engineTotals:control.store.get(p+'totals'),
  engineBot:{lastSeen:control.rawBot(botId).last_seen,sequence:control.rawBot(botId).sequence},observerState:control.store.get('observer:v1:state:'+observerBotId),
  observerBot:{lastSeen:control.rawBot(observerBotId).last_seen,sequence:control.rawBot(observerBotId).sequence},engineEpoch:control.engineJournal.epoch,observerEpoch:control.observation.epoch};
 const observerTokenId=guard.observerState?.tokenId;if(typeof observerTokenId!=='string')bad('TARGET_OBSERVER_PAIRING_MISSING');state.identity={...state.identity,observerTokenId};state.identityDigest=digest(state.identity);guard.identity=state.identity;
 return{...state,engine,observer,guardDigest:digest(guard)};
}
