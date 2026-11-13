/** Tests original Hub modules in an isolated extracted archive, not a new Controller. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.env.S02_ORIGINAL_ROOT;
if(!root)throw Error('S02_ORIGINAL_ROOT is required; no implicit external lookup');
const original=async p=>import(pathToFileURL(join(root,p)).href);
const {Store}=await original('core/store.mjs');
const {Control,HUMAN}=await original('core/control.mjs');
const {Registry}=await original('core/registry.mjs');
const {STANDARD_MANIFEST,defaults}=await original('core/schema.mjs');
function setup(){
 const dir=mkdtempSync(join(tmpdir(),'s02-core-'));let time=1800000000000,sequence=0;
 const store=new Store(dir,{now:()=>time}),core=new Control(store,{now:()=>time});
 const b=core.createBot({name:'Synthetic S02 fixture'}),id=b.bot.id,bridge=core.authenticate(b.bridgeToken,'bridge');
 const heartbeat=()=>core.heartbeat({botId:id,runtimeId:'s02-runtime',accountId:'synthetic-account',environment:'demo',manifestId:STANDARD_MANIFEST.id,manifestVersion:STANDARD_MANIFEST.version,actualRevision:0,values:defaults(STANDARD_MANIFEST),blocked:true,sequence:++sequence},bridge);
 return{dir,store,core,id,bridge,heartbeat,advance:n=>time+=n,clean:()=>{try{store.close();}catch{}rmSync(dir,{force:true,recursive:true});}};
}
test('S02 C03: real registry cannot turn research payload into broker order',async()=>{
 const f=setup();try{
  const actor=f.core.authenticate(f.core.issueToken({name:'Synthetic research',allowProposals:true}).token);
  const registry=new Registry(f.core,{health:async()=>({ok:true}),snapshot:async()=>null});
  for(const name of ['execute_order','close_position','submit_broker_order'])await assert.rejects(registry.call(name,{approved:true},actor),e=>e.code==='TOOL_NOT_FOUND');
  const p=f.core.propose(f.id,{values:defaults(STANDARD_MANIFEST),expectedRevision:0,idempotencyKey:'s02-proposal'},actor).proposal;
  assert.throws(()=>f.core.confirm(p.id,p.digest,actor),e=>e.code==='HUMAN_CONFIRMATION_REQUIRED');
  assert.equal(f.core.bot(f.id).actual,null);assert.equal(f.core.proposal(p.id).status,'proposed');
 }finally{f.clean();}
});
test('S02 C04: confirmed local parameters persist with no website and after SQLite reopen',()=>{
 const f=setup();try{
  f.heartbeat();f.core.setPolicy(false,HUMAN,{digest:f.core.releaseReview().digest});
  const p=f.core.propose(f.id,{values:{...defaults(STANDARD_MANIFEST),risk:.5},expectedRevision:0,idempotencyKey:'s02-confirmed'}).proposal;
  const b=f.core.bot(f.id);f.core.confirm(p.id,p.digest,HUMAN,{runtimeId:b.runtimeId,accountId:b.accountId,actualRevision:b.actualRevision});f.heartbeat();
  f.core.ack({botId:f.id,runtimeId:'s02-runtime',commandId:p.id,revision:p.revision,digest:p.digest,values:p.values,accepted:true},f.bridge);
  const actual=structuredClone(f.core.bot(f.id).actual);
  f.advance(120000);f.core.expire();assert.deepEqual(f.core.bot(f.id).actual,actual);assert.equal(f.core.bot(f.id).status,'stale');
  f.store.close();const reopened=new Store(f.dir),core=new Control(reopened);try{
   assert.deepEqual(core.bot(f.id).actual,actual);assert.equal(core.bot(f.id).actualRevision,p.revision);
   assert.equal(core.bot(f.id).status,'disconnected');assert.equal(reopened.get('policy').blocked,true);
  }finally{reopened.close();}
 }finally{f.clean();}
});
