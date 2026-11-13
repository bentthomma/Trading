/** Real archived Core/SQLite, synthetic wire payloads. No C# or broker execution.
 * J13 intentionally documents the current projection-to-raw binding gap.
 * J14 demonstrates that merged projections cannot simply equal the latest raw payload.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {readFileSync,appendFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const root=process.env.S06_PLATFORM;
if(!root)throw Error('S06_PLATFORM required');
const load=p=>import(pathToFileURL(resolve(root,p)).href);
const {HUMAN}=await load('core/control.mjs');
const {digest}=await load('core/schema.mjs');
const {validateJournalEvent}=await load('core/engine-journal.mjs');
const {archiveFixture}=await load('tests/support/journal-archive-fixture.mjs');
const {originalPlan,journalEvent,orderReport,engineStatus}=await load('tests/support/engine-journal-fixtures.mjs');
const {reconciliationFixture}=await load('tests/support/reconciliation20-fixtures.mjs');
const {readReconciliation20}=await load('core/reconciliation-read20.mjs');
const {verifyJournalArchive}=await load('core/journal-archive-format.mjs');
const R=await load('core/planning/order-lifecycle.mjs');
const cp=x=>JSON.parse(JSON.stringify(x));
const prefix=f=>'enginejournal:v1:'+f.bot.id+':';
const kv=f=>f.store.db.prepare('SELECT key,value FROM kv ORDER BY key COLLATE BINARY').all();
const events=f=>f.store.db.prepare('SELECT key,value FROM kv WHERE key LIKE ? ORDER BY key').all(prefix(f)+'event:%');
const view=f=>f.core.engineJournal.view(f.bot.id,HUMAN);
const seed=f=>{
 const p=originalPlan(f.now,{score:null});
 const position={positionId:'9007199254740995',planId:p.planId,symbol:p.symbol,side:p.side,units:'3000',
 entry:p.entry,stop:p.stop,target:p.target,net:'-1.230000000000000001',exitMode:'original_plan',reason:'SYNTHETIC_POSITION'};
 const list=[journalEvent('plan.recorded',p,'1',f.now),
 journalEvent('order.reported',orderReport({positionId:position.positionId,state:'partially_filled',filledUnits:'3000',remainingUnits:'7000'}),'2',f.now),
 journalEvent('position.reported',position,'3',f.now),journalEvent('engine.status',engineStatus(),'4',f.now)];
 return {p,position,list,receipt:f.send(list)};
};
const record=(id,value)=>{if(process.env.S06_BINDING_EVIDENCE)appendFileSync(process.env.S06_BINDING_EVIDENCE,JSON.stringify({id,...value})+'\n');};

test('J01 accepted journal receipt proves persistence only, with no deal or cost projection',async t=>{
 const f=archiveFixture(t),s=seed(f),v=view(f);
 assert.equal(s.receipt.contiguousSequence,'4');assert.equal(s.receipt.grantsTrading,false);
 assert.equal(v.orders[0].report.brokerOrderId,'9007199254740993');
 assert.equal(v.positions[0].report.net,'-1.230000000000000001');
 for(const key of ['dealId','fee','feeCurrency','costEvidence','price','executedAt'])assert.equal(Object.hasOwn(v.orders[0].report,key),false);
 assert.equal(v.independentBrokerProof,false);assert.equal(v.writesAllowed,false);
 record('J01',{receipt:s.receipt,orderFields:Object.keys(v.orders[0].report),positionFields:Object.keys(v.positions[0].report),economicWriterInvoked:false});
});
test('J02 unsupported cost/deal wire types reject the entire batch before any write',async t=>{
 const f=archiveFixture(t);seed(f);const before=kv(f);
 for(const type of ['DEAL_COST_CONFIRMED','deal.cost.confirmed','deal.reported','cashflow.reported']){
  const e=journalEvent(type,{dealId:'D-1',fee:'0.06',feeCurrency:'CHF'},'6',f.now);
  assert.throws(()=>f.send([journalEvent('engine.status',engineStatus(),'5',f.now),e]),{code:'JOURNAL_EVENT_UNSUPPORTED'});
  assert.deepEqual(kv(f),before);
 }
 record('J02',{unsupportedTypes:4,atomicRejection:true,cursor:view(f).streams[0].cursor});
});
test('J03 order-state version 2 is not a journal batch schema upgrade',async t=>{
 const f=archiveFixture(t);const before=kv(f);
 assert.throws(()=>f.send([journalEvent('engine.status',engineStatus(),'1',f.now)],{schemaVersion:2}),{code:'JOURNAL_LIMIT'});
 assert.deepEqual(kv(f),before);
});
test('J04 extra fee and execution fields are rejected, not silently dropped',async t=>{
 const f=archiveFixture(t);const s=seed(f),before=kv(f);
 for(const [type,payload] of [
 ['order.reported',{...s.list[1].payload,fee:'0.06',feeCurrency:'CHF'}],
 ['order.reported',{...s.list[1].payload,dealId:'D-1',price:'1.1',executedAt:new Date(f.now).toISOString()}],
 ['position.reported',{...s.position,commission:'0.06'}]]){
  assert.throws(()=>f.send([journalEvent(type,payload,'5',f.now)]),{code:'JOURNAL_INVALID'});
  assert.deepEqual(kv(f),before);
 }
});
test('J05 matching engine and observer totals never confirm a fee or native protection',t=>{
 const f=reconciliationFixture(t),before=f.store.db.prepare('SELECT key,value FROM kv ORDER BY key').all();
 const out=readReconciliation20(f.core,{engineBotId:f.ready.bot.id,observerBotId:f.observer.bot.id},HUMAN);
 assert.equal(out.writesAllowed,false);
 const text=JSON.stringify(out);
 assert.ok(text.includes('"nativeProtectionConfirmed":false'));
 assert.ok(!text.includes('"costEvidence"'));assert.ok(!text.includes('"feeCurrency"'));
 assert.deepEqual(f.store.db.prepare('SELECT key,value FROM kv ORDER BY key').all(),before);
 record('J05',{positionCount:out.positions?.length??null,unchangedKV:true,writesAllowed:out.writesAllowed,feeEvidence:false});
});
test('J06 observer history and invented commission fields remain unsupported',t=>{
 const f=reconciliationFixture(t);
 const before=f.store.db.prepare('SELECT key,value FROM kv ORDER BY key').all();
 let changed=cp(f.observation);changed.sequence='2';changed.coverage.historyComplete=true;
 assert.throws(()=>f.core.observation.accept(changed,f.oa),{code:'OBSERVATION_HISTORY_UNSUPPORTED'});
 changed=cp(f.observation);changed.sequence='2';changed.positions[0].commission='0.06';
 assert.throws(()=>f.core.observation.accept(changed,f.oa),{code:'OBSERVATION_INVALID'});
 assert.deepEqual(f.store.db.prepare('SELECT key,value FROM kv ORDER BY key').all(),before);
});
test('J07 receipt loss and actual SQLite reopen keep raw reports, not current freshness',async t=>{
 const f=archiveFixture(t),s=seed(f),raw=events(f);
 await f.restart();f.heartbeat();const r=f.send(s.list);
 assert.equal(r.stored,0);assert.equal(r.duplicates,4);assert.equal(r.grantsTrading,false);
 assert.deepEqual(events(f),raw);assert.equal(view(f).fresh,false);assert.equal(view(f).reason,'CORE_RESTART_AWAITING_JOURNAL');
});
test('J08 a stored gap is not a filled order and is replayed only after contiguous recovery',async t=>{
 const f=archiveFixture(t),p=originalPlan(f.now,{score:null});
 const o=journalEvent('order.reported',orderReport({state:'filled',filledUnits:'10000',remainingUnits:'0'}),'2',f.now);
 const r=f.send([o]);assert.equal(r.stored,1);assert.equal(r.gap,true);assert.equal(r.contiguousSequence,'0');assert.equal(view(f).orders.length,0);
 await f.restart();f.heartbeat();f.send([journalEvent('plan.recorded',p,'1',f.now)]);
 assert.equal(view(f).orders[0].report.filledUnits,'10000');assert.equal(view(f).streams[0].cursor,'2');
 assert.equal(Object.hasOwn(view(f).orders[0].report,'dealId'),false);
});
test('J09 unknown legacy fill and original plan remain unknown',async t=>{
 const f=archiveFixture(t);
 f.send([journalEvent('order.reported',orderReport({planId:null,requestedUnits:null,filledUnits:null,remainingUnits:null,state:'outcome_unknown',reason:'LEGACY_ORIGINAL_PLAN_UNKNOWN'}),'1',f.now)]);
 const row=view(f).orders[0];assert.equal(row.report.filledUnits,null);assert.equal(row.report.planId,null);assert.equal(row.originalPlanAvailable,false);
});
test('J10 journal acceptance cannot enrich a coexisting pending v2 cost state',async t=>{
 const f=archiveFixture(t),p=originalPlan(f.now,{score:null}),A={broker:'SYNTHETIC_BROKER_ONLY',id:'SYNTHETIC_DEMO_ACCOUNT',environment:'demo'};
 const O={planId:p.planId,intentId:p.intentId,account:A,symbol:p.symbol,side:p.side,kind:'limit',requestedUnits:p.units,createdAt:p.createdAt,expiresAt:null};
 const E=(id,type,payload)=>({id,type,payload,at:p.createdAt,account:A,planId:p.planId,intentId:p.intentId});
 let state=R.createOrderState(O);
 state=R.reduceOrderEvent(state,E('fee-before-native','DEAL_COST_CONFIRMED',{dealId:'D-1',fee:'0.06',feeCurrency:'CHF'}));
 const key='s06.private-test.native-binding.order';
 f.store.set(key,state);const before=f.store.get(key);
 seed(f);assert.deepEqual(f.store.get(key),before);assert.deepEqual(before.costs.pendingCostDealIds,['D-1']);assert.equal(before.fills.length,0);
 await f.restart();f.heartbeat();assert.deepEqual(R.validateOrderState(f.store.get(key)),before);
 // Explicit test composition only: a complete normalized execution is separate from a summary.
 const fill=E('full-execution-fixture','BROKER_FILL',{orderId:'9007199254740993',dealId:'D-1',positionId:'9007199254740995',
 symbol:p.symbol,side:p.side,kind:'limit',units:'3000',price:'1.1',fee:null,feeCurrency:null,executedAt:p.createdAt});
 const enriched=R.reduceOrderEvent(before,fill);
 assert.deepEqual(enriched.costs.fees,[{currency:'CHF',amount:'0.06'}]);
 assert.deepEqual(f.store.get(key),before,'No hidden writer is invoked by in-memory projection');
 record('J10',{pendingAfterJournal:before.costs.pendingCostDealIds,explicitCompleteExecution:enriched.costs.fees,productWriterConnected:false});
});
test('J11 journal archive keeps raw types and excludes arbitrary order-v2 state',async t=>{
 const f=archiveFixture(t);const s=seed(f);f.store.set('s06.private-test.native-binding.order',{schemaVersion:2,costEvidence:['DO_NOT_TREAT_AS_ARCHIVED']});
 const result=await f.archives.create(f.bot.id,{requestId:randomUUID(),reviewDigest:f.preview().reviewDigest},HUMAN);
 const filename=join(f.dir,'journal-archives','journal-'+result.receipt.archiveId+'.ndjson');
 assert.deepEqual(verifyJournalArchive(filename),result.receipt);
 const raw=readFileSync(filename,'utf8');assert.ok(!raw.includes('DO_NOT_TREAT_AS_ARCHIVED'));assert.ok(!raw.includes('costEvidence'));
 for(const e of s.list)assert.ok(raw.includes(e.payloadHash));
 assert.equal(result.receipt.executionGrant,false);assert.equal(result.receipt.eventCount,4);
});
test('J12 failed journal persistence rolls back cursor, raw receipts and projections together',async t=>{
 const f=archiveFixture(t),before=kv(f),set=f.store.set.bind(f.store);
 f.store.set=(k,v)=>{if(k.endsWith(':binding'))throw Object.assign(Error('Synthetic disk failure'),{code:'SQLITE_FULL'});return set(k,v);};
 assert.throws(()=>seed(f),{code:'SQLITE_FULL'});f.store.set=set;
 assert.deepEqual(kv(f),before);assert.equal(view(f).available,false);
 assert.equal(seed(f).receipt.contiguousSequence,'4');
});
test('J13 OPEN GAP valid-looking altered projection is not compared to its immutable raw payload',async t=>{
 const f=archiveFixture(t);const s=seed(f),raw=events(f);
 const row=f.store.db.prepare('SELECT key,value FROM kv WHERE key LIKE ?').get(prefix(f)+'position:%');
 const changed=JSON.parse(row.value);changed.report.net='888';f.store.set(row.key,changed);
 const read=view(f);assert.equal(read.positions[0].report.net,'888');
 assert.deepEqual(events(f),raw);
 const e=JSON.parse(raw.find(x=>JSON.parse(x.value).event.type==='position.reported').value).event;
 assert.equal(e.payload.net,s.position.net);assert.notEqual(e.payload.net,read.positions[0].report.net);
 await f.restart();f.heartbeat();f.send([journalEvent('engine.status',engineStatus(),'5',f.now)]);
 assert.equal(view(f).positions[0].report.net,'888');assert.equal(view(f).fresh,true);
 assert.equal(f.store.get(prefix(f)+'event:event-3').event.payload.net,e.payload.net);
 record('J13',{knownGap:true,rawNet:e.payload.net,projectedNet:read.positions[0].report.net,rawUnchanged:true,
 persistsAfterSQLiteReopen:true,currentStatusDoesNotRebuildProjection:true,readerIntegrityFixImplemented:false});
});
test('J14 a legitimate merged order projection differs from its latest raw payload',async t=>{
 const f=archiveFixture(t);seed(f);
 const p=orderReport({planId:null,requestedUnits:null,filledUnits:null,remainingUnits:null,state:'outcome_unknown',reason:'LEGACY_ORIGINAL_PLAN_UNKNOWN'});
 f.send([journalEvent('order.reported',p,'5',f.now)]);
 const row=view(f).orders[0];
 assert.equal(row.report.planId,'plan-1');assert.equal(row.report.filledUnits,'3000');
 const raw=f.store.get(prefix(f)+'event:event-5').event;
 assert.equal(raw.payload.planId,null);assert.equal(raw.payload.filledUnits,null);
 assert.notDeepEqual(row.report,raw.payload);
 record('J14',{mergeRequiresReplayOrFieldLineage:true,latestRawFilled:raw.payload.filledUnits,derivedFilled:row.report.filledUnits});
});
test('J15 corrupt raw receipt is rejected rather than accepted as replay confirmation',async t=>{
 const f=archiveFixture(t),s=seed(f),key=prefix(f)+'event:'+s.list[2].eventId,record=f.store.get(key);
 record.event.payload.net='999';f.store.set(key,record);
 assert.throws(()=>view(f),{code:'JOURNAL_STORAGE_INVALID'});
 assert.throws(()=>f.send(s.list),{code:'JOURNAL_STORAGE_INVALID'});
});
test('J16 one unversioned broker account or a live label cannot rebind existing evidence',async t=>{
 const f=archiveFixture(t);seed(f);const before=kv(f),account=view(f).account;
 assert.throws(()=>f.send([],{account:{...account,currency:'USD'}}),{code:'JOURNAL_STREAM_IDENTITY_MISMATCH'});
 assert.throws(()=>f.send([],{account:{...account,environment:'live'}}),{code:'JOURNAL_ACCOUNT_INVALID'});
 assert.deepEqual(kv(f),before);
});
