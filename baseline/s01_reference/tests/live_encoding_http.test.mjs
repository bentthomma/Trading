/** Actual Node HTTP client/server over AF_UNIX; original security and real gzip.
 * Only the unavailable relay is synthetic. No IP sockets, login or broker calls.
 * XL_ENCODING_TARGET=original is the deliberate pre-fix countercheck.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import * as crypto from 'node:crypto';
import * as zlib from 'node:zlib';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const proposal=JSON.parse(fs.readFileSync(path.join(ROOT,'proposals/live-encoding/proposal.json')));
const binding=proposal.files[0];
const target=process.env.XL_ENCODING_TARGET??'candidate';
assert(['candidate','original'].includes(target));
const entry=path.join(ROOT,target==='candidate'?binding.candidate:binding.original);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(sha(fs.readFileSync(entry)),target==='candidate'?binding.candidate_sha256:binding.original_sha256);
const securityFile=path.join(ROOT,'baseline/vercel_recovered/src/lib/security.mjs');
const inventory=JSON.parse(fs.readFileSync(path.join(ROOT,'vendor-manifests/S01_VERIFIED_RECOVERED_PRODUCTION_SOURCES.json')));
assert.equal(sha(fs.readFileSync(securityFile)),inventory.sources.find(s=>s.path==='src/lib/security.mjs').sha256);
const large={run:'synthetic-offline-only',orderId:'18446744073709551615',payload:'ä😀synthetic'.repeat(900)};
async function fixture(t,{data=large,seedVary,relayError}={}){
 const env={SESSION_SECRET:'synthetic-only-no-account-'.repeat(4),APP_ORIGIN:'https://offline.invalid'};
 const context=vm.createContext({Buffer,URL,console,process:{env}}),modules=new Map(),calls=[];
 const external={'node:crypto':crypto,'node:zlib':zlib};
 function synthetic(id,values){const m=new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context,identifier:id});modules.set(id,m);return m;}
 const security=new vm.SourceTextModule(fs.readFileSync(securityFile,'utf8'),{context,identifier:securityFile});modules.set('security',security);
 const relay=synthetic('relay',{relayRequest:async(action,params)=>{calls.push({action,params:[...params]});if(relayError)throw relayError;return structuredClone(data);}});
 const live=new vm.SourceTextModule(fs.readFileSync(entry,'utf8'),{context,identifier:entry});
 await live.link((name)=>{
  if(name==='../lib/security.mjs')return security;
  if(name==='../lib/relay.mjs')return relay;
  if(!external[name])throw Error('Unexpected module '+name);
  return modules.get(name)??synthetic(name,external[name]);
 });
 await live.evaluate();
 const failures=[];
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'xl-http-')),socketPath=path.join(dir,'s');
 const server=http.createServer((req,res)=>{
  if(seedVary!==undefined)res.setHeader('Vary',seedVary);
  Promise.resolve(live.namespace.default(req,res)).catch(e=>{failures.push(e);res.destroy(e);});
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socketPath,resolve);});
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});assert.deepEqual(failures,[]);});
 const cookie='__Host-el_session='+security.namespace.signSession(env.SESSION_SECRET);
 async function request({encoding,headers={},auth=true,method='GET',url='/api/live?action=events&after=2'}={}){
  const h={...headers};if(auth)h.cookie=cookie;if(encoding!==undefined)h['Accept-Encoding']=encoding;
  return new Promise((resolve,reject)=>{
   const req=http.request({socketPath,path:url,method,headers:h,agent:false},res=>{
    const chunks=[];res.on('data',c=>chunks.push(c));res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,raw:Buffer.concat(chunks)}));
   });req.setTimeout(5000,()=>req.destroy(Error('LOCAL_HTTP_TIMEOUT')));req.on('error',reject);req.end();
  });
 }
 return {request,calls,expected:Buffer.from(JSON.stringify(data))};
}
function bytes(r){return r.headers['content-encoding']==='gzip'?zlib.gunzipSync(r.raw):r.raw;}
function validEntity(r,expected,coding,status=200){
 assert.equal(r.status,status);assert.equal(r.headers['content-encoding'],coding);assert.equal(Number(r.headers['content-length']),r.raw.length);
 assert.deepEqual(bytes(r),expected);assert.equal(r.headers['cache-control'],'private, no-store');assert.equal(r.headers['x-content-type-options'],'nosniff');
 assert.equal(r.headers['x-robots-tag'],'noindex, nofollow');assert.match(r.headers['content-type'],/^application\/json; charset=utf-8$/);
}
function noEntity(r,status){assert.equal(r.status,status);assert.equal(r.raw.length,0);assert.equal(r.headers['content-length'],'0');assert.equal(r.headers['content-encoding'],undefined);}
function varying(r){assert(r.headers.vary?.split(',').some(x=>x.trim().toLowerCase()==='accept-encoding'));}

test('explicit gzip q=0 is respected end-to-end without changing JSON bytes',async t=>{
 const f=await fixture(t);const r=await f.request({encoding:'gzip;q=0, identity;q=1'});
 validEntity(r,f.expected,undefined);varying(r);assert.equal(f.calls.length,1);
});
test('gzip-positive response is real decodable gzip with byte-correct Content-Length',async t=>{
 const f=await fixture(t);const r=await f.request({encoding:'gzip'});
 validEntity(r,f.expected,'gzip');assert(r.raw.length<f.expected.length);varying(r);assert.deepEqual(f.calls,[{action:'events',params:[['action','events'],['after','2']]}]);
});
test('missing, empty or unsupported encoding falls back to identity',async t=>{
 const f=await fixture(t);for(const encoding of [undefined,'','br','deflate','br;q=1, deflate;q=0.5',', ,']){
  const r=await f.request({encoding});validEntity(r,f.expected,undefined);varying(r);
 }
});
test('exact coding tokens, case-insensitivity and x-gzip alias',async t=>{
 const f=await fixture(t);for(const [encoding,coding]of [['GZIP','gzip'],['gZiP;Q=1.000','gzip'],['x-gzip','gzip'],['not-gzip',undefined],['gzip2',undefined],['gzip.foo',undefined]])
  validEntity(await f.request({encoding}),f.expected,coding);
});
test('explicit quality preferences and wildcard exclusions determine actual response encoding',async t=>{
 const f=await fixture(t);for(const [encoding,coding]of [
  ['gzip;q=0.2, identity;q=0.8',undefined],['gzip;q=0.8, identity;q=0.2','gzip'],
  ['*','gzip'],['*;q=0.5',undefined],['gzip;q=0, *;q=1',undefined],
  ['gzip;q=1, *;q=0','gzip'],['identity;q=1, *;q=0',undefined],['gzip;q=0.001, identity;q=0','gzip'],
  ['gzip;q=0., identity;q=1.',undefined],['gzip;Q=1., identity;q=0.','gzip']])
  validEntity(await f.request({encoding}),f.expected,coding);
});
test('no supported acceptable representation returns bodyless 406 before relay access',async t=>{
 const f=await fixture(t);for(const encoding of ['gzip;q=0, identity;q=0','*;q=0','br, identity;q=0','identity;q=0','gzip;q=0,*;q=0']){
  const r=await f.request({encoding});noEntity(r,406);varying(r);
 }assert.equal(f.calls.length,0);
});
test('malformed weights and invalid syntax fail closed with bodyless 400 before relay',async t=>{
 const f=await fixture(t);for(const encoding of ['gzip;q=.5','gzip;q=2','gzip;q=-1','gzip;q=NaN','gzip;q=0.0001','gzip;q=1.001','gzip;q="0"','gzip;q=0;q=1','gzip;foo=bar','gzip q=0','gzip;q =0']){
  const r=await f.request({encoding});noEntity(r,400);varying(r);
 }assert.equal(f.calls.length,0);
});
test('duplicate field lines use the most restrictive coding weight',async t=>{
 const f=await fixture(t);for(const encoding of [ ['gzip;q=1','gzip;q=0'],['gzip;q=0','gzip;q=1'],'x-gzip;q=0, gzip;q=1','gzip;q=0, x-gzip;q=1'])
  validEntity(await f.request({encoding}),f.expected,undefined);
 const r=await f.request({encoding:['identity;q=0','gzip;q=0','*;q=1']});noEntity(r,406);
});
test('OWS and harmless empty list elements do not change explicit exclusions',async t=>{
 const f=await fixture(t);for(const encoding of [' , gzip ; q=0 , identity ; q=1 , ','gzip\t;\tQ=0,identity;q=1',',gzip;q=0,,,'])
  validEntity(await f.request({encoding}),f.expected,undefined);
});
test('gzip-only clients receive compressed small payloads rather than forbidden identity',async t=>{
 const f=await fixture(t,{data:{ok:true}});validEntity(await f.request({encoding:'gzip,identity;q=0'}),f.expected,'gzip');
 validEntity(await f.request({encoding:'gzip;q=1,identity;q=0.5'}),f.expected,'gzip');
 validEntity(await f.request({encoding:'gzip'}),f.expected,undefined);
});
test('4096-byte threshold uses UTF-8 entity bytes and only resolves equal preferences',async t=>{
 for(const n of [4088,4089]){const data={x:'a'.repeat(n)},f=await fixture(t,{data});assert.equal(f.expected.length,n+8);
  validEntity(await f.request({encoding:'gzip'}),f.expected,n===4088?undefined:'gzip');}
 const f=await fixture(t,{data:{x:'€'.repeat(1400)}});assert(f.expected.length>4096);
 validEntity(await f.request({encoding:'gzip'}),f.expected,'gzip');
});
test('Vary retains existing fields and avoids duplicate Accept-Encoding',async t=>{
 for(const seedVary of ['Origin, Accept-Language',['Origin','Accept-Language'],'origin, accept-encoding']){
  const f=await fixture(t,{seedVary});for(const encoding of ['gzip','identity']){const r=await f.request({encoding});varying(r);assert.match(r.headers.vary,/origin/i);
   assert.equal(r.headers.vary.toLowerCase().split(',').filter(s=>s.trim()==='accept-encoding').length,1);}}
});
test('Vary wildcard is retained without replacing its meaning',async t=>{
 const f=await fixture(t,{seedVary:'*'});for(const encoding of ['gzip','identity'])assert.equal((await f.request({encoding})).headers.vary,'*');
});
test('authentication and method denial retain status and never invoke relay',async t=>{
 const f=await fixture(t);for(const opts of [{auth:false},{auth:false,encoding:'*;q=0'},{auth:false,encoding:'gzip;q=bad'}]){
  const r=await f.request(opts);assert.equal(r.status,401);varying(r);if(opts.encoding)noEntity(r,401);
 }
 for(const encoding of ['gzip', '*;q=0','gzip;q=bad']){const r=await f.request({method:'POST',encoding});assert.equal(r.status,405);varying(r);}
 assert.equal(f.calls.length,0);
});
test('upstream error remains redacted with gzip-only clients and correct framing',async t=>{
 const f=await fixture(t,{relayError:Error('synthetic-private-value')});const r=await f.request({encoding:'gzip,identity;q=0'});
 assert.equal(r.status,503);assert.equal(r.headers['content-encoding'],'gzip');assert.equal(+r.headers['content-length'],r.raw.length);
 const text=bytes(r).toString();assert(!text.includes('synthetic-private-value'));assert.match(text,/Live-Verbindung nicht erreichbar/);varying(r);
});
test('known upstream validation error retains code and status under identity preference',async t=>{
 const f=await fixture(t,{relayError:Object.assign(Error('SYNTHETIC_BAD_ACTION'),{status:400})});const r=await f.request({encoding:'gzip;q=0'});
 assert.equal(r.status,400);assert.equal(r.headers['content-encoding'],undefined);assert.equal(JSON.parse(r.raw).error,'SYNTHETIC_BAD_ACTION');varying(r);
});
test('parallel and repeated requests cannot leak a previous encoding decision',async t=>{
 const f=await fixture(t);const encodings=['gzip','gzip;q=0','GZIP','identity','gzip','gzip;q=0','br','*','gzip,identity;q=0'];
 const replies=await Promise.all(encodings.map(encoding=>f.request({encoding})));
 const expected=['gzip',undefined,'gzip',undefined,'gzip',undefined,undefined,'gzip','gzip'];
 replies.forEach((r,i)=>validEntity(r,f.expected,expected[i]));assert.equal(f.calls.length,encodings.length);
});
test('quality grid preserves RFC exclusions across actual HTTP responses',async t=>{
 const f=await fixture(t);const qs=[0,0.001,0.5,1];
 for(const g of qs)for(const i of qs){const r=await f.request({encoding:`gzip;q=${g}, identity;q=${i}`});
  if(g===0&&i===0)noEntity(r,406);else validEntity(r,f.expected,g>0&&g>=i?'gzip':undefined);}
});
