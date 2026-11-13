/** Correlates two existing authenticated report channels. Agreement is evidence
 * about the reports, not independent broker/loaded-process or exit-loop proof. */
import {canonical,digest} from './schema.mjs';
import {compareDecimal} from './planning/decimal.mjs';
import {validateOriginalPlan} from './engine-journal.mjs';
export const TARGET_REPORT_TTL=15000;
export const TARGET_REPORT_GAPS=Object.freeze(['OLD_NATIVE_WRITER_STOP_NOT_ATTESTED','LOADED_TARGET_ARTIFACT_NOT_ATTESTED','INDEPENDENT_BROKER_QUERY_NOT_PERFORMED','EXIT_LOOP_PROGRESS_NOT_ATTESTED','ALL_NATIVE_MODIFY_CLOSE_ACTIONS_NOT_EXPOSED']);
const account=a=>a?{broker:a.broker,id:a.id,environment:a.environment,currency:a.currency}:null;
const same=(a,b)=>canonical(a)===canonical(b);
const eq=(a,b)=>a===null||b===null?a===b:compareDecimal(a,b)===0;
function recent(value,now){const t=Date.parse(value);return Number.isFinite(t)&&t<=now&&now-t<=TARGET_REPORT_TTL;}
export function compareTargetReports({engine,observer,transition,now,after=null}){
 const issues=[],positions=[],orders=[],seenIssues=new Set();let issueCount=0;const add=(code,objectId=null)=>{const k=JSON.stringify([code,objectId]);if(seenIssues.has(k))return;seenIssues.add(k);issueCount++;if(issues.length<256)issues.push({code,objectId});};
 const e=engine,o=observer?.observation,r=transition.review;
 if(!e?.available||!e.fresh||e.reason!==null||!recent(e.lastReceivedAt,now))add('TARGET_ENGINE_REPORT_NOT_FRESH');
 if(!observer?.available||!observer.fresh||observer.reason!==null||!o||!recent(observer.observedAt,now)||!recent(observer.receivedAt,now))add('TARGET_OBSERVER_NOT_FRESH');
 if(!same(account(e?.account),r.account)||!same(account(o?.account),r.account)||o?.account?.type!=='hedged')add('TARGET_ACCOUNT_REPORT_MISMATCH');
 if(e?.currentStreamId!==r.streamId||e?.gap||e?.truncated) add('TARGET_ENGINE_INCOMPLETE');
 if(!o?.coverage?.positionsComplete||!o?.coverage?.ordersComplete) add('TARGET_OBSERVER_INCOMPLETE');
 const stream=e?.streams?.find(x=>x.streamId===r.streamId);
 if(!stream||!same(stream.build,r.toBuild)||stream.cursor!==stream.highWater||BigInt(stream.cursor??'0')<=BigInt(r.afterSequence))add('TARGET_STREAM_NOT_ADVANCED');
 const isNew=row=>row&&row.fresh===true&&row.streamId===r.streamId&&same(row.sourceBuild,r.toBuild)&&row.sourceTime!==null&&recent(row.sourceTime,now)&&BigInt(row.sequence)>BigInt(r.afterSequence);
 const status=e?.status;
 if(!isNew(status)||status.report.blocked!==true)add('TARGET_BLOCKED_STATUS_NOT_CURRENT');
 if(status&&o&&Math.abs(Date.parse(status.sourceTime)-Date.parse(o.observedAt))>5000)add('TARGET_REPORT_TIME_SKEW');
 if(after){
  if(!stream||BigInt(stream.cursor)<=BigInt(after.engineCursor)||!status||BigInt(status.sequence)<=BigInt(after.statusSequence)||!o||BigInt(o.sequence)<=BigInt(after.observerSequence))add('TARGET_SECOND_SAMPLE_REQUIRED');
  if(!status||Date.parse(status.sourceTime)<=Date.parse(after.statusTime)||!o||Date.parse(o.observedAt)<=Date.parse(after.observedAt))add('TARGET_SOURCE_PROGRESS_NOT_OBSERVED');
 }
 const plans=new Map();for(const x of e?.plans??[]){try{validateOriginalPlan(x.plan);if(x.planHash!==digest(x.plan)||plans.has(x.plan.planId))throw Error();plans.set(x.plan.planId,x.plan);}catch{add('TARGET_ORIGINAL_PLAN_INVALID');}}
 const reportedPositions=new Map();for(const x of e?.positions??[]){if(reportedPositions.has(x.report.positionId))add('TARGET_POSITION_AMBIGUOUS',x.report.positionId);reportedPositions.set(x.report.positionId,x);}
 const observedPositions=new Set();for(const p of o?.positions??[]){
  observedPositions.add(p.id);const x=reportedPositions.get(p.id),plan=plans.get(x?.report.planId);let matched=true;
  if(!isNew(x)){add('TARGET_POSITION_REPORT_NOT_CURRENT',p.id);matched=false;}
  if(!plan||x?.report.exitMode!=='original_plan'){add('TARGET_POSITION_PLAN_UNCONFIRMED',p.id);matched=false;}
  if(plan&&(plan.symbol!==p.symbol||plan.side!==p.side)){add('TARGET_POSITION_PLAN_IDENTITY',p.id);matched=false;}
  if(x&&(x.report.symbol!==p.symbol||x.report.side!==p.side||!['units','entry','stop','target'].every(k=>eq(x.report[k],p[k])))){add('TARGET_POSITION_VALUES_DIFFER',p.id);matched=false;}
  if(p.stop===null){add('TARGET_POSITION_PROTECTION_NOT_REPORTED',p.id);matched=false;}
  positions.push({positionId:p.id,planId:x?.report.planId??null,matched,units:p.units,sourceBuild:x?.sourceBuild??null});
 }
 for(const [id,x]of reportedPositions)if(compareDecimal(x.report.units,'0')>0&&!observedPositions.has(id))add('TARGET_ENGINE_POSITION_NOT_OBSERVED',id);
 const active=new Map(),terminal=new Set(['filled','remainder_cancelled','remainder_expired','rejected_no_fill']);
 for(const x of e?.orders??[]){const p=x.report;
  if(!terminal.has(p.state)&&(p.requestedUnits===null||p.filledUnits===null||p.remainingUnits===null||compareDecimal(p.remainingUnits,'0')===0))add('TARGET_ACTIVE_REMAINDER_UNCONFIRMED',p.intentId);
  if(['reserved','dispatching','cancel_requested','outcome_unknown'].includes(p.state))add('TARGET_ORDER_OUTCOME_UNRESOLVED',p.intentId);
  if(!terminal.has(p.state)&&p.remainingUnits!==null&&compareDecimal(p.remainingUnits,'0')>0){if(!p.brokerOrderId||active.has(p.brokerOrderId))add('TARGET_ORDER_IDENTITY_UNCONFIRMED',p.intentId);else active.set(p.brokerOrderId,x);}
  if(terminal.has(p.state)&&(p.remainingUnits===null||compareDecimal(p.remainingUnits,'0')!==0))add('TARGET_TERMINAL_REMAINDER_UNCONFIRMED',p.intentId);
 }
 const observedOrders=new Set();for(const p of o?.orders??[]){
  observedOrders.add(p.id);const x=active.get(p.id),plan=plans.get(x?.report.planId);let matched=true;
  if(!isNew(x)){add('TARGET_ORDER_REPORT_NOT_CURRENT',p.id);matched=false;}
  if(!plan||!x||plan.intentId!==x.report.intentId){add('TARGET_ORDER_PLAN_UNCONFIRMED',p.id);matched=false;}
  const kind=plan?.orderKind==='stop_limit'?'stopLimit':plan?.orderKind;
  if(plan&&(plan.symbol!==p.symbol||plan.side!==p.side||kind!==p.kind||!['entry','stop','target'].every(k=>eq(plan[k],p[k])))){add('TARGET_ORDER_PLAN_VALUES_DIFFER',p.id);matched=false;}
  if(x&&!eq(x.report.remainingUnits,p.units)){add('TARGET_ORDER_REMAINING_UNITS_DIFFER',p.id);matched=false;}
  orders.push({brokerOrderId:p.id,intentId:x?.report.intentId??null,planId:x?.report.planId??null,matched,remainingUnits:x?.report.remainingUnits??null});
 }
 for(const [id]of active)if(!observedOrders.has(id))add('TARGET_ENGINE_ORDER_NOT_OBSERVED',id);
 if(status&&o&&(status.report.positionCount!==o.positions.length||status.report.pendingCount!==o.orders.length))add('TARGET_REPORTED_COUNTS_DIFFER');
 return{format:'th3.target-reports.comparison/1',computedAt:new Date(now).toISOString(),reportsMatched:issueCount===0,issueCount,issuesTruncated:issueCount>issues.length,issues,positions,orders,
 sample:stream&&status&&o?{engineCursor:stream.cursor,statusSequence:status.sequence,statusTime:status.sourceTime,observerSequence:o.sequence,observedAt:o.observedAt}:null,
 provenance:'TWO_SEPARATELY_PAIRED_REPORTS_NOT_INDEPENDENT_BROKER_PROOF',comparedPositionFields:['id','planId','symbol','side','units','entry','stop','target'],comparedOrderFields:['id','intentId','planId','symbol','side','kind','entry','stop','target','reportedRemainingUnits'],pendingExpiryCertified:false,nativeOrderQuantityMeaning:'OBSERVER_UNITS_COMPARED_TO_ENGINE_REMAINING_NOT_INDEPENDENTLY_CERTIFIED',
 remainingGates:TARGET_REPORT_GAPS,grantsTrading:false,entryHoldStillRequired:true,writerHandoverVerified:false,exitLoopVerified:false};
}
