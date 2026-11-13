/**
 * Immutable, deterministic economic projection for one durable order intent.
 * Transport, native broker lifecycle and control action are independent axes.
 * This is not a broker adapter. Only normalized, identity-checked evidence may
 * be passed by the host; an observer or an HTTP success does not grant trading.
 */
import {fail,object} from '../errors.mjs';
import {canonical,digest} from '../schema.mjs';
import {validateDecimal,compareDecimal,addDecimal,subtractDecimal,minDecimal,maxDecimal} from './decimal.mjs';

const MAX_EVENTS=20000,MAX_DEALS=10000;
const KINDS=['limit','stop','stop_limit','market_range','market'];
const TRANSPORT=['draft','validated','reserved','durable','dispatching','dispatched','outcome_unknown','released_before_send'];
const TERMINAL=['cancelled','expired','rejected_no_fill','filled'];
const EVENT_TYPES=['VALIDATED','RESERVED','DURABLE','DISPATCH_MAY_HAVE_STARTED','DISPATCH_ACKNOWLEDGED','DISPATCH_OUTCOME_UNKNOWN','RELEASE_BEFORE_SEND',
  'BROKER_IDENTIFIED','BROKER_ACCEPTED','BROKER_WORKING','BROKER_FILL','POSITION_CLOSE','BROKER_CANCELLED','BROKER_EXPIRED','BROKER_FILLED','BROKER_REJECTED_NO_FILL',
  'CANCEL_REQUESTED','AMEND_REQUESTED','CONTROL_OUTCOME_UNKNOWN','CONTROL_CONFIRMED','BROKER_AMENDED','DEAL_COST_CONFIRMED'];

function invalid(code,message){fail(code,message);}
function rec(value,label){if(!object(value))invalid('ORDER_INPUT_INVALID',label+' muss ein Objekt sein.');return value;}
function text(value,label,max=160){if(typeof value!=='string'||!value.length||value.length>max||/[\u0000-\u001f\u007f-\u009f]/u.test(value))invalid('ORDER_INPUT_INVALID',label+' ist ungültig.');return value;}
function id(value,label){text(value,label);if(!/^[A-Za-z0-9_.:/-]+$/.test(value))invalid('ORDER_ID_INVALID',label+' ist keine unterstützte stabile Identität.');return value;}
function time(value,label,{nullable=false}={}){
  if(value===null&&nullable)return null;
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(Date.parse(value)).toISOString()!==value)invalid('ORDER_TIME_INVALID',label+' benötigt einen gültigen UTC-Zeitpunkt.');
  return value;
}
function account(value){rec(value,'account');text(value.broker,'account.broker');text(value.id,'account.id');if(!['demo','live'].includes(value.environment))invalid('ORDER_ACCOUNT_INVALID','Die Kontoumgebung ist unbekannt.');return {broker:value.broker,id:value.id,environment:value.environment};}
function direction(value){if(!['buy','sell'].includes(value))invalid('ORDER_INPUT_INVALID','Die ursprüngliche Orderrichtung ist ungültig.');return value;}
function kind(value){if(!KINDS.includes(value))invalid('ORDER_INPUT_INVALID','Der ursprüngliche Ordertyp ist unbekannt.');return value;}
function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}
function clone(value){return JSON.parse(JSON.stringify(value));}
function sum(rows,field='units'){return rows.reduce((total,row)=>addDecimal(total,row[field]),'0');}
function positiveDifference(a,b){return compareDecimal(a,b)>0?subtractDecimal(a,b):'0';}
function same(a,b){return canonical(a)===canonical(b);}
function receipt(state,event){state.receipts.push({id:event.id,hash:digest(event)});state.updatedAt=state.updatedAt>event.at?state.updatedAt:event.at;}
function incident(state,{code,field=null,expected=null,actual=null,scope='intent',eventId=null}){
  const issue={code,field,expected,actual,scope};const issueId=digest(issue);
  if(!state.incidents.some(i=>i.id===issueId))state.incidents.push({id:issueId,...issue,firstEventId:eventId,resolved:false,resolvedBy:null});
}
function mismatch(state,field,expected,actual,eventId,scope='account'){
  incident(state,{code:'ORDER_IDENTITY_MISMATCH',field,expected,actual,scope,eventId});return false;
}
function commonIdentity(state,event){
  for(const key of ['broker','id','environment'])if(event.account[key]!==state.intent.account[key])return mismatch(state,'account.'+key,state.intent.account[key],event.account[key],event.id);
  if(event.intentId!==state.intent.intentId)return mismatch(state,'intentId',state.intent.intentId,event.intentId,event.id);
  if(event.planId!==state.intent.planId)return mismatch(state,'planId',state.intent.planId,event.planId,event.id);
  return true;
}
function nativeIdentity(state,p,event,{adopt=true,close=false}={}){
  const orderId=id(close?p.originOrderId:p.orderId,close?'originOrderId':'orderId');
  for(const [field,actual] of [['symbol',text(p.symbol,'symbol')],['side',direction(p.side)],['kind',kind(p.kind)]])
    if(actual!==state.intent[field])return mismatch(state,field,state.intent[field],actual,event.id);
  if(state.broker.orderId!==null&&orderId!==state.broker.orderId)return mismatch(state,'orderId',state.broker.orderId,orderId,event.id);
  if(adopt&&state.broker.orderId===null)state.broker.orderId=orderId;
  return true;
}
function actor(value){
  if(value===undefined||value===null)return {kind:'own_command',actorId:null,proofId:null};
  rec(value,'actor');if(!['own_command','authenticated_user_command'].includes(value.kind))invalid('ORDER_ACTOR_INVALID','Der Akteur benötigt einen eigenen oder authentifizierten Befehlsbezug.');
  if(value.kind==='authenticated_user_command')return {kind:value.kind,actorId:id(value.actorId,'actorId'),proofId:id(value.proofId,'proofId')};
  return {kind:'own_command',actorId:null,proofId:null};
}
function resolveLocal(state,codes,proof){
  for(const issue of state.incidents)if(!issue.resolved&&issue.scope==='intent'&&codes.includes(issue.code)){issue.resolved=true;issue.resolvedBy=proof;}
}

