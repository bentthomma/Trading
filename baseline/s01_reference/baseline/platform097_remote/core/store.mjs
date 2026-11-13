import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, chmodSync, readdirSync, unlinkSync, openSync, closeSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fail } from './errors.mjs';

export const CURRENT_SCHEMA_VERSION=2;
const SCHEMA_ONE_TABLES=Object.freeze({
  kv:['key','value'],
  bots:['id','name','adapter','manifest','revision','desired','actual','actual_revision','runtime_id','account_id','environment','last_seen','sequence','runtime_blocked','runtime_status','created_at'],
  proposals:['id','bot_id','revision','values_json','digest','status','actor_id','idempotency_key','request_digest','base_revision','runtime_id','created_at','confirmed_at','expires_at','delivered_at','completed_at','reason'],
  tokens:['id','name','hash','kind','bot_id','can_propose','created_at','revoked_at'],
  events:['seq','id','time','type','bot_id','actor','data'],
  messages:['id','conversation_id','time','role','content','tools'],
  snapshots:['id','account_id','observed_at','data']
});
const TABLE_CONSTRAINTS=Object.freeze({
  kv:{primary:'key',integers:[],nullable:[],defaults:{}},
  bots:{primary:'id',integers:['revision','actual_revision','last_seen','sequence','runtime_blocked','created_at','archived_at','lifecycle_revision'],nullable:['actual','runtime_id','account_id','environment','last_seen','archived_at'],defaults:{revision:'0',actual_revision:'0',sequence:'-1',runtime_blocked:'1',runtime_status:"'disconnected'",lifecycle_revision:'0'}},
  proposals:{primary:'id',integers:['revision','base_revision','created_at','confirmed_at','expires_at','delivered_at','completed_at'],nullable:['base_revision','runtime_id','confirmed_at','expires_at','delivered_at','completed_at','reason'],defaults:{}},
  tokens:{primary:'id',integers:['can_propose','created_at','revoked_at'],nullable:['bot_id','revoked_at'],defaults:{can_propose:'0'}},
  events:{primary:'seq',integers:['seq','time'],nullable:['seq','bot_id'],defaults:{},autoincrement:true},
  messages:{primary:'id',integers:['id','time'],nullable:['id','tools'],defaults:{},autoincrement:true},
  snapshots:{primary:'id',integers:['id'],nullable:['id'],defaults:{},autoincrement:true}
});
// Names and key direction are part of the accepted format. Arbitrary schema
// programs, including restore-time triggers, are never a supported extension.
const INDEX_CONTRACT=Object.freeze({
  kv:[['sqlite_autoindex_kv_1','pk',[['key',0]]]],
  bots:[['sqlite_autoindex_bots_1','pk',[['id',0]]]],
  proposals:[['sqlite_autoindex_proposals_1','pk',[['id',0]]],['sqlite_autoindex_proposals_2','u',[['bot_id',0],['idempotency_key',0]]],['proposals_bot','c',[['bot_id',0],['created_at',1]]]],
  tokens:[['sqlite_autoindex_tokens_1','pk',[['id',0]]],['sqlite_autoindex_tokens_2','u',[['hash',0]]]],
  events:[['sqlite_autoindex_events_1','u',[['id',0]]],['events_time','c',[['time',0]]]],
  messages:[['messages_conversation','c',[['conversation_id',0],['id',0]]]],
  snapshots:[['sqlite_autoindex_snapshots_1','u',[['account_id',0],['observed_at',0]]]]
});

