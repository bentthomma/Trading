const step = adaptiveExitStep;
const baseState = { positionId:"p1", side:"long", entry:100, quantity:10,
  confirmedStop:null, proposedStop:null, bestPrice:100, lastTs:null };
const baseConfig = { tickSize:0.01, initialRiskDistance:10, cashPerPriceUnit:1,
  totalCostCash:0, minStopDistance:1, maxAgeMs:1000, breakEvenAtR:1,
  trailAtR:1, lockFraction:0.4, atrMultiple:2, trendAtrMultiple:3 };
const quote = (price=100, extra={}) => ({
  bid:price, ask:price+0.2, atr:10, ts:1000, now:1000, ...extra });
let count = 0;
const ok = (name, condition) => { if (!condition) throw Error(name); count++; };
const near = (x,y) => Math.abs(x-y) < 1e-8;

let r = step(baseState, quote(), baseConfig);
ok("initial long stop", near(r.proposal.stopPrice,90));
ok("proposal not acknowledgement", r.nextState.confirmedStop === null);
ok("quantity unchanged", r.nextState.quantity === 10);

r = step({...baseState,side:"short"},quote(99.8),baseConfig);
ok("initial short stop", near(r.proposal.stopPrice,110));

r = step(baseState,quote(125),baseConfig);
ok("125 price requests 110 floor",near(r.proposal.stopPrice,110));

r = step({...baseState,side:"short",entry:125,bestPrice:125},quote(99.8),baseConfig);
ok("short mirrored profit floor",near(r.proposal.stopPrice,115));

r = step(baseState,quote(112),{...baseConfig,totalCostCash:20,trailAtR:100});
ok("net break even includes 20 cash costs",near(r.proposal.stopPrice,102));

r = step({...baseState,quantity:20},quote(112),
  {...baseConfig,totalCostCash:20,trailAtR:100});
ok("cost conversion scales by quantity",near(r.proposal.stopPrice,101));

r = step({...baseState,confirmedStop:110,proposedStop:110,bestPrice:125},
  quote(113,{atr:20}),baseConfig);
ok("long stop never loosens",r.status==="unchanged" && r.nextState.confirmedStop===110);

r = step({...baseState,side:"short",entry:125,bestPrice:100,
  confirmedStop:115,proposedStop:115},quote(111.8,{atr:20}),baseConfig);
ok("short stop never loosens",r.status==="unchanged" && r.nextState.confirmedStop===115);

r = step({...baseState,confirmedStop:110},quote(109.9),baseConfig);
ok("long trigger uses bid",r.status==="confirmed_stop_crossed");

r = step({...baseState,side:"short",confirmedStop:115},quote(114.9),baseConfig);
ok("short trigger uses ask",r.status==="confirmed_stop_crossed");

r = step({...baseState,confirmedStop:100,proposedStop:110,bestPrice:125},
  quote(105),baseConfig);
ok("unacknowledged request is not active protection",
  r.status==="blocked" && r.nextState.confirmedStop===100);

r = step(baseState,quote(125),{...baseConfig,tickSize:0.25,totalCostCash:2});
ok("long lock floor rounds in protection direction",
  near(r.proposal.stopPrice,110.25));

r = step({...baseState,side:"short",entry:125,bestPrice:125},quote(99.8),
  {...baseConfig,tickSize:0.25,totalCostCash:2});
ok("short lock floor rounds in protection direction",
  near(r.proposal.stopPrice,114.75));

r = step({...baseState,confirmedStop:105,bestPrice:125},quote(110.5),baseConfig);
ok("invalid distance preserves confirmed stop",
  r.status==="blocked" && r.nextState.confirmedStop===105 && !r.proposal);

ok("stale data rejected",
  step(baseState,quote(100,{now:2001}),baseConfig).reason==="stale_observation");
ok("future data rejected",
  step(baseState,quote(100,{now:999}),baseConfig).reason==="future_observation");
