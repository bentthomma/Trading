import {createHash,createCipheriv,createDecipheriv,randomBytes,hkdfSync} from 'node:crypto';

export const UPSTREAM='https://mcp.ctrader.com/data/mcp';
export const COOKIE='__Host-el_ctreader';
export const READ_TOOLS=Object.freeze(['get_balance','get_positions','get_assets','get_symbols','get_spot_prices']);
const WRITE_TOOLS=new Set(['create_order','amend_order','cancel_order','amend_position','close_position']);
const VERSIONS=new Set(['2024-11-05','2025-03-26','2025-06-18','2025-11-25']);
export class ReaderError extends Error {
 constructor(code,status=502){super(code);this.code=code;this.status=status;}
}
const fail=(code,status)=>{throw new ReaderError(code,status);};
export const hash=x=>createHash('sha256').update(x).digest('hex');
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const ascii=x=>typeof x==='string'&&/^[\x21-\x7e]+$/.test(x);
export function parseCredential(input){
 if(typeof input!=='string'||input.length>16000)fail('INVALID_CONFIGURATION',400);
 let token=input.trim();
 if(token.startsWith('{')){
  let config;try{config=JSON.parse(token);}catch{fail('INVALID_CONFIGURATION',400);}
  if(object(config?.mcpServers)){
   const entries=Object.values(config.mcpServers);
   if(entries.length!==1)fail('SELECT_ONE_CTRADER_CONFIGURATION',400);
   config=entries[0];
  }
  if(!object(config)||typeof config.url!=='string'||!object(config.headers))fail('INVALID_CONFIGURATION',400);
  let u;try{u=new URL(config.url);}catch{fail('INVALID_CONFIGURATION',400);}
  if(u.protocol!=='https:'||u.hostname!=='mcp.ctrader.com'||u.port||u.username||u.password||u.search||u.hash||!['/data/mcp','/trading/mcp'].includes(u.pathname))fail('OFFICIAL_CTRADER_URL_REQUIRED',400);
  const keys=Object.keys(config.headers);
  if(keys.length!==1||keys[0].toLowerCase()!=='authorization')fail('ONLY_AUTHORIZATION_HEADER_ACCEPTED',400);
  token=config.headers[keys[0]];
 }
 if(typeof token!=='string')fail('INVALID_TOKEN',400);
 token=token.trim().replace(/^Bearer\s+/i,'');
 if(!ascii(token)||token.length<32||token.length>2200||token.includes('"')||token.includes('\\'))fail('INVALID_TOKEN',400);
 return token;
}
const encryptionKey=secret=>{
 if(typeof secret!=='string'||secret.length<32)fail('READER_NOT_CONFIGURED',503);
 return Buffer.from(hkdfSync('sha256',secret,'ExtremeLab-AccountReader','cookie-v1',32));
};
export function sealCredential(token,ownerSession,secret,now=Date.now()){
 token=parseCredential(token);
 let owner;try{owner=JSON.parse(Buffer.from(ownerSession.split('.')[0],'base64url'));}catch{fail('OWNER_SESSION_INVALID',401);}
 const exp=Math.min(now+8*3600000,Number(owner.exp));
 if(!Number.isFinite(exp)||exp<=now)fail('OWNER_SESSION_INVALID',401);
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(secret),iv);
 cipher.setAAD(Buffer.from(COOKIE));
 const data=Buffer.from(JSON.stringify({v:1,token,owner:hash(ownerSession),exp,demoConfirmed:true}));
 const ciphertext=Buffer.concat([cipher.update(data),cipher.final()]);
 const encoded=Buffer.concat([iv,cipher.getAuthTag(),ciphertext]).toString('base64url');
 if(encoded.length>3800)fail('TOKEN_TOO_LARGE',400);
 return {encoded,exp};
}
export function openCredential(encoded,ownerSession,secret,now=Date.now()){
 try{
  if(typeof encoded!=='string'||!(/^[A-Za-z0-9_-]{45,3800}$/).test(encoded))return null;
  const b=Buffer.from(encoded,'base64url');
  const d=createDecipheriv('aes-256-gcm',encryptionKey(secret),b.subarray(0,12));
  d.setAAD(Buffer.from(COOKIE));d.setAuthTag(b.subarray(12,28));
  const v=JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]));
  if(v.v!==1||v.owner!==hash(ownerSession)||!Number.isFinite(v.exp)||v.exp<=now||v.exp>now+8*3600000+60000||v.demoConfirmed!==true)return null;
  return {...v,token:parseCredential(v.token)};
 }catch{return null;}
}
export function credentialFrom(req,session,secret,now=Date.now()){
 const values=(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(COOKIE+'='));
 return values.length===1?openCredential(values[0].slice(COOKIE.length+1),session,secret,now):null;
}
export function credentialCookie(value,exp,now=Date.now()){
 return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.max(0,Math.floor((exp-now)/1000))}`;
}
export const clearCredentialCookie=()=>credentialCookie('',0);

// Each request is tied to one JSON-RPC id; server notifications cannot masquerade as results.
async function rpcResponse(response,id){
 const type=response.headers.get('content-type')||'';
 if(!type.includes('application/json')&&!type.includes('text/event-stream'))fail('MCP_CONTENT_TYPE');
 const reader=response.body?.getReader();if(!reader)fail('MCP_EMPTY_RESPONSE');
 const decoder=new TextDecoder();let text='',total=0;
 const pick=x=>{
  const list=Array.isArray(x)?x:[x];
  for(const r of list)if(object(r)&&r.jsonrpc==='2.0'&&r.id===id){if(r.error)fail('MCP_RPC_REJECTED');if(!Object.hasOwn(r,'result'))fail('MCP_MISSING_RESULT');return {found:true,result:r.result};}
  return {found:false};
 };
 try{
  while(true){
   const {value,done}=await reader.read();
   if(value){total+=value.byteLength;if(total>2*1024*1024)fail('MCP_RESPONSE_TOO_LARGE');text+=decoder.decode(value,{stream:true});}
   if(type.includes('text/event-stream')){
    // Normalise complete CRLFs, retaining a trailing CR until the next chunk.
    text=text.replace(/\r\n/g,'\n');
    let at;
    while((at=text.indexOf('\n\n'))>=0){
     const event=text.slice(0,at);text=text.slice(at+2);
     const data=event.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).replace(/^ /,'')).join('\n');
     if(data){let parsed;try{parsed=JSON.parse(data);}catch{fail('MCP_INVALID_JSON');}const p=pick(parsed);if(p.found)return p.result;}
    }
   }
   if(done)break;
  }
  if(type.includes('application/json')){let x;try{x=JSON.parse(text);}catch{fail('MCP_INVALID_JSON');}const p=pick(x);if(p.found)return p.result;}
  fail('MCP_RESPONSE_ID_MISMATCH');
 }finally{try{await reader.cancel();}catch{}reader.releaseLock();}
}
export class ReadOnlyMcp {
 constructor(token,{fetcher=fetch,now=()=>Date.now(),timeoutMs=20000}={}){
  this.token=parseCredential(token);this.fetcher=fetcher;this.now=now;this.deadline=now()+timeoutMs;
  this.session=null;this.version='2025-03-26';this.id=0;this.tools=new Map();
 }
 async request(method,params,id=++this.id){
  if(!['initialize','notifications/initialized','tools/list','tools/call'].includes(method))fail('READ_ONLY_METHOD',400);
  if(method==='tools/call'&&!READ_TOOLS.includes(params?.name))fail('TRADING_OPERATION_FORBIDDEN',400);
  const headers={'content-type':'application/json',accept:'application/json, text/event-stream',authorization:'Bearer '+this.token};
  if(this.session)headers['Mcp-Session-Id']=this.session;
  if(method!=='initialize')headers['MCP-Protocol-Version']=this.version;
  const remaining=Math.min(8000,this.deadline-this.now());if(remaining<=0)fail('MCP_TIMEOUT',504);
  let response;
  try{response=await this.fetcher(UPSTREAM,{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',...(id===null?{}:{id}),method,...(params===undefined?{}:{params})}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(remaining)});}catch{fail('MCP_UNREACHABLE',503);}
  if(!response.ok){await response.body?.cancel();if([401,403].includes(response.status))fail('CTRADER_TOKEN_EXPIRED',401);if(response.status===429)fail('CTRADER_RATE_LIMIT',429);if(response.status===404)fail('MCP_SESSION_EXPIRED',503);fail('MCP_HTTP_ERROR',503);}
  if(id===null){await response.body?.cancel();return null;}
  if(method==='initialize'){
   const s=response.headers.get('mcp-session-id');if(s!==null){if(!ascii(s)||s.length>256)fail('MCP_INVALID_SESSION');this.session=s;}
  }
  try{return await rpcResponse(response,id);}catch(e){if(e instanceof ReaderError)throw e;fail('MCP_READ_FAILED',503);}
 }
 async initialize(){
  const r=await this.request('initialize',{protocolVersion:this.version,capabilities:{},clientInfo:{name:'ExtremeLabAccountReader',version:'1.3.4'}});
  if(!VERSIONS.has(r?.protocolVersion))fail('MCP_VERSION_UNSUPPORTED');this.version=r.protocolVersion;
  await this.request('notifications/initialized',undefined,null);
  let cursor;const cursors=new Set();
  for(let page=0;page<5;page++){
   const p=await this.request('tools/list',cursor?{cursor}:{});
   if(!Array.isArray(p?.tools)||p.tools.length>300)fail('MCP_INVALID_TOOL_LIST');
   for(const t of p.tools){if(!object(t)||typeof t.name!=='string'||!object(t.inputSchema))fail('MCP_INVALID_TOOL_LIST');if(WRITE_TOOLS.has(t.name))fail('DATA_PROFILE_CONTAINS_TRADING_TOOLS');if(READ_TOOLS.includes(t.name))this.tools.set(t.name,t);}
   if(!p.nextCursor)return this;
   if(typeof p.nextCursor!=='string'||p.nextCursor.length>1024||cursors.has(p.nextCursor))fail('MCP_INVALID_CURSOR');
   cursor=p.nextCursor;cursors.add(cursor);
  }
  fail('MCP_TOOL_LIST_INCOMPLETE');
 }
 async call(name,args={}){
  if(!READ_TOOLS.includes(name))fail('TRADING_OPERATION_FORBIDDEN',400);
  const tool=this.tools.get(name);if(!tool)fail('READ_TOOL_UNAVAILABLE');
  const schema=tool.inputSchema,required=schema.required??[];
  if(!Array.isArray(required)||required.some(k=>!Object.hasOwn(args,k)))fail('TOOL_ARGUMENTS_UNSUPPORTED');
  if(schema.type&&schema.type!=='object')fail('TOOL_SCHEMA_UNSUPPORTED');
  for(const key of Object.keys(args)){
   const p=schema.properties?.[key];if(!p)fail('TOOL_ARGUMENTS_UNSUPPORTED');
   if(p.type==='array'&&(!Array.isArray(args[key])||p.items?.type!=='integer'||args[key].some(v=>!Number.isSafeInteger(v)||v<1)))fail('TOOL_ARGUMENTS_UNSUPPORTED');
  }
  const out=await this.request('tools/call',{name,arguments:args});
  if(!object(out)||out.isError===true)fail('CTRADER_DATA_REJECTED');
  let data=out.structuredContent;
  if(!object(data)&&!Array.isArray(data)){
   const texts=(out.content||[]).filter(x=>x?.type==='text').map(x=>x.text);
   if(texts.length!==1||typeof texts[0]!=='string')fail('TOOL_OUTPUT_UNSUPPORTED');
   try{data=JSON.parse(texts[0]);}catch{fail('TOOL_OUTPUT_UNSUPPORTED');}
  }
  if(!object(data)&&!Array.isArray(data))fail('TOOL_OUTPUT_UNSUPPORTED');
  if(data.error||data.isError===true)fail('CTRADER_DATA_REJECTED');
  return data;
 }
 async close(){
  if(!this.session)return;
  try{const r=await this.fetcher(UPSTREAM,{method:'DELETE',headers:{authorization:'Bearer '+this.token,'Mcp-Session-Id':this.session,'MCP-Protocol-Version':this.version},redirect:'error',signal:AbortSignal.timeout(1500)});await r.body?.cancel();}catch{}
 }
}

export function decimal(raw,digits){
 if(!Number.isInteger(digits)||digits<0||digits>12)return null;
 let x;if(typeof raw==='number'){if(!Number.isSafeInteger(raw))return null;x=BigInt(raw);}else if(typeof raw==='string'&&/^-?\d{1,28}$/.test(raw)){x=BigInt(raw);}else return null;
 const negative=x<0n;if(negative)x=-x;
 const s=x.toString().padStart(digits+1,'0');
 return (negative?'-':'')+(digits?s.slice(0,-digits)+'.'+s.slice(-digits):s);
}
function unwrap(x){for(let i=0;i<3&&object(x)&&Object.keys(x).length===1&&object(x.data);i++)x=x.data;return x;}
function collection(x,name){x=unwrap(x);return Array.isArray(x)?x:Array.isArray(x?.[name])?x[name]:null;}
const clean=x=>typeof x==='string'?x.slice(0,160):typeof x==='number'&&Number.isSafeInteger(x)?String(x):null;
const id=x=>clean(x);
function environment(x){if(x?.isLive===true)return'live';if(x?.isLive===false)return'demo';const t=String(x?.environment??'').toLowerCase();return ['demo','live'].includes(t)?t:'unconfirmed';}
export function normaliseSnapshot({balance,positions,assets,symbols,quotes=null,observedAt,startedAt,toolTimes,warnings=[]}){
 const b=unwrap(balance);if(!object(b))fail('BALANCE_SHAPE_UNSUPPORTED');
 const env=environment(b);if(env==='live')fail('DEMO_ACCOUNT_REQUIRED',403);
 const md=b.moneyDigits;
 const assetList=collection(assets,'assets')||[],symbolList=collection(symbols,'symbols')||[];
 const map=new Map(symbolList.filter(object).map(s=>[id(s.symbolId),s]));
 const deposit=assetList.find(a=>id(a.assetId)===id(b.depositAssetId));
 const currency=clean(b.currency??deposit?.name??deposit?.assetName);
 const p=unwrap(positions),positionList=collection(p,'positions');
 if(positionList===null)fail('POSITIONS_SHAPE_UNSUPPORTED');
 if(positionList.length>500)fail('POSITION_LIMIT_EXCEEDED');
 if(!Number.isInteger(md)||md<0||md>12)warnings.push('MONEY_PRECISION_MISSING');
 if(!symbolList.length)warnings.push('SYMBOL_METADATA_UNAVAILABLE');
 if(p.hasMore===true)warnings.push('POSITIONS_PARTIAL');
 const prices=collection(quotes,'prices')||[],quoteMap=new Map(prices.filter(object).map(q=>[id(q.symbolId),q]));
 const output=positionList.map(pos=>{
  if(!object(pos))fail('POSITION_SHAPE_UNSUPPORTED');
  const sid=id(pos.symbolId),s=map.get(sid),digits=s?.pipDigits,q=quoteMap.get(sid);
  return {id:id(pos.positionId),symbolId:sid,symbol:clean(s?.symbolName)||sid||'Unbekannt',side:['BUY','SELL'].includes(pos.tradeSide)?pos.tradeSide:'Unbekannt',units:decimal(pos.volume,2),entry:decimal(pos.entryPrice,digits),stop:decimal(pos.stopLoss,digits),target:decimal(pos.takeProfit,digits),unrealizedPnl:decimal(pos.unrealizedPnl,md),commission:decimal(pos.commission,md),swap:decimal(pos.swap,md),label:clean(pos.label),bid:decimal(q?.bid,digits),ask:decimal(q?.ask,digits),quoteUtc:typeof q?.timestamp==='number'&&Number.isSafeInteger(q.timestamp)&&q.timestamp>0&&q.timestamp<8640000000000000?new Date(q.timestamp).toISOString():null,pricePrecisionKnown:Number.isInteger(digits),moneyPrecisionKnown:Number.isInteger(md)};
 });
 const pending=Array.isArray(p.pendingOrders)?p.pendingOrders:Array.isArray(p.orders)?p.orders:null;
 return {source:'CTRADER_REMOTE_MCP_DATA',readOnly:true,botInternalsAvailable:false,autoTrading:false,observedAt,startedAt,nonAtomicSnapshot:true,toolTimes,environment:env,environmentClaim:env==='unconfirmed'?'Demo laut Benutzerauswahl; nicht vom Datensatz bestätigt':'Vom Kontodatensatz gemeldet',account:{id:id(b.ctidTraderAccountId??b.accountId),currency:currency||'Währung unbekannt',balance:decimal(b.balance,md),equity:decimal(b.equity,md),freeMargin:decimal(b.freeMargin,md),unrealizedPnl:decimal(b.unrealizedPnl,md),balanceVersion:id(b.balanceVersion),moneyDigits:Number.isInteger(md)?md:null},positions:output,pendingCount:pending?.length??null,positionCount:output.length,partial:warnings.length>0,warnings:[...new Set(warnings)],pnlMeaning:'Anbieterfeld unrealizedPnl; Kosten nicht erneut abgezogen. Kein nachgewiesener Strategie-Nettoertrag.'};
}
// Memory-only, bounded metadata cache: not an archive and never a freshness proof.
const metadataCache=new Map();
export async function readSnapshot(token,{fetcher=fetch,now=()=>Date.now(),cache=metadataCache}={}){
 const startedAt=new Date(now()).toISOString(),c=new ReadOnlyMcp(token,{fetcher,now}),toolTimes={},warnings=[];
 const call=async(name,args={})=>{const value=await c.call(name,args);toolTimes[name]=new Date(now()).toISOString();return value;};
 try{
  await c.initialize();const balance=await call('get_balance');
  if(environment(unwrap(balance))==='live')fail('DEMO_ACCOUNT_REQUIRED',403);
  const positions=await call('get_positions'),key=hash(token);let metadata=cache.get(key);
  if(!metadata||metadata.expires<=now()){
   metadata={expires:now()+600000,assets:null,symbols:null};
   for(const name of ['get_assets','get_symbols']){try{metadata[name==='get_assets'?'assets':'symbols']=await call(name);}catch(e){if(e.status===401||e.status===403)throw e;warnings.push(name.toUpperCase()+'_UNAVAILABLE');}}
   if(cache.size>=4)cache.delete(cache.keys().next().value);cache.set(key,metadata);
  }
  if(!metadata.assets)warnings.push('GET_ASSETS_UNAVAILABLE');
  if(!metadata.symbols)warnings.push('GET_SYMBOLS_UNAVAILABLE');
  let quotes=null;
  const ids=[...new Set((collection(positions,'positions')||[]).map(p=>p.symbolId).filter(n=>Number.isSafeInteger(n)&&n>0))].slice(0,50);
  if(ids.length){
   const props=c.tools.get('get_spot_prices')?.inputSchema?.properties||{};
   const candidates=['symbolIds','symbolId'].filter(k=>props[k]?.type==='array'&&props[k]?.items?.type==='integer');
   if(candidates.length===1){try{quotes=await call('get_spot_prices',{[candidates[0]]:ids});}catch(e){if(e.status===401||e.status===403)throw e;warnings.push('QUOTES_UNAVAILABLE');}}
   else warnings.push('QUOTE_SCHEMA_UNSUPPORTED');
  }
  return normaliseSnapshot({balance,positions,...metadata,quotes,startedAt,observedAt:new Date(now()).toISOString(),toolTimes,warnings});
 }finally{await c.close();}
}
