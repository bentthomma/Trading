/** Real original Hub HTTP/auth/SQLite; only bridge messages and clocks are synthetic.
 * No bot, broker, account connection or native SDK execution. Reuses existing HTTP harness.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fixture as originalFixture,load} from '../interface_checks/route_harness.mjs';
const {COMMAND_TTL,HEARTBEAT_TTL}=await load('core/control.mjs');
const ok=(r,status=200)=>{assert.equal(r.status,status,JSON.stringify(r.data));return r.data;};
const err=(r,code,status=409)=>{assert.equal(r.status,status,JSON.stringify(r.data));assert.equal(r.data.error,code,JSON.stringify(r.data));};
async function setup(t,profileId='th3rev.ready20.v1'){
 const f=await originalFixture(t);let now=1800000000000,seq=0,key=0;
 const setClock=()=>{f.app.control.now=()=>now;f.app.store.now=()=>now;};setClock();
 const created=ok(await f.request('/api/hub/bots',{name:'SYNTHETIC_ACK_AUDIT',profileId}),201);
 const id=created.bot.id,initial=structuredClone(created.bot.desired),manifest=created.bot.manifest;
 let token=created.bridgeToken,runtimeId='synthetic_control_runtime',accountId='synthetic_control_account';
 const bot=async()=>ok(await f.request('/api/hub/bots/'+id)).bot;
 const hb=async(overrides={})=>f.request('/api/bridge/heartbeat',{botId:id,runtimeId,accountId,environment:'demo',manifestId:manifest.id,manifestVersion:manifest.version,values:initial,actualRevision:0,blocked:true,sequence:++seq,...overrides},{token});
 const propose=async(values={...initial,risk:.5},extra={})=>{const b=await bot();return ok(await f.request('/api/hub/bots/'+id+'/proposals',{values,expectedRevision:b.revision,idempotencyKey:'synthetic-'+(++key),...extra}),201).proposal;};
 const release=async()=>{const state=ok(await f.request('/api/hub/state'));return ok(await f.request('/api/hub/policy',{blocked:false,review:{digest:state.policyReview.digest}}));};
 const confirm=async p=>{const b=await bot();return f.request('/api/hub/proposals/'+p.id+'/confirm',{digest:p.digest,runtimeId:b.runtimeId,accountId:b.accountId,actualRevision:b.actualRevision});};
 const ackBody=(p,overrides={})=>({botId:id,runtimeId,commandId:p.id,revision:p.revision,digest:p.digest,accepted:true,values:p.values,...overrides});
 const ack=async(p,overrides={},auth={token})=>f.request('/api/bridge/ack',ackBody(p,overrides),auth);
 const ready=async()=>{ok(await hb());await release();const p=await propose();ok(await confirm(p));return f.app.control.proposal(p.id);};
 const delivered=async()=>{const p=await ready();const r=ok(await hb());assert.equal(r.command.id,p.id);return f.app.control.proposal(p.id);};
 return {...f,get app(){return f.app;},id,initial,manifest,bot,hb,propose,release,confirm,ack,ackBody,ready,delivered,
  get token(){return token;},set token(v){token=v;},get time(){return now;},at(v){now=v;},advance(v){now+=v;},
  async restart(){await f.restart();setClock();},get runtimeId(){return runtimeId;},set runtimeId(v){runtimeId=v;},
  proposal:p=>f.app.control.proposal(p.id),events:(type)=>f.app.store.db.prepare('SELECT * FROM events WHERE type=?').all(type)};
}

test('C01 exact deadline is expired, never a newly delivered command',async t=>{
 const g=await setup(t,'hub.standard.v1'),q=await g.ready();g.at(Date.parse(q.expiresAt));
 const r=ok(await g.hb());assert.equal(r.command,null,'NO_COMMAND_AT_EXACT_DEADLINE');
 assert.equal(g.proposal(q).status,'timed_out');assert.equal(g.proposal(q).deliveredAt,null);
 assert.equal(g.events('configuration.dispatched').length,0);assert.deepEqual((await g.bot()).actual,g.initial);
});
test('C02 exact-deadline ACK reconciles a delivered command as late, without issuing a new grant',async t=>{
 const f=await setup(t),p=await f.delivered();f.at(Date.parse(p.expiresAt));
 const r=ok(await f.ack(p));assert.equal(r.status,'applied');assert.equal(f.proposal(p).reason,'LATE_ACK','EXACT_DEADLINE_ACK_IS_LATE');
 assert.equal(f.events('configuration.unconfirmed').length,1);assert.equal((await f.bot()).status,'stale');assert.equal((await f.bot()).releaseApproved,false);
});
test('C03 clock reaching deadline after expiry scan cannot dispatch on the later SELECT',async t=>{
 const f=await setup(t),p=await f.ready();f.at(Date.parse(p.expiresAt)-1);
 const db=f.app.store.db,prepare=db.prepare;let crossed=false;
 db.prepare=function(sql,...args){if(sql.startsWith('UPDATE bots SET actual=?,actual_revision=?,')){crossed=true;f.at(Date.parse(p.expiresAt));}return prepare.call(this,sql,...args);};
 let r;try{r=ok(await f.hb());}finally{db.prepare=prepare;}
 assert.equal(crossed,true);assert.equal(r.command,null,'SELECT_MUST_EXCLUDE_EXACT_DEADLINE');
 assert.equal(f.proposal(p).deliveredAt,null);assert.equal((await f.bot()).proposals.find(x=>x.id===p.id).status,'timed_out');
});
test('C04 command one millisecond before expiry is valid, but actual state waits for explicit ACK',async t=>{
 const f=await setup(t),p=await f.ready();f.at(Date.parse(p.expiresAt)-1);const r=ok(await f.hb());
 assert.equal(r.command.id,p.id);assert.equal(r.command.scope,'new-trades');assert.ok(Date.parse(r.command.expiresAt)>Date.parse(r.serverTime));
 ok(await f.hb({values:p.values,actualRevision:p.revision}));assert.deepEqual((await f.bot()).actual,f.initial);
 ok(await f.ack(p));assert.equal((await f.bot()).actualRevision,p.revision);assert.equal(f.proposal(p).reason,null);
});
test('C05 proposal-capable MCP client cannot confirm or release; normal human path still works',async t=>{
 const f=await setup(t);ok(await f.hb());const agent=ok(await f.request('/api/hub/agents',{name:'SYNTHETIC_PROPOSER',allowProposals:true}),201);
 const call=await f.request('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'preview_configuration_change',arguments:{botId:f.id,values:{...f.initial,risk:.5},expectedRevision:0,idempotencyKey:'mcp-propose'}}},{token:agent.token,headers:{accept:'application/json, text/event-stream','mcp-protocol-version':'2025-11-25'}});
 const out=ok(call).result;assert.equal(out.isError,false,JSON.stringify(out));const p=out.structuredContent.proposal;
 assert.equal(out.structuredContent.applied,false);assert.equal(out.structuredContent.requiresHumanConfirmation,true);
 assert.equal(ok(await f.hb()).command,null);assert.deepEqual((await f.bot()).actual,f.initial);
 err(await f.request('/api/hub/proposals/'+p.id+'/confirm',{digest:p.digest},{token:agent.token}),'SESSION_REQUIRED',401);
 err(await f.request('/api/hub/policy',{blocked:false,review:{digest:f.app.control.releaseReview().digest}},{token:agent.token}),'SESSION_REQUIRED',401);
 await f.release();ok(await f.confirm(p));const command=ok(await f.hb()).command;assert.equal(command.id,p.id);
});
test('C06 ACK identity, digest, revision, delivered marker and values are checked without partial writes',async t=>{
 const f=await setup(t),p=await f.ready();err(await f.ack(p),'ACK_MISMATCH');ok(await f.hb());
 for(const bad of [{digest:'a'.repeat(64)},{runtimeId:'another_runtime'},{revision:p.revision+1}])err(await f.ack(p,bad),'ACK_MISMATCH');
 err(await f.ack(p,{values:{...p.values,risk:.6}}),'ACK_VALUES_MISMATCH');
 assert.deepEqual((await f.bot()).actual,f.initial);assert.equal(f.proposal(p).status,'pending');assert.equal(f.events('configuration.applied').length,0);
 ok(await f.ack(p));assert.equal(f.events('configuration.applied').length,1);
 err(await f.ack(p,{accepted:false,values:p.values}),'ACK_CONFLICT');assert.equal(f.events('configuration.applied').length,1);
});
test('C07 real close/reopen after delivery allows exact late reconciliation but never replay or automatic release',async t=>{
 const f=await setup(t),p=await f.delivered();await f.restart();
 assert.equal(f.proposal(p).reason,'CORE_RESTART');assert.equal((await f.bot()).status,'disconnected');assert.equal(f.app.store.get('policy').blocked,true);
 const hb=ok(await f.hb({actualRevision:p.revision,values:p.values}));assert.equal(hb.command,null);assert.equal(hb.blocked,true);assert.deepEqual((await f.bot()).actual,f.initial);
 ok(await f.ack(p));assert.equal(f.proposal(p).reason,'LATE_ACK');assert.equal((await f.bot()).actualRevision,p.revision);assert.equal(f.app.store.get('policy').blocked,true);assert.equal((await f.bot()).releaseApproved,false);
 const dup=ok(await f.ack(p));assert.equal(dup.duplicate,true);assert.equal(f.events('configuration.applied').length,1);
});
test('C08 restart before delivery permanently leaves no evidence for a late ACK of that command',async t=>{
 const f=await setup(t),p=await f.ready();await f.restart();ok(await f.hb());
 assert.equal(f.proposal(p).deliveredAt,null);err(await f.ack(p),'ACK_MISMATCH');assert.deepEqual((await f.bot()).actual,f.initial);
 assert.equal(ok(await f.hb()).command,null);assert.equal(f.events('configuration.applied').length,0);
});
test('C09 ACK response ignored after commit, real restart and exact retry do not duplicate the applied event',async t=>{
 const f=await setup(t),p=await f.delivered();
 // Application-side lost-response model: the real HTTP response is consumed and deliberately discarded.
 // This is NOT a killed process, broken wire or native callback execution claim.
 await f.ack(p);await f.restart();const r=ok(await f.ack(p));
 assert.equal(r.duplicate,true);assert.equal(r.status,'applied');assert.equal(f.events('configuration.applied').length,1);
 assert.equal((await f.bot()).actualRevision,p.revision);assert.equal(f.app.store.get('policy').blocked,true);
});
test('C10 a newer unconfirmed desired revision is not overwritten by reconciliation of an older delivered command',async t=>{
 const f=await setup(t),p=await f.delivered();f.advance(COMMAND_TTL+1);ok(await f.hb());
 const newer=await f.propose({...f.initial,risk:.7});ok(await f.ack(p));const b=await f.bot();
 assert.equal(b.revision,newer.revision);assert.equal(b.actualRevision,p.revision);assert.deepEqual(b.desired,newer.values);assert.deepEqual(b.actual,p.values);
 assert.equal(f.proposal(newer).status,'proposed');
});
test('C11 later applied revision survives exact duplicate success of an older command',async t=>{
 const f=await setup(t),p=await f.delivered();ok(await f.ack(p));ok(await f.hb({actualRevision:p.revision,values:p.values}));
 const q=await f.propose({...f.initial,risk:.7});ok(await f.confirm(q));ok(await f.hb({actualRevision:p.revision,values:p.values}));ok(await f.ack(q));
 assert.equal(ok(await f.ack(p)).duplicate,true);assert.equal((await f.bot()).actualRevision,q.revision);assert.deepEqual((await f.bot()).actual,q.values);
 assert.equal(f.events('configuration.applied').length,2);
});
test('C12 policy withdrawal and exact late ACK record state without reopening control',async t=>{
 const f=await setup(t),p=await f.delivered();ok(await f.request('/api/hub/policy',{blocked:true}));
 assert.equal(f.proposal(p).reason,'POLICY_BLOCKED');ok(await f.ack(p));const r=ok(await f.hb({actualRevision:p.revision,values:p.values}));
 assert.equal(r.blocked,true);assert.equal(r.command,null);assert.equal((await f.bot()).releaseApproved,false);
});
test('C13 replaced runtime cannot be overwritten by an ACK from the prior runtime',async t=>{
 const f=await setup(t),p=await f.delivered();f.advance(HEARTBEAT_TTL+1);ok(await f.hb({runtimeId:'synthetic_replacement',sequence:1}));
 err(await f.ack(p),'ACK_MISMATCH');assert.equal((await f.bot()).runtimeId,'synthetic_replacement');assert.equal((await f.bot()).actualRevision,0);
});
test('C14 token rotation revokes old identity; replacement token can reconcile but cannot inherit release',async t=>{
 const f=await setup(t),p=await f.delivered(),old=f.token;const rotated=ok(await f.request('/api/hub/bots/'+f.id+'/bridge-token',{}));f.token=rotated.bridgeToken;
 err(await f.ack(p,{}, {token:old}),'BRIDGE_AUTH_REQUIRED',401);ok(await f.hb({actualRevision:p.revision,values:p.values}));
 ok(await f.ack(p));assert.equal((await f.bot()).releaseApproved,false);assert.equal(ok(await f.hb({actualRevision:p.revision,values:p.values})).blocked,true);
});
test('C15 original SDK field and expiry/readback/retry contracts are statically bound; native code is not executed',async t=>{
 const f=await setup(t),p=await f.delivered(),root=process.env.S01_INTERFACE_PLATFORM;
 const sdk=readFileSync(join(root,'sdk/HubBridge.cs'),'utf8'),protocol=readFileSync(join(root,'sdk/HubProtocol.cs'),'utf8');
 assert.ok(sdk.includes('command.ExpiresAt <= serverTime'));assert.ok(sdk.includes('_utcNow() >= command.ExpiresAt'));
 assert.ok(sdk.includes('after.ActualRevision != command.Revision'));assert.ok(sdk.includes('APPLY_READBACK_MISMATCH'));
 assert.ok(sdk.indexOf('if (_pendingAck is not null)')<sdk.indexOf('_transport.HeartbeatAsync'));
 assert.ok(sdk.includes('known.Command != command'));assert.ok(sdk.includes('_pendingAck = known.Ack;'));
 const section=protocol.split('public sealed record HubAcknowledgement<TValues>')[1].split('public sealed record HubAcknowledgementResponse')[0];
 const fields=[...section.matchAll(/public (?:required )?[\w?]+ (\w+) \{ get; init; \}/g)].map(m=>m[1][0].toLowerCase()+m[1].slice(1)).filter(x=>x!=='reason').sort();
 assert.deepEqual(Object.keys(f.ackBody(p)).sort(),fields);assert.equal(ok(await f.ack(p)).status,'applied');
});
test('C16 open boundary: rejected duplicate receipt depends on current values, not immutable original rejection payload',async t=>{
 const f=await setup(t),p=await f.delivered();ok(await f.ack(p,{accepted:false,values:f.initial}));
 assert.equal(ok(await f.ack(p,{accepted:false,values:f.initial})).duplicate,true);
 const q=await f.propose({...f.initial,risk:.7});ok(await f.confirm(q));ok(await f.hb());ok(await f.ack(q));
 err(await f.ack(p,{accepted:false,values:f.initial}),'REJECTION_STATE_UNCERTAIN');
 // This altered duplicate is accepted by the ORIGINAL code; characterization, not a repair assertion.
 const changed=ok(await f.ack(p,{accepted:false,values:q.values}));assert.equal(changed.duplicate,true);assert.equal(changed.status,'rejected');
 assert.equal(f.events('configuration.rejected').length,1);assert.equal((await f.bot()).actualRevision,q.revision);
});

// A scheduling hook advances only the injected clock, not the runtime/DB content.
test('C17 clock advancement during dispatch cannot contradict the response decision timestamp',async t=>{
 const f=await setup(t),p=await f.ready();f.at(Date.parse(p.expiresAt)-1);
 const store=f.app.store,event=store.event;let crossed=false;
 store.event=function(type,...args){if(type==='configuration.dispatched'){crossed=true;f.at(Date.parse(p.expiresAt));}return event.call(this,type,...args);};
 let r;try{r=ok(await f.hb());}finally{store.event=event;}
 assert.equal(crossed,true);assert.ok(r.command);
 assert.ok(Date.parse(r.command.expiresAt)>Date.parse(r.serverTime),'COMMAND_MUST_BE_VALID_AT_RESPONSE_DECISION_TIME');
 assert.equal(f.time,Date.parse(r.command.expiresAt),'wall clock can advance after decision; native callback must still enforce current expiry');
 assert.deepEqual((await f.bot()).actual,f.initial);
});