ok("reversed spread rejected",
  step(baseState,quote(100,{ask:99}),baseConfig).reason==="invalid_observation");
ok("out of order rejected",
  step({...baseState,lastTs:1001},quote(),baseConfig).reason==="non_increasing_time");
ok("duplicate quote rejected",
  step({...baseState,lastTs:1000},quote(),baseConfig).reason==="non_increasing_time");
ok("missing costs rejected",
  step(baseState,quote(),{...baseConfig,totalCostCash:undefined})
    .reason==="invalid_config");
ok("invalid ATR rejected",
  step(baseState,quote(100,{atr:0}),baseConfig).reason==="invalid_observation");
ok("future higher timeframe trend rejected",
  step(baseState,quote(100,{trend:{direction:1,availableAt:1001}}),baseConfig)
    .reason==="unavailable_trend");

const frozenState=Object.freeze({...baseState}), frozenQuote=Object.freeze(quote(125)),
  frozenConfig=Object.freeze({...baseConfig});
step(frozenState,frozenQuote,frozenConfig);
ok("inputs unchanged",JSON.stringify(frozenState)===JSON.stringify(baseState));

let state={...baseState}, last=0;
for (const [i, price] of [100,105,112,125,126,132].entries()) {
  const out=step(state,quote(price,{ts:1000+i,now:1000+i,atr:1+i}),baseConfig);
  if(out.proposal) {
    ok("acknowledged long ratchet "+i,out.proposal.stopPrice>=last);
    last=out.proposal.stopPrice;
    state={...out.nextState,confirmedStop:out.proposal.stopPrice};
  } else state=out.nextState;
}

ok("zero minimum distance still rejects a stop at current price",
  step(baseState,quote(),{...baseConfig,minStopDistance:0,breakEvenAtR:0,
    trailAtR:100}).status==="blocked");
ok("NaN quote rejected",
  step(baseState,quote(NaN),baseConfig).status==="rejected");
ok("rejected data does not advance observation time",
  step(baseState,quote(100,{now:999}),baseConfig).nextState===baseState);

const ss={...baseState}, oo=quote(125), cc={...baseConfig};
const snapshot=JSON.stringify([ss,oo,cc]);
step(ss,oo,cc);
ok("all inputs mutation free",JSON.stringify([ss,oo,cc])===snapshot);

r=step(baseState,quote(112),{...baseConfig,totalCostCash:20.05,trailAtR:100});
ok("long net break even 102.005 rounds to 102.01",
  near(r.proposal.stopPrice,102.01));

r=step({...baseState,side:"short"},quote(88),
  {...baseConfig,totalCostCash:20.05,trailAtR:100});
ok("short net break even 97.995 rounds to 97.99",
  near(r.proposal.stopPrice,97.99));

r=step({...baseState,confirmedStop:90},quote(102.02),
  {...baseConfig,totalCostCash:20.05,breakEvenAtR:0,trailAtR:100,
    minStopDistance:0.012});
ok("rounded long mark must still obey distance",
  r.status==="blocked" && r.nextState.confirmedStop===90);

r=step({...baseState,side:"short",confirmedStop:110},quote(97.78),
  {...baseConfig,totalCostCash:20.05,breakEvenAtR:0,trailAtR:100,
    minStopDistance:0.012});
ok("rounded short mark must still obey distance",
  r.status==="blocked" && r.nextState.confirmedStop===110);

ok("cash multiplier overflow rejected",
  step({...baseState,quantity:Number.MAX_VALUE},quote(),
    {...baseConfig,cashPerPriceUnit:2}).reason==="invalid_cost_conversion");
ok("cash multiplier underflow rejected",
  step({...baseState,quantity:Number.MIN_VALUE},quote(),
    {...baseConfig,cashPerPriceUnit:0.5}).reason==="invalid_cost_conversion");

const testResult = {passed:count,failed:0};