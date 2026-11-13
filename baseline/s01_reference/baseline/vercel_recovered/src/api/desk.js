import {gunzipSync,gzipSync} from 'node:zlib';
import {allowedKey,signSession,authenticated,sameOrigin,bearer,validationError} from '../lib/security.mjs';
import {saveJournal,readJournal,listJournals,removeJournal,setSnapshot,latest,clearTest} from '../lib/storage.mjs';
export const config={api:{bodyParser:false}};
const limit=4*1024*1024;
async function body(req){
 if(req.body&&typeof req.body==='object'&&!Buffer.isBuffer(req.body))return req.body;
 const chunks=[];let n=0;
 if(req.body){const x=Buffer.isBuffer(req.body)?req.body:Buffer.from(req.body);if(x.length>limit)throw validationError('Anfrage zu gross.',413);return JSON.parse(x.toString());}
 for await(const c of req){n+=c.length;if(n>limit)throw validationError('Anfrage zu gross.',413);chunks.push(c);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw validationError('Ungueltiges JSON.');}
}
function decode(data){
 if(data.encoding==='gzip-base64'){
  if(typeof data.data!=='string'||data.data.length>limit)throw validationError('Upload zu gross.',413);
  try{return JSON.parse(gunzipSync(Buffer.from(data.data,'base64'),{maxOutputLength:16*1024*1024}));}catch{throw validationError('Archiv beschaedigt oder zu gross.');}
 }
 return data;
}
function reply(res,code,data){res.statusCode=code;res.setHeader('Content-Type','application/json; charset=utf-8');const raw=Buffer.from(JSON.stringify(data));if(raw.length>65536){const zipped=gzipSync(raw);res.setHeader('Content-Encoding','gzip');res.setHeader('Content-Length',String(zipped.length));res.end(zipped);}else res.end(raw);}
const loginAttempts=new Map();
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Robots-Tag','noindex, nofollow');
 const action=new URL(req.url,'https://internal.invalid').searchParams.get('action')||'health';
 const requestId=crypto.randomUUID();
 try{
  if(req.method==='GET'&&action==='health')return reply(res,200,{service:'ExtremeLab Decision Desk',version:'1.3.0-web',readOnly:true,serverUtc:new Date().toISOString(),cloudBotConnected:false,cloudIntegration:'BLOCKED_PENDING_TRANSPORT'});
  if(!process.env.VIEW_KEY_SHA256||!process.env.SESSION_SECRET)return reply(res,503,{error:'Zugang noch nicht eingerichtet.'});
  const writer=allowedKey(bearer(req),process.env.PRODUCER_KEY_SHA256);
  if(!['GET','POST','DELETE'].includes(req.method))return reply(res,405,{error:'Methode nicht erlaubt.'});
  if(req.method==='POST'&&!String(req.headers['content-type']||'').startsWith('application/json'))return reply(res,415,{error:'JSON erforderlich.'});
  if(req.method!=='GET'&&!writer&&!sameOrigin(req))return reply(res,403,{error:'Fremder Ursprung abgewiesen.'});
  if(req.method==='POST'&&action==='login'){
   const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').slice(0,150),now=Date.now();
   for(const [k,v] of loginAttempts)if(now-v.time>60000)loginAttempts.delete(k);
   const bucket=loginAttempts.get(ip)||{count:0,time:now};bucket.count++;loginAttempts.set(ip,bucket);
   if(bucket.count>10){res.setHeader('Retry-After','60');return reply(res,429,{error:'Zu viele Versuche. Eine Minute warten.'});}
   const d=await body(req);if(!allowedKey(d.key,process.env.VIEW_KEY_SHA256))return reply(res,401,{error:'Zugangscode ungueltig.'});
   loginAttempts.delete(ip);res.setHeader('Set-Cookie','__Host-el_session='+signSession(process.env.SESSION_SECRET)+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800');
   return reply(res,200,{authenticated:true});
  }
  if(req.method==='POST'&&action==='ingest'){
   if(!writer)return reply(res,401,{error:'Sender nicht autorisiert.'});
   const data=await body(req);return reply(res,200,await setSnapshot(data,data.source));
  }
  if(req.method==='POST'&&action==='clear-test'){
   if(!writer)return reply(res,401,{error:'Sender nicht autorisiert.'});return reply(res,200,await clearTest());
  }
  if(!authenticated(req))return reply(res,401,{error:'Anmeldung erforderlich.'});
  if(req.method==='GET'&&action==='session')return reply(res,200,{authenticated:true,readOnly:true});
  if(req.method==='POST'&&action==='logout'){
   res.setHeader('Set-Cookie','__Host-el_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');return reply(res,200,{authenticated:false});
  }
  if(req.method==='GET'&&action==='status'){
   const data=await latest();
   return reply(res,200,{connectedToWebsite:true,readOnly:true,serverUtc:new Date().toISOString(),lastReceivedAt:data?.receivedAt||null,source:data?.source||null,storage:'private-vercel-blob',cloudVerified:false,cloudIntegration:'BLOCKED_PENDING_TRANSPORT',note:'cTrader Cloud verlangt Port 25345. Diese Vercel-Adresse stellt HTTPS/WSS auf 443 bereit. Kein nachgewiesener Cloud-Datenweg.'});
  }
  if(req.method==='GET'&&action==='latest'){return reply(res,200,{snapshot:await latest()});}
  if(action==='archives'){
   const p=new URL(req.url,'https://internal.invalid').searchParams;
   if(req.method==='GET'){const cursor=p.get('cursor');if(cursor&&cursor.length>4096)throw validationError('Ungueltiger Cursor.');return reply(res,200,await listJournals(cursor));}
   if(req.method==='POST')return reply(res,201,await saveJournal(decode(await body(req))));
  }
  if(action==='archive'){
   const id=new URL(req.url,'https://internal.invalid').searchParams.get('id');
   if(req.method==='GET')return reply(res,200,await readJournal(id));
   if(req.method==='DELETE')return reply(res,200,await removeJournal(id));
  }
  return reply(res,404,{error:'Unbekannte Funktion.'});
 }catch(e){
  const status=Number.isInteger(e.status)?e.status:503;
  if(status>=500)console.error('Desk request failed',{requestId,type:e?.constructor?.name});
  return reply(res,status,{error:status>=500?'Dienst voruebergehend nicht verfuegbar. Letzten Datenstand behalten.':e.message,requestId});
 }
}