function project(state){
  const knownFilled=sum(state.fills),reportedClosed=sum(state.closes),accepted=maxDecimal(state.broker.acceptedUnits??state.intent.requestedUnits,state.broker.observedMaxUnits??'0');
  const reportedFilled=maxDecimal(state.broker.reportedFilledUnits??'0',state.broker.terminal?.filledUnits??'0');
  const confirmedFilled=maxDecimal(maxDecimal(knownFilled,reportedFilled),reportedClosed);
  const positionIds=[...new Set([...state.fills,...state.closes].map(x=>x.positionId))].sort();
  const positions=positionIds.map(positionId=>{
    const fills=state.fills.filter(x=>x.positionId===positionId),closes=state.closes.filter(x=>x.positionId===positionId),filled=sum(fills),closed=sum(closes);
    return {positionId,knownFilledUnits:filled,reportedClosedUnits:closed,closedUnits:minDecimal(filled,closed),openUnits:positiveDifference(filled,closed),unmatchedCloseUnits:positiveDifference(closed,filled),
      firstFillAt:fills.every(x=>x.executedAt!==null)?fills.map(x=>x.executedAt).sort()[0]??null:null};
  });
  const open=sum(positions,'openUnits'),closed=sum(positions,'closedUnits'),unmatchedCloses=sum(positions,'unmatchedCloseUnits');
  const unattributed=positiveDifference(confirmedFilled,knownFilled),remaining=positiveDifference(accepted,confirmedFilled),terminal=state.broker.terminal;
  const preSendRelease=state.transport.status==='released_before_send'&&!state.transport.mayHaveStarted&&state.broker.orderId===null;
  const terminalFinal=terminal?.executionFinal===true;
  const potential=preSendRelease||terminalFinal?'0':remaining;
  const uncertainty=terminal&&!terminalFinal?remaining:'0';
  const working=terminal||preSendRelease?'0':state.broker.orderId===null?'0':remaining;
  const commitment=['reserved','durable','dispatching','dispatched','outcome_unknown'].includes(state.transport.status)||state.broker.orderId!==null||compareDecimal(knownFilled,'0')>0;
  const reservation=commitment?addDecimal(potential,unattributed):'0';
  if(compareDecimal(confirmedFilled,accepted)>0)incident(state,{code:'ORDER_OVERFILLED',field:'filledUnits',expected:accepted,actual:confirmedFilled,scope:'account'});
  if(compareDecimal(unmatchedCloses,'0')>0)incident(state,{code:'CLOSE_BEFORE_FILL_EVIDENCE',field:'unmatchedCloseUnits',expected:'0',actual:unmatchedCloses});
  if(unmatchedCloses==='0')resolveLocal(state,['CLOSE_BEFORE_FILL_EVIDENCE'],'matched_execution_deals');
  let brokerStatus='not_observed';
  if(compareDecimal(confirmedFilled,accepted)>=0&&compareDecimal(confirmedFilled,'0')>0)brokerStatus='filled';
  else if(terminal?.kind==='rejected_no_fill')brokerStatus='rejected_no_fill';
  else if(terminal?.kind==='cancelled')brokerStatus='remainder_cancelled';
  else if(terminal?.kind==='expired')brokerStatus='remainder_expired';
  else if(compareDecimal(confirmedFilled,'0')>0)brokerStatus='partially_filled';
  else if(state.broker.orderId!==null)brokerStatus='working';
  const allDeals=[...state.fills,...state.closes],currencies=[...new Set(allDeals.filter(x=>x.fee!==null).map(x=>x.feeCurrency))].sort();
  state.broker.status=brokerStatus;
  state.quantities={requestedUnits:state.intent.requestedUnits,acceptedUnits:state.broker.acceptedUnits,exposureUpperBoundUnits:accepted,knownFilledUnits:knownFilled,reportedFilledUnits:reportedFilled,confirmedFilledUnits:confirmedFilled,
    openPositionUnits:open,closedUnits:closed,reportedClosedUnits:reportedClosed,unmatchedCloseUnits:unmatchedCloses,unattributedFilledUnits:unattributed,
    workingUnits:working,uncertainRemainderUnits:uncertainty,remainingPossibleFillUnits:potential,terminatedRemainderUnits:terminalFinal?remaining:'0',reservationUnits:reservation};
  state.positions=positions;
  state.costs={fees:currencies.map(currency=>({currency,amount:allDeals.filter(x=>x.feeCurrency===currency&&x.fee!==null).reduce((total,x)=>addDecimal(total,x.fee),'0')})),unknownFeeDealCount:allDeals.filter(x=>x.fee===null).length};
  const active=state.incidents.filter(x=>!x.resolved);
  state.reconciliation={required:active.length>0||state.transport.status==='outcome_unknown'||unattributed!=='0'||uncertainty!=='0',
    blockingScope:active.some(x=>x.scope==='account')?'account':active.length||state.transport.status==='outcome_unknown'||unattributed!=='0'||uncertainty!=='0'?'intent':null,
    originalPlanAvailable:true,brokerIndependentlyVerified:false};
  return freeze(state);
}

