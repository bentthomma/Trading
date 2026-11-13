/** Pure S02 validation; no transport, state writer, account access or broker API. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import readline from 'node:readline';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const schema=JSON.parse(fs.readFileSync(path.join(ROOT,'contracts/domain/v1/schema.json'),'utf8'));
export class ContractError extends Error {}
const need=(c,code)=>{if(!c)throw new ContractError(code);};
const decimal=/^(0|-?[1-9][0-9]*|-?(0|[1-9][0-9]*)\.[0-9]*[1-9])$/;
const timestamp=/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$/;
const MAX=18446744073709551615n;
function unicode(v,depth=0){
 need(depth<=32,'MAX_DEPTH');
 if(typeof v==='string')for(let j=0;j<v.length;j++){const c=v.charCodeAt(j);if(c>=0xd800&&c<=0xdbff){need(j+1<v.length&&v.charCodeAt(j+1)>=0xdc00&&v.charCodeAt(j+1)<=0xdfff,'INVALID_UNICODE');j++;}else need(c<0xdc00||c>0xdfff,'INVALID_UNICODE');}
 else if(v&&typeof v==='object')for(const [k,x] of Object.entries(v)){unicode(k,depth+1);unicode(x,depth+1);}
}
/** Strict JSON parse adds duplicate-key detection; no permissive object merging. */
export function strictLoad(text){
 need(Buffer.byteLength(text,'utf8')<=1_000_000,'DOCUMENT_TOO_LARGE');
 let i=0; const ws=()=>{while(/[\t\r\n ]/.test(text[i]??'x'))i++;};
 const str=()=>{const start=i++;for(;i<text.length;i++){if(text[i]==='\\'){i++;continue;}if(text[i]==='"'){i++;return JSON.parse(text.slice(start,i));}}throw new ContractError('INVALID_JSON');};
 const value=(depth=0)=>{need(depth<=32,'MAX_DEPTH');ws();if(text[i]==='"'){str();return;}if(text[i]==='{'){i++;ws();const keys=new Set();if(text[i]==='}'){i++;return;}while(true){ws();need(text[i]==='"','INVALID_JSON');const k=str();need(!keys.has(k),'DUPLICATE_JSON_KEY');keys.add(k);ws();need(text[i++]===':','INVALID_JSON');value(depth+1);ws();const c=text[i++];if(c==='}')return;need(c===',','INVALID_JSON');}}if(text[i]==='['){i++;ws();if(text[i]===']'){i++;return;}while(true){value(depth+1);ws();const c=text[i++];if(c===']')return;need(c===',','INVALID_JSON');}}const m=text.slice(i).match(/^(?:null|true|false|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/);need(!!m,'INVALID_JSON');i+=m[0].length;};
 try{value();ws();need(i===text.length,'INVALID_JSON');const v=JSON.parse(text);unicode(v);return v;}catch(e){if(e instanceof ContractError)throw e;throw new ContractError('INVALID_JSON');}
}
export function canonical(v){
 unicode(v);
 if(v===null||typeof v==='boolean')return JSON.stringify(v);
 if(typeof v==='string')return JSON.stringify(v).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
 if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>canonical(k)+':'+canonical(v[k])).join(',')+'}';
 throw new ContractError('NUMERIC_JSON_SCALAR');
}
export const fingerprint=v=>createHash('sha256').update(canonical(v),'ascii').digest('hex');
// Deliberately limited schema interpreter. The loaded schema uses only these keywords.
const keywords=new Set(['$schema','$id','$defs','title','description','$ref','oneOf','type','const','enum','pattern','minLength','maxLength','maxItems','properties','required','additionalProperties','items']);
function assertSchema(s){for(const k of Object.keys(s))need(keywords.has(k),'UNSUPPORTED_SCHEMA_KEYWORD');if(s.$defs)Object.values(s.$defs).forEach(assertSchema);if(s.properties)Object.values(s.properties).forEach(assertSchema);if(s.items)assertSchema(s.items);if(s.oneOf)s.oneOf.forEach(assertSchema);}
assertSchema(schema);
function shape(s,v){
 if(s.$ref){need(s.$ref.startsWith('#/$defs/'),'EXTERNAL_SCHEMA_REF');return shape(schema.$defs[s.$ref.slice(8)],v);}
 if(s.oneOf){let n=0;for(const q of s.oneOf)try{shape(q,v);n++;}catch(e){if(!(e instanceof ContractError))throw e;}need(n===1,'SCHEMA_REJECTED');}
 if('const'in s)need(v===s.const,'SCHEMA_REJECTED');
 if(s.enum)need(s.enum.includes(v),'SCHEMA_REJECTED');
 if(s.type){const type=v===null?'null':Array.isArray(v)?'array':typeof v;need(type===s.type,'SCHEMA_REJECTED');}
 if(typeof v==='string'){need(s.minLength===undefined||[...v].length>=s.minLength,'SCHEMA_REJECTED');need(s.maxLength===undefined||[...v].length<=s.maxLength,'SCHEMA_REJECTED');if(s.pattern)need(new RegExp(s.pattern).test(v)&&!v.endsWith('\n'),'SCHEMA_REJECTED');}
 if(s.type==='object'){for(const k of s.required??[])need(Object.hasOwn(v,k),'SCHEMA_REJECTED');for(const[k,x]of Object.entries(v)){if(!Object.hasOwn(s.properties??{},k)){need(s.additionalProperties!==false,'SCHEMA_REJECTED');continue;}shape(s.properties[k],x);}}
 if(s.type==='array'){need(s.maxItems===undefined||v.length<=s.maxItems,'SCHEMA_REJECTED');for(const x of v)shape(s.items,x);}
}
function q(v){need(typeof v==='string'&&v.length<=80&&decimal.test(v)&&!v.endsWith('\n'),'DECIMAL_NONCANONICAL');let neg=v.startsWith('-');if(neg)v=v.slice(1);const[a,b='']=v.split('.');return {n:BigInt(a+b)*(neg?-1n:1n),d:10n**BigInt(b.length)};}
const cmp=(a,b)=>a.n*b.d-b.n*a.d;
const mul=(a,b)=>({n:a.n*b.n,d:a.d*b.d});
const positive=a=>a.n>0n; const integerRatio=(a,b)=> (a.n*b.d)%(a.d*b.n)===0n;
function time(v){if(v===null)return;need(typeof v==='string'&&timestamp.test(v)&&!v.endsWith('\n'),'TIMESTAMP_FORMAT');const d=new Date(v.slice(0,23)+'Z');need(Number.isFinite(+d)&&d.toISOString().slice(0,23)===v.slice(0,23)&&v.slice(0,4)!=='0000','TIMESTAMP_CALENDAR');}
function* walk(v){yield v;if(v&&typeof v==='object')for(const x of Object.values(v))yield*walk(x);}
function resolved(catalog,group,id,kind){const rows=catalog?.[group]??[];const matches=rows.filter(e=>e.kind===kind&&e.payload?.version_id===id);need(matches.length===1,'VERSION_NOT_RESOLVED');validateEvent(matches[0],{});return matches[0];}
export function validateEvent(e,catalog={}){
 unicode(e);shape(schema,e);need(BigInt(e.sequence)>0n&&BigInt(e.sequence)<=MAX,'SEQUENCE_RANGE');need(e.payload_hash===fingerprint(e.payload),'PAYLOAD_HASH_MISMATCH');
 const t=e.times,p=e.payload,k=e.kind;Object.values(t).forEach(time);for(const v of walk(p))if(typeof v==='string'&&timestamp.test(v))time(v);
 const through=e.coverage.source_sequence_through;need(through===null||BigInt(through)<=MAX,'SEQUENCE_RANGE');if(e.coverage.completeness==='complete')need(!e.coverage.truncated&&e.coverage.gap_state==='none','COVERAGE_CONFLICT');
 if(k==='InstrumentVersion'){need(p.version_id===e.instrument_version,'INSTRUMENT_BINDING');for(const f of ['tick_size','pip_size','units_per_lot','quantity_step','minimum_quantity','maximum_quantity'])need(positive(q(p[f])),'INSTRUMENT_RANGE');need(cmp(q(p.minimum_quantity),q(p.maximum_quantity))<=0,'INSTRUMENT_RANGE');return e;}
 if(k==='PolicyVersion'){need(p.version_id===e.policy_version,'POLICY_BINDING');need(BigInt(p.revision)<=MAX&&(p.maximum_positions===null||BigInt(p.maximum_positions)<=MAX),'REVISION_RANGE');need(positive(q(p.risk_per_trade.value))&&cmp(q(p.risk_per_trade.value),q(p.total_risk.value))<=0&&cmp(q(p.total_risk.value),q('1'))<=0&&positive(q(p.minimum_margin_level.value)),'RISK_RANGE');return e;}
 if(k==='Run'){need(p.run_id===e.run_id,'RUN_BINDING');need(BigInt(p.seed)<=MAX,'SEED_RANGE');if(p.started_at!==null&&p.finished_at!==null)need(p.started_at<=p.finished_at,'RUN_TIME_ORDER');need(p.status!=='completed'||['started_at','finished_at','result_hash'].every(x=>p[x]!==null),'RUN_COMPLETION_MISSING');return e;}
 if(k==='Cashflow'){need(canonical(p.account)===canonical(e.account_ref),'ACCOUNT_BINDING');need(p.amount.currency===p.account.currency,'BOOKING_CURRENCY_MISMATCH');if(e.instrument_version!==null)resolved(catalog,'instruments',e.instrument_version,'InstrumentVersion');return e;}
 if(k==='SignalIntent')need(p.source_run_id===e.run_id,'RUN_BINDING');
 need(e.instrument_version!==null,'INSTRUMENT_MISSING');const i=resolved(catalog,'instruments',e.instrument_version,'InstrumentVersion').payload;
 for(const v of walk(p)){if(!v||typeof v!=='object'||Array.isArray(v))continue;const keys=Object.keys(v).sort().join(',');if(keys==='currency,instrument_version,per_unit,value'){need(v.instrument_version===i.version_id&&v.currency===i.quote_currency&&v.per_unit===i.base_quantity_unit,'PRICE_UNIT_MISMATCH');need(i.allows_negative_price||q(v.value).n>=0n,'NEGATIVE_PRICE');}if(keys==='conversion_version,instrument_version,unit,value'){need(v.instrument_version===i.version_id&&v.conversion_version===i.conversion_version,'QUANTITY_BINDING');need([i.base_quantity_unit,'lots'].includes(v.unit),'QUANTITY_UNIT_MISMATCH');need(q(v.value).n>=0n,'NEGATIVE_QUANTITY');}if(keys==='instrument_version,unit,value')need(v.instrument_version===i.version_id&&q(v.value).n>=0n,'DISTANCE_BINDING');}
 if('account'in p)need(canonical(p.account)===canonical(e.account_ref),'ACCOUNT_BINDING');
 if(k==='Quote')need(cmp(q(p.bid.value),q(p.ask.value))<=0,'INVERTED_QUOTE');
 if(k==='Bar'){need(BigInt(p.timeframe_seconds)>0n&&BigInt(p.timeframe_seconds)<=MAX,'TIMEFRAME_RANGE');need(p.open_time<p.close_time,'BAR_TIME_ORDER');for(const f of ['open','close'])need(cmp(q(p.low.value),q(p[f].value))<=0&&cmp(q(p[f].value),q(p.high.value))<=0,'BAR_OHLC');}
 if(k==='FeatureSnapshot'){need(new Set(p.features.map(x=>x.feature_id)).size===p.features.length,'DUPLICATE_FEATURE');p.features.forEach(x=>need(q(x.absolute_tolerance).n>=0n,'NEGATIVE_TOLERANCE'));}
 if(k==='Position')need(p.broker_protection_status!=='confirmed'||p.protection_proof_id!==null,'PROTECTION_PROOF_MISSING');
 if(k==='Cashflow')need(p.amount.currency===p.account.currency,'BOOKING_CURRENCY_MISMATCH');
 if(k==='OrderIntent'){
  need(e.policy_version!==null,'POLICY_MISSING');const pe=resolved(catalog,'policies',e.policy_version,'PolicyVersion'),policy=pe.payload;
  need(policy.status==='active'&&policy.revision===p.expected_policy_revision&&pe.payload_hash===p.policy_hash,'POLICY_BINDING');need(policy.environment===p.account.environment,'ENVIRONMENT_BINDING');need(policy.maximum_positions===null||BigInt(policy.maximum_positions)>0n,'POLICY_NO_NEW_POSITIONS');need(e.account_state==='known','ACCOUNT_STATE_UNKNOWN');need(p.account.model!=='unknown','ACCOUNT_MODEL_UNKNOWN');need(BigInt(p.expected_account_revision)<=MAX,'REVISION_RANGE');need(e.coverage.completeness==='complete'&&e.coverage.gap_state==='none'&&!e.coverage.truncated,'INPUT_COVERAGE_UNKNOWN');need(Object.values(t).every(v=>v!==null),'TIME_EVIDENCE_MISSING');need(t.event_time<=t.available_at&&t.available_at<=t.features_ready_at&&t.received_at<=t.features_ready_at&&t.features_ready_at<=t.decision_at&&t.decision_at<=t.execution_not_before&&t.execution_not_before<p.expires_at,'CAUSAL_TIME_ORDER');need(policy.effective_from<=t.decision_at&&i.effective_at<=t.decision_at,'VERSION_NOT_YET_EFFECTIVE');
  let quantity=q(p.quantity.value);if(p.quantity.unit==='lots')quantity=mul(quantity,q(i.units_per_lot));need(positive(quantity)&&cmp(q(i.minimum_quantity),quantity)<=0&&cmp(quantity,q(i.maximum_quantity))<=0,'VOLUME_RANGE');need(integerRatio(quantity,q(i.quantity_step)),'VOLUME_GRID');for(const name of ['limit_price','trigger_price','protective_stop'])if(p[name]!==null)need(integerRatio(q(p[name].value),q(i.tick_size)),'PRICE_GRID');need((p.order_type==='limit')===(p.limit_price!==null),'ORDER_LIMIT_FIELDS');need((p.order_type==='stop')===(p.trigger_price!==null),'ORDER_STOP_FIELDS');need(policy.allow_short||p.side!=='sell','POLICY_SHORT_DISABLED');
 }
 return e;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 for await(const line of readline.createInterface({input:process.stdin,crlfDelay:Infinity})){
  try{const req=strictLoad(line);const e=validateEvent(req.event,req.catalog);console.log(JSON.stringify({ok:true,canonical:canonical(e),sha256:fingerprint(e)}));}
  catch(e){console.log(JSON.stringify({ok:false,error:e instanceof ContractError?e.message:'INVALID_REQUEST'}));}
 }
}
