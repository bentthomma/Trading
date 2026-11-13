'use strict';
(()=>{
const $=id=>document.getElementById(id), POLL=10000;
const messages={OWNER_LOGIN_REQUIRED:'Bitte mit deinem Website-Zugangscode anmelden.',CTRADER_NOT_PAIRED:'Noch kein cTrader-Konto verbunden.',CTRADER_TOKEN_EXPIRED:'cTrader hat den Token abgelehnt oder die Sitzung ist abgelaufen. In cTrader Web neu anmelden und die Konfiguration erneut kopieren.',DEMO_ACCOUNT_REQUIRED:'Die Antwort gehört zu einem Live-Konto. Hier nur das gewünschte Demokonto verbinden.',ORIGIN_REJECTED:'Anfrageherkunft nicht zulässig. Die Seite direkt auf extremelab-bt.vercel.app öffnen.',INVALID_CONFIGURATION:'Die kopierte Konfiguration ist nicht lesbar. Den vollständigen JSON-Inhalt oder nur den Kontotoken einfügen.',OFFICIAL_CTRADER_URL_REQUIRED:'Nur eine offizielle cTrader-Remote-MCP-Konfiguration wird akzeptiert.',SELECT_ONE_CTRADER_CONFIGURATION:'Bitte nur die Konfiguration eines cTrader-Kontos einfügen.',INVALID_TOKEN:'Der Kontotoken hat ein ungültiges Format.',CTRADER_RATE_LIMIT:'cTrader begrenzt die Abfragen. Die nächste Abfrage erfolgt mit Abstand.',MCP_UNREACHABLE:'cTrader ist momentan nicht erreichbar.',MCP_TIMEOUT:'Die Kontoabfrage hat zu lange gedauert.',READ_TOOL_UNAVAILABLE:'Die erwartete Leseabfrage fehlt in der gelieferten Schnittstelle.',TOOL_ARGUMENTS_UNSUPPORTED:'Die bereitgestellte Schnittstelle verlangt noch nicht unterstützte Argumente. Es werden keine Werte geraten.',TOOL_OUTPUT_UNSUPPORTED:'Das Antwortformat wird noch nicht unterstützt; keine Zahlen werden erfunden.',BALANCE_SHAPE_UNSUPPORTED:'Der Kontodatensatz hat ein noch nicht unterstütztes Format.',POSITIONS_SHAPE_UNSUPPORTED:'Der Positionsdatensatz hat ein noch nicht unterstütztes Format.',DATA_PROFILE_CONTAINS_TRADING_TOOLS:'Das Datenprofil enthält unerwartet Handelswerkzeuge. Die Verbindung wurde abgebrochen.'};
let owner=false,paired=false,busy=false,paused=false,timer=null,last=null,failed=0,generation=0,lastSuccess=0;
const format=s=>s===null||s===undefined?'—':String(s);
function status(text){$('connectionState').textContent=text;}
function error(code){$('readerError').textContent=messages[code]||('Abfrage nicht bestätigt ('+String(code||'NETZWERKFEHLER').slice(0,80)+'). Der letzte bekannte Stand bleibt sichtbar.');}
function buttonState(){for(const id of ['ownerSubmit','connectButton','refreshButton','disconnectButton'])$(id).disabled=busy;}
async function api(action,body){
 const r=await fetch('/api/account-live?action='+action,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)}),signal:AbortSignal.timeout(26000)});
 let data;try{data=await r.json();}catch{throw Error('INVALID_SERVER_RESPONSE');}
 if(!r.ok)throw Error(data.error||'REQUEST_FAILED');return data;
}
function clearAccount(){last=null;lastSuccess=0;$('accountData').hidden=true;$('positionRows').replaceChildren();$('qualityInfo').textContent='';$('dataTime').textContent='Noch keine Kontodaten empfangen.';}
function showPairing(){paired=false;clearTimeout(timer);$('pairBox').hidden=!owner;$('readerControls').hidden=true;status('Nicht verbunden');}
function renderRows(){
 if(!last)return;const q=$('positionSearch').value.trim().toUpperCase();$('positionRows').replaceChildren();
 const list=last.positions.filter(p=>(p.symbol||'').toUpperCase().includes(q));
 for(const p of list){const tr=document.createElement('tr');for(const v of [p.symbol+' / '+format(p.id),p.side,format(p.units),format(p.entry),format(p.stop),format(p.target),format(p.unrealizedPnl),format(p.bid)+' / '+format(p.ask),p.quoteUtc?new Date(p.quoteUtc).toLocaleString('de-CH'):'Nicht geliefert']){const td=document.createElement('td');td.textContent=v;tr.append(td);}$('positionRows').append(tr);}
 if(!list.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=9;td.textContent=q?'Keine passenden Positionen.':'Keine offenen Positionen in dieser bestätigten Antwort.';tr.append(td);$('positionRows').append(tr);}
}
function render(snapshot){
 if(!snapshot||snapshot.source!=='CTRADER_REMOTE_MCP_DATA'||snapshot.readOnly!==true||!Array.isArray(snapshot.positions)||!snapshot.account||!Number.isFinite(Date.parse(snapshot.observedAt)))throw Error('INVALID_SERVER_RESPONSE');
 last=snapshot;lastSuccess=Date.now();$('accountData').hidden=false;$('readerError').textContent='';
 const a=snapshot.account,currency=a.currency;
 $('accountEquity').textContent=format(a.equity)+' '+currency;$('accountBalance').textContent=format(a.balance)+' '+currency;$('accountMargin').textContent=format(a.freeMargin)+' '+currency;$('accountPositions').textContent=String(snapshot.positionCount);
 $('accountIdentity').textContent='Konto '+format(a.id)+' · '+snapshot.environmentClaim;
 $('pnlMeaning').textContent='* '+snapshot.pnlMeaning;$('pendingCount').textContent='Pending Orders: '+format(snapshot.pendingCount);
 $('qualityInfo').textContent=JSON.stringify({source:snapshot.source,observedAt:snapshot.observedAt,startedAt:snapshot.startedAt,toolTimes:snapshot.toolTimes,warnings:snapshot.warnings,nonAtomicSnapshot:snapshot.nonAtomicSnapshot,botInternalsAvailable:false},null,2);
 renderRows();markFreshness();
}
function markFreshness(){
 if(!last)return;
 const age=Math.max(0,Math.floor((Date.now()-Date.parse(last.observedAt))/1000));
 $('dataTime').textContent='Letzte erfolgreiche Kontoabfrage: '+new Date(last.observedAt).toLocaleString('de-CH')+' · '+age+' s alt. Keine Aussage über den Bot-Verbindungsstatus.';
 if(!paired)status('Nicht verbunden · letzter Stand');
 else if(paused)status('Pausiert · letzter Stand');
 else if(!navigator.onLine||document.hidden)status('Abfrage unterbrochen · letzter Stand');
 else if(failed||age>30||Date.now()-lastSuccess>30000)status('Veraltet · erneute Abfrage nötig');
 else status(last.partial?'Konto aktualisiert · Teildaten':'Konto aktualisiert');
}
function schedule(){clearTimeout(timer);if(owner&&paired&&!paused&&!document.hidden&&navigator.onLine)timer=setTimeout(poll,Math.min(60000,POLL*2**Math.min(failed,3)));}
async function poll(){
 if(busy||!paired||!owner||paused||document.hidden||!navigator.onLine){schedule();return;}
 const ticket=generation;busy=true;buttonState();
 try{const x=await api('snapshot');if(ticket!==generation)return;render(x.snapshot);failed=0;markFreshness();}
 catch(e){if(ticket!==generation)return;failed++;error(e.message);if(e.message==='OWNER_LOGIN_REQUIRED'){owner=false;showPairing();clearAccount();$('ownerLogin').hidden=false;}else if(['CTRADER_TOKEN_EXPIRED','CTRADER_NOT_PAIRED','DEMO_ACCOUNT_REQUIRED'].includes(e.message)){showPairing();}markFreshness();}
 finally{busy=false;buttonState();schedule();}
}
async function init(){
 try{const r=await fetch('/api/desk?action=session',{credentials:'same-origin',cache:'no-store'});owner=r.ok;$('ownerLogin').hidden=owner;if(!owner){status('Website-Anmeldung erforderlich');return;}
 const s=await api('status');paired=s.paired===true;$('pairBox').hidden=paired;$('readerControls').hidden=!paired;$('expiry').textContent=s.expiresAt?'Lokale Verbindung gültig bis '+new Date(s.expiresAt).toLocaleString('de-CH'):'';
 if(paired){status('Kontoabfrage starten');poll();}else status('Kontofreigabe fehlt');
 }catch(e){error(e.message);status('Verbindung nicht geprüft');}
}
$('ownerForm').addEventListener('submit',async e=>{e.preventDefault();if(busy)return;busy=true;buttonState();try{const key=$('ownerKey').value;$('ownerKey').value='';const r=await fetch('/api/desk?action=login',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({key}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('OWNER_LOGIN_REQUIRED');$('readerError').textContent='';}catch(e){error(e.message);}finally{busy=false;buttonState();await init();}});
$('pairForm').addEventListener('submit',async e=>{e.preventDefault();if(busy)return;busy=true;generation++;buttonState();status('Kontofreigabe prüfen');try{const configuration=$('configuration').value;$('configuration').value='';const x=await api('connect',{configuration,demoConfirmed:$('demoConfirmed').checked});paired=true;failed=0;paused=false;$('pairBox').hidden=true;$('readerControls').hidden=false;$('expiry').textContent=x.expiresAt?'Lokale Verbindung gültig bis '+new Date(x.expiresAt).toLocaleString('de-CH'):'';render(x.snapshot);}catch(e){error(e.message);status('Konto nicht verbunden');}finally{busy=false;buttonState();schedule();}});
$('disconnectButton').addEventListener('click',async()=>{if(busy)return;busy=true;generation++;clearTimeout(timer);buttonState();try{await api('disconnect',{});clearAccount();showPairing();$('readerError').textContent='';}catch(e){error(e.message);}finally{busy=false;buttonState();}});
$('refreshButton').addEventListener('click',()=>{paused=false;$('pauseButton').textContent='Abfragen pausieren';$('pauseButton').setAttribute('aria-pressed','false');poll();});
$('pauseButton').addEventListener('click',()=>{paused=!paused;$('pauseButton').textContent=paused?'Abfragen fortsetzen':'Abfragen pausieren';$('pauseButton').setAttribute('aria-pressed',String(paused));markFreshness();schedule();});
$('positionSearch').addEventListener('input',renderRows);
document.addEventListener('visibilitychange',()=>{markFreshness();if(!document.hidden)poll();else clearTimeout(timer);});
window.addEventListener('online',()=>poll());window.addEventListener('offline',()=>{clearTimeout(timer);markFreshness();});
setInterval(markFreshness,1000);init();
})();
