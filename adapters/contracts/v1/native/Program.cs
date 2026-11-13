// Native C01 probe. Shape/calendar/string roundtrip only; no risk/authority implementation.
using System.Globalization;
using System.Numerics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using ExtremeLab.Contracts.V1;

internal static class Program
{
    private static JsonElement Schema;
    private static readonly JsonSerializerOptions Options = new() {
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        NumberHandling = JsonNumberHandling.Strict, PropertyNameCaseInsensitive = false,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never
    };
    private static void Need(bool value, string code) { if (!value) throw new InvalidDataException(code); }
    private static string StringValue(JsonElement e) => e.GetString() ?? throw new InvalidDataException("NULL_STRING");
    private static void Unique(JsonElement e, int depth = 0) {
        Need(depth <= 32, "MAX_DEPTH");
        if (e.ValueKind == JsonValueKind.Object) {
            var names = new HashSet<string>(StringComparer.Ordinal);
            foreach (var p in e.EnumerateObject()) { Need(names.Add(p.Name), "DUPLICATE_JSON_KEY"); Unique(p.Value, depth+1); }
        } else if (e.ValueKind == JsonValueKind.Array) foreach (var x in e.EnumerateArray()) Unique(x, depth+1);
    }
    private static string Quote(string value) {
        var b = new StringBuilder("\"");
        for (int i=0; i<value.Length; i++) {
            char c=value[i];
            if (char.IsHighSurrogate(c)) Need(i+1<value.Length && char.IsLowSurrogate(value[i+1]), "INVALID_UNICODE");
            if (char.IsLowSurrogate(c)) Need(i>0 && char.IsHighSurrogate(value[i-1]), "INVALID_UNICODE");
            switch (c) {
                case '"': b.Append("\\\""); break; case '\\': b.Append("\\\\"); break;
                case '\b': b.Append("\\b"); break; case '\f': b.Append("\\f"); break;
                case '\n': b.Append("\\n"); break; case '\r': b.Append("\\r"); break; case '\t': b.Append("\\t"); break;
                default: if (c<32 || c>=127) b.Append("\\u"+((int)c).ToString("x4",CultureInfo.InvariantCulture)); else b.Append(c); break;
            }
        }
        return b.Append('"').ToString();
    }
    private static string Canonical(JsonElement e) => e.ValueKind switch {
        JsonValueKind.Object => "{"+string.Join(",",e.EnumerateObject().OrderBy(p=>p.Name,StringComparer.Ordinal).Select(p=>Quote(p.Name)+":"+Canonical(p.Value)))+"}",
        JsonValueKind.Array => "["+string.Join(",",e.EnumerateArray().Select(Canonical))+"]",
        JsonValueKind.String => Quote(StringValue(e)), JsonValueKind.Null => "null",
        JsonValueKind.True => "true", JsonValueKind.False => "false", _ => throw new InvalidDataException("NUMERIC_JSON_SCALAR")
    };
    private static void Shape(JsonElement s, JsonElement v) {
        if (s.TryGetProperty("$ref",out var rr)) {
            var name=StringValue(rr); Need(name.StartsWith("#/$defs/",StringComparison.Ordinal),"EXTERNAL_SCHEMA_REF");
            name=name.Substring(8); Shape(Schema.GetProperty("$defs").GetProperty(name),v);
            if (name=="Timestamp") Need(DateTimeOffset.TryParseExact(StringValue(v),"yyyy-MM-dd'T'HH:mm:ss.ffffff'Z'",CultureInfo.InvariantCulture,DateTimeStyles.AssumeUniversal|DateTimeStyles.AdjustToUniversal,out _),"TIMESTAMP_CALENDAR");
            if (name=="UInt") Need(BigInteger.Parse(StringValue(v),CultureInfo.InvariantCulture)<=BigInteger.Parse("18446744073709551615",CultureInfo.InvariantCulture),"UINT_RANGE");
            return;
        }
        if (s.TryGetProperty("oneOf",out var choices)) {
            int matched=0; foreach(var c in choices.EnumerateArray()) try { Shape(c,v); matched++; } catch(InvalidDataException) {}
            Need(matched==1,"SCHEMA_REJECTED");
        }
        if (s.TryGetProperty("const",out var fixedValue)) Need(v.GetRawText()==fixedValue.GetRawText() || (v.ValueKind==JsonValueKind.String && fixedValue.ValueKind==JsonValueKind.String && StringValue(v)==StringValue(fixedValue)),"SCHEMA_REJECTED");
        if (s.TryGetProperty("enum",out var enums)) Need(v.ValueKind==JsonValueKind.String && enums.EnumerateArray().Any(x=>StringValue(x)==StringValue(v)),"SCHEMA_REJECTED");
        if (s.TryGetProperty("type",out var type)) {
            var expected=StringValue(type); var actual=v.ValueKind switch { JsonValueKind.Object=>"object",JsonValueKind.Array=>"array",JsonValueKind.String=>"string",JsonValueKind.True or JsonValueKind.False=>"boolean",JsonValueKind.Null=>"null",_=>"number"};
            Need(actual==expected,"SCHEMA_REJECTED");
            if(expected=="object") {
                var props=s.GetProperty("properties"); foreach(var r in s.GetProperty("required").EnumerateArray()) Need(v.TryGetProperty(StringValue(r),out _),"SCHEMA_REJECTED");
                foreach(var p in v.EnumerateObject()) { Need(props.TryGetProperty(p.Name,out var ps),"SCHEMA_REJECTED"); Shape(ps,p.Value); }
            }
            if(expected=="array") { if(s.TryGetProperty("maxItems",out var n)) Need(v.GetArrayLength()<=n.GetInt32(),"SCHEMA_REJECTED"); foreach(var x in v.EnumerateArray()) Shape(s.GetProperty("items"),x); }
        }
        if(v.ValueKind==JsonValueKind.String) {
            var str=StringValue(v); if(s.TryGetProperty("minLength",out var lo)) Need(str.Length>=lo.GetInt32(),"SCHEMA_REJECTED"); if(s.TryGetProperty("maxLength",out var hi)) Need(str.Length<=hi.GetInt32(),"SCHEMA_REJECTED");
            if(s.TryGetProperty("pattern",out var pattern)) {var match=Regex.Match(str,StringValue(pattern),RegexOptions.CultureInvariant,TimeSpan.FromSeconds(1)); Need(match.Success && match.Index==0 && match.Length==str.Length,"SCHEMA_REJECTED");}
        }
    }
    private static JsonElement Typed<T>(JsonElement e) => JsonSerializer.SerializeToElement(JsonSerializer.Deserialize<Envelope<T>>(e.GetRawText(),Options) ?? throw new InvalidDataException("NULL_EVENT"),Options);
    private static JsonElement Roundtrip(JsonElement e) => StringValue(e.GetProperty("kind")) switch {
        "InstrumentVersion" => Typed<ExtremeLab.Contracts.V1.InstrumentVersion>(e),
        "Quote" => Typed<ExtremeLab.Contracts.V1.Quote>(e),
        "Bar" => Typed<ExtremeLab.Contracts.V1.Bar>(e),
        "FeatureSnapshot" => Typed<ExtremeLab.Contracts.V1.FeatureSnapshot>(e),
        "SignalIntent" => Typed<ExtremeLab.Contracts.V1.SignalIntent>(e),
        "OrderIntent" => Typed<ExtremeLab.Contracts.V1.OrderIntent>(e),
        "BrokerOrder" => Typed<ExtremeLab.Contracts.V1.BrokerOrder>(e),
        "Deal" => Typed<ExtremeLab.Contracts.V1.Deal>(e),
        "Position" => Typed<ExtremeLab.Contracts.V1.Position>(e),
        "Cashflow" => Typed<ExtremeLab.Contracts.V1.Cashflow>(e),
        "Run" => Typed<ExtremeLab.Contracts.V1.Run>(e),
        "PolicyVersion" => Typed<ExtremeLab.Contracts.V1.PolicyVersion>(e),
        _ => throw new InvalidDataException("UNKNOWN_KIND")
    };
    public static int Main(string[] args) {
        if(args.Length!=1) { Console.Error.WriteLine("Usage: NativeWireProbe <schema.json>"); return 2; }
        using var schemaDoc=JsonDocument.Parse(File.ReadAllText(args[0])); Schema=schemaDoc.RootElement;
        for(string? line; (line=Console.ReadLine()) is not null;) {
            try {
                Need(Encoding.UTF8.GetByteCount(line)<=1_000_000,"DOCUMENT_TOO_LARGE");
                using var doc=JsonDocument.Parse(line,new JsonDocumentOptions{MaxDepth=32}); Unique(doc.RootElement);
                var e=doc.RootElement.GetProperty("event"); Shape(Schema,e); var typed=Roundtrip(e);
                var text=Canonical(typed); Need(text==Canonical(e),"TYPED_ROUNDTRIP_CHANGED_VALUE");
                var hash=Convert.ToHexString(SHA256.HashData(Encoding.ASCII.GetBytes(text))).ToLowerInvariant();
                Console.WriteLine(JsonSerializer.Serialize(new {ok=true,canonical=text,sha256=hash}));
            } catch(Exception ex) when (ex is JsonException or InvalidDataException or KeyNotFoundException or InvalidOperationException or FormatException or OverflowException) {
                Console.WriteLine(JsonSerializer.Serialize(new {ok=false,error=ex is InvalidDataException?ex.Message:"INVALID_REQUEST"}));
            }
        }
        return 0;
    }
}
