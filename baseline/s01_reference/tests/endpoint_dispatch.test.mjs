/** Original production handler tests, NOT native WebSocket or provider integration.
 * Transport events, remote cache/blob and missing relay are explicit test doubles.
 * security.mjs, storage.mjs, socket.js, probe.js and live.js run unchanged in vm.
 * No server listens; no connection or broker operation is performed.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import * as crypto from 'node:crypto';
import * as zlib from 'node:zlib';
import * as http from 'node:http';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'baseline/vercel_recovered/src');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'vendor-manifests/S01_VERIFIED_RECOVERED_PRODUCTION_SOURCES.json')));
const pinned=new Map(manifest.sources.filter(x=>x.status==='byte_recovered').map(x=>[x.path.slice(4),x]));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const clean=x=>JSON.parse(JSON.stringify(x));
const event={schema:2,run:'synthetic-offline-only',seq:1,utc:'2026-11-12T00:00:00Z',kind:'STATUS',data:{equity:100}};
function response(){return {headers:{},statusCode:200,body:null,setHeader(k,v){this.headers[k.toLowerCase()]=v;},writeHead(n,h){this.statusCode=n;for(const [k,v]of Object.entries(h))this.setHeader(k,v);},end(b){this.body=Buffer.from(b);}};}
async function harness(entry){
 const env={SESSION_SECRET:'synthetic-only-session-secret-'.repeat(3),APP_ORIGIN:'https://offline.invalid',PRODUCER_KEY_SHA256:crypto.createHash('sha256').update('synthetic-producer-key').digest('hex')};
 const cache=new Map(),hooks={},allSockets=[],wsServers=[],timers=new Set(),modules=new Map();
 let blobCalls=0,relayCalls=[];
 class Socket extends EventEmitter{
  constructor(){super();this.readyState=1;this.bufferedAmount=0;this.sent=[];this.closed=null;allSockets.push(this);}
  send(s,cb){this.sent.push(JSON.parse(s));if(cb)cb();}
  close(code,reason){if(this.closed)return;this.closed={code,reason};this.readyState=3;this.emit('close');}
  terminate(){this.close(1006,'test termination');}
  async message(value,binary=false){const raw=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value));await Promise.all(this.listeners('message').map(f=>f(raw,binary)));}
 }
 class WSS extends EventEmitter{
  constructor(options){super();this.options=options;this.clients=new Set();this.last=null;wsServers.push(this);}
  handleUpgrade(req,socket,head,cb){const s=new Socket();this.last=s;this.clients.add(s);s.on('close',()=>this.clients.delete(s));cb(s);}
 }
 const cacheAdapter={
  async get(k){if(hooks.get)await hooks.get(k);return cache.has(k)?structuredClone(cache.get(k)):null;},
  async set(k,v,options){if(hooks.set)await hooks.set(k,v,options);cache.set(k,structuredClone(v));},
  async delete(k){cache.delete(k);}
 };
 const context=vm.createContext({Buffer,URL,Response,Date,console,
  process:{env},
  setTimeout(fn,ms){const t=setTimeout(fn,ms);timers.add(t);return t;},
  clearTimeout(t){clearTimeout(t);timers.delete(t);}
 });
 const external={
  'node:crypto':crypto,'node:zlib':zlib,'node:http':http,
  'ws':{WebSocketServer:WSS},
  '@vercel/functions':{getCache:()=>cacheAdapter},
  '@vercel/blob':Object.fromEntries(['put','get','list','del'].map(k=>[k,async()=>{blobCalls++;throw Error('EXTERNAL_BLOB_DISABLED');}]))
 };
 function synthetic(id,exports){const m=new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v);},{identifier:id,context});modules.set(id,m);return m;}
 function moduleAt(id){
  if(modules.has(id))return modules.get(id);
  if(external[id])return synthetic(id,external[id]);
  if(id===path.join(source,'lib/relay.mjs')){
   assert(!fs.existsSync(id),'Test contract must change once the real relay is recovered');
   return synthetic(id,{relayRequest:async(action,params)=>{relayCalls.push({action,params:new URLSearchParams(params)});return hooks.relay?await hooks.relay(action,params):{events:[],synthetic:true};}});
  }
  const rel=path.relative(source,id).replaceAll(path.sep,'/');
  assert(!rel.startsWith('..')&&pinned.has(rel),'Unexpected source import '+rel);
  const bytes=fs.readFileSync(id),pin=pinned.get(rel);assert.equal(hash(bytes),pin.sha256,'Original source bytes changed: '+rel);
  const m=new vm.SourceTextModule(bytes.toString(),{context,identifier:id});modules.set(id,m);return m;
 }
 const m=moduleAt(path.join(source,entry));
 await m.link((spec,ref)=>moduleAt(spec.startsWith('.')?path.resolve(path.dirname(ref.identifier),spec):spec));
 await m.evaluate();
 const server=m.namespace.default;
 const security=modules.get(path.join(source,'lib/security.mjs'))?.namespace;
 function connect(headers={},url='/api/socket'){
  const transport={written:'',destroyed:false,write(s){this.written+=s;},destroy(){this.destroyed=true;}};
  wsServers[0].last=null;server.emit('upgrade',{headers,url},transport,Buffer.alloc(0));
  return {transport,socket:wsServers[0].last};
 }
 function viewer(){return connect({cookie:'__Host-el_session='+security.signSession(env.SESSION_SECRET),origin:env.APP_ORIGIN});}
 async function producer(){const{socket}=connect();await socket.message({type:'auth',key:'synthetic-producer-key'});return socket;}
 return {server,security,env,cache,hooks,wsServers,relayCalls,connect,viewer,producer,get blobCalls(){return blobCalls;},cleanup(){for(const s of allSockets)s.close(1000,'cleanup');for(const t of timers)clearTimeout(t);server?.close?.();}};
}
function withHarness(name,entry,fn){test(name,async()=>{const h=await harness(entry);try{await fn(h);}finally{h.cleanup();}});}

withHarness('socket: plain HTTP requires an upgrade','api/socket.js',async h=>{const r=response();h.server.emit('request',{headers:{}},r);assert.equal(r.statusCode,426);assert.equal(JSON.parse(r.body).error,'WebSocket upgrade required');});
withHarness('socket: cross-origin or invalid browser cookie is rejected before transport admission','api/socket.js',async h=>{
 for(const headers of [{origin:'https://other.invalid'},{origin:h.env.APP_ORIGIN,cookie:'__Host-el_session=invalid'}]){
  const c=h.connect(headers);assert.equal(c.socket,null);assert(c.transport.destroyed);assert.match(c.transport.written,/403 Forbidden/);
 }
});
withHarness('socket: signed viewer reads synthetic snapshot but cannot publish or trade','api/socket.js',async h=>{
 h.cache.set('extremelab:latest:ctrader-reported',{synthetic:true,events:[event]});
 const {socket:s}=h.viewer();assert.equal(s.sent[0].authenticated,true);assert.equal(s.sent[0].readOnly,true);
 await s.message({type:'snapshot'});assert.equal(s.sent.at(-1).snapshot.synthetic,true);
 for(const type of ['publish','trade','order','auth']){await s.message({type,payload:{events:[event]},source:'ctrader-reported'});assert.equal(s.sent.at(-1).code,'READ_ONLY_OR_UNKNOWN');}
 assert.equal(h.cache.size,1);assert.equal(h.blobCalls,0);
});
withHarness('socket: unauthenticated and wrong-key clients cannot read or write','api/socket.js',async h=>{
 for(const msg of [{type:'snapshot'},{type:'auth',key:'wrong'}, {type:'publish',source:'ctrader-reported',payload:{events:[event]}}]){
  const{socket:s}=h.connect();await s.message(msg);assert.equal(s.closed.code,4401);
 }
 assert.equal(h.cache.size,0);
});
withHarness('socket: synthetic producer publishes validated non-durable cache then is rate-limited','api/socket.js',async h=>{
 const s=await h.producer();assert.equal(s.sent.at(-1).type,'authenticated');
 await s.message({type:'publish',source:'transport-test',payload:{events:[event,event]}});
 assert.equal(s.sent.at(-1).type,'ack');assert.equal(s.sent.at(-1).durable,false);assert.equal(s.sent.at(-1).cached,true);
 const value=h.cache.get('extremelab:latest:transport-test');assert.equal(value.events.length,1);assert.equal(value.duplicates,1);assert.equal(value.source,'transport-test');
 await s.message({type:'publish',source:'transport-test',payload:{events:[event]}});assert.equal(s.sent.at(-1).code,'RATE_LIMIT');assert.equal(h.blobCalls,0);
});
withHarness('socket: invalid events, conflicting sequence and invalid source never reach cache','api/socket.js',async h=>{
 const s=await h.producer();
 for(const [payload,sourceName]of [[{events:[]},'transport-test'],[{events:[event,{...event,data:{equity:1}}]},'transport-test'],[{events:[event]},'invented-source']]){
  await s.message({type:'publish',payload,source:sourceName});assert.equal(s.sent.at(-1).code,'INVALID_OR_STORAGE_UNAVAILABLE');assert.equal(h.cache.size,0);
 }
});
withHarness('socket: busy flag and finally reset use genuine async storage path','api/socket.js',async h=>{
 let release;h.hooks.set=()=>new Promise(resolve=>{release=resolve;});const s=await h.producer();
 const pending=s.message({type:'publish',source:'transport-test',payload:{events:[event]}});
 await s.message({type:'ping'});assert.equal(s.sent.at(-1).code,'BUSY');release();await pending;
 await s.message({type:'ping',nonce:'a'.repeat(90)});assert.equal(s.sent.at(-1).type,'pong');assert.equal(s.sent.at(-1).nonce.length,64);
});
withHarness('socket: malformed JSON does not strand busy state; producer has no viewer read right','api/socket.js',async h=>{
 const s=await h.producer();await s.message(Buffer.from('{'));assert.equal(s.sent.at(-1).code,'INVALID_OR_STORAGE_UNAVAILABLE');
 await s.message({type:'snapshot'});assert.equal(s.sent.at(-1).code,'READ_ONLY_OR_UNKNOWN');
 await s.message({type:'ping'});assert.equal(s.sent.at(-1).type,'pong');
});
withHarness('probe: public response exposes diagnostics only','api/probe.js',async h=>{
 const r=response();h.server.emit('request',{headers:{}},r);assert.equal(r.statusCode,200);
 assert.deepEqual(JSON.parse(r.body),{service:'ExtremeLabProbe',version:'1.3.2',diagnosticOnly:true,storesPayload:false,trading:false});
 assert.equal(r.headers['cache-control'],'no-store');
});
withHarness('probe: wrong path, query and client cap reject upgrade','api/probe.js',async h=>{
 for(const url of ['/api/socket','/api/probe?unexpected=1']){const c=h.connect({},url);assert.equal(c.socket,null);assert(c.transport.destroyed);assert.match(c.transport.written,/400 Bad Request/);}
 h.wsServers[0].clients=new Set(Array.from({length:8},(_,i)=>i));const c=h.connect({},'/api/probe');assert.equal(c.socket,null);assert(c.transport.destroyed);
});
withHarness('probe: valid nonce produces one acknowledgement and closes','api/probe.js',async h=>{
 const{socket:s}=h.connect({},'/api/probe');assert.equal(s.sent[0].type,'probe_hello');
 await s.message({type:'probe',nonce:'ab'.repeat(16)});assert.equal(s.sent.length,2);assert.equal(s.sent[1].nonce,'ab'.repeat(16));assert.equal(s.sent[1].diagnosticOnly,true);assert.equal(s.closed.code,1000);
});
withHarness('probe: invalid JSON, binary, extra keys and trading commands are rejected','api/probe.js',async h=>{
 for(const[value,binary]of [[Buffer.from('{'),false],[{type:'probe',nonce:'a'.repeat(32)},true],[{type:'probe',nonce:'a'.repeat(32),account:1},false],[{type:'order'},false],[{type:'probe',nonce:'wrong'},false]]){
  const{socket:s}=h.connect({},'/api/probe');await s.message(value,binary);assert.equal(s.closed.code,1008);assert.equal(s.sent.length,1);
 }
});
withHarness('live: method and authentication reject before missing-relay stub is consulted','api/live.js',async h=>{
 for(const [method,expected]of [['POST',405],['GET',401]]){const r=response();await h.server({method,url:'/api/live',headers:{}},r);assert.equal(r.statusCode,expected);}
 assert.equal(h.relayCalls.length,0);
});
withHarness('live: signed request forwards action and compresses only large responses','api/live.js',async h=>{
 h.hooks.relay=()=>({payload:'synthetic'.repeat(1000)});
 const r=response();await h.server({method:'GET',url:'/api/live?action=events&after=2',headers:{cookie:'__Host-el_session='+h.security.signSession(h.env.SESSION_SECRET),'accept-encoding':'gzip'}},r);
 assert.equal(r.statusCode,200);assert.equal(r.headers['content-encoding'],'gzip');assert.equal(r.headers.vary,'Accept-Encoding');
 assert.equal(JSON.parse(zlib.gunzipSync(r.body)).payload.length,9000);assert.equal(+r.headers['content-length'],r.body.length);
 assert.equal(h.relayCalls[0].action,'events');assert.equal(h.relayCalls[0].params.get('after'),'2');
});
withHarness('live: upstream errors redact sensitive messages and retain read-only response headers','api/live.js',async h=>{
 const req={method:'GET',url:'/api/live',headers:{cookie:'__Host-el_session='+h.security.signSession(h.env.SESSION_SECRET)}};
 h.hooks.relay=()=>{throw Error('synthetic-secret-not-for-response');};const r=response();await h.server(req,r);
 assert.equal(r.statusCode,503);assert(!r.body.toString().includes('synthetic-secret'));assert.equal(r.headers['cache-control'],'private, no-store');assert.equal(r.headers['x-content-type-options'],'nosniff');
 h.hooks.relay=()=>{throw Object.assign(Error('RELAY_UNAVAILABLE'),{status:503});};const r2=response();await h.server(req,r2);assert.equal(JSON.parse(r2.body).code,'RELAY_UNAVAILABLE');
});
// Characterization of a REAL remaining compatibility gap, not a conformance pass.
withHarness('KNOWN GAP: live compresses gzip even when the client excludes it with q=0','api/live.js',async h=>{
 h.hooks.relay=()=>({payload:'synthetic'.repeat(1000)});const r=response();
 await h.server({method:'GET',url:'/api/live',headers:{cookie:'__Host-el_session='+h.security.signSession(h.env.SESSION_SECRET),'accept-encoding':'gzip;q=0, identity;q=1'}},r);
 assert.equal(r.statusCode,200);assert.equal(r.headers['content-encoding'],'gzip','Original behavior changed; re-evaluate the documented gap');
 assert.equal(JSON.parse(zlib.gunzipSync(r.body)).payload.length,9000);
});
