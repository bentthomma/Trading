import { DatabaseSync } from 'node:sqlite';
import { constants, lstatSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { open, lstat, opendir, copyFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { fail, HubError, object } from './errors.mjs';
import { digest, validateManifest, validateValues } from './schema.mjs';
import { CURRENT_SCHEMA_VERSION, inspectDatabaseSchema, migrateDatabase } from './store.mjs';
import { acquireProfileLock } from './profile-lock.mjs';
import { HASH, UUID, SNAPSHOT_NAME, MIGRATION_NAME, PRE_RESTORE_NAME, PRE_UPDATE_NAME, isTerminal, jobId, nowValue, iso, maintenancePaths, pathExists, checkedDirectory, syncFile, syncDirectory, readPrivateJob, readStoredJobs, readActiveJob, writeJob, activateJob, clearActiveJob, pidAlive } from './maintenance-journal.mjs';

export const FULL_RESTORE_LIMITS=Object.freeze({maxBackupBytes:128*1024*1024,maxBackups:256,retainedJobs:50});
export const FULL_RESTORE_EFFECTS=Object.freeze({mode:'replace',replacesBots:true,replacesChats:true,replacesEvents:true,replacesSnapshots:true,createsPreRestoreBackup:true,blocksControl:true,revokesAllAccessTokens:true,expiresPendingCommands:true,clearsRuntimeState:true,disconnectsAccount:true,disconnectsProvider:true,requiresReconnect:true,restartsLocalCore:true,preservesExistingVault:true,originalSourceReadOnly:true});
const SNAPSHOT_FOLDERS=Object.freeze([
  {kind:'snapshot',folder:'backups',pattern:SNAPSHOT_NAME},
  {kind:'before_restore',folder:'maintenance/backups',pattern:PRE_RESTORE_NAME},
  {kind:'before_migration',folder:'migration-backups',pattern:MIGRATION_NAME},
  {kind:'before_update',folder:'deployment-backups',pattern:PRE_UPDATE_NAME}
]);
const ERRORS=Object.freeze({
  RESTORE_SOURCE_CHANGED:'Die ausgewählte Sicherung wurde verändert oder entfernt. Eine neue Vorschau ist erforderlich.',
  RESTORE_SOURCE_INVALID:'Die ausgewählte Datei ist keine intakte, unterstützte lokale Sicherung.',
  RESTORE_BACKUP_FAILED:'Die Sicherung des bisherigen Datenstands konnte nicht bestätigt werden. Der Austausch wurde nicht freigegeben.',
  RESTORE_NOT_STARTED:'Die Wiederherstellung wurde vor dem Austausch beendet. Der bisherige Datenstand bleibt erhalten.',
  RESTORE_INTERRUPTED:'Die Wiederherstellung wurde unterbrochen. Der vorherige Datenstand wurde wiederhergestellt.',
  RESTORE_FAILED:'Die Wiederherstellung konnte nicht abgeschlossen werden. Der vorherige Datenstand wurde beibehalten oder wiederhergestellt.',
  RESTORE_RECOVERY_REQUIRED:'Der Datenstand muss vor dem nächsten Start aus dem gesicherten Wartungsnachweis geklärt werden.',
  RESTORE_TARGET_CHANGED:'Das Zielprofil entspricht nicht mehr der bestätigten Wiederherstellung.',
  MAINTENANCE_IN_PROGRESS:'Eine Wiederherstellung verwendet dieses Profil bereits.',
  MAINTENANCE_JOURNAL_INVALID:'Der lokale Wartungsnachweis ist unvollständig oder beschädigt.'
});
const stableFile=(a,b)=>a.isFile()&&b.isFile()&&!a.isSymbolicLink()&&!b.isSymbolicLink()&&a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs;
const backupId=(kind,filename)=>createHash('sha256').update(kind+'\0'+filename).digest('hex');
function sourcePath(directory,source){
  const definition=SNAPSHOT_FOLDERS.find(item=>item.kind===source.kind);
  if(!definition||!definition.pattern.test(source.filename)||source.id!==backupId(source.kind,source.filename))fail('RESTORE_SOURCE_INVALID',ERRORS.RESTORE_SOURCE_INVALID);
  const pieces=definition.folder.split('/');let parent=directory;
  checkedDirectory(parent);
  for(const piece of pieces){parent=join(parent,piece);checkedDirectory(parent);}
  return join(parent,source.filename);
}
function safeError(error,fallback='RESTORE_FAILED'){
  const code=Object.hasOwn(ERRORS,error?.code)?error.code:fallback;
  return {code,message:ERRORS[code]};
}
function publicJob(job){
  return {id:job.id,state:job.state,stage:job.stage,createdAt:job.createdAt,updatedAt:job.updatedAt,finishedAt:job.finishedAt,
    preRestoreBackupId:job.preRestoreBackupId,error:job.error?safeError(job.error):null};
}
async function hashFile(path){
  const before=await lstat(path);
  if(!before.isFile()||before.isSymbolicLink()||before.size<100||before.size>FULL_RESTORE_LIMITS.maxBackupBytes)fail('RESTORE_SOURCE_INVALID',ERRORS.RESTORE_SOURCE_INVALID);
  const file=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));let count=0;
  try{
    if(!stableFile(before,await file.stat()))fail('RESTORE_SOURCE_CHANGED',ERRORS.RESTORE_SOURCE_CHANGED,409);
    const hash=createHash('sha256'),buffer=Buffer.allocUnsafe(65536);
    for(;;){const read=await file.read(buffer,0,buffer.length,null);if(!read.bytesRead)break;count+=read.bytesRead;if(count>FULL_RESTORE_LIMITS.maxBackupBytes)fail('RESTORE_SOURCE_INVALID',ERRORS.RESTORE_SOURCE_INVALID);hash.update(buffer.subarray(0,read.bytesRead));}
    if(count!==before.size||!stableFile(before,await file.stat())||!stableFile(before,await lstat(path)))fail('RESTORE_SOURCE_CHANGED',ERRORS.RESTORE_SOURCE_CHANGED,409);
    return {bytes:count,sha256:hash.digest('hex'),stat:before};
  }finally{await file.close();}
}
function readOnlyDatabase(path){
  for(const suffix of ['-wal','-shm','-journal'])if(pathExists(path+suffix))fail('RESTORE_SOURCE_INVALID','Die Sicherung besitzt aktive Begleitdateien. Einen abgeschlossenen Sicherungsstand wählen.');
  const uri=pathToFileURL(path);uri.searchParams.set('mode','ro');uri.searchParams.set('immutable','1');
  return new DatabaseSync(uri.href,{readOnly:true,allowExtension:false,enableForeignKeyConstraints:true,timeout:100});
}
function profile(db){
  const row=db.prepare("SELECT value FROM kv WHERE key='profile'").get();let value;
  try{value=JSON.parse(row?.value);}catch{fail('RESTORE_SOURCE_INVALID',ERRORS.RESTORE_SOURCE_INVALID);}
  if(!object(value)||typeof value.id!=='string'||!UUID.test(value.id)||typeof value.name!=='string'||!value.name.trim()||value.name.length>100)fail('RESTORE_SOURCE_INVALID',ERRORS.RESTORE_SOURCE_INVALID);
  return value;
}
function counts(db,schemaVersion){
  const result=Object.fromEntries(['bots','messages','events','snapshots'].map(table=>[table,Number(db.prepare('SELECT count(*) AS n FROM '+table).get().n)]));
  result.archivedBots=schemaVersion>=2?Number(db.prepare('SELECT count(*) AS n FROM bots WHERE archived_at IS NOT NULL').get().n):0;
  return result;
}
function semanticCheck(db,schemaVersion){
  const jsonColumns={kv:['value'],bots:['manifest','desired','actual'],proposals:['values_json'],events:['data'],messages:['tools'],snapshots:['data']};
  for(const [table,columns] of Object.entries(jsonColumns))for(const column of columns)
    if(db.prepare('SELECT 1 FROM '+table+' WHERE '+column+' IS NOT NULL AND NOT json_valid('+column+') LIMIT 1').get())fail('RESTORE_SOURCE_INVALID',ERRORS.RESTORE_SOURCE_INVALID);
  profile(db);
  const current=counts(db,schemaVersion);if(current.bots-current.archivedBots>100)fail('RESTORE_SOURCE_INVALID','Die Sicherung enthält mehr als 100 aktive Botprofile.');
  const started=Date.now();let seen=0;
  for(const row of db.prepare('SELECT adapter,manifest,desired,revision,actual_revision FROM bots').iterate()){
    if(!['bridge','ctrader-cli'].includes(row.adapter)||!Number.isSafeInteger(row.revision)||row.revision<0||!Number.isSafeInteger(row.actual_revision)||row.actual_revision<0)fail('RESTORE_SOURCE_INVALID',ERRORS.RESTORE_SOURCE_INVALID);
    try{const manifest=validateManifest(JSON.parse(row.manifest));validateValues(manifest,JSON.parse(row.desired));}
    catch{fail('RESTORE_SOURCE_INVALID',ERRORS.RESTORE_SOURCE_INVALID);}
    if(++seen%100===0&&Date.now()-started>15000)fail('RESTORE_SOURCE_INVALID','Die Sicherung überschreitet die begrenzte Inhaltsprüfung.');
  }
  return current;
}
async function inspectSource(path){
  const hashed=await hashFile(path);let db;
  try{
    db=readOnlyDatabase(path);const result=inspectDatabaseSchema(db,{allowLegacy:true});
    if(!result.schemaCompatible||result.integrity!=='ok')fail('RESTORE_SOURCE_INVALID',ERRORS.RESTORE_SOURCE_INVALID);
    const summary=semanticCheck(db,result.schemaVersion),sourceProfile=profile(db);
    if(!stableFile(hashed.stat,await lstat(path)))fail('RESTORE_SOURCE_CHANGED',ERRORS.RESTORE_SOURCE_CHANGED,409);
    for(const suffix of ['-wal','-shm','-journal'])if(pathExists(path+suffix))fail('RESTORE_SOURCE_CHANGED',ERRORS.RESTORE_SOURCE_CHANGED,409);
    return {bytes:hashed.bytes,sha256:hashed.sha256,schemaVersion:result.schemaVersion,summary,profileId:sourceProfile.id};
  }catch(error){if(error instanceof HubError)throw error;fail('RESTORE_SOURCE_INVALID',ERRORS.RESTORE_SOURCE_INVALID);}
  finally{db?.close();}
}
async function scanBackups(directory){
  const found=[];
  for(const definition of SNAPSHOT_FOLDERS){
    let parent=directory,missing=false;
    checkedDirectory(parent);
    for(const piece of definition.folder.split('/')){parent=join(parent,piece);if(!pathExists(parent)){missing=true;break;}checkedDirectory(parent);}
    if(missing)continue;
    let scanned=0;
    for await(const entry of await opendir(parent)){
      if(++scanned>FULL_RESTORE_LIMITS.maxBackups)fail('RESTORE_LIST_LIMIT','Es sind zu viele Sicherungsdateien für eine vollständige Auswahlprüfung vorhanden.',409);
      if(!definition.pattern.test(entry.name))continue;
      if(!entry.isFile()||entry.isSymbolicLink())fail('RESTORE_SOURCE_INVALID','Ein Sicherungseintrag ist kein regulärer lokaler Dateistand.');
      const info=await lstat(join(parent,entry.name));
      if(!info.isFile()||info.isSymbolicLink())fail('RESTORE_SOURCE_INVALID',ERRORS.RESTORE_SOURCE_INVALID);
      found.push({id:backupId(definition.kind,entry.name),kind:definition.kind,filename:entry.name,createdAt:iso(info.mtimeMs),bytes:info.size});
    }
  }
  if(found.length>FULL_RESTORE_LIMITS.maxBackups)fail('RESTORE_LIST_LIMIT','Es sind zu viele Sicherungsdateien für eine vollständige Auswahlprüfung vorhanden.',409);
  return found.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
}
export async function listRecoveryBackups({directory}={}){
  return {backups:(await scanBackups(directory)).map(({id,kind,createdAt,bytes})=>({id,kind,createdAt,bytes})),limits:FULL_RESTORE_LIMITS};
}
async function selectedBackup(directory,id){
  if(typeof id!=='string'||!HASH.test(id))fail('RESTORE_BACKUP_INVALID','Eine gültige lokale Sicherung auswählen.');
  const source=(await scanBackups(directory)).find(item=>item.id===id);
  if(!source)fail('RESTORE_BACKUP_NOT_FOUND','Die ausgewählte Sicherung ist nicht mehr vorhanden. Die Liste erneut laden.',404);
  return source;
}
function targetSnapshot(store){
  const connection=store.get('connection'),provider=store.get('provider');
  const identity=connection?{mode:connection.mode,connectionId:connection.connectionId,accountId:connection.accountId,environment:connection.environment}:null;
  return {profileId:profile(store.db).id,policy:store.get('policy'),onboarding:store.get('onboarding'),connection:identity,provider,cliPath:store.get('cliPath'),
    bots:store.db.prepare('SELECT id,revision,actual_revision,runtime_id,account_id,environment,runtime_status,archived_at,lifecycle_revision FROM bots ORDER BY id').all(),
    pending:store.db.prepare("SELECT id,bot_id,revision,runtime_id,delivered_at FROM proposals WHERE status='pending' ORDER BY id").all(),
    latestMessage:store.db.prepare('SELECT max(id) AS id FROM messages').get().id};
}
function reviewDigest(source,inspected,target){return digest({source:{id:source.id,sha256:inspected.sha256,bytes:inspected.bytes,schemaVersion:inspected.schemaVersion},target,effects:FULL_RESTORE_EFFECTS,targetSchema:CURRENT_SCHEMA_VERSION});}
export async function previewFullRestore({store,directory,backupId:id,now}={}){
  const source=await selectedBackup(directory,id),inspected=await inspectSource(sourcePath(directory,source)),target=targetSnapshot(store);
  return {backup:{id:source.id,kind:source.kind,createdAt:source.createdAt,bytes:inspected.bytes,sha256:inspected.sha256,schemaVersion:inspected.schemaVersion},
    reviewDigest:reviewDigest(source,inspected,target),current:counts(store.db,CURRENT_SCHEMA_VERSION),restored:inspected.summary,effects:FULL_RESTORE_EFFECTS,limits:FULL_RESTORE_LIMITS,
    targetSchemaVersion:CURRENT_SCHEMA_VERSION,migrationRequired:inspected.schemaVersion<CURRENT_SCHEMA_VERSION,checkedAt:iso(nowValue(now))};
}
const rememberedJobs=directory=>readStoredJobs(directory).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||b.createdAt.localeCompare(a.createdAt));
function pruneJobs(directory){
  const active=readActiveJob(directory),terminal=rememberedJobs(directory).filter(job=>isTerminal(job)&&job.id!==active?.id);
  for(const job of terminal.slice(FULL_RESTORE_LIMITS.retainedJobs))unlinkSync(maintenancePaths(directory,job.id).job);
}
export async function prepareRestoreJob({store,directory,backupId:id,reviewDigest:review,requestId,confirmation,now}={}){
  const idValue=jobId(requestId);
  if(confirmation!=='replace-profile')fail('RESTORE_CONFIRMATION_REQUIRED','Den vollständigen Austausch des Datenstands ausdrücklich bestätigen.',409);
  if(typeof review!=='string'||!HASH.test(review))fail('RESTORE_REVIEW_REQUIRED','Vor der Wiederherstellung wird eine gültige Vorschau benötigt.',409);
  const requestDigest=digest({backupId:id,reviewDigest:review,confirmation}),previous=readPrivateJob(directory,idValue,{missing:true}),active=readActiveJob(directory);
  if(previous){
    if(previous.requestDigest!==requestDigest)fail('IDEMPOTENCY_CONFLICT','Diese Anfragekennung gehört zu einer anderen Wiederherstellungsentscheidung.',409);
    if(isTerminal(previous)||active?.id===idValue)return {job:publicJob(previous),replayed:true};
    fail('RESTORE_REVIEW_REQUIRED','Der frühere Auftrag wurde nicht gestartet. Eine neue Vorschau und Anfragekennung verwenden.',409);
  }
  if(active&&!isTerminal(active))fail('MAINTENANCE_IN_PROGRESS',ERRORS.MAINTENANCE_IN_PROGRESS,409);
  if(readStoredJobs(directory).some(job=>!isTerminal(job)))fail('MAINTENANCE_IN_PROGRESS','Ein früherer Wartungsauftrag muss vor einer neuen Wiederherstellung geklärt werden.',409);
  const source=await selectedBackup(directory,id),inspected=await inspectSource(sourcePath(directory,source)),target=targetSnapshot(store);
  if(reviewDigest(source,inspected,target)!==review)fail('RESTORE_REVIEW_CHANGED','Die Sicherung oder der relevante Profilstand hat sich geändert. Die Vorschau erneut prüfen.',409);
  const stamp=iso(nowValue(now));
  const job={format:'trading-local-restore-job',schema:1,id:idValue,requestDigest,reviewDigest:review,state:'prepared',stage:'prepared',createdAt:stamp,updatedAt:stamp,finishedAt:null,
    ownerPid:process.pid,workerPid:null,targetProfileId:target.profileId,targetDigest:digest(target),source:{...source,bytes:inspected.bytes,sha256:inspected.sha256,schemaVersion:inspected.schemaVersion},
    targetPort:store.get('listenPort'),safeToOpen:false,preRestoreBackupId:null,preRestoreSha256:null,stagedSha256:null,error:null};
  // Validation/pruning may fail, so it must complete before the durable commit.
  // Once active.json exists, the caller always receives the persisted receipt.
  pruneJobs(directory);writeJob(directory,job);
  try{activateJob(directory,job.id);}catch(error){writeJob(directory,{...job,state:'failed',stage:'failed',safeToOpen:true,finishedAt:stamp,error:safeError(error)});throw error;}
  return {job:publicJob(job),replayed:false};
}
export async function readRestoreJob({directory,jobId:id}={}){return publicJob(readPrivateJob(directory,id));}
export async function getLatestRestoreJob({directory}={}){
  const job=readActiveJob(directory)||rememberedJobs(directory)[0];return job?publicJob(job):null;
}
function sourceMatches(job,inspected){return inspected.sha256===job.source.sha256&&inspected.bytes===job.source.bytes&&inspected.schemaVersion===job.source.schemaVersion;}
async function updateJob(directory,job,values,now,failpoint){
  Object.assign(job,values,{updatedAt:iso(nowValue(now))});writeJob(directory,job);await failpoint?.(job.stage);return job;
}
function removeOwned(path){
  if(!pathExists(path))return;const info=lstatSync(path);if(!info.isFile()||info.isSymbolicLink())fail('MAINTENANCE_JOURNAL_INVALID',ERRORS.MAINTENANCE_JOURNAL_INVALID,503);unlinkSync(path);
}
function cleanupStage(paths){
  for(const path of [paths.stage,paths.stageMigration,paths.rollbackStage])for(const suffix of ['','-wal','-shm','-journal'])removeOwned(path+suffix);
}
function ensureNoSidecars(path){
  for(const suffix of ['-wal','-shm','-journal'])if(pathExists(path+suffix))fail('RESTORE_RECOVERY_REQUIRED','Die Datenbank besitzt noch aktive Begleitdateien und wird nicht ausgetauscht.',503);
}
async function verifyCurrent(paths,job,{sanitized=false}={}){
  const inspected=await inspectSource(paths.database);
  if(inspected.profileId!==job.targetProfileId)fail('RESTORE_TARGET_CHANGED',ERRORS.RESTORE_TARGET_CHANGED,409);
  if(sanitized){
    let db;try{db=readOnlyDatabase(paths.database);assertSanitized(db,job);}finally{db?.close();}
  }
  return inspected;
}
function setValue(db,key,value){db.prepare('INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));}
function assertSanitized(db,job){
  let policy,connection,provider;
  try{policy=JSON.parse(db.prepare("SELECT value FROM kv WHERE key='policy'").get()?.value);connection=JSON.parse(db.prepare("SELECT value FROM kv WHERE key='connection'").get()?.value);provider=JSON.parse(db.prepare("SELECT value FROM kv WHERE key='provider'").get()?.value);}catch{fail('RESTORE_RECOVERY_REQUIRED',ERRORS.RESTORE_RECOVERY_REQUIRED,503);}
  if(!object(policy)||policy.blocked!==true||Array.isArray(policy.grants)&&policy.grants.length||connection!==null||provider!==null||
    profile(db).id!==job.targetProfileId||db.prepare('SELECT 1 FROM tokens WHERE revoked_at IS NULL OR can_propose<>0 LIMIT 1').get()||
    db.prepare("SELECT 1 FROM proposals WHERE status IN ('proposed','pending') LIMIT 1").get()||
    db.prepare("SELECT 1 FROM bots WHERE actual IS NOT NULL OR actual_revision<>0 OR runtime_id IS NOT NULL OR account_id IS NOT NULL OR environment IS NOT NULL OR last_seen IS NOT NULL OR sequence<>-1 OR runtime_blocked<>1 OR runtime_status<>'disconnected' LIMIT 1").get())
    fail('RESTORE_RECOVERY_REQUIRED',ERRORS.RESTORE_RECOVERY_REQUIRED,503);
}
function sanitizeStage(db,job,now){
  const stamp=nowValue(now),restoredProfile=profile(db);
  db.exec('BEGIN IMMEDIATE');
  try{
    db.prepare('UPDATE tokens SET revoked_at=COALESCE(revoked_at,?),can_propose=0').run(stamp);
    db.exec("UPDATE proposals SET status='timed_out',reason='FULL_RESTORE' WHERE (reason IS NULL OR reason<>'BOT_ARCHIVED') AND (status='pending' OR (status='timed_out' AND delivered_at IS NOT NULL)); UPDATE proposals SET status='cancelled',reason='FULL_RESTORE' WHERE status='proposed';");
    db.exec("UPDATE bots SET actual=NULL,actual_revision=0,runtime_id=NULL,account_id=NULL,environment=NULL,last_seen=NULL,sequence=-1,runtime_blocked=1,runtime_status='disconnected';");
    db.exec("DELETE FROM kv WHERE key LIKE 'agentActivity:%' OR key LIKE 'fault:%' OR key LIKE 'botImportEvidence:%';");
    setValue(db,'profile',{...restoredProfile,id:job.targetProfileId});
    setValue(db,'policy',{blocked:true,changedAt:iso(stamp),decisionId:randomUUID()});
    setValue(db,'onboarding',{step:3,completed:false});
    setValue(db,'connection',null);setValue(db,'provider',null);setValue(db,'cliPath',null);
    setValue(db,'restoreReceipts',[]);setValue(db,'lastBackupDay',null);
    if(Number.isSafeInteger(job.targetPort)&&job.targetPort>0&&job.targetPort<=65535)setValue(db,'listenPort',job.targetPort);
    else db.prepare("DELETE FROM kv WHERE key='listenPort'").run();
    db.prepare("INSERT INTO events(id,time,type,bot_id,actor,data) VALUES(?,?,?,NULL,?,?)").run(randomUUID(),stamp,'backup.full_restored','system',JSON.stringify({jobId:job.id,sourceSchema:job.source.schemaVersion,accessRevoked:true}));
    assertSanitized(db,job);db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
}
async function preRestoreBackup(paths,job){
  const before=await lstat(paths.database);if(!before.isFile()||before.isSymbolicLink())fail('RESTORE_TARGET_CHANGED',ERRORS.RESTORE_TARGET_CHANGED,409);
  let db,created=false;
  try{
    db=new DatabaseSync(paths.database,{allowExtension:false,enableForeignKeyConstraints:true,timeout:3000});
    const check=inspectDatabaseSchema(db,{allowLegacy:true});if(!check.schemaCompatible||check.integrity!=='ok'||profile(db).id!==job.targetProfileId)fail('RESTORE_TARGET_CHANGED',ERRORS.RESTORE_TARGET_CHANGED,409);
    const target=targetSnapshot({db,get:key=>{const row=db.prepare('SELECT value FROM kv WHERE key=?').get(key);return row?JSON.parse(row.value):null;}});
    if(digest(target)!==job.targetDigest)fail('RESTORE_TARGET_CHANGED',ERRORS.RESTORE_TARGET_CHANGED,409);
    const pageCount=db.prepare('PRAGMA page_count').get().page_count,pageSize=db.prepare('PRAGMA page_size').get().page_size;
    if(pageCount*pageSize>FULL_RESTORE_LIMITS.maxBackupBytes)fail('RESTORE_BACKUP_FAILED',ERRORS.RESTORE_BACKUP_FAILED,503);
    const fd=openSync(paths.preRestore,'wx',0o600);created=true;closeSync(fd);
    db.exec('PRAGMA synchronous=FULL');db.prepare('VACUUM INTO ?').run(paths.preRestore);
    const checkpoint=db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
    if(checkpoint.busy!==0)fail('RESTORE_BACKUP_FAILED',ERRORS.RESTORE_BACKUP_FAILED,503);
    db.close();db=null;ensureNoSidecars(paths.database);syncFile(paths.preRestore);syncDirectory(paths.backups);
    const backup=await inspectSource(paths.preRestore);if(backup.profileId!==job.targetProfileId)fail('RESTORE_BACKUP_FAILED',ERRORS.RESTORE_BACKUP_FAILED,503);
    return backup;
  }catch(error){if(error instanceof HubError)throw error;fail('RESTORE_BACKUP_FAILED',ERRORS.RESTORE_BACKUP_FAILED,503);}
  finally{db?.close();if(created&&!pathExists(paths.preRestore))fail('RESTORE_BACKUP_FAILED',ERRORS.RESTORE_BACKUP_FAILED,503);}
}
function finishPendingDatabaseWrites(paths,job){
  // After an interrupted Core, preserve committed WAL transactions before
  // checking the unchanged target. Never delete a WAL to make a check pass.
  const info=lstatSync(paths.database);if(!info.isFile()||info.isSymbolicLink())fail('RESTORE_RECOVERY_REQUIRED',ERRORS.RESTORE_RECOVERY_REQUIRED,503);
  let db;
  try{
    db=new DatabaseSync(paths.database,{allowExtension:false,enableForeignKeyConstraints:true,timeout:3000});
    const result=inspectDatabaseSchema(db,{allowLegacy:true});
    if(!result.schemaCompatible||result.integrity!=='ok'||profile(db).id!==job.targetProfileId)fail('RESTORE_RECOVERY_REQUIRED',ERRORS.RESTORE_RECOVERY_REQUIRED,503);
    if(db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get().busy!==0)fail('RESTORE_RECOVERY_REQUIRED',ERRORS.RESTORE_RECOVERY_REQUIRED,503);
  }finally{db?.close();}
  ensureNoSidecars(paths.database);
}
async function stageSource(paths,job,now){
  const source=sourcePath(paths.root,job.source),inspected=await inspectSource(source);
  if(!sourceMatches(job,inspected))fail('RESTORE_SOURCE_CHANGED',ERRORS.RESTORE_SOURCE_CHANGED,409);
  await copyFile(source,paths.stage,constants.COPYFILE_EXCL);syncFile(paths.stage);
  const copied=await inspectSource(paths.stage);
  if(!sourceMatches(job,copied)||(await inspectSource(source)).sha256!==job.source.sha256)fail('RESTORE_SOURCE_CHANGED',ERRORS.RESTORE_SOURCE_CHANGED,409);
  let db;
  try{
    db=new DatabaseSync(paths.stage,{allowExtension:false,enableForeignKeyConstraints:true,timeout:3000});
    db.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL');
    migrateDatabase(db,{backupPath:paths.stageMigration});
    sanitizeStage(db,job,now);
    const checked=inspectDatabaseSchema(db);if(!checked.schemaCompatible||checked.integrity!=='ok')fail('RESTORE_SOURCE_INVALID',ERRORS.RESTORE_SOURCE_INVALID);
  }finally{db?.close();}
  syncFile(paths.stage);syncDirectory(paths.staging);return hashFile(paths.stage);
}
async function finish(directory,job,values,now){
  const stamp=iso(nowValue(now));Object.assign(job,values,{updatedAt:stamp,finishedAt:stamp,safeToOpen:true});writeJob(directory,job);
  // The database outcome above is durable and verified. A later cleanup error
  // cannot turn that known outcome into a claim that replacement did not occur.
  let cleanupPending=false;
  for(const cleanup of [()=>clearActiveJob(directory,job.id),()=>cleanupStage(maintenancePaths(directory,job.id)),()=>pruneJobs(directory)])try{cleanup();}catch{cleanupPending=true;}
  if(cleanupPending){job.cleanupPending=true;try{writeJob(directory,job);}catch{}}
  return publicJob(job);
}
async function rollback(directory,job,lock,{now,failpoint,error}={}){
  const paths=maintenancePaths(directory,job.id);
  await updateJob(directory,job,{state:'running',stage:'rolling_back',safeToOpen:false,error:safeError(error,'RESTORE_INTERRUPTED')},now,failpoint);
  lock.assertHeld();
  if(job.preRestoreSha256){
    const backup=await inspectSource(paths.preRestore);
    if(backup.sha256!==job.preRestoreSha256||backup.profileId!==job.targetProfileId)fail('RESTORE_RECOVERY_REQUIRED',ERRORS.RESTORE_RECOVERY_REQUIRED,503);
    removeOwned(paths.rollbackStage);await copyFile(paths.preRestore,paths.rollbackStage,constants.COPYFILE_EXCL);syncFile(paths.rollbackStage);
    const copy=await inspectSource(paths.rollbackStage);if(copy.sha256!==job.preRestoreSha256)fail('RESTORE_RECOVERY_REQUIRED',ERRORS.RESTORE_RECOVERY_REQUIRED,503);
    ensureNoSidecars(paths.database);lock.assertHeld();await rename(paths.rollbackStage,paths.database);syncDirectory(paths.root);
    const result=await verifyCurrent(paths,job);if(result.sha256!==job.preRestoreSha256)fail('RESTORE_RECOVERY_REQUIRED',ERRORS.RESTORE_RECOVERY_REQUIRED,503);
    return finish(directory,job,{state:'rolled_back',stage:'rolled_back',error:safeError(error,'RESTORE_INTERRUPTED')},now);
  }
  finishPendingDatabaseWrites(paths,job);await verifyCurrent(paths,job);
  return finish(directory,job,{state:'failed',stage:'failed',error:safeError(error,'RESTORE_NOT_STARTED')},now);
}
export async function runRestoreWorker({directory,jobId:id,now,failpoint}={}){
  const requested=jobId(id);let job=readPrivateJob(directory,requested);
  if(isTerminal(job))return publicJob(job);
  const active=readActiveJob(directory);
  if(!active||active.id!==requested)fail('MAINTENANCE_IN_PROGRESS','Der Auftrag besitzt keine aktuelle Wartungsfreigabe.',409);
  const lock=acquireProfileLock(directory,{role:'maintenance',jobId:requested}),paths=maintenancePaths(directory,requested);
  try{
    job=readPrivateJob(directory,requested);
    if(isTerminal(job))return publicJob(job);
    if(job.state==='running'){
      if(job.workerPid!==null&&job.workerPid!==process.pid&&pidAlive(job.workerPid))fail('MAINTENANCE_IN_PROGRESS',ERRORS.MAINTENANCE_IN_PROGRESS,409);
      job.workerPid=process.pid;
      return await rollback(directory,job,lock,{now,failpoint,error:{code:'RESTORE_INTERRUPTED'}});
    }
    await updateJob(directory,job,{state:'running',stage:'checking',workerPid:process.pid},now,failpoint);
    const inspected=await inspectSource(sourcePath(directory,job.source));if(!sourceMatches(job,inspected))fail('RESTORE_SOURCE_CHANGED',ERRORS.RESTORE_SOURCE_CHANGED,409);
    lock.assertHeld();await updateJob(directory,job,{stage:'backing_up'},now,failpoint);
    const saved=await preRestoreBackup(paths,job);
    await updateJob(directory,job,{preRestoreBackupId:backupId('before_restore','before-restore-'+job.id+'.sqlite'),preRestoreSha256:saved.sha256,stage:'staging'},now,failpoint);
    lock.assertHeld();const staged=await stageSource(paths,job,now);
    await updateJob(directory,job,{stage:'sanitizing',stagedSha256:staged.sha256},now,failpoint);
    lock.assertHeld();ensureNoSidecars(paths.database);ensureNoSidecars(paths.stage);
    await updateJob(directory,job,{stage:'replacing'},now,failpoint);
    lock.assertHeld();await rename(paths.stage,paths.database);syncDirectory(paths.root);
    await updateJob(directory,job,{stage:'verifying'},now,failpoint);
    const applied=await verifyCurrent(paths,job,{sanitized:true});if(applied.sha256!==job.stagedSha256)fail('RESTORE_RECOVERY_REQUIRED',ERRORS.RESTORE_RECOVERY_REQUIRED,503);
    return await finish(directory,job,{state:'succeeded',stage:'completed',error:null},now);
  }catch(error){
    if(isTerminal(job))throw error;
    try{return await rollback(directory,job,lock,{now,failpoint,error});}
    catch(recoveryError){
      const stamp=iso(nowValue(now));job={...job,state:'running',stage:'rolling_back',updatedAt:stamp,safeToOpen:false,error:{code:'RESTORE_RECOVERY_REQUIRED'}};
      try{writeJob(directory,job);}catch{}
      fail('RESTORE_RECOVERY_REQUIRED',ERRORS.RESTORE_RECOVERY_REQUIRED,503);
    }
  }finally{lock.release();}
}
export async function recoverMaintenance({directory,now}={}){
  let job=readActiveJob(directory);
  if(!job){
    const orphan=rememberedJobs(directory).find(item=>!isTerminal(item));if(!orphan)return null;
    if(pidAlive(orphan.ownerPid)||pidAlive(orphan.workerPid))fail('MAINTENANCE_IN_PROGRESS',ERRORS.MAINTENANCE_IN_PROGRESS,409);
    job=orphan;activateJob(directory,job.id);
  }
  if(isTerminal(job)){clearActiveJob(directory,job.id);return publicJob(job);}
  if(pidAlive(job.ownerPid)||pidAlive(job.workerPid))fail('MAINTENANCE_IN_PROGRESS',ERRORS.MAINTENANCE_IN_PROGRESS,409);
  if(job.state==='running')return runRestoreWorker({directory,jobId:job.id,now});
  const lock=acquireProfileLock(directory,{role:'maintenance',jobId:job.id});
  try{
    const paths=maintenancePaths(directory,job.id);finishPendingDatabaseWrites(paths,job);await verifyCurrent(paths,job);
    return await finish(directory,job,{state:'failed',stage:'failed',error:{code:'RESTORE_NOT_STARTED'}},now);
  }finally{lock.release();}
}
