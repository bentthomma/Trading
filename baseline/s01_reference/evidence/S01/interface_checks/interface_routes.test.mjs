/** Original local ingress -> real SQLite -> original reconciliation/remote projection.
 * Synthetic values only. Native C# senders are source-checked, not run.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {fixture,load} from './route_harness.mjs';
const {HUMAN}=await load('core/control.mjs');
const {RemoteView20}=await load('core/remote-view20.mjs');
const {validateRemoteProjection20}=await load('integrations/vercel-view20/lib/projection.mjs');
const {JOURNAL_TEST_ACCOUNT:A,originalPlan,journalEvent,journalBatch,engineStatus}=await load('tests/support/engine-journal-fixtures.mjs');
const {digest}=await load('core/schema.mjs');
const PID='9007199254740993';
const sha=s=>createHash('sha256').update(s).digest('hex');
async function profiles(f){
 async function make(profileId,name){const r=await f.request('/api/hub/bots',{profileId,name});assert.equal(r.status,201);return {...r.data,sequence:0};}
 const o=await make('th3rev.observer.v1','SYNTHETIC_SOURCE_OBSERVER'),e=await make('th3rev.ready20.v1','SYNTHETIC_SOURCE_ENGINE');
 async function heartbeat(which){const r=await f.request('/api/bridge/heartbeat',{botId:which.bot.id,runtimeId:which===o?'synthetic-observer-runtime':'synthetic-ready20-runtime',accountId:A.id,environment:'demo',manifestId:which.bot.manifest.id,manifestVersion:'1.0.0',values:which.bot.desired,actualRevision:0,blocked:true,sequence:++which.sequence},{token:which.bridgeToken});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.blocked,true);assert.equal(r.data.command,null);return r;}
 await heartbeat(o);await heartbeat(e);return {o,e,heartbeat};
}
function obs(botId,now=Date.now(),sequence='1',overrides={}){
 return {schemaVersion:1,botId,runtimeId:'synthetic-observer-runtime',bootId:'synthetic-observer-runtime',account:{...A,type:'hedged',equity:'100000.000000000001',balance:'100000'},build:{engine:'Th3RevolutionObserver20',version:'2.0.0-alpha.4',sourceHash:'b'.repeat(64)},sequence,captureStartedAt:new Date(now).toISOString(),observedAt:new Date(now).toISOString(),actualRevision:0,mode:'observer',writesAllowed:false,nonAtomicSnapshot:true,coverage:{positionsComplete:true,ordersComplete:true,symbolsComplete:true,historyComplete:false,positionCount:1,orderCount:0,symbolCount:1},positions:[{id:PID,symbol:'SYNTHETIC_FX',side:'buy',entry:'1.100000000000000001',units:'10000',stop:'1.09',target:'1.12',net:'-0.1',entryAt:new Date(now-10000).toISOString(),planId:null,exitMode:'observed_only'}],orders:[],symbols:[{id:'SYNTHETIC_FX',marketOpen:true,quoteAt:null,bid:'1.1',ask:'1.10001',nextCloseAt:null}],...overrides};
}
function events(now){const p=originalPlan(now,{score:null});return [journalEvent('plan.recorded',p,'1',now),journalEvent('position.reported',{positionId:PID,planId:p.planId,symbol:p.symbol,side:p.side,units:p.units,entry:p.entry,stop:p.stop,target:p.target,net:'-0.1',exitMode:'original_plan',reason:'SYNTHETIC'},'2',now),journalEvent('engine.status',engineStatus(),'3',now)];}
async function populate(f,p,{value=obs(p.o.bot.id),reports=events(Date.now())}={}){
 const a=await f.request('/api/bridge/observation',value,{token:p.o.bridgeToken});assert.equal(a.status,200,JSON.stringify(a.data));
 const b=await f.request('/api/bridge/journal',journalBatch(p.e.bot.id,reports),{token:p.e.bridgeToken});assert.equal(b.status,200,JSON.stringify(b.data));return {a,b,value,reports};
}
const observe=(f,p)=>f.request('/api/hub/bots/'+p.o.bot.id+'/observation');
const journal=(f,p)=>f.request('/api/hub/bots/'+p.e.bot.id+'/journal');
const reconcile=(f,p)=>f.request('/api/hub/reconciliation20?'+new URLSearchParams({engineBotId:p.e.bot.id,observerBotId:p.o.bot.id}));
function fields(source,name){const m=source.match(new RegExp('public sealed record '+name+'\\(([^;]*?)\\);','s'));assert.ok(m,'record '+name);return m[1].split(',').map(s=>s.trim().split(/\s+/).at(-1)).map(k=>k[0].toLowerCase()+k.slice(1)).sort();}
async function project(f,t,which){
 const req=(await f.request('/api/hub/remote-view20/request',{botId:which.bot.id}));assert.equal(req.status,200,JSON.stringify(req.data));
 let at=Date.now(),token='x'.repeat(43),sent=null;
 const vault={async set(_k,v){token=v;},async get(){return token;},delete(){}}; // transport credential store double, no broker secrets
 const pair={format:'th3rev20-view-pairing',schemaVersion:1,origin:'https://extremelab-bt.vercel.app',path:'/api/revolution',deviceId:'synthetic-interface-device',token,botId:which.bot.id,account:req.data.account,issuedAt:new Date(at).toISOString(),expiresAt:new Date(at+86400000).toISOString(),intervalMilliseconds:30000};
 const manager=new RemoteView20({control:f.app.control,vault,now:()=>at,fetchImpl:async(url,options)=>{assert.equal(url,pair.origin+pair.path+'?action=receive');sent=JSON.parse(options.body);validateRemoteProjection20(sent,at);return new Response(JSON.stringify({accepted:true,grantsTrading:false,deviceId:pair.deviceId,slot:sent.slot,payloadHash:sha(options.body)}));}});
 t.after(()=>manager.close());await manager.connect(pair,HUMAN);await manager.tick();assert.ok(sent,manager.status().lastError);assert.ok(manager.status().lastAcknowledgedAt);return {sent,manager};
}

test('I01 original HTTP and SQLite maintain distinct observation and journal records without broker permission',async t=>{
 const f=await fixture(t),p=await profiles(f);
 const a=await f.request('/api/bridge/observation',obs(p.o.bot.id),{token:p.o.bridgeToken});assert.equal(a.status,200);
 assert.equal((await journal(f,p)).data.available,false,'observation must not populate the engine journal');assert.equal(f.app.store.latestSnapshot(),null);
 const b=await f.request('/api/bridge/journal',journalBatch(p.e.bot.id,events(Date.now())),{token:p.e.bridgeToken});assert.equal(b.status,200);
 const o=(await observe(f,p)).data,j=(await journal(f,p)).data;
 assert.equal(o.observation.account.equity,'100000.000000000001');assert.equal(o.observation.positions[0].id,PID);assert.equal(o.historyAvailable,false);assert.equal(o.originalPlansAvailable,false);
 assert.equal(j.positions[0].report.positionId,PID);assert.equal(j.plans[0].plan.entry,'1.100000000000000001');assert.equal(j.plansAreExecutionGrants,false);assert.equal(j.independentBrokerProof,false);
 assert.equal(f.app.store.latestSnapshot(),null);assert.equal(f.app.store.get('policy').blocked,true);
});
test('I02 native C# records and actual ingress/receipt shapes match; native execution remains untested',async t=>{
 const f=await fixture(t),p=await profiles(f),r=await populate(f,p);
 const base=process.env.S01_INTERFACE_PLATFORM;
 const cs=readFileSync(join(base,'integrations/ctrader-observer20/observer/src/ObserverProtocol.cs'),'utf8');
 const js=readFileSync(join(base,'integrations/ctrader-th3revolution20/src/Th3JournalProtocol20.cs'),'utf8');
 assert.deepEqual(fields(cs,'Observation'),Object.keys(r.value).sort());assert.deepEqual(fields(js,'JournalBatch20'),Object.keys(journalBatch(p.e.bot.id,r.reports)).sort());assert.deepEqual(fields(js,'JournalEvent20'),Object.keys(r.reports[0]).sort());assert.deepEqual(fields(js,'JournalReceipt20'),Object.keys(r.b.data).sort());
 assert.match(cs,/'?api\/bridge\/heartbeat/);assert.match(cs,/api\/bridge\/observation/);assert.match(js,/api\/bridge\/journal/);assert.equal(r.a.data.grantsTrading,false);assert.equal(r.b.data.grantsTrading,false);
});
test('I03 wrong protocol, profile and token cannot cross observer and journal boundaries',async t=>{
 const f=await fixture(t),p=await profiles(f),v=obs(p.o.bot.id),b=journalBatch(p.e.bot.id,events(Date.now()));
 for(const [path,value,token] of [['observation',b,p.e.bridgeToken],['journal',v,p.o.bridgeToken],['observation',v,p.e.bridgeToken],['journal',b,p.o.bridgeToken]]){const r=await f.request('/api/bridge/'+path,value,{token});assert.ok([400,403,409].includes(r.status),JSON.stringify(r.data));}
 assert.equal((await observe(f,p)).data.available,false);assert.equal((await journal(f,p)).data.available,false);
});
test('I04 original passive comparison links only the explicitly selected pair and never grants execution',async t=>{
 const f=await fixture(t),p=await profiles(f);await populate(f,p);const r=await reconcile(f,p);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.accountMatched,true);assert.equal(r.data.summary.linkedByNativeId,1);assert.equal(r.data.coverage.engineIsOpenPositionList,false);assert.equal(r.data.writesAllowed,false);
 assert.equal((await f.request('/api/hub/reconciliation20')).status,400);assert.equal((await f.request('/api/hub/reconciliation20?'+new URLSearchParams({engineBotId:p.o.bot.id,observerBotId:p.e.bot.id}))).status,409);assert.equal(f.app.store.get('policy').blocked,true);
});
test('I05 same native ID and account number at another broker are not joined',async t=>{
 const f=await fixture(t),p=await profiles(f),v=obs(p.o.bot.id);v.account.broker='DIFFERENT_SYNTHETIC_BROKER';await populate(f,p,{value:v});const r=await reconcile(f,p);assert.equal(r.status,200);assert.equal(r.data.accountMatched,false);assert.deepEqual(r.data.positions,[]);assert.equal(r.data.summary.linkedByNativeId,0);
});
test('I06 accepted out-of-order journal event is durable but absent from the contiguous projection',async t=>{
 const f=await fixture(t),p=await profiles(f),now=Date.now(),es=events(now);
 let r=await f.request('/api/bridge/journal',journalBatch(p.e.bot.id,[es[1]]),{token:p.e.bridgeToken});assert.equal(r.status,200);assert.deepEqual([r.data.stored,r.data.contiguousSequence,r.data.highWaterSequence,r.data.gap],[1,'0','2',true]);assert.equal((await journal(f,p)).data.positions.length,0);
 r=await f.request('/api/bridge/journal',journalBatch(p.e.bot.id,[es[0],es[2]]),{token:p.e.bridgeToken});assert.equal(r.status,200);assert.equal(r.data.contiguousSequence,'3');assert.equal((await journal(f,p)).data.positions.length,1);
});
test('I07 actual server/database restart plus duplicate receipts cannot restore freshness',async t=>{
 const f=await fixture(t),p=await profiles(f),r=await populate(f,p);await f.restart();assert.equal((await observe(f,p)).data.reason,'CORE_RESTART_AWAITING_OBSERVATION');assert.equal((await journal(f,p)).data.reason,'CORE_RESTART_AWAITING_JOURNAL');await p.heartbeat(p.o);await p.heartbeat(p.e);
 assert.equal((await f.request('/api/bridge/observation',r.value,{token:p.o.bridgeToken})).data.duplicate,true);assert.equal((await f.request('/api/bridge/journal',journalBatch(p.e.bot.id,r.reports),{token:p.e.bridgeToken})).data.duplicates,3);
 assert.equal((await observe(f,p)).data.fresh,false);assert.equal((await journal(f,p)).data.fresh,false);assert.equal((await reconcile(f,p)).data.writesAllowed,false);
});
test('I08 original remote projection distinguishes open observer inventory from engine report history',async t=>{
 const f=await fixture(t),p=await profiles(f);await populate(f,p);
 const o=(await project(f,t,p.o)).sent,e=(await project(f,t,p.e)).sent;
 assert.equal(o.source.kind,'paired_observer');assert.equal(o.counts.positionCountIsOpenInventory,true);assert.equal(o.plans.length,0);assert.equal(o.positions[0].planId,null);assert.equal(o.positions[0].id,PID);
 assert.equal(e.source.kind,'paired_engine_report');assert.equal(e.counts.positionCountIsOpenInventory,false);assert.equal(e.plans[0].planId,'plan-1');assert.equal(e.positions[0].planId,'plan-1');assert.equal(e.positions[0].id,PID);
});
test('I09 fresh partial observation remains explicitly truncated in the original remote projection',async t=>{
 const f=await fixture(t),p=await profiles(f),v=obs(p.o.bot.id);v.coverage.positionsComplete=false;v.coverage.positionCount=2;await populate(f,p,{value:v});const r=(await project(f,t,p.o)).sent;
 assert.equal(r.source.fresh,true);assert.equal(r.truncated,true);assert.equal(r.counts.positions,2);assert.equal(r.positions.length,1);assert.equal((await observe(f,p)).data.status,'partial');
});
test('I10 current engine status does not refresh the timestamp of an older position report',async t=>{
 const f=await fixture(t),p=await profiles(f),now=Date.now(),es=events(now-60000);es[2]=journalEvent('engine.status',engineStatus(),'3',now);await populate(f,p,{reports:es});const r=(await project(f,t,p.e)).sent;
 assert.equal(r.source.fresh,true);assert.equal(r.positions[0].sourceAt,new Date(now-60000).toISOString());assert.equal(r.source.sourceAt,new Date(now).toISOString());assert.equal(r.counts.positionCountIsOpenInventory,false);
});
test('I11 remote view is a lossy display projection, not a legal original-ingress event',async t=>{
 const f=await fixture(t),p=await profiles(f);await populate(f,p);const r=(await project(f,t,p.e)).sent;
 for(const [path,value,token,status] of [['journal',r,p.e.bridgeToken,400],['observation',r,p.o.bridgeToken,403],['observation',{...r,botId:p.o.bot.id},p.o.bridgeToken,400]])assert.equal((await f.request('/api/bridge/'+path,value,{token})).status,status);
 assert.equal(r.plans[0].configRevision,undefined);assert.equal(r.positions[0].eventId,undefined);assert.equal(f.app.store.get('policy').blocked,true);
});
test('I12 original shared comparison is identical through HTTP and authenticated MCP; bridge token cannot read',async t=>{
 const f=await fixture(t),p=await profiles(f);await populate(f,p);const h=await reconcile(f,p);const agent=await f.request('/api/hub/agents',{name:'SYNTHETIC_READ_ONLY',allowProposals:false});assert.equal(agent.status,201);
 const m=await f.request('/mcp',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_bot_reconciliation',arguments:{engineBotId:p.e.bot.id,observerBotId:p.o.bot.id}}},{token:agent.data.token,headers:{accept:'application/json, text/event-stream','mcp-protocol-version':'2025-11-25'}});
 assert.equal(m.status,200,JSON.stringify(m.data));assert.equal(m.data.result.isError,false,JSON.stringify(m.data));const v=m.data.result.structuredContent;assert.ok(v,JSON.stringify(m.data));assert.deepEqual(v.selection,h.data.selection);assert.deepEqual(v.account,h.data.account);assert.deepEqual(v.positions.map(x=>x.positionId),h.data.positions.map(x=>x.positionId));assert.equal(v.writesAllowed,false);
 const wrong=await f.request('/mcp',{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'get_position_reconciliation',arguments:{engineBotId:p.e.bot.id,observerBotId:p.o.bot.id}}},{token:agent.data.token,headers:{accept:'application/json, text/event-stream','mcp-protocol-version':'2025-11-25'}});assert.equal(wrong.status,200);assert.equal(wrong.data.result.isError,true);
 assert.equal((await f.request('/api/hub/bots/'+p.o.bot.id+'/observation',undefined,{token:p.o.bridgeToken})).status,401);
});

test('I13 original XL1/XL2 website validator rejects native journal/observation/remote schemas without an invented converter',async t=>{
 const {validateEvents}=await import('../../../baseline/vercel_recovered/src/lib/security.mjs');
 const f=await fixture(t),p=await profiles(f),value=obs(p.o.bot.id),reports=events(Date.now());await populate(f,p,{value,reports});
 const remote=(await project(f,t,p.e)).sent;
 for(const input of [journalBatch(p.e.bot.id,reports),value,remote])assert.throws(()=>validateEvents(input));
 const good={events:[{schema:2,run:'SYNTHETIC_LEGACY_RUN',seq:1,kind:'POSITION',utc:new Date().toISOString(),data:{id:PID,entry:'1.100000000000000001'}}]};
 const parsed=validateEvents(good);assert.equal(parsed.format,'ExtremeLabAnalysis/2');assert.equal(parsed.source,'imported_journal_not_live');assert.equal(parsed.events[0].data.id,PID);assert.equal(parsed.events[0].data.entry,'1.100000000000000001');
});
