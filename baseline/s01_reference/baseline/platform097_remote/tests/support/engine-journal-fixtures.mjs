import {digest} from '../../core/schema.mjs';

export const JOURNAL_TEST_ACCOUNT=Object.freeze({broker:'SYNTHETIC_BROKER_ONLY',id:'SYNTHETIC_DEMO_ACCOUNT',environment:'demo',currency:'CHF'});
export function originalPlan(now=1794049200000,overrides={}){
 return {planId:'plan-1',revision:1,scenarioId:'scenario-1',intentId:'intent-1',symbol:'SYNTHETIC_FX',side:'buy',orderKind:'limit',configRevision:0,
 createdAt:new Date(now).toISOString(),entry:'1.100000000000000001',stop:'1.09',target:'1.12',units:'10000',riskCash:'100',marginEstimate:'333.333333333333333333',costEstimate:'2',currency:'CHF',
 timeframes:{contextSeconds:3600,setupSeconds:300,triggerSeconds:60},exit:{atr:'0.002',minimumTargetDistance:'0.0003',halfLifeSeconds:'600',maxHoldSeconds:'2400',activationAtr:'1',trailAtr:'1'},
 validUntil:new Date(now+300000).toISOString(),reasonCode:'EXTREME_ZONE_RETURN',reason:'Synthetic original plan; no broker order',score:72.5,...overrides};
}
export function journalEvent(type,payload,seq='1',now=1794049200000,overrides={}){
 return {eventId:'event-'+seq,sequence:seq,sourceTime:new Date(now).toISOString(),type,correlationId:null,causationId:null,payloadHash:digest(payload),payload,...overrides};
}
export function journalBatch(botId,events,runtimeId='synthetic-ready20-runtime'){
 return {schemaVersion:1,botId,runtimeId,streamId:'synthetic-journal-stream',account:{...JOURNAL_TEST_ACCOUNT},build:{engine:'Th3Revolution20',version:'2.0.0-alpha.5',sourceHash:'a'.repeat(64)},events};
}
export function orderReport(overrides={}){
 return {intentId:'intent-1',planId:'plan-1',label:'SYNTHETIC_ORDER_LABEL',brokerOrderId:'9007199254740993',positionId:null,state:'working',requestedUnits:'10000',filledUnits:'0',remainingUnits:'10000',reason:'BROKER_WORKING',actorEvidence:'unknown',...overrides};
}
export function engineStatus(overrides={}){
 return {candidateScenarios:18,pendingCount:3,positionCount:5,readySymbols:40,totalSymbols:100,blocked:true,reason:'DEMO_ENTRIES_BLOCKED',decisionReasons:[{code:'MARKET_CLOSED',count:60},{code:'COST_BUDGET',count:12}],...overrides};
}
