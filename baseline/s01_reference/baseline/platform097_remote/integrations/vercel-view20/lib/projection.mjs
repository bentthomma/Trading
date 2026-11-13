// Fixed read-only export. No commands, connection strings, tokens or arbitrary
// engine objects are accepted. Economic values and native IDs remain strings.
export const REMOTE20_ORIGIN='https://extremelab-bt.vercel.app';
export const REMOTE20_PATH='/api/revolution';
export const REMOTE20_INTERVAL=30000;
export const REMOTE20_ROWS=20;
export const REMOTE20_MAX_PLAIN=65536;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export const sameAccount20=(a,b)=>object(a)&&object(b)&&['broker','id','environment','currency'].every(k=>a[k]===b[k]);
function fail(){const e=Error('REMOTE_PROJECTION_INVALID');e.code='REMOTE_PROJECTION_INVALID';e.status=400;throw e;}
function exact(v,keys){if(!object(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail();}
function text(v,max=100){if(typeof v!=='string'||!v.length||v.length>max||/[\u0000-\u001f\u007f-\u009f]/u.test(v))fail();}
function nullable(v,fn){if(v!==null)fn(v);}
function number(v){if(!Number.isSafeInteger(v)||v<0||v>1000000)fail();}
function bool(v){if(typeof v!=='boolean')fail();}
export function remoteStamp20(v){if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString()!==v)fail();return Date.parse(v);}
function decimal(v){if(typeof v!=='string'||! /^-?(0|[1-9][0-9]{0,23})(?:\.[0-9]{1,18})?$/.test(v)||/^-0(?:\.0+)?$/.test(v))fail();}
function positive(v){decimal(v);if(v.startsWith('-')||/^0(?:\.0+)?$/.test(v))fail();}
function nonnegative(v){decimal(v);if(v.startsWith('-'))fail();}
function side(v){if(!['buy','sell'].includes(v))fail();}
function rowset(v,check){if(!Array.isArray(v)||v.length>REMOTE20_ROWS)fail();for(const row of v)check(row);}
export function validateRemoteAccount20(a){exact(a,['broker','id','environment','currency']);text(a.broker);text(a.id);text(a.currency,12);if(a.environment!=='demo'||! /^[A-Z0-9]{3,12}$/.test(a.currency))fail();return a;}
export function validateRemoteProjection20(v,now=Date.now(),{received=false}={}){
 exact(v,['schemaVersion','kind','writesAllowed','deviceId','botId','account','slot','capturedAt','source','counts','engine','positions','orders','plans','truncated']);
 if(v.schemaVersion!==1||v.kind!=='th3rev20_readonly'||v.writesAllowed!==false)fail();
 text(v.deviceId);text(v.botId);if(!/^[A-Za-z0-9_-]{1,100}$/.test(v.deviceId)||! /^[A-Za-z0-9_-]{1,100}$/.test(v.botId))fail();validateRemoteAccount20(v.account);
 const at=remoteStamp20(v.capturedAt);if(typeof v.slot!=='string'||v.slot!==String(Math.floor(at/REMOTE20_INTERVAL))||at>now+5000||received&&now-at>90000)fail();
 exact(v.source,['kind','fresh','sourceAt','reason','runtimeId','nonAtomic']);if(!['paired_engine_report','paired_observer'].includes(v.source.kind))fail();bool(v.source.fresh);bool(v.source.nonAtomic);nullable(v.source.sourceAt,remoteStamp20);nullable(v.source.reason,x=>text(x,100));nullable(v.source.runtimeId,text);
 if(v.source.sourceAt!==null&&Date.parse(v.source.sourceAt)>at+5000)fail();
 exact(v.counts,['positions','orders','plans','positionCountIsOpenInventory']);for(const k of ['positions','orders','plans'])nullable(v.counts[k],number);bool(v.counts.positionCountIsOpenInventory);bool(v.truncated);
 nullable(v.engine,e=>{exact(e,['blocked','reason','readySymbols','totalSymbols','candidateScenarios','pendingCount','positionCount','reasons']);bool(e.blocked);text(e.reason,100);for(const k of ['readySymbols','totalSymbols','candidateScenarios','pendingCount','positionCount'])number(e[k]);rowset(e.reasons,r=>{exact(r,['code','count']);text(r.code,100);number(r.count);});});
 rowset(v.positions,p=>{exact(p,['id','symbol','side','entry','units','stop','target','net','planId','exitMode','sourceAt']);for(const k of ['id','symbol','exitMode'])text(p[k]);side(p.side);for(const k of ['entry','net'])decimal(p[k]);nonnegative(p.units);for(const k of ['stop','target'])nullable(p[k],decimal);nullable(p.planId,text);nullable(p.sourceAt,remoteStamp20);});
 rowset(v.orders,p=>{exact(p,['id','intentId','planId','positionId','symbol','side','state','requestedUnits','filledUnits','remainingUnits','sourceAt']);for(const k of ['id','intentId','planId','positionId','symbol'])nullable(p[k],text);nullable(p.side,side);text(p.state);for(const k of ['requestedUnits','filledUnits','remainingUnits'])nullable(p[k],decimal);nullable(p.sourceAt,remoteStamp20);});
 rowset(v.plans,p=>{exact(p,['planId','symbol','side','entry','stop','target','units','riskCash','currency','reason','createdAt','validUntil','maxHoldSeconds','halfLifeSeconds']);text(p.planId);text(p.symbol);side(p.side);for(const k of ['entry','stop','target','riskCash','maxHoldSeconds','halfLifeSeconds'])decimal(p[k]);positive(p.units);text(p.currency,12);text(p.reason,500);remoteStamp20(p.createdAt);remoteStamp20(p.validUntil);});
 for(const category of ['positions','orders','plans']){if(v.counts[category]!==null&&v.counts[category]<v[category].length)fail();const keys=v[category].map(p=>category==='plans'?p.planId:category==='positions'?p.id:p.intentId??p.id);if(keys.some(k=>k===null)||new Set(keys).size!==keys.length)fail();}
 for(const row of [...v.positions,...v.orders])if(row.sourceAt!==null&&Date.parse(row.sourceAt)>at+5000)fail();
 if(new TextEncoder().encode(JSON.stringify(v)).length>REMOTE20_MAX_PLAIN)fail();return v;
}
export function validateRemotePair20(v){
 exact(v,['format','schemaVersion','origin','path','deviceId','token','botId','account','issuedAt','expiresAt','intervalMilliseconds']);
 if(v.format!=='th3rev20-view-pairing'||v.schemaVersion!==1||v.origin!==REMOTE20_ORIGIN||v.path!==REMOTE20_PATH||v.intervalMilliseconds!==REMOTE20_INTERVAL)fail();
 text(v.deviceId);text(v.botId);if(!/^[A-Za-z0-9_-]{1,100}$/.test(v.deviceId)||! /^[A-Za-z0-9_-]{1,100}$/.test(v.botId)||typeof v.token!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(v.token))fail();
 validateRemoteAccount20(v.account);if(remoteStamp20(v.expiresAt)<=remoteStamp20(v.issuedAt)||Date.parse(v.expiresAt)-Date.parse(v.issuedAt)>31*86400000)fail();return v;
}
