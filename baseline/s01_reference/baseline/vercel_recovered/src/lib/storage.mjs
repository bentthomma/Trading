import {put,get,list,del} from '@vercel/blob';
import {getCache} from '@vercel/functions';
import {gzipSync,gunzipSync} from 'node:zlib';
import {sha,validateEvents,validationError} from './security.mjs';
const PREFIX='extremelab/journals/';
export async function saveJournal(input){
 const parsed=validateEvents(input);
 const raw=JSON.stringify(parsed);
 if(Buffer.byteLength(raw)>16*1024*1024)throw validationError('Archiv ist groesser als 16 MB. Zeitraum verkleinern.',413);
 const id=sha(raw), blob=gzipSync(raw);
 if(blob.length>3*1024*1024)throw validationError('Archiv ist komprimiert groesser als 3 MB.',413);
 await put(PREFIX+id+'.json.gz',blob,{access:'private',contentType:'application/gzip',addRandomSuffix:false,allowOverwrite:true,cacheControlMaxAge:60});
 return {id,count:parsed.events.length,duplicates:parsed.duplicates,bytes:blob.length,durable:true,source:parsed.source};
}
function pathFor(id){if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))throw validationError('Ungueltige Archiv-ID.');return PREFIX+id+'.json.gz';}
export async function readJournal(id){
 const result=await get(pathFor(id),{access:'private',useCache:false});if(!result||result.statusCode!==200)throw validationError('Archiv nicht gefunden.',404);
 const data=Buffer.from(await new Response(result.stream).arrayBuffer());
 return JSON.parse(gunzipSync(data,{maxOutputLength:16*1024*1024}));
}
export async function listJournals(cursor){
 const r=await list({prefix:PREFIX,limit:50,...(cursor?{cursor}:{} )});
 return {items:r.blobs.map(b=>({id:b.pathname.slice(PREFIX.length,-8),uploadedAt:b.uploadedAt,bytes:b.size})),hasMore:r.hasMore,cursor:r.cursor||null};
}
export async function removeJournal(id){await del(pathFor(id));return {deleted:true,id};}
export async function setSnapshot(input,source){
 if(!['transport-test','ctrader-reported'].includes(source))throw validationError('Datenquelle fehlt.');
 const p=validateEvents(input);if(p.events.length>1500)throw validationError('Snapshot maximal 1500 Ereignisse.');
 if(Buffer.byteLength(JSON.stringify(p))>512*1024)throw validationError('Snapshot groesser als 512 KB.',413);
 const value={...p,source,receivedAt:new Date().toISOString(),id:sha(JSON.stringify(p)),durable:false};
 await getCache().set('extremelab:latest:'+source,value,{ttl:3600});
 return {cached:true,durable:false,id:value.id,receivedAt:value.receivedAt};
}
export async function latest(source='ctrader-reported'){
 if(!['transport-test','ctrader-reported'].includes(source))throw validationError('Ungueltige Quelle.');
 return (await getCache().get('extremelab:latest:'+source))||null;
}
export async function clearTest(){await getCache().delete('extremelab:latest:transport-test');return {cleared:true};}
