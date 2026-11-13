import { mkdirSync, lstatSync, readFileSync, writeFileSync, renameSync, unlinkSync, openSync, closeSync, fsyncSync, chmodSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fail, object } from './errors.mjs';

export const JOB_STATES=Object.freeze(['prepared','running','succeeded','rolled_back','failed']);
export const JOB_STAGES=Object.freeze(['prepared','checking','backing_up','staging','sanitizing','replacing','verifying','completed','rolling_back','rolled_back','failed']);
export const TERMINAL_STATES=Object.freeze(['succeeded','rolled_back','failed']);
export const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const HASH=/^[a-f0-9]{64}$/;
export const SNAPSHOT_NAME=/^backup-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z-[a-f0-9]{8}\.sqlite$/;
export const MIGRATION_NAME=/^before-schema-2-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z-[a-f0-9-]{36}\.sqlite$/;
export const PRE_RESTORE_NAME=/^before-restore-[a-f0-9-]{36}\.sqlite$/;
export const PRE_UPDATE_NAME=new RegExp('^before-update-'+UUID.source.slice(1,-1)+'\\.sqlite$','i');
export const isTerminal=job=>TERMINAL_STATES.includes(job?.state)&&job.safeToOpen===true;
export const nowValue=now=>{const n=typeof now==='function'?now():now??Date.now();if(!Number.isFinite(n)||n<0)fail('MAINTENANCE_CLOCK_INVALID','Die lokale Zeit konnte nicht bestätigt werden.',503);return n;};
export const iso=value=>new Date(value).toISOString();
const date=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value));
export function jobId(value){if(typeof value!=='string'||!UUID.test(value))fail('MAINTENANCE_JOB_INVALID','Die Kennung des Wiederherstellungsauftrags ist ungültig.');return value.toLowerCase();}
export function maintenancePaths(directory,id=null){
  const root=resolve(directory),base=join(root,'maintenance'),jobs=join(base,'jobs'),backups=join(base,'backups'),staging=join(base,'staging');
  const paths={root,base,jobs,backups,staging,active:join(base,'active.json'),database:join(root,'state.sqlite')};
  if(id!==null){id=jobId(id);Object.assign(paths,{job:join(jobs,id+'.json'),stage:join(staging,'stage-'+id+'.sqlite'),stageMigration:join(staging,'before-stage-migration-'+id+'.sqlite'),rollbackStage:join(staging,'rollback-'+id+'.sqlite'),preRestore:join(backups,'before-restore-'+id+'.sqlite')});}
  return paths;
}
export function pathExists(path){try{lstatSync(path);return true;}catch(error){if(error?.code==='ENOENT')return false;throw error;}}
export function checkedDirectory(path,{create=false}={}){
  if(create&&!pathExists(path))mkdirSync(path,{mode:0o700});
  const info=lstatSync(path);if(!info.isDirectory()||info.isSymbolicLink())fail('MAINTENANCE_DIRECTORY_INVALID','Der lokale Wartungsordner kann nicht sicher verwendet werden.',503);
  return info;
}
export function ensureMaintenance(directory){
  const paths=maintenancePaths(directory);checkedDirectory(paths.root);
  for(const path of [paths.base,paths.jobs,paths.backups,paths.staging]){checkedDirectory(path,{create:true});if(process.platform!=='win32')chmodSync(path,0o700);}
  return paths;
}
export function syncFile(path){const fd=openSync(path,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
export function syncDirectory(path){let fd;try{fd=openSync(path,'r');fsyncSync(fd);}catch(error){if(!['EISDIR','EPERM','EACCES','EINVAL','ENOTSUP','EBADF'].includes(error?.code))throw error;}finally{if(fd!==undefined)closeSync(fd);}}
export function readSmallJson(path,{missing=false}={}){
  let info;try{info=lstatSync(path);}catch(error){if(missing&&error?.code==='ENOENT')return null;throw error;}
  if(!info.isFile()||info.isSymbolicLink()||info.size>65536)fail('MAINTENANCE_JOURNAL_INVALID','Der Wartungsnachweis ist unvollständig oder beschädigt. Es werden keine Daten ausgetauscht.',503);
  try{return JSON.parse(readFileSync(path,'utf8'));}catch{fail('MAINTENANCE_JOURNAL_INVALID','Der Wartungsnachweis ist unvollständig oder beschädigt. Es werden keine Daten ausgetauscht.',503);}
}
export function atomicJson(path,value){
  const bytes=JSON.stringify(value,null,2)+'\n';if(Buffer.byteLength(bytes)>65536)fail('MAINTENANCE_JOURNAL_INVALID','Der Wartungsnachweis überschreitet die erlaubte Grösse.',503);
  const temporary=path+'.'+randomUUID()+'.tmp';let created=false;
  try{writeFileSync(temporary,bytes,{flag:'wx',mode:0o600});created=true;syncFile(temporary);renameSync(temporary,path);created=false;syncDirectory(resolve(path,'..'));}
  finally{if(created)try{unlinkSync(temporary);}catch{}}
}
function validSource(source){
  const pattern=source?.kind==='snapshot'?SNAPSHOT_NAME:source?.kind==='before_restore'?PRE_RESTORE_NAME:source?.kind==='before_migration'?MIGRATION_NAME:source?.kind==='before_update'?PRE_UPDATE_NAME:null;
  return object(source)&&pattern?.test(source.filename)&&HASH.test(source.id)&&HASH.test(source.sha256)&&Number.isSafeInteger(source.bytes)&&source.bytes>0&&[1,2].includes(source.schemaVersion)&&date(source.createdAt);
}
export function validateJob(value,id){
  if(!object(value)||value.format!=='trading-local-restore-job'||value.schema!==1||value.id!==jobId(id)||!HASH.test(value.requestDigest)||!HASH.test(value.reviewDigest)||
    !JOB_STATES.includes(value.state)||!JOB_STAGES.includes(value.stage)||!date(value.createdAt)||!date(value.updatedAt)||
    !Number.isSafeInteger(value.ownerPid)||value.ownerPid<1||!(value.workerPid===null||Number.isSafeInteger(value.workerPid)&&value.workerPid>0)||
    !UUID.test(value.targetProfileId)||!HASH.test(value.targetDigest)||!validSource(value.source)||typeof value.safeToOpen!=='boolean'||
    !(value.finishedAt===null||date(value.finishedAt))||!(value.preRestoreBackupId===null||HASH.test(value.preRestoreBackupId))||
    !(value.preRestoreSha256===null||HASH.test(value.preRestoreSha256))||!(value.stagedSha256===null||HASH.test(value.stagedSha256))||
    !(value.error===null||object(value.error)&&/^[A-Z][A-Z_0-9]{2,70}$/.test(value.error.code)))
    fail('MAINTENANCE_JOURNAL_INVALID','Der Wartungsnachweis ist unvollständig oder beschädigt. Es werden keine Daten ausgetauscht.',503);
  if(TERMINAL_STATES.includes(value.state)&&(!value.safeToOpen||!value.finishedAt))fail('MAINTENANCE_JOURNAL_INVALID','Der Abschluss des Wartungsauftrags ist nicht bestätigt.',503);
  return value;
}
export function readPrivateJob(directory,id,{missing=false}={}){
  const paths=maintenancePaths(directory,id);
  if(!pathExists(paths.base))return missing?null:fail('MAINTENANCE_JOB_NOT_FOUND','Der Wiederherstellungsauftrag wurde nicht gefunden.',404);
  checkedDirectory(paths.base);
  if(!pathExists(paths.jobs))return missing?null:fail('MAINTENANCE_JOB_NOT_FOUND','Der Wiederherstellungsauftrag wurde nicht gefunden.',404);
  checkedDirectory(paths.jobs);
  let value;try{value=readSmallJson(paths.job,{missing});}catch(error){if(error?.code==='ENOENT')fail('MAINTENANCE_JOB_NOT_FOUND','Der Wiederherstellungsauftrag wurde nicht gefunden.',404);throw error;}
  return value===null?null:validateJob(value,jobId(id));
}
export function readStoredJobs(directory){
  const paths=maintenancePaths(directory);if(!pathExists(paths.base))return [];
  checkedDirectory(paths.base);if(!pathExists(paths.jobs))return [];
  checkedDirectory(paths.jobs);const entries=readdirSync(paths.jobs,{withFileTypes:true});
  if(entries.length>1024)fail('MAINTENANCE_JOURNAL_INVALID','Die Anzahl lokaler Wartungsnachweise überschreitet die begrenzte Prüfung.',503);
  return entries.filter(entry=>entry.name.endsWith('.json')&&UUID.test(entry.name.slice(0,-5))).map(entry=>readPrivateJob(directory,entry.name.slice(0,-5)));
}
export function readActiveJob(directory){
  const paths=maintenancePaths(directory);if(!pathExists(paths.base))return null;checkedDirectory(paths.base);
  const pointer=readSmallJson(paths.active,{missing:true});if(pointer===null)return null;
  if(!object(pointer)||pointer.schema!==1||typeof pointer.jobId!=='string'||!UUID.test(pointer.jobId))fail('MAINTENANCE_JOURNAL_INVALID','Der offene Wartungsauftrag kann nicht eindeutig zugeordnet werden.',503);
  return readPrivateJob(directory,pointer.jobId);
}
export function writeJob(directory,job){
  const paths=ensureMaintenance(directory);validateJob(job,job.id);atomicJson(join(paths.jobs,job.id+'.json'),job);return job;
}
export function activateJob(directory,id){
  const paths=ensureMaintenance(directory),existing=readActiveJob(directory);
  if(existing&&!isTerminal(existing)){
    if(existing.id===id)return;
    fail('MAINTENANCE_IN_PROGRESS','Für dieses Profil ist bereits eine Wiederherstellung vorbereitet oder aktiv.',409);
  }
  if(existing)clearActiveJob(directory,existing.id);
  try{writeFileSync(paths.active,JSON.stringify({schema:1,jobId:jobId(id)})+'\n',{flag:'wx',mode:0o600});syncFile(paths.active);syncDirectory(paths.base);}
  catch(error){if(error?.code==='EEXIST')fail('MAINTENANCE_IN_PROGRESS','Für dieses Profil ist bereits eine Wiederherstellung vorbereitet oder aktiv.',409);throw error;}
}
export function clearActiveJob(directory,id){
  const paths=maintenancePaths(directory),pointer=readSmallJson(paths.active,{missing:true});if(pointer===null)return;
  if(pointer.schema!==1||pointer.jobId!==jobId(id))fail('MAINTENANCE_OWNERSHIP_CHANGED','Ein anderer Wartungsauftrag besitzt inzwischen dieses Profil.',409);
  unlinkSync(paths.active);syncDirectory(paths.base);
}
export function pidAlive(pid){if(!Number.isSafeInteger(pid)||pid<1)return false;try{process.kill(pid,0);return true;}catch(error){return error?.code!=='ESRCH';}}
