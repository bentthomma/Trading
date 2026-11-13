import { DatabaseSync, backup } from 'node:sqlite';
import { constants, lstatSync, fstatSync, readSync, readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync, rmdirSync, openSync, closeSync, readdirSync } from 'node:fs';
import { lstat, open, copyFile, mkdir, opendir, rename, unlink } from 'node:fs/promises';
import { dirname, basename, resolve, join, relative, isAbsolute, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { fail, HubError, object } from './errors.mjs';
import { acquireProfileLock } from './profile-lock.mjs';
import { CURRENT_SCHEMA_VERSION, inspectDatabaseSchema } from './store.mjs';
import { atomicJson, syncFile, syncDirectory, pathExists, UUID, HASH, pidAlive } from './maintenance-journal.mjs';
import { inspectReleaseDirectory, RELEASE_PACKAGE_LIMITS, RELEASE_RUNTIME_TRUST, validateReleasePath } from './package-integrity.mjs';

export const DEPLOYMENT_LIMITS=Object.freeze({metadataBytes:65536,journalBytes:65536,versions:50,windowsPathLength:240,processOutputBytes:65536});
const VERSION=/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;
const RELEASE_ID=/^(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})\.(?:0|[1-9]\d{0,5})-[a-f0-9]{16}$/;
const STAMP=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const releaseId=receipt=>receipt.version+'-'+receipt.manifestSha256.slice(0,16);
const stamp=now=>new Date(typeof now==='function'?now():now??Date.now()).toISOString();
const schemaCompatible=(release,schema)=>Number.isSafeInteger(schema)&&schema>=release.dataSchema.readMin&&schema<=release.dataSchema.readMax;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const installationPaths=root=>({root:resolve(root),state:join(resolve(root),'install-state.json'),journal:join(resolve(root),'deploy-journal.json'),guard:join(resolve(root),'installation-guard.sqlite'),metadata:join(resolve(root),'installation.lock'),versions:join(resolve(root),'versions'),staging:join(resolve(root),'staging'),launcher:join(resolve(root),'launcher'),runtime:join(resolve(root),'runtime')});
function directory(path,{create=false}={}){if(create&&!pathExists(path))mkdirSync(path,{mode:0o700});const info=lstatSync(path);if(!info.isDirectory()||info.isSymbolicLink())fail('DEPLOYMENT_PATH','Der Installationsordner ist kein regulärer eigener Ordner.',409);}
function boundedBytes(path,maximum=DEPLOYMENT_LIMITS.metadataBytes,{missing=false}={}){
  if(!pathExists(path)){if(missing)return null;fail('DEPLOYMENT_STATE','Die Installationsregistrierung fehlt oder ist beschädigt.',409);}
  const before=lstatSync(path);if(!regular(before)||before.size>maximum)fail('DEPLOYMENT_STATE','Die Installationsregistrierung kann nicht sicher gelesen werden.',409);
  const fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  try{const bytes=Buffer.alloc(before.size+1);let size=0;if(!stable(before,fstatSync(fd)))throw new Error('Changed metadata.');
    for(;;){const n=readSync(fd,bytes,size,bytes.length-size,null);if(n===0)break;size+=n;if(size>before.size)throw new Error('Growing metadata.');}
    if(size!==before.size||!stable(before,fstatSync(fd))||!stable(before,lstatSync(path)))throw new Error('Changed metadata.');return bytes.subarray(0,size);
  }catch{fail('DEPLOYMENT_STATE','Die Installationsregistrierung fehlt oder ist beschädigt.',409);}finally{closeSync(fd);}
}
function boundedJson(path,maximum=DEPLOYMENT_LIMITS.metadataBytes,options={}){const bytes=boundedBytes(path,maximum,options);if(bytes===null)return null;try{return JSON.parse(bytes.toString('utf8'));}catch{fail('DEPLOYMENT_STATE','Die Installationsregistrierung fehlt oder ist beschädigt.',409);}}
// runtime.lock is diagnostic startup metadata, not the profile guard itself.
// The child initially publishes it with port:null and then replaces it when the
// listener is bound. During that bounded startup window an empty/incomplete or
// concurrently replaced REGULAR file means "not ready", not a valid owner.
// Keep all installation registry reads strict; unsafe paths/links/size are never
// retried as a successful handshake. The loop still requires the exact child PID,
// UUID owner, Core role and valid port, and has its existing deadline/kill path.
function startupRuntimeRecord(path){
  try{return boundedJson(path,DEPLOYMENT_LIMITS.metadataBytes,{missing:true});}
  catch(error){
    if(error?.code!=='DEPLOYMENT_STATE'&&error?.code!=='ENOENT')throw error;
    let info;try{info=lstatSync(path);}catch(check){if(check?.code==='ENOENT')return null;throw check;}
    if(!regular(info)||info.size>DEPLOYMENT_LIMITS.metadataBytes)throw error;
    return null;
  }
}
function validRelease(value){return object(value)&&VERSION.test(value.version)&&HASH.test(value.manifestSha256)&&value.id===releaseId(value)&&object(value.dataSchema)&&Number.isSafeInteger(value.dataSchema.readMin)&&Number.isSafeInteger(value.dataSchema.readMax)&&Number.isSafeInteger(value.dataSchema.write)&&value.dataSchema.readMin>0&&value.dataSchema.readMin<=value.dataSchema.write&&value.dataSchema.write<=value.dataSchema.readMax&&STAMP.test(value.verifiedAt);}
function validateState(state){
  if(!object(state)||state.format!=='trading-local-installation'||state.schema!==1||!UUID.test(state.id)||!validRelease(state.current)||!(state.previous===null||validRelease(state.previous))||!Array.isArray(state.versions)||state.versions.length>DEPLOYMENT_LIMITS.versions||state.versions.some(item=>!validRelease(item))||typeof state.dataDirectory!=='string'||!isAbsolute(state.dataDirectory)||!['win32-x64','win32-arm64'].includes(state.targetPlatform)||!STAMP.test(state.createdAt)||!STAMP.test(state.updatedAt))fail('DEPLOYMENT_STATE','Die Installationsregistrierung fehlt oder ist beschädigt.',409);
  const ids=new Set(state.versions.map(item=>item.id));
  if(ids.size!==state.versions.length||!ids.has(state.current.id)||state.previous&&!ids.has(state.previous.id)||state.previous?.id===state.current.id||[state.current,state.previous].filter(Boolean).some(item=>JSON.stringify(item)!==JSON.stringify(state.versions.find(version=>version.id===item.id))))fail('DEPLOYMENT_STATE','Die Versionsauswahl passt nicht zur Installationsregistrierung.',409);
  if(!Array.isArray(state.nativeFiles)||state.nativeFiles.length>4||new Set(state.nativeFiles.map(item=>item.filename)).size!==state.nativeFiles.length||state.nativeFiles.some(item=>!validNative(item))||!(state.manager===null||validNative(state.manager)&&state.manager.filename==='Wartung.exe'&&state.nativeFiles.some(item=>JSON.stringify(item)===JSON.stringify(state.manager))))fail('DEPLOYMENT_STATE','Die nativen Installationsnachweise sind beschädigt.',409);
  if(state.runtime!==null&&(!object(state.runtime)||state.runtime.kind!=='pinned'||state.runtime.version!==RELEASE_RUNTIME_TRUST.version||state.runtime.architecture!==state.targetPlatform.slice(6)||state.runtime.path!=='runtime/win-'+state.runtime.architecture+'/node.exe'||state.runtime.sha256!==RELEASE_RUNTIME_TRUST.windows[state.runtime.architecture]?.sha256))fail('DEPLOYMENT_STATE','Der Laufzeitnachweis ist beschädigt.',409);
  return state;
}
function validNative(value){return object(value)&&['TradingLocal.exe','Wartung.exe','WindowsGuard.exe','Deinstallieren.exe'].includes(value.filename)&&HASH.test(value.sha256)&&Number.isSafeInteger(value.bytes)&&value.bytes>0&&value.bytes<=4*1024*1024;}
function readState(root,{missing=false}={}){const state=boundedJson(installationPaths(root).state,DEPLOYMENT_LIMITS.metadataBytes,{missing});return state===null?null:validateState(state);}