// Shared by startup, the diagnostic screen and offline restore. This inspection
// does not migrate, expire commands, open a writable connection or create Core.
export function inspectDatabaseSchema(db,{allowLegacy=false}={}) {
  const schemaVersion=db.prepare('PRAGMA user_version').get().user_version;
  const sqliteVersion=db.prepare('SELECT sqlite_version() AS version').get().version;
  const result={schemaVersion,expectedSchema:CURRENT_SCHEMA_VERSION,schemaCompatible:false,integrity:'not_checked',sqliteVersion,tablesVerified:0,needsMigration:schemaVersion===1};
  if(schemaVersion!==CURRENT_SCHEMA_VERSION&&!(allowLegacy&&schemaVersion===1))return {...result,reason:'unsupported_schema'};
  const objects=db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_schema').all();
  const allowedObjects=new Map([['sqlite_sequence','table'],...Object.keys(SCHEMA_ONE_TABLES).map(name=>[name,'table']),...Object.values(INDEX_CONTRACT).flat().map(([name])=>[name,'index'])]);
  if(objects.length!==allowedObjects.size||objects.some(row=>allowedObjects.get(row.name)!==row.type))return {...result,reason:'schema_mismatch'};
  const tableFlags=db.prepare('PRAGMA main.table_list').all();
  for(const [table,original] of Object.entries(SCHEMA_ONE_TABLES)){
    const columns=table==='bots'&&schemaVersion===2?[...original,'archived_at','lifecycle_revision']:original;
    const definition=objects.find(row=>row.name===table),flags=tableFlags.find(row=>row.name===table&&row.schema==='main'),contract=TABLE_CONSTRAINTS[table];
    const actual=db.prepare('PRAGMA table_xinfo('+table+')').all();
    if(!flags||flags.type!=='table'||flags.strict!==1||flags.wr!==0||flags.ncol!==columns.length||
      actual.length!==columns.length||actual.some((column,index)=>column.name!==columns[index]||column.type!==(contract.integers.includes(column.name)?'INTEGER':'TEXT')||column.hidden!==0||column.notnull!==(contract.nullable.includes(column.name)?0:1)||column.pk!==(column.name===contract.primary?1:0)||column.dflt_value!==(contract.defaults[column.name]??null))||
      !!contract.autoincrement!==/\bAUTOINCREMENT\b/i.test(definition.sql))return {...result,reason:'schema_mismatch'};
    const keys=db.prepare('PRAGMA foreign_key_list('+table+')').all();
    const needsBotKey=table==='proposals'||table==='tokens';
    if(keys.length!==(needsBotKey?1:0)||keys.some(key=>key.id!==0||key.seq!==0||key.table!=='bots'||key.from!=='bot_id'||key.to!=='id'||key.on_update!=='NO ACTION'||key.on_delete!=='NO ACTION'||key.match!=='NONE'))return {...result,reason:'schema_mismatch'};
    const indexes=db.prepare('PRAGMA index_list('+table+')').all(),expected=INDEX_CONTRACT[table];
    if(indexes.length!==expected.length)return {...result,reason:'schema_mismatch'};
    for(const [name,origin,keyColumns] of expected){
      const index=indexes.find(row=>row.name===name);
      if(!index||index.origin!==origin||index.unique!==(origin==='c'?0:1)||index.partial!==0||objects.find(row=>row.name===name)?.tbl_name!==table)return {...result,reason:'schema_mismatch'};
      const indexColumns=db.prepare('SELECT * FROM pragma_index_xinfo(?)').all(name).filter(row=>row.key===1);
      if(indexColumns.length!==keyColumns.length||indexColumns.some((column,i)=>column.name!==keyColumns[i][0]||column.desc!==keyColumns[i][1]||column.coll!=='BINARY'||column.cid<0))return {...result,reason:'schema_mismatch'};
    }
    result.tablesVerified++;
  }
  const check=db.prepare('PRAGMA quick_check(1)').all();
  const intact=check.length===1&&check[0].quick_check==='ok'&&!db.prepare('SELECT 1 FROM pragma_foreign_key_check LIMIT 1').get();
  return {...result,schemaCompatible:true,integrity:intact?'ok':'failed',...(intact?{}:{reason:'integrity_failed'})};
}

