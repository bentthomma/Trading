/** Real original Hub/HTTP/SQLite. Synthetic bridge events only; no broker/native bot. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {setup,ok,err} from './ack_fixture.mjs';
const root=process.env.S01_INTERFACE_PLATFORM;
const {Control}=await import(pathToFileURL(join(root,'core/control.mjs')));
const {Store}=await import(pathToFileURL(join(root,'core/store.mjs')));
const {Control:OriginalControl}=await import(pathToFileURL(join(process.env.S01_ACK_ORIGINAL_PLATFORM,'core/control.mjs')));
const key=p=>'configurationRejectedAck:'+p.id;
const receipt=(f,p)=>f.app.store.db.prepare('SELECT value FROM kv WHERE key=?').get(key(p))?.value??null;
const negative=(f,extra={})=>({accepted:false,values:f.initial,reason:'RUNTIME_REJECTED_UNCHANGED',...extra});
const state=f=>JSON.stringify(Object.fromEntries(['bots','proposals','kv','events'].map(n=>[n,f.app.store.db.prepare('SELECT * FROM '+n+' ORDER BY rowid').all()])));
async function rejectAndAdvance(f){
 const p=await f.delivered();ok(await f.ack(p,negative(f)));
 const q=await f.propose({...f.initial,risk:.7});ok(await f.confirm(q));assert.equal(ok(await f.hb()).command.id,q.id);ok(await f.ack(q));
 return {p,q};
}

test('R01 exact negative retry remains valid after later applied configuration; no state or receipt rewrite',async t=>{
 const f=await setup(t),{p,q}=await rejectAndAdvance(f),before=state(f),stored=receipt(f,p);
 const r=await f.ack(p,negative(f));assert.equal(r.status,200,'EXACT_NEGATIVE_RETRY_MUST_SUCCEED');assert.equal(r.data.duplicate,true);
 assert.equal(state(f),before);assert.equal(receipt(f,p),stored);assert.equal((await f.bot()).actualRevision,q.revision);
});
test('R02 changed rejection values cannot reuse old identity even when they match current state',async t=>{
 const f=await setup(t),{p,q}=await rejectAndAdvance(f),before=state(f);
 const r=await f.ack(p,negative(f,{values:q.values}));assert.equal(r.status,409,'ALTERED_NEGATIVE_RETRY_MUST_FAIL');assert.equal(r.data.error,'ACK_PAYLOAD_CONFLICT');assert.equal(state(f),before);
});
test('R03 rejection reason is bound without persisting or exposing diagnostic text',async t=>{
 const f=await setup(t),p=await f.delivered(),reason='SYNTHETIC_PRIVATE_DIAGNOSTIC_DO_NOT_ECHO';ok(await f.ack(p,negative(f,{reason})));
 const before=state(f),raw=receipt(f,p);assert.ok(raw,'DURABLE_RECEIPT_REQUIRED');assert.equal(raw.includes(reason),false);
 err(await f.ack(p,negative(f,{reason:'changed'})),'ACK_PAYLOAD_CONFLICT');assert.equal(state(f),before);
 const publicState=JSON.stringify(ok(await f.request('/api/hub/state')));assert.equal(publicState.includes(reason),false);assert.equal(publicState.includes(JSON.parse(raw).fingerprint),false);
});
test('R04 canonical value order and absent/null reason are equivalent; nonstring reasons rejected without writes',async t=>{
 const f=await setup(t),p=await f.delivered();const before=state(f);
 for(const reason of [false,42,{},[]]){err(await f.ack(p,negative(f,{reason})),'ACK_REASON_INVALID',400);assert.equal(state(f),before);}
 ok(await f.ack(p,{accepted:false,values:f.initial}));const original=receipt(f,p);
 const values=Object.fromEntries(Object.entries(f.initial).reverse());assert.equal(ok(await f.ack(p,{accepted:false,values,reason:null})).duplicate,true);assert.equal(receipt(f,p),original);
});
test('R05 receipt insert failure rolls back terminal status and audit event; recovery is a first ACK',async t=>{
 const f=await setup(t),p=await f.delivered(),before=state(f),db=f.app.store.db;
 db.exec("CREATE TEMP TRIGGER fail_ack BEFORE INSERT ON kv WHEN NEW.key LIKE 'configurationRejectedAck:%' BEGIN SELECT RAISE(ABORT,'SYNTHETIC_INSERT_FAILURE'); END");
 try{assert.equal((await f.ack(p,negative(f))).status,500);assert.equal(state(f),before,'ACK_INSERT_FAILURE_MUST_ROLL_BACK');}finally{db.exec('DROP TRIGGER fail_ack');}
 assert.equal(ok(await f.ack(p,negative(f))).duplicate,undefined);assert.ok(receipt(f,p));assert.equal(f.events('configuration.rejected').length,1);
});
test('R06 failure after audit insert but before commit rolls back receipt, proposal and audit together',async t=>{
 const f=await setup(t),p=await f.delivered(),before=state(f),store=f.app.store,event=store.event;let seen=false;
 store.event=function(type,...args){const result=event.call(this,type,...args);if(type==='configuration.rejected'){seen=true;throw Error('SYNTHETIC_POST_EVENT_FAILURE');}return result;};
 try{assert.equal((await f.ack(p,negative(f))).status,500);assert.equal(seen,true);assert.equal(state(f),before,'ACK_EVENT_FAILURE_MUST_ROLL_BACK');}finally{store.event=event;}
 ok(await f.ack(p,negative(f)));assert.equal(f.events('configuration.rejected').length,1);
});
test('R07 ignored committed HTTP response, close/reopen and exact retry do not reopen runtime permission',async t=>{
 const f=await setup(t),p=await f.delivered();await f.ack(p,negative(f));const stored=receipt(f,p);await f.restart();
 const before=state(f),r=ok(await f.ack(p,negative(f)));assert.equal(r.duplicate,true);assert.equal(state(f),before);assert.equal(receipt(f,p),stored);
 assert.equal(f.app.store.get('policy').blocked,true);assert.equal(f.events('configuration.rejected').length,1);
});
test('R08 legacy rejection created by original ACK code is not silently backfilled or certified on retry',async t=>{
 const f=await setup(t),p=await f.delivered();const body=f.ackBody(p,negative(f));const actor=f.app.control.authenticate(f.token,'bridge');
 assert.equal(OriginalControl.prototype.ack.call(f.app.control,body,actor).status,'rejected');assert.equal(receipt(f,p),null);const before=state(f);
 err(await f.ack(p,negative(f)),'ACK_RECEIPT_UNAVAILABLE');assert.equal(state(f),before);assert.equal(receipt(f,p),null);
 await f.restart();err(await f.ack(p,negative(f)),'ACK_RECEIPT_UNAVAILABLE');assert.equal(f.app.store.get('policy').blocked,true);
});
test('R09 missing, malformed or incompatible receipt fails closed and is not repaired from retry payload',async t=>{
 const f=await setup(t),p=await f.delivered();ok(await f.ack(p,negative(f)));const db=f.app.store.db,original=receipt(f,p);
 const bad=['{', 'null','[]',JSON.stringify({schema:'future',fingerprint:'a'.repeat(64)}),JSON.stringify({schema:'hub.rejected-ack/v1',fingerprint:'x'}),JSON.stringify({...JSON.parse(original),extra:1})];
 for(const raw of bad){db.prepare('UPDATE kv SET value=? WHERE key=?').run(raw,key(p));const before=state(f);err(await f.ack(p,negative(f)),'ACK_RECEIPT_UNAVAILABLE');assert.equal(state(f),before);}
 db.prepare('DELETE FROM kv WHERE key=?').run(key(p));const before=state(f);err(await f.ack(p,negative(f)),'ACK_RECEIPT_UNAVAILABLE');assert.equal(state(f),before);
 db.prepare('INSERT INTO kv(key,value) VALUES(?,?)').run(key(p),original);assert.equal(ok(await f.ack(p,negative(f))).duplicate,true);
});
test('R10 receipt with nonterminal proposal is an explicit inconsistency, never an overwrite',async t=>{
 const f=await setup(t),p=await f.delivered();f.app.store.set(key(p),{schema:'hub.rejected-ack/v1',fingerprint:'a'.repeat(64)});const before=state(f);
 err(await f.ack(p,negative(f)),'ACK_RECEIPT_STATE_CONFLICT');err(await f.ack(p),'ACK_RECEIPT_STATE_CONFLICT');assert.equal(state(f),before);
});
test('R11 invalid first rejection cannot create a receipt; positive/negative terminal changes conflict',async t=>{
 const f=await setup(t),p=await f.delivered(),before=state(f);err(await f.ack(p,negative(f,{values:p.values})),'REJECTION_STATE_UNCERTAIN');assert.equal(state(f),before);
 ok(await f.ack(p,negative(f)));const saved=state(f);err(await f.ack(p),'ACK_CONFLICT');assert.equal(state(f),saved);
});
test('R12 a receipt never bypasses token, bot, runtime, digest, revision or dispatch binding',async t=>{
 const f=await setup(t),p=await f.delivered();ok(await f.ack(p,negative(f)));const before=state(f);
 for(const bad of [{runtimeId:'wrong'},{digest:'a'.repeat(64)},{revision:p.revision+1}])err(await f.ack(p,negative(f,bad)),'ACK_MISMATCH');
 err(await f.ack(p,negative(f),{token:'SYNTHETIC_INVALID_TOKEN'}),'BRIDGE_AUTH_REQUIRED',401);
 const other=ok(await f.request('/api/hub/bots',{name:'SYNTHETIC_OTHER',profileId:'th3rev.ready20.v1'}),201);
 const afterOther=state(f);assert.equal((await f.ack(p,negative(f,{botId:other.bot.id}))).status,403);assert.equal(state(f),afterOther);
 assert.ok(before.includes('rejected')); // baseline is preserved except intentional creation of a second profile.
});
test('R13 replacement runtime cannot reuse old receipt, even after original deadline',async t=>{
 const f=await setup(t),p=await f.delivered();ok(await f.ack(p,negative(f)));f.advance(16000);ok(await f.hb({runtimeId:'synthetic_new_runtime',sequence:1}));
 const before=state(f);err(await f.ack(p,negative(f)),'ACK_MISMATCH');assert.equal(state(f),before);assert.equal((await f.bot()).releaseApproved,false);
});
test('R14 token rotation permits exact reconciliation only with new token and does not restore grant',async t=>{
 const f=await setup(t),p=await f.delivered();ok(await f.ack(p,negative(f)));const old=f.token;
 f.token=ok(await f.request('/api/hub/bots/'+f.id+'/bridge-token',{})).bridgeToken;
 err(await f.ack(p,negative(f),{token:old}),'BRIDGE_AUTH_REQUIRED',401);assert.equal(ok(await f.ack(p,negative(f))).duplicate,true);assert.equal((await f.bot()).releaseApproved,false);
});
test('R15 receipt survives real event-pruning branch and restart without a schema version change',async t=>{
 const f=await setup(t),p=await f.delivered(),db=f.app.store.db,schema=db.prepare('PRAGMA user_version').get().user_version;
 ok(await f.ack(p,negative(f)));const stored=receipt(f,p);
 // Accelerate the sequence cursor, then use the real Store.event retention branch.
 db.prepare('INSERT INTO events(seq,id,time,type,actor,data) VALUES(?,?,?,?,?,?)').run(101999,'synthetic-retention-anchor',f.time,'synthetic.retention','test','{}');
 f.app.store.event('synthetic.retention_trigger');assert.equal(f.events('configuration.rejected').length,0);assert.equal(receipt(f,p),stored);
 await f.restart();assert.equal(ok(await f.ack(p,negative(f))).duplicate,true);assert.equal(f.app.store.db.prepare('PRAGMA user_version').get().user_version,schema);
 assert.equal(f.app.control.export().containsSecrets,false);assert.equal(JSON.stringify(f.app.control.export()).includes(JSON.parse(stored).fingerprint),false);
});
test('R16 competing SQLite writer cannot change validated state inside receipt transaction',async t=>{
 const f=await setup(t),p=await f.delivered(),db=f.app.store.db,other=new DatabaseSync(f.app.store.path),prepare=db.prepare;let checked=false;
 other.exec('PRAGMA busy_timeout=0');db.prepare=function(sql,...args){if(!checked&&sql==='SELECT * FROM bots WHERE id=?'){checked=true;assert.throws(()=>other.prepare('UPDATE bots SET actual_revision=actual_revision WHERE id=?').run(f.id),/locked/,'WRITER_MUST_BE_LOCKED_DURING_VALIDATION');}return prepare.call(this,sql,...args);};
 try{ok(await f.ack(p,negative(f)));assert.equal(checked,true);}finally{db.prepare=prepare;other.close();}
});
test('R17 existing applied ACK stays compatible without requiring a rejection receipt',async t=>{
 const f=await setup(t),p=await f.delivered();const body=f.ackBody(p),actor=f.app.control.authenticate(f.token,'bridge');
 assert.equal(OriginalControl.prototype.ack.call(f.app.control,body,actor).status,'applied');assert.equal(receipt(f,p),null);
 await f.restart();assert.equal(ok(await f.ack(p)).duplicate,true);assert.equal(receipt(f,p),null);
});
test('R18 terminal archive/restore fences retain precedence over receipt availability',async t=>{
 const f=await setup(t),p=await f.delivered();ok(await f.ack(p,negative(f)));const db=f.app.store.db;
 // Targeted state injection tests branch precedence, not a complete restore/archive operation.
 for(const [reason,code] of [['BOT_ARCHIVED','ACK_ARCHIVED'],['FULL_RESTORE','ACK_RESTORE_FENCED']]){
  db.prepare('UPDATE proposals SET reason=? WHERE id=?').run(reason,p.id);const before=state(f);err(await f.ack(p,negative(f)),code);assert.equal(state(f),before);
 }
});
for(const phase of ['before','after'])test(`R19-${phase} actual process kill ${phase} COMMIT preserves receipt/state consistency and retry behavior`,()=>{
 const dir=mkdtempSync(join(tmpdir(),'s01-ack-kill-'));let store;
 try{
  const worker=fileURLToPath(new URL('./crash_worker.mjs',import.meta.url));const result=spawnSync(process.execPath,[worker,dir,phase],{env:process.env,encoding:'utf8',timeout:15000});
  assert.equal(result.signal,'SIGKILL',result.stderr);const meta=JSON.parse(readFileSync(join(dir,'case.json'),'utf8'));
  store=new Store(join(dir,'data'));let row=store.db.prepare('SELECT status FROM proposals WHERE id=?').get(meta.proposal.id),stored=store.db.prepare('SELECT value FROM kv WHERE key=?').get(key(meta.proposal));
  assert.equal(row.status,phase==='after'?'rejected':'pending');assert.equal(!!stored,phase==='after');
  const c=new Control(store,{now:()=>meta.now}),actor=c.authenticate(meta.token,'bridge');const r=c.ack(meta.body,actor);
  assert.equal(r.status,'rejected');assert.equal(r.duplicate,phase==='after'?true:undefined);assert.equal(store.get('policy').blocked,true);
  assert.equal(store.db.prepare("SELECT count(*) n FROM events WHERE type='configuration.rejected'").get().n,1);
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
test('R20 original SDK retries exact pending record before heartbeat and treats HTTP 409 as terminal (source only)',()=>{
 const bridge=readFileSync(join(root,'sdk/HubBridge.cs'),'utf8'),transport=readFileSync(join(root,'sdk/HubProtocol.cs'),'utf8');
 assert.ok(bridge.indexOf('if (_pendingAck is not null)')<bridge.indexOf('_transport.HeartbeatAsync'));
 assert.ok(bridge.includes('_pendingAck = known.Ack;'));assert.ok(bridge.includes('known.Command != command'));
 assert.ok(bridge.includes('if (ex.IsTerminal)'));assert.ok(bridge.includes('_faultLatched = true;'));
 assert.ok(transport.includes('or HttpStatusCode.BadRequest or HttpStatusCode.Conflict or HttpStatusCode.Gone'));
 assert.ok(transport.includes('knownCode == "RUNTIME_CONFLICT"'));
});
