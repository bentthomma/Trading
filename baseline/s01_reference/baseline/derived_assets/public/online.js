'use strict';
(()=>{
 const $=id=>document.getElementById(id);let connected=false,socket=null,retry=1000,reconnectTimer,heartbeatTimer,visibleMode='archive',cursor=null,fetching=false;
 async function api(action,{method='GET',data,query=''}={}){
  const response=await fetch('/api/desk?action='+action+query,{method,credentials:'same-origin',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined,cache:'no-store',signal:AbortSignal.timeout(20000)});
  const value=await response.json();if(!response.ok){if(response.status===401&&action!=='login')lock();throw Error(value.error||'Serverfehler '+response.status);}return value;
 }
 function lock(){connected=false;$('privateArea').hidden=true;$('loginArea').hidden=false;if(socket)socket.close();clearTimeout(reconnectTimer);clearInterval(heartbeatTimer);}
 function message(x){$('onlineMessage').textContent=x;}
 function accepted(){connected=true;$('loginArea').hidden=true;$('privateArea').hidden=false;$('accessKey').value='';refreshStatus();refreshArchives();connect();}
 $('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginError').textContent='';$('loginSubmit').disabled=true;try{await api('login',{method:'POST',data:{key:$('accessKey').value.trim()}});accepted();}catch(err){$('loginError').textContent=err.message;}finally{$('loginSubmit').disabled=false;}});
 $('logoutBtn').onclick=async()=>{try{await api('logout',{method:'POST',data:{}});}catch{}location.reload();};
 async function refreshStatus(){
  if(!connected)return;
  try{const s=await api('status');$('webStatus').textContent='Website verbunden';$('technicalDetails').textContent=JSON.stringify(s,null,2);$('lastContact').textContent=s.lastReceivedAt?'Letzte Senderübertragung: '+new Date(s.lastReceivedAt).toLocaleString('de-CH')+' · nicht automatisch als cTrader Cloud verifiziert.':'Noch keine bestätigte Übertragung des cTrader-Bots.';}catch(err){$('webStatus').textContent='Verbindung unterbrochen';message(err.message);}
 }
 async function refreshArchives(append=false){
  try{const r=await api('archives',{query:append&&cursor?'&cursor='+encodeURIComponent(cursor):''});if(!append)$('archiveSelect').replaceChildren();for(const b of r.items){const o=document.createElement('option');o.value=b.id;o.textContent=new Date(b.uploadedAt).toLocaleString('de-CH')+' · '+Math.round(b.bytes/1024)+' KB · '+b.id.slice(0,8);$('archiveSelect').append(o);}if(!$('archiveSelect').options.length){const o=document.createElement('option');o.textContent='Noch kein gespeichertes Journal';o.value='';$('archiveSelect').append(o);}cursor=r.cursor;$('moreArchives').hidden=!r.hasMore;}catch(err){message(err.message);}
 }
 $('refreshArchives').onclick=()=>refreshArchives();$('moreArchives').onclick=()=>refreshArchives(true);
 $('saveArchive').onclick=async()=>{
  const events=window.ExtremeLabUI.getState().all;if(!events.length){message('Zuerst ein Journal laden.');return;}
  $('saveArchive').disabled=true;message('Journal wird komprimiert und privat gespeichert …');
  try{
   const text=JSON.stringify({events});if(new TextEncoder().encode(text).length>16*1024*1024)throw Error('Online-Archiv: maximal 16 MB. Bitte einen kürzeren Zeitraum verwenden.');
   let data={events};if(typeof CompressionStream!=='undefined'){const gzip=await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();const bytes=new Uint8Array(gzip);if(bytes.length>3*1024*1024)throw Error('Komprimiertes Archiv ist zu gross.');let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));data={encoding:'gzip-base64',data:btoa(binary)};}else if(text.length>3*1024*1024)throw Error('Browser unterstützt diese Dateigrösse ohne Kompression nicht.');
   const result=await api('archives',{method:'POST',data});message(result.count+' Ereignisse dauerhaft im privaten Vercel-Archiv gespeichert. Keine Änderung an Trades.');await refreshArchives();$('archiveSelect').value=result.id;
  }catch(err){message(err.message);}finally{$('saveArchive').disabled=false;}
 };
 $('openArchive').onclick=async()=>{const id=$('archiveSelect').value;if(!id)return;try{$('openArchive').disabled=true;const a=await api('archive',{query:'&id='+encodeURIComponent(id)});visibleMode='archive';window.ExtremeLabUI.load(JSON.stringify(a),'Privates Archiv '+id.slice(0,8));$('dataMode').textContent='Archiv · nicht live';message('Archiv geladen. Datenzeit im Chart beachten.');}catch(err){message(err.message);}finally{$('openArchive').disabled=false;}};
 window.addEventListener('extremelab-loaded',()=>{if(visibleMode!=='sender')$('dataMode').textContent='Journal-Rückblick · nicht live';});
 async function receiveSnapshot(s){
  if(!s){message('Noch kein Sender verbunden. Die Cloud-Anbindung ist weiterhin offen.');return;}
  const age=Date.now()-Date.parse(s.receivedAt),eventAge=Date.now()-Math.max(...s.events.map(e=>Date.parse(e.utc)));
  if(s.source==='transport-test'){message('Nur Transporttest — keine Brokerdaten.');return;}
  visibleMode='sender';const previous=window.ExtremeLabUI.getState().symbol;window.ExtremeLabUI.load(JSON.stringify(s),'Sender-Snapshot');if(previous)window.ExtremeLabUI.selectSymbol(previous);
  $('dataMode').textContent=age<60000&&eventAge<60000?'Senderdaten · Quelle nicht unabhängig verifiziert':'Senderdaten veraltet';
  message('Empfangen '+new Date(s.receivedAt).toLocaleString('de-CH')+'. Aktueller Snapshot im Zwischenspeicher; kein vollständiges dauerhaftes Live-Archiv.');
 }
 $('liveBtn').onclick=async()=>{try{const r=await api('latest');await receiveSnapshot(r.snapshot);}catch(err){message(err.message);}};
 function connect(){
  if(!connected||document.hidden||!navigator.onLine)return;
  try{socket=new WebSocket('wss://'+location.host+'/api/socket');}catch{return;}
  socket.onopen=()=>{retry=1000;socket.send(JSON.stringify({type:'ping',nonce:'browser'}));clearInterval(heartbeatTimer);heartbeatTimer=setInterval(()=>{if(socket.readyState===1)socket.send(JSON.stringify({type:'ping',nonce:'browser'}));},15000);};
  socket.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.type==='pong'){$('webStatus').textContent='Website: WebSocket verbunden';}}catch{}};
  socket.onerror=()=>{};
  socket.onclose=()=>{clearInterval(heartbeatTimer);if(connected){$('webStatus').textContent=navigator.onLine?'Website: Wiederverbindung …':'Website: offline';clearTimeout(reconnectTimer);reconnectTimer=setTimeout(connect,retry+Math.random()*500);retry=Math.min(30000,retry*2);}};
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(reconnectTimer);socket?.close();}else if(connected){connect();refreshStatus();}});
 window.addEventListener('online',()=>{if(connected){connect();refreshStatus();}});window.addEventListener('offline',()=>{$('webStatus').textContent='Website: offline · letzte Ansicht bleibt';socket?.close();});
 setInterval(()=>{if(connected&&!document.hidden&&!fetching){fetching=true;refreshStatus().finally(()=>fetching=false);}},60000);
 api('session').then(accepted).catch(lock);
})();