// VACUUM INTO includes committed WAL contents and is deliberately outside the
// migration transaction. The read-only verification must finish before ALTER.
// An explicit, new destination is required even when migrating a restore stage.
export function migrateDatabase(db,{backupPath}={}) {
  const source=inspectDatabaseSchema(db,{allowLegacy:true});
  if(source.schemaVersion>CURRENT_SCHEMA_VERSION)fail('DATABASE_TOO_NEW','Diese Daten wurden mit einer neueren Anwendung erstellt.',503);
  if(!source.schemaCompatible||source.integrity!=='ok')fail('DATABASE_CHECK_FAILED','Die Datenbank kann nicht sicher auf das aktuelle Format aktualisiert werden.',503);
  if(!source.needsMigration)return {schemaVersion:CURRENT_SCHEMA_VERSION,migrated:false,previousSchemaVersion:source.schemaVersion,backupPath:null};
  if(typeof backupPath!=='string'||!isAbsolute(backupPath))fail('MIGRATION_BACKUP_REQUIRED','Vor der Datenbankaktualisierung wird eine separate lokale Sicherung benötigt.',503);
  let created=false,verified=false,snapshot;
  try{
    // Reserve a private, empty output exclusively; never replace an older copy.
    const handle=openSync(backupPath,'wx',0o600);created=true;closeSync(handle);
    db.exec('PRAGMA synchronous=FULL');
    db.prepare('VACUUM INTO ?').run(backupPath);
    snapshot=new DatabaseSync(backupPath,{readOnly:true,enableForeignKeyConstraints:true,allowExtension:false,timeout:3000});
    const copied=inspectDatabaseSchema(snapshot,{allowLegacy:true});
    if(copied.schemaVersion!==source.schemaVersion||!copied.schemaCompatible||copied.integrity!=='ok')fail('MIGRATION_BACKUP_FAILED','Die Sicherung vor der Datenbankaktualisierung konnte nicht bestätigt werden.',503);
    snapshot.close();snapshot=null;verified=true;
  }catch(error){
    snapshot?.close();
    if(created&&!verified){try{unlinkSync(backupPath);}catch{}}
    if(error?.code==='MIGRATION_BACKUP_FAILED')throw error;
    fail('MIGRATION_BACKUP_FAILED','Die Sicherung vor der Datenbankaktualisierung konnte nicht erstellt werden. Das bisherige Datenformat wurde beibehalten.',503);
  }
  db.exec('BEGIN IMMEDIATE');
  try{
    // A second version check prevents applying an old plan to a changed source.
    if(db.prepare('PRAGMA user_version').get().user_version!==1)fail('DATABASE_CHANGED','Die Datenbank wurde während der Aktualisierung verändert.',503);
    db.exec('ALTER TABLE bots ADD COLUMN archived_at INTEGER; ALTER TABLE bots ADD COLUMN lifecycle_revision INTEGER NOT NULL DEFAULT 0; PRAGMA user_version=2;');
    const migrated=inspectDatabaseSchema(db);
    if(!migrated.schemaCompatible||migrated.integrity!=='ok')fail('DATABASE_CHECK_FAILED','Die Datenbankaktualisierung konnte nicht bestätigt werden.',503);
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  return {schemaVersion:CURRENT_SCHEMA_VERSION,migrated:true,previousSchemaVersion:source.schemaVersion,backupPath};
}

export class Store {
  constructor(directory,{now=()=>Date.now()}={}) {
    this.directory=resolve(directory); this.now=now;
    mkdirSync(this.directory,{recursive:true,mode:0o700});
    if (process.platform!=='win32') chmodSync(this.directory,0o700);
    this.path=join(this.directory,'state.sqlite');
    this.db=new DatabaseSync(this.path,{timeout:3000,enableForeignKeyConstraints:true,allowExtension:false});
    try{
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');
    const version=this.db.prepare('PRAGMA user_version').get().user_version;
    if (version>CURRENT_SCHEMA_VERSION) fail('DATABASE_TOO_NEW','Diese Daten wurden mit einer neueren Anwendung erstellt.',503);
    if (version===0) this.transaction(()=>{
      this.db.exec(`
        CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
        CREATE TABLE bots (id TEXT PRIMARY KEY, name TEXT NOT NULL, adapter TEXT NOT NULL, manifest TEXT NOT NULL,
          revision INTEGER NOT NULL DEFAULT 0, desired TEXT NOT NULL, actual TEXT, actual_revision INTEGER NOT NULL DEFAULT 0,
          runtime_id TEXT, account_id TEXT, environment TEXT, last_seen INTEGER, sequence INTEGER NOT NULL DEFAULT -1,
          runtime_blocked INTEGER NOT NULL DEFAULT 1, runtime_status TEXT NOT NULL DEFAULT 'disconnected', created_at INTEGER NOT NULL,
          archived_at INTEGER, lifecycle_revision INTEGER NOT NULL DEFAULT 0) STRICT;
        CREATE TABLE proposals (id TEXT PRIMARY KEY, bot_id TEXT NOT NULL REFERENCES bots(id), revision INTEGER NOT NULL,
          values_json TEXT NOT NULL, digest TEXT NOT NULL, status TEXT NOT NULL, actor_id TEXT NOT NULL,
          idempotency_key TEXT NOT NULL, request_digest TEXT NOT NULL, base_revision INTEGER, runtime_id TEXT,
          created_at INTEGER NOT NULL, confirmed_at INTEGER, expires_at INTEGER, delivered_at INTEGER, completed_at INTEGER, reason TEXT,
          UNIQUE(bot_id,idempotency_key)) STRICT;
        CREATE INDEX proposals_bot ON proposals(bot_id,created_at DESC);
        CREATE TABLE tokens (id TEXT PRIMARY KEY, name TEXT NOT NULL, hash TEXT NOT NULL UNIQUE, kind TEXT NOT NULL,
          bot_id TEXT REFERENCES bots(id), can_propose INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, revoked_at INTEGER) STRICT;
        CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, time INTEGER NOT NULL,
          type TEXT NOT NULL, bot_id TEXT, actor TEXT NOT NULL, data TEXT NOT NULL) STRICT;
        CREATE INDEX events_time ON events(time);
        CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id TEXT NOT NULL, time INTEGER NOT NULL,
          role TEXT NOT NULL, content TEXT NOT NULL, tools TEXT) STRICT;
        CREATE INDEX messages_conversation ON messages(conversation_id,id);
        CREATE TABLE snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL, observed_at TEXT NOT NULL,
          data TEXT NOT NULL, UNIQUE(account_id,observed_at)) STRICT;
        PRAGMA user_version=2;
      `);
      this.set('profile',{id:randomUUID(),name:'Lokal',createdAt:new Date(this.now()).toISOString()});
      this.set('policy',{blocked:true,changedAt:new Date(this.now()).toISOString()});
      this.set('onboarding',{step:0,completed:false});
    });
    this.migration={schemaVersion:CURRENT_SCHEMA_VERSION,migrated:false,previousSchemaVersion:version,backupPath:null};
    if(version===1){
      const directory=join(this.directory,'migration-backups');
      try{mkdirSync(directory,{recursive:true,mode:0o700});if(process.platform!=='win32')chmodSync(directory,0o700);}catch{fail('MIGRATION_BACKUP_FAILED','Die Sicherung vor der Datenbankaktualisierung konnte nicht angelegt werden. Das bisherige Datenformat wurde beibehalten.',503);}
      const filename='before-schema-2-'+new Date(this.now()).toISOString().replace(/[:.]/g,'-')+'-'+randomUUID()+'.sqlite';
      this.migration=migrateDatabase(this.db,{backupPath:join(directory,filename)});
    }
    const check=inspectDatabaseSchema(this.db);
    if(!check.schemaCompatible||check.integrity!=='ok')fail('DATABASE_CHECK_FAILED','Datenbankprüfung fehlgeschlagen. Eine Sicherung wiederherstellen.',503);
    if (process.platform!=='win32') chmodSync(this.path,0o600);
    }catch(error){this.db.close();throw error;}
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {const value=fn();this.db.exec('COMMIT');return value;} catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  get(key,fallback=null) { const row=this.db.prepare('SELECT value FROM kv WHERE key=?').get(key);return row?JSON.parse(row.value):fallback; }
  set(key,value) {this.db.prepare('INSERT INTO kv(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));}
  event(type,data={},actor='system',botId=null) {
    const e={id:randomUUID(),time:this.now(),type,botId,actor,data};
    const result=this.db.prepare('INSERT INTO events(id,time,type,bot_id,actor,data) VALUES(?,?,?,?,?,?)').run(e.id,e.time,type,botId,actor,JSON.stringify(data));
    e.seq=Number(result.lastInsertRowid);
    if(e.seq%1000===0)this.db.prepare('DELETE FROM events WHERE seq<?').run(Math.max(0,e.seq-100000));
    return e;
  }
  events(after=0,limit=100) {
    return this.db.prepare('SELECT * FROM events WHERE seq>? ORDER BY seq DESC LIMIT ?').all(after,Math.max(1,Math.min(500,limit))).reverse().map(x=>({seq:x.seq,id:x.id,time:x.time,type:x.type,botId:x.bot_id,actor:x.actor,data:JSON.parse(x.data)}));
  }
  saveSnapshot(snapshot) {
    const id=String(snapshot.account.id||'unconfirmed');
    this.db.prepare('INSERT OR IGNORE INTO snapshots(account_id,observed_at,data) VALUES(?,?,?)').run(id,snapshot.observedAt,JSON.stringify(snapshot));
    this.db.prepare('DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY id DESC LIMIT 20000)').run();
  }
  latestSnapshot() {const row=this.db.prepare('SELECT data FROM snapshots ORDER BY id DESC LIMIT 1').get();return row?JSON.parse(row.data):null;}
  snapshotForConnection(connection) {
    if(!connection?.accountId||!['demo','live'].includes(connection.environment))return null;
    const row=this.db.prepare("SELECT data FROM snapshots WHERE account_id=? AND json_extract(data,'$.environment')=? ORDER BY id DESC LIMIT 1").get(String(connection.accountId),connection.environment);
    return row?JSON.parse(row.data):null;
  }
  history(accountId,environment) {
    const numeric=value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')?Number(value):NaN;
    const rows=this.db.prepare(`SELECT observed_at, json_extract(data,'$.account.equity') AS equity,
      json_extract(data,'$.account.balance') AS balance FROM snapshots
      WHERE account_id=? AND json_extract(data,'$.environment')=?
      ORDER BY observed_at DESC,id DESC LIMIT 1800`).all(String(accountId),environment);
    return rows.reverse().flatMap(row=>{
      const t=Date.parse(row.observed_at),e=numeric(row.equity),b=numeric(row.balance);
      return Number.isFinite(t)&&Number.isFinite(e)&&Number.isFinite(b)?[{t,e,b,p:e-b}]:[];
    });
  }
  addMessage(conversationId,role,content,tools=null) {
    this.db.prepare('INSERT INTO messages(conversation_id,time,role,content,tools) VALUES(?,?,?,?,?)').run(conversationId,this.now(),role,content,tools?JSON.stringify(tools):null);
    this.db.prepare('DELETE FROM messages WHERE id NOT IN (SELECT id FROM messages ORDER BY id DESC LIMIT 2000)').run();
  }
  messages(conversationId=null,limit=100) {
    const rows=conversationId?this.db.prepare('SELECT * FROM messages WHERE conversation_id=? ORDER BY id DESC LIMIT ?').all(conversationId,limit):this.db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT ?').all(limit);
    return rows.reverse().map(x=>({id:x.id,conversationId:x.conversation_id,time:x.time,role:x.role,content:x.content,toolCalls:x.tools?JSON.parse(x.tools):[]}));
  }
  async backup() {
    const dir=join(this.directory,'backups');mkdirSync(dir,{recursive:true,mode:0o700});
    const filename='backup-'+new Date(this.now()).toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8)+'.sqlite';
    await backup(this.db,join(dir,filename));
    if(process.platform!=='win32')chmodSync(join(dir,filename),0o600);
    const files=readdirSync(dir).filter(x=>/^backup-.*\.sqlite$/.test(x)).sort();
    for(const old of files.slice(0,-10))unlinkSync(join(dir,old));
    this.event('backup.created',{filename});return {filename};
  }
  close(){this.db.close();}
}
