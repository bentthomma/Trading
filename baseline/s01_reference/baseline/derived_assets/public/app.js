'use strict';
(()=>{
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const n=(v,d=2)=>num(v)===null?'—':Number(v).toLocaleString('de-CH',{minimumFractionDigits:d,maximumFractionDigits:d});
const price=v=>num(v)===null?'—':Number(v).toLocaleString('de-CH',{maximumFractionDigits:6});
const ms=s=>Date.parse(s)||0;
const tm=s=>ms(s)?new Date(ms(s)).toLocaleTimeString('de-CH',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'UTC'})+' UTC':'—';
const date=s=>ms(s)?new Date(ms(s)).toLocaleString('de-CH',{timeZone:'UTC'})+' UTC':'—';
const sign=v=>num(v)===null?'':Number(v)>0?'+':'';
const cls=v=>num(v)===null?'':Number(v)<0?'negative':Number(v)>0?'positive':'';
const labels={DEMO:'Demokonto',ENGINE:'Bot betriebsbereit',MODEL:'Modell bereit',SELECTED:'Instrument ausgewählt',MARKET:'Markt geöffnet',QUOTE:'Aktueller Kurs',HISTORY_SYNC:'Historie abgeglichen',PROTECTION:'Vorhandene Positionen geschützt',SYMBOL_POSITION:'Kein doppelter Symboltrade',PENDING_BUDGET:'Keine unbudgetierte Pending-Order',POSITION_CAP:'Positionsobergrenze',FRESH_SIGNAL:'Frisches M5-Signal',ZONE:'Extremzone',TREND:'Trendfreigabe',REVERSAL:'Umkehrkerze',DIRECTION:'Handelsrichtung erlaubt',BROKER_DIRECTION:'Broker erlaubt Richtung',COOLDOWN:'Abstand zum letzten Ausstieg',UNIQUE_SIGNAL:'Signal noch nicht gehandelt',PLAN:'Volumen, Kosten und Konto passen',ARMED:'Demo-Handel freigegeben'};
let all=[],rows=[],meta={bad:0,duplicates:0,gaps:0},run='',symbol='',decisions=[],at=-1,planSide=0,coverage=new Map(),lastStatus=null,start=null,currentPositions=[];
function parse(text){
 const events=[],keys=new Set();let bad=0,duplicates=0,ignored=0;
 if(text.length>65*1024*1024)throw Error('Datei über 65 MB. Bitte einen kleineren Journal-Zeitraum exportieren.');
 let list;try{const x=JSON.parse(text);if(Array.isArray(x))list=x;else if(Array.isArray(x.events))list=x.events;}catch{}
 const candidates=list||text.split(/\r?\n/);
 for(const line of candidates){
  let e;try{if(typeof line==='object')e=line;else{const p=line.match(/XL[12]\s+(\{.*)$/);if(p)e=JSON.parse(p[1]);else if(line.trim().startsWith('{'))e=JSON.parse(line);else{ignored++;continue;}}}
  catch{bad++;continue;}
  if(!e||!e.kind||!e.data||!e.run||!ms(e.utc)){ignored++;continue;}
  const k=e.seq?e.run+'|'+e.seq:e.run+'|'+e.kind+'|'+e.utc+'|'+JSON.stringify(e.data);
  if(keys.has(k)){duplicates++;continue;}keys.add(k);events.push(e);
 }
 events.sort((a,b)=>ms(a.utc)-ms(b.utc)||(num(a.seq)||0)-(num(b.seq)||0));
 let gaps=0,by=new Map();for(const e of events){if(e.schema===2&&num(e.seq)!==null){if(!by.has(e.run))by.set(e.run,[]);by.get(e.run).push(e.seq);}}
 for(const s of by.values()){s.sort((a,b)=>a-b);for(let i=1;i<s.length;i++)gaps+=Math.max(0,s[i]-s[i-1]-1);}
 return {events,bad,duplicates,gaps,ignored};
}
function load(text,name='Journal'){
 try{const p=parse(text);if(!p.events.length)throw Error('Keine vollständigen XL1-/XL2-Ereignisse gefunden. Bitte Journal oder events.jsonl auswählen.');all=p.events;meta=p;
  const runs=[...new Set(all.map(e=>e.run))].reverse();$('run').innerHTML=runs.map(r=>'<option>'+esc(r)+'</option>').join('');run=runs[0];$('filename').textContent=name;
  $('importer').hidden=true;$('workspace').hidden=false;$('empty').hidden=true;chooseRun();$('importError').textContent='';window.dispatchEvent(new CustomEvent('extremelab-loaded',{detail:{name}}));
 }catch(err){$('importError').textContent=err.message;$('importer').hidden=false;}
}
function chooseRun(){
 run=$('run').value;rows=all.filter(e=>e.run===run);coverage=new Map();start=rows.find(e=>e.kind==='START');
 const cov=rows.filter(e=>e.kind==='COVERAGE');for(const e of cov)for(const x of e.data.items||[])coverage.set(x.symbol,{...x,utc:e.utc});
 const un=rows.filter(e=>e.kind==='UNIVERSE_SELECTED').at(-1);for(const s of un?.data.symbols||[])if(!coverage.has(s))coverage.set(s,{symbol:s,stage:'NO_COVERAGE_RECORD'});
 lastStatus=rows.filter(e=>e.kind==='STATUS').at(-1);currentPositions=rows.filter(e=>e.kind==='POSITIONS').at(-1)?.data.items||[];
 const names=new Set([...coverage.keys(),...rows.filter(e=>e.kind==='DECISION').map(e=>e.data.Symbol)]);if(!names.has(symbol))symbol=[...names].sort()[0]||'';
 $('runStamp').textContent='Datenstand '+date(rows.at(-1)?.utc);renderSummary();renderList();selectSymbol(symbol);renderDeals();renderParams();renderQuality();
}
function renderSummary(){
 const s=lastStatus?.data||{},currency=s.currency||start?.data.accountCurrency||'CHF';const delta=num(s.accountDelta)??(num(start?.data.startingEquity)!==null&&num(s.equity)!==null?s.equity-start.data.startingEquity:null);
 $('equity').textContent=n(s.equity)+' '+currency;$('accountDelta').innerHTML='<span class="'+cls(delta)+'">'+sign(delta)+n(delta)+' '+esc(currency)+'</span><small>Kontoveränderung seit Laufstart · nicht ein-/auszahlungsbereinigt</small>';
 const v2=lastStatus?.schema===2;$('botTitle').textContent=v2?'Bot-Ergebnis seit Laufstart':'Bot-Wert aus Altlog';
 $('botPnl').textContent=(v2?sign(s.pnl):'')+n(s.pnl)+' '+currency;$('botPnl').className='value '+(v2&&s.accountCheck==='WITHIN_TOLERANCE'?cls(s.pnl):'');
 $('botSub').textContent=v2?'Abgleich: '+(s.accountCheck||'unbekannt')+' · Rest '+n(s.residual)+' '+currency:'Ungeprüfte V1.1-Kennzahl. Nicht als bestätigten Gewinn interpretieren.';
 $('coverage').textContent=n(s.ready,0)+' / '+n(s.selected??s.loaded,0);let r=(s.selected??s.loaded)>0?s.ready/(s.selected??s.loaded):0;$('coverageBar').style.width=Math.max(0,Math.min(100,r*100))+'%';
 $('coverageSub').textContent=n(s.loading??Math.max(0,(s.loaded||0)-(s.ready||0)),0)+' laden · '+n(s.pending,0)+' warten · '+n(s.failed??0,0)+' gemeldete Fehler';
 $('positions').textContent=n(s.positions,0);$('riskSub').textContent='Margin-Level '+n(s.margin,0)+' % · maximaler Lauf-DD '+n(s.dd)+' %';
 $('closedPnl').innerHTML='Geschlossene Deals <b class="'+cls(s.closedNet)+'">'+sign(s.closedNet)+n(s.closedNet)+' '+esc(currency)+'</b>';
 $('openPnl').innerHTML='Offene Positionen <b class="'+cls(s.openNet)+'">'+sign(s.openNet)+n(s.openNet)+' '+esc(currency)+'</b>';
 $('headline').textContent=v2?(s.accountCheck==='WITHIN_TOLERANCE'?'Kontorechnung innerhalb Prüftoleranz':'Kontorechnung noch nicht vollständig geklärt'):'Altlog: Beträge und Lücken getrennt beurteilen';
 $('headlineDetail').textContent=v2?'Einzelne Abweichungen können aus fehlender Brokerhistorie, Fremdtrades oder Kontobewegungen stammen. Sie werden nicht verschwiegen.':'Das Journal zeigt '+n(s.ready,0)+' bereite Modelle und '+n(s.pending,0)+' wartende Märkte. Der interne Bot-Wert ist in diesem Altlog nicht mit dem Konto abgestimmt.';
 const statuses=rows.filter(e=>e.kind==='STATUS'&&num(e.data.equity)!==null);$('equityPlot').innerHTML=linePlot(statuses.map(e=>[ms(e.utc),e.data.equity]),'Eigenkapital in '+currency);
 const blockers=s.blockers||Object.fromEntries(countLatestReasons());$('blockers').innerHTML=Object.entries(blockers).sort((a,b)=>b[1]-a[1]).slice(0,7).map(([k,v])=>'<div class="blocker"><span>'+esc(labels[k]||k)+'</span><b>'+esc(v)+'</b></div>').join('')||'<p class="muted">Keine Blockerzählung im Export.</p>';
 $('blockerNote').textContent=s.blockers?'Nicht bestandene Prüfungen der letzten Entscheidungen. Mehrfachnennungen pro Markt; keine Gewinnstatistik.':'Nur der erste damalige Grund je Instrument aus Altlog. Keine vollständige Ursachenliste.';
}
function latestMap(){const map=new Map();for(const e of rows)if(e.kind==='DECISION')map.set(e.data.Symbol,e);return map;}
function countLatestReasons(){const c={};for(const e of latestMap().values()){const k=e.data.Reason||'Unbekannt';c[k]=(c[k]||0)+1;}return Object.entries(c);}
function renderList(){
 const q=$('search').value.toUpperCase(),filter=$('marketFilter').value;const latest=latestMap();
 const names=[...new Set([...coverage.keys(),...latest.keys()])].filter(s=>s&&s.toUpperCase().includes(q)).sort();
 const filtered=names.filter(s=>{const e=latest.get(s),c=coverage.get(s);return filter==='all'||filter==='open'&&e?.data.Status==='POSITION OFFEN'||filter==='signals'&&e?.data.Feature?.Side!==0&&e?.data.Feature?.Side!=null||filter==='technical'&&(!e||c?.stage==='FAILED'||e.data.Checks?.some(x=>!x.Passed&&['QUOTE','MODEL','HISTORY_SYNC'].includes(x.Code)));});
 $('marketCount').textContent=filtered.length+' sichtbar';
 $('markets').innerHTML=filtered.map(s=>{let e=latest.get(s),d=e?.data,c=coverage.get(s),z=d?.Feature?.Z;return '<button class="market '+(s===symbol?'selected':'')+'" data-symbol="'+esc(s)+'" aria-pressed="'+(s===symbol)+'"><span class="mname">'+esc(s)+'</span><span class="mstate">'+esc(d?.Status||c?.stage||'Noch keine Entscheidung')+'</span><span class="bandmini" aria-hidden="true"><i style="left:'+Math.max(0,Math.min(100,(z??0)*100))+'%"></i></span><small>'+esc(d?.Reason||c?.problem||'Wartet auf Daten')+'</small></button>';}).join('')||'<div class="empty-inline">Keine passenden Instrumente.</div>';
 for(const el of $('markets').querySelectorAll('[data-symbol]'))el.onclick=()=>{selectSymbol(el.dataset.symbol);if(matchMedia('(max-width: 760px)').matches)$('detail').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});};
}
function selectSymbol(s){symbol=s;decisions=rows.filter(e=>e.kind==='DECISION'&&e.data.Symbol===s);at=decisions.length-1;$('replay').max=Math.max(0,at);$('replay').value=Math.max(0,at);$('replay').disabled=at<0;renderList();renderDecision();}
function barsFor(e){
 if(!e)return[];const direct=e.data.Candles;if(Array.isArray(direct)&&direct.length)return direct.filter(c=>ms(c.Time)+300000<=ms(e.utc)+1000);
 const map=new Map();for(const ev of rows){if(ms(ev.utc)>ms(e.utc))break;if(ev.data.symbol!==e.data.Symbol)continue;if(ev.kind==='BARS')for(const c of ev.data.candles||[])map.set(c.Time,c);if(ev.kind==='BAR'&&ev.data.candle)map.set(ev.data.candle.Time,ev.data.candle);}
 return [...map.values()].filter(c=>ms(c.Time)+300000<=ms(e.utc)+1000).sort((a,b)=>ms(a.Time)-ms(b.Time)).slice(-80);
}
function positionsAt(e){const p=rows.filter(x=>x.kind==='POSITIONS'&&ms(x.utc)<=ms(e.utc)).at(-1);return (Array.isArray(p?.data?.items)?p.data.items:[]).filter(x=>x.symbol===e.data.Symbol);}
function renderDecision(){
 $('symbolTitle').textContent=symbol||'Instrument wählen';const ev=decisions[at],d=ev?.data,f=d?.Feature;
 $('prev').disabled=at<=0;$('next').disabled=at>=decisions.length-1;$('decisionTime').textContent=ev?'Entscheidung '+tm(ev.utc)+' · '+(at+1)+' / '+decisions.length:'Noch keine Entscheidung im Export';
 $('replay').value=Math.max(0,at);$('reason').textContent=d?.Reason||coverage.get(symbol)?.problem||'Daten werden noch geladen.';$('state').textContent=d?.Status||coverage.get(symbol)?.stage||'Keine Daten';
 const c=coverage.get(symbol);$('quoteNow').textContent=c?'Kursalter im letzten Abdeckungsbericht: '+(c.quoteAge==null?'unbekannt':n(c.quoteAge,1)+' s')+' · Bericht '+tm(c.utc):'Kein separater aktueller Kursstatus im Altlog.';
 $('chart').innerHTML='';$('plan').innerHTML='';$('checks').innerHTML='';$('model').innerHTML='';$('active').innerHTML='';
 if(!f){$('chart').innerHTML='<div class="chartEmpty">Noch kein berechenbares Modell.<small>Kein Kursverlauf wird erfunden.</small></div>';return;}
 const ps=planSide||(f.Side<0?-1:1),p=ps<0?d.Short:d.Long,active=positionsAt(ev);const bars=barsFor(ev);
 $('chart').innerHTML=candlePlot(bars,f,p,active);$('chartCaption').textContent='Broker-Bid-M5-Kerzen bis zu dieser Entscheidung. Gestrichelt: geplanter Trade. Durchgezogen: protokollierte aktive Position. Kein Zukunftspfad.';
 const vals=[['Bandposition',n(f.Z*100,1)+' %'],['Richtungswert',n(f.Drift,3)],['ATR14',price(f.Atr)],['Untergrenze',price(f.Low)],['Obergrenze',price(f.High)],['Modell seit',tm(f.KnownAt)]];
 $('model').innerHTML=vals.map(([k,v])=>'<div><small>'+esc(k)+'</small><strong>'+esc(v)+'</strong></div>').join('');
 const cost=num(p?.CostFraction),units=num(p?.Units),isNew=cost!==null;
 $('planTitle').textContent=(ps<0?'Short':'Long')+'-Vorschau'+(f.Side===ps?' · Signalrichtung':' · kein Signal dieser Richtung');
 const planRows=[['Einstieg, geschätzt',price(p?.Entry)],['Stop-Loss',price(p?.Stop)],['Take-Profit',price(p?.Target)],['Wunsch → tatsächliche Lots',(p?.RequestedLots==null?'—':n(p.RequestedLots,3))+' → '+n(p?.Lots,3)],['Einheiten',n(units,0)],['Geplantes Stoprisiko',n(p?.Risk)+' '+(d.Currency||'')],['Ziel-Netto, geschätzt',n(p?.NetRewardEstimate)+' '+(d.Currency||'')],['Kostenanteil',isNew?n(cost*100,1)+' %':ev.schema===2?'Nicht berechenbar':'Im Altlog nicht enthalten'],['Restliches Risikobudget',n(p?.RemainingBudget)+' '+(d.Currency||'')],['Margin nach Einstieg, geschätzt',n(p?.MarginAfter,0)+' %']];
 $('plan').innerHTML=planRows.map(([k,v])=>'<div class="pair"><span>'+esc(k)+'</span><b>'+esc(v)+'</b></div>').join('')+'<p class="note">'+esc(p?.SizeReason||'')+' '+esc(p?.Block||'Planprüfung ohne gemeldete Sperre. Signalbedingungen separat prüfen.')+'</p>';
 if(d.Checks?.length)$('checks').innerHTML=d.Checks.map(x=>'<div class="check '+(x.Passed?'pass':'fail')+'"><span class="checkIcon">'+(x.Passed?'✓':'!')+'</span><div><b>'+esc(labels[x.Code]||x.Code)+'</b><small>'+esc(x.Detail||'')+'</small></div><span class="checkValue">'+(num(x.Value)===null?'':price(x.Value))+(num(x.Limit)===null?'':' / '+price(x.Limit))+'</span></div>').join('');
 else $('checks').innerHTML='<div class="note">Dieses V1.1-Log enthält nur den vorrangigen Sperrgrund, keine vollständige Prüfliste. Fehlende Bedingungen werden nicht nachträglich als bestanden markiert.</div>';
 $('formula').textContent='z = (Schlusskurs − Untergrenze) / (Obergrenze − Untergrenze)\n= ('+price(f.Close)+' − '+price(f.Low)+') / ('+price(f.High)+' − '+price(f.Low)+')\n= '+n(f.Z,6)+'\n\nLong-Zone: '+price(f.BuyLow)+' – '+price(f.BuyHigh)+'\nShort-Zone: '+price(f.SellLow)+' – '+price(f.SellHigh)+'\n\nRichtungswert ≠ Gewinnwahrscheinlichkeit.\nGewinnwahrscheinlichkeit: '+(d.Probability||'Nicht kalibriert')+'\nSignal-ID: '+(d.SignalId||d.Id)+'\nParameterkennung: '+(d.ParameterHash||'Im Altlog nicht vorhanden');
 $('active').innerHTML=active.length?active.map(p=>'<div class="position"><strong>#'+esc(p.positionId)+' · '+esc(p.side)+'</strong><span>Fill '+price(p.entry)+' · SL '+price(p.stop)+' · TP '+price(p.target)+'</span><span>Netto am letzten Positions-Snapshot: '+n(p.net)+' '+esc(d.Currency)+'</span><small>'+esc(p.protectionOnly?'Broker-Schutz unverändert; alte Zeitregel unbekannt.':'Exit-Zustand vorhanden.')+'</small>'+excursionHtml(p.excursion)+'</div>').join(''):'<p class="muted">Keine aktive Position für diesen Zeitpunkt belegt. Bei Altlogs fehlt der vollständige Positions-Snapshot.</p>';
}
function excursionHtml(x){return x?'<small>Beobachtet seit '+tm(x.From)+': bester Zwischenstand '+n(x.BestNet)+' · schlechtester '+n(x.WorstNet)+' · grösste Messlücke '+n(x.MaxGapSeconds,1)+' s'+(x.SinceAdoption?' · erst ab Übernahme':'')+'</small>':'';}
function linePlot(points,label){
 if(points.length<2)return '<p class="muted">Noch zu wenige Kontostände für einen Verlauf.</p>';
 let p=points.filter((_,i)=>i%Math.max(1,Math.floor(points.length/300))===0);if(p.at(-1)!==points.at(-1))p.push(points.at(-1));
 const w=Math.max(320,$('equityPlot').clientWidth||1100),h=125,x0=p[0][0],x1=p.at(-1)[0],lo=Math.min(...p.map(x=>x[1])),hi=Math.max(...p.map(x=>x[1]));const y=v=>105-85*(v-lo)/(hi-lo||1),x=v=>12+(w-24)*(v-x0)/(x1-x0||1);
 return '<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="'+esc(label)+'"><path d="'+p.map((v,i)=>(i?'L':'M')+x(v[0])+','+y(v[1])).join(' ')+'" fill="none" stroke="var(--accent)" stroke-width="2.5"/><text x="12" y="121" fill="var(--muted)" font-size="13">'+esc(tm(new Date(x0).toISOString()))+'</text><text x="'+(w-12)+'" y="121" text-anchor="end" fill="var(--muted)" font-size="13">'+esc(tm(new Date(x1).toISOString()))+'</text><text x="'+(w-12)+'" y="17" text-anchor="end" fill="var(--muted)" font-size="13">'+n(lo)+' – '+n(hi)+'</text></svg>';
}
function candlePlot(bars,f,p,active){
 if(!bars.length)return '<div class="chartEmpty">Für diesen Entscheidungszeitpunkt fehlen Kerzen.<small>Bandwerte stehen trotzdem in der Modellansicht.</small></div>';
 const mobile=innerWidth<=760;const W=Math.max(320,Math.min(900,$('chart').clientWidth||900)),H=mobile?300:385,L=12,R=mobile?86:115,T=25,B=36,ww=W-L-R,hh=H-T-B; if(mobile)bars=bars.slice(-40);
 const prices=bars.flatMap(c=>[c.Low,c.High]).concat([f.Low,f.High,p?.Stop,p?.Target,p?.Entry],active.flatMap(x=>[x.entry,x.stop,x.target])).map(num).filter(v=>v!==null&&v>0);
 const lo=Math.min(...prices),hi=Math.max(...prices),pad=(hi-lo)*.09||.001,y=v=>T+(hi+pad-v)/(hi-lo+2*pad)*hh,x=i=>L+(i+.5)*ww/bars.length;
 let content='';for(let j=0;j<5;j++){let v=lo+j*(hi-lo)/4;content+='<path d="M'+L+' '+y(v)+'H'+(W-R)+'" stroke="var(--line)"/><text x="'+(W-R+8)+'" y="'+(y(v)+4)+'" fill="var(--muted)" font-size="12">'+price(v)+'</text>';}
 for(const [a,b,color]of[[f.BuyLow,f.BuyHigh,'#2acfa8'],[f.SellLow,f.SellHigh,'#fd9e83']])content+='<rect x="'+L+'" y="'+y(b)+'" width="'+ww+'" height="'+Math.max(1,y(a)-y(b))+'" fill="'+color+'" opacity=".12"/>';
 for(const [i,c] of bars.entries()){let col=c.Close>=c.Open?'#68d4bd':'#e9919b',cw=Math.max(2,ww/bars.length*.55);content+='<g><title>'+esc(date(c.Time))+' | O '+price(c.Open)+' H '+price(c.High)+' L '+price(c.Low)+' C '+price(c.Close)+'</title><path d="M'+x(i)+' '+y(c.High)+'V'+y(c.Low)+'" stroke="'+col+'"/><rect x="'+(x(i)-cw/2)+'" y="'+y(Math.max(c.Open,c.Close))+'" width="'+cw+'" height="'+Math.max(1,Math.abs(y(c.Open)-y(c.Close)))+'" fill="'+col+'"/></g>';}
 const lines=[[f.Low,'Band unten','#6f8fb5',false],[f.High,'Band oben','#6f8fb5',false],[p?.Entry,'Plan Entry','#b6c9f0',true],[p?.Stop,'Plan SL','#e9919b',true],[p?.Target,'Plan TP','#68d4bd',true]];
 for(const a of active)lines.push([a.entry,'Fill #'+a.positionId,'#f2e6ac',false],[a.stop,'Aktiv SL','#ffa0b2',false],[a.target,'Aktiv TP','#42eac1',false]);
 let labelYs=[];for(const[v,label,color,dash]of lines){if(num(v)===null||v<=0)continue;let yy=y(v),ly=yy;while(labelYs.some(z=>Math.abs(z-ly)<13))ly+=14;ly=Math.min(H-B,Math.max(T,ly));labelYs.push(ly);content+='<path d="M'+L+' '+yy+'H'+(W-R)+'" stroke="'+color+'" stroke-width="1.2"'+(dash?' stroke-dasharray="6 5"':'')+'/>';content+='<text x="'+(W-R-7)+'" y="'+(ly-4)+'" text-anchor="end" fill="'+color+'" font-size="12">'+esc(label)+' '+price(v)+'</text>';}
 content+='<text x="'+L+'" y="'+(H-12)+'" fill="var(--muted)" font-size="12">'+esc(tm(bars[0].Time))+'</text><text x="'+(W-R)+'" y="'+(H-12)+'" text-anchor="end" fill="var(--muted)" font-size="12">'+esc(tm(bars.at(-1).Time))+(mobile?'':' · Pausen komprimiert')+'</text>';
 return '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(symbol)+' Kurschart mit Modellband, Einstiegszonen und Handelsplan">'+content+'</svg>';
}
function renderDeals(){
 const map=new Map();for(const e of rows)if(['DEAL_RECONCILED','POSITION_CLOSED'].includes(e.kind)){const d=e.data;map.set(d.key||String(d.positionId),{...d,utc:e.utc});}
 const ds=[...map.values()].sort((a,b)=>ms(b.brokerCloseUtc||b.closingTimeFromHistory||b.utc)-ms(a.brokerCloseUtc||a.closingTimeFromHistory||a.utc));
 $('dealsBody').innerHTML=ds.map(d=>'<tr><td>'+esc(d.symbol)+'</td><td>'+esc(d.positionId)+'</td><td>'+esc(tm(d.brokerCloseUtc||d.closingTimeFromHistory||d.utc))+'</td><td>'+price(d.entry)+'</td><td>'+price(d.close??d.closingPriceFromHistory)+'</td><td class="'+cls(d.net)+'">'+sign(d.net)+n(d.net)+'</td><td>'+esc(d.reason||'Ursache unbekannt')+'</td></tr>').join('')||'<tr><td colspan="7">Noch keine Schliessung im gewählten Export.</td></tr>';
 $('dealNote').textContent=ds.length+' Abschlussdatensätze im Export. Teilschliessungen separat; Korrekturen gleicher Deal-ID ersetzen den alten Stand. Eine fehlende Schliessung wird nicht ergänzt.';
}
function renderParams(){const p=start?.data.parameters||start?.data||{};$('parameters').textContent=JSON.stringify(p,null,2);}
function renderQuality(){
 const killed=all.filter(e=>e.kind==='INTERRUPTION').length;let v=rows.some(e=>e.schema===2);let warnings=[];
 if(!start)warnings.push('START-Ereignis fehlt: Laufbasis unvollständig.');if(!v)warnings.push('Altlog XL1: keine verlässliche Ereignisnummerierung; keine vollständige Prüfliste.');
 if(meta.bad)warnings.push(meta.bad+' unlesbare strukturierte Zeilen.');if(meta.gaps)warnings.push(meta.gaps+' fehlende XL2-Ereignisnummern zwischen vorhandenen Ereignissen.');
 if(meta.duplicates)warnings.push(meta.duplicates+' identische Ereignisse entfernt.');
 const ad=rows.filter(e=>e.kind==='POSITION_ADOPTED').length,fi=new Set(rows.filter(e=>e.kind==='ORDER_FILLED').map(e=>e.data.positionId)).size,cl=new Set(rows.filter(e=>['POSITION_CLOSED','POSITION_FINISHED'].includes(e.kind)).map(e=>e.data.positionId)).size,pos=lastStatus?.data.positions;
 if(!v&&ad+fi-cl!==pos)warnings.push('Positionsübergänge nicht vollständig erklärbar: übernommen '+ad+', neue Fills '+fi+', dokumentiert geschlossen '+cl+', zuletzt offen '+(pos??'unbekannt')+'.');
 if(!warnings.length)warnings.push('Keine erkannten internen Sequenzlücken. Das beweist nicht, dass Anfang und Ende des Exports vollständig sind.');
 $('quality').innerHTML=warnings.map(x=>'<p>'+esc(x)+'</p>').join('');
 $('qualityLabel').textContent=(meta.bad||meta.gaps||!v)?'Datenprüfung beachten':'XL2 eingelesen';
 $('logStats').textContent=all.length+' eindeutige Ereignisse · '+rows.length+' im Lauf · '+meta.bad+' beschädigt · '+meta.gaps+' Sequenzlücken';
}
function download(name,body,type='application/json'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([body],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),10000);}
$('file').onchange=async e=>{if(e.target.files[0])load(await e.target.files[0].text(),e.target.files[0].name);};
$('pasteLoad').onclick=()=>load($('paste').value,'Eingefügtes Journal');$('importBtn').onclick=()=>{$('importer').hidden=!$('importer').hidden;};
$('run').onchange=chooseRun;$('search').oninput=renderList;$('marketFilter').onchange=renderList;
$('prev').onclick=()=>{at=Math.max(0,at-1);renderDecision();};$('next').onclick=()=>{at=Math.min(decisions.length-1,at+1);renderDecision();};$('latest').onclick=()=>{at=decisions.length-1;renderDecision();};$('replay').oninput=e=>{at=+e.target.value;renderDecision();};
$('planSide').onchange=e=>{planSide=+e.target.value;renderDecision();};
$('export').onclick=()=>download('ExtremeLab_Analyse_'+(run||'leer')+'.json',JSON.stringify({format:'ExtremeLabAnalysis/2',source:'imported_journal_not_live',meta:{bad:meta.bad,duplicates:meta.duplicates,gaps:meta.gaps},selectedRun:run,events:all},null,2));
$('exportCurrent').onclick=()=>{const e=decisions[at];if(e)download('ExtremeLab_'+symbol+'_Entscheidung.json',JSON.stringify({event:e,bars:barsFor(e),positions:positionsAt(e)},null,2));};
$('noteSave').onclick=()=>{const e=decisions[at];if(e)download('ExtremeLab_'+symbol+'_Notiz.json',JSON.stringify({decisionId:e.data.Id,symbol,utc:e.utc,note:$('note').value,notAnOrder:true},null,2));};
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(rows.length){renderSummary();renderDecision();}},120);});
window.ExtremeLabUI={parse,load,getState:()=>({all,rows,run,symbol,at,meta,decision:decisions[at],bars:barsFor(decisions[at])}),selectSymbol};
let embedded=document.getElementById('embeddedData');if(embedded?.textContent.trim()){try{const x=JSON.parse(embedded.textContent);if(x.events?.length)load(embedded.textContent,'Archiv');}catch{}}
})();
