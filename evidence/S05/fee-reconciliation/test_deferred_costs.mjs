/** Synthetic messages, actual archived reducer/Store. No broker or network adapter. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const root=process.env.S05_PLATFORM, originalRoot=process.env.S05_ORIGINAL_PLATFORM;
if(!root||!originalRoot)throw Error('Both exact source roots required');
const url=(p,r=root)=>pathToFileURL(resolve(r,p)).href;
const reducerURL=url('core/planning/order-lifecycle.mjs');
const R=await import(reducerURL),Old=await import(url('core/planning/order-lifecycle.mjs',originalRoot));
const {createOrderState,reduceOrderEvent,validateOrderState,upgradeOrderState,reconcileOrder}=R;
const {Store}=await import(url('core/store.mjs'));
const {digest}=await import(url('core/schema.mjs'));
const A={broker:'S05_SYNTHETIC',id:'NOT_A_REAL_ACCOUNT',environment:'demo'},T='2026-11-13T10:00:00.000Z';
const O={planId:'PLAN-S05',intentId:'INTENT-S05',account:A,symbol:'MPR1_TEST_ONLY',side:'buy',kind:'limit',requestedUnits:'36',createdAt:T,expiresAt:null};
const N={orderId:'9007199254740993',symbol:O.symbol,side:O.side,kind:O.kind};
const E=(id,type,payload={},at=T)=>({id,type,payload,at,account:A,planId:O.planId,intentId:O.intentId});
function working(mod=R){let s=mod.createOrderState(O);for(const k of ['VALIDATED','RESERVED','DURABLE'])s=mod.reduceOrderEvent(s,E(k,k));s=mod.reduceOrderEvent(s,E('dispatch','DISPATCH_MAY_HAVE_STARTED',{operationId:'OP-S05'}));return mod.reduceOrderEvent(s,E('accepted','BROKER_ACCEPTED',{...N,acceptedUnits:'36'}));}
const F=(id='F-1',units='12',fee=null,currency='CHF')=>E('evt-'+id,'BROKER_FILL',{...N,dealId:id,positionId:'POS-1',units,price:'100.25',fee,feeCurrency:fee===null?null:currency,executedAt:T});
const C=(id='cost',fee='0.06',dealId='F-1',currency='CHF')=>E(id,'DEAL_COST_CONFIRMED',{dealId,fee,feeCurrency:currency});
const X=()=>E('evt-close','POSITION_CLOSE',{...N,originOrderId:N.orderId,closingOrderId:'CLOSE-1',dealId:'C-1',positionId:'POS-1',units:'3',price:'101.54',fee:null,feeCurrency:null,executedAt:T});
const cp=x=>JSON.parse(JSON.stringify(x));
const run=(events,s=working(),mod=R)=>events.reduce((x,e)=>mod.reduceOrderEvent(x,e),s);
const issue=(s,c)=>s.incidents.some(x=>!x.resolved&&x.code===c);
const economic=s=>({quantities:s.quantities,fees:s.costs.fees,unknown:s.costs.unknownFeeDealCount});
const permutations=a=>a.length?a.flatMap((x,i)=>permutations(a.filter((_,j)=>j!==i)).map(t=>[x,...t])):[[]];
const KEY='s05.private-test.order';
function withDB(fn){const dir=mkdtempSync(join(tmpdir(),'s05-cost-db-'));try{return fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}}
function childRead(dir,events=[]){
 const code=`import {Store} from ${JSON.stringify(url('core/store.mjs'))};import {validateOrderState,reduceOrderEvent} from ${JSON.stringify(reducerURL)};const db=new Store(process.argv[1]);try{let s=validateOrderState(db.get(${JSON.stringify(KEY)}));for(const e of JSON.parse(process.argv[2]))s=reduceOrderEvent(s,e);db.transaction(()=>db.set(${JSON.stringify(KEY)},s));console.log(JSON.stringify(s));}finally{db.close();}`;
 const p=spawnSync(process.execPath,['--input-type=module','-e',code,dir,JSON.stringify(events)],{encoding:'utf8',timeout:15000});assert.equal(p.status,0,p.stderr);return JSON.parse(p.stdout);
}
const V2=()=>assert.equal(typeof upgradeOrderState,'function');

test('F01 fee-before-fill is applied without a second cost callback',()=>{
 const before=working(),pending=run([C()],before);assert.deepEqual(pending.costs.fees,[]);assert.equal(pending.fills.length,0);
 const s=run([F()],pending);assert.equal(s.costs.unknownFeeDealCount,0);assert.deepEqual(s.costs.fees,[{currency:'CHF',amount:'0.06'}]);assert.ok(!issue(s,'DEAL_COST_WITHOUT_EXECUTION'));assert.equal(before.receipts.length,5);
});
test('F02 exact retry and new callback ID never double charge or duplicate a position',()=>{
 let s=run([C(),F()]);assert.strictEqual(reduceOrderEvent(s,C()),s);s=run([C('same-economic'),{...F(),id:'old-fill-callback'}],s);
 assert.deepEqual(s.costs.fees,[{currency:'CHF',amount:'0.06'}]);assert.equal(s.costs.unknownFeeDealCount,0);assert.equal(s.fills.length,1);assert.ok(!issue(s,'DEAL_IDENTITY_CONFLICT'));assert.ok(Object.isFrozen(s.costEvidence[0]));
});
test('F03 fill-first and fee-first converge to identical financial projections',()=>{
 assert.deepEqual(economic(run([C(),F()])),economic(run([F(),C()])));
});
test('F04 120 delivery orders of two fills, two fees and terminal proof converge',()=>{
 const events=[F('A','12'),F('B','24'),C('CA','0.06','A'),C('CB','0.12','B'),E('end','BROKER_FILLED',{...N,filledUnits:'36',unfilledUnits:'0',executionFinal:true})];
 const expected=economic(run(events));assert.deepEqual(expected.fees,[{currency:'CHF',amount:'0.18'}]);assert.equal(expected.unknown,0);
 for(const p of permutations(events)){const s=run(p);assert.deepEqual(economic(s),expected);assert.equal(s.reconciliation.required,false);}
});
test('F05 a cost-only event neither accepts an order nor creates fill or trading authority',()=>{
 const s=run([C()],createOrderState(O));assert.equal(s.broker.orderId,null);assert.equal(s.transport.mayHaveStarted,false);assert.equal(s.quantities.openPositionUnits,'0');assert.equal(s.quantities.reservationUnits,'0');assert.equal(s.reconciliation.brokerIndependentlyVerified,false);assert.deepEqual(s.costs.pendingCostDealIds,['F-1']);
});
test('F06 matching one deal never clears another pending fee incident',()=>{
 const s=run([C(),C('other','0.12','F-2'),F()]);assert.deepEqual(s.costs.pendingCostDealIds,['F-2']);assert.equal(s.reconciliation.blockingScope,'intent');assert.ok(s.incidents.some(i=>!i.resolved&&i.actual==='F-2'));assert.ok(s.incidents.some(i=>i.resolved&&i.actual==='F-1'));
});
test('F07 closing cost before close and entry fill works in all six orders',()=>{
 for(const events of permutations([C('close-fee','0.015','C-1'),X(),F('F-1','12','0.06')])){const s=run(events);assert.equal(s.quantities.openPositionUnits,'9');assert.deepEqual(s.costs.fees,[{currency:'CHF',amount:'0.075'}]);assert.equal(s.costs.unknownFeeDealCount,0);assert.equal(s.reconciliation.required,false);}
});
test('F08 zero, rebates and 18-place decimal fees are not rounded or converted to null',()=>{
 for(const fee of ['0','-0.005','0.000000000000000001']){const s=run([C('c',fee),F()]);assert.deepEqual(s.costs.fees,[{currency:'CHF',amount:fee}]);assert.equal(s.costs.unknownFeeDealCount,0);}
});
test('F09 separate currencies are never silently added',()=>{
 const s=run([C(),C('USD','1','F-2','USD'),F(),F('F-2','12')]);assert.deepEqual(s.costs.fees,[{currency:'CHF',amount:'0.06'},{currency:'USD',amount:'1'}]);assert.equal(s.costs.totalAccountCurrency,undefined);
});
test('F10 conflicting cost amounts converge to unknown and account quarantine in every order',()=>{
 for(const events of permutations([C('cost-a'),C('cost-b','0.07'),F()])){const s=run(events);assert.equal(s.fills[0].fee,null);assert.deepEqual(s.costs.fees,[]);assert.equal(s.costs.unknownFeeDealCount,1);assert.deepEqual(s.costs.conflictedFeeDealIds,['F-1']);assert.equal(s.reconciliation.blockingScope,'account');assert.ok(issue(s,'DEAL_COST_CONFLICT'));}
});
test('F11 inline execution fee is preserved under contradictory confirmations in every order',()=>{
 for(const events of permutations([C('a','0.07'),C('b','0.08'),F('F-1','12','0.06')])){const s=run(events);assert.equal(s.fills[0].fee,'0.06');assert.equal(s.fills[0].feeBasis.fee,'0.06');assert.equal(s.reconciliation.blockingScope,'account');assert.deepEqual(s.costs.conflictedFeeDealIds,['F-1']);}
});
test('F12 contradictory currency is a retained conflict, not automatic FX',()=>{
 const s=run([C(),C('other','0.06','F-1','USD'),F()]);assert.equal(s.fills[0].fee,null);assert.equal(s.reconciliation.blockingScope,'account');assert.deepEqual(s.costs.fees,[]);
});
test('F13 same event ID changed payload is rejected before storing a new fee claim',()=>{
 const s=run([C(),F()]),r=run([C('cost','0.07')],s);assert.equal(r.costEvidence.length,1);assert.deepEqual(economic(r),economic(s));assert.ok(issue(r,'ORDER_EVENT_CONFLICT'));assert.equal(r.reconciliation.blockingScope,'account');
});
test('F14 unrelated identity and history incidents are not cleared by a matching fee',()=>{
 const wrong={...C('foreign'),account:{...A,environment:'live'}},s=run([C(),wrong,F()]);assert.deepEqual(s.costs.fees,[{currency:'CHF',amount:'0.06'}]);assert.ok(issue(s,'ORDER_IDENTITY_MISMATCH'));assert.equal(s.reconciliation.blockingScope,'account');assert.equal(s.costEvidence.length,1);
});
test('F15 account, intent and plan mismatches cannot seed pending costs',()=>{
 for(const foreign of [{...C(),account:{...A,id:'OTHER'}},{...C(),intentId:'OTHER'},{...C(),planId:'OTHER'}]){const s=run([foreign,F()]);assert.equal(s.costEvidence.length,0);assert.equal(s.costs.unknownFeeDealCount,1);assert.equal(s.reconciliation.blockingScope,'account');}
});
test('F16 invalid fee values and currency reject atomically without an event receipt',()=>{
 const s=working(),bytes=JSON.stringify(s);for(const fee of ['NaN','Infinity','1e2','0.060','0.06\n','0.06\r',0.06,null])assert.throws(()=>run([C('bad',fee)],s));assert.throws(()=>run([C('bad','0.06','F-1','\nCHF')],s));assert.equal(JSON.stringify(s),bytes);
});
test('F17 altered cost payload, its hash or receipt binding invalidates a saved snapshot',()=>{
 for(const mutate of [s=>s.costEvidence[0].fee='0.07',s=>s.costEvidence[0].hash='0'.repeat(64),s=>s.costEvidence[0].eventHash='0'.repeat(64),s=>s.costEvidence[0].intentHash='0'.repeat(64),s=>s.receipts=s.receipts.filter(r=>r.id!=='cost')]){const s=cp(run([C(),F()]));mutate(s);assert.throws(()=>validateOrderState(s),{code:'ORDER_STATE_INVALID'});}
});
test('F18 duplicate and unknown cost evidence fields invalidate a snapshot',()=>{
 for(const mutate of [s=>s.costEvidence.push(s.costEvidence[0]),s=>s.costEvidence[0].trusted=true,s=>s.costEvidence=null]){const s=cp(run([C(),F()]));mutate(s);assert.throws(()=>validateOrderState(s),{code:'ORDER_STATE_INVALID'});}
});
test('F19 execution fee basis cannot be edited or removed undetected',()=>{
 for(const mutate of [s=>s.fills[0].feeBasis.fee='1',s=>delete s.fills[0].feeBasis,s=>s.fills[0].feeBasis.hash='0'.repeat(64)]){const s=cp(run([C(),F()]));mutate(s);assert.throws(()=>validateOrderState(s));}
});
test('F20 editing a derived fee and rebinding the old deal hash is still rejected',()=>{
 const s=cp(run([C(),F()]));s.fills[0].fee='1';const d=s.fills[0];d.hash=digest({kind:d.kind,dealId:d.dealId,orderId:d.orderId,positionId:d.positionId,units:d.units,price:d.price,executedAt:d.executedAt,fee:d.fee,feeCurrency:d.feeCurrency});assert.throws(()=>validateOrderState(s),{code:'ORDER_STATE_INVALID'});
});
test('F21 clearing pending or conflicting reconciliation flags is rejected',()=>{
 for(const state of [run([C()]),run([C(),C('bad','1'),F()])]){const s=cp(state);for(const i of s.incidents){i.resolved=true;i.resolvedBy='fake';}s.reconciliation.required=false;s.reconciliation.blockingScope=null;assert.throws(()=>validateOrderState(s),{code:'ORDER_STATE_INVALID'});}
});
test('F22 new snapshots reject old readers and cannot be relabelled as version 1',()=>{
 const s=run([C(),F()]);assert.throws(()=>Old.validateOrderState(s),{code:'ORDER_STATE_INVALID'});const bad=cp(s);bad.schemaVersion=1;assert.throws(()=>validateOrderState(bad),{code:'ORDER_STATE_INVALID'});
});
test('F23 explicit migration preserves legitimate v1 amounts, identity and quantities',()=>{
 V2();const old=run([F('F-1','12','0.06')],working(Old),Old),original=JSON.stringify(old),s=upgradeOrderState(old);
 assert.equal(s.schemaVersion,2);assert.deepEqual(economic(s),economic(old));assert.equal(s.intentHash,old.intentHash);assert.equal(s.transport.operationId,old.transport.operationId);assert.equal(s.fills[0].feeBasis.source,'legacy_snapshot');assert.equal(JSON.stringify(old),original);assert.strictEqual(upgradeOrderState(s),s);
});
test('F24 legacy missing payload is not invented by migration or an identical retry',()=>{
 V2();const old=run([C(),F()],working(Old),Old),s=upgradeOrderState(old),retry=run([C()],s);assert.equal(retry.costs.unknownFeeDealCount,1);assert.equal(retry.costEvidence.length,0);assert.equal(retry.legacyCostGaps.length,1);assert.ok(issue(retry,'DEAL_COST_WITHOUT_EXECUTION'));
 const later=run([C('new-real-evidence')],retry);assert.equal(later.costs.unknownFeeDealCount,0);assert.ok(issue(later,'DEAL_COST_WITHOUT_EXECUTION'));assert.equal(later.reconciliation.required,true);
});
test('F25 legacy state may be inspected but requires explicit migration before mutation',()=>{
 const old=working(Old);assert.deepEqual(validateOrderState(old),old);assert.throws(()=>run([C()],old),{code:'ORDER_STATE_UPGRADE_REQUIRED'});assert.throws(()=>reconcileOrder(old,{}),{code:'ORDER_STATE_UPGRADE_REQUIRED'});
});
test('F26 replay of the actual synthetic old input history into a fresh state recovers fees',()=>{
 const history=[C(),F()];const old=run(history,working(Old),Old),fresh=run(history);assert.equal(old.costs.unknownFeeDealCount,1);assert.equal(fresh.costs.unknownFeeDealCount,0);assert.equal(fresh.legacyCostGaps.length,0);
});
test('F27 old already-enriched costs remain preserved, without asserting original raw provenance',()=>{
 V2();const old=run([F(),C()],working(Old),Old),s=upgradeOrderState(old);assert.deepEqual(economic(s),economic(old));assert.equal(s.fills[0].feeBasis.source,'legacy_snapshot');assert.equal(s.costEvidence.length,0);assert.equal(run([C('conflict','1')],s).fills[0].fee,'0.06');
});
test('F28 corrupt v1 state and forged legacy incident closure are rejected during upgrade/read',()=>{
 V2();const bad=cp(working(Old));bad.quantities.openPositionUnits='2';assert.throws(()=>upgradeOrderState(bad),{code:'ORDER_STATE_INVALID'});
 const gap=cp(upgradeOrderState(run([C(),F()],working(Old),Old)));gap.incidents[0].resolved=true;assert.throws(()=>validateOrderState(gap),{code:'ORDER_STATE_INVALID'});
});
test('F29 pending costs survive real SQLite and are applied in a second process without replay',()=>withDB(dir=>{
 const db=new Store(dir);db.transaction(()=>db.set(KEY,run([C()])));db.close();const s=childRead(dir,[F()]);assert.deepEqual(s.costs.fees,[{currency:'CHF',amount:'0.06'}]);assert.equal(s.costs.unknownFeeDealCount,0);assert.deepEqual(s.costs.pendingCostDealIds,[]);
}));
test('F30 fee conflicts survive database reload and cannot be cleared by replaying one claim',()=>withDB(dir=>{
 const db=new Store(dir);db.set(KEY,run([C(),C('other','0.07'),F()]));db.close();const s=childRead(dir,[C()]);assert.equal(s.fills[0].fee,null);assert.equal(s.reconciliation.blockingScope,'account');
}));
test('F31 failed Store transaction rolls back both cost state and audit event',()=>withDB(dir=>{
 const db=new Store(dir),before=working();db.set(KEY,before);const n=db.events().length;
 assert.throws(()=>db.transaction(()=>{db.set(KEY,run([C()],db.get(KEY)));db.event('s05.test.cost');throw Error('INJECTED_PRE_COMMIT');}),/INJECTED_PRE_COMMIT/);
 assert.deepEqual(db.get(KEY),before);assert.equal(db.events().length,n);
 db.transaction(()=>{db.set(KEY,run([C()],db.get(KEY)));db.event('s05.test.cost');});db.close();const s=childRead(dir,[F(),C()]);assert.equal(s.costs.unknownFeeDealCount,0);assert.deepEqual(s.costs.fees,[{currency:'CHF',amount:'0.06'}]);
}));
test('F32 real original event-retention routine deletes old audit row, not pending cost state',()=>withDB(dir=>{
 const db=new Store(dir);db.set(KEY,run([C()]));const first=db.event('s05.test.pending');
 db.db.prepare("UPDATE sqlite_sequence SET seq=101999 WHERE name='events'").run();db.event('s05.test.retention');
 assert.equal(db.db.prepare('SELECT count(*) AS n FROM events WHERE id=?').get(first.id).n,0);assert.equal(db.get(KEY).costEvidence.length,1);db.close();
 const s=childRead(dir,[F()]);assert.equal(s.costs.unknownFeeDealCount,0);assert.deepEqual(s.costs.fees,[{currency:'CHF',amount:'0.06'}]);
}));
for(const phase of ['before','after'])test(`F33-${phase} actual child SIGKILL around SQLite COMMIT keeps complete previous or next snapshot`,()=>withDB(dir=>{
 const db=new Store(dir),before=working();db.set(KEY,before);db.close();
 const code=`import {Store} from ${JSON.stringify(url('core/store.mjs'))};import {reduceOrderEvent} from ${JSON.stringify(reducerURL)};const db=new Store(process.argv[1]);const phase=process.argv[2],e=JSON.parse(process.argv[3]);db.transaction(()=>{db.set(${JSON.stringify(KEY)},reduceOrderEvent(db.get(${JSON.stringify(KEY)}),e));db.event('s05.test.kill');if(phase==='before')process.kill(process.pid,'SIGKILL');});process.kill(process.pid,'SIGKILL');`;
 const p=spawnSync(process.execPath,['--input-type=module','-e',code,dir,phase,JSON.stringify(C())],{encoding:'utf8',timeout:15000});assert.equal(p.signal,'SIGKILL');assert.equal(p.status,null);
 const read=new Store(dir);const stored=validateOrderState(read.get(KEY));assert.equal(stored.costEvidence.length,phase==='before'?0:1);assert.equal(read.events().filter(e=>e.type==='s05.test.kill').length,phase==='before'?0:1);read.close();
 const s=childRead(dir,[C(),F(),C()]);assert.equal(s.costEvidence.length,1);assert.equal(s.costs.unknownFeeDealCount,0);assert.deepEqual(s.costs.fees,[{currency:'CHF',amount:'0.06'}]);
}));
test('F34 existing receipt limit fails closed without dropping pending economic evidence',()=>{
 const s=cp(run([C()]));while(s.receipts.length<20000)s.receipts.push({id:'synthetic-budget-'+s.receipts.length,hash:'a'.repeat(64)});const before=JSON.stringify(s);assert.throws(()=>run([F()],s),{code:'ORDER_EVENT_LIMIT'});assert.equal(JSON.stringify(s),before);assert.equal(s.costEvidence.length,1);
});
test('F35 migrated snapshot stored and read in a second process retains its legacy gap',()=>withDB(dir=>{
 V2();const s=upgradeOrderState(run([C(),F()],working(Old),Old)),db=new Store(dir);db.set(KEY,s);db.close();const r=childRead(dir,[C()]);assert.equal(r.legacyCostGaps.length,1);assert.equal(r.costs.unknownFeeDealCount,1);assert.equal(r.reconciliation.required,true);
}));

test('F36 a forged undefined receipt hash cannot bypass receipt existence',()=>{
 const s=cp(run([C()])),r=s.costEvidence[0];s.receipts=s.receipts.filter(x=>x.id!=='cost');r.eventHash=undefined;
 const {hash,...body}=r;r.hash=digest(body);assert.throws(()=>validateOrderState(s),{code:'ORDER_STATE_INVALID'});
});
test('F37 malformed inline fee is rejected too, not just separate cost confirmations',()=>{
 assert.throws(()=>run([F('F-1','12','0.06\n')]));
});