const regular=info=>info.isFile()&&!info.isSymbolicLink()&&info.nlink===1;
const stable=(a,b)=>regular(a)&&regular(b)&&a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs;
const inside=(parent,child)=>{const path=relative(parent,child);return path===''||!path.startsWith('..'+sep)&&path!=='..'&&!isAbsolute(path);};
function safeAncestors(path,{create=false,allowMissing=false}={}){
  if(typeof path!=='string'||!isAbsolute(path))fail('DEPLOYMENT_ARGUMENTS','Ein eindeutiger absoluter Ordner wird benötigt.');
  path=resolve(path);
  if(process.platform==='win32'&&(!/^[A-Za-z]:\\/.test(path)||path.length>DEPLOYMENT_LIMITS.windowsPathLength||path.slice(3).split('\\').filter(Boolean).some(part=>/[<>:\x00-\x1f"|?*]/.test(part)||/[ .]$/.test(part)||/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part))))fail('DEPLOYMENT_PATH','Der Windows-Ordner besitzt keinen unterstützten eindeutigen Pfad.',409);
  const parts=[];let current=path;
  while(!pathExists(current)){parts.push(current);const parent=dirname(current);if(parent===current)fail('DEPLOYMENT_PATH','Der lokale Ordner ist nicht erreichbar.',409);current=parent;}
  for(let parent=current;;parent=dirname(parent)){directory(parent);if(dirname(parent)===parent)break;}
  if(create)for(const missing of parts.reverse())directory(missing,{create:true});else if(parts.length&&!allowMissing)fail('DEPLOYMENT_PATH','Der lokale Ordner ist nicht vorhanden.',409);
  return path;
}
function validateRoots(installRoot,dataDirectory){
  if(typeof installRoot!=='string'||typeof dataDirectory!=='string'||!isAbsolute(installRoot)||!isAbsolute(dataDirectory))fail('DEPLOYMENT_ARGUMENTS','Programm- und Datenordner müssen eindeutige absolute Ordner sein.');
  installRoot=resolve(installRoot);dataDirectory=resolve(dataDirectory);
  if(inside(installRoot,dataDirectory)||inside(dataDirectory,installRoot)||dirname(installRoot)===installRoot||dirname(dataDirectory)===dataDirectory)fail('DEPLOYMENT_PATH','Programm und persönliche Daten müssen in getrennten eigenen Ordnern liegen.',409);
  return {installRoot,dataDirectory};
}
async function fileHash(path,maximum=RELEASE_PACKAGE_LIMITS.fileBytes){
  const before=await lstat(path);if(!regular(before)||before.size>maximum)fail('DEPLOYMENT_FILE','Eine Installationsdatei ist nicht regulär oder überschreitet die erlaubte Grösse.',409);
  const file=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));let size=0;const hash=createHash('sha256'),buffer=Buffer.alloc(65536);
  try{if(!stable(before,await file.stat()))fail('DEPLOYMENT_CHANGED','Eine Installationsdatei wurde verändert.',409);
    for(;;){const result=await file.read(buffer,0,buffer.length,null);if(!result.bytesRead)break;size+=result.bytesRead;if(size>maximum)fail('DEPLOYMENT_FILE','Eine Installationsdatei überschreitet die erlaubte Grösse.',409);hash.update(buffer.subarray(0,result.bytesRead));}
    if(size!==before.size||!stable(before,await file.stat())||!stable(before,await lstat(path)))fail('DEPLOYMENT_CHANGED','Eine Installationsdatei wurde verändert.',409);
    return {sha256:hash.digest('hex'),bytes:size};
  }finally{await file.close();}
}
async function fixedProcess(executable,args,{timeout=30000,cwd}={}){
  return new Promise((resolveResult,reject)=>{
    const child=spawn(executable,args,{cwd,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',bytes=0,done=false;
    const stop=()=>{if(!done){done=true;child.kill();reject(new HubError('DEPLOYMENT_NATIVE_CHECK','Die native Windows-Prüfung konnte nicht vollständig bestätigt werden.',503));}};
    const timer=setTimeout(stop,timeout);
    const take=chunk=>{bytes+=chunk.length;if(bytes>DEPLOYMENT_LIMITS.processOutputBytes)stop();};
    child.stdout.on('data',chunk=>{take(chunk);output+=chunk.toString();});child.stderr.on('data',take);
    child.on('error',()=>{clearTimeout(timer);stop();});child.on('close',exit=>{clearTimeout(timer);if(!done){done=true;resolveResult({exit,output});}});
  });
}
async function nativePaths(paths,nativeGuard,{recursive=true}={}){
  if(process.platform!=='win32')return;
  if(!object(nativeGuard)||typeof nativeGuard.path!=='string'||!isAbsolute(nativeGuard.path)||!HASH.test(nativeGuard.sha256))fail('DEPLOYMENT_NATIVE_CHECK','Die native Windows-Dateiprüfung ist nicht verfügbar.',503);
  const checked=await fileHash(nativeGuard.path,4*1024*1024);if(checked.sha256!==nativeGuard.sha256)fail('DEPLOYMENT_NATIVE_CHECK','Die native Windows-Dateiprüfung stimmt nicht mit dem Installationsnachweis überein.',503);
  for(const path of paths){if(path.length>DEPLOYMENT_LIMITS.windowsPathLength)fail('DEPLOYMENT_PATH','Der Windows-Pfad ist für diesen Installationsweg zu lang.',409);
    const result=await fixedProcess(nativeGuard.path,['/ROOT='+resolve(path),...(recursive?[]:['/ANCESTORS=1'])],{timeout:45000});if(result.exit!==0)fail('DEPLOYMENT_NATIVE_CHECK','Windows hat einen nicht zulässigen Dateipfad, Verknüpfungspunkt oder Zusatzdatenstrom gemeldet.',409);}
}
// All existing ancestors and affected profile entries are checked before any
// mkdir/SQLite guard. Native Windows checks reject every reparse type and ADS.
function nearestExisting(path){let current=resolve(path);while(!pathExists(current)){const parent=dirname(current);if(parent===current)fail('DEPLOYMENT_PATH','Der lokale Ordner ist nicht erreichbar.',409);current=parent;}return current;}
function inspectTreePaths(root){
  let count=0;const walk=path=>{if(++count>8192)fail('DEPLOYMENT_PATH','Der lokale Prüfbereich enthält zu viele Einträge.',409);const info=lstatSync(path);if(info.isSymbolicLink()||!info.isDirectory()&&!regular(info))fail('DEPLOYMENT_PATH','Der lokale Prüfbereich enthält einen nicht regulären Eintrag.',409);if(info.isDirectory())for(const name of readdirSync(path))walk(join(path,name));};walk(root);
}
async function preflightRoot(root,nativeGuard,{create=false}={}){
  safeAncestors(root,{allowMissing:create});await nativePaths([nearestExisting(root)],nativeGuard,{recursive:false});
  if(create)safeAncestors(root,{create:true});
  for(const name of ['installation-guard.sqlite','installation-guard.sqlite-journal','installation-guard.sqlite-wal','installation-guard.sqlite-shm','installation.lock','install-state.json','deploy-journal.json','installation-owner.json','current-release.txt']){const path=join(root,name);if(pathExists(path)){if(!regular(lstatSync(path)))fail('DEPLOYMENT_PATH','Ein Installationsnachweis ist nicht regulär.',409);await nativePaths([path],nativeGuard,{recursive:false});}}
  for(const name of ['versions','staging','runtime']){const path=join(root,name);if(pathExists(path)){safeAncestors(path);await nativePaths([path],nativeGuard,{recursive:false});}}
}
async function preflightProfile(directory,nativeGuard,{create=false}={}){
  safeAncestors(directory,{allowMissing:create});await nativePaths([nearestExisting(directory)],nativeGuard,{recursive:false});
  if(pathExists(directory)){inspectTreePaths(directory);await nativePaths([directory],nativeGuard);}
  if(create)safeAncestors(directory,{create:true});
}
function acquireInstallationLock(root){
  root=safeAncestors(root,{create:true});const paths=installationPaths(root),owner=randomUUID();let db,held=false;
  try{
    for(const path of [paths.guard,paths.guard+'-journal',paths.guard+'-wal',paths.guard+'-shm'])if(pathExists(path)&&!regular(lstatSync(path)))fail('DEPLOYMENT_PATH','Die Installationssperre ist nicht regulär.',409);
    db=new DatabaseSync(paths.guard,{allowExtension:false,timeout:0});db.exec('PRAGMA busy_timeout=0;BEGIN EXCLUSIVE;');
    const previous=boundedJson(paths.metadata,DEPLOYMENT_LIMITS.metadataBytes,{missing:true});
    if(previous&&(!object(previous)||!Number.isSafeInteger(previous.pid)||!UUID.test(previous.owner)))fail('DEPLOYMENT_STATE','Die Installationssperre ist beschädigt.',409);
    if(previous&&pidAlive(previous.pid))fail('DEPLOYMENT_BUSY','Eine weitere Programmverwaltung verwendet diese Installation bereits.',409);
    atomicJson(paths.metadata,{pid:process.pid,owner});held=true;
  }catch(error){db?.close();if(error?.errcode===5||error?.errcode===6)fail('DEPLOYMENT_BUSY','Eine weitere Programmverwaltung verwendet diese Installation bereits.',409);throw error;}
  const assertHeld=()=>{const recorded=boundedJson(paths.metadata);if(!held||recorded.pid!==process.pid||recorded.owner!==owner)fail('DEPLOYMENT_OWNERSHIP','Der exklusive Installationsbesitz wurde verändert.',409);};
  return {assertHeld,release(){if(!held)return;try{const recorded=boundedJson(paths.metadata,DEPLOYMENT_LIMITS.metadataBytes,{missing:true});if(recorded?.pid===process.pid&&recorded.owner===owner)unlinkSync(paths.metadata);}finally{held=false;db.close();}}};
}
function privateJournal(root){
  const value=boundedJson(installationPaths(root).journal,DEPLOYMENT_LIMITS.journalBytes,{missing:true});if(value===null)return null;
  if(!object(value)||value.format!=='trading-local-deployment-job'||value.schema!==1||!UUID.test(value.id)||!['running','succeeded','rolled_back','failed'].includes(value.state)||!['backup','staging','ready','selecting','selected','completed','rolled_back','failed','removing'].includes(value.stage)||!Number.isSafeInteger(value.pid)||value.pid<1||!['install','rollback','remove'].includes(value.action)||!STAMP.test(value.createdAt)||!STAMP.test(value.updatedAt)||!(value.before===null||object(value.before))||!(value.after===null||object(value.after))||!(value.releaseId===null||RELEASE_ID.test(value.releaseId))||typeof value.dataDirectory!=='string'||!isAbsolute(value.dataDirectory))fail('DEPLOYMENT_STATE','Der Programmwechsel muss anhand seines Wartungsnachweises geklärt werden.',409);
  for(const state of [value.before,value.after].filter(Boolean)){validateState(state);if(state.dataDirectory!==value.dataDirectory)fail('DEPLOYMENT_STATE','Der Wartungsauftrag besitzt keinen eindeutigen Datenordner.',409);}
  validateRoots(root,value.dataDirectory);return value;
}
function writeJournal(root,job){atomicJson(installationPaths(root).journal,job);}
async function phase(root,job,stage,now,failpoint){job.stage=stage;job.updatedAt=stamp(now);writeJournal(root,job);await failpoint?.(stage);}
function readPointer(root){const bytes=boundedBytes(join(root,'current-release.txt'),256,{missing:true});if(bytes===null)return null;const value=bytes.toString('utf8');if(!RELEASE_ID.test(value.trim())||value!==value.trim()+'\r\n')fail('DEPLOYMENT_STATE','Der Programmzeiger ist beschädigt.',409);return value.trim();}
function selection(root,state){const paths=installationPaths(root);if(state){atomicJson(paths.state,state);const file=join(root,'current-release.txt'),temporary=file+'.'+randomUUID()+'.tmp';writeFileSync(temporary,state.current.id+'\r\n',{flag:'wx',mode:0o600});syncFile(temporary);renameSync(temporary,file);syncDirectory(root);}else{if(pathExists(paths.state))unlinkSync(paths.state);const file=join(root,'current-release.txt');if(pathExists(file))unlinkSync(file);syncDirectory(root);}}
function sameChoice(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function currentChoice(root,state){return sameChoice(readState(root,{missing:true}),state)&&readPointer(root)===(state?.current.id??null);}
function restoreOwnedSelection(root,job){
  const actual=readState(root,{missing:true}),pointer=readPointer(root),beforeId=job.before?.current.id??null,afterId=job.after?.current.id??null;
  // Before our first selection write a conflict must never trigger a writeback.
  if(!['selecting','selected'].includes(job.stage)){
    if(!sameChoice(actual,job.before)||pointer!==beforeId)fail('DEPLOYMENT_RECOVERY_REQUIRED','Die Programmauswahl wurde ausserhalb dieses Auftrags verändert. Eine gezielte Klärung ist erforderlich.',409);
    return;
  }
  if(!sameChoice(actual,job.before)&&!sameChoice(actual,job.after)||pointer!==beforeId&&pointer!==afterId)fail('DEPLOYMENT_RECOVERY_REQUIRED','Die Programmauswahl kann diesem Auftrag nicht eindeutig zugeordnet werden.',409);
  if(!sameChoice(actual,job.before)||pointer!==beforeId)selection(root,job.before);
}
async function recoverUnderLock(root,lock,now,nativeGuard){
  const job=privateJournal(root);if(!job||job.state!=='running')return job;
  if(job.pid!==process.pid&&pidAlive(job.pid))fail('DEPLOYMENT_BUSY','Der vorbereitende Programmwechsel ist noch aktiv.',409);
  if(job.action==='remove')fail('DEPLOYMENT_REMOVE_INCOMPLETE','Die Entfernung wurde unterbrochen. Im Deinstallationsassistenten erneut entfernen.',409);
  await preflightProfile(job.dataDirectory,nativeGuard);const profileLock=acquireProfileLock(job.dataDirectory);
  try{lock.assertHeld();profileLock.assertHeld();restoreOwnedSelection(root,job);job.state='rolled_back';job.stage='rolled_back';job.updatedAt=stamp(now);job.error='DEPLOYMENT_INTERRUPTED';writeJournal(root,job);return job;}finally{profileLock.release();}
}
function settleFailure(root,job,lock,profileLock,error,now){
  if(job?.state!=='running')return;
  try{lock.assertHeld();profileLock.assertHeld();restoreOwnedSelection(root,job);job.state='rolled_back';job.stage='rolled_back';job.error=/^[A-Z][A-Z_0-9]{2,70}$/.test(error?.code)?error.code:'DEPLOYMENT_FAILED';job.updatedAt=stamp(now);writeJournal(root,job);}
  catch{if(error?.code==='DEPLOYMENT_CHANGED')return;fail('DEPLOYMENT_RECOVERY_REQUIRED','Der Programmwechsel muss vor dem nächsten Start geklärt werden.',503);}
}
function immutableDatabase(path){const uri=pathToFileURL(path);uri.searchParams.set('mode','ro');uri.searchParams.set('immutable','1');return new DatabaseSync(uri.href,{readOnly:true,allowExtension:false,enableForeignKeyConstraints:true});}
function dataSchema(directory,{allowLegacy=false}={}){
  const path=join(directory,'state.sqlite');if(!pathExists(path))return null;if(!regular(lstatSync(path)))fail('DEPLOYMENT_DATA','Die lokale Datenbank ist nicht regulär.',409);
  let db;try{db=new DatabaseSync(path,{readOnly:true,allowExtension:false,enableForeignKeyConstraints:true,timeout:100});const checked=inspectDatabaseSchema(db,{allowLegacy});if(!checked.schemaCompatible||checked.integrity!=='ok')fail('DEPLOYMENT_SCHEMA','Der Datenstand passt nicht zum geprüften Programmwechsel.',409);return checked.schemaVersion;}finally{db?.close();}
}
async function saveBeforeUpdate(directory,id){
  const path=join(directory,'state.sqlite');if(!pathExists(path))return null;
  const folder=join(directory,'deployment-backups');safeAncestors(folder,{create:true});
  const target=join(folder,'before-update-'+id+'.sqlite');let db;
  try{db=new DatabaseSync(path,{readOnly:true,allowExtension:false,enableForeignKeyConstraints:true,timeout:100});const checked=inspectDatabaseSchema(db,{allowLegacy:true});if(!checked.schemaCompatible||checked.integrity!=='ok')fail('DEPLOYMENT_SCHEMA','Vor dem Programmwechsel wird eine intakte unterstützte Datenbank benötigt.',409);
    const pages=db.prepare('PRAGMA page_count').get().page_count,size=db.prepare('PRAGMA page_size').get().page_size;if(pages*size>128*1024*1024)fail('DEPLOYMENT_DATA_LIMIT','Die Datenbank überschreitet den geprüften Sicherungsumfang.',409);
    const fd=openSync(target,'wx',0o600);closeSync(fd);await backup(db,target);syncFile(target);syncDirectory(folder);
  }catch(error){if(error instanceof HubError)throw error;fail('DEPLOYMENT_BACKUP','Die Sicherung vor dem Programmwechsel konnte nicht abgeschlossen werden.',503);}finally{db?.close();}
  let copy;try{copy=immutableDatabase(target);const check=inspectDatabaseSchema(copy,{allowLegacy:true});if(!check.schemaCompatible||check.integrity!=='ok')fail('DEPLOYMENT_BACKUP','Die Sicherung vor dem Programmwechsel konnte nicht bestätigt werden.',503);}finally{copy?.close();}
  return {filename:'before-update-'+id+'.sqlite',...(await fileHash(target,128*1024*1024))};
}
function manifestFiles(root){
  const text=boundedBytes(join(root,'SOURCE-SHA256.txt'),RELEASE_PACKAGE_LIMITS.manifestBytes).toString('utf8');
  return [...text.trimEnd().split(/\r?\n/).map(line=>{const match=/^([a-f0-9]{64})  (.+)$/.exec(line);if(!match)fail('DEPLOYMENT_FILE','Die Paketprüfliste ist nicht eindeutig.',409);return {path:validateReleasePath(match[2]),sha256:match[1]};}),{path:'SOURCE-SHA256.txt',sha256:digest(Buffer.from(text))}];
}
async function boundedCopy(source,target,{maximum,expectedSha256,budget}={}){
  const before=await lstat(source);if(!regular(before)||before.size>maximum||budget&&before.size>budget.remaining)fail('DEPLOYMENT_COPY_LIMIT','Eine Quelldatei überschreitet den begrenzten Kopierumfang.',409);
  const input=await open(source,constants.O_RDONLY|(constants.O_NOFOLLOW||0));let output,created=false,total=0;const hash=createHash('sha256'),buffer=Buffer.alloc(65536);
  try{
    if(!stable(before,await input.stat()))fail('DEPLOYMENT_CHANGED','Eine Quelldatei wurde vor dem Kopieren verändert.',409);
    output=await open(target,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW||0),0o600);created=true;
    for(;;){const {bytesRead}=await input.read(buffer,0,buffer.length,null);if(!bytesRead)break;total+=bytesRead;if(total>maximum||total>before.size||budget&&bytesRead>budget.remaining)fail('DEPLOYMENT_COPY_LIMIT','Die Quelldatei ist während des Kopierens gewachsen.',409);if(budget)budget.remaining-=bytesRead;hash.update(buffer.subarray(0,bytesRead));let written=0;while(written<bytesRead){const result=await output.write(buffer,written,bytesRead-written,null);if(!result.bytesWritten)fail('DEPLOYMENT_COPY','Die geprüfte Datei konnte nicht vollständig geschrieben werden.',503);written+=result.bytesWritten;}}
    if(total!==before.size||hash.digest('hex')!==expectedSha256||!stable(before,await input.stat())||!stable(before,await lstat(source)))fail('DEPLOYMENT_CHANGED','Eine Quelldatei wurde während des Kopierens verändert.',409);
    await output.sync();const targetInfo=await output.stat();if(!regular(targetInfo)||targetInfo.size!==total||!stable(targetInfo,await lstat(target)))fail('DEPLOYMENT_CHANGED','Eine Zieldatei wurde während des Kopierens verändert.',409);
  }catch(error){if(created){const fdInfo=await output.stat().catch(()=>null),pathInfo=await lstat(target).catch(()=>null);await output.close();output=null;if(fdInfo&&pathInfo&&fdInfo.dev===pathInfo.dev&&fdInfo.ino===pathInfo.ino&&regular(pathInfo))await unlink(target).catch(()=>{});}throw error;}
  finally{await input.close();await output?.close();}
}
async function copyRelease(source,target){
  const files=manifestFiles(source),budget={remaining:RELEASE_PACKAGE_LIMITS.packageBytes};await mkdir(target,{mode:0o700});
  for(const item of [files.at(-1),...files.slice(0,-1)]){const destination=join(target,...item.path.split('/'));if(process.platform==='win32'&&destination.length>DEPLOYMENT_LIMITS.windowsPathLength)fail('DEPLOYMENT_PATH','Ein Windows-Zielpfad überschreitet die unterstützte Länge.',409);await mkdir(dirname(destination),{recursive:true,mode:0o700});await boundedCopy(join(source,...item.path.split('/')),destination,{maximum:item.path==='SOURCE-SHA256.txt'?RELEASE_PACKAGE_LIMITS.manifestBytes:RELEASE_PACKAGE_LIMITS.fileBytes,expectedSha256:item.sha256,budget});}
  syncDirectory(target);return files;
}
function receiptRecord(receipt,now){return {id:releaseId(receipt),version:receipt.version,manifestSha256:receipt.manifestSha256,dataSchema:{...receipt.dataSchema},verifiedAt:stamp(now)};}
async function copyHostFiles(root,hostFiles){
  const owned=[];for(const [name,path] of Object.entries(hostFiles||{})){
    if(!['TradingLocal.exe','Wartung.exe','WindowsGuard.exe','Deinstallieren.exe'].includes(name)||typeof path!=='string'||!isAbsolute(path))fail('DEPLOYMENT_HOST','Die nativen Programme der Einrichtung sind ungültig.');
    const info=await fileHash(path,4*1024*1024),destination=join(root,name);
    if(pathExists(destination)){if((await fileHash(destination,4*1024*1024)).sha256!==info.sha256)fail('DEPLOYMENT_HOST','Ein abweichendes Programm befindet sich bereits im Installationsziel.',409);}
    else{await boundedCopy(path,destination,{maximum:4*1024*1024,expectedSha256:info.sha256});}owned.push({filename:name,...info});
  }return owned;
}
async function installRuntime(root,runtimeExecutable,targetPlatform){
  if(!runtimeExecutable)return null;const arch=targetPlatform.slice(6),expected=RELEASE_RUNTIME_TRUST.windows[arch];
  const info=await fileHash(runtimeExecutable,200*1024*1024);if(info.sha256!==expected.sha256)fail('DEPLOYMENT_RUNTIME','Die mitgelieferte Laufzeit stimmt nicht mit der offiziellen Prüfsumme überein.',409);
  const folder=join(root,'runtime','win-'+arch);safeAncestors(folder,{create:true});const path=join(folder,'node.exe');
  if(pathExists(path)){if((await fileHash(path,200*1024*1024)).sha256!==info.sha256)fail('DEPLOYMENT_RUNTIME','Die installierte Laufzeit muss zuerst gezielt repariert werden.',409);}
  else{await boundedCopy(runtimeExecutable,path,{maximum:200*1024*1024,expectedSha256:info.sha256});}
  return {kind:'pinned',version:RELEASE_RUNTIME_TRUST.version,architecture:arch,path:'runtime/win-'+arch+'/node.exe',sha256:info.sha256};
}
async function ensureInstalledHost(root,state,{hostFiles,runtimeExecutable,nativeGuard,lock,profileLock}){
  let repaired=0;
  const records=state.nativeFiles.map(item=>({path:item.filename,sha256:item.sha256,source:hostFiles[item.filename],maximum:4*1024*1024}));
  if(state.runtime)records.push({path:state.runtime.path,sha256:state.runtime.sha256,source:runtimeExecutable,maximum:200*1024*1024});
  for(const item of records){
    const destination=join(root,...item.path.split('/'));let before=null;
    safeAncestors(dirname(destination),{allowMissing:true});await nativePaths([nearestExisting(dirname(destination))],nativeGuard,{recursive:false});
    if(pathExists(destination)){await nativePaths([destination],nativeGuard,{recursive:false});before=lstatSync(destination);if((await fileHash(destination,item.maximum)).sha256===item.sha256)continue;if(!stable(before,lstatSync(destination)))fail('DEPLOYMENT_CHANGED','Eine Startkomponente wurde während der Prüfung verändert.',409);}
    if(typeof item.source!=='string'||!isAbsolute(item.source)||(await fileHash(item.source,item.maximum)).sha256!==item.sha256)fail('DEPLOYMENT_HOST_REPAIR','Eine registrierte Startkomponente fehlt oder wurde verändert. Zur gezielten Reparatur die ursprüngliche, unveränderte Setup-Datei dieses installierten Stands öffnen. Dieses Setup hat den Startweg nicht repariert.',409);
    lock.assertHeld();profileLock.assertHeld();if(!currentChoice(root,state))fail('DEPLOYMENT_CHANGED','Die Programmauswahl wurde vor der Reparatur verändert.',409);
    safeAncestors(dirname(destination),{create:true});const temporary=destination+'.repair-'+randomUUID()+'.tmp';
    try{
      await boundedCopy(item.source,temporary,{maximum:item.maximum,expectedSha256:item.sha256});await nativePaths([temporary],nativeGuard,{recursive:false});
      const current=pathExists(destination)?lstatSync(destination):null;if(before?!current||!stable(before,current):current!==null)fail('DEPLOYMENT_CHANGED','Eine Startkomponente wurde während der Reparatur verändert.',409);
      if((await fileHash(temporary,item.maximum)).sha256!==item.sha256)fail('DEPLOYMENT_CHANGED','Die vorbereitete Reparatur wurde verändert.',409);
      lock.assertHeld();profileLock.assertHeld();if(!currentChoice(root,state))fail('DEPLOYMENT_CHANGED','Die Programmauswahl wurde während der Reparatur verändert.',409);
      await rename(temporary,destination);syncDirectory(dirname(destination));repaired++;
    }finally{if(pathExists(temporary)&&regular(lstatSync(temporary)))await unlink(temporary).catch(()=>{});}
  }
  return repaired;
}
export async function installRelease({sourceDirectory,installRoot,dataDirectory,targetPlatform,expectedManifestSha256,requestId=randomUUID(),confirmation,hostFiles={},runtimeExecutable=null,nativeGuard,now,failpoint}={}){
  if(confirmation!=='install-selected-package'||!UUID.test(requestId)||!['win32-x64','win32-arm64'].includes(targetPlatform)||!HASH.test(expectedManifestSha256))fail('DEPLOYMENT_CONFIRMATION','Das gewählte Programmpaket ausdrücklich bestätigen.');
  ({installRoot,dataDirectory}=validateRoots(installRoot,dataDirectory));sourceDirectory=safeAncestors(sourceDirectory);
  if(inside(installRoot,sourceDirectory)||inside(sourceDirectory,installRoot)||inside(dataDirectory,sourceDirectory)||inside(sourceDirectory,dataDirectory))fail('DEPLOYMENT_PATH','Das Quellpaket muss ausserhalb der Programm- und Datenordner liegen.',409);
  await nativePaths([sourceDirectory],nativeGuard);await preflightRoot(installRoot,nativeGuard,{create:true});await preflightProfile(dataDirectory,nativeGuard,{create:true});
  const lock=acquireInstallationLock(installRoot),paths=installationPaths(installRoot);let profileLock,job;
  try{
    await recoverUnderLock(installRoot,lock,now,nativeGuard);const before=readState(installRoot,{missing:true});
    if(before&&(before.dataDirectory!==dataDirectory||before.targetPlatform!==targetPlatform))fail('DEPLOYMENT_PROFILE','Die vorhandene Installation gehört zu einem anderen Datenordner oder einer anderen Plattform.',409);
    if(!before){const ownerPath=join(installRoot,'installation-owner.json'),owner=boundedJson(ownerPath,DEPLOYMENT_LIMITS.metadataBytes,{missing:true});
      const permitted=new Set(['installation-guard.sqlite','installation-guard.sqlite-journal','installation.lock','deploy-journal.json']);
      if(owner){if(owner.format!=='trading-local-installation-owner'||owner.schema!==1||!UUID.test(owner.id))fail('DEPLOYMENT_STATE','Die Zuordnung des Programmordners ist beschädigt.',409);for(const name of ['installation-owner.json','versions','staging','runtime','TradingLocal.exe','Wartung.exe','WindowsGuard.exe','Deinstallieren.exe','current-release.txt'])permitted.add(name);}
      if(readdirSync(installRoot).some(name=>!permitted.has(name)))fail('DEPLOYMENT_NOT_EMPTY','Der Programmordner enthält nicht zugeordnete Dateien. Einen eigenen Installationsordner verwenden.',409);
      if(!owner)atomicJson(ownerPath,{format:'trading-local-installation-owner',schema:1,id:randomUUID()});
    }
    await preflightProfile(dataDirectory,nativeGuard);profileLock=acquireProfileLock(dataDirectory);
    const schema=dataSchema(dataDirectory,{allowLegacy:true});
    const verified=await inspectReleaseDirectory(sourceDirectory,{targetPlatform,databaseSchemaVersion:schema,allowMigration:true,expectedManifestSha256});
    const repairedFiles=before?await ensureInstalledHost(installRoot,before,{hostFiles,runtimeExecutable,nativeGuard,lock,profileLock}):0;
    if(before?.current.id===releaseId(verified)){await inspectReleaseDirectory(join(paths.versions,before.current.id),{targetPlatform,databaseSchemaVersion:schema,allowMigration:true,expectedManifestSha256});return {state:repairedFiles?'repaired':'unchanged',repairedFiles,version:verified.version,manifestSha256:verified.manifestSha256,backupCreated:false,migrationRequired:verified.migration.required,sourceSchemaVersion:schema,targetSchemaVersion:2};}
    if(before?.versions.length>=DEPLOYMENT_LIMITS.versions&&!before.versions.some(item=>item.id===releaseId(verified)))fail('DEPLOYMENT_LIMIT','Es sind bereits zu viele Programmstände registriert.',409);
    job={format:'trading-local-deployment-job',schema:1,id:requestId,pid:process.pid,action:'install',state:'running',stage:'backup',createdAt:stamp(now),updatedAt:stamp(now),before,after:null,releaseId:releaseId(verified),dataDirectory,backup:null,error:null};
    writeJournal(installRoot,job);await failpoint?.('backup');job.backup=await saveBeforeUpdate(dataDirectory,requestId);
    directory(paths.versions,{create:true});directory(paths.staging,{create:true});await phase(installRoot,job,'staging',now,failpoint);
    const stage=join(paths.staging,requestId),destination=join(paths.versions,job.releaseId);await copyRelease(sourceDirectory,stage);
    await nativePaths([stage],nativeGuard);
    await inspectReleaseDirectory(stage,{targetPlatform,databaseSchemaVersion:schema,allowMigration:true,expectedManifestSha256});
    await inspectReleaseDirectory(sourceDirectory,{targetPlatform,databaseSchemaVersion:schema,allowMigration:true,expectedManifestSha256});
    lock.assertHeld();profileLock.assertHeld();
    if(pathExists(destination)){await inspectReleaseDirectory(destination,{targetPlatform,databaseSchemaVersion:schema,allowMigration:true,expectedManifestSha256});}
    else{await rename(stage,destination);syncDirectory(paths.versions);}
    const record=receiptRecord(verified,now),native=before?.nativeFiles||await copyHostFiles(installRoot,hostFiles),runtime=before?.runtime||await installRuntime(installRoot,runtimeExecutable,targetPlatform);
    const versions=[...(before?.versions||[]).filter(item=>item.id!==record.id),record];
    job.after={format:'trading-local-installation',schema:1,id:before?.id||randomUUID(),current:record,previous:before?.current||null,versions,dataDirectory,targetPlatform,createdAt:before?.createdAt||stamp(now),updatedAt:stamp(now),nativeFiles:native,runtime,manager:native.find(item=>item.filename==='Wartung.exe')||null};
    await phase(installRoot,job,'ready',now,failpoint);
    await nativePaths([destination],nativeGuard);await inspectReleaseDirectory(destination,{targetPlatform,databaseSchemaVersion:dataSchema(dataDirectory,{allowLegacy:true}),allowMigration:true,expectedManifestSha256});
    if(!currentChoice(installRoot,before))fail('DEPLOYMENT_CHANGED','Die bisherige Programmauswahl wurde verändert.',409);
    await phase(installRoot,job,'selecting',now,failpoint);lock.assertHeld();profileLock.assertHeld();if(!currentChoice(installRoot,before))fail('DEPLOYMENT_CHANGED','Die bisherige Programmauswahl wurde verändert.',409);selection(installRoot,job.after);await phase(installRoot,job,'selected',now,failpoint);
    job.state='succeeded';await phase(installRoot,job,'completed',now,failpoint);
    return {state:'succeeded',version:record.version,manifestSha256:record.manifestSha256,backupCreated:job.backup!==null,migrationRequired:verified.migration.required,sourceSchemaVersion:schema,targetSchemaVersion:2};
  }catch(error){settleFailure(installRoot,job,lock,profileLock,error,now);throw error;}
  finally{profileLock?.release();lock.release();}
}
export async function rollbackRelease({installRoot,confirmation,nativeGuard,now,failpoint}={}){
  if(confirmation!=='rollback-selected-program')fail('DEPLOYMENT_CONFIRMATION','Den Rücksprung zur gespeicherten Vorversion ausdrücklich bestätigen.');
  await preflightRoot(installRoot,nativeGuard);const initial=readState(installRoot);validateRoots(installRoot,initial.dataDirectory);await preflightProfile(initial.dataDirectory,nativeGuard);
  const lock=acquireInstallationLock(installRoot);let profileLock,job;
  try{
    await recoverUnderLock(installRoot,lock,now,nativeGuard);const before=readState(installRoot);if(!before.previous)fail('DEPLOYMENT_NO_PREVIOUS','Es ist keine Vorversion für den Rücksprung registriert.',409);
    validateRoots(installRoot,before.dataDirectory);await preflightProfile(before.dataDirectory,nativeGuard);profileLock=acquireProfileLock(before.dataDirectory);const schema=dataSchema(before.dataDirectory);
    if(schema!==null&&!schemaCompatible(before.previous,schema))fail('DEPLOYMENT_SCHEMA','Die Vorversion kann den aktuellen Datenstand nicht lesen. Es werden keine Daten zurückgestuft.',409);
    const destination=join(installRoot,'versions',before.previous.id);await nativePaths([destination],nativeGuard);
    const verified=await inspectReleaseDirectory(destination,{targetPlatform:before.targetPlatform,databaseSchemaVersion:schema,expectedManifestSha256:before.previous.manifestSha256});
    job={format:'trading-local-deployment-job',schema:1,id:randomUUID(),pid:process.pid,action:'rollback',state:'running',stage:'backup',createdAt:stamp(now),updatedAt:stamp(now),before,after:null,releaseId:before.previous.id,dataDirectory:before.dataDirectory,backup:null,error:null};writeJournal(installRoot,job);
    job.backup=await saveBeforeUpdate(before.dataDirectory,job.id);const current=receiptRecord(verified,now);job.after={...before,current,previous:before.current,versions:before.versions.map(item=>item.id===current.id?current:item),updatedAt:stamp(now)};
    await phase(installRoot,job,'ready',now,failpoint);await inspectReleaseDirectory(destination,{targetPlatform:before.targetPlatform,databaseSchemaVersion:dataSchema(before.dataDirectory),expectedManifestSha256:current.manifestSha256});
    await phase(installRoot,job,'selecting',now,failpoint);lock.assertHeld();profileLock.assertHeld();if(!currentChoice(installRoot,before))fail('DEPLOYMENT_CHANGED','Die bisherige Programmauswahl wurde verändert.',409);selection(installRoot,job.after);await phase(installRoot,job,'selected',now,failpoint);job.state='succeeded';await phase(installRoot,job,'completed',now,failpoint);return {state:'succeeded',version:current.version,manifestSha256:current.manifestSha256,backupCreated:job.backup!==null};
  }catch(error){settleFailure(installRoot,job,lock,profileLock,error,now);throw error;}finally{profileLock?.release();lock.release();}
}
export async function recoverDeployment({installRoot,nativeGuard,now}={}){await preflightRoot(installRoot,nativeGuard);const lock=acquireInstallationLock(installRoot);try{const job=await recoverUnderLock(installRoot,lock,now,nativeGuard);return job?{state:job.state,action:job.action,stage:job.stage}:null;}finally{lock.release();}}

export async function inspectInstalledSelection({installRoot}={}){
  safeAncestors(installRoot);const state=readState(installRoot),schema=dataSchema(state.dataDirectory,{allowLegacy:true});
  return {version:state.current.version,previousVersion:state.previous?.version??null,databaseSchemaVersion:schema,rollbackCompatible:state.previous!==null&&schemaCompatible(state.previous,schema),migrationRequired:schema===1,targetSchemaVersion:2};
}

// A trusted host starts a new process only after passive verification. Keep the
// installation guard until that process owns the real profile guard and port.
export async function launchSelectedRelease({installRoot,nativeGuard,now,openBrowser=true}={}){
  await preflightRoot(installRoot,nativeGuard);const lock=acquireInstallationLock(installRoot);let child,exit,guard,released=false;
  const release=()=>{if(!released){released=true;lock.release();}};
  try{
    await recoverUnderLock(installRoot,lock,now,nativeGuard);const state=readState(installRoot);validateRoots(installRoot,state.dataDirectory);await preflightProfile(state.dataDirectory,nativeGuard);
    guard=acquireProfileLock(state.dataDirectory);const schema=dataSchema(state.dataDirectory,{allowLegacy:true}),application=join(installRoot,'versions',state.current.id);
    await nativePaths([application],nativeGuard);
    const receipt=await inspectReleaseDirectory(application,{targetPlatform:state.targetPlatform,databaseSchemaVersion:schema,allowMigration:true,expectedManifestSha256:state.current.manifestSha256});
    if(!currentChoice(installRoot,state))fail('DEPLOYMENT_CHANGED','Die Programmauswahl wurde verändert.',409);
    lock.assertHeld();guard.assertHeld();guard.release();guard=null;
    const env={...process.env};delete env.NODE_OPTIONS;delete env.NODE_PATH;
    child=spawn(process.execPath,[join(application,'server.mjs'),'--data-dir',state.dataDirectory,...(openBrowser?[]:['--no-open'])],{cwd:application,env,shell:false,stdio:'inherit',windowsHide:false});
    let finished=false,spawnError=false;
    exit=new Promise(resolveExit=>{child.once('error',()=>{spawnError=true;});child.once('close',(code,signal)=>{finished=true;resolveExit({code,signal});});});
    const deadline=Date.now()+20000;let ready=false;
    while(Date.now()<deadline&&!finished){
      const runtime=startupRuntimeRecord(join(state.dataDirectory,'runtime.lock'));
      if(runtime?.pid===child.pid&&runtime.role==='core'&&UUID.test(runtime.owner)&&Number.isSafeInteger(runtime.port)&&runtime.port>0&&runtime.port<65536){ready=true;break;}
      await new Promise(resolveWait=>setTimeout(resolveWait,25));
    }
    if(!ready){if(!finished){child.kill('SIGTERM');await Promise.race([exit,new Promise(resolveWait=>setTimeout(resolveWait,5000))]);if(!finished)child.kill('SIGKILL');}fail('DEPLOYMENT_START_FAILED',spawnError?'Der neue lokale Programmprozess konnte nicht gestartet werden.':'Der neue Programmprozess hat keinen erfolgreichen lokalen Start bestätigt.',503);}
    release();return {child,exit,version:receipt.version,migrationRequired:receipt.migration.required,sourceSchemaVersion:schema,targetSchemaVersion:2};
  }catch(error){if(child&&child.exitCode===null)child.kill('SIGTERM');throw error;}
  finally{guard?.release();release();}
}

function emptyDirectory(path){try{rmdirSync(path);}catch(error){if(!['ENOENT','ENOTEMPTY','EEXIST'].includes(error?.code))throw error;}}
async function ownedRemovalPlan(root,state,nativeGuard,{resuming=false}={}){
  const plan=[],directories=new Set();let preserved=0;
  for(const version of state.versions){
    const base=join(root,'versions',version.id);if(!pathExists(base)){if(resuming)continue;fail('DEPLOYMENT_FILE','Ein registrierter Programmordner fehlt.',409);}
    safeAncestors(base);await nativePaths([base],nativeGuard);
    const manifest=join(base,'SOURCE-SHA256.txt');
    if(!pathExists(manifest)){if(resuming){preserved+=readdirSync(base).length;continue;}fail('DEPLOYMENT_FILE','Die Prüfliste eines installierten Programms fehlt.',409);}
    if((await fileHash(manifest,RELEASE_PACKAGE_LIMITS.manifestBytes)).sha256!==version.manifestSha256)fail('DEPLOYMENT_FILE','Die Prüfliste eines installierten Programms wurde verändert.',409);
    const files=manifestFiles(base);for(const item of files){const path=join(base,...item.path.split('/'));if(!pathExists(path))continue;safeAncestors(dirname(path));const maximum=item.path==='SOURCE-SHA256.txt'?RELEASE_PACKAGE_LIMITS.manifestBytes:RELEASE_PACKAGE_LIMITS.fileBytes,actual=await fileHash(path,maximum);if(actual.sha256!==item.sha256){preserved++;continue;}plan.push({path,sha256:actual.sha256,maximum});for(let parent=dirname(path);inside(base,parent);parent=dirname(parent)){directories.add(parent);if(parent===base)break;}}
  }
  for(const item of state.nativeFiles){const path=join(root,item.filename);if(!pathExists(path))continue;await nativePaths([path],nativeGuard,{recursive:false});const actual=await fileHash(path,4*1024*1024);if(actual.sha256!==item.sha256){preserved++;continue;}plan.push({path,sha256:item.sha256,maximum:4*1024*1024});}
  if(state.runtime){const path=join(root,...state.runtime.path.split('/'));if(pathExists(path)){safeAncestors(dirname(path));await nativePaths([path],nativeGuard,{recursive:false});const actual=await fileHash(path,200*1024*1024);if(actual.sha256===state.runtime.sha256){plan.push({path,sha256:actual.sha256,maximum:200*1024*1024});directories.add(dirname(path));directories.add(join(root,'runtime'));}else preserved++;}}
  return {plan,directories:[...directories].sort((a,b)=>b.length-a.length),preserved};
}

// Resumable removal deletes only files named by exact manifests/native receipts.
// Changed or unrelated files and every personal-data file remain on disk.
export async function removeInstallation({installRoot,confirmation,nativeGuard,now,failpoint}={}){
  if(confirmation!=='remove-program-keep-data')fail('DEPLOYMENT_CONFIRMATION','Die Programmentfernung mit Datenerhalt ausdrücklich bestätigen.');
  if(inside(resolve(installRoot),resolve(process.execPath))||inside(resolve(installRoot),fileURLToPath(import.meta.url)))fail('DEPLOYMENT_RUNNING_RUNTIME','Die Entfernung muss über den unabhängigen temporären Deinstallationshost erfolgen.',409);
  await preflightRoot(installRoot,nativeGuard);const lock=acquireInstallationLock(installRoot);let guard;
  try{
    const pending=privateJournal(installRoot),actual=readState(installRoot,{missing:true}),pointer=readPointer(installRoot);
    if(pending?.action==='remove'&&pending.state==='succeeded'&&actual===null&&pointer===null)return {state:'removed',dataPreserved:true,changedFilesPreserved:null};
    const resuming=pending?.state==='running'&&pending.action==='remove';
    if(!resuming)await recoverUnderLock(installRoot,lock,now,nativeGuard);
    const before=resuming?pending.before:readState(installRoot);if(!before)fail('DEPLOYMENT_STATE','Die zu entfernende Installation ist nicht vollständig zugeordnet.',409);
    const ownsChoice=()=>{const value=readState(installRoot,{missing:true}),point=readPointer(installRoot);return (sameChoice(value,before)||resuming&&value===null)&&(point===before.current.id||resuming&&point===null);};
    if(!ownsChoice())fail('DEPLOYMENT_RECOVERY_REQUIRED','Die begonnene Entfernung passt nicht mehr zur Installation.',409);
    validateRoots(installRoot,before.dataDirectory);await preflightProfile(before.dataDirectory,nativeGuard);guard=acquireProfileLock(before.dataDirectory);
    const removal=await ownedRemovalPlan(installRoot,before,nativeGuard,{resuming});
    const job=resuming?pending:{format:'trading-local-deployment-job',schema:1,id:randomUUID(),pid:process.pid,action:'remove',state:'running',stage:'removing',createdAt:stamp(now),updatedAt:stamp(now),before,after:null,releaseId:null,dataDirectory:before.dataDirectory,backup:null,error:null};
    job.pid=process.pid;await phase(installRoot,job,'removing',now,failpoint);
    if(!ownsChoice())fail('DEPLOYMENT_CHANGED','Die Programmauswahl wurde verändert.',409);
    for(const item of removal.plan){lock.assertHeld();guard.assertHeld();if((await fileHash(item.path,item.maximum)).sha256!==item.sha256)fail('DEPLOYMENT_CHANGED','Eine Datei wurde während der Entfernung verändert.',409);unlinkSync(item.path);}
    for(const path of removal.directories)emptyDirectory(path);
    lock.assertHeld();guard.assertHeld();if(!ownsChoice())fail('DEPLOYMENT_CHANGED','Die Programmauswahl wurde verändert.',409);
    selection(installRoot,null);await failpoint?.('removed_selection');job.state='succeeded';await phase(installRoot,job,'completed',now,failpoint);
    for(const name of ['versions','staging','runtime'])emptyDirectory(join(installRoot,name));
    // Retain the small guard and terminal receipt. Unlinking a guard inode after
    // releasing it could sever a concurrently started installer's actual lock.
    return {state:'removed',dataPreserved:true,changedFilesPreserved:removal.preserved};
  }finally{guard?.release();lock.release();}
}
export async function getInstallationStatus({applicationDirectory,databaseSchemaVersion,now}={}){
  const checkedAt=stamp(now),base={format:'trading-local-installation-status',schema:1,mode:'portable',runningVersion:null,selectedVersion:null,previousVersion:null,runningSelectionMatches:null,databaseSchemaVersion:Number.isSafeInteger(databaseSchemaVersion)?databaseSchemaVersion:null,rollback:{available:false,version:null,reason:'not_managed'},lastVerification:null,checkedAt,automaticUpdateSupported:false,publisherVerified:false,updateMode:'manual_installer',restartRequired:true};
  let application;
  try{application=resolve(applicationDirectory);const packageInfo=boundedJson(join(application,'package.json'));if(VERSION.test(packageInfo?.version))base.runningVersion=packageInfo.version;}catch{return {...base,mode:'unknown',rollback:{available:false,version:null,reason:'invalid_installation'}};}
  if(basename(dirname(application))!=='versions')return base;
  try{
    const root=dirname(dirname(application));directory(root);directory(join(root,'versions'));directory(application);
    const state=readState(root),known=state.versions.find(item=>item.id===basename(application));
    if(!known||known.version!==base.runningVersion)throw new Error('Unknown installation.');
    base.mode='managed';base.selectedVersion=state.current.version;base.previousVersion=state.previous?.version??null;base.runningSelectionMatches=state.current.id===known.id;
    base.lastVerification={checkedAt:state.current.verifiedAt,manifestSha256:state.current.manifestSha256,scope:'installation_commit'};
    base.rollback={available:false,version:base.previousVersion,reason:!state.previous?'no_previous':!schemaCompatible(state.previous,databaseSchemaVersion)?'schema_incompatible':'unsupported'};
    if(state.previous&&schemaCompatible(state.previous,databaseSchemaVersion)&&process.platform==='win32'&&object(state.manager)&&state.manager.filename==='Wartung.exe'&&HASH.test(state.manager.sha256)){
      const path=join(root,'Wartung.exe'),info=lstatSync(path);
      if(info.isFile()&&!info.isSymbolicLink()&&info.size<=4*1024*1024&&(await fileHash(path,4*1024*1024)).sha256===state.manager.sha256)base.rollback={available:true,version:state.previous.version,reason:'compatible'};
    }
    return base;
  }catch{return {...base,mode:'unknown',selectedVersion:null,previousVersion:null,runningSelectionMatches:null,lastVerification:null,rollback:{available:false,version:null,reason:'invalid_installation'}};}
}
