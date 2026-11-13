import { createHash } from 'node:crypto';
import { fail, object, text } from './errors.mjs';

export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
const p = (id,label,unit,min,max,step,def,description) => ({id,label,type:'number',unit,min,max,step,default:def,live:true,description});
export const STANDARD_MANIFEST = Object.freeze({
  id: 'hub.standard.v1', version: '1.0.0',
  capabilities: { liveConfiguration: true, telemetry: true },
  parameters: [
    p('target','Zielpuffer','%',0,45,1,25,'Abstand zum Modellziel in Prozent der Modellspanne.'),
    p('risk','Risiko / Trade','%',.1,5,.1,3,'Geplantes Stoprisiko relativ zum Eigenkapital für neue Trades.'),
    p('positions','Positionen','',0,50,1,0,'0 bedeutet budgetgesteuert; kein garantierter Positionsschutz.'),
    p('buffer','Einstiegspuffer','%',0,15,.5,2,'Anteil der Modellspanne innerhalb der Einstiegslogik.'),
    p('decay','Zielabbau','ATR/Tag',0,3,.1,1,'Abbau in Einstiegs-ATR pro Tag; nur neue Trade-Konfigurationen.'),
    p('lots','Wunschgrösse','Lots',.01,100,.01,10,'Wunschvolumen; tatsächliche Grösse unterliegt den Botlimits.'),
    p('marginMin','Margin-Minimum','%',100,5000,50,300,'Geplantes Mindest-Margin-Level nach dem Einstieg.'),
    p('totalRisk','Kontorisiko','%',.1,30,.1,15,'Summe des geplanten Stoprisikos relativ zum Eigenkapital.'),
    p('atrStop','Stop-Abstand','× ATR',.1,10,.1,2,'Stopabstand für neue Trades in Vielfachen des ATR.'),
    {id:'allowShort',label:'Short erlauben',type:'boolean',unit:'',default:true,live:true,description:'Short-Einstiege für neue Trades erlauben.'}
  ]
});

// Exact live fields from the released ExtremeLab Ready17 strategy. Its sizing
// and continuous-time exits do not implement the standard profile's lots/decay.
export const EXTREMELAB17_MANIFEST = Object.freeze({
  id:'extremelab.ready17.v1',version:'1.0.0',
  capabilities:{liveConfiguration:true,telemetry:true},
  parameters:[
    p('risk','Risiko / Trade','%',.01,20,null,1,'RiskPercent des Bots: geplantes Stoprisiko für neue Trades.'),
    p('totalRisk','Kontorisiko','%',.1,80,null,15,'TotalRiskPercent des Bots: gemeinsames Stoprisikobudget.'),
    p('marginMin','Margin-Minimum','%',100,undefined,null,300,'MinimumMarginLevel des Bots: Mindest-Margin-Level nach einem neuen Einstieg.'),
    {id:'positions',label:'Positionen',type:'integer',unit:'',min:0,max:1000,default:0,live:true,description:'MaxPositions des Bots. 0 bedeutet budgetgesteuert.'},
    {id:'allowShort',label:'Short erlauben',type:'boolean',unit:'',default:true,live:true,description:'AllowShort des Bots: Short-Einstiege für neue Trades erlauben.'}
  ]
});
export const OBSERVER_MANIFEST = Object.freeze({
  id:'th3rev.observer.v1',version:'1.0.0',parameters:[],
  capabilities:{liveConfiguration:false,telemetry:true}
});
// Current 1.9 strategy, separate 2.0 host. These seven fields are atomically
// applied by the Ready20 bridge for NEW plans only. The remaining cTrader
// parameters are deliberately not advertised as live controls.
export const TH3REV20_MANIFEST = Object.freeze({
  id:'th3rev.ready20.v1',version:'1.0.0',
  capabilities:{liveConfiguration:true,telemetry:true},
  parameters:[
    p('risk','Max. Risiko je Trade','%',.01,20,null,1,'RiskPercent: Obergrenze für neue Trades; keine feste Lotgrösse.'),
    p('scenarioRisk','Gemeinsames Szenariorisiko','%',.01,2,null,.2,'ScenarioRiskPercent18: gemeinsames Budget aller Teilorders eines neuen Szenarios.'),
    p('totalRisk','Gemeinsames Kontorisiko','%',.1,80,null,15,'TotalRiskPercent: offene und noch mögliche Belastung gemeinsam prüfen.'),
    p('symbolRisk','Risiko je Instrument','%',.1,10,null,1,'SymbolRiskPercent18: gemeinsames Budget beider Richtungen und aller Szenarien eines Instruments.'),
    p('marginMin','Mindest-Margin nach Einstieg','%',100,undefined,null,300,'MinimumMarginLevel: Mindestquote nach neuem Einstieg; freie Margin ist kein Gewinnnachweis.'),
    {id:'positions',label:'Max. Positionen (0 = Budget)',type:'integer',unit:'',min:0,max:1000,default:0,live:true,description:'MaxPositions: 0 entfernt nur die zusätzliche Anzahlgrenze; gemeinsame Budgets bleiben aktiv.'},
    {id:'allowShort',label:'Short erlauben',type:'boolean',unit:'',default:true,live:true,description:'AllowShort: gilt für neue Szenarien. Bestehende Orders und Positionen behalten ihren Plan.'}
  ]
});
export const BOT_PROFILES = Object.freeze([
  {id:STANDARD_MANIFEST.id,name:'Allgemeines Bridge-Profil',version:STANDARD_MANIFEST.version,description:'SDK-Vertrag mit zehn Parametern; benötigt einen dafür implementierten Bot.',manifest:STANDARD_MANIFEST},
  {id:EXTREMELAB17_MANIFEST.id,name:'ExtremeLab 1.7 · lokale Bridge',version:EXTREMELAB17_MANIFEST.version,description:'Fünf echte Risikoparameter der separaten ExtremeLabReady17Local-Variante.',manifest:EXTREMELAB17_MANIFEST},
  {id:OBSERVER_MANIFEST.id,name:'Th3R3v0lut10n 2.0 · nur Beobachtung',version:OBSERVER_MANIFEST.version,description:'Lesender Observer für das Demo-Hedging-Konto. Keine Orders, keine Schutzänderungen, keine Handelsfreigabe.',manifest:OBSERVER_MANIFEST},
  {id:TH3REV20_MANIFEST.id,name:'Th3R3v0lut10n 2.0 · lokale Demo-Engine',version:TH3REV20_MANIFEST.version,description:'Aktuelle 1.9-Strategiebasis mit separatem 2.0-Host. Sieben bestätigte Parameter für neue Pläne. Entwicklungskandidat; Zielhostabnahme steht aus.',manifest:TH3REV20_MANIFEST}
]);

