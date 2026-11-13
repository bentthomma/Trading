/**
 * Deterministic session/horizon planning. These functions do not query a broker,
 * own a timer, issue a grant, send an order or confirm that an account is flat.
 * A host must supply fresh native evidence and call again on its independent
 * timer and immediately before a send. All reserves are explicit policy inputs.
 */
import {fail,object} from '../errors.mjs';
import {validateDecimal,compareDecimal} from './decimal.mjs';

const MAX_TIME=253402300799999; // Last millisecond representable in four-digit UTC years.
const YEAR_MS=366*24*60*60*1000;
const POLICIES=['observationTtlMs','quoteTtlMs','maxFutureSkewMs','closeConfirmationReserveMs','additionalUnwindReserveMs','lateActivationReserveMs','admissionLatencyReserveMs','minimumPendingLifetimeMs','windDownBeforeCloseMs','maxClockDriftMs','maxTimerGapMs'];
const MODES=['full','long_only','short_only','close_only','disabled','unknown'];

function invalid(code,message){fail(code,message);}
function record(value,label){if(!object(value))invalid('SESSION_INPUT_INVALID',label+' muss ein Objekt sein.');return value;}
function text(value,label){if(typeof value!=='string'||!value.length||value.length>160||/[\u0000-\u001f\u007f-\u009f]/u.test(value))invalid('SESSION_INPUT_INVALID',label+' ist ungültig.');return value;}
function integer(value,label,min=0,max=YEAR_MS){if(!Number.isSafeInteger(value)||value<min||value>max)invalid('SESSION_INPUT_INVALID',label+' ist keine zulässige ganze Zahl.');return value;}
function wallTime(value){return integer(value,'now',0,MAX_TIME);}
function time(value,label,{nullable=false}={}){
  if(value===null&&nullable)return null;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))invalid('SESSION_TIME_INVALID',label+' benötigt UTC mit Millisekunden und Z.');
  const parsed=Date.parse(value);
  if(!Number.isSafeInteger(parsed)||parsed<0||parsed>MAX_TIME||new Date(parsed).toISOString()!==value)invalid('SESSION_TIME_INVALID',label+' ist kein gültiger UTC-Zeitpunkt.');
  return parsed;
}
function iso(value){if(value!==null&&(!Number.isSafeInteger(value)||value<0||value>MAX_TIME))invalid('SESSION_TIME_RANGE','Der berechnete Zeitpunkt liegt ausserhalb des UTC-Vertrags.');return value===null?null:new Date(value).toISOString();}
function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}
function freshness(at,now,ttl,skew=0){return at!==null&&at<=now+skew&&now-at<=ttl;}
function earlier(...values){const finite=values.filter(v=>v!==null);return finite.length?Math.min(...finite):null;}
function policyOf(value){
  record(value,'policy');
  const result={};
  for(const key of POLICIES)result[key]=integer(value[key],key,['observationTtlMs','quoteTtlMs','minimumPendingLifetimeMs','maxTimerGapMs'].includes(key)?1:0);
  if(result.windDownBeforeCloseMs<result.closeConfirmationReserveMs)invalid('SESSION_POLICY_INVALID','Der Abbau muss spätestens vor dem verbindlichen Schliessfenster beginnen.');
  return result;
}

/**
 * Counts already reserved operation-attempt slots, not broker rate-limit maxima.
 * A slot is {id,at}; IDs must be unique across both channels. A caller must budget
 * possible late-fill positions as well as currently open positions. Retry count
 * is an explicit conservative allowance, not a guarantee of broker acceptance.
 */
