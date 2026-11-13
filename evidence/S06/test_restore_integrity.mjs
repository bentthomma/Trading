/** Original Store / maintenance / journal modules, actual local SQLite and workers.
 * All account identities/events are synthetic. This is NOT an installed product writer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const root=process.env.S06_PLATFORM;
if(!root)throw Error('S06_PLATFORM must point to the hash-bound candidate');
const url=p=>pathToFileURL(resolve(root,p)).href;
const R=await import(url('core/planning/order-lifecycle.mjs'));
const {Store}=await import(url('core/store.mjs'));
const {Control,HUMAN}=await import(url('core/control.mjs'));
const {acquireProfileLock}=await import(url('core/profile-lock.mjs'));
const M=await import(url('core/maintenance.mjs'));
const {archiveFixture}=await import(url('tests/support/journal-archive-fixture.mjs'));
const J=await import(url('tests/support/engine-journal-fixtures.mjs'));
const {verifyJournalArchive}=await import(url('core/journal-archive-format.mjs'));
const KEY='s06.private-test.order-v2'; // TEST COMPOSITION ONLY; no deployed namespace claimed.
const A={broker:'S06_SYNTHETIC',id:'NOT_A_REAL_ACCOUNT',environment:'demo'},T='2026-11-13T10:00:00.000Z';
const O={planId:'PLAN-S06',intentId:'INTENT-S06',account:A,symbol:'MPR1_TEST_ONLY',side:'buy',kind:'limit',requestedUnits:'36',createdAt:T,expiresAt:null};
const N={orderId:'9007199254740993',symbol:O.symbol,side:O.side,kind:O.kind};
const E=(id,type,payload={},at=T)=>({id,type,payload,at,account:A,planId:O.planId,intentId:O.intentId});
const F=(dealId='F-1',units='12')=>E('evt-'+dealId,'BROKER_FILL',{...N,dealId,positionId:'POS-1',units,price:'100.25',fee:null,feeCurrency:null,executedAt:T});
const C=(id='cost',fee='0.06',dealId='F-1',currency='CHF')=>E(id,'DEAL_COST_CONFIRMED',{dealId,fee,feeCurrency:currency});
const cp=x=>JSON.parse(JSON.stringify(x));
function working(){let s=R.createOrderState(O);for(const k of ['VALIDATED','RESERVED','DURABLE'])s=R.reduceOrderEvent(s,E(k,k));s=R.reduceOrderEvent(s,E('dispatch','DISPATCH_MAY_HAVE_STARTED',{operationId:'OP-S06'}));return R.reduceOrderEvent(s,E('accepted','BROKER_ACCEPTED',{...N,acceptedUnits:'36'}));}
const run=(events,s=working())=>events.reduce((a,e)=>R.reduceOrderEvent(a,e),s);
const sha=b=>createHash('sha256').update(b).digest('hex');
function rowValue(db,key=KEY){return db.prepare('SELECT value FROM kv WHERE key=?').get(key)?.value;}
function fixture(t){
 const directory=mkdtempSync(join(tmpdir(),'s06-original-restore-'));let store,control,lock;
 const start=()=>{lock=acquireProfileLock(directory);store=new Store(directory);control=new Control(store);};
 const close=()=>{store?.close();store=null;lock?.release();lock=null;};start();
 t.after(()=>{close();rmSync(directory,{recursive:true,force:true});});
 return {directory,get store(){return store},get control(){return control},close,start};
}
async function save(f,state){
 f.store.set(KEY,state);const backup=await f.store.backup();const path=join(f.directory,'backups',backup.filename);
 const id=sha('snapshot\0'+backup.filename);return {path,id,sha256:sha(readFileSync(path)),value:JSON.stringify(state)};
}
async function preview(f,b){return M.previewFullRestore({store:f.store,directory:f.directory,backupId:b.id});}
async function prepare(f,b,p){return M.prepareRestoreJob({store:f.store,directory:f.directory,backupId:b.id,reviewDigest:p.reviewDigest,requestId:randomUUID(),confirmation:'replace-profile'});}
function child(args){const p=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',timeout:25000,maxBuffer:2*1024*1024});assert.ifError(p.error);return {...p,json:p.stdout.trim()?JSON.parse(p.stdout.trim()):null};}
function worker(f,id,stage=null){
 return stage?child(['--input-type=module','-e',"import {runRestoreWorker} from './core/maintenance.mjs';await runRestoreWorker({directory:process.argv[1],jobId:process.argv[2],failpoint:s=>{if(s===process.argv[3])process.kill(process.pid,'SIGKILL');}});",f.directory,id,stage]):child(['scripts/maintenance.mjs','--data-dir',f.directory,'--job-id',id]);
}
function inspect(path,fn){const db=new DatabaseSync(path,{readOnly:true,allowExtension:false});try{return fn(db);}finally{db.close();}}
function readAfter(f,fn){return inspect(join(f.directory,'state.sqlite'),fn);}
async function restore(f,b,p=undefined){const {job}=await prepare(f,b,p??await preview(f,b));f.close();const result=worker(f,job.id);return {job,result};}
const requireCode=c=>e=>e?.code===c;

test('R01 changed fee state after preview requires a new confirmation',async t=>{
 const f=fixture(t),b=await save(f,working()),p=await preview(f,b);const next=run([C()]);f.store.set(KEY,next);
 await assert.rejects(()=>prepare(f,b,p),requireCode('RESTORE_REVIEW_CHANGED'));
 assert.equal(await M.getLatestRestoreJob({directory:f.directory}),null);assert.deepEqual(f.store.get(KEY),next);
});
test('R02 changed fee state after prepare is fenced by the actual restore worker',async t=>{
 const f=fixture(t),b=await save(f,working()),p=await preview(f,b),{job}=await prepare(f,b,p);const next=run([C(),F()]);f.store.set(KEY,next);f.close();
 const result=worker(f,job.id);assert.equal(result.status,2,result.stdout+result.stderr);assert.equal(result.json.job.error.code,'RESTORE_TARGET_CHANGED');assert.equal(result.json.job.preRestoreBackupId,null);
 assert.equal(readAfter(f,db=>rowValue(db)),JSON.stringify(next));assert.equal(sha(readFileSync(b.path)),b.sha256);
});
test('R03 KV insert delete and same-length replacement all invalidate a preview',async t=>{
 const f=fixture(t),b=await save(f,working());
 for(const action of ['insert','delete','replace']){
  f.store.set('s06.extra',{marker:'a'});const p=await preview(f,b);
  if(action==='insert')f.store.set('s06.new',{marker:'a'});else if(action==='delete')f.store.db.prepare('DELETE FROM kv WHERE key=?').run('s06.extra');else f.store.set('s06.extra',{marker:'b'});
  await assert.rejects(()=>prepare(f,b,p),requireCode('RESTORE_REVIEW_CHANGED'));assert.equal(await M.getLatestRestoreJob({directory:f.directory}),null);
 }
});
test('R04 identical KV bytes and different insertion order keep the same decision digest',async t=>{
 const f=fixture(t),b=await save(f,run([C()]));f.store.set('s06.b',{value:'2'});f.store.set('s06.a',{value:'1'});const p=await preview(f,b);
 const rows=f.store.db.prepare('SELECT key,value FROM kv ORDER BY key DESC').all();f.store.transaction(()=>{f.store.db.exec('DELETE FROM kv');for(const row of rows)f.store.db.prepare('INSERT INTO kv(key,value) VALUES(?,?)').run(row.key,row.value);});
 const again=await preview(f,b);assert.equal(again.reviewDigest,p.reviewDigest);assert.equal((await prepare(f,b,p)).job.state,'prepared');
});
test('R05 preview binds content without exposing pending fees or private keys',async t=>{
 const f=fixture(t),state=run([C('PRIVATE_COST_MARKER','0.123456789012345678')]),b=await save(f,state),before=f.store.db.prepare('SELECT total_changes() n').get().n;
 const p=await preview(f,b),text=JSON.stringify(p);assert.equal(f.store.db.prepare('SELECT total_changes() n').get().n,before);assert.equal(text.includes(KEY),false);assert.equal(text.includes('PRIVATE_COST_MARKER'),false);assert.equal(text.includes('0.123456789012345678'),false);assert.equal(sha(readFileSync(b.path)),b.sha256);
});
test('R06 original SQLite backup preserves full pending state plus WAL commits',async t=>{
 const f=fixture(t);f.store.db.exec('PRAGMA wal_checkpoint(TRUNCATE);PRAGMA wal_autocheckpoint=0;');const state=run([C('c','0.000000000000000001')]);f.store.transaction(()=>{f.store.set(KEY,state);f.store.event('s06.synthetic.pending',{testOnly:true});});
 assert.ok(readFileSync(f.store.path+'-wal').length>0);const b=await save(f,state);assert.equal(inspect(b.path,db=>rowValue(db)),JSON.stringify(state));assert.deepEqual(R.validateOrderState(inspect(b.path,db=>JSON.parse(rowValue(db)))),state);
});
test('R07 full restore retains pending evidence exactly and later fill enriches once',async t=>{
 const f=fixture(t),state=run([C()]),b=await save(f,state);f.store.set(KEY,run([F()],state));const {result}=await restore(f,b);
 assert.equal(result.status,0,result.stdout+result.stderr);const loaded=readAfter(f,db=>rowValue(db));assert.equal(loaded,JSON.stringify(state));
 const updated=run([F(),C()],R.validateOrderState(JSON.parse(loaded)));assert.equal(updated.costs.unknownFeeDealCount,0);assert.deepEqual(updated.costs.fees,[{currency:'CHF',amount:'0.06'}]);assert.equal(updated.fills.length,1);
 assert.equal(sha(readFileSync(b.path)),b.sha256);
});
test('R08 full restore preserves conflicting receipts and account quarantine',async t=>{
 const f=fixture(t),state=run([C(),C('conflict','0.07'),F()]),b=await save(f,state);f.store.set(KEY,working());const {result}=await restore(f,b);assert.equal(result.status,0,result.stderr);
 const loaded=R.validateOrderState(readAfter(f,db=>JSON.parse(rowValue(db))));assert.deepEqual(loaded,state);assert.equal(loaded.reconciliation.blockingScope,'account');assert.equal(run([C()],loaded).fills[0].fee,null);
});
test('R09 legacy gap provenance survives restoration without invented backfill',async t=>{
 const Old=await import(pathToFileURL(resolve(process.env.S06_ORIGINAL_PLATFORM,'core/planning/order-lifecycle.mjs')).href);
 let old=Old.createOrderState(O);old=Old.reduceOrderEvent(old,C());const state=R.upgradeOrderState(old),f=fixture(t),b=await save(f,state);const {result}=await restore(f,b);assert.equal(result.status,0,result.stderr);
 const loaded=R.validateOrderState(readAfter(f,db=>JSON.parse(rowValue(db))));assert.deepEqual(loaded,state);assert.equal(loaded.legacyCostGaps.length,1);assert.equal(loaded.costEvidence.length,0);
});
test('R10 selected older snapshot intentionally rolls back fees but pre-restore copy preserves latest',async t=>{
 const f=fixture(t),older=run([C()]),b=await save(f,older),newer=run([F(),C('cost-new','0.07')],older);f.store.set(KEY,newer);const {result,job}=await restore(f,b);
 assert.equal(result.status,0,result.stderr);assert.equal(readAfter(f,db=>rowValue(db)),JSON.stringify(older));
 const pre=join(f.directory,'maintenance/backups','before-restore-'+job.id+'.sqlite');assert.equal(inspect(pre,db=>rowValue(db)),JSON.stringify(newer));assert.notEqual(JSON.stringify(newer),JSON.stringify(older));
 assert.equal(readAfter(f,db=>JSON.parse(rowValue(db,'policy'))).blocked,true);
});
test('R11 successful restore blocks policy revokes tokens and does not revive account connection',async t=>{
 const f=fixture(t),bot=f.control.createBot({name:'S06 SYNTHETIC OFFLINE BOT'});const oldToken=bot.bridgeToken;
 f.store.set('connection',{mode:'synthetic',connectionId:'TEST_ONLY',accountId:A.id,environment:'demo'});f.store.set('provider',{mode:'synthetic',name:'NO_NETWORK'});f.store.set('policy',{blocked:false,grants:[{testOnly:true}]});
 const b=await save(f,run([C()])),{result}=await restore(f,b);assert.equal(result.status,0,result.stderr);f.start();assert.equal(f.store.get('connection'),null);assert.equal(f.store.get('provider'),null);assert.equal(f.store.get('policy').blocked,true);assert.equal(f.store.db.prepare('SELECT count(*) n FROM tokens WHERE revoked_at IS NULL').get().n,0);assert.equal(f.control.authenticate(oldToken),null);assert.equal(f.control.bot(bot.bot.id).runtimeBlocked,true);
});
test('R12 config export/import is profile-only and cannot restore generic order KV',async t=>{
 const source=fixture(t),target=fixture(t);source.control.createBot({name:'S06 CONFIG ONLY'});const state=run([C()]);source.store.set(KEY,state);source.store.event('s06.synthetic.marker',{feeMetadata:'test-only'});
 const exported=source.control.export();assert.equal(JSON.stringify(exported).includes('costEvidence'),false);assert.equal(exported.bots.length,1);assert.ok(exported.events.length>0);
 const review=target.control.previewRestore(exported,HUMAN);target.control.confirmRestore(exported,{reviewDigest:review.reviewDigest,requestId:randomUUID()},HUMAN);
 assert.equal(target.store.get(KEY),null);assert.equal(target.store.events().some(e=>e.type==='s06.synthetic.marker'),false);assert.equal(target.store.get('policy').blocked,true);assert.deepEqual(source.store.get(KEY),state);
});
test('R13 config import preserves the existing target order state without replacing it',async t=>{
 const f=fixture(t);f.control.createBot({name:'S06 CONFIG LOCAL'});const state=run([C(),F()]);f.store.set(KEY,state);const exp=f.control.export(),review=f.control.previewRestore(exp,HUMAN);
 f.control.confirmRestore(exp,{reviewDigest:review.reviewDigest,requestId:randomUUID()},HUMAN);assert.deepEqual(f.store.get(KEY),state);assert.equal(f.store.get('policy').blocked,true);
});
test('R14 actual journal archive preserves plan/raw records but is not a generic order backup',async t=>{
 const f=archiveFixture(t);const state=run([C()]);f.store.set(KEY,state);const plan=J.originalPlan(f.now);f.send([J.journalEvent('plan.recorded',plan,'1',f.now)]);
 const p=f.preview(),created=await f.archives.create(f.bot.id,{requestId:randomUUID(),reviewDigest:p.reviewDigest},HUMAN);
 const downloaded=await f.archives.download(f.bot.id,created.receipt.archiveId,HUMAN);const text=await downloaded.handle.readFile({encoding:'utf8'});await downloaded.close();
 const path=join(f.dir,'journal-archives','journal-'+created.receipt.archiveId+'.ndjson'),check=verifyJournalArchive(path);assert.equal(check.originalPlans,1);assert.equal(check.eventCount,1);assert.equal(check.executionGrant,false);assert.equal(text.includes(KEY),false);assert.equal(text.includes('costEvidence'),false);assert.deepEqual(f.store.get(KEY),state);
 const event=text.trim().split('\n').map(JSON.parse).find(x=>x.record==='event');assert.deepEqual(event.receipt.event.payload,plan);
});
test('R15 restore readability is not order semantic validation: corrupted v2 remains rejected by its reader',async t=>{
 const f=fixture(t),bad=cp(run([C(),F()]));bad.costEvidence[0].fee='999';assert.throws(()=>R.validateOrderState(bad));
 const b=await save(f,bad),{result}=await restore(f,b);assert.equal(result.status,0,result.stderr);const loaded=readAfter(f,db=>JSON.parse(rowValue(db)));assert.deepEqual(loaded,bad);assert.throws(()=>R.validateOrderState(loaded));assert.equal(readAfter(f,db=>JSON.parse(rowValue(db,'policy'))).blocked,true);
});
test('R16 event retention and a full restore do not prune unresolved cost evidence',async t=>{
 const f=fixture(t),state=run([C()]);f.store.set(KEY,state);const first=f.store.event('s06.synthetic.expired');f.store.db.prepare("UPDATE sqlite_sequence SET seq=101999 WHERE name='events'").run();f.store.event('s06.synthetic.retention');assert.equal(f.store.db.prepare('SELECT count(*) n FROM events WHERE id=?').get(first.id).n,0);
 const b=await save(f,state),{result}=await restore(f,b);assert.equal(result.status,0,result.stderr);assert.deepEqual(readAfter(f,db=>JSON.parse(rowValue(db))),state);assert.deepEqual(run([F()],state).costs.fees,[{currency:'CHF',amount:'0.06'}]);
});
for(const stage of ['staging','verifying'])test(`R17-${stage} actual worker kill preserves latest full fee state on guarded rollback`,async t=>{
 const f=fixture(t),b=await save(f,working()),latest=run([C(),F()]);f.store.set(KEY,latest);const {job}=await prepare(f,b,await preview(f,b));f.close();
 const interrupted=worker(f,job.id,stage);assert.equal(interrupted.signal,'SIGKILL',interrupted.stderr);assert.throws(()=>acquireProfileLock(f.directory),requireCode('MAINTENANCE_IN_PROGRESS'));
 const recovery=worker(f,job.id);assert.equal(recovery.status,2,recovery.stdout+recovery.stderr);assert.equal(recovery.json.job.state,'rolled_back');assert.equal(readAfter(f,db=>rowValue(db)),JSON.stringify(latest));assert.deepEqual(R.validateOrderState(readAfter(f,db=>JSON.parse(rowValue(db)))),latest);assert.equal(sha(readFileSync(b.path)),b.sha256);
});
test('R18 source fee changes after preparation are rejected without replacing latest data',async t=>{
 const f=fixture(t),b=await save(f,run([C()])),latest=run([C(),F()]);f.store.set(KEY,latest);const {job}=await prepare(f,b,await preview(f,b));f.close();
 const db=new DatabaseSync(b.path);db.prepare('UPDATE kv SET value=? WHERE key=?').run(JSON.stringify(working()),KEY);db.close();
 const result=worker(f,job.id);assert.equal(result.status,2,result.stdout);assert.equal(result.json.job.error.code,'RESTORE_SOURCE_CHANGED');assert.equal(readAfter(f,db=>rowValue(db)),JSON.stringify(latest));
});
test('R19 finished restore retry cannot repeat replacement over newly received fee evidence',async t=>{
 const f=fixture(t),b=await save(f,run([C()])),{job,result}=await restore(f,b);assert.equal(result.status,0,result.stderr);f.start();const latest=run([C(),F()]);f.store.set(KEY,latest);f.close();const retry=worker(f,job.id);assert.equal(retry.status,0,retry.stderr);assert.equal(readAfter(f,db=>rowValue(db)),JSON.stringify(latest));
});
test('R20 old prepared job without KV decision binding fails closed after patch',async t=>{
 const f=fixture(t),b=await save(f,run([C()]));f.close();
 const originalMaintenance=url('core/maintenance.mjs').replace(pathToFileURL(root).href,pathToFileURL(process.env.S06_PRIOR_PLATFORM).href);
 const p=child(['--input-type=module','-e',`import {Store} from ${JSON.stringify(url('core/store.mjs'))};import * as M from ${JSON.stringify(originalMaintenance)};import {randomUUID} from 'node:crypto';const directory=process.argv[1],store=new Store(directory),backupId=process.argv[2];const p=await M.previewFullRestore({store,directory,backupId});const result=await M.prepareRestoreJob({store,directory,backupId,reviewDigest:p.reviewDigest,requestId:randomUUID(),confirmation:'replace-profile'});store.close();console.log(JSON.stringify(result));`,f.directory,b.id]);
 assert.equal(p.status,0,p.stderr);const before=readAfter(f,db=>rowValue(db)),result=worker(f,p.json.job.id);assert.equal(result.status,2,result.stdout);assert.equal(result.json.job.error.code,'RESTORE_TARGET_CHANGED');assert.equal(readAfter(f,db=>rowValue(db)),before);
});

test('R21 real engine-journal receipts received after preview invalidate the destructive decision',async t=>{
 const f=archiveFixture(t);const plan=J.originalPlan(f.now);f.send([J.journalEvent('plan.recorded',plan,'1',f.now)]);const saved=await f.store.backup();
 const id=sha('snapshot\0'+saved.filename),p=await M.previewFullRestore({store:f.store,directory:f.dir,backupId:id});
 f.send([J.journalEvent('engine.status',J.engineStatus(),'2',f.now)]);
 await assert.rejects(()=>M.prepareRestoreJob({store:f.store,directory:f.dir,backupId:id,reviewDigest:p.reviewDigest,requestId:randomUUID(),confirmation:'replace-profile'}),requireCode('RESTORE_REVIEW_CHANGED'));
 assert.equal(await M.getLatestRestoreJob({directory:f.dir}),null);assert.equal(f.store.db.prepare('SELECT count(*) n FROM kv WHERE key LIKE ?').get('enginejournal:v1:'+f.bot.id+':event:%').n,2);
});
