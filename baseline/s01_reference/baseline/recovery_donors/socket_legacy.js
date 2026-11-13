import http from 'node:http';
import {WebSocketServer} from 'ws';
import {authenticated,sameOrigin,allowedKey} from '../lib/security.mjs';
import {latest,setSnapshot} from '../lib/storage.mjs';
const server=http.createServer((req,res)=>{res.writeHead(426,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'WebSocket upgrade required'}));});
const sockets=new WebSocketServer({noServer:true,maxPayload:512*1024,perMessageDeflate:false});
server.on('upgrade',(req,socket,head)=>{
 const browser=authenticated(req)&&sameOrigin(req);
 // Producers authenticate in the first frame; no token appears in URL/access logs.
 if(!browser&&req.headers.origin){socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');socket.destroy();return;}
 sockets.handleUpgrade(req,socket,head,ws=>sockets.emit('connection',ws,{browser}));
});
sockets.on('connection',(ws,ctx)=>{
 let role=ctx.browser?'viewer':null,busy=false,lastWrite=0;
 const send=obj=>{if(ws.readyState===1&&ws.bufferedAmount<1024*1024)ws.send(JSON.stringify(obj));};
 const deadline=setTimeout(()=>{if(!role)ws.close(4401,'Authentication required');},5000);
 // Close before the function lifetime; clients reconnect with backoff.
 const lifetime=setTimeout(()=>ws.close(1000,'Reconnect'),45000);
 send({type:'hello',authenticated:!!role,readOnly:true,cloudVerified:false});
 ws.on('message',async raw=>{
  if(busy){send({type:'error',code:'BUSY'});return;}busy=true;
  try{
   const msg=JSON.parse(raw.toString());
   if(!role){if(msg.type==='auth'&&allowedKey(msg.key,process.env.PRODUCER_KEY_SHA256)){role='producer';clearTimeout(deadline);send({type:'authenticated'});}else ws.close(4401,'Unauthorized');return;}
   if(msg.type==='ping'){send({type:'pong',serverUtc:new Date().toISOString(),nonce:typeof msg.nonce==='string'?msg.nonce.slice(0,64):null});return;}
   if(msg.type==='snapshot'&&role==='viewer'){send({type:'snapshot',snapshot:await latest()});return;}
   if(msg.type==='publish'&&role==='producer'){
    if(Date.now()-lastWrite<10000){send({type:'error',code:'RATE_LIMIT',retryAfterSeconds:10});return;}
    const result=await setSnapshot(msg.payload,msg.source);lastWrite=Date.now();send({type:'ack',...result});return;
   }
   send({type:'error',code:'READ_ONLY_OR_UNKNOWN'});
  }catch{send({type:'error',code:'INVALID_OR_STORAGE_UNAVAILABLE'});}finally{busy=false;}
 });
 ws.on('error',()=>{});ws.on('close',()=>{clearTimeout(deadline);clearTimeout(lifetime);});
});
export default server;