export function planUnwindCapacity(input){
  record(input,'operations');const now=wallTime(input.now),observed=time(input.observedAt,'operations.observedAt');
  const deadline=time(input.deadlineAt,'operations.deadlineAt'),ttl=integer(input.observationTtlMs,'operations.observationTtlMs',1);
  const response=integer(input.responseReserveMs,'operations.responseReserveMs'),attempts=integer(input.attemptsPerAction,'operations.attemptsPerAction',1,100);
  const pending=integer(input.pendingOrders,'pendingOrders',0,100000),positions=integer(input.positions,'positions',0,100000);
  const possible=integer(input.possibleLateFills,'possibleLateFills',0,100000),newPending=integer(input.proposedPendingOrders,'proposedPendingOrders',0,100000),newPositions=integer(input.proposedPositions,'proposedPositions',0,100000);
  if(typeof input.inventoryComplete!=='boolean'||!['test_policy','reserved_scheduler'].includes(input.capacitySource))invalid('SESSION_INPUT_INVALID','Operationsbestand und Herkunft müssen ausdrücklich angegeben werden.');
  const ids=new Set();
  function slots(rows,label){
    if(!Array.isArray(rows)||rows.length>20000)invalid('SESSION_OPERATIONS_INVALID',label+' ist nicht begrenzt.');
    return rows.map(row=>{record(row,'slot');text(row.id,'slot.id');const at=time(row.at,'slot.at');if(ids.has(row.id))invalid('SESSION_SLOT_DUPLICATE','Ein Operationsslot wurde mehrfach gezählt.');ids.add(row.id);return at;})
      .filter(at=>at>=now&&at+response<=deadline).sort((a,b)=>a-b);
  }
  const cancel=slots(input.cancelSlots,'cancelSlots'),close=slots(input.closeSlots,'closeSlots');
  const cancelNeeded=(pending+newPending)*attempts,closeNeeded=(positions+possible+newPositions)*attempts;
  const reason=!input.inventoryComplete?'UNWIND_INVENTORY_UNKNOWN':!freshness(observed,now,ttl)?'UNWIND_CAPACITY_STALE':deadline<=now?'UNWIND_DEADLINE_REACHED':cancel.length<cancelNeeded?'UNWIND_CANCEL_CAPACITY':close.length<closeNeeded?'UNWIND_CLOSE_CAPACITY':null;
  const finish=reason?null:Math.max(now,cancelNeeded?cancel[cancelNeeded-1]+response:now,closeNeeded?close[closeNeeded-1]+response:now);
  return freeze({checkedAt:iso(now),deadlineAt:iso(deadline),fits:reason===null,reason,capacitySource:input.capacitySource,
    cancelAttemptsNeeded:cancelNeeded,closeAttemptsNeeded:closeNeeded,cancelAttemptsAvailable:cancel.length,closeAttemptsAvailable:close.length,
    estimatedFinishAt:iso(finish),brokerExecutionGuaranteed:false});
}

/**
 * input: now (UTC ms), fresh market evidence, immutable plan horizon, explicit
 * policy, a monotone clock sample, reconciliation proof and operation slots.
 * calendarMode is session / continuous / unknown. Continuous is never inferred
 * from a missing close time. Additional optional fields are documented in docs.
 */
