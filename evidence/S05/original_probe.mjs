/** Execute actual archived arithmetic/order code. No sender, no broker adapter. */
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
const [platform,goldenPath]=process.argv.slice(2);
if(!platform||!goldenPath)throw Error('Usage: node original_probe.mjs original_Trading_Local golden-ledger.json');
const load=p=>import(pathToFileURL(resolve(platform,p)));
const d=await load('core/planning/decimal.mjs');
const o=await load('core/planning/order-lifecycle.mjs');
const sum=d.addDecimal,sub=d.subtractDecimal,mul=d.multiplyDecimal;
const zero='0',two='2';
const golden=JSON.parse(readFileSync(goldenPath,'utf8'));
const arithmetic=golden.cases.map(({input:c})=>{
 const risk=sub(sum(c.entry,mul(two,c.fee_per_piece_per_side)),c.normal_stop_fill);
 const qr=d.divideToStepFloor(c.risk_budget,risk,c.piece_step),qc=d.divideToStepFloor(c.initial_cash,sum(c.entry,c.fee_per_piece_per_side),c.piece_step);
 const q=c.fixed_quantity??d.minDecimal(qr,qc),entry=mul(q,c.entry),fee=mul(q,c.fee_per_piece_per_side),after=sub(sub(c.initial_cash,entry),fee);
 const mark=mul(q,c.mark_bid),gross=mul(q,sub(c.exit_fill,c.entry)),total=sum(fee,fee),net=sub(gross,total);
 return {case_id:c.case_id,currency:'CHF',quantity_unit:'pieces',sizing_mode:c.fixed_quantity===null?'pre_entry_minimum_of_risk_and_cash':'frozen_quantity_cost_stress_not_new_entry_permission',
 q_risk:qr,q_cash:qc,quantity:q,normal_loss_per_piece:risk,entry_notional:entry,entry_fee:fee,cash_after_entry:after,mark_bid_value:mark,mark_equity:sum(after,mark),gross_pnl:gross,exit_fee:fee,total_explicit_fees:total,net_pnl:net,ending_cash:sub(sum(after,mul(q,c.exit_fill)),fee),normal_loss_for_quantity:mul(q,risk),normal_budget_residual:sub(c.risk_budget,mul(q,risk)),normal_budget_exceeded:d.compareDecimal(mul(q,risk),c.risk_budget)>0,actual_scenario_loss_exceeds_budget:d.compareDecimal(net,sub(zero,c.risk_budget))<0,spread_slippage_deducted_again:false,entry_permitted_by_this_calculator:false};
});
const account={broker:'SYNTHETIC_S05',id:'NO_ACCOUNT_CONNECTION',environment:'demo'},at='2026-11-13T10:00:00.000Z';
const origin={planId:'P-S05',intentId:'I-S05',account,symbol:'MPR1_SYNTHETIC',side:'buy',kind:'limit',requestedUnits:'36',createdAt:at,expiresAt:null};
const event=(id,type,payload={})=>({id,type,payload,account,intentId:origin.intentId,planId:origin.planId,at});
function working(){let s=o.createOrderState(origin);for(const k of ['VALIDATED','RESERVED','DURABLE'])s=o.reduceOrderEvent(s,event(k,k));return o.reduceOrderEvent(s,event('send','DISPATCH_MAY_HAVE_STARTED',{operationId:'OP-S05'}));}
const native={orderId:'ORDER-S05',symbol:origin.symbol,side:'buy',kind:'limit'};
const fill=(id,units,fee)=>event(id,'BROKER_FILL',{...native,dealId:id,positionId:'POS-S05',units,price:'100.25',fee,feeCurrency:fee===null?null:'CHF',executedAt:at});
const cut=s=>({filled_units:s.quantities.knownFilledUnits,open_units:s.quantities.openPositionUnits,reserved_units:s.quantities.reservationUnits,costs:s.costs,blocking_issues:s.incidents.filter(x=>!x.resolved).map(x=>x.code).sort()});
const f=fill('FILL-S05','36',null),cost=event('COST-S05','DEAL_COST_CONFIRMED',{dealId:'FILL-S05',fee:'0.18',feeCurrency:'CHF'});
const chronological=o.reduceOrderEvent(o.reduceOrderEvent(working(),f),cost),reversed=o.reduceOrderEvent(o.reduceOrderEvent(working(),cost),f);
const replay=o.reduceOrderEvent(reversed,cost);
const cashTrace=[];let st=working();
for(const [id,q,fee]of [['PART-A','12','0.06'],['PART-B','24','0.12']]){st=o.reduceOrderEvent(st,fill(id,q,fee));cashTrace.push(cut(st));}
const splits={mpr1_fee_per_piece:'0.005',one_piece:'0.005',two_one_piece_fills_total:mul('2','0.005')};
console.log(JSON.stringify({arithmetic,partial_fill_trace:cashTrace,
 fee_before_fill_gap:{chronological:cut(chronological),reversed:cut(reversed),same_receipt_replayed:cut(replay),replay_is_identical_state_object:replay===reversed,status:'reproduced_not_fixed'},
 exact_fee_convention:splits,native_or_broker_execution:false},null,2));
