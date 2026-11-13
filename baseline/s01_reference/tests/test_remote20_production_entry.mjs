// Original API + security/service + original local Store/Control/Vault/producer.
// Only Blob/cache and HTTP transport are explicit synthetic adapters. No servers or bots.
import test,{beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
const source=process.env.S01_REMOTE_SOURCE,platform=process.env.S01_REMOTE_PLATFORM;
assert.ok(source&&platform,'runner must supply isolated source copies');
const START=Date.parse('2026-11-13T08:00:00.000Z');let clock=START;
Date.now=()=>clock;
process.env.SESSION_SECRET='SYNTHETIC_TEST_SECRET_NEVER_A_REAL_CREDENTIAL_1234';
process.env.APP_ORIGIN='https://extremelab-bt.vercel.app';process.env.VERCEL_PROJECT_ID='SYNTHETIC_REMOTE_PROJECT';
const imp=p=>import(pathToFileURL(p));
const {default:handler}=await imp(source+'/api/revolution.js');
const {signSession}=await imp(source+'/lib/security.mjs');
const {Store}=await imp(platform+'/core/store.mjs');
const {Control,HUMAN}=await imp(platform+'/core/control.mjs');
const {Vault}=await imp(platform+'/core/vault.mjs');
const {RemoteView20}=await imp(platform+'/core/remote-view20.mjs');
const {JOURNAL_TEST_ACCOUNT,originalPlan,journalEvent,journalBatch,orderReport,engineStatus}=await imp(platform+'/tests/support/engine-journal-fixtures.mjs');
const clone=structuredClone,key='th3rev20-view-v1:device-auth';
function reset(){clock=START;globalThis.__remoteProvider={record:null,etag:0,writes:0,cache:new Map(),trace:[],cancelled:0};}
beforeEach(reset);
const provider=()=>globalThis.__remoteProvider;
async function request(action,{method='GET',body,owner=true,origin=process.env.APP_ORIGIN,headers={}}={}){
 const req={url:'/api/revolution?action='+action,method,headers:{...(owner?{cookie:'__Host-el_session='+signSession(process.env.SESSION_SECRET)}:{}),origin,'content-type':'application/json',...headers},body};
 let raw;const responseHeaders={};const res={statusCode:0,setHeader(k,v){responseHeaders[k]=v;},end(v){raw=v;}};
 await handler(req,res);assert.equal(responseHeaders['Cache-Control'],'private, no-store');
 assert.equal(responseHeaders['X-Content-Type-Options'],'nosniff');
 return {status:res.statusCode,json:JSON.parse(raw),raw,headers:responseHeaders};
}
const pairInput=(botId='SYNTHETIC_BOT')=>({botId,account:clone(JOURNAL_TEST_ACCOUNT)});
async function pair(botId){const r=await request('pair',{method:'POST',body:pairInput(botId)});assert.equal(r.status,200,r.raw);return r.json;}
function view(p){return {schemaVersion:1,kind:'th3rev20_readonly',writesAllowed:false,deviceId:p.deviceId,botId:p.botId,account:p.account,slot:String(Math.floor(clock/30000)),capturedAt:new Date(clock).toISOString(),source:{kind:'paired_engine_report',fresh:true,sourceAt:new Date(clock).toISOString(),reason:null,runtimeId:'SYNTHETIC_RUNTIME',nonAtomic:true},counts:{positions:0,orders:0,plans:0,positionCountIsOpenInventory:false},engine:null,positions:[],orders:[],plans:[],truncated:false};}
const receive=(p,v=view(p))=>request('receive',{method:'POST',owner:false,body:JSON.stringify(v),headers:{authorization:'Bearer '+p.token}});
const read=p=>request('snapshot&deviceId='+p.deviceId);
async function local(t){
 const dir=mkdtempSync(join(tmpdir(),'s01-remote-native-')),store=new Store(dir),control=new Control(store,{now:()=>clock}),vault=new Vault(dir,{platform:'linux'});
 const {bot,bridgeToken}=control.createBot({name:'SYNTHETIC_ORIGINAL_ENTRY',profileId:'th3rev.ready20.v1'}),actor=control.authenticate(bridgeToken,'bridge');
 control.heartbeat({botId:bot.id,runtimeId:'synthetic-ready20-runtime',accountId:JOURNAL_TEST_ACCOUNT.id,environment:'demo',manifestId:bot.manifest.id,manifestVersion:'1.0.0',values:bot.desired,actualRevision:0,blocked:true,sequence:1},actor);
 control.engineJournal.accept(journalBatch(bot.id,[journalEvent('plan.recorded',originalPlan(clock),'1',clock),journalEvent('order.reported',orderReport(),'2',clock),journalEvent('engine.status',engineStatus(),'3',clock)]),actor);
 const p=await pair(bot.id);let calls=0;
 const fetchImpl=async(url,options)=>{calls++;assert.equal(url,'https://extremelab-bt.vercel.app/api/revolution?action=receive');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');const r=await request('receive',{method:options.method,owner:false,origin:undefined,body:options.body,headers:options.headers});return new Response(r.raw,{status:r.status,headers:r.headers});};
 const manager=new RemoteView20({control,vault,fetchImpl,now:()=>clock});
 t.after(async()=>{await manager.close();vault.close();store.close();rmSync(dir,{recursive:true,force:true});});
 return {store,control,vault,bot,pair:p,manager,actor,fetchImpl,get calls(){return calls;}};
}
test('production entry uses original owner-session authentication and exact origin before pairing',async()=>{
 for(const opts of [{owner:false},{headers:{cookie:'__Host-el_session=forged'}},{origin:'https://other.invalid'}]){const r=await request('pair',{method:'POST',body:pairInput(),...opts});assert.equal(r.status,opts.origin?403:401);}
 assert.equal(provider().writes,0);const p=await pair();assert.match(p.token,/^[A-Za-z0-9_-]{43}$/);
 const status=await request('status');assert.equal(status.status,200);assert.ok(!status.raw.includes(p.token));assert.ok(!status.raw.includes(provider().record.tokenHash));assert.equal(status.json.writesAllowed,false);
 const write=provider().trace.find(x=>x.op==='blob.put');assert.equal(write.path,'th3rev20/private/view-device-v1.json');assert.deepEqual(write.options,{access:'private',addRandomSuffix:false,contentType:'application/json',cacheControlMaxAge:60,allowOverwrite:false});
});
test('real SQLite journal and producer cross original production API into authenticated viewer JSON',async t=>{
 const f=await local(t);await f.manager.connect(f.pair,HUMAN);await f.manager.tick();assert.equal(f.calls,1);assert.ok(f.manager.status().lastAcknowledgedAt);const r=await read(f.pair);assert.equal(r.status,200,r.raw);
 assert.equal(r.json.snapshot.orders[0].id,'9007199254740993');assert.equal(r.json.snapshot.plans[0].riskCash,originalPlan(clock).riskCash);assert.equal(r.json.snapshot.writesAllowed,false);assert.equal(r.json.snapshot.counts.positionCountIsOpenInventory,false);assert.equal(f.store.get('policy').blocked,true);
 assert.ok(!JSON.stringify({config:f.store.get('remote-view20:configuration'),events:f.store.events(),status:f.manager.status(),snapshot:r.json}).includes(f.pair.token));assert.equal(await f.vault.get('remote-view20-device-token'),f.pair.token);
 for(const x of provider().trace.filter(x=>x.op==='blob.get'))assert.deepEqual(x.options,{access:'private',useCache:false});
});
test('production request and response chain preserves duplicate receipt and rejects conflicting slot',async()=>{
 const p=await pair(),v=view(p);assert.equal((await receive(p,v)).status,200);clock+=5000;
 const again=await receive(p,v);assert.equal(again.json.duplicate,true);const r=await read(p);assert.equal(r.json.receivedAt,new Date(START).toISOString());
 const changed=clone(v);changed.counts.positions=9;assert.equal((await receive(p,changed)).status,409);assert.equal((await read(p)).json.snapshot.counts.positions,0);
});
test('pair registry commit followed by cache failure is an ambiguous failure, not a rollback; explicit revoke recovers',async()=>{
 provider().failSet=()=> 'before';const r=await request('pair',{method:'POST',body:pairInput()});assert.equal(r.status,503);assert.deepEqual(r.json,{error:'REMOTE_SERVICE_UNAVAILABLE',writesAllowed:false});assert.equal(provider().writes,1);assert.ok(provider().record.tokenHash);const abandoned=provider().record.deviceId;
 provider().failSet=null;assert.equal((await request('pair',{method:'POST',body:pairInput()})).status,409);
 const status=await request('status');assert.equal(status.json.device.deviceId,abandoned);assert.ok(!status.raw.includes(provider().record.tokenHash));
 assert.equal((await request('revoke',{method:'POST',body:{deviceId:abandoned}})).status,200);const next=await pair();assert.notEqual(next.deviceId,abandoned);assert.equal(provider().writes,3);
});
test('revoke registry commit followed by cache failure leaves cached auth until explicit refresh',async()=>{
 const p=await pair();assert.equal((await receive(p)).status,200);
 provider().failSet=(_k,v)=>v.record?.revokedAt!==null&&v.record?.revokedAt!==undefined?'before':null;
 const revoked=await request('revoke',{method:'POST',body:{deviceId:p.deviceId}});assert.equal(revoked.status,503);assert.equal(provider().record.revokedAt,START);
 assert.equal((await read(p)).status,200,'characterization: old cached authorization still active');
 provider().failSet=null;assert.equal((await request('status')).json.device.revokedAt,START);assert.equal((await read(p)).status,403);assert.equal((await receive(p)).status,403);
});
test('failed revoke cache update cannot extend cached authorization past original five-minute bound',async()=>{
 const p=await pair();provider().failSet=(_k,v)=>v.record?.revokedAt!=null?'before':null;assert.equal((await request('revoke',{method:'POST',body:{deviceId:p.deviceId}})).status,503);
 clock+=300001;provider().failSet=null;assert.equal((await read(p)).status,403);assert.equal((await receive(p)).status,403);
});
test('actual SDK adapter supplies prior ETag and rejects an intervening write without overwriting',async()=>{
 const p=await pair(),old=clone(provider().record);provider().beforePut=s=>{s.etag++;};const r=await request('revoke',{method:'POST',body:{deviceId:p.deviceId}});
 assert.equal(r.status,503);assert.deepEqual(provider().record,old);assert.equal(provider().writes,1);
 const put=provider().trace.filter(x=>x.op==='blob.put').at(-1);assert.equal(put.options.ifMatch,'1');assert.equal(put.options.allowOverwrite,true);
});
test('registry write rejected before commit preserves original device and exposes no provider error details',async()=>{
 const p=await pair(),old=clone(provider().record);provider().putError=Error('SYNTHETIC_SECRET_BLOB_FAILURE');const r=await request('revoke',{method:'POST',body:{deviceId:p.deviceId}});assert.equal(r.status,503);assert.deepEqual(provider().record,old);assert.ok(!r.raw.includes('SYNTHETIC_SECRET'));assert.equal((await read(p)).status,200);
});
test('registry stream is cancelled at the existing 8192-byte limit',async()=>{
 provider().raw='x'.repeat(10000);provider().chunkSize=1024;const r=await request('status');assert.equal(r.status,503);assert.equal(provider().cancelled,1);assert.equal(provider().writes,0);
});
test('invalid JSON, registry schema, upstream status and missing stream fail closed at original entry',async()=>{
 for(const patch of [{raw:'not json'},{raw:'{"token":"SYNTHETIC_SECRET"}'},{raw:'{}',statusCode:500},{raw:'{}',noStream:true}]){reset();Object.assign(provider(),patch);const r=await request('status');assert.equal(r.status,503);assert.equal(r.json.writesAllowed,false);assert.ok(!r.raw.includes('SYNTHETIC_SECRET'));assert.equal(provider().writes,0);}
});
test('original entry rejects unsupported actions, wrong content type, invalid and oversized bodies',async()=>{
 const cases=[['buy',{method:'POST',body:{}},405],['pair',{method:'POST',body:pairInput(),headers:{'content-type':'text/plain'}},415],['pair',{method:'POST',body:'{'},400],['pair',{method:'POST',body:'x'.repeat(65537)},413]];
 for(const [a,o,n]of cases)assert.equal((await request(a,o)).status,n);assert.equal(provider().writes,0);
});
test('producer token, exact account scope and read-only projection are enforced by original entry',async()=>{
 const p=await pair();assert.equal((await request('receive',{method:'POST',body:view(p)})).status,403,'owner cookie is not producer token');
 assert.equal((await receive({...p,token:'A'.repeat(43)})).status,403);const v=view(p);v.account={...p.account,id:'OTHER'};assert.equal((await receive(p,v)).status,403);
 assert.equal((await receive(p,{...view(p),writesAllowed:true})).status,400);assert.equal((await read(p)).json.snapshot,null);
});
test('tampered cache is not presented as a current viewer snapshot by production entry',async()=>{
 const p=await pair();await receive(p);const entry=[...provider().cache].find(([k])=>k.includes(':snapshot:'));entry[1].value.gzipBase64='eA==';const r=await read(p);assert.equal(r.status,503);assert.equal(r.json.error,'REMOTE_CACHE_INVALID');assert.ok(!Object.hasOwn(r.json,'snapshot'));
});
test('ambiguous snapshot cache commit does not fake producer ACK or retry the same persisted slot',async t=>{
 const f=await local(t);await f.manager.connect(f.pair,HUMAN);provider().failSet=k=>k.includes(':snapshot:')?'after':null;await f.manager.tick();assert.equal(f.manager.status().lastAcknowledgedAt,null);assert.equal(f.manager.status().lastError,'REMOTE_SERVER_UNAVAILABLE');assert.equal((await read(f.pair)).json.available,true,'snapshot exists despite 503');
 await f.manager.close();const next=new RemoteView20({control:f.control,vault:f.vault,fetchImpl:f.fetchImpl,now:()=>clock});
 try{await next.tick();assert.equal(f.calls,1,'new producer instance reads persisted slot instead of retrying');provider().failSet=null;clock+=30000;await next.tick();assert.equal(f.calls,2);assert.ok(next.status().lastAcknowledgedAt);assert.equal((await read(f.pair)).json.snapshot.source.fresh,false,'new delivery does not refresh old journal source');assert.equal(f.store.get('policy').blocked,true);}finally{await next.close();}
});
