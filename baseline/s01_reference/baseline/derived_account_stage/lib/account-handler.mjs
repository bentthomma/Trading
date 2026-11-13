import {authenticated,sameOrigin,sessionFrom} from './security.mjs';
import {ReaderError,parseCredential,sealCredential,credentialFrom,credentialCookie,clearCredentialCookie,readSnapshot} from './ctrader-readonly.mjs';

export function createHandler({read=readSnapshot,env=process.env}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Robots-Tag','noindex, nofollow');
  const send=(status,data)=>res.status(status).json(data);
  if(!authenticated(req,env))return send(401,{error:'OWNER_LOGIN_REQUIRED'});
  const url=new URL(req.url,'https://internal.invalid'),action=url.searchParams.get('action')||'status';
  if([...url.searchParams.keys()].some(k=>k!=='action')||url.searchParams.getAll('action').length>1||!['status','connect','disconnect','snapshot'].includes(action))return send(400,{error:'INVALID_ACTION'});
  const post=['connect','disconnect'].includes(action);
  if(req.method!==(post?'POST':'GET')){res.setHeader('Allow',post?'POST':'GET');return send(405,{error:'METHOD_NOT_ALLOWED'});}
  if(post&&!sameOrigin(req,env))return send(403,{error:'ORIGIN_REJECTED'});
  if(!post&&req.headers['sec-fetch-site']==='cross-site')return send(403,{error:'ORIGIN_REJECTED'});
  const owner=sessionFrom(req),stored=credentialFrom(req,owner,env.SESSION_SECRET);
  try{
   if(action==='disconnect'){res.setHeader('Set-Cookie',clearCredentialCookie());return send(200,{paired:false,readOnly:true,tokenRevokedAtProvider:false});}
   if(action==='status')return send(200,{version:'1.3.4-account-reader',paired:!!stored,expiresAt:stored?new Date(stored.exp).toISOString():null,connectionVerified:false,readOnly:true,profile:'data',botInternalsAvailable:false,pollSeconds:10,backgroundCollection:false});
   if(action==='snapshot'){
    if(!stored)return send(409,{error:'CTRADER_NOT_PAIRED'});
    return send(200,{paired:true,snapshot:await read(stored.token)});
   }
   if(!String(req.headers['content-type']||'').startsWith('application/json'))return send(415,{error:'JSON_REQUIRED'});
   let body=req.body;
   if(typeof body==='string'){if(body.length>18000)throw new ReaderError('BODY_TOO_LARGE',413);try{body=JSON.parse(body);}catch{throw new ReaderError('INVALID_BODY',400);}}
   if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(k=>!['configuration','demoConfirmed'].includes(k))||body.demoConfirmed!==true)throw new ReaderError('DEMO_CONFIRMATION_REQUIRED',400);
   const token=parseCredential(body.configuration);
   const snapshot=await read(token);
   const sealed=sealCredential(token,owner,env.SESSION_SECRET);
   res.setHeader('Set-Cookie',credentialCookie(sealed.encoded,sealed.exp));
   return send(200,{paired:true,expiresAt:new Date(sealed.exp).toISOString(),snapshot});
  }catch(e){
   // Deliberately no raw upstream exception, headers, request body or token in logs or responses.
   const code=e instanceof ReaderError?e.code:'READER_INTERNAL_ERROR';
   const status=e instanceof ReaderError?e.status:503;
   if(code==='CTRADER_TOKEN_EXPIRED'||code==='DEMO_ACCOUNT_REQUIRED')res.setHeader('Set-Cookie',clearCredentialCookie());
   return send(status,{error:code,readOnly:true,botInternalsAvailable:false});
  }
 };
}
export default createHandler();
