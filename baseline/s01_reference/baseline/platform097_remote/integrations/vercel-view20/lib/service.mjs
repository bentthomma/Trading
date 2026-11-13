import {randomBytes,randomUUID,createHash,timingSafeEqual} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {REMOTE20_ORIGIN,REMOTE20_PATH,REMOTE20_INTERVAL,REMOTE20_MAX_PLAIN,validateRemoteAccount20,validateRemoteProjection20,sameAccount20} from './projection.mjs';
const DAY=86400000,AUTH_TTL=300000,CACHE_BYTES=8192;
const sha=x=>createHash('sha256').update(x).digest('hex');
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
function fail(code,status=400){const e=Error(code);e.code=code;e.status=status;throw e;}
function constant(a,b){return typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
function publicDevice(r){return r?{deviceId:r.deviceId,botId:r.botId,account:r.account,issuedAt:r.issuedAt,expiresAt:r.expiresAt,revokedAt:r.revokedAt,revocationMaximumSeconds:300,intervalMilliseconds:REMOTE20_INTERVAL}:null;}
function validateRecord(r){if(!exact(r,['schemaVersion','deviceId','botId','account','tokenHash','issuedAt','expiresAt','revokedAt'])||r.schemaVersion!==1||! /^[a-f0-9]{64}$/.test(r.tokenHash||'')||! /^[A-Za-z0-9_-]{1,100}$/.test(r.deviceId||'')||! /^[A-Za-z0-9_-]{1,100}$/.test(r.botId||'')||!Number.isSafeInteger(r.issuedAt)||!Number.isSafeInteger(r.expiresAt)||r.expiresAt<=r.issuedAt||r.expiresAt-r.issuedAt>31*DAY||r.revokedAt!==null&&!Number.isSafeInteger(r.revokedAt))fail('REMOTE_REGISTRY_INVALID',503);validateRemoteAccount20(r.account);return r;}
// Cache holds ONLY an expendable view. The local journal is authoritative.
// Slot keys are time-derived, so late delivery cannot move a latest pointer
// backward. There is deliberately no remote trading or local command channel.
// RuntimeCache has no compare-and-swap. Sequential duplicates are checked;
// concurrently conflicting writers are not atomically fenced by this cache.
// The supported local producer persists one slot before its single in-flight
// send. The viewer also rejects a changed hash for a slot it already displayed.
export class RemoteView20Service{
 constructor({cache,registry,now=Date.now,namespace='th3rev20-view-v1'}){this.cache=cache;this.registry=registry;this.now=now;this.namespace=namespace;}
 key(v){return this.namespace+':'+v;}
 async record(force=false){
  const key=this.key('device-auth'),now=this.now();
  if(!force){const old=await this.cache.get(key);if(old&&Number.isSafeInteger(old.loadedAt)&&now>=old.loadedAt&&now-old.loadedAt<AUTH_TTL){validateRecord(old.record);return {record:old.record,etag:null};}}
  const loadedAt=now,found=await this.registry.read();if(!found)return {record:null,etag:null};validateRecord(found.record);
  // Use pre-read time, so a delayed earlier read cannot extend a revocation race.
  await this.cache.set(key,{record:found.record,loadedAt},{ttl:300});return found;
 }
 async describe(){const {record}=await this.record(true);return {device:publicDevice(record),writesAllowed:false,maximumActiveDevices:1,atomicSlot:false,independentBrokerProof:false};}
 async pair(input){
  if(!exact(input,['botId','account'])||! /^[A-Za-z0-9_-]{1,100}$/.test(input.botId||''))fail('REMOTE_PAIR_INVALID');validateRemoteAccount20(input.account);
  const prior=await this.record(true),now=this.now();if(prior.record&&prior.record.revokedAt===null&&prior.record.expiresAt>now)fail('REMOTE_DEVICE_ALREADY_ACTIVE',409);
  const token=randomBytes(32).toString('base64url'),record={schemaVersion:1,deviceId:randomUUID(),botId:input.botId,account:structuredClone(input.account),tokenHash:sha(token),issuedAt:now,expiresAt:now+30*DAY,revokedAt:null};
  await this.registry.write(record,prior.etag);await this.cache.set(this.key('device-auth'),{record,loadedAt:now},{ttl:300});
  return {format:'th3rev20-view-pairing',schemaVersion:1,origin:REMOTE20_ORIGIN,path:REMOTE20_PATH,deviceId:record.deviceId,token,botId:record.botId,account:record.account,issuedAt:new Date(now).toISOString(),expiresAt:new Date(record.expiresAt).toISOString(),intervalMilliseconds:REMOTE20_INTERVAL};
 }
 async revoke(input){
  if(!exact(input,['deviceId']))fail('REMOTE_DEVICE_INVALID');const found=await this.record(true);if(!found.record||found.record.deviceId!==input.deviceId)fail('REMOTE_DEVICE_NOT_FOUND',404);
  if(found.record.revokedAt===null){found.record.revokedAt=this.now();await this.registry.write(found.record,found.etag);}
  await this.cache.set(this.key('device-auth'),{record:found.record,loadedAt:this.now()},{ttl:300});
  return {revoked:true,deviceId:input.deviceId,revocationMaximumSeconds:300,writesAllowed:false};
 }
 async active(deviceId,token){
  const {record}=await this.record();if(!record||record.deviceId!==deviceId||record.revokedAt!==null||this.now()>=record.expiresAt||this.now()<record.issuedAt||token!==undefined&&!constant(sha(token),record.tokenHash))fail('REMOTE_ACCESS_DENIED',403);return record;
 }
 async receive(input,token){
  validateRemoteProjection20(input,this.now(),{received:true});if(typeof token!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(token))fail('REMOTE_ACCESS_DENIED',403);
  const record=await this.active(input.deviceId,token);if(record.botId!==input.botId||!sameAccount20(record.account,input.account))fail('REMOTE_SCOPE_MISMATCH',403);
  const raw=JSON.stringify(input),payloadHash=sha(raw),key=this.key('snapshot:'+input.deviceId+':'+input.slot),existing=await this.cache.get(key);
  if(existing){if(existing.payloadHash!==payloadHash)fail('REMOTE_SLOT_CONFLICT',409);return {accepted:true,duplicate:true,deviceId:input.deviceId,slot:input.slot,payloadHash,grantsTrading:false};}
  const packed={schema:1,deviceId:input.deviceId,slot:input.slot,payloadHash,receivedAt:this.now(),gzipBase64:gzipSync(raw).toString('base64')};
  if(Buffer.byteLength(JSON.stringify(packed))>CACHE_BYTES)fail('REMOTE_COMPACT_LIMIT',413);
  await this.cache.set(key,packed,{ttl:120});
  return {accepted:true,duplicate:false,deviceId:input.deviceId,slot:input.slot,payloadHash,grantsTrading:false};
 }
 async read(deviceId){
  const record=await this.active(deviceId),slot=Math.floor(this.now()/REMOTE20_INTERVAL);
  const rows=await Promise.all([slot,slot-1,slot-2].map(n=>this.cache.get(this.key('snapshot:'+deviceId+':'+n))));
  for(const row of rows){
   if(!row)continue;try{
    if(!exact(row,['schema','deviceId','slot','payloadHash','receivedAt','gzipBase64'])||row.schema!==1||row.deviceId!==deviceId||Buffer.byteLength(JSON.stringify(row))>CACHE_BYTES||!Number.isSafeInteger(row.receivedAt))fail('REMOTE_CACHE_INVALID',503);
    const raw=gunzipSync(Buffer.from(row.gzipBase64,'base64'),{maxOutputLength:REMOTE20_MAX_PLAIN});if(sha(raw)!==row.payloadHash)fail('REMOTE_CACHE_INVALID',503);
    const snapshot=validateRemoteProjection20(JSON.parse(raw.toString('utf8')),this.now());
    if(snapshot.deviceId!==deviceId||snapshot.slot!==row.slot||snapshot.botId!==record.botId||!sameAccount20(snapshot.account,record.account)||row.receivedAt>this.now()+5000)fail('REMOTE_CACHE_INVALID',503);
    return {available:true,writesAllowed:false,snapshot,receivedAt:new Date(row.receivedAt).toISOString(),payloadHash:row.payloadHash,transportAgeMilliseconds:Math.max(0,this.now()-Date.parse(snapshot.capturedAt)),cacheDurable:false,revocationMaximumSeconds:300};
   }catch{fail('REMOTE_CACHE_INVALID',503);}
  }
  return {available:false,writesAllowed:false,snapshot:null,reason:'NO_CURRENT_REMOTE_SNAPSHOT',cacheDurable:false,revocationMaximumSeconds:300};
 }
}
