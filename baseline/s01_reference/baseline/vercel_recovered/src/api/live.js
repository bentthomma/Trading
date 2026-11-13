import {authenticated,validationError} from '../lib/security.mjs';
import {relayRequest} from '../lib/relay.mjs';
import {gzipSync} from 'node:zlib';
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Robots-Tag','noindex, nofollow');
 let status=200,data;
 try{
  if(req.method!=='GET')throw validationError('READ_ONLY_ENDPOINT',405);
  if(!authenticated(req))throw validationError('Anmeldung erforderlich.',401);
  const p=new URL(req.url,'https://internal.invalid').searchParams;
  data=await relayRequest(p.get('action')||'live',p);
 }catch(e){status=Number.isInteger(e.status)?e.status:503;data={error:status>=500?'Live-Verbindung nicht erreichbar; letzte Ansicht bleibt erhalten.':e.message,code:status>=500&&/^[A-Z_]+$/.test(e.message)?e.message:undefined};}
 res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');
 let payload=Buffer.from(JSON.stringify(data));
 if(payload.length>4096&&/\bgzip\b/.test(req.headers['accept-encoding']||'')){payload=gzipSync(payload);res.setHeader('Content-Encoding','gzip');res.setHeader('Vary','Accept-Encoding');}
 res.setHeader('Content-Length',String(payload.length));res.end(payload);
}