export function createOrderState(input){
  rec(input,'intent');const origin={planId:id(input.planId,'planId'),intentId:id(input.intentId,'intentId'),account:account(input.account),symbol:text(input.symbol,'symbol'),side:direction(input.side),kind:kind(input.kind),
    requestedUnits:validateDecimal(input.requestedUnits,{positive:true}),createdAt:time(input.createdAt,'createdAt'),expiresAt:time(input.expiresAt,'expiresAt',{nullable:true})};
  if(origin.expiresAt!==null&&origin.expiresAt<=origin.createdAt)invalid('ORDER_EXPIRY_INVALID','Der ursprüngliche Ablauf muss nach Erstellung der Absicht liegen.');
  return project({schemaVersion:1,intent:origin,intentHash:digest(origin),updatedAt:origin.createdAt,
    transport:{status:'draft',operationId:null,mayHaveStarted:false},
    broker:{orderId:null,acceptedUnits:null,acceptedAt:null,reportedFilledUnits:'0',observedMaxUnits:null,workingObservedAt:null,terminal:null,status:'not_observed'},
    control:{status:'none',action:null,commandId:null,actor:null,requestedAt:null,confirmedAt:null,outcome:null},fills:[],closes:[],positions:[],costs:{fees:[],unknownFeeDealCount:0},incidents:[],receipts:[],quantities:{},reconciliation:{}});
}

/** Revalidate persisted input and recompute quantities; a corrupt projection is not trusted. */
export function validateOrderState(value){
  rec(value,'state');
  if(value.schemaVersion!==1||!object(value.intent)||digest(value.intent)!==value.intentHash)invalid('ORDER_STATE_INVALID','Die ursprüngliche Absicht ist beschädigt oder wurde verändert.');
  const check=createOrderState(value.intent); // Revalidates the immutable contract.
  if(!same(check.intent,value.intent)||!object(value.transport)||!TRANSPORT.includes(value.transport.status)||typeof value.transport.mayHaveStarted!=='boolean')invalid('ORDER_STATE_INVALID','Der gespeicherte Transportzustand ist ungültig.');
  if(!Array.isArray(value.receipts)||value.receipts.length>MAX_EVENTS||!Array.isArray(value.fills)||!Array.isArray(value.closes)||value.fills.length+value.closes.length>MAX_DEALS||!Array.isArray(value.incidents)||value.incidents.length>MAX_EVENTS)invalid('ORDER_STATE_INVALID','Der gespeicherte Orderzustand überschreitet seinen Vertrag.');
  if(!object(value.broker)||!object(value.control))invalid('ORDER_STATE_INVALID','Broker- oder Kontrollzustand fehlt.');
  if(value.broker.orderId!==null)id(value.broker.orderId,'orderId');
  if(value.broker.acceptedUnits!==null)validateDecimal(value.broker.acceptedUnits,{positive:true});
  if(value.broker.observedMaxUnits!==null)validateDecimal(value.broker.observedMaxUnits,{nonNegative:true});
  validateDecimal(value.broker.reportedFilledUnits,{nonNegative:true});time(value.updatedAt,'updatedAt');
  if(value.broker.terminal!==null){
    const t=rec(value.broker.terminal,'terminal');if(!TERMINAL.includes(t.kind)||typeof t.executionFinal!=='boolean'||typeof t.operatorOverride!=='boolean')invalid('ORDER_STATE_INVALID','Der Terminalbeleg ist ungültig.');
    validateDecimal(t.filledUnits,{nonNegative:true});validateDecimal(t.unfilledUnits,{nonNegative:true});time(t.at,'terminal.at');
  }
  const events=new Set(),deals=new Set();
  for(const r of value.receipts){id(r.id,'receipt.id');if(typeof r.hash!=='string'||!/^[a-f0-9]{64}$/.test(r.hash)||events.has(r.id))invalid('ORDER_STATE_INVALID','Ereignisbelege sind beschädigt.');events.add(r.id);}
  for(const d of [...value.fills,...value.closes]){
    id(d.dealId,'dealId');id(d.positionId,'positionId');id(d.orderId,'deal.orderId');validateDecimal(d.units,{positive:true});time(d.executedAt,'executedAt',{nullable:true});
    if(d.price!==null)validateDecimal(d.price);if(d.fee!==null){validateDecimal(d.fee);text(d.feeCurrency,'feeCurrency',12);}
    if(typeof d.hash!=='string'||d.hash!==digest(dealEconomics(d))||deals.has(d.dealId))invalid('ORDER_STATE_INVALID','Dealbelege sind beschädigt oder doppelt.');deals.add(d.dealId);
  }
  const detached=clone(value),recalculated=project(detached);
  if(!same(recalculated.quantities,value.quantities)||!same(recalculated.positions,value.positions)||!same(recalculated.costs,value.costs))invalid('ORDER_STATE_INVALID','Die Mengenprojektion widerspricht den gespeicherten Belegen.');
  return recalculated;
}

