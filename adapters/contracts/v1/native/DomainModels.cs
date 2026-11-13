// S02 wire DTOs, not an execution API. No broker SDK reference.
using System.Text.Json.Serialization;
namespace ExtremeLab.Contracts.V1;
public sealed record Price
{
    [JsonRequired, JsonPropertyName("value")] public string Value { get; init; } = null!;
    [JsonRequired, JsonPropertyName("currency")] public string Currency { get; init; } = null!;
    [JsonRequired, JsonPropertyName("per_unit")] public string PerUnit { get; init; } = null!;
    [JsonRequired, JsonPropertyName("instrument_version")] public string InstrumentVersion { get; init; } = null!;
}
public sealed record Money
{
    [JsonRequired, JsonPropertyName("value")] public string Value { get; init; } = null!;
    [JsonRequired, JsonPropertyName("currency")] public string Currency { get; init; } = null!;
}
public sealed record Ratio
{
    [JsonRequired, JsonPropertyName("value")] public string Value { get; init; } = null!;
    [JsonRequired, JsonPropertyName("unit")] public string Unit { get; init; } = null!;
}
public sealed record Quantity
{
    [JsonRequired, JsonPropertyName("value")] public string Value { get; init; } = null!;
    [JsonRequired, JsonPropertyName("unit")] public string Unit { get; init; } = null!;
    [JsonRequired, JsonPropertyName("instrument_version")] public string InstrumentVersion { get; init; } = null!;
    [JsonRequired, JsonPropertyName("conversion_version")] public string ConversionVersion { get; init; } = null!;
}
public sealed record Distance
{
    [JsonRequired, JsonPropertyName("value")] public string Value { get; init; } = null!;
    [JsonRequired, JsonPropertyName("unit")] public string Unit { get; init; } = null!;
    [JsonRequired, JsonPropertyName("instrument_version")] public string InstrumentVersion { get; init; } = null!;
}
public sealed record AccountRef
{
    [JsonRequired, JsonPropertyName("provider")] public string Provider { get; init; } = null!;
    [JsonRequired, JsonPropertyName("account_id")] public string AccountId { get; init; } = null!;
    [JsonRequired, JsonPropertyName("environment")] public string Environment { get; init; } = null!;
    [JsonRequired, JsonPropertyName("currency")] public string Currency { get; init; } = null!;
    [JsonRequired, JsonPropertyName("model")] public string Model { get; init; } = null!;
}
public sealed record Coverage
{
    [JsonRequired, JsonPropertyName("completeness")] public string Completeness { get; init; } = null!;
    [JsonRequired, JsonPropertyName("gap_state")] public string GapState { get; init; } = null!;
    [JsonRequired, JsonPropertyName("truncated")] public bool Truncated { get; init; }
    [JsonRequired, JsonPropertyName("source_sequence_through")] public string? SourceSequenceThrough { get; init; } = null!;
}
public sealed record Times
{
    [JsonRequired, JsonPropertyName("event_time")] public string? EventTime { get; init; } = null!;
    [JsonRequired, JsonPropertyName("available_at")] public string? AvailableAt { get; init; } = null!;
    [JsonRequired, JsonPropertyName("received_at")] public string? ReceivedAt { get; init; } = null!;
    [JsonRequired, JsonPropertyName("features_ready_at")] public string? FeaturesReadyAt { get; init; } = null!;
    [JsonRequired, JsonPropertyName("decision_at")] public string? DecisionAt { get; init; } = null!;
    [JsonRequired, JsonPropertyName("execution_not_before")] public string? ExecutionNotBefore { get; init; } = null!;
}
public sealed record Feature
{
    [JsonRequired, JsonPropertyName("feature_id")] public string FeatureId { get; init; } = null!;
    [JsonRequired, JsonPropertyName("value")] public string Value { get; init; } = null!;
    [JsonRequired, JsonPropertyName("unit")] public string Unit { get; init; } = null!;
    [JsonRequired, JsonPropertyName("formula_version")] public string FormulaVersion { get; init; } = null!;
    [JsonRequired, JsonPropertyName("absolute_tolerance")] public string AbsoluteTolerance { get; init; } = null!;
}
public sealed record InstrumentVersion
{
    [JsonRequired, JsonPropertyName("version_id")] public string VersionId { get; init; } = null!;
    [JsonRequired, JsonPropertyName("symbol")] public string Symbol { get; init; } = null!;
    [JsonRequired, JsonPropertyName("provider")] public string Provider { get; init; } = null!;
    [JsonRequired, JsonPropertyName("venue")] public string Venue { get; init; } = null!;
    [JsonRequired, JsonPropertyName("base_quantity_unit")] public string BaseQuantityUnit { get; init; } = null!;
    [JsonRequired, JsonPropertyName("quote_currency")] public string QuoteCurrency { get; init; } = null!;
    [JsonRequired, JsonPropertyName("tick_size")] public string TickSize { get; init; } = null!;
    [JsonRequired, JsonPropertyName("pip_size")] public string PipSize { get; init; } = null!;
    [JsonRequired, JsonPropertyName("units_per_lot")] public string UnitsPerLot { get; init; } = null!;
    [JsonRequired, JsonPropertyName("conversion_version")] public string ConversionVersion { get; init; } = null!;
    [JsonRequired, JsonPropertyName("minimum_quantity")] public string MinimumQuantity { get; init; } = null!;
    [JsonRequired, JsonPropertyName("maximum_quantity")] public string MaximumQuantity { get; init; } = null!;
    [JsonRequired, JsonPropertyName("quantity_step")] public string QuantityStep { get; init; } = null!;
    [JsonRequired, JsonPropertyName("allows_negative_price")] public bool AllowsNegativePrice { get; init; }
    [JsonRequired, JsonPropertyName("effective_at")] public string EffectiveAt { get; init; } = null!;
}
public sealed record Quote
{
    [JsonRequired, JsonPropertyName("bid")] public Price Bid { get; init; } = null!;
    [JsonRequired, JsonPropertyName("ask")] public Price Ask { get; init; } = null!;
    [JsonRequired, JsonPropertyName("source_quote_id")] public string SourceQuoteId { get; init; } = null!;
}
public sealed record Bar
{
    [JsonRequired, JsonPropertyName("open_time")] public string OpenTime { get; init; } = null!;
    [JsonRequired, JsonPropertyName("close_time")] public string CloseTime { get; init; } = null!;
    [JsonRequired, JsonPropertyName("timeframe_seconds")] public string TimeframeSeconds { get; init; } = null!;
    [JsonRequired, JsonPropertyName("open")] public Price Open { get; init; } = null!;
    [JsonRequired, JsonPropertyName("high")] public Price High { get; init; } = null!;
    [JsonRequired, JsonPropertyName("low")] public Price Low { get; init; } = null!;
    [JsonRequired, JsonPropertyName("close")] public Price Close { get; init; } = null!;
    [JsonRequired, JsonPropertyName("volume")] public Quantity Volume { get; init; } = null!;
    [JsonRequired, JsonPropertyName("is_closed")] public bool IsClosed { get; init; }
}
public sealed record FeatureSnapshot
{
    [JsonRequired, JsonPropertyName("snapshot_id")] public string SnapshotId { get; init; } = null!;
    [JsonRequired, JsonPropertyName("feature_set_version")] public string FeatureSetVersion { get; init; } = null!;
    [JsonRequired, JsonPropertyName("input_event_ids")] public List<string> InputEventIds { get; init; } = null!;
    [JsonRequired, JsonPropertyName("features")] public List<Feature> Features { get; init; } = null!;
}
public sealed record SignalIntent
{
    [JsonRequired, JsonPropertyName("signal_id")] public string SignalId { get; init; } = null!;
    [JsonRequired, JsonPropertyName("feature_snapshot_id")] public string FeatureSnapshotId { get; init; } = null!;
    [JsonRequired, JsonPropertyName("strategy_version")] public string StrategyVersion { get; init; } = null!;
    [JsonRequired, JsonPropertyName("side")] public string Side { get; init; } = null!;
    [JsonRequired, JsonPropertyName("reason_code")] public string ReasonCode { get; init; } = null!;
    [JsonRequired, JsonPropertyName("source_run_id")] public string SourceRunId { get; init; } = null!;
}
public sealed record OrderIntent
{
    [JsonRequired, JsonPropertyName("intent_id")] public string IntentId { get; init; } = null!;
    [JsonRequired, JsonPropertyName("signal_id")] public string SignalId { get; init; } = null!;
    [JsonRequired, JsonPropertyName("account")] public AccountRef Account { get; init; } = null!;
    [JsonRequired, JsonPropertyName("side")] public string Side { get; init; } = null!;
    [JsonRequired, JsonPropertyName("order_type")] public string OrderType { get; init; } = null!;
    [JsonRequired, JsonPropertyName("quantity")] public Quantity Quantity { get; init; } = null!;
    [JsonRequired, JsonPropertyName("limit_price")] public Price? LimitPrice { get; init; } = null!;
    [JsonRequired, JsonPropertyName("trigger_price")] public Price? TriggerPrice { get; init; } = null!;
    [JsonRequired, JsonPropertyName("protective_stop")] public Price? ProtectiveStop { get; init; } = null!;
    [JsonRequired, JsonPropertyName("distance")] public Distance? Distance { get; init; } = null!;
    [JsonRequired, JsonPropertyName("time_in_force")] public string TimeInForce { get; init; } = null!;
    [JsonRequired, JsonPropertyName("expires_at")] public string ExpiresAt { get; init; } = null!;
    [JsonRequired, JsonPropertyName("idempotency_key")] public string IdempotencyKey { get; init; } = null!;
    [JsonRequired, JsonPropertyName("expected_account_revision")] public string ExpectedAccountRevision { get; init; } = null!;
    [JsonRequired, JsonPropertyName("expected_policy_revision")] public string ExpectedPolicyRevision { get; init; } = null!;
    [JsonRequired, JsonPropertyName("policy_hash")] public string PolicyHash { get; init; } = null!;
    [JsonRequired, JsonPropertyName("risk_reservation_id")] public string RiskReservationId { get; init; } = null!;
    [JsonRequired, JsonPropertyName("authorization_chain_id")] public string AuthorizationChainId { get; init; } = null!;
}
public sealed record BrokerOrder
{
    [JsonRequired, JsonPropertyName("intent_id")] public string IntentId { get; init; } = null!;
    [JsonRequired, JsonPropertyName("broker_order_id")] public string BrokerOrderId { get; init; } = null!;
    [JsonRequired, JsonPropertyName("account")] public AccountRef Account { get; init; } = null!;
    [JsonRequired, JsonPropertyName("status")] public string Status { get; init; } = null!;
    [JsonRequired, JsonPropertyName("filled_quantity")] public Quantity FilledQuantity { get; init; } = null!;
    [JsonRequired, JsonPropertyName("source_proof_id")] public string SourceProofId { get; init; } = null!;
}
public sealed record Deal
{
    [JsonRequired, JsonPropertyName("deal_id")] public string DealId { get; init; } = null!;
    [JsonRequired, JsonPropertyName("broker_order_id")] public string BrokerOrderId { get; init; } = null!;
    [JsonRequired, JsonPropertyName("position_id")] public string? PositionId { get; init; } = null!;
    [JsonRequired, JsonPropertyName("account")] public AccountRef Account { get; init; } = null!;
    [JsonRequired, JsonPropertyName("side")] public string Side { get; init; } = null!;
    [JsonRequired, JsonPropertyName("quantity")] public Quantity Quantity { get; init; } = null!;
    [JsonRequired, JsonPropertyName("price")] public Price Price { get; init; } = null!;
    [JsonRequired, JsonPropertyName("commission")] public Money Commission { get; init; } = null!;
    [JsonRequired, JsonPropertyName("execution_time")] public string ExecutionTime { get; init; } = null!;
    [JsonRequired, JsonPropertyName("source_proof_id")] public string SourceProofId { get; init; } = null!;
}
public sealed record Position
{
    [JsonRequired, JsonPropertyName("position_id")] public string PositionId { get; init; } = null!;
    [JsonRequired, JsonPropertyName("account")] public AccountRef Account { get; init; } = null!;
    [JsonRequired, JsonPropertyName("status")] public string Status { get; init; } = null!;
    [JsonRequired, JsonPropertyName("side")] public string Side { get; init; } = null!;
    [JsonRequired, JsonPropertyName("quantity")] public Quantity Quantity { get; init; } = null!;
    [JsonRequired, JsonPropertyName("average_price")] public Price? AveragePrice { get; init; } = null!;
    [JsonRequired, JsonPropertyName("broker_protection_status")] public string BrokerProtectionStatus { get; init; } = null!;
    [JsonRequired, JsonPropertyName("protection_proof_id")] public string? ProtectionProofId { get; init; } = null!;
    [JsonRequired, JsonPropertyName("original_plan_id")] public string? OriginalPlanId { get; init; } = null!;
    [JsonRequired, JsonPropertyName("observed_at")] public string ObservedAt { get; init; } = null!;
}
public sealed record Cashflow
{
    [JsonRequired, JsonPropertyName("cashflow_id")] public string CashflowId { get; init; } = null!;
    [JsonRequired, JsonPropertyName("account")] public AccountRef Account { get; init; } = null!;
    [JsonRequired, JsonPropertyName("kind")] public string Kind { get; init; } = null!;
    [JsonRequired, JsonPropertyName("amount")] public Money Amount { get; init; } = null!;
    [JsonRequired, JsonPropertyName("booking_time")] public string BookingTime { get; init; } = null!;
    [JsonRequired, JsonPropertyName("related_deal_id")] public string? RelatedDealId { get; init; } = null!;
    [JsonRequired, JsonPropertyName("source_proof_id")] public string SourceProofId { get; init; } = null!;
}
public sealed record Run
{
    [JsonRequired, JsonPropertyName("run_id")] public string RunId { get; init; } = null!;
    [JsonRequired, JsonPropertyName("mode")] public string Mode { get; init; } = null!;
    [JsonRequired, JsonPropertyName("status")] public string Status { get; init; } = null!;
    [JsonRequired, JsonPropertyName("engine_hash")] public string EngineHash { get; init; } = null!;
    [JsonRequired, JsonPropertyName("data_hash")] public string DataHash { get; init; } = null!;
    [JsonRequired, JsonPropertyName("protocol_hash")] public string ProtocolHash { get; init; } = null!;
    [JsonRequired, JsonPropertyName("seed")] public string Seed { get; init; } = null!;
    [JsonRequired, JsonPropertyName("started_at")] public string? StartedAt { get; init; } = null!;
    [JsonRequired, JsonPropertyName("finished_at")] public string? FinishedAt { get; init; } = null!;
    [JsonRequired, JsonPropertyName("result_hash")] public string? ResultHash { get; init; } = null!;
}
public sealed record PolicyVersion
{
    [JsonRequired, JsonPropertyName("version_id")] public string VersionId { get; init; } = null!;
    [JsonRequired, JsonPropertyName("revision")] public string Revision { get; init; } = null!;
    [JsonRequired, JsonPropertyName("status")] public string Status { get; init; } = null!;
    [JsonRequired, JsonPropertyName("environment")] public string Environment { get; init; } = null!;
    [JsonRequired, JsonPropertyName("risk_per_trade")] public Ratio RiskPerTrade { get; init; } = null!;
    [JsonRequired, JsonPropertyName("total_risk")] public Ratio TotalRisk { get; init; } = null!;
    [JsonRequired, JsonPropertyName("minimum_margin_level")] public Ratio MinimumMarginLevel { get; init; } = null!;
    [JsonRequired, JsonPropertyName("maximum_positions")] public string? MaximumPositions { get; init; } = null!;
    [JsonRequired, JsonPropertyName("allow_short")] public bool AllowShort { get; init; }
    [JsonRequired, JsonPropertyName("effective_from")] public string EffectiveFrom { get; init; } = null!;
    [JsonRequired, JsonPropertyName("supersedes")] public string? Supersedes { get; init; } = null!;
}
public sealed record Envelope<TPayload>
{
    [JsonRequired, JsonPropertyName("schema_version")] public string SchemaVersion { get; init; } = default!;
    [JsonRequired, JsonPropertyName("source_schema_version")] public string SourceSchemaVersion { get; init; } = default!;
    [JsonRequired, JsonPropertyName("event_id")] public string EventId { get; init; } = default!;
    [JsonRequired, JsonPropertyName("source_id")] public string SourceId { get; init; } = default!;
    [JsonRequired, JsonPropertyName("stream_id")] public string StreamId { get; init; } = default!;
    [JsonRequired, JsonPropertyName("sequence")] public string Sequence { get; init; } = default!;
    [JsonRequired, JsonPropertyName("data_version")] public string DataVersion { get; init; } = default!;
    [JsonRequired, JsonPropertyName("run_id")] public string RunId { get; init; } = default!;
    [JsonRequired, JsonPropertyName("bot_id")] public string? BotId { get; init; } = default!;
    [JsonRequired, JsonPropertyName("account_ref")] public AccountRef? AccountRef { get; init; } = default!;
    [JsonRequired, JsonPropertyName("instrument_version")] public string? InstrumentVersion { get; init; } = default!;
    [JsonRequired, JsonPropertyName("policy_version")] public string? PolicyVersion { get; init; } = default!;
    [JsonRequired, JsonPropertyName("times")] public Times Times { get; init; } = default!;
    [JsonRequired, JsonPropertyName("coverage")] public Coverage Coverage { get; init; } = default!;
    [JsonRequired, JsonPropertyName("payload_hash")] public string PayloadHash { get; init; } = default!;
    [JsonRequired, JsonPropertyName("kind")] public string Kind { get; init; } = default!;
    [JsonRequired, JsonPropertyName("payload")] public TPayload Payload { get; init; } = default!;
    [JsonRequired, JsonPropertyName("account_state")] public string AccountState { get; init; } = default!;
}
