import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
export const sha = text => createHash('sha256').update(text).digest('hex');
export function equal(a,b) { if(typeof a!=='string'||typeof b!=='string') return false; const x=Buffer.from(a),y=Buffer.from(b); return x.length===y.length && timingSafeEqual(x,y); }
export function allowedKey(value,hash){return typeof value==='string' && value.length<=200 && !!hash && equal(sha(value),hash);}
export function signSession(secret,now=Date.now()){
 if(!secret||secret.length<32)throw new Error('SESSION_NOT_CONFIGURED');
 const body=Buffer.from(JSON.stringify({exp:now+8*3600*1000,nonce:randomBytes(16).toString('hex')})).toString('base64url');
 return body+'.'+createHmac('sha256',secret).update(body).digest('base64url');
}
export function validSession(token,secret,now=Date.now()) {
 if(!secret||typeof token!=='string'||token.length>512)return false;
 const [body,mac,extra]=token.split('.'); if(extra||!body||!mac)return false;
 if(!equal(createHmac('sha256',secret).update(body).digest('base64url'),mac))return false;
 try {const d=JSON.parse(Buffer.from(body,'base64url'));return Number.isFinite(d.exp)&&d.exp>now&&d.exp<=now+8*3600*1000+60000;}catch{return false;}
}
export function sessionFrom(req){const cookie=req.headers.cookie||'';return cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-el_session='))?.slice(18);}
export function authenticated(req,env=process.env){return validSession(sessionFrom(req),env.SESSION_SECRET);}
export function sameOrigin(req,env=process.env){const origin=req.headers.origin;return !!origin && origin===env.APP_ORIGIN;}
export function validationError(message,status=400){const e=new Error(message);e.status=status;return e;}
export const MAX_EVENTS=25000;
export function validateEvents(raw){
 const v=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:null;
 if(!v||!Array.isArray(v.events)||!v.events.length||v.events.length>MAX_EVENTS)throw validationError('Erwartet: 1–25000 XL1/XL2-Ereignisse.');
 const seen=new Map();let duplicates=0;
 for(const e of v.events){
  if(!e||typeof e!=='object'||Array.isArray(e)||![undefined,1,2].includes(e.schema)||typeof e.run!=='string'||e.run.length>100||!e.run.length||typeof e.kind!=='string'||!/^[A-Z0-9_]{1,64}$/.test(e.kind)||typeof e.utc!=='string'||!Number.isFinite(Date.parse(e.utc))||!e.data||typeof e.data!=='object'||Array.isArray(e.data))throw validationError('Ungueltiges Ereignis.');
  if(e.seq!==undefined&&(!Number.isSafeInteger(e.seq)||e.seq<1))throw validationError('Ungueltige Sequenznummer.');
  const canon=JSON.stringify(e); if(Buffer.byteLength(canon)>512*1024)throw validationError('Ein Ereignis ist zu gross.',413);
  const key=e.seq!==undefined?`${e.run}|${e.seq}`:sha(canon);
  if(seen.has(key)){if(seen.get(key)!==canon)throw validationError('Widerspruechliche Ereignisse mit gleicher Lauf-/Sequenznummer.');duplicates++;} else seen.set(key,canon);
 }
 const events=[...seen.values()].map(x=>JSON.parse(x)).sort((a,b)=>Date.parse(a.utc)-Date.parse(b.utc)||(a.seq||0)-(b.seq||0));
 return {format:'ExtremeLabAnalysis/2',source:'imported_journal_not_live',events,duplicates};
}
export function bearer(req){const h=req.headers.authorization;return typeof h==='string'&&h.startsWith('Bearer ')?h.slice(7):'';}