function validateEvent(event){
  rec(event,'event');id(event.id,'event.id');id(event.intentId,'event.intentId');id(event.planId,'event.planId');account(event.account);time(event.at,'event.at');rec(event.payload,'event.payload');
  if(!EVENT_TYPES.includes(event.type))invalid('ORDER_EVENT_UNSUPPORTED','Dieser Orderereignistyp wird nicht unterstützt.');
  if(Buffer.byteLength(JSON.stringify(event),'utf8')>65536)invalid('ORDER_EVENT_LIMIT','Das Orderereignis ist zu gross.');
  return clone(event);
}
function transition(state,event,from,to){
  if(state.transport.status===to)return true;
  if(!from.includes(state.transport.status)){incident(state,{code:'ORDER_TRANSPORT_TRANSITION',field:'transport.status',expected:from.join('|'),actual:state.transport.status,eventId:event.id});return false;}
  state.transport.status=to;return true;
}
function dealEconomics(deal){return {kind:deal.kind,dealId:deal.dealId,orderId:deal.orderId,positionId:deal.positionId,units:deal.units,price:deal.price,executedAt:deal.executedAt,fee:deal.fee,feeCurrency:deal.feeCurrency};}
function dealFrom(event,close){
  const p=event.payload,fee=p.fee??null,price=p.price??null;
  if(price!==null)validateDecimal(price);if(fee!==null)validateDecimal(fee);
  const feeCurrency=fee===null?null:text(p.feeCurrency,'feeCurrency',12);
  const d={kind:close?'close':'fill',dealId:id(p.dealId,'dealId'),orderId:id(close?p.closingOrderId:p.orderId,'deal.orderId'),positionId:id(p.positionId,'positionId'),
    units:validateDecimal(p.units,{positive:true}),price,executedAt:time(p.executedAt,'executedAt',{nullable:true}),fee,feeCurrency,observedAt:event.at,firstEventId:event.id};
  return {...d,hash:digest(dealEconomics(d))};
}
function appendDeal(state,event,close){
  const p=event.payload;
  if(!nativeIdentity(state,p,event,{close}))return;
  const deal=dealFrom(event,close),prior=[...state.fills,...state.closes].find(x=>x.dealId===deal.dealId);
  if(prior){
    // A later cost-confirmation enriches an originally unknown fee. An older
    // fee-unknown execution callback remains the same execution, not a conflict.
    const olderUnknownFee=deal.fee===null&&prior.fee!==null&&same({...dealEconomics(prior),fee:null,feeCurrency:null},dealEconomics(deal));
    if(prior.hash!==deal.hash&&!olderUnknownFee)incident(state,{code:'DEAL_IDENTITY_CONFLICT',field:'dealId',expected:prior.hash,actual:deal.hash,scope:'account',eventId:event.id});
    return;
  }
  if(state.fills.length+state.closes.length>=MAX_DEALS)invalid('ORDER_DEAL_LIMIT','Der einzelne Orderverlauf benötigt ein grösseres geprüftes Journalbudget; keine Ausführungsbelege verwerfen.');
  (close?state.closes:state.fills).push(deal);
  if(state.transport.mayHaveStarted)state.transport.status='dispatched';
  else incident(state,{code:'DISPATCH_PROOF_MISSING',field:'transport.mayHaveStarted',expected:true,actual:false,eventId:event.id});
  if(!close&&state.broker.terminal){
    const total=sum(state.fills),terminal=state.broker.terminal;
    if(compareDecimal(total,terminal.filledUnits)>0){
      terminal.executionFinal=false;
      incident(state,{code:'LATE_FILL_AFTER_TERMINAL',field:'terminal.filledUnits',expected:terminal.filledUnits,actual:total,eventId:event.id});
    }
  }
}
function accepted(state,event){
  const p=event.payload;if(!nativeIdentity(state,p,event))return;
  const units=validateDecimal(p.acceptedUnits,{positive:true});
  if(state.broker.acceptedUnits!==null&&state.broker.acceptedUnits!==units){state.broker.observedMaxUnits=maxDecimal(state.broker.observedMaxUnits??state.broker.acceptedUnits,units);incident(state,{code:'ACCEPTED_VOLUME_CHANGED_WITHOUT_AMENDMENT',field:'acceptedUnits',expected:state.broker.acceptedUnits,actual:units,scope:'account',eventId:event.id});return;}
  state.broker.acceptedUnits=units;state.broker.acceptedAt=state.broker.acceptedAt??event.at;
  if(p.filledUnits!==undefined){validateDecimal(p.filledUnits,{nonNegative:true});state.broker.reportedFilledUnits=maxDecimal(state.broker.reportedFilledUnits,p.filledUnits);}
}
function endRemainder(state,event,terminalKind){
  const p=event.payload;if(!nativeIdentity(state,p,event))return;
  const filled=validateDecimal(p.filledUnits,{nonNegative:true}),unfilled=validateDecimal(p.unfilledUnits,{nonNegative:true});
  if(typeof p.executionFinal!=='boolean')invalid('ORDER_TERMINAL_PROOF_REQUIRED','Restende und Abschluss der möglichen späten Ausführung müssen getrennt belegt sein.');
  const total=addDecimal(filled,unfilled),contract=maxDecimal(state.broker.acceptedUnits??state.intent.requestedUnits,state.broker.observedMaxUnits??'0');
  if(total!==contract){incident(state,{code:'TERMINAL_VOLUME_MISMATCH',field:'filled+unfilled',expected:contract,actual:total,scope:'account',eventId:event.id});return;}
  if(terminalKind==='rejected_no_fill'&&(filled!=='0'||sum(state.fills)!=='0')){incident(state,{code:'REJECTED_AFTER_FILL',field:'knownFilledUnits',expected:'0',actual:sum(state.fills),scope:'account',eventId:event.id});return;}
  if(terminalKind==='filled'&&unfilled!=='0'){incident(state,{code:'FILLED_WITH_REMAINDER',field:'unfilledUnits',expected:'0',actual:unfilled,eventId:event.id});return;}
  const previous=state.broker.terminal;
  if(previous&&previous.kind!==terminalKind){incident(state,{code:'TERMINAL_REASON_CONFLICT',field:'terminal.kind',expected:previous.kind,actual:terminalKind,eventId:event.id});return;}
  if(previous&&(event.at<previous.at||compareDecimal(filled,previous.filledUnits)<0))return; // Delayed callbacks cannot undo newer evidence.
  let actorEvidence=terminalKind==='expired'?'broker_expiry':terminalKind==='rejected_no_fill'?'broker_rejection':terminalKind==='filled'?'broker_execution':'external_unattributed';
  const matchingCommand=terminalKind==='cancelled'&&p.commandId!==undefined&&p.commandId===state.control.commandId&&state.control.action==='cancel';
  if(matchingCommand)actorEvidence=state.control.actor.kind==='authenticated_user_command'?'authenticated_user_command':'own_command_confirmed';
  const lateKnown=compareDecimal(sum(state.fills),filled)>0;
  if(lateKnown)incident(state,{code:'TERMINAL_BEHIND_FILL_EVIDENCE',field:'terminal.filledUnits',expected:sum(state.fills),actual:filled,eventId:event.id});
  state.broker.terminal={kind:terminalKind,at:event.at,filledUnits:filled,unfilledUnits:unfilled,executionFinal:p.executionFinal&&!lateKnown,actorEvidence,operatorOverride:actorEvidence==='authenticated_user_command',commandId:matchingCommand?p.commandId:null,eventId:event.id};
  state.broker.reportedFilledUnits=maxDecimal(state.broker.reportedFilledUnits,filled);
  if(matchingCommand||terminalKind==='expired'&&state.control.action==='cancel'){
    state.control.status='confirmed';state.control.confirmedAt=event.at;state.control.outcome=matchingCommand?'cancel_confirmed':'superseded_by_broker_expiry';
  }
  if(p.executionFinal&&!lateKnown)resolveLocal(state,['LATE_FILL_AFTER_TERMINAL','TERMINAL_BEHIND_FILL_EVIDENCE','ORDER_NOT_OBSERVED','HISTORY_INCOMPLETE'],event.id);
}

