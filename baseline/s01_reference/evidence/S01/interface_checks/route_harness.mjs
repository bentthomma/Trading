/** Transport-only adaptation: real server.mjs and real HTTP parser over AF_UNIX.
 * No IP transport, broker connection, provider setup or trading process.
 * address().port supplies the original Host/Origin contract with a fixed test port.
 */
import http from 'node:http';
import net from 'node:net';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root=process.env.S01_INTERFACE_PLATFORM;
assert.ok(root,'original platform path required');
export const load=rel=>import(pathToFileURL(join(root,rel)));
const {createLocalServer}=await load('server.mjs');
export async function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'s01-if-')),socket=join(dir,'http.sock');
 let app,cookie,wireCount=0;const forbidden=[];
 const deny=name=>(..._args)=>{forbidden.push(name);throw Error('UNEXPECTED_EXTERNAL_ADAPTER_'+name);};
 const dependencies=Object.fromEntries(['probeBroker','readBroker','readBrokerChart','testProvider','chatProvider','remoteViewFetch','launchBrowser'].map(k=>[k,deny(k)]));
 async function start(){
  const listen=net.Server.prototype.listen;
  try{
   net.Server.prototype.listen=function(...args){
    assert.equal(args[1],'127.0.0.1');
    const nativeAddress=this.address.bind(this);
    this.address=()=>typeof nativeAddress()==='string'?{address:'127.0.0.1',port:47631,family:'IPv4'}:nativeAddress();
    return listen.call(this,{path:socket},args.at(-1));
   };
   app=await createLocalServer({dataDir:join(dir,'data'),port:0,openBrowser:false,dependencies});
  }finally{net.Server.prototype.listen=listen;}
  const r=await request('/api/session',{token:app.startUrl.split('#access=')[1]},{anonymous:true});
  assert.equal(r.status,200,JSON.stringify(r.data));cookie=r.headers['set-cookie'][0].split(';')[0];
 }
 async function request(path,body,{token,anonymous=false,headers={},method=body===undefined?'GET':'POST'}={}){
  wireCount++;
  const raw=body===undefined?undefined:JSON.stringify(body);
  return await new Promise((resolve,reject)=>{
   const req=http.request({socketPath:socket,path,method,agent:false,headers:{host:new URL(app.origin).host,...(!anonymous&&cookie?{cookie}:{}),...(token?{authorization:'Bearer '+token}:{}),...(raw===undefined?{}:{origin:app.origin,'content-type':'application/json','x-local-request':'1','content-length':Buffer.byteLength(raw)}),...headers}},res=>{
    const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{const text=Buffer.concat(chunks).toString();try{resolve({status:res.statusCode,headers:res.headers,data:text?JSON.parse(text):null});}catch(e){reject(e);}});res.on('error',reject);
   });req.on('error',reject);req.setTimeout(5000,()=>req.destroy(Error('TEST_REQUEST_TIMEOUT')));req.end(raw);
  });
 }
 await start();
 t.after(async()=>{try{await app.close();assert.deepEqual(forbidden,[],'no broker/provider/browser adapter invoked');}finally{rmSync(dir,{recursive:true,force:true});}});
 return {get app(){return app;},dir,request,get wireCount(){return wireCount;},async restart(){await app.close();await start();}};
}
