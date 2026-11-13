import { fail, object, text } from './errors.mjs';
import { digest, validateManifest, validateValues } from './schema.mjs';

// One UTF-8 budget for every successful configuration export and import file.
// The small extra request budget is solely for the review/request-ID envelope.
export const MAX_RESTORE_FILE_BYTES=16*1024*1024;
export const MAX_RESTORE_REQUEST_BYTES=MAX_RESTORE_FILE_BYTES+64*1024;
export const MAX_RESTORE_BOTS=100;
export const MAX_RESTORE_RECEIPTS=50;
export const RESTORE_LIMITS=Object.freeze({maxFileBytes:MAX_RESTORE_FILE_BYTES,maxRequestBytes:MAX_RESTORE_REQUEST_BYTES,maxBots:MAX_RESTORE_BOTS,maxTotalBots:MAX_RESTORE_BOTS});
export const RESTORE_EFFECTS=Object.freeze({
  mode:'append',blocksControl:true,expiresPendingCommands:true,
  preservesExistingBots:true,preservesAccountConnection:true,preservesProvider:true,preservesChats:true,
  restoresActiveState:false,restoresCredentials:false,restoresEvents:false,
  resetsOnboarding:true,requiresReconnect:true
});

export function backupByteLength(raw){
  let encoded;
  try{encoded=JSON.stringify(raw);}catch{fail('BACKUP_INVALID','Die Sicherung enthält kein unterstütztes JSON.');}
  if(typeof encoded!=='string')fail('BACKUP_INVALID','Die Sicherung enthält kein gültiges JSON.');
  return Buffer.byteLength(encoded,'utf8');
}

export function parseRestoreBackup(raw){
  if(!object(raw)||raw.format!=='trading-local'||raw.schema!==1||!Array.isArray(raw.bots)||raw.bots.length>MAX_RESTORE_BOTS)fail('BACKUP_INVALID','Die Sicherung muss ein unterstützter Export mit höchstens 100 Botprofilen sein.');
  if(raw.bots.length===0)fail('BACKUP_EMPTY','Die Sicherung enthält keine Botprofile zum Wiederherstellen.');
  const bytes=backupByteLength(raw);
  if(bytes>MAX_RESTORE_FILE_BYTES)fail('BACKUP_TOO_LARGE','Die Konfigurationsdatei überschreitet die Grenze von 16 MiB.',413);
  const bots=raw.bots.map(entry=>{
    if(!object(entry)||!['bridge','ctrader-cli'].includes(entry.adapter))fail('BACKUP_INVALID','Ein Botprofil in der Sicherung ist nicht vollständig oder hat einen unbekannten Adapter.');
    const manifest=validateManifest(entry.manifest);
    return {name:text(entry.name,100,'Botname'),adapter:entry.adapter,manifest,values:validateValues(manifest,entry.desired)};
  });
  let fileDigest;
  // Includes ignored metadata too: a confirmation is bound to the supplied
  // document, while only the validated profile fields above may be imported.
  try{fileDigest=digest(raw);}catch{fail('BACKUP_INVALID','Die Sicherung ist zu tief verschachtelt oder enthält kein unterstütztes JSON.');}
  return {bots,bytes,fileDigest};
}

// Do not call Control.bot(s), releaseReview or expire here. A preview must not
// time out a command, write an event or change a runtime merely by being opened.
export function readRestoreSnapshot(store){
  const bots=store.db.prepare('SELECT id,name,adapter,revision,actual,actual_revision,runtime_id,account_id,environment,runtime_status,archived_at,lifecycle_revision FROM bots ORDER BY id').all().map(row=>({
    id:row.id,name:row.name,adapter:row.adapter,revision:row.revision,actualRevision:row.actual_revision,
    runtimeId:row.runtime_id,accountId:row.account_id,environment:row.environment,runtimeStatus:row.runtime_status,
    archivedAt:row.archived_at,lifecycleRevision:row.lifecycle_revision,
    actualDigest:digest(row.actual?JSON.parse(row.actual):null)
  }));
  const pending=store.db.prepare("SELECT id,bot_id,revision,status,runtime_id,base_revision,digest,delivered_at FROM proposals WHERE status='pending' ORDER BY id").all();
  return {profileId:store.get('profile')?.id??null,bots,policy:store.get('policy'),onboarding:store.get('onboarding'),pending};
}

export function restorePreview(parsed,snapshot){
  const activeBots=snapshot.bots.filter(bot=>bot.archivedAt==null).length;
  const totalBots=activeBots+parsed.bots.length;
  if(totalBots>MAX_RESTORE_BOTS)fail('BOT_LIMIT','Aktive und importierte Profile würden zusammen die Grenze von 100 überschreiten. Zuerst ein Profil archivieren.',409);
  const seen=new Set(snapshot.bots.map(bot=>bot.name)),duplicates=new Set();
  for(const bot of parsed.bots){if(seen.has(bot.name))duplicates.add(bot.name);seen.add(bot.name);}
  return {
    reviewDigest:digest({fileDigest:parsed.fileDigest,state:snapshot}),fileDigest:parsed.fileDigest,
    summary:{importedBots:parsed.bots.length,existingBots:activeBots,totalBots,pendingCommands:snapshot.pending.length,
      activeGrants:snapshot.policy?.blocked===false&&Array.isArray(snapshot.policy.grants)?snapshot.policy.grants.length:0},
    profileCounts:{active:activeBots,archived:snapshot.bots.length-activeBots,total:snapshot.bots.length},
    bots:parsed.bots.map(bot=>({name:bot.name,profileId:bot.manifest.id,parameterCount:bot.manifest.parameters.length,adapter:bot.adapter})),
    duplicateNames:[...duplicates].sort(),effects:RESTORE_EFFECTS,limits:RESTORE_LIMITS
  };
}

export function restoreRequestId(review){
  if(!object(review)||typeof review.reviewDigest!=='string'||!/^[a-f0-9]{64}$/.test(review.reviewDigest))fail('RESTORE_REVIEW_REQUIRED','Die Wiederherstellung benötigt eine gültige Vorschau und deren bewusste Bestätigung.',409);
  if(typeof review.requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(review.requestId))fail('RESTORE_REQUEST_ID_INVALID','Eine gültige eindeutige Anfragekennung für die Wiederherstellung fehlt.');
  return review.requestId.toLowerCase();
}