export function evaluateSession(input){
  record(input,'session');const now=wallTime(input.now),policy=policyOf(input.policy),plan=record(input.plan,'plan');
  const observed=time(input.observedAt,'observedAt',{nullable:true}),quote=time(input.quoteAt,'quoteAt',{nullable:true});
  if(![true,false,null].includes(input.marketOpen)||!MODES.includes(input.tradingMode)||!['session','continuous','unknown'].includes(input.calendarMode))invalid('SESSION_INPUT_INVALID','Markt-, Richtungs- und Kalenderzustand müssen ausdrücklich angegeben werden.');
  if(!['buy','sell'].includes(plan.side))invalid('SESSION_INPUT_INVALID','Die Planrichtung ist ungültig.');
  const setup=time(plan.setupValidUntil,'setupValidUntil'),trigger=plan.triggerValidUntil===undefined?setup:time(plan.triggerValidUntil,'triggerValidUntil');
  const maxHold=integer(plan.maxHoldMs,'maxHoldMs',1);
  const close=time(input.nextCloseAt,'nextCloseAt',{nullable:true}),sessionId=input.sessionId===null?null:text(input.sessionId,'sessionId');
  const originalClose=plan.boundSessionCloseAt===undefined?null:time(plan.boundSessionCloseAt,'boundSessionCloseAt',{nullable:true});
  let bid=null,ask=null;
  if((input.bid===null)!==(input.ask===null))invalid('SESSION_QUOTE_INVALID','Bid und Ask müssen gemeinsam vorhanden oder unbekannt sein.');
  if(input.bid!==null){bid=validateDecimal(input.bid);ask=validateDecimal(input.ask);}
  const reasons=[];const add=reason=>{if(reason&&!reasons.includes(reason))reasons.push(reason);};
  const marketFresh=freshness(observed,now,policy.observationTtlMs,policy.maxFutureSkewMs);
  if(input.marketOpen===false)add('MARKET_CLOSED');else if(input.marketOpen===null)add('MARKET_STATUS_UNKNOWN');
  if(observed===null)add('MARKET_OBSERVATION_UNKNOWN');else if(observed>now+policy.maxFutureSkewMs)add('MARKET_TIME_IN_FUTURE');else if(!marketFresh)add('MARKET_OBSERVATION_STALE');
  if(input.tradingMode==='unknown')add('TRADING_MODE_UNKNOWN');
  else if(input.tradingMode==='disabled')add('TRADING_DISABLED');
  else if(input.tradingMode==='close_only')add('CLOSE_ONLY');
  else if(input.tradingMode==='long_only'&&plan.side==='sell'||input.tradingMode==='short_only'&&plan.side==='buy')add('DIRECTION_NOT_ALLOWED');

  let boundary=close,boundaryKind=close===null?null:'session_close',continuous=null;
  if(input.calendarMode==='unknown')add('SESSION_CALENDAR_UNKNOWN');
  else if(input.calendarMode==='session'&&close===null)add('SESSION_CLOSE_UNKNOWN');
  else if(input.calendarMode==='continuous'){
    if(close!==null)invalid('SESSION_CALENDAR_CONFLICT','Durchgehende Sitzung und endliche Schlusszeit dürfen nicht verwechselt werden.');
    continuous=input.continuousPolicy??null;
    if(!object(continuous)||continuous.approved!==true)add('CONTINUOUS_POLICY_REQUIRED');
    else {
      text(continuous.id,'continuousPolicy.id');const rolling=integer(continuous.rollingHoldMs,'rollingHoldMs',1);
      if(maxHold>rolling)add('CONTINUOUS_HOLD_EXCEEDED');
      if(continuous.fundingBudgetApproved!==true)add('CONTINUOUS_FUNDING_BUDGET_REQUIRED');
      boundary=time(continuous.nextMaintenanceAt,'nextMaintenanceAt',{nullable:true});boundaryKind=boundary===null?null:'maintenance';
    }
  }
  if(sessionId===null)add('SESSION_ID_UNKNOWN');
  if(boundary!==null&&boundary<=now)add('SESSION_BOUNDARY_REACHED');
  if(originalClose!==null&&(close===null||close<originalClose))add('BOUND_SESSION_CHANGED');

  // The components are subtracted exactly once, as specified in handbook §3.9.
  const exitDeadline=boundary===null?null:boundary-policy.closeConfirmationReserveMs;
  const latestEntry=exitDeadline===null?null:exitDeadline-maxHold-policy.additionalUnwindReserveMs;
  const pendingExpires=earlier(setup,trigger,latestEntry===null?null:latestEntry-policy.lateActivationReserveMs);
  const sendUntil=pendingExpires-policy.admissionLatencyReserveMs;
  const windDown=boundary===null?null:boundary-policy.windDownBeforeCloseMs;
  if(latestEntry!==null&&now+policy.admissionLatencyReserveMs+policy.lateActivationReserveMs+policy.minimumPendingLifetimeMs>=latestEntry)add('HOLD_EXCEEDS_SESSION_REMAINING');
  if(setup<=now)add('SETUP_EXPIRED');if(trigger<=now)add('TRIGGER_EXPIRED');
  if(now>=sendUntil||pendingExpires-now-policy.admissionLatencyReserveMs<policy.minimumPendingLifetimeMs)add('PENDING_WINDOW_TOO_SHORT');
  if(windDown!==null&&now>=windDown)add('SESSION_WIND_DOWN');

  // Reopen, host sleep, reboot and wall/monotone disagreement require evidence,
  // not a timestamp-only renewal of an old grant. This function grants nothing.
  let clockReason=null,clock=null,previous=input.previous??null,recoverySince=previous?.recoverySince??null;
  if(previous!==null){record(previous,'previous');time(previous.checkedAt,'previous.checkedAt');if(previous.recoverySince!==null&&previous.recoverySince!==undefined)time(previous.recoverySince,'previous.recoverySince');}
  if(input.clock===null||input.clock===undefined)clockReason='CLOCK_UNVERIFIED';
  else {
    record(input.clock,'clock');text(input.clock.bootId,'clock.bootId');
    if(!Number.isFinite(input.clock.monotonicMs)||input.clock.monotonicMs<0||input.clock.monotonicMs>Number.MAX_SAFE_INTEGER)invalid('SESSION_CLOCK_INVALID','Die monotone Uhr ist ungültig.');
    clock={bootId:input.clock.bootId,monotonicMs:input.clock.monotonicMs};
    if(previous?.clock){
      const before=time(previous.checkedAt,'previous.checkedAt'),wallDelta=now-before,monoDelta=clock.monotonicMs-previous.clock.monotonicMs;
      if(clock.bootId!==previous.clock.bootId)clockReason='CLOCK_BOOT_CHANGED';
      else if(monoDelta<0||wallDelta<0||Math.abs(wallDelta-monoDelta)>policy.maxClockDriftMs)clockReason='CLOCK_JUMP';
      else if(Math.max(wallDelta,monoDelta)>policy.maxTimerGapMs)clockReason='HOST_RESUME_REQUIRES_RECONCILIATION';
    }
  }
  const reopened=previous&&(['CLOSED','RESIDUAL_UNCONFIRMED','UNKNOWN'].includes(previous.phase)||previous.sessionId!==sessionId);
  if(clockReason||reopened||!previous)recoverySince=iso(now);
  const reconciliation=input.reconciliation??null;
  let reconciled=false;
  if(reconciliation!==null){
    record(reconciliation,'reconciliation');const checked=time(reconciliation.checkedAt,'reconciliation.checkedAt');
    reconciled=reconciliation.complete===true&&reconciliation.sessionId===sessionId&&clock!==null&&reconciliation.bootId===clock.bootId&&
      freshness(checked,now,policy.observationTtlMs)&&(!recoverySince||checked>=time(recoverySince,'recoverySince'));
  }
  // An observed clock anomaly itself blocks this decision even if a caller
  // supplies a simultaneous proof. A subsequent clean tick may clear recovery.
  if(clockReason)add(clockReason);
  if(!reconciled)add('SESSION_RECONCILIATION_REQUIRED');
  if(reconciled&&!clockReason)recoverySince=null;

  if(bid===null||quote===null)add('QUOTE_UNKNOWN');
  else if(compareDecimal(bid,ask)>0)add('CROSSED_QUOTE');
  else if(quote>now+policy.maxFutureSkewMs||observed!==null&&quote>observed+policy.maxFutureSkewMs)add('QUOTE_TIME_IN_FUTURE');
  else if(!freshness(quote,now,policy.quoteTtlMs,policy.maxFutureSkewMs))add('QUOTE_STALE');

  let capacity=null;
  if(input.operations===null||input.operations===undefined)add('UNWIND_CAPACITY_UNKNOWN');
  else {
    const operationDeadline=exitDeadline??(now+maxHold+policy.additionalUnwindReserveMs);
    if(operationDeadline>MAX_TIME)invalid('SESSION_TIME_INVALID','Der Operationshorizont überschreitet den Zeitvertrag.');
    capacity=planUnwindCapacity({...input.operations,now,deadlineAt:iso(operationDeadline),observationTtlMs:policy.observationTtlMs});
    if(!capacity.fits)add(capacity.reason);
  }

  let flatConfirmed=false,hasResidual=true;
  if(input.ownedInventory!==null&&input.ownedInventory!==undefined){
    const inv=record(input.ownedInventory,'ownedInventory'),at=time(inv.observedAt,'ownedInventory.observedAt');
    for(const key of ['positions','pendingOrders','unresolvedDispatches'])integer(inv[key],'ownedInventory.'+key,0,100000);
    flatConfirmed=inv.complete===true&&freshness(at,now,policy.observationTtlMs)&&inv.positions===0&&inv.pendingOrders===0&&inv.unresolvedDispatches===0;
    hasResidual=!flatConfirmed;
  }
  let phase='NORMAL';
  if(input.marketOpen===false||boundary!==null&&now>=boundary)phase=hasResidual?'RESIDUAL_UNCONFIRMED':'CLOSED';
  else if(exitDeadline!==null&&now>=exitDeadline)phase='FLATTEN_WINDOW';
  else if(windDown!==null&&now>=windDown)phase='WIND_DOWN';
  else if(input.marketOpen!==true||!marketFresh||input.calendarMode==='unknown'||boundary===null&&input.calendarMode==='session')phase='UNKNOWN';
  else if(!reconciled||clockReason||recoverySince)phase='REOPEN_CHECK';
  if(phase==='FLATTEN_WINDOW')add('SESSION_EXIT_DEADLINE');
  const riskReductionAllowed=input.marketOpen===true&&marketFresh&&!['disabled','unknown'].includes(input.tradingMode)&&!(boundary!==null&&now>=boundary);
  const validUntil=earlier(sendUntil,observed===null?now:observed+policy.observationTtlMs,quote===null?now:quote+policy.quoteTtlMs,windDown);
  return freeze({schemaVersion:1,checkedAt:iso(now),sessionId,calendarMode:input.calendarMode,phase,entryAllowed:reasons.length===0,
    reason:reasons[0]??null,reasons,riskReductionAllowed,riskReductionValidUntil:iso(earlier(observed===null?now:observed+policy.observationTtlMs,boundary)),flatConfirmed,requiresBrokerConfirmation:true,mustRevalidateBeforeSend:true,grantsTrading:false,
    nextCloseAt:iso(close),boundaryAt:iso(boundary),boundaryKind,setupValidUntil:iso(setup),triggerValidUntil:iso(trigger),maxHoldMs:maxHold,
    exitDeadline:iso(exitDeadline),latestEntry:iso(latestEntry),pendingExpiresAt:iso(pendingExpires),sendAllowedUntil:iso(sendUntil),windDownAt:iso(windDown),validUntil:iso(validUntil),
    reserves:{closeConfirmationMs:policy.closeConfirmationReserveMs,additionalUnwindMs:policy.additionalUnwindReserveMs,lateActivationMs:policy.lateActivationReserveMs,admissionLatencyMs:policy.admissionLatencyReserveMs},
    capacity,checkpoint:{checkedAt:iso(now),sessionId,phase,clock,recoverySince},planInvalidated:reasons.includes('BOUND_SESSION_CHANGED')});
}

