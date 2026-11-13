import { DatabaseSync } from 'node:sqlite';
import { constants } from 'node:fs';
import { access, lstat, open, opendir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { loadReady17Artifact } from './artifacts.mjs';
import { CURRENT_SCHEMA_VERSION as SCHEMA_VERSION, inspectDatabaseSchema } from './store.mjs';

// These checks inspect the running installation. They do not install a package,
// migrate a database, contact a provider, or grant a bot permission to trade.
export const SYSTEM_CHECK_LIMITS = Object.freeze({
  manifestBytes: 2 * 1024 * 1024, packageFiles: 4096, directoryEntries: 8192,
  fileBytes: 64 * 1024 * 1024, packageBytes: 256 * 1024 * 1024,
  databaseBytes: 128 * 1024 * 1024, backupEntries: 256, pathDepth: 20
});
export const SYSTEM_CHECK_ACTIONS = Object.freeze(['recheck','cli_path','cli_install','account','provider','bot_setup','backup','package_help']);
const STATUSES = Object.freeze(['pass','warning','error','not_checked','not_configured','unsupported']);
const DEFINITIONS = Object.freeze({
  runtime: {category:'required',title:'Lokale Laufzeit',actions:['recheck','package_help']},
  database: {category:'required',title:'Lokale Datenbank',actions:['recheck','package_help']},
  data_directory: {category:'required',title:'Datenordner',actions:['recheck','package_help']},
  backups: {category:'optional',title:'Lokale Sicherung',actions:['backup','recheck']},
  package: {category:'optional',title:'Paketintegrität',actions:['recheck','package_help']},
  bot_artifact: {category:'optional',title:'Mitgelieferte Botdatei',actions:['bot_setup','package_help']},
  account: {category:'optional',title:'Trading-Konto',actions:['account']},
  provider: {category:'optional',title:'KI-Assistent',actions:['provider']},
  cli: {category:'optional',title:'cTrader CLI',actions:['recheck','cli_path','cli_install']},
  bots: {category:'optional',title:'Botverbindungen',actions:['bot_setup']},
  credentials: {category:'optional',title:'Zugangsspeicher',actions:['package_help']}
});
const LOCAL_IDS = Object.freeze(['runtime','database','data_directory','backups','package','bot_artifact']);
const REQUIRED_IDS = LOCAL_IDS.filter(id => DEFINITIONS[id].category === 'required');
const PACKAGE_ROOT_FILES = new Set(['README_DE.md','Starten.cmd','Starten.sh','package.json','server.mjs','global.json']);
const PACKAGE_DIRECTORIES = new Set(['adapters','core','docs','evidence','integrations','public','scripts','sdk','tests']);
const PACKAGE_EXCLUDED = new Set(['bin','obj','node_modules','data','runtime','toolchains','.git','.cache','.nuget']);
const MINIMUM_PACKAGE_FILES = ['package.json','server.mjs','core/store.mjs','core/control.mjs','public/index.html'];
const SAFE_REASON = new Set(['unavailable','missing','invalid','unsupported_schema','schema_mismatch','integrity_failed','limit_exceeded','unsafe_entry','invalid_manifest','incomplete_manifest','hash_mismatch','file_changed','package_incompatible','backup_in_progress','stale','legacy','download_mismatch']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const version = value => typeof value === 'string' && /^\d{1,3}(?:\.\d{1,3}){1,3}(?:-(?:alpha|beta|rc)(?:[.-]?\d{1,3})?)?$/.test(value) ? value : null;
function clock(now) {
  const value = typeof now === 'function' ? now() : now ?? Date.now();
  if (!Number.isFinite(value) || value < 0 || value > 8640000000000000) throw new TypeError('Invalid system-check clock');
  return value;
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value ? value : null;
}
const at = value => new Date(value).toISOString();
const age = (value, now) => { const stamp=date(value); return stamp && now>=Date.parse(stamp) ? now-Date.parse(stamp) : null; };
const failure = reason => { throw Object.assign(new Error('SYSTEM_CHECK_FAILED'), {checkReason:reason}); };
const reasonOf = error => SAFE_REASON.has(error?.checkReason) ? error.checkReason : error?.code === 'ENOENT' ? 'missing' : 'unavailable';
function check(id,status,message,observedAt,evidence={}) {
  const definition=DEFINITIONS[id];
  return {id,category:definition.category,status,title:definition.title,message,observedAt:date(observedAt),evidence,actions:[...definition.actions]};
}
function sameFile(before,after) {
  return before.isFile() && after.isFile() && before.dev===after.dev && before.ino===after.ino && before.size===after.size && before.mtimeMs===after.mtimeMs && before.ctimeMs===after.ctimeMs;
}
async function boundedFile(path,maximum,{digestOnly=false}={}) {
  const before=await lstat(path);
  if (!before.isFile() || before.isSymbolicLink()) failure('unsafe_entry');
  if (before.size>maximum) failure('limit_exceeded');
  const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  try {
    if (!sameFile(before,await handle.stat())) failure('file_changed');
    const chunks=[],hash=createHash('sha256'),buffer=Buffer.allocUnsafe(65536);let total=0;
    for (;;) {
      const {bytesRead}=await handle.read(buffer,0,buffer.length,null);
      if (!bytesRead) break;
      total+=bytesRead;if (total>maximum) failure('limit_exceeded');
      if (digestOnly) hash.update(buffer.subarray(0,bytesRead));else chunks.push(Buffer.from(buffer.subarray(0,bytesRead)));
    }
    if (total!==before.size || !sameFile(before,await handle.stat()) || !sameFile(before,await lstat(path))) failure('file_changed');
    return digestOnly ? {bytes:total,sha256:hash.digest('hex'),stat:before} : Buffer.concat(chunks,total);
  } finally { await handle.close(); }
}
function packageMember(path) {
  const parts=path.split('/');
  if (parts.some(part=>part.startsWith('.') || PACKAGE_EXCLUDED.has(part))) return false;
  if (parts[0]==='evidence' && /\.(?:jpg|jpeg|png|webp|gif)$/i.test(path)) return false;
  return parts.length===1 ? PACKAGE_ROOT_FILES.has(path) : PACKAGE_DIRECTORIES.has(parts[0]);
}
function safeRelativePath(path) {
  return typeof path==='string' && path.length<=512 && /^[A-Za-z0-9_][A-Za-z0-9_./-]*$/.test(path) &&
    !isAbsolute(path) && path.split('/').length<=SYSTEM_CHECK_LIMITS.pathDepth &&
    path.split('/').every(part=>part && part!=='.' && part!=='..' && !part.startsWith('.'));
}
async function packageFiles(root) {
  const files=[];let entries=0;
  async function walk(directory,prefix='') {
    const stream=await opendir(directory);
    for await (const entry of stream) {
      if (++entries>SYSTEM_CHECK_LIMITS.directoryEntries) failure('limit_exceeded');
      if (entry.name.startsWith('.') || PACKAGE_EXCLUDED.has(entry.name)) continue;
      const name=prefix ? prefix+'/'+entry.name : entry.name;
      if (!prefix && !PACKAGE_DIRECTORIES.has(entry.name) && !PACKAGE_ROOT_FILES.has(entry.name)) continue;
      if (prefix && !packageMember(name)) continue;
      if (!safeRelativePath(name) || entry.isSymbolicLink()) failure('unsafe_entry');
      if (entry.isDirectory()) {
        if (name.split('/').length>=SYSTEM_CHECK_LIMITS.pathDepth) failure('limit_exceeded');
        await walk(join(directory,entry.name),name);
      } else if (entry.isFile()) {
        files.push(name);if (files.length>SYSTEM_CHECK_LIMITS.packageFiles) failure('limit_exceeded');
      } else failure('unsafe_entry');
    }
  }
  await walk(root);return files.sort();
}
async function inspectPackage(applicationDirectory,observedAt) {
  let packageVersion=null;
  try {
    const root=await realpath(resolve(applicationDirectory));
    const raw=await boundedFile(join(root,'package.json'),65536);
    const metadata=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
    packageVersion=version(metadata?.version);
    if (metadata?.name!=='trading-local-core' || !packageVersion || metadata?.engines?.node!=='>=24.0.0 <25') failure('package_incompatible');
    let manifest;
    try {manifest=await boundedFile(join(root,'SOURCE-SHA256.txt'),SYSTEM_CHECK_LIMITS.manifestBytes);}
    catch(error) {
      if(error?.code==='ENOENT')return check('package','not_checked','Die Paketprüfliste fehlt. Die lokale Anwendung kann genutzt werden; ein Programmupdate ist damit nicht geprüft.',observedAt,{version:packageVersion,manifestVerified:false,signatureVerified:false,reason:'missing'});
      throw error;
    }
    const lines=new TextDecoder('utf-8',{fatal:true}).decode(manifest).split(/\r?\n/);
    if (lines.at(-1)==='') lines.pop();
    if (!lines.length || lines.length>SYSTEM_CHECK_LIMITS.packageFiles) failure('limit_exceeded');
    const expected=new Map(),folded=new Set();
    for (const line of lines) {
      const match=/^([a-f0-9]{64})  (.+)$/.exec(line);
      if (!match || !safeRelativePath(match[2]) || !packageMember(match[2]) || folded.has(match[2].toLowerCase())) failure('invalid_manifest');
      expected.set(match[2],match[1]);folded.add(match[2].toLowerCase());
    }
    if (MINIMUM_PACKAGE_FILES.some(path=>!expected.has(path))) failure('incomplete_manifest');
    const actual=await packageFiles(root);
    if (actual.length!==expected.size || actual.some(path=>!expected.has(path))) failure('incomplete_manifest');
    let total=0,verified=0;const inspected=[];
    for (const path of actual) {
      const resolved=await realpath(join(root,path)),within=relative(root,resolved);
      if (isAbsolute(within) || within==='..' || within.startsWith('../') || within.startsWith('..\\')) failure('unsafe_entry');
      const digest=await boundedFile(join(root,path),Math.min(SYSTEM_CHECK_LIMITS.fileBytes,SYSTEM_CHECK_LIMITS.packageBytes-total),{digestOnly:true});
      total+=digest.bytes;if (digest.sha256!==expected.get(path)) failure('hash_mismatch');verified++;inspected.push({path,stat:digest.stat});
    }
    // Bind the result to the manifest and package metadata actually read above.
    if (!(await boundedFile(join(root,'SOURCE-SHA256.txt'),SYSTEM_CHECK_LIMITS.manifestBytes)).equals(manifest) ||
        !(await boundedFile(join(root,'package.json'),65536)).equals(raw)) failure('file_changed');
    if ((await packageFiles(root)).join('\0')!==actual.join('\0')) failure('file_changed');
    for (const file of inspected) if (!sameFile(file.stat,await lstat(join(root,file.path)))) failure('file_changed');
    return check('package','pass','Alle Dateien der Paketprüfliste stimmen mit ihren SHA-256-Werten überein. Das ist eine Integritätsprüfung, keine Herausgebersignatur und keine Updatefreigabe.',observedAt,
      {version:packageVersion,manifestVerified:true,manifestSha256:createHash('sha256').update(manifest).digest('hex'),signatureVerified:false,files:verified,bytes:total});
  } catch(error) {
    return check('package','error','Das Programmpaket konnte nicht vollständig bestätigt werden. Das vollständige Paket erneut entpacken und die Prüfung wiederholen.',observedAt,
      {version:packageVersion,manifestVerified:false,signatureVerified:false,reason:reasonOf(error)});
  }
}
function inspectRuntime(observedAt) {
  let db;
  try {
    db=new DatabaseSync(':memory:',{allowExtension:false});
    const sqliteVersion=version(db.prepare('SELECT sqlite_version() AS version').get().version);
    const nodeVersion=version(process.versions.node),supported=Number(process.versions.node.split('.')[0])===24;
    return check('runtime',supported?'pass':'error',supported?'Node.js 24 und die lokale SQLite-Laufzeit sind ausführbar.':'Diese Anwendung benötigt Node.js 24 mit eingebautem SQLite.',observedAt,
      {nodeVersion,sqliteVersion,platform:process.platform,architecture:process.arch,sqliteAvailable:true,supportedNode:supported});
  } finally {db?.close();}
}
async function inspectCurrentDatabase(store,observedAt) {
  const info=await lstat(store.path);
  if (!info.isFile() || info.isSymbolicLink()) failure('unsafe_entry');
  const pages=store.db.prepare('PRAGMA page_count').get().page_count,pageBytes=store.db.prepare('PRAGMA page_size').get().page_size;
  if (!integer(pages)||!integer(pageBytes)||pages*pageBytes>SYSTEM_CHECK_LIMITS.databaseBytes||info.size>SYSTEM_CHECK_LIMITS.databaseBytes) return check('database','not_checked','Die Datenbank ist grösser als die begrenzte Prüfung. Es wurden keine Daten verändert; eine vollständige Wartungsprüfung bleibt erforderlich.',observedAt,{reason:'limit_exceeded',expectedSchema:SCHEMA_VERSION});
  const evidence=inspectDatabaseSchema(store.db);
  const good=evidence.schemaCompatible && evidence.integrity==='ok';
  return check('database',good?'pass':'error',good?'Schema und SQLite-Integritätsprüfung des geöffneten Profils sind in Ordnung. Es wurden keine Daten geändert.':'Die Datenbank passt nicht zum unterstützten Schema oder konnte nicht als intakt bestätigt werden. Eine Sicherung und die Wiederherstellungsanleitung prüfen.',observedAt,evidence);
}
async function inspectDirectory(store,observedAt) {
  const directory=await realpath(store.directory),info=await lstat(directory);
  if (!info.isDirectory()) failure('invalid');
  await access(directory,constants.R_OK|constants.W_OK|(process.platform==='win32'?0:constants.X_OK));
  return check('data_directory','pass','Der Datenordner ist erreichbar und laut Betriebssystem für diesen Prozess les- und beschreibbar. Diese Zugriffsprüfung schreibt keine Testdatei.',observedAt,
    {readAccess:true,writeAccess:true,writeProbePerformed:false});
}
async function exists(path) {try {await lstat(path);return true;}catch(error){if(error?.code==='ENOENT')return false;throw error;}}
async function inspectBackups(store,observedAt,now) {
  const directory=join(store.directory,'backups');
  if (!await exists(directory)) return check('backups','not_configured','Noch keine lokale SQLite-Sicherung vorhanden. Eine Sicherung lässt sich unter System erstellen.',observedAt,{count:0,integrity:'not_checked'});
  const info=await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) failure('unsafe_entry');
  const files=[];let entries=0;
  for await (const entry of await opendir(directory)) {
    if (++entries>SYSTEM_CHECK_LIMITS.backupEntries) failure('limit_exceeded');
    if (!/^backup-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z-[a-f0-9]{8}\.sqlite$/.test(entry.name)) continue;
    if (!entry.isFile() || entry.isSymbolicLink()) failure('unsafe_entry');
    files.push(entry.name);
  }
  files.sort();
  if (!files.length) return check('backups','not_configured','Noch keine erkannte lokale SQLite-Sicherung vorhanden. Eine Sicherung lässt sich unter System erstellen.',observedAt,{count:0,integrity:'not_checked'});
  const path=join(directory,files.at(-1)),before=await lstat(path);
  if (!before.isFile() || before.isSymbolicLink()) failure('unsafe_entry');
  const base={count:files.length,inspected:1,latestModifiedAt:at(before.mtimeMs),bytes:before.size};
  if (before.size>SYSTEM_CHECK_LIMITS.databaseBytes) return check('backups','warning','Die neueste Sicherung überschreitet die begrenzte Prüfung. Ihre Wiederherstellbarkeit wurde nicht bestätigt.',observedAt,{...base,integrity:'not_checked',reason:'limit_exceeded'});
  if (await exists(path+'-wal') || await exists(path+'-shm') || await exists(path+'-journal'))
    return check('backups','warning','Die neueste Sicherung besitzt noch Begleitdateien oder wird verwendet. Ihre Prüfung wird bis zu einem abgeschlossenen Dateistand zurückgestellt.',observedAt,{...base,integrity:'not_checked',reason:'backup_in_progress'});
  // Immutable, read-only SQLite URI for a completed backup only. This avoids
  // creating WAL/SHM files. Never use immutable for the running profile.
  // SQLite documents the no-lock assumption: https://www.sqlite.org/uri.html
  const uri=pathToFileURL(path);uri.searchParams.set('mode','ro');uri.searchParams.set('immutable','1');
  let db;
  try {
    db=new DatabaseSync(uri.href,{readOnly:true,allowExtension:false,timeout:100});
    const result=inspectDatabaseSchema(db,{allowLegacy:true}),after=await lstat(path);
    if (!sameFile(before,after)) failure('file_changed');
    if (await exists(path+'-wal') || await exists(path+'-shm') || await exists(path+'-journal')) failure('backup_in_progress');
    const good=result.schemaCompatible && result.integrity==='ok';
    const old=now-before.mtimeMs>48*60*60*1000 || before.mtimeMs>now+60000;
    return check('backups',good&&!old?'pass':'warning',!good?'Die neueste Sicherung konnte nicht als unterstützt und intakt bestätigt werden. Eine neue Sicherung erstellen.':old?'Die neueste Sicherung ist strukturell geprüft, aber ihr Dateizeitpunkt ist älter als 48 Stunden oder liegt in der Zukunft. Eine aktuelle Sicherung erstellen.':result.needsMigration?'Die Sicherung mit Schema 1 ist strukturell geprüft. Bei einer Wiederherstellung wird ausschliesslich ihre Arbeitskopie auf Schema 2 aktualisiert. Ein vollständiger Wiederherstellungsdurchlauf wurde dabei nicht ausgeführt.':'Die neueste lokale Sicherung passt zum Schema und besteht die SQLite-Integritätsprüfung. Ein vollständiger Wiederherstellungsdurchlauf wurde dabei nicht ausgeführt.',observedAt,
      {...base,schemaVersion:result.schemaVersion,schemaCompatible:result.schemaCompatible,needsMigration:result.needsMigration,integrity:result.integrity,...(!good?{reason:result.reason}:old?{reason:'stale'}:{})});
  } catch(error) {
    if (SAFE_REASON.has(error?.checkReason)) throw error;
    failure('integrity_failed');
  } finally {db?.close();}
}
async function inspectArtifact(applicationDirectory,artifact,observedAt) {
  const current=(await loadReady17Artifact(applicationDirectory)).descriptor,cached=artifact?.descriptor||artifact;
  const mismatch=cached?.available===true && current.available===true && (cached.sha256!==current.sha256 || cached.bytes!==current.bytes);
  const good=current.available===true && current.status==='verified' && !mismatch;
  const status=good?'pass':current.status==='missing'?'not_configured':current.status==='legacy_compatibility'?'warning':'error';
  return check('bot_artifact',status,good?'Die mitgelieferte Botdatei stimmt mit Buildnachweis und inneren Hersteller-Metadaten überein. Das bestätigt keinen Start in cTrader.':current.status==='missing'?'Die mitgelieferte Botdatei fehlt. Lokale Profile und andere kompatible Bots bleiben nutzbar.':'Die mitgelieferte Botdatei entspricht nicht dem erwarteten aktuellen Stand. Das vollständige Paket und den Botleitfaden prüfen.',observedAt,
    {available:current.available===true,verified:good,framework:current.targetFramework||null,minimumCTraderVersion:current.minimumCTraderVersion||null,bytes:current.bytes??null,
      ...(!good?{reason:mismatch?'download_mismatch':current.status==='legacy_compatibility'?'legacy':current.status==='missing'?'missing':'invalid'}:{})});
}

export async function collectLocalChecks({store,applicationDirectory,artifact,now}={}) {
  const timestamp=clock(now),checkedAt=at(timestamp);
  const operations={runtime:()=>inspectRuntime(checkedAt),database:()=>inspectCurrentDatabase(store,checkedAt),data_directory:()=>inspectDirectory(store,checkedAt),
    backups:()=>inspectBackups(store,checkedAt,timestamp),package:()=>inspectPackage(applicationDirectory,checkedAt),bot_artifact:()=>inspectArtifact(applicationDirectory,artifact,checkedAt)};
  const results=await Promise.allSettled(LOCAL_IDS.map(id=>Promise.resolve().then(operations[id])));
  const checks=results.map((result,index)=>result.status==='fulfilled'?result.value:check(LOCAL_IDS[index],'error','Diese lokale Prüfung konnte nicht abgeschlossen werden. Die betreffende Komponente und die Anleitung prüfen.',checkedAt,{reason:reasonOf(result.reason)}));
  return {checkedAt,localReady:REQUIRED_IDS.every(id=>checks.find(item=>item.id===id)?.status==='pass'),checks};
}

function accountCheck(health,now) {
  const broker=object(health?.broker)?health.broker:{},observedAt=date(broker.lastSuccessAt),observationAge=age(observedAt,now);
  const status=broker.status;
  if(status==='not_configured')return check('account','not_configured','Kein Trading-Konto verbunden. Lokale Profile können ohne Konto verwendet werden.',null,{configured:false,externalProbePerformed:false});
  if(status==='credentials_required')return check('account','error','Für die gespeicherte Kontoverbindung fehlen verfügbare Zugangsdaten. Das Konto erneut verbinden.',observedAt,{configured:true,credentialsAvailable:false,externalProbePerformed:false});
  if(status==='error')return check('account','error','Die letzte Kontobeobachtung konnte nicht bestätigt werden. Die Kontoverbindung prüfen.',observedAt,{configured:true,externalProbePerformed:false});
  if(status==='connected'&&observationAge!==null&&observationAge<=35000)return check('account','pass','Aktuelle Kontodaten wurden beobachtet. Dieser Systemcheck führt keinen zusätzlichen Kontoaufruf aus und erteilt keine Handelsrechte.',observedAt,{configured:true,fresh:true,observationAgeMs:observationAge,externalProbePerformed:false});
  if(['connected','stale'].includes(status))return check('account','warning','Für das gespeicherte Konto liegt kein hinreichend aktueller Nachweis vor. Die Kontoverbindung ansehen.',observedAt,{configured:true,fresh:false,...(observationAge===null?{}:{observationAgeMs:observationAge}),externalProbePerformed:false});
  return check('account','not_checked','Der Kontostatus ist noch nicht geprüft.',null,{externalProbePerformed:false});
}
function providerCheck(health) {
  const provider=object(health?.provider)?health.provider:{},observedAt=date(provider.lastCheckedAt);
  const evidence={externalProbePerformed:false,toolCalling:provider.toolCalling===true};
  if(provider.status==='not_configured')return check('provider','not_configured','Kein KI-Anbieter eingerichtet. Die manuellen Funktionen bleiben verfügbar.',null,{...evidence,configured:false});
  if(provider.status==='credentials_required')return check('provider','error','Für den gespeicherten KI-Anbieter fehlen verfügbare Zugangsdaten. Die KI-Verbindung öffnen.',observedAt,{...evidence,configured:true,credentialsAvailable:false});
  if(provider.status==='configured'&&observedAt)return check('provider',provider.toolCalling===true?'pass':'warning',provider.toolCalling===true?'Die KI ist eingerichtet und besitzt einen gespeicherten Nachweis für Werkzeugaufrufe. Der angezeigte Zeitpunkt stammt von dieser früheren Prüfung; es wurde kein neuer Modellaufruf ausgeführt.':'Die KI ist eingerichtet, aber Werkzeugaufrufe sind nicht bestätigt. Der Systemcheck startet keinen Modellaufruf.',observedAt,{...evidence,configured:true,credentialsAvailable:true});
  return check('provider',provider.status==='error'?'error':'not_checked','Für die KI liegt noch kein bestätigter Funktionsnachweis vor. Anbieter und Modell in der KI-Einrichtung prüfen.',observedAt,evidence);
}
function cliCheck(health) {
  const cli=object(health?.cli)?health.cli:{},observedAt=date(cli.checkedAt),cliVersion=version(cli.version);
  if(cli.status==='error')return check('cli','error','Die letzte CLI-Prüfung konnte nicht abgeschlossen werden. Erneut prüfen oder einen passenden Installationsort auswählen.',observedAt,{available:false,reason:'unavailable'});
  if(cli.available===true&&cliVersion){
    const [major,minor]=cliVersion.split('.').map(Number),old=major<5||major===5&&minor<10;
    return check('cli',old?'warning':'pass',old?'Eine ausführbare CLI wurde beobachtet. Die mitgelieferte .NET-10-Botdatei benötigt mindestens CLI 5.10.':'Ein erfolgreicher Versionsaufruf der CLI liegt vor. Die Kompatibilität eines konkreten Bots ist erst nach dessen Metadatenprüfung bestätigt.',observedAt,{available:true,version:cliVersion,bundledMinimumMet:!old,metadataCompatibilityConfirmed:false});
  }
  if(cli.available===false&&observedAt)return check('cli','not_configured','Bei der letzten Suche wurde keine verwendbare cTrader CLI bestätigt. Erneut suchen, den Installationsort auswählen oder die offizielle Anleitung öffnen.',observedAt,{available:false});
  return check('cli','not_checked','Die cTrader CLI wurde noch nicht geprüft. Sie wird für den Import fremder Botdateien benötigt.',null,{available:false});
}
function botsCheck(bots,now) {
  const list=Array.isArray(bots)?bots.filter(object).slice(0,100):[];
  const evidence={profiles:list.length,bridgeProfiles:0,metadataOnly:0,reachable:0,stale:0,unconnected:0,faulted:0};let latest=null;
  for(const bot of list){
    if(bot.adapter==='ctrader-cli'){evidence.metadataOnly++;continue;}
    evidence.bridgeProfiles++;
    const last=date(bot.lastSeen),elapsed=age(last,now);
    if(last&&elapsed!==null&&(!latest||last>latest))latest=last;
    if(['fault','conflict'].includes(bot.status))evidence.faulted++;
    else if(bot.status==='connected'&&elapsed!==null&&elapsed<=15000)evidence.reachable++;
    else if(last||bot.status==='stale')evidence.stale++;
    else evidence.unconnected++;
  }
  if(!list.length)return check('bots','not_configured','Noch kein Botprofil vorhanden. Ein Bot lässt sich später ergänzen.',null,evidence);
  if(evidence.faulted)return check('bots','error','Mindestens eine Bot-Bridge meldet einen Konflikt oder Fehler. Den betreffenden Bot im Leitfaden prüfen.',latest,evidence);
  if(evidence.reachable===evidence.bridgeProfiles&&evidence.bridgeProfiles>0&&evidence.metadataOnly===0)return check('bots','pass','Alle angelegten Bot-Bridges senden aktuelle Lebenszeichen. Eine Handelsfreigabe ist davon unabhängig.',latest,evidence);
  return check('bots','warning','Mindestens ein Profil besitzt noch keine aktuell bestätigte Bot-Bridge oder unterstützt nur Metadaten. Den jeweiligen Botleitfaden fortsetzen.',latest,evidence);
}
function credentialsCheck(health) {
  const vault=object(health?.vault)?health.vault:{};
  if(vault.persistent===false)return check('credentials','warning','Auf diesem System bleiben Zugangsdaten nur bis zum Beenden im Arbeitsspeicher. Nach einem Neustart sind sie erneut einzugeben.',null,{mode:'memory_only',persistent:false,cryptoProbePerformed:false});
  if(vault.persistent===true)return check('credentials','not_checked','Windows-DPAPI ist als Zugangsspeicher vorgesehen. Dieser Systemcheck führt keinen Schreib- oder Entschlüsselungsversuch aus; der Schutz wird bei der tatsächlichen Zugangsnutzung geprüft.',null,{mode:'windows_dpapi',persistent:true,cryptoProbePerformed:false});
  return check('credentials','not_checked','Der Zugangsspeicher wurde noch nicht ermittelt.',null,{cryptoProbePerformed:false});
}
function summary(checks) {const result=Object.fromEntries(STATUSES.map(status=>[status,0]));for(const item of checks)result[item.status]++;return result;}
function readiness(checks) {return REQUIRED_IDS.every(id=>checks.find(item=>item.id===id)?.status==='pass');}
export function buildSystemCheck({local,health,bots,now}={}) {
  const timestamp=clock(now),byId=new Map((Array.isArray(local?.checks)?local.checks:[]).filter(item=>object(item)&&LOCAL_IDS.includes(item.id)&&STATUSES.includes(item.status)).map(item=>[item.id,item]));
  const checks=LOCAL_IDS.map(id=>byId.get(id)||check(id,'not_checked','Die lokale Prüfung wurde noch nicht ausgeführt.',null));
  checks.push(accountCheck(health,timestamp),providerCheck(health),cliCheck(health),botsCheck(bots,timestamp),credentialsCheck(health));
  return {format:'trading-local-system-check',schema:1,checkedAt:at(timestamp),localCheckedAt:date(local?.checkedAt),localReady:readiness(checks),checks,summary:summary(checks),
    maintenance:{packageVerified:checks.find(item=>item.id==='package')?.status==='pass'&&checks.find(item=>item.id==='package')?.evidence?.manifestVerified===true,
      dataCompatible:checks.find(item=>item.id==='database')?.status==='pass'&&checks.find(item=>item.id==='database')?.evidence?.schemaCompatible===true,automaticUpdateSupported:false}};
}

// Export is rebuilt from individual allowed fields. Do not replace this with
// object spreads, arbitrary string scrubbing, or serialization of health/state.
const BOOLEAN_FIELDS={runtime:['sqliteAvailable','supportedNode'],database:['schemaCompatible','needsMigration'],data_directory:['readAccess','writeAccess','writeProbePerformed'],backups:['schemaCompatible','needsMigration'],package:['manifestVerified','signatureVerified'],bot_artifact:['available','verified'],account:['configured','credentialsAvailable','fresh','externalProbePerformed'],provider:['configured','credentialsAvailable','toolCalling','externalProbePerformed'],cli:['available','bundledMinimumMet','metadataCompatibilityConfirmed'],credentials:['persistent','cryptoProbePerformed']};
const NUMBER_FIELDS={database:['schemaVersion','expectedSchema','tablesVerified'],backups:['count','inspected','bytes','schemaVersion'],package:['files','bytes'],bot_artifact:['bytes'],account:['observationAgeMs'],bots:['profiles','bridgeProfiles','metadataOnly','reachable','stale','unconnected','faulted']};
const VERSION_FIELDS={runtime:['nodeVersion','sqliteVersion'],database:['sqliteVersion'],package:['version'],bot_artifact:['minimumCTraderVersion'],cli:['version']};
function supportEvidence(id,evidence) {
  const source=object(evidence)?evidence:{},clean={};
  for(const key of BOOLEAN_FIELDS[id]||[])if(typeof source[key]==='boolean')clean[key]=source[key];
  for(const key of NUMBER_FIELDS[id]||[])if(integer(source[key]))clean[key]=source[key];
  for(const key of VERSION_FIELDS[id]||[])if(version(source[key]))clean[key]=source[key];
  if(SAFE_REASON.has(source.reason))clean.reason=source.reason;
  if(['database','backups'].includes(id)&&['ok','failed','not_checked'].includes(source.integrity))clean.integrity=source.integrity;
  if(id==='backups'&&date(source.latestModifiedAt))clean.latestModifiedAt=source.latestModifiedAt;
  if(id==='runtime'&&['win32','linux','darwin','aix','freebsd','openbsd','sunos','android'].includes(source.platform))clean.platform=source.platform;
  if(id==='runtime'&&['x64','arm64','ia32','arm','ppc64','s390x','riscv64','loong64'].includes(source.architecture))clean.architecture=source.architecture;
  if(id==='bot_artifact'&&['net10.0','net6.0'].includes(source.framework))clean.framework=source.framework;
  if(id==='credentials'&&['memory_only','windows_dpapi'].includes(source.mode))clean.mode=source.mode;
  return clean;
}
export function buildSupportReport(report) {
  const source=new Map((Array.isArray(report?.checks)?report.checks:[]).filter(item=>object(item)&&Object.hasOwn(DEFINITIONS,item.id)).map(item=>[item.id,item]));
  const checks=Object.entries(DEFINITIONS).map(([id,definition])=>{
    const item=source.get(id);
    return {id,category:definition.category,status:STATUSES.includes(item?.status)?item.status:'not_checked',observedAt:date(item?.observedAt),evidence:supportEvidence(id,item?.evidence)};
  });
  return {format:'trading-local-support',schema:1,checkedAt:date(report?.checkedAt),localCheckedAt:date(report?.localCheckedAt),localReady:readiness(checks),summary:summary(checks),checks,
    privacy:{containsCredentials:false,containsAccountIdentifiers:false,containsBotIdentifiers:false,containsPaths:false,containsConversations:false},
    scope:'local-inspection-and-existing-observations',automaticUpdateSupported:false};
}