export function validateManifest(raw) {
  if (!object(raw) || !Array.isArray(raw.parameters) || raw.parameters.length > 64) fail('MANIFEST_INVALID','Das Bot-Parameterschema ist nicht gültig.');
  if(raw.id==='th3rev.observer.v1'&&(raw.version!=='1.0.0'||raw.parameters.length!==0||raw.capabilities?.liveConfiguration!==false||raw.capabilities?.telemetry!==true))fail('OBSERVER_MANIFEST_INVALID','Der Beobachtervertrag darf keine Schreibrechte deklarieren.');
  const ids = new Set();
  const parameters = raw.parameters.map(x => {
    if (!object(x) || typeof x.id !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(x.id) || ['constructor','prototype','__proto__'].includes(x.id) || ids.has(x.id)) fail('PARAMETER_ID_INVALID','Parameter-IDs müssen eindeutig sein.');
    ids.add(x.id);
    if (!['number','integer','boolean','string','enum'].includes(x.type)) fail('PARAMETER_TYPE_UNSUPPORTED','Parametertyp wird nicht unterstützt.');
    const entry = {id:x.id,label:text(x.label || x.id,100),type:x.type,unit:typeof x.unit==='string'?x.unit.slice(0,20):'',live:x.live===true,description:typeof x.description==='string'?x.description.slice(0,500):''};
    if (['number','integer'].includes(x.type)) {
      if ((x.min!==undefined&&!Number.isFinite(x.min))||(x.max!==undefined&&!Number.isFinite(x.max))||(x.min!==undefined&&x.max!==undefined&&x.min>x.max)||Math.max(Math.abs(x.min||0),Math.abs(x.max||0))>1e12) fail('PARAMETER_BOUNDS_INVALID','Zahlengrenzen sind ungültig.');
      Object.assign(entry,{...(x.min!==undefined?{min:x.min}:{}),...(x.max!==undefined?{max:x.max}:{}),step:x.type==='integer'?1:(Number.isFinite(x.step)&&x.step>0?x.step:null)});
    }
    if (x.type==='enum') {
      if (!Array.isArray(x.options) || !x.options.length || x.options.length>100 || x.options.some(v=>typeof v!=='string'||v.length>160)) fail('PARAMETER_OPTIONS_INVALID','Auswahlwerte sind nicht gültig.');
      entry.options=[...new Set(x.options)];
    }
    entry.default = x.default;
    validateValue(entry,entry.default);
    return entry;
  });
  return {id:text(raw.id,100),version:text(raw.version,40),parameters,capabilities:{liveConfiguration:raw.capabilities?.liveConfiguration===true,telemetry:raw.capabilities?.telemetry===true}};
}
export function validateValue(p,value) {
  if (p.type==='boolean') { if (typeof value!=='boolean') fail('PARAMETER_INVALID',`${p.label}: Ja oder Nein wählen.`); }
  else if (['number','integer'].includes(p.type)) {
    if (typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1e12||value<p.min||value>p.max||(p.type==='integer'&&!Number.isSafeInteger(value))||(p.step && Math.abs((value-(p.min??0))/p.step-Math.round((value-(p.min??0))/p.step))>1e-6)) fail('PARAMETER_INVALID',`${p.label}: gültigen Wert${p.min!==undefined&&p.max!==undefined?' zwischen '+p.min+' und '+p.max:''} eingeben.`);
  } else if (typeof value!=='string'||value.length>1000||/[\u0000]/.test(value)||(p.type==='enum'&&!p.options.includes(value))) fail('PARAMETER_INVALID',`${p.label}: Wert ist nicht gültig.`);
}
export function validateValues(manifest,raw) {
  if (!object(raw) || Object.keys(raw).length!==manifest.parameters.length) fail('CONFIGURATION_INVALID','Die Konfiguration muss genau die unterstützten Parameter enthalten.');
  const values={};
  for (const p of manifest.parameters) { if (!Object.hasOwn(raw,p.id)) fail('PARAMETER_MISSING',`${p.label} fehlt.`); validateValue(p,raw[p.id]); values[p.id]=raw[p.id]; }
  if (['hub.standard.v1','extremelab.ready17.v1','th3rev.ready20.v1'].includes(manifest.id) && values.risk>values.totalRisk) fail('RISK_EXCEEDS_BUDGET','Risiko je Trade darf das Kontorisiko nicht übersteigen.');
  return values;
}
export const defaults = manifest => Object.fromEntries(manifest.parameters.map(p=>[p.id,p.default]));
