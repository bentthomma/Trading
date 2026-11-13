/** Tests of ORIGINAL archived modules. No copied reducer or simulated sender. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const root=process.env.S05_PLATFORM;
if(!root)throw Error('S05_PLATFORM required');
const url=p=>pathToFileURL(resolve(root,p)).href;
const {createOrderState,reduceOrderEvent,reconcileOrder,validateOrderState}=await import(url('core/planning/order-lifecycle.mjs'));
const {Store}=await import(url('core/store.mjs'));
const d=await import(url('core/planning/decimal.mjs'));
const A={broker:'S05_SYNTHETIC',id:'NOT_A_REAL_ACCOUNT',environment:'demo'},T='2026-11-13T10:00:00.000Z';
const O={planId:'PLAN-S05',intentId:'INTENT-S05',account:A,symbol:'MPR1_TEST_ONLY',side:'buy',kind:'limit',requestedUnits:'36',createdAt:T,expiresAt:null};
const N={orderId:'9007199254740993',symbol:O.symbol,side:O.side,kind:O.kind};
const E=(id,type,payload={},at=T)=>({id,type,payload,at,account:A,planId:O.planId,intentId:O.intentId});
function sent(){let s=createOrderState(O);for(const k of ['VALIDATED','RESERVED','DURABLE'])s=reduceOrderEvent(s,E(k,k));return reduceOrderEvent(s,E('dispatch','DISPATCH_MAY_HAVE_STARTED',{operationId:'OP-S05'}));}
function working(){return reduceOrderEvent(sent(),E('accepted','BROKER_ACCEPTED',{...N,acceptedUnits:'36'}));}
const F=(id='F-1',units='12',fee='0.06')=>E('evt-'+id,'BROKER_FILL',{...N,dealId:id,positionId:'POS-1',units,price:'100.25',fee,feeCurrency:fee===null?null:'CHF',executedAt:T});
const C=(id='cost',fee='0.06',dealId='F-1')=>E(id,'DEAL_COST_CONFIRMED',{dealId,fee,feeCurrency:'CHF'});
const issue=(s,c)=>s.incidents.some(x=>!x.resolved&&x.code===c);
const economic=s=>({filled:s.quantities.knownFilledUnits,open:s.quantities.openPositionUnits,closed:s.quantities.closedUnits,reserved:s.quantities.reservationUnits,terminated:s.quantities.terminatedRemainderUnits,fees:s.costs.fees});
const permutations=a=>a.length?a.flatMap((x,i)=>permutations(a.filter((_,j)=>j!==i)).map(t=>[x,...t])):[[]];
function restoredInAnotherProcess(s){
 const dir=mkdtempSync(join(tmpdir(),'s05-store-'));let db;
 try{
  db=new Store(dir);db.set('s05.test.original-order',s);db.close();db=null;
  const code=`import {Store} from ${JSON.stringify(url('core/store.mjs'))};import {validateOrderState} from ${JSON.stringify(url('core/planning/order-lifecycle.mjs'))};const db=new Store(process.argv[1]);try{console.log(JSON.stringify(validateOrderState(db.get('s05.test.original-order'))));}finally{db.close();}`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',code,dir],{encoding:'utf8',env:process.env,timeout:15000});
  assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
 } finally {db?.close();rmSync(dir,{recursive:true,force:true});}
}

test('S05 partial 12/36 fill leaves only 24 units reserved, not cash or extra position',()=>{
 const s=reduceOrderEvent(working(),F());assert.equal(s.quantities.openPositionUnits,'12');assert.equal(s.quantities.reservationUnits,'24');assert.deepEqual(s.costs.fees,[{currency:'CHF',amount:'0.06'}]);assert.equal(s.positions.length,1);
});
test('S05 full two fills preserve exact sub-cent charges without repeated booking',()=>{
 let s=reduceOrderEvent(working(),F());const f=F('F-2','24','0.12');s=reduceOrderEvent(s,f);s=reduceOrderEvent(s,f);s=reduceOrderEvent(s,{...f,id:'another-transport'});
 assert.equal(s.quantities.openPositionUnits,'36');assert.equal(s.quantities.reservationUnits,'0');assert.equal(s.fills.length,2);assert.deepEqual(s.costs.fees,[{currency:'CHF',amount:'0.18'}]);
});
test('S05 late fills, terminal cancellation and early close converge in all 24 delivery orders',()=>{
 const events=[F('F-1','12','0.06'),F('F-2','6','0.03'),E('cancel','BROKER_CANCELLED',{...N,filledUnits:'18',unfilledUnits:'18',executionFinal:true}),E('closed','POSITION_CLOSE',{...N,originOrderId:N.orderId,closingOrderId:'CLOSE-1',dealId:'C-1',positionId:'POS-1',units:'3',price:'101.54',fee:'0.015',feeCurrency:'CHF',executedAt:T})];
 const expected={filled:'18',open:'15',closed:'3',reserved:'0',terminated:'18',fees:[{currency:'CHF',amount:'0.105'}]};
 for(const order of permutations(events)){let s=working();for(const e of order){s=reduceOrderEvent(s,e);s=reduceOrderEvent(s,{...e,id:e.id+'-duplicate'});}assert.deepEqual(economic(s),expected);}
});
test('S05 changed economic payload under the same deal ID is held, not counted twice',()=>{
 const f=F(),s=reduceOrderEvent(working(),f),conflict=reduceOrderEvent(s,{...f,id:'changed',payload:{...f.payload,fee:'4'}});
 assert.deepEqual(economic(conflict),economic(s));assert.ok(issue(conflict,'DEAL_IDENTITY_CONFLICT'));assert.equal(conflict.reconciliation.blockingScope,'account');
});
test('S05 fees in CHF and USD remain two amounts, no guessed FX conversion',()=>{
 let s=reduceOrderEvent(working(),F());const f=F('USD','12','1');s=reduceOrderEvent(s,{...f,payload:{...f.payload,feeCurrency:'USD'}});
 assert.deepEqual(s.costs.fees,[{currency:'CHF',amount:'0.06'},{currency:'USD',amount:'1'}]);assert.equal(s.costs.totalAccountCurrency,undefined);
});
test('S05 unknown fee remains unknown, no conversion to known zero',()=>{
 const s=reduceOrderEvent(working(),F('F-1','12',null));assert.equal(s.costs.unknownFeeDealCount,1);assert.deepEqual(s.costs.fees,[]);
});
test('GAP-01 original fee-before-fill remains unresolved on exact event retry (not a fix)',()=>{
 const f=F('F-1','12',null),c=C();const ordered=reduceOrderEvent(reduceOrderEvent(working(),f),c);
 const reversed=reduceOrderEvent(reduceOrderEvent(working(),c),f),repeat=reduceOrderEvent(reversed,c);
 assert.equal(ordered.costs.unknownFeeDealCount,0);assert.equal(reversed.costs.unknownFeeDealCount,1);assert.strictEqual(repeat,reversed);assert.ok(issue(repeat,'DEAL_COST_WITHOUT_EXECUTION'));
});
test('GAP-01 fee ordering gap persists through actual SQLite and a second Node process',()=>{
 const s=reduceOrderEvent(reduceOrderEvent(working(),C()),F('F-1','12',null)),r=restoredInAnotherProcess(s),again=reduceOrderEvent(r,C());
 assert.deepEqual(economic(again),economic(s));assert.equal(again.costs.unknownFeeDealCount,1);assert.ok(issue(again,'DEAL_COST_WITHOUT_EXECUTION'));
});
test('GAP-01 a different cost event may enrich a fee but does not silently clear the prior incident',()=>{
 let s=reduceOrderEvent(reduceOrderEvent(working(),C()),F('F-1','12',null));s=reduceOrderEvent(s,C('second-event'));
 assert.equal(s.costs.unknownFeeDealCount,0);assert.deepEqual(s.costs.fees,[{currency:'CHF',amount:'0.06'}]);assert.ok(issue(s,'DEAL_COST_WITHOUT_EXECUTION'));
});
test('S05 known deal survives SQLite reload and replay of original and new callback IDs',()=>{
 const s=reduceOrderEvent(working(),F()),r=restoredInAnotherProcess(s);let again=reduceOrderEvent(r,F());again=reduceOrderEvent(again,{...F(),id:'new-callback'});
 assert.deepEqual(economic(again),economic(s));assert.equal(again.fills.length,1);
});
test('S05 saved uncertain-send state rejects release and replacement operation after process restart',()=>{
 let s=reduceOrderEvent(sent(),E('timeout','DISPATCH_OUTCOME_UNKNOWN',{operationId:'OP-S05'}));s=restoredInAnotherProcess(s);
 s=reduceOrderEvent(s,E('release','RELEASE_BEFORE_SEND'));s=reduceOrderEvent(s,E('second-op','DISPATCH_MAY_HAVE_STARTED',{operationId:'OTHER-OP'}));
 assert.equal(s.transport.operationId,'OP-S05');assert.equal(s.transport.status,'outcome_unknown');assert.equal(s.quantities.reservationUnits,'36');assert.ok(issue(s,'CANNOT_RELEASE_UNCERTAIN_SEND'));assert.ok(issue(s,'DISPATCH_IDENTITY_CHANGED'));
});
test('S05 financial facts survive transport timeout following a fill; no second sender exists in this test',()=>{
 let s=reduceOrderEvent(working(),F('F-1','36','0.18'));s=reduceOrderEvent(s,E('timeout','DISPATCH_OUTCOME_UNKNOWN',{operationId:'OP-S05'}));s=restoredInAnotherProcess(s);
 s=reduceOrderEvent(s,{...F('F-1','36','0.18'),id:'retry-proof'});assert.equal(s.quantities.openPositionUnits,'36');assert.equal(s.fills.length,1);assert.equal(s.transport.operationId,'OP-S05');
});
test('S05 corrupted persisted quantities are rejected instead of trusted',()=>{
 const s=JSON.parse(JSON.stringify(reduceOrderEvent(working(),F())));s.quantities.openPositionUnits='0';assert.throws(()=>validateOrderState(s),{code:'ORDER_STATE_INVALID'});
});
test('S05 an account/environment mismatch does not alter fills or fee values',()=>{
 const s=reduceOrderEvent(working(),F()),foreign={...F('F-2','24','0.12'),account:{...A,environment:'live'}};const r=reduceOrderEvent(s,foreign);
 assert.deepEqual(economic(r),economic(s));assert.equal(r.reconciliation.blockingScope,'account');
});
test('S05 original decimal helper rejects unsupported extra precision instead of rounding',()=>{
 assert.equal(d.multiplyDecimal('1','0.005'),'0.005');assert.equal(d.addDecimal('0.005','0.005'),'0.01');assert.throws(()=>d.multiplyDecimal('0.000000000000000001','0.1'),{code:'PLANNING_DECIMAL_PRECISION_LOSS'});assert.equal(d.addDecimal('9007199254740993','1'),'9007199254740994');
});