export function reduceOrderEvent(current,rawEvent){
  const verified=validateOrderState(current),event=validateEvent(rawEvent),hash=digest(event),prior=verified.receipts.find(x=>x.id===event.id);
  if(prior?.hash===hash)return current;
  const state=clone(verified);
  if(prior){incident(state,{code:'ORDER_EVENT_CONFLICT',field:'event.id',expected:prior.hash,actual:hash,scope:'account',eventId:event.id});return project(state);}
  if(state.receipts.length>=MAX_EVENTS)invalid('ORDER_EVENT_LIMIT','Der einzelne Orderverlauf benötigt ein grösseres geprüftes Journalbudget; keine Belege abschneiden.');
  if(!commonIdentity(state,event)){receipt(state,event);return project(state);}
  const p=event.payload;
  switch(event.type){
    case 'VALIDATED':transition(state,event,['draft'],'validated');break;
    case 'RESERVED':transition(state,event,['validated'],'reserved');break;
    case 'DURABLE':transition(state,event,['reserved'],'durable');break;
    case 'DISPATCH_MAY_HAVE_STARTED':{
      const op=id(p.operationId,'operationId');
      if(state.transport.operationId!==null&&state.transport.operationId!==op){incident(state,{code:'DISPATCH_IDENTITY_CHANGED',field:'operationId',expected:state.transport.operationId,actual:op,scope:'account',eventId:event.id});break;}
      if(transition(state,event,['durable'],'dispatching')){state.transport.operationId=op;state.transport.mayHaveStarted=true;}break;
    }
    case 'DISPATCH_ACKNOWLEDGED':case 'DISPATCH_OUTCOME_UNKNOWN':{
      const op=id(p.operationId,'operationId');
      if(op!==state.transport.operationId){mismatch(state,'operationId',state.transport.operationId,op,event.id);break;}
      if(event.type==='DISPATCH_ACKNOWLEDGED')transition(state,event,['dispatching','outcome_unknown'],'dispatched');
      else transition(state,event,['dispatching','dispatched'],'outcome_unknown');break;
    }
    case 'RELEASE_BEFORE_SEND':
      if(state.transport.mayHaveStarted||state.broker.orderId!==null||state.fills.length){incident(state,{code:'CANNOT_RELEASE_UNCERTAIN_SEND',field:'transport.mayHaveStarted',expected:false,actual:state.transport.mayHaveStarted,eventId:event.id});break;}
      transition(state,event,['draft','validated','reserved','durable'],'released_before_send');break;
    case 'BROKER_IDENTIFIED':nativeIdentity(state,p,event);break;
    case 'BROKER_ACCEPTED':accepted(state,event);break;
    case 'BROKER_WORKING':{
      if(!nativeIdentity(state,p,event))break;
      const volume=validateDecimal(p.units,{nonNegative:true});
      if(!['original','remaining'].includes(p.volumeMeaning)){state.broker.observedMaxUnits=maxDecimal(state.broker.observedMaxUnits??'0',addDecimal(volume,maxDecimal(sum(state.fills),state.broker.reportedFilledUnits)));incident(state,{code:'ORDER_VOLUME_SEMANTICS_UNKNOWN',field:'volumeMeaning',expected:'original|remaining',actual:p.volumeMeaning??null,eventId:event.id});break;}
      if(state.broker.terminal){
        if(event.at>state.broker.terminal.at)incident(state,{code:'TERMINAL_ORDER_REAPPEARED',field:'orderId',expected:'terminal',actual:state.broker.orderId,eventId:event.id});
        break;
      }
      const knownFilled=maxDecimal(sum(state.fills),state.broker.reportedFilledUnits),expected=p.volumeMeaning==='original'?(state.broker.acceptedUnits??state.intent.requestedUnits):positiveDifference(state.broker.acceptedUnits??state.intent.requestedUnits,knownFilled);
      if(volume!==expected){state.broker.observedMaxUnits=maxDecimal(state.broker.observedMaxUnits??'0',p.volumeMeaning==='original'?volume:addDecimal(volume,knownFilled));incident(state,{code:'WORKING_VOLUME_MISMATCH',field:'workingUnits',expected,actual:volume,eventId:event.id});break;}
      state.broker.workingObservedAt=event.at;resolveLocal(state,['ORDER_VOLUME_SEMANTICS_UNKNOWN','WORKING_VOLUME_MISMATCH','ORDER_NOT_OBSERVED'],event.id);
      if(!state.incidents.some(x=>!x.resolved&&['ACCEPTED_VOLUME_CHANGED_WITHOUT_AMENDMENT','EXTERNAL_AMENDMENT_UNATTRIBUTED','AMENDMENT_EXCEEDS_ORIGINAL_INTENT'].includes(x.code)))state.broker.observedMaxUnits=null;
      break;
    }
    case 'BROKER_FILL':appendDeal(state,event,false);break;
    case 'POSITION_CLOSE':appendDeal(state,event,true);break;
    case 'BROKER_CANCELLED':endRemainder(state,event,'cancelled');break;
    case 'BROKER_EXPIRED':endRemainder(state,event,'expired');break;
    case 'BROKER_FILLED':endRemainder(state,event,'filled');break;
    case 'BROKER_REJECTED_NO_FILL':endRemainder(state,event,'rejected_no_fill');break;
    case 'CANCEL_REQUESTED':case 'AMEND_REQUESTED':{
      const command=id(p.commandId,'commandId'),action=event.type==='CANCEL_REQUESTED'?'cancel':'amend',who=actor(p.actor);
      if(['cancel_requested','amend_requested','result_unknown'].includes(state.control.status)&&command!==state.control.commandId){incident(state,{code:'CONTROL_ALREADY_PENDING',field:'commandId',expected:state.control.commandId,actual:command,eventId:event.id});break;}
      if(state.control.commandId===command&&state.control.action!==null&&(state.control.action!==action||!same(state.control.actor,who))){incident(state,{code:'CONTROL_IDENTITY_CONFLICT',field:'commandId',expected:state.control.action,actual:action,scope:'account',eventId:event.id});break;}
      if(state.control.commandId===command&&state.control.status==='confirmed')break;
      state.control={status:action==='cancel'?'cancel_requested':'amend_requested',action,commandId:command,actor:who,requestedAt:state.control.commandId===command?state.control.requestedAt:event.at,confirmedAt:null,outcome:null};break;
    }
    case 'CONTROL_OUTCOME_UNKNOWN':case 'CONTROL_CONFIRMED':{
      if(id(p.commandId,'commandId')!==state.control.commandId){mismatch(state,'commandId',state.control.commandId,p.commandId,event.id,'intent');break;}
      if(state.control.status==='confirmed')break;
      state.control.status=event.type==='CONTROL_OUTCOME_UNKNOWN'?'result_unknown':'confirmed';
      if(event.type==='CONTROL_CONFIRMED'){state.control.confirmedAt=event.at;state.control.outcome='response_confirmed_pending_broker_evidence';}break;
    }
    case 'BROKER_AMENDED':{
      if(!nativeIdentity(state,p,event))break;
      const units=validateDecimal(p.acceptedUnits,{positive:true});
      if(p.commandId!==state.control.commandId||state.control.action!=='amend'){state.broker.observedMaxUnits=maxDecimal(state.broker.observedMaxUnits??state.intent.requestedUnits,units);incident(state,{code:'EXTERNAL_AMENDMENT_UNATTRIBUTED',field:'acceptedUnits',expected:state.broker.acceptedUnits??state.intent.requestedUnits,actual:units,eventId:event.id});break;}
      if(compareDecimal(units,state.intent.requestedUnits)>0){state.broker.observedMaxUnits=maxDecimal(state.broker.observedMaxUnits??state.intent.requestedUnits,units);incident(state,{code:'AMENDMENT_EXCEEDS_ORIGINAL_INTENT',field:'acceptedUnits',expected:state.intent.requestedUnits,actual:units,scope:'account',eventId:event.id});break;}
      if(compareDecimal(units,maxDecimal(sum(state.fills),state.broker.reportedFilledUnits))<0){incident(state,{code:'AMENDMENT_BELOW_FILLED',field:'acceptedUnits',expected:sum(state.fills),actual:units,eventId:event.id});break;}
      state.broker.acceptedUnits=units;state.control.status='confirmed';state.control.confirmedAt=event.at;state.control.outcome='amend_confirmed';break;
    }
    case 'DEAL_COST_CONFIRMED':{
      const dealId=id(p.dealId,'dealId'),d=[...state.fills,...state.closes].find(x=>x.dealId===dealId),fee=validateDecimal(p.fee),currency=text(p.feeCurrency,'feeCurrency',12);
      if(!d){incident(state,{code:'DEAL_COST_WITHOUT_EXECUTION',field:'dealId',expected:'known_deal',actual:dealId,eventId:event.id});break;}
      if(d.fee!==null&&(d.fee!==fee||d.feeCurrency!==currency)){incident(state,{code:'DEAL_COST_CONFLICT',field:'fee',expected:d.fee,actual:fee,scope:'account',eventId:event.id});break;}
      d.fee=fee;d.feeCurrency=currency;d.hash=digest(dealEconomics(d));break;
    }
  }
  receipt(state,event);return project(state);
}

