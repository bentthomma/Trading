/** Sequence-bound build provenance. A lineage is history, never an execution
 * grant, an independent broker proof or a claim that another process stopped. */
import {canonical,digest} from './schema.mjs';
import {fail,object} from './errors.mjs';
export const LINEAGE_FORMAT='th3.core-journal.build-lineage/1';
export const BUILD_TRANSITION_SAFETY=Object.freeze({grantsTrading:false,writerHandoverVerified:false,targetBinaryVerified:false,brokerStateVerified:false,nativeJournalActivated:false});
export const lineageKey=(botId,streamId)=>'enginejournal:v1:'+botId+':lineage:'+streamId;
export const buildHoldKey=botId=>'corebuild:v1:hold:'+botId;
export const invalidLineage=()=>fail('JOURNAL_BUILD_HISTORY_INVALID','Die gespeicherte Buildfolge ist nicht vollständig bestätigt. Keine Handelsfreigabe.',409);
export function exactObject(v,keys){if(!object(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))invalidLineage();}
export const hashString=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export const namedId=v=>typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,100}$/.test(v);
export const sequenceString=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(v)&&BigInt(v)<=9223372036854775807n;
export const isoTime=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
export function checkedBuild(b){exactObject(b,['engine','version','sourceHash']);if(b.engine!=='Th3Revolution20'||typeof b.version!=='string'||!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?$/.test(b.version)||b.version.length>50||!hashString(b.sourceHash))invalidLineage();return b;}
export function checkedAccount(a){exactObject(a,['broker','id','environment','currency']);for(const k of ['broker','id','currency'])if(typeof a[k]!=='string'||!a[k].length||a[k].length>100||/[\u0000-\u001f\u007f-\u009f]/.test(a[k]))invalidLineage();if(a.environment!=='demo'||!/^[A-Z0-9]{3,12}$/.test(a.currency))invalidLineage();return a;}
export function transitionHash(row){const {receiptHash,...body}=row;return digest(body);}
export function validateLineage(v,{botId,streamId,account,build,cursor}={}){
 exactObject(v,['format','botId','streamId','account','originBuild','transitions']);if(v.format!==LINEAGE_FORMAT||!namedId(v.botId)||!namedId(v.streamId)||!Array.isArray(v.transitions)||v.transitions.length<1||v.transitions.length>32)invalidLineage();
 checkedAccount(v.account);checkedBuild(v.originBuild);if(botId&&v.botId!==botId||streamId&&v.streamId!==streamId||account&&canonical(v.account)!==canonical(account))invalidLineage();
 let current=v.originBuild,cutoff=-1n,previous='0'.repeat(64),at=-Infinity;const seen=new Set([canonical(current)]),ids=new Set();
 for(const t of v.transitions){
  exactObject(t,['transitionId','fromBuild','toBuild','afterSequence','confirmedAt','sourceRuntimeId','evidenceDigest','previousHash','receiptHash','safety']);checkedBuild(t.fromBuild);checkedBuild(t.toBuild);
  if(!namedId(t.transitionId)||ids.has(t.transitionId)||!sequenceString(t.afterSequence)||BigInt(t.afterSequence)<=cutoff||!isoTime(t.confirmedAt)||Date.parse(t.confirmedAt)<at||!namedId(t.sourceRuntimeId)||!hashString(t.evidenceDigest)||t.previousHash!==previous||!hashString(t.receiptHash)||t.receiptHash!==transitionHash(t)||canonical(t.safety)!==canonical(BUILD_TRANSITION_SAFETY)||canonical(t.fromBuild)!==canonical(current)||seen.has(canonical(t.toBuild))||t.toBuild.sourceHash===current.sourceHash)invalidLineage();
  ids.add(t.transitionId);current=t.toBuild;seen.add(canonical(current));cutoff=BigInt(t.afterSequence);previous=t.receiptHash;at=Date.parse(t.confirmedAt);
 }
 if(build&&canonical(current)!==canonical(build)||cursor!==undefined&&(!sequenceString(cursor)||BigInt(cursor)<cutoff))invalidLineage();return v;
}
export function buildForSequence(lineage,sequence,fallback){
 if(!lineage)return fallback;if(!sequenceString(sequence)||sequence==='0')invalidLineage();let b=lineage.originBuild;for(const t of lineage.transitions){if(BigInt(sequence)>BigInt(t.afterSequence))b=t.toBuild;else break;}return b;
}
export function readLineage(store,botId,stream){let x;try{x=store.get(lineageKey(botId,stream.streamId));}catch{invalidLineage();}return x===null?null:validateLineage(x,{botId,streamId:stream.streamId,account:stream.account,build:stream.build,cursor:stream.cursor});}
// Hold is deliberately not cleared by heartbeat, pairing, global release,
// archive/reactivation, or a database restart. Native handover is a later gate.
export function buildEntryBlocker(store,botId){
 try{
  const hold=store.get(buildHoldKey(botId));
  const lineages=store.db.prepare('SELECT 1 FROM kv WHERE key>=? AND key<? LIMIT 1').get('enginejournal:v1:'+botId+':lineage:','enginejournal:v1:'+botId+':lineage:\uffff');
  if(!hold){
   if(lineages)return 'BUILD_TRANSITION_STATE_INVALID';
   const bot=store.db.prepare('SELECT account_id,environment FROM bots WHERE id=?').get(botId);
   const rows=store.db.prepare('SELECT value FROM kv WHERE key>=? AND key<?').all('corebuild:v1:hold:','corebuild:v1:hold:\uffff');
   for(const row of rows){let other;try{other=JSON.parse(row.value);checkedAccount(other.account);}catch{return 'BUILD_TRANSITION_STATE_INVALID';}
    if(bot?.account_id&&other.account.id===bot.account_id&&other.account.environment===bot.environment)return 'BUILD_ACCOUNT_HANDOVER_REQUIRED';}
   return null;
  }
  exactObject(hold,['schema','botId','streamId','account','transitionId','receiptHash','retiredRuntimeIds','requiresNativeWriterHandover']);checkedAccount(hold.account);
  if(hold.schema!==1||hold.botId!==botId||!namedId(hold.streamId)||!namedId(hold.transitionId)||!hashString(hold.receiptHash)||hold.requiresNativeWriterHandover!==true||!Array.isArray(hold.retiredRuntimeIds)||!hold.retiredRuntimeIds.length||hold.retiredRuntimeIds.length>32||hold.retiredRuntimeIds.some(r=>!namedId(r))||new Set(hold.retiredRuntimeIds).size!==hold.retiredRuntimeIds.length)return 'BUILD_TRANSITION_STATE_INVALID';
  const v=validateLineage(store.get(lineageKey(botId,hold.streamId)),{botId,streamId:hold.streamId,account:hold.account}),last=v.transitions.at(-1);
  if(last.transitionId!==hold.transitionId||last.receiptHash!==hold.receiptHash||canonical(hold.retiredRuntimeIds)!==canonical(v.transitions.map(t=>t.sourceRuntimeId)))return 'BUILD_TRANSITION_STATE_INVALID';
  return 'BUILD_TRANSITION_REQUIRES_HANDOVER';
 }catch{return 'BUILD_TRANSITION_STATE_INVALID';}
}
export function assertBuildHeartbeat(control,input){
 const reason=buildEntryBlocker(control.store,input.botId);if(!reason)return;
 if(reason==='BUILD_ACCOUNT_HANDOVER_REQUIRED')return;
 if(reason==='BUILD_TRANSITION_STATE_INVALID')fail(reason,'Buildübergang unbestätigt. Die Daten müssen geprüft werden.',409);
 const hold=control.store.get(buildHoldKey(input.botId));
 if(hold.retiredRuntimeIds.includes(input.runtimeId))fail('BUILD_RUNTIME_RETIRED','Die alte Instanz ist für diesen Journalübergang ausgeschieden. Sie darf keine neue Zuständigkeit übernehmen.',409);
 if(String(input.accountId)!==hold.account.id||input.environment!==hold.account.environment||input.blocked!==true)fail('BUILD_TRANSITION_READ_ONLY','Nach dem Buildübergang ist nur die passende gesperrte Instanz zur Beobachtung erlaubt.',409);
}
