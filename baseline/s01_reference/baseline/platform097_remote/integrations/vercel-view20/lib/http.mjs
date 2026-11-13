// HTTP boundary shared by the deployed Vercel function and real-socket tests.
// This module deliberately has no broker, local Core or trading API.
function fail(code,status){const e=Error(code);e.code=code;e.status=status;throw e;}
async function jsonBody(req){
 if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))fail('REMOTE_JSON_REQUIRED',415);
 if(Number(req.headers['content-length'])>65536)fail('REMOTE_BODY_LIMIT',413);
 let value;
 try{
  if(req.body!==undefined){const raw=typeof req.body==='string'?req.body:Buffer.isBuffer(req.body)?req.body.toString('utf8'):null;if(raw!==null&&Buffer.byteLength(raw)>65536)fail('REMOTE_BODY_LIMIT',413);value=raw!==null?JSON.parse(raw):req.body;if(Buffer.byteLength(JSON.stringify(value))>65536)fail('REMOTE_BODY_LIMIT',413);}
  else {let size=0,parts=[];for await(const part of req){const bytes=Buffer.from(part);size+=bytes.length;if(size>65536)fail('REMOTE_BODY_LIMIT',413);parts.push(bytes);}value=JSON.parse(Buffer.concat(parts).toString('utf8'));}
 }catch(e){if(e.code==='REMOTE_BODY_LIMIT')throw e;fail('REMOTE_JSON_INVALID',400);}
 return value;
}
export function createRemoteView20Handler({service,authenticated,origins}){
 if(!service||typeof authenticated!=='function'||typeof origins!=='function')throw Error('REMOTE_HANDLER_DEPENDENCIES_REQUIRED');
 return async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Type','application/json; charset=utf-8');
  try{
   const q=new URL(req.url,'https://internal.invalid').searchParams,action=q.get('action')||'status';let value;
   if(action==='receive'&&req.method==='POST'){
    const token=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization||'')?.[1];if(!token)fail('REMOTE_ACCESS_DENIED',403);value=await service.receive(await jsonBody(req),token);
   }else{
    if(!authenticated(req))fail('REMOTE_LOGIN_REQUIRED',401);
    if(req.method==='GET'&&action==='status')value=await service.describe();
    else if(req.method==='GET'&&action==='snapshot')value=await service.read(q.get('deviceId'));
    else if(req.method==='POST'&&['pair','revoke'].includes(action)){
     if(!origins().includes(req.headers.origin))fail('REMOTE_ORIGIN_DENIED',403);
     const input=await jsonBody(req);value=action==='pair'?await service.pair(input):await service.revoke(input);
    }else fail('REMOTE_ACTION_UNSUPPORTED',405);
   }
   res.statusCode=200;res.end(JSON.stringify(value));
  }catch(e){res.statusCode=Number.isInteger(e.status)&&e.status>=400&&e.status<=599?e.status:503;res.end(JSON.stringify({error:/^[A-Z][A-Z0-9_]{2,70}$/.test(e.code||'')?e.code:'REMOTE_SERVICE_UNAVAILABLE',writesAllowed:false}));}
 };
}
