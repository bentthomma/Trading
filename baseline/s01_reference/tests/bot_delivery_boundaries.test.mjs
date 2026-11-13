// Exercise unchanged production bytes in a disposable stage. Never execute .algo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const stage=process.env.EXTREMELAB_DELIVERY_STAGE;
const moduleUrl=pathToFileURL(path.join(stage,'api/bot-download.mjs'));
const {signSession}=await import(pathToFileURL(path.join(stage,'lib/security.mjs')));
const filename='ExtremeLabReady_1_2_1_Kandidat.algo';
const sha=b=>createHash('sha256').update(b).digest('hex');
let serial=0;
async function fresh(){return (await import(moduleUrl+'?boundary='+serial++)).default;}
function invoke(h,req){const r={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(x){this.body=x;return this;},end(x){this.body=x;return this;}};h(req,r);return r;}
async function fixture(fn){
 const cwd=process.cwd(),old=process.env.SESSION_SECRET,temp=fs.mkdtempSync(path.join(os.tmpdir(),'el-download-boundary-'));
 process.chdir(temp);process.env.SESSION_SECRET=randomBytes(48).toString('hex');
 const token=signSession(process.env.SESSION_SECRET),dir=path.join(temp,'release-artifacts');fs.mkdirSync(dir);
 const bytes=Buffer.from('SYNTHETIC_BYTES_NOT_A_NATIVE_BOT');
 const meta={filename,bytes:bytes.length,sha256:sha(bytes)};
 const write=(m=meta,b=bytes)=>{fs.writeFileSync(path.join(dir,filename),b);fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(m));};
 const req=(url='/api/bot-download',extra={})=>({url,method:'GET',headers:{cookie:'__Host-el_session='+token},...extra});
 write();try{await fn({dir,bytes,meta,write,req,token});}finally{process.chdir(cwd);if(old===undefined)delete process.env.SESSION_SECRET;else process.env.SESSION_SECRET=old;fs.rmSync(temp,{recursive:true,force:true});}
}
test('warm artifact cache does not bypass missing owner secret',async()=>fixture(async({req})=>{
 const h=await fresh();assert.equal(invoke(h,req()).statusCode,200);delete process.env.SESSION_SECRET;
 assert.equal(invoke(h,req()).statusCode,401);
}));
test('bearer or producer-style credentials cannot replace owner session',async()=>fixture(async({req,token})=>{
 const h=await fresh();
 for(const headers of [{authorization:'Bearer '+token},{'x-api-key':token},{cookie:'producer='+token}])assert.equal(invoke(h,req('/api/bot-download',{headers})).statusCode,401);
 assert.equal(invoke(h,req('/api/bot-download?token='+token,{headers:{}})).statusCode,400);
}));
test('cold module rejects inconsistent filename size checksum and JSON',async()=>fixture(async({req,meta,write,dir})=>{
 for(const bad of [{...meta,filename:'other.algo'},{...meta,bytes:meta.bytes+1},{...meta,sha256:'0'.repeat(64)}]){
  write(bad);const r=invoke(await fresh(),req());assert.equal(r.statusCode,503);assert.deepEqual(r.body,{error:'BUILD_ARTIFACT_UNAVAILABLE'});
 }
 fs.writeFileSync(path.join(dir,'manifest.json'),'{broken');assert.equal(invoke(await fresh(),req()).statusCode,503);
}));
test('loaded module pins verified bytes; fresh module detects disk corruption',async()=>fixture(async({req,bytes,dir})=>{
 const h=await fresh();assert.deepEqual(invoke(h,req()).body,bytes);
 fs.writeFileSync(path.join(dir,filename),'changed after verified first load');
 const cached=invoke(h,req());assert.equal(cached.statusCode,200);assert.deepEqual(cached.body,bytes);assert.equal(cached.headers['X-Artifact-SHA256'],sha(bytes));
 assert.equal(invoke(await fresh(),req()).statusCode,503);
}));
test('consistent metadata is not a source or build attestation - known boundary',async()=>fixture(async({req,meta,write})=>{
 const arbitrary={...meta,sourceSha256:'0'.repeat(64),buildSucceeded:true,cloudRuntimeVerified:true,classification:'SYNTHETIC_TEST_CLAIM_NOT_REAL_RELEASE'};
 write(arbitrary);const h=await fresh();const r=invoke(h,req('/api/bot-download?action=manifest',{headers:{}}));
 assert.equal(r.statusCode,200);assert.deepEqual(r.body,arbitrary);assert.equal(invoke(h,req()).statusCode,200);
 // This passes by proving the handler does NOT independently authenticate these
 // claims. It is not approval, no output is loaded as a bot, no source fix made.
}));
test('failed cold load is not cached; repaired files can be retried in same module',async()=>fixture(async({req,dir,write,bytes})=>{
 fs.writeFileSync(path.join(dir,filename),'bad');const h=await fresh();assert.equal(invoke(h,req()).statusCode,503);
 write();const r=invoke(h,req());assert.equal(r.statusCode,200);assert.deepEqual(r.body,bytes);
}));