/**
 * Reconcile normalized native rows. Absence is never a cancellation proof.
 * Original-vs-remaining volume semantics must have been verified by the adapter.
 * History rows carry explicit final-execution coverage, not an inferred timeout.
 */
export function reconcileOrder(current,input){
  let state=validateOrderState(current);rec(input,'snapshot');const observed=time(input.observedAt,'observedAt'),who=account(input.account),coverage=rec(input.coverage,'coverage');
  for(const name of ['ordersComplete','positionsComplete','historyComplete'])if(typeof coverage[name]!=='boolean')invalid('ORDER_COVERAGE_INVALID','Die Bestandsabdeckung muss ausdrücklich bekannt sein.');
  for(const key of ['orders','positions','deals','history'])if(!Array.isArray(input[key])||input[key].length>10000)invalid('ORDER_SNAPSHOT_LIMIT','Der Orderabgleich ist nicht begrenzt.');
  const proof='reconcile:'+digest({account:who,observedAt:observed,coverage,orders:input.orders,positions:input.positions,deals:input.deals,history:input.history});
  if(!same(who,state.intent.account)){
    const next=clone(state);for(const key of ['broker','id','environment'])if(who[key]!==state.intent.account[key])mismatch(next,'account.'+key,state.intent.account[key],who[key],proof);
    return freeze({state:project(next),matched:false,complete:false,proofId:proof,reason:'ORDER_ACCOUNT_MISMATCH'});
  }
  const event=(type,payload,suffix,at=observed)=>({id:'reconcile:'+digest(suffix),intentId:state.intent.intentId,planId:state.intent.planId,account:who,type,at,payload});
  const linked=row=>state.broker.orderId!==null?row.orderId===state.broker.orderId:row.intentId===state.intent.intentId&&row.planId===state.intent.planId&&row.intentProof==='exact_prepared_label';
  const candidates=input.orders.filter(linked),history=input.history.filter(linked);
  if(candidates.length>1){const next=clone(state);incident(next,{code:'ORDER_IDENTITY_AMBIGUOUS',field:'orderId',expected:'one_native_order',actual:candidates.map(x=>x.orderId),scope:'account',eventId:proof});return freeze({state:project(next),matched:false,complete:false,proofId:proof,reason:'ORDER_IDENTITY_AMBIGUOUS'});}
  if(candidates.length===1){
    const row=candidates[0];state=reduceOrderEvent(state,event('BROKER_IDENTIFIED',row,proof+':identified'));
    if(row.acceptedUnits!==undefined)state=reduceOrderEvent(state,event('BROKER_ACCEPTED',row,proof+':accepted'));
  }
  // Stable deal IDs, independent of snapshot timestamp, deduplicate economics.
  for(const row of input.deals){
    if(!['fill','close'].includes(row.type))invalid('ORDER_DEAL_KIND_INVALID','Die Dealrichtung muss fill oder close sein.');
    const origin=row.type==='close'?row.originOrderId:row.orderId;
    if(state.broker.orderId!==null&&origin===state.broker.orderId)state=reduceOrderEvent(state,event(row.type==='close'?'POSITION_CLOSE':'BROKER_FILL',row,proof+':deal:'+id(row.dealId,'dealId'),row.observedAt??observed));
  }
  for(const row of history){
    if(row.acceptedUnits!==undefined)state=reduceOrderEvent(state,event('BROKER_ACCEPTED',row,proof+':history-accepted:'+id(row.orderId,'orderId')));
    const type={cancelled:'BROKER_CANCELLED',expired:'BROKER_EXPIRED',filled:'BROKER_FILLED',rejected_no_fill:'BROKER_REJECTED_NO_FILL'}[row.status];
    if(!type)invalid('ORDER_HISTORY_STATUS_INVALID','Die historische Orderursache ist unbekannt.');
    // Incomplete history may report terminal status, but cannot settle late fills.
    state=reduceOrderEvent(state,event(type,{...row,executionFinal:row.executionFinal===true&&coverage.historyComplete},proof+':terminal:'+row.orderId,row.sourceAt??observed));
  }
  if(candidates.length===1)state=reduceOrderEvent(state,event('BROKER_WORKING',candidates[0],proof+':working'));
  const next=clone(state);let positionsMatch=true;
  for(const position of state.positions){
    const rows=input.positions.filter(x=>x.positionId===position.positionId);
    if(rows.length>1){incident(next,{code:'POSITION_IDENTITY_AMBIGUOUS',field:'positionId',expected:'one_native_position',actual:position.positionId,scope:'account',eventId:proof});positionsMatch=false;continue;}
    if(rows.length===0){if(position.openUnits!=='0'){positionsMatch=false;incident(next,{code:'POSITION_DEALS_UNRESOLVED',field:'positionId',expected:position.positionId,actual:null,eventId:proof});}continue;}
    const row=rows[0];validateDecimal(row.openUnits,{nonNegative:true});
    if(row.symbol!==state.intent.symbol||row.side!==state.intent.side){mismatch(next,'position.identity',{symbol:state.intent.symbol,side:state.intent.side},{symbol:row.symbol,side:row.side},proof);positionsMatch=false;}
    else if(row.openUnits!==position.openUnits){positionsMatch=false;incident(next,{code:'POSITION_DEALS_UNRESOLVED',field:'position.openUnits',expected:position.openUnits,actual:row.openUnits,eventId:proof});}
  }
  const matched=candidates.length===1||history.length>0;
  if(!matched&&state.transport.mayHaveStarted&&state.broker.terminal===null)incident(next,{code:'ORDER_NOT_OBSERVED',field:'orderId',expected:state.broker.orderId??'prepared_intent',actual:null,eventId:proof});
  if(!coverage.historyComplete)incident(next,{code:'HISTORY_INCOMPLETE',field:'historyComplete',expected:true,actual:false,eventId:proof});
  if(matched&&coverage.ordersComplete&&coverage.positionsComplete&&coverage.historyComplete&&positionsMatch)resolveLocal(next,['ORDER_NOT_OBSERVED','HISTORY_INCOMPLETE','POSITION_DEALS_UNRESOLVED'],proof);
  state=project(next);
  const complete=matched&&coverage.ordersComplete&&coverage.positionsComplete&&coverage.historyComplete&&positionsMatch&&!state.reconciliation.required;
  return freeze({state,matched,complete,proofId:proof,reason:complete?null:state.reconciliation.blockingScope==='account'?'ORDER_IDENTITY_UNRESOLVED':'ORDER_RECONCILIATION_INCOMPLETE'});
}