/** Oldest fill and any already committed deadline can only shorten a deadline. */
export function positionExitDeadline({firstFillAt,maxHoldMs,sessionExitDeadline=null,previousDeadlineAt=null}){
  const first=time(firstFillAt,'firstFillAt'),hold=integer(maxHoldMs,'maxHoldMs',1),session=time(sessionExitDeadline,'sessionExitDeadline',{nullable:true}),previous=time(previousDeadlineAt,'previousDeadlineAt',{nullable:true});
  if(first+hold>MAX_TIME)invalid('SESSION_TIME_INVALID','Die Haltedauer überschreitet den Zeitvertrag.');
  return iso(earlier(first+hold,session,previous));
}

/** Advice for a previously approved original plan, never for an unknown legacy position. */
export function evaluateWindDown({session,now,netAfterCosts=null,positionPlan}){
  record(session,'session');wallTime(now);record(positionPlan,'positionPlan');
  const approved=positionPlan.approved===true&&typeof positionPlan.planId==='string'&&positionPlan.planId.length>0;
  if(netAfterCosts!==null)validateDecimal(netAfterCosts);
  if(!approved)return freeze({action:'retain_protection',reason:'ORIGINAL_EXIT_POLICY_REQUIRED',deadlineAt:null,mandatory:false,mayRealizeLoss:false,attemptAllowed:false,cancelPendingRequired:false,unmetDeadline:false,requiresBrokerConfirmation:true,grantsTrading:false});
  text(positionPlan.planId,'positionPlan.planId');
  if(typeof positionPlan.flatBeforeClose!=='boolean')invalid('SESSION_INPUT_INVALID','Die genehmigte Sitzungspolitik der Position fehlt.');
  const deadline=positionExitDeadline({firstFillAt:positionPlan.firstFillAt,maxHoldMs:positionPlan.maxHoldMs,
    sessionExitDeadline:positionPlan.flatBeforeClose===true?session.exitDeadline:null,previousDeadlineAt:positionPlan.previousDeadlineAt??null});
  const due=now>=time(deadline,'deadline'),wind=session.windDownAt!==null&&now>=time(session.windDownAt,'windDownAt');
  let action='none',reason=null;
  if(due){action='close_position';reason='HARD_EXIT_DEADLINE';}
  else if(positionPlan.flatBeforeClose===true&&wind&&netAfterCosts!==null&&compareDecimal(netAfterCosts,'0')>0){action='close_position';reason='WIND_DOWN_NET_POSITIVE';}
  else if(positionPlan.flatBeforeClose===true&&wind){action='wait_until_deadline';reason='WIND_DOWN_NO_NET_PROFIT';}
  // Admission conditions (costs, new-entry direction, quote freshness) do not
  // erase an already due exit. Broker inability leaves a visible unmet duty.
  const marketCurrent=now>=time(session.checkedAt,'session.checkedAt')&&now<time(session.riskReductionValidUntil,'session.riskReductionValidUntil')&&session.riskReductionAllowed===true;
  return freeze({action,reason,deadlineAt:deadline,mandatory:approved&&due,mayRealizeLoss:approved&&due,
    attemptAllowed:approved&&action==='close_position'&&marketCurrent,
    cancelPendingRequired:positionPlan.flatBeforeClose===true&&(wind||due),
    unmetDeadline:approved&&due&&!marketCurrent,requiresBrokerConfirmation:true,grantsTrading:false});
}
