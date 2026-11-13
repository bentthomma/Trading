function adaptiveExitStep(state, observation, config) {
  const s = state, o = observation, c = config;
  const fail = reason => ({ status: "rejected", reason, nextState: s, proposal: null });
  const finite = v => Number.isFinite(v);
  const positive = v => finite(v) && v > 0;
  const optionalPrice = v => v == null || positive(v);
  if (!s || !o || !c) return fail("missing_input");
  if (!["long", "short"].includes(s.side) || !s.positionId ||
      !positive(s.entry) || !positive(s.quantity) ||
      !optionalPrice(s.confirmedStop) || !optionalPrice(s.proposedStop) ||
      !optionalPrice(s.bestPrice) ||
      !(s.lastTs == null || finite(s.lastTs))) return fail("invalid_state");
  if (!positive(c.tickSize) || !positive(c.initialRiskDistance) ||
      !positive(c.cashPerPriceUnit) || !finite(c.totalCostCash) || c.totalCostCash < 0 ||
      !finite(c.minStopDistance) || c.minStopDistance < 0 ||
      !finite(c.maxAgeMs) || c.maxAgeMs < 0 ||
      !finite(c.breakEvenAtR) || c.breakEvenAtR < 0 ||
      !finite(c.trailAtR) || c.trailAtR < 0 ||
      !finite(c.lockFraction) || c.lockFraction < 0 || c.lockFraction > 1 ||
      !positive(c.atrMultiple) ||
      !(c.trendAtrMultiple == null || positive(c.trendAtrMultiple)))
    return fail("invalid_config");
  if (!positive(o.bid) || !positive(o.ask) || o.ask < o.bid ||
      !positive(o.atr) || !finite(o.ts) || !finite(o.now))
    return fail("invalid_observation");
  if (o.ts > o.now) return fail("future_observation");
  if (o.now - o.ts > c.maxAgeMs) return fail("stale_observation");
  if (s.lastTs != null && o.ts <= s.lastTs) return fail("non_increasing_time");
  if (o.trend != null && (![-1, 0, 1].includes(o.trend.direction) ||
      !finite(o.trend.availableAt) || o.trend.availableAt > o.ts))
    return fail("unavailable_trend");
  const sign = s.side === "long" ? 1 : -1;
  const mark = sign === 1 ? o.bid : o.ask;
  const stronger = (a, b) => sign === 1 ? Math.max(a, b) : Math.min(a, b);
  const bestPrice = stronger(s.bestPrice ?? s.entry, stronger(s.entry, mark));
  const mfe = Math.max(0, sign * (bestPrice - s.entry));
  const cashValuePerPrice = s.quantity * c.cashPerPriceUnit;
  if (!positive(cashValuePerPrice)) return fail("invalid_cost_conversion");
  const costDistance = c.totalCostCash / cashValuePerPrice;
  if (!finite(costDistance)) return fail("invalid_cost_conversion");
  const nextState = { ...s, bestPrice, lastTs: o.ts };
  const details = { mark, mfe, costDistance,
    confirmedProtection: s.confirmedStop != null };
  const result = (status, reason, proposal = null) =>
    ({ status, reason, nextState, proposal, details });
  if (s.confirmedStop != null && sign * (mark - s.confirmedStop) <= 0)
    return result("confirmed_stop_crossed", "quote_crosses_confirmed_stop");
  let desired = s.entry - sign * c.initialRiskDistance;
  if (!positive(desired)) return fail("invalid_initial_stop");
  if (mfe >= c.breakEvenAtR * c.initialRiskDistance)
    desired = stronger(desired, s.entry + sign * costDistance);
  if (mfe >= c.trailAtR * c.initialRiskDistance) {
    const mult = o.trend?.direction === sign
      ? (c.trendAtrMultiple ?? c.atrMultiple) : c.atrMultiple;
    desired = stronger(desired, bestPrice - sign * mult * o.atr);
    if (mfe > costDistance)
      desired = stronger(desired,
        s.entry + sign * (costDistance + c.lockFraction * (mfe - costDistance)));
  }
  const baseline = [s.confirmedStop, s.proposedStop]
    .filter(v => v != null).reduce((a, b) => a == null ? b : stronger(a, b), null);
  if (baseline != null) desired = stronger(desired, baseline);
  const tick = c.tickSize, eps = tick * 1e-8;
  const stopPrice = sign === 1
    ? Math.ceil((desired - eps) / tick) * tick
    : Math.floor((desired + eps) / tick) * tick;
  if (!positive(stopPrice)) return result("blocked", "non_positive_stop");
  if (sign * (mark - stopPrice) <= eps ||
      sign * (mark - stopPrice) < c.minStopDistance - eps)
    return result("blocked", "minimum_distance_or_price_crossing");
  if (baseline != null && sign * (stopPrice - baseline) <= eps)
    return result("unchanged", "no_tighter_stop");
  const proposal = { positionId: s.positionId, side: s.side, stopPrice,
    basedOnTs: o.ts, proposalId: s.positionId + ":" + o.ts + ":" + stopPrice };
  nextState.proposedStop = stopPrice;
  return result("proposed", "tighter_stop_proposed", proposal);
}