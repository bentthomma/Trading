// ExtremeLab Ready 1.2.0 demo beta — broker execution must be acceptance-tested on DEMO.
// Optional telemetry OFF by default; no live-account switch. Do not hot-replace an active instance.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using cAlgo.API;
using cAlgo.API.Internals;
using ExtremeLab;
using IOFile = System.IO.File;

namespace cAlgo.Robots
{
    public enum LabSizing { FixedLots=0, RiskBudget=1, BudgetUpToLots=2 }
    public enum LabDecay { EntryAtrPerDay, PricePerDay, Exponential }
    [Robot(TimeZone=TimeZones.UTC, AccessRights=AccessRights.None)]
    public partial class ExtremeLabReady121 : Robot
    {
        [Parameter("Alle Broker-Symbole", DefaultValue=true, Group="01 Universum")]
        public bool AllBrokerSymbols { get; set; }
        [Parameter("Ausschliessen CSV", DefaultValue="", Group="01 Universum")]
        public string ExcludedCsv { get; set; }
        [Parameter("Symbole CSV (nur wenn Alle = Nein)", DefaultValue="", Group="01 Universum")]
        public string SymbolCsv { get; set; }
        [Parameter("Max. Symbole (0 = alle)", DefaultValue=0, MinValue=0, MaxValue=5000, Group="01 Universum")]
        public int MaximumSymbols { get; set; }
        [Parameter("Alte Instanz gestoppt", DefaultValue=false, Group="00 Uebernahme")]
        public bool OldInstanceStopped { get; set; }
        [Parameter("Alte Bot-Positionen uebernehmen", DefaultValue=true, Group="00 Uebernahme")]
        public bool AdoptLegacy { get; set; }
        [Parameter("Demo-Handel aktiv", DefaultValue=true, Group="02 Demo")]
        public bool AutoArm { get; set; }
        [Parameter("Groessenmodus", DefaultValue=LabSizing.BudgetUpToLots, Group="02 Demo")]
        public LabSizing Sizing { get; set; }
        [Parameter("Feste Lots", DefaultValue=10.0, MinValue=.001, Group="02 Demo")]
        public double FixedLots { get; set; }
        [Parameter("Short erlauben", DefaultValue=true, Group="02 Demo")]
        public bool AllowShort { get; set; }
        [Parameter("Max. offene Positionen (0=Budget)", DefaultValue=0, MinValue=0, MaxValue=1000, Group="03 Konto")]
        public int MaxPositions { get; set; }
        [Parameter("Min. Margin-Level nach Einstieg %", DefaultValue=300, MinValue=100, Group="03 Konto")]
        public double MinimumMarginLevel { get; set; }
        [Parameter("Max. geplantes Risiko je Trade %", DefaultValue=3.0, MinValue=.01, MaxValue=20, Group="03 Konto")]
        public double RiskPercent { get; set; }
        [Parameter("Max. Konto-Stoprisiko %", DefaultValue=15.0, MinValue=.1, MaxValue=80, Group="03 Konto")]
        public double TotalRiskPercent { get; set; }
        [Parameter("Bot-Drawdown: Pause + Schliessen %", DefaultValue=20, MinValue=1, MaxValue=80, Group="03 Konto")]
        public double DrawdownStopPercent { get; set; }
        [Parameter("Historie: geschlossene M5-Bars", DefaultValue=72, MinValue=20, MaxValue=1000, Group="04 Strategie")]
        public int LookbackBars { get; set; }
        [Parameter("Dynamische Grenzen", DefaultValue=true, Group="04 Strategie")]
        public bool AdaptiveBands { get; set; }
        [Parameter("Umkehrkerze bestaetigen", DefaultValue=true, Group="04 Strategie")]
        public bool RequireReversal { get; set; }
        [Parameter("FX-Anzahlgrenze (0=aus)", DefaultValue=0, MinValue=0, MaxValue=100, Group="03 Konto")]
        public int MaxCurrencyBias { get; set; }
        [Parameter("Desktop-Panel (nur lokal)", DefaultValue=true, Group="09 Ansicht")]
        public bool DesktopPanel { get; set; }
        [Parameter("Strukturierte Journal-Daten", DefaultValue=true, Group="09 Ansicht")]
        public bool JournalData { get; set; }
        [Parameter("Trendfilter", DefaultValue=true, Group="04 Strategie")]
        public bool UseTrendFilter { get; set; }
        [Parameter("Trendgrenze (keine Wahrscheinlichkeit)", DefaultValue=.9, MinValue=0, MaxValue=1, Group="04 Strategie")]
        public double TrendGate { get; set; }
        [Parameter("Einstiegspuffer % der Spanne", DefaultValue=2, MinValue=0, MaxValue=30, Group="04 Strategie")]
        public double EntryBufferPercent { get; set; }
        [Parameter("Einstiegszonenbreite %", DefaultValue=20, MinValue=.1, MaxValue=30, Group="04 Strategie")]
        public double ZonePercent { get; set; }
        [Parameter("Zielpuffer %", DefaultValue=25, MinValue=0, MaxValue=49, Group="04 Strategie")]
        public double TargetBufferPercent { get; set; }
        [Parameter("Stop-Abstand x ATR14", DefaultValue=2, MinValue=.1, MaxValue=20, Group="04 Strategie")]
        public double StopAtr { get; set; }
        [Parameter("Alpha historische Spanne", DefaultValue=.6, MinValue=0, MaxValue=1, Group="04 Strategie")]
        public double BandAlpha { get; set; }
        [Parameter("ATR-Bandfaktor", DefaultValue=3, MinValue=.1, MaxValue=20, Group="04 Strategie")]
        public double AtrBandFactor { get; set; }
        [Parameter("Verschiebung der Mitte", DefaultValue=.5, MinValue=0, MaxValue=5, Group="04 Strategie")]
        public double MidShift { get; set; }
        [Parameter("Glaettung rho", DefaultValue=.25, MinValue=.01, MaxValue=1, Group="04 Strategie")]
        public double Smoothing { get; set; }
        [Parameter("Ziel-Abbau", DefaultValue=LabDecay.EntryAtrPerDay, Group="05 Ausstieg")]
        public LabDecay Decay { get; set; }
        [Parameter("Pro Tag x Einstiegs-ATR", DefaultValue=1.0, MinValue=0, MaxValue=5, Group="05 Ausstieg")]
        public double DailyAtrFraction { get; set; }
        [Parameter("Pro Tag in Preiseinheiten", DefaultValue=.0001, MinValue=0, Group="05 Ausstieg")]
        public double DailyPriceReduction { get; set; }
        [Parameter("Exponential tau Tage", DefaultValue=1, MinValue=.1, Group="05 Ausstieg")]
        public double TauDays { get; set; }
        [Parameter("Max. Haltedauer Kalendertage", DefaultValue=2, MinValue=1, MaxValue=90, Group="05 Ausstieg")]
        public int MaxHoldDays { get; set; }
        [Parameter("Max. Spread in Basispunkten", DefaultValue=3, MinValue=.1, MaxValue=100, Group="06 Ausfuehrung")]
        public double MaxSpreadBps { get; set; }
        [Parameter("Einstiegs-Toleranz Basispunkte", DefaultValue=1, MinValue=.1, MaxValue=100, Group="06 Ausfuehrung")]
        public double SlippageBps { get; set; }
        [Parameter("Kostenreserve Roundtrip Basispunkte", DefaultValue=1, MinValue=0, MaxValue=200, Group="06 Ausfuehrung")]
        public double FeeReserveBps { get; set; }
        [Parameter("Min. Kostenreserve Kontowaehrung", DefaultValue=2, MinValue=0, Group="06 Ausfuehrung")]
        public double MinimumFeeReserve { get; set; }
        [Parameter("Max. Quotealter Sekunden", DefaultValue=30, MinValue=1, MaxValue=120, Group="06 Ausfuehrung")]
        public int MaxQuoteAge { get; set; }
        [Parameter("Max. Signalalter Sekunden", DefaultValue=30, MinValue=1, MaxValue=60, Group="06 Ausfuehrung")]
        public int MaxSignalAge { get; set; }
        [Parameter("Temporaere Tickdatei", DefaultValue=false, Group="07 Daten")]
        public bool RecordTicks { get; set; }
        [Parameter("Tickdatei-Limit MB pro Lauf", DefaultValue=500, MinValue=10, MaxValue=5000, Group="07 Daten")]
        public int TickLimitMb { get; set; }
        [Parameter("Statuslog alle Sekunden", DefaultValue=10, MinValue=10, MaxValue=3600, Group="08 Status")]
        public int StatusSeconds { get; set; }


        [Parameter("FX-Risiko je Waehrungsrichtung % (0=aus)", DefaultValue=6, MinValue=0, MaxValue=80, Group="03 Konto")]
        public double CurrencyRiskPercent { get; set; }
        [Parameter("Kosten relativ zur Zielbewegung", DefaultValue=true, Group="06 Ausfuehrung")]
        public bool RelativeCosts { get; set; }
        [Parameter("Max. Kostenanteil der Zielbewegung %", DefaultValue=30, MinValue=1, MaxValue=90, Group="06 Ausfuehrung")]
        public double MaxCostPercent { get; set; }
        [Parameter("Gleichzeitige Historienanfragen", DefaultValue=4, MinValue=1, MaxValue=8, Group="10 Technik")]
        public int LoadParallelism { get; set; }
        [Parameter("Historien-Timeout Sekunden", DefaultValue=45, MinValue=10, MaxValue=180, Group="10 Technik")]
        public int LoadTimeoutSeconds { get; set; }
        [Parameter("Historien-Wiederholungen", DefaultValue=3, MinValue=1, MaxValue=5, Group="10 Technik")]
        public int LoadRetries { get; set; }
        [Parameter("Kontoreferenz (0 = Startwert)", DefaultValue=0, MinValue=0, Group="03 Konto")]
        public double EquityReference { get; set; }
        [Parameter("Kerzen-Snapshot alle Minuten", DefaultValue=15, MinValue=5, MaxValue=120, Group="07 Daten")]
        public int CandleCheckpointMinutes { get; set; }

        const string Label = "ExtremeLabMobile.v2";
        const string Version = "1.2.1-integration-candidate";
        bool Own(Position p) => RecoveryRules.OwnLabel(p.Label,AdoptLegacy);
        readonly Queue<string> _discoverQueue=new Queue<string>();
        readonly HashSet<string> _selected=new HashSet<string>(StringComparer.Ordinal);
        readonly HashSet<string> _excluded=new HashSet<string>(StringComparer.Ordinal);
        readonly HashSet<int> _unprotected=new HashSet<int>();
        readonly Dictionary<string, (DateTime At,double Value)> _conversion=new Dictionary<string,(DateTime,double)>();
        int _catalogCount,_discoverySkipped;
        bool _universeReported,_submitting;
        static readonly CultureInfo Inv = CultureInfo.InvariantCulture;
        static readonly JsonSerializerOptions Json = new JsonSerializerOptions { NumberHandling=JsonNumberHandling.AllowNamedFloatingPointLiterals };
        sealed class Market
        {
            public Symbol Symbol; public Bars Bars; public Engine Engine; public Feature Feature;
            public DateTime LastBar, LastQuote, LastAttempt, LastExit;
            public bool Initialized,Ready, Loading, Failed; public int LoadAttempts;
            public LoadLease Lease = new LoadLease();
            public DateTime RetryLoadAt, NoTradeThrough, LastCheckWall, LastBarCheckpoint;
            public double Bid, Ask;
            public bool Subscribed;
            public string LoadStage="QUEUED";
            public Decision Latest; public string Problem="Historie laden";
            public readonly Queue<Candle> Candles=new Queue<Candle>();
        }
        readonly Dictionary<string,Market> _markets=new Dictionary<string,Market>(StringComparer.Ordinal);
        readonly Queue<string> _loadQueue=new Queue<string>();
        readonly Dictionary<int,ManagedTrade> _managed=new Dictionary<int,ManagedTrade>();
        readonly HashSet<int> _stateWarnings=new HashSet<int>();
        readonly Dictionary<int,string> _exitReasons=new Dictionary<int,string>();
        readonly List<Decision> _snapshots=new List<Decision>();
        readonly List<string> _messages=new List<string>();
        readonly Dictionary<string,(int N,int W,double Net)> _stats=new Dictionary<string,(int,int,double)>();
        StreamWriter _events,_decisions,_ticks,_equity,_trades;
        FileStream _lock;
        Settings _settings;
        bool _armed,_fatal,_halting,_writing,_started;
        string _folder,_run,_stateFile;
        long _sequence,_tickChars,_decisionSequence,_tickSequence;
        string _parameterHash;
        DateTime _lastReconcile,_lastCoverage;
        int _evaluationCursor;
        readonly DealLedger _ledger=new DealLedger();
        readonly Dictionary<int,double> _initialVolumes=new Dictionary<int,double>();
        readonly Dictionary<int,DateTime> _pendingHistory=new Dictionary<int,DateTime>();
        readonly Dictionary<int,Excursion> _excursions=new Dictionary<int,Excursion>();
        readonly Dictionary<int,string> _brokerCloseReasons=new Dictionary<int,string>();
        readonly HashSet<int> _finishedPositions=new HashSet<int>();
        readonly Queue<DateTime> _orderTimes=new Queue<DateTime>();
        double _initialBalance,_accountDelta,_otherDelta,_unexplained,_historyAllOwnNet;
        bool _historyReady;
        int _historyScanFailures;
        string _accountCheck="START";
        double _initialEquity,_openingNet,_realized,_peak,_maxDrawdown,_maxDrawdownMoney;
        int _wins,_losses,_closed;
        DateTime _lastFlush,_lastMetric,_lastRender,_lastEmergency;
        public string StatusText => _fatal ? "FEHLER / neue Orders gesperrt" : _halting ? "DRAWDOWN-STOP" : _armed ? "DEMO-HANDEL AKTIV" : "BEOBACHTEN / keine neuen Orders";

        protected override void OnStart()
        {
            if(!OldInstanceStopped) { Print("START GESPERRT: zuerst alte Instanz stoppen (Positionen nicht schliessen), dann Alte Instanz gestoppt=Ja. Es wurde nichts am Konto geaendert."); Stop(); return; }
            if(Account.IsLive) { Print("LIVE-KONTO GESPERRT. ExtremeLabMobile arbeitet nur auf Demo."); Stop(); return; }
            if(Account.AccountType != AccountType.Hedged) { Print("Diese Version benoetigt ein Hedging-Demokonto. Netting wird nicht automatisch verwendet."); Stop(); return; }
            try
            {
                _settings=new Settings { WindowBars=LookbackBars, Adaptive=AdaptiveBands, TrendFilter=UseTrendFilter,
                    TrendGate=TrendGate,Buffer=EntryBufferPercent/100,ZoneWidth=ZonePercent/100,TargetBuffer=TargetBufferPercent/100,
                    StopAtr=StopAtr,Alpha=BandAlpha,AtrBandFactor=AtrBandFactor,MidShift=MidShift,Smoothing=Smoothing };
                _settings.Validate();
                // Local OS file lock: one bot instance per demo account ON THIS MACHINE.
                _lock=new FileStream("account_"+Account.Number+".lock",FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None);
                _run=Server.Time.ToString("yyyyMMdd_HHmmss",Inv)+"_"+Guid.NewGuid().ToString("N").Substring(0,6);
                _folder="run_"+_run; Directory.CreateDirectory(_folder);
                _stateFile="positions_"+Account.Number+".json";
                _events=Writer("events.jsonl");_decisions=Writer("decisions.jsonl");
                _ticks=Writer("quotes.csv"); _ticks.WriteLine("sequence,received_server_utc,symbol,bid,ask");
                _equity=Writer("equity.csv");_equity.WriteLine("utc,account_equity,bot_session_pnl,bot_virtual_equity,closed_net,open_net,margin,free_margin,margin_level,account_drawdown_pct,open_bot_positions");
                _trades=Writer("trades.csv");_trades.WriteLine("utc,position_id,symbol,side,units,entry_price,closing_price_from_history,closing_utc_from_history,net_profit,gross_profit,commissions,swap,reason,session_carry_in");
                InitializeOnline();
                _initialEquity=Account.Equity;_initialBalance=Account.Balance;_peak=Math.Max(_initialEquity,EquityReference);
                _openingNet=Positions.Where(p=>Own(p)).Sum(p=>p.NetProfit);
                InitializeLedger();
                _parameterHash=ParameterHash();
                LoadPositionState();
                Positions.Closed+=OnPositionClosed;
                Positions.Opened+=OnPositionOpened;
                _started=true;
                Log("START", new { version=Version,run=_run,accountCurrency=Account.Asset.Name,startingEquity=_initialEquity,settings=_settings,
                    parameterHash=_parameterHash, parameters=EffectiveParameters(), initialBalance=_initialBalance, openingOwnNet=_openingNet, sizing=Sizing.ToString(),lots=FixedLots,riskPercent=RiskPercent,totalRiskPercent=TotalRiskPercent,minimumMarginLevel=MinimumMarginLevel,
                    maxPositions=MaxPositions,currencyRiskPercent=CurrencyRiskPercent,maxCurrencyBias=MaxCurrencyBias,reversal=RequireReversal,relativeCosts=RelativeCosts,maxCostPercent=MaxCostPercent,loadParallelism=LoadParallelism,loadTimeout=LoadTimeoutSeconds,drawdownStopPercent=DrawdownStopPercent,decay=Decay.ToString(),dailyAtr=DailyAtrFraction,dailyPrice=DailyPriceReduction,
                    tau=TauDays,maxHoldDays=MaxHoldDays,spreadBps=MaxSpreadBps,slippageBps=SlippageBps,feeReserveBps=FeeReserveBps,minFeeReserve=MinimumFeeReserve,
                    priceBasis="Broker M5 Bid OHLC; quotes received from Symbol.Tick. Not exchange-time/order-book data.",
                    warning="Exploratory forward-test. No calibrated probability. No profitability claim." });
                // Open positions have priority over loading the expanded universe.
                foreach(var p in Positions.Where(p=>Own(p)).ToArray()) QueueSymbol(p.SymbolName,true);
                DiscoverUniverse();
                _armed=AutoArm && !_fatal;
                // Headless: all user choices are startup parameters, no desktop buttons.
                Print("EXTREMELAB 1.2.1 INTEGRATIONSKANDIDAT: Strategie unveraendert. Online standardmaessig AUS; ohne validierten Empfaenger kein Cloud-Live-Nachweis. Erstfehler werden wiederholt protokolliert.");
                Print("Uebernahme: alte Positionen ohne Exit-Metadaten behalten Broker-SL/TP; keine erfundene alte Zeitpflege. Neue Positionen speichern Exit-Regeln im Broker-Kommentar.");
                try {if(DesktopPanel)BuildPanel();}catch(Exception ex){Print("PANEL NICHT VERFUEGBAR: "+ex.Message);_panel=null;}
                Timer.Start(TimeSpan.FromSeconds(1));
                Note("Start: "+StatusText+". Alle Broker-Symbole="+AllBrokerSymbols+". Keine Aktienklassifikation; offene Positionen zuerst.");
                Print("DATENORDNER (relativ zum cBot-Datenordner): "+_folder);
            }
            catch(Exception ex) { RecordFatal("START_FAILURE","OnStart",ex.Message,ex); Stop(); }
        }
        StreamWriter Writer(string name) => new StreamWriter(Path.Combine(_folder,name),false,new UTF8Encoding(false),65536);
        void Log(string kind,object data)
        {
            if(_events==null || _writing)return;
            try
            {
                _writing=true;
                string row=JsonSerializer.Serialize(new {schema=2,seq=++_sequence,utc=Server.Time,receivedUtc=DateTime.UtcNow,run=_run,kind,data},Json);
                PublishOnline(row);
                _events.WriteLine(row);
                if(JournalData)Print("XL2 "+row);
            }
            catch(Exception ex){RecordFatal("EVENT_LOG_WRITE","Log/"+kind,ex.Message,ex);}
            finally{_writing=false;}
        }
        void Note(string text) { _messages.Insert(0,Server.Time.ToString("HH:mm:ss",Inv)+" "+text);if(_messages.Count>200)_messages.RemoveAt(200);Print(text);Log("INFO",new{text}); }
        void DiscoverUniverse()
        {
            foreach(string x in UniverseRules.Names(ExcludedCsv))_excluded.Add(x);
            var names=AllBrokerSymbols?Symbols.ToArray():UniverseRules.Names(SymbolCsv,SymbolName);
            foreach(string name in names.Distinct(StringComparer.Ordinal).OrderBy(x=>x,StringComparer.Ordinal))
                _discoverQueue.Enqueue(name);
            _catalogCount=_discoverQueue.Count;
            Note("UNIVERSUM: "+_catalogCount+" Broker-Namen zur Pruefung; Limit="+(MaximumSymbols==0?"alle":MaximumSymbols.ToString())+". Positionsanzahl="+(MaxPositions==0?"budgetgesteuert":MaxPositions.ToString())+".");
        }
        void DiscoverBatch()
        {
            // Bounded work per timer; position management is called BEFORE this method.
            for(int n=0;n<20 && _discoverQueue.Count>0;n++)
            {
                string name=_discoverQueue.Dequeue();
                if(_excluded.Contains(name)){_discoverySkipped++;Log("UNIVERSE_SKIP",new{name,reason="USER_EXCLUDED"});continue;}
                try
                {
                    if(!Symbols.Contains(name)){Note("NICHT GEFUNDEN: "+name);_discoverySkipped++;continue;}
                    var symbol=Symbols.GetSymbol(name);
                    string mode=symbol.TradingMode.ToString();
                    if(symbol.IsCustom||!symbol.IsTradingEnabled||mode.Contains("Disabled")||mode.Contains("CloseOnly"))
                    {_discoverySkipped++;Log("UNIVERSE_SKIP",new{name,reason="BROKER_NOT_OPENABLE",mode,custom=symbol.IsCustom});continue;}
                    if(MaximumSymbols>0&&_selected.Count>=MaximumSymbols){_discoverySkipped++;Log("UNIVERSE_SKIP",new{name,reason="USER_SYMBOL_LIMIT"});continue;}
                    _selected.Add(name);QueueSymbol(name,false);
                }
                catch(Exception ex){_discoverySkipped++;Log("UNIVERSE_SKIP",new{name,reason="METADATA_ERROR",error=ex.Message});Note("SYMBOL UEBERSPRUNGEN "+name+": "+ex.Message);}
            }
            if(_discoverQueue.Count==0&&!_universeReported)
            {
                _universeReported=true;
                Note("UNIVERSUM ERKANNT: "+_selected.Count+" ausgewaehlt, "+_discoverySkipped+" ausgeschlossen/gesperrt/ueber Limit. Historie wird schrittweise geladen.");
                Log("UNIVERSE_SELECTED",new{all=AllBrokerSymbols,symbols=_selected.OrderBy(x=>x).ToArray()});
                if(_selected.Count==0)Note("Keine neuen Handelssymbole: nur uebernommene Positionen verwalten.");
            }
        }
        void QueueSymbol(string name,bool recovery)
        {
            if(_markets.ContainsKey(name))return;
            if(!Symbols.Contains(name)){Note("Broker-Symbol nicht gefunden: "+name);return;}
            var symbol=Symbols.GetSymbol(name);
            var m=new Market {Symbol=symbol,Engine=new Engine(_settings)};
            _markets.Add(name,m);symbol.Tick+=OnMarketTick;m.Subscribed=true;_loadQueue.Enqueue(name);
            Log("SYMBOL_METADATA",new{name,description=symbol.Description,lotSize=symbol.LotSize,pipSize=symbol.PipSize,tickSize=symbol.TickSize,
                unitsMin=symbol.VolumeInUnitsMin,unitsMax=symbol.VolumeInUnitsMax,unitsStep=symbol.VolumeInUnitsStep,
                commission=symbol.Commission,commissionType=symbol.CommissionType.ToString(),minCommission=symbol.MinCommission,
                tradingMode=symbol.TradingMode.ToString(),quoteAsset=symbol.QuoteAsset.Name,baseAsset=symbol.BaseAsset.Name,recovery});
        }
        void LoadOne()
        {
            if(_markets.Values.Count(x=>x.Lease.Active)>=LoadParallelism)return;
            int scans=_loadQueue.Count;
            while(scans-->0&&_loadQueue.Count>0)
            {
                var name=_loadQueue.Dequeue();if(!_markets.TryGetValue(name,out var m)||m.Initialized||m.Failed||m.Loading)continue;
                if(DateTime.UtcNow<m.RetryLoadAt){_loadQueue.Enqueue(name);continue;}
                if(m.Bars!=null){EnsureHistory(m);return;}
                m.Loading=true;m.LoadStage="GET_BARS";m.Problem="M5-Historie wird angefordert";
                int epoch=m.Lease.Begin(DateTime.UtcNow,LoadTimeoutSeconds);
                Log("LOAD_BEGIN",new{symbol=name,stage=m.LoadStage,generation=epoch});
                try {MarketData.GetBarsAsync(TimeFrame.Minute5,name,bars=>BeginInvokeOnMainThread(()=>
                {
                    if(!_started||!m.Lease.Complete(epoch))return;
                    m.Loading=false;
                    try{m.Bars=bars;EnsureHistory(m);}catch(Exception ex){LoadFailed(m,ex.Message);}
                }));}catch(Exception ex){m.Lease.Complete(epoch);m.Loading=false;LoadFailed(m,ex.Message);}
                return;
            }
        }
        void EnsureHistory(Market m)
        {
            if(m.Loading||m.Initialized||m.Failed)return;
            if(m.Bars==null){EnqueueLoad(m);return;}
            int needed=Math.Max(300,LookbackBars+100);
            if(m.Bars.Count>=needed+1){InitializeMarket(m);return;}
            if(m.LoadAttempts++>=8){LoadFailed(m,"HISTORY_INSUFFICIENT: "+m.Bars.Count+" Bars");return;}
            m.Loading=true;m.LoadStage="MORE_HISTORY";m.Problem="Weitere M5-Kerzen laden";
            int epoch=m.Lease.Begin(DateTime.UtcNow,LoadTimeoutSeconds);
            try{m.Bars.LoadMoreHistoryAsync(args=>BeginInvokeOnMainThread(()=>
            {
                if(!_started||!m.Lease.Complete(epoch))return;
                m.Loading=false;
                if(args.Count==0&&m.Bars.Count<needed+1){LoadFailed(m,"HISTORY_EXHAUSTED: "+m.Bars.Count+" Bars");return;}
                EnqueueLoad(m);
            }));}catch(Exception ex){m.Lease.Complete(epoch);m.Loading=false;LoadFailed(m,ex.Message);}
        }
        void EnqueueLoad(Market m){if(!_loadQueue.Contains(m.Symbol.Name))_loadQueue.Enqueue(m.Symbol.Name);}
        void LoadFailed(Market m,string error)
        {
            m.Loading=false;m.Failed=true;m.LoadStage="FAILED";m.Problem=error;
            Log("LOAD_FAILED",new{symbol=m.Symbol.Name,error,timeouts=m.Lease.Timeouts});
        }
        void CheckLoads()
        {
            foreach(var m in _markets.Values.ToArray())
            {
                if(!m.Lease.Expire(DateTime.UtcNow))continue;
                m.Loading=false;m.LoadStage="TIMEOUT";m.Problem="Historienanfrage ohne Antwort; anderer Markt wird weitergeladen";
                Log("LOAD_TIMEOUT",new{symbol=m.Symbol.Name,timeouts=m.Lease.Timeouts});
                if(m.Lease.Timeouts>=LoadRetries){LoadFailed(m,"HISTORY_TIMEOUT_LIMIT");continue;}
                m.RetryLoadAt=DateTime.UtcNow.AddSeconds(10*m.Lease.Timeouts);EnqueueLoad(m);
            }
        }
        Candle CandleAt(Bars b,int i) => new Candle{Time=b.OpenTimes[i],Open=b.OpenPrices[i],High=b.HighPrices[i],Low=b.LowPrices[i],Close=b.ClosePrices[i]};
        void InitializeMarket(Market m)
        {
            using(var w=new StreamWriter(Path.Combine(_folder,"bars_"+SafeName(m.Symbol.Name)+".csv"),false,new UTF8Encoding(false)))
            {
                w.WriteLine("utc,open,high,low,close,source");
                int start=Math.Max(0,m.Bars.Count-Math.Max(1000,LookbackBars*3));
                for(int i=start;i<m.Bars.Count-1;i++)
                {
                    var b=CandleAt(m.Bars,i);m.Engine.Add(b);RememberCandle(m,b);
                    w.WriteLine(string.Join(",",b.Time.ToString("O",Inv),N(b.Open),N(b.High),N(b.Low),N(b.Close),"broker_bid_M5"));
                }
            }
            m.Initialized=true;m.Feature=m.Engine.Current;m.LastBar=m.Bars.OpenTimes[m.Bars.Count-2];m.Ready=m.Feature!=null;m.Problem=m.Ready?"Bereit; naechsten M5-Schluss abwarten":"Noch kein Signalmodell";
            // Deliberately do not execute historical signals at startup.
            m.NoTradeThrough=m.Feature?.KnownAt??Server.Time;m.LoadStage=m.Ready?"READY":"WARMUP";
            Note(m.Symbol.Name+": "+m.Problem);EmitBars(m,true);
            m.Latest=Snapshot(m,false);StoreDecision(m.Latest);
        }
        void RememberCandle(Market m,Candle b){m.Candles.Enqueue(b);while(m.Candles.Count>80)m.Candles.Dequeue();}
        static string SafeName(string s)=>new string(s.Select(c=>char.IsLetterOrDigit(c)||c=='_'?c:'_').ToArray());
        static string N(double x)=>x.ToString("G17",Inv);
        void OnMarketTick(SymbolTickEventArgs args)
        {
            if(!_started||!_markets.TryGetValue(args.SymbolName,out var m))return;
            m.LastQuote=Server.Time;m.Bid=args.Bid;m.Ask=args.Ask;
            if(RecordTicks&&_ticks!=null&&_tickChars<(long)TickLimitMb*1024*1024)
            {
                try{string row=string.Join(",",++_tickSequence,Server.Time.ToString("O",Inv),Csv(args.SymbolName),N(args.Bid),N(args.Ask));_ticks.WriteLine(row);_tickChars+=row.Length+1;}
                catch(Exception ex){Fail("Quoteprotokoll: "+ex.Message);}
            }
            foreach(var p in Positions.Where(x=>Own(x)&&x.SymbolName==args.SymbolName))SamplePosition(p);
        }
        void EvaluateMarkets()
        {
            // Round-robin; discovery order cannot starve symbols indefinitely.
            var ms=_markets.Values.Where(x=>x.Initialized&&!x.Failed).ToArray();if(ms.Length==0)return;
            for(int n=0;n<Math.Min(32,ms.Length);n++)
            {
                var m=ms[(_evaluationCursor+n)%ms.Length];
                try
                {
                    int last=m.Bars.Count-2;bool changed=last>=0&&m.Bars.OpenTimes[last]>m.LastBar;
                    if(changed)
                    {
                        int first=last;while(first>0&&m.Bars.OpenTimes[first-1]>m.LastBar)first--;
                        for(int i=first;i<=last;i++){var b=CandleAt(m.Bars,i);m.Engine.Add(b);RememberCandle(m,b);Log("BAR",new{symbol=m.Symbol.Name,candle=b,source="broker_bid_M5"});}
                        m.LastBar=m.Bars.OpenTimes[last];m.Feature=m.Engine.Current;m.Ready=m.Feature!=null;m.LoadStage=m.Ready?"READY":"WARMUP";
                        if((Server.Time-m.LastBarCheckpoint).TotalMinutes>=CandleCheckpointMinutes)EmitBars(m,true);
                    }
                    bool retry=!changed&&m.Feature!=null&&m.Feature.KnownAt>m.NoTradeThrough&&m.Feature.KnownAt>m.LastAttempt
                        &&(Server.Time-m.Feature.KnownAt).TotalSeconds<=MaxSignalAge&&(DateTime.UtcNow-m.LastCheckWall).TotalSeconds>=3
                        &&m.Latest!=null&&m.Latest.Checks.Any(x=>!x.Passed&&(x.Code=="QUOTE"||x.Code=="PLAN"||x.Code=="HISTORY_SYNC"));
                    if(!changed&&!retry)continue;
                    m.LastCheckWall=DateTime.UtcNow;m.Latest=Snapshot(m,true);StoreDecision(m.Latest);
                    if(m.Latest.Status=="BEREIT"&&_armed&&!_fatal&&!_halting)Place(m,m.Latest);
                }
                catch(Exception ex){m.Failed=true;m.Problem="Symbolfehler: "+ex.Message;Log("SYMBOL_ERROR",new{symbol=m.Symbol.Name,error=ex.Message});}
            }
            _evaluationCursor=(_evaluationCursor+32)%ms.Length;
        }
        void EmitBars(Market m,bool checkpoint)
        {
            m.LastBarCheckpoint=Server.Time;var bars=m.Candles.ToArray();
            // Small chunks avoid extremely long journal lines. No duplicated full history per decision.
            for(int i=0;i<bars.Length;i+=20)Log("BARS",new{symbol=m.Symbol.Name,checkpoint,part=i/20,totalParts=(bars.Length+19)/20,candles=bars.Skip(i).Take(20).ToArray()});
        }
        void Fail(string reason){RecordFatal("ENGINE_FAILURE","Fail",reason);}
        double ConvertQuote(Symbol s,double amount)
        {
            if(s.QuoteAsset.Name==Account.Asset.Name)return amount;
            string key=s.QuoteAsset.Name;
            if(!_conversion.TryGetValue(key,out var fx)||(Server.Time-fx.At).TotalSeconds>2)
            {
                // Scale the request before converting: 1 JPY must not round to 0 CHF.
                double factor=AssetConverter.Convert(100000.0,s.QuoteAsset,Account.Asset)/100000.0;
                if(!MathEx.Finite(factor)||factor<=0)throw new InvalidOperationException("Waehrungsumrechnung nicht bereit: "+key+"/"+Account.Asset.Name);
                fx=(Server.Time,factor);_conversion[key]=fx;
            }
            return amount*fx.Value;
        }
        double Gross(Symbol s,double units,double distance)=>Math.Abs(ConvertQuote(s,units*distance));
        double MinDistance(Symbol s,bool stop,double refPrice)
        {
            double d=stop?s.MinStopLossDistance:s.MinTakeProfitDistance;
            return s.MinDistanceType==SymbolMinDistanceType.Pips ? d*s.PipSize : refPrice*d/100;
        }
        Plan MakePlan(Market m,int side,double bid,double ask)
        {
            var p=new Plan{Side=side,RequestedLots=FixedLots,CostFraction=double.NaN,Risk=double.NaN,NetRewardEstimate=double.NaN,MarginAfter=double.NaN};var f=m.Feature;var s=m.Symbol;
            void Block(string text){p.Blocks.Add(text);p.Block=string.Join("; ",p.Blocks);p.Valid=false;}
            if(f==null){Block("MODEL_NOT_READY");return p;}
            try
            {
                double entry=side==1?ask:bid,spread=ask-bid,mid=(bid+ask)/2;
                p.Entry=entry;p.Stop=RoundPrice(s,entry-side*f.StopDistance);p.Target=RoundPrice(s,side==1?f.BuyTarget:f.SellTarget);
                if(!new[]{entry,bid,ask}.All(MathEx.Finite)||bid<=0||ask<=0||spread<0){Block("INVALID_QUOTE");return p;}
                double slDistance=side*(entry-p.Stop),goal=side*(p.Target-entry),uv=Gross(s,1,1);
                if(!MathEx.Finite(uv)||uv<=0){Block("CONVERSION_NOT_READY");return p;}
                double slip=Math.Max(s.TickSize,entry*SlippageBps/10000);p.SlipPips=slip/s.PipSize;
                if(slDistance<=spread+MinDistance(s,true,entry)+s.TickSize)Block("STOP_TOO_CLOSE_FOR_SPREAD_OR_BROKER");
                if(goal<=MinDistance(s,false,entry)+s.TickSize)Block("TARGET_WRONG_SIDE_OR_TOO_CLOSE");
                if(p.Blocks.Count>0)return p;
                double equity=Account.Equity,margin=Account.Margin,free=Account.FreeMargin;
                double riskUsed=AccountStopRisk();double budget=Math.Min(equity*RiskPercent/100,BudgetMath.Remaining(equity,TotalRiskPercent,riskUsed));
                budget=Math.Min(budget,CurrencyBudget(m,side,equity));p.RemainingBudget=budget;
                double request=s.QuantityToVolumeInUnits(FixedLots);
                if(Sizing==LabSizing.RiskBudget)request=Math.Max(0,(budget-MinimumFeeReserve)/(uv*(slDistance+2*slip+entry*FeeReserveBps/10000)));
                p.RequestedUnits=request;
                double Fee(double units)=>Math.Max(MinimumFeeReserve,uv*units*entry*FeeReserveBps/10000);
                double Risk(double units)=>uv*units*(slDistance+2*slip)+Fee(units);
                bool Fits(double units)
                {
                    double extra=s.GetEstimatedMargin(side>0?TradeType.Buy:TradeType.Sell,units),fees=Fee(units),cost=uv*units*(spread+slip)+fees;
                    return MathEx.Finite(extra)&&extra>=0&&Risk(units)<=budget+1e-8&&extra+cost<=free
                        &&MathEx.ProjectedMarginLevel(equity,margin,extra,cost)>=MinimumMarginLevel;
                }
                double units=s.NormalizeVolumeInUnits(request,RoundingMode.Down);
                if(Sizing!=LabSizing.FixedLots)
                {
                    units=BudgetMath.Fit(request,s.VolumeInUnitsMin,s.VolumeInUnitsMax,s.VolumeInUnitsStep,Fits);
                    units=s.NormalizeVolumeInUnits(units,RoundingMode.Down);
                    p.SizeReason=units+1e-7<request?"Budget/Brokerraster: Wunschgroesse reduziert":"Wunschgroesse innerhalb Limits";
                }
                p.Units=units;p.Lots=s.VolumeInUnitsToQuantity(units);
                if(Sizing==LabSizing.FixedLots&&!MathEx.ExactVolume(request,units,s.VolumeInUnitsMin,s.VolumeInUnitsMax))Block("FIXED_VOLUME_NOT_LEGAL");
                if(units<s.VolumeInUnitsMin||units>s.VolumeInUnitsMax||units<=0){Block("NO_VOLUME_FITS_BUDGET");return p;}
                p.Notional=uv*units*entry;p.FeeReserve=Fee(units);p.Risk=Risk(units);
                p.NetRewardEstimate=uv*units*(goal-2*slip)-p.FeeReserve;
                p.CostFraction=(uv*units*(spread+2*slip)+p.FeeReserve)/(uv*units*(goal+spread));
                p.MarginEstimate=s.GetEstimatedMargin(side>0?TradeType.Buy:TradeType.Sell,units);
                p.MarginAfter=MathEx.ProjectedMarginLevel(equity,margin,p.MarginEstimate,uv*units*(spread+slip)+p.FeeReserve);
                if(p.Risk>budget+1e-8)Block("TRADE_PORTFOLIO_OR_CURRENCY_BUDGET");
                if(!MathEx.Finite(p.MarginEstimate)||p.MarginEstimate<0||p.MarginAfter<MinimumMarginLevel||p.MarginEstimate+uv*units*(spread+slip)+p.FeeReserve>free)Block("MARGIN_BUDGET");
                if(p.NetRewardEstimate<=0)Block("NET_TARGET_NOT_POSITIVE");
                if(RelativeCosts&&p.CostFraction>MaxCostPercent/100)Block("COST_SHARE_TOO_HIGH");
                if(!RelativeCosts&&spread/mid*10000>MaxSpreadBps)Block("SPREAD_BPS_LIMIT");
                if(!new[]{p.Risk,p.NetRewardEstimate,p.Notional,p.CostFraction}.All(MathEx.Finite))Block("NON_FINITE_CALCULATION");
                p.Valid=p.Blocks.Count==0;return p;
            }
            catch(Exception ex){Block("BROKER_DATA: "+ex.Message);return p;}
        }
        double PositionRisk(Position pos)
        {
            if(!pos.StopLoss.HasValue)return double.PositiveInfinity;
            var s=Symbols.GetSymbol(pos.SymbolName);int side=pos.TradeType==TradeType.Buy?1:-1;double mark=side>0?s.Bid:s.Ask;
            return Gross(s,pos.VolumeInUnits,Math.Max(0,side*(mark-pos.StopLoss.Value))+Math.Max(s.TickSize,mark*SlippageBps/10000))
                +Math.Max(MinimumFeeReserve,Gross(s,pos.VolumeInUnits,mark)*FeeReserveBps/10000);
        }
        double CurrencyBudget(Market m,int side,double equity)
        {
            if(CurrencyRiskPercent<=0||!ExecutionRules.IsFiat(m.Symbol.BaseAsset.Name)||!ExecutionRules.IsFiat(m.Symbol.QuoteAsset.Name))return double.PositiveInfinity;
            double remaining=equity*CurrencyRiskPercent/100;
            foreach(var currency in new[]{m.Symbol.BaseAsset.Name,m.Symbol.QuoteAsset.Name})
            {
                int wanted=currency==m.Symbol.BaseAsset.Name?side:-side;double used=0;
                foreach(var pos in Positions)
                {
                    var s=Symbols.GetSymbol(pos.SymbolName);if(!ExecutionRules.IsFiat(s.BaseAsset.Name)||!ExecutionRules.IsFiat(s.QuoteAsset.Name))continue;
                    int direction=pos.TradeType==TradeType.Buy?1:-1;
                    if((s.BaseAsset.Name==currency&&direction==wanted)||(s.QuoteAsset.Name==currency&&-direction==wanted))used+=PositionRisk(pos);
                }
                remaining=Math.Min(remaining,BudgetMath.Remaining(equity,CurrencyRiskPercent,used));
            }
            return remaining;
        }
        double RoundPrice(Symbol s,double price)=>Math.Round(Math.Round(price/s.TickSize,MidpointRounding.AwayFromZero)*s.TickSize,s.Digits);
        double AccountStopRisk()=>Positions.Sum(p=>PositionRisk(p));
        Decision Snapshot(Market m,bool final)
        {
            var f=m.Feature;double bid=m.Bid>0?m.Bid:m.Symbol.Bid,ask=m.Ask>0?m.Ask:m.Symbol.Ask;var now=Server.Time;
            var d=new Decision {Id=_run+"-d"+(++_decisionSequence),Symbol=m.Symbol.Name,At=now,QuoteAt=m.LastQuote,Bid=bid,Ask=ask,
                Currency=Account.Asset.Name,Feature=f,Candles=null,Armed=_armed,ParameterHash=_parameterHash,
                SignalId=f==null?null:m.Symbol.Name+"|"+f.KnownAt.ToString("O",Inv),StartupSnapshot=f==null||f.KnownAt<=m.NoTradeThrough,
                QuoteAgeSeconds=m.LastQuote==default?(double?)null:(now-m.LastQuote).TotalSeconds,
                SignalAgeSeconds=f==null?0:(now-f.KnownAt).TotalSeconds,
                Long=MakePlan(m,1,bid,ask),Short=MakePlan(m,-1,bid,ask),Status="WARTEN",Reason=m.Problem};
            void Check(string code,bool ok,string detail,double? value=null,double? limit=null)
                =>d.Checks.Add(new AuditCheck{Code=code,Passed=ok,Detail=detail,Value=value,Limit=limit});
            Check("DEMO",!Account.IsLive,"Nur Demo");Check("ENGINE",!_fatal&&!_halting,EngineDiagnostic());
            Check("MODEL",f!=null&&m.Ready&&!m.Failed,m.Problem);
            Check("SELECTED",_selected.Contains(m.Symbol.Name),"Nur ausgewaehlte Symbole neu handeln");
            Check("MARKET",m.Symbol.IsTradingEnabled&&m.Symbol.MarketHours.IsOpened(),"Markt geschlossen / Handel gesperrt");
            Check("QUOTE",d.QuoteAgeSeconds.HasValue&&d.QuoteAgeSeconds>=0&&d.QuoteAgeSeconds<=MaxQuoteAge,"Quote fehlt/veraltet",d.QuoteAgeSeconds,MaxQuoteAge);
            Check("HISTORY_SYNC",_historyReady&&_pendingHistory.Count==0,"Brokerhistorie / Positionsabgleich offen",_pendingHistory.Count,0);
            Check("PROTECTION",_unprotected.Count==0,"Altposition ohne SL/TP",_unprotected.Count,0);
            var own=Positions.FirstOrDefault(p=>Own(p)&&p.SymbolName==m.Symbol.Name);
            Check("SYMBOL_POSITION",!Positions.Any(p=>p.SymbolName==m.Symbol.Name),"Auf diesem Symbol besteht bereits eine Position");
            Check("PENDING_BUDGET",!PendingOrders.Any(),"Pending-Order-Budget nicht implementiert; neue Orders warten");
            Check("POSITION_CAP",MaxPositions==0||Positions.Count(p=>Own(p))<MaxPositions,"Optionale Positionsobergrenze",Positions.Count(p=>Own(p)),MaxPositions);
            if(f!=null)
            {
                Check("FRESH_SIGNAL",!d.StartupSnapshot&&d.SignalAgeSeconds>=0&&d.SignalAgeSeconds<=MaxSignalAge,"Neuen abgeschlossenen M5-Schluss abwarten",d.SignalAgeSeconds,MaxSignalAge);
                Check("ZONE",f.Side!=0,"Schlusskurs ausserhalb der Einstiegszonen",f.Z, null);
                Check("TREND",f.Side==0||f.TrendOk,"Gegenbewegung noch zu stark",f.Drift,TrendGate);
                var c=m.Candles.LastOrDefault();bool reversal=!RequireReversal||f.Side==0||(c!=null&&ExecutionRules.Reversal(f.Side,c.Open,c.Close));
                Check("REVERSAL",reversal,"Extremzone, Umkehrkerze noch nicht bestaetigt");
                Check("DIRECTION",f.Side>=0||AllowShort,"Short deaktiviert");
                string mode=m.Symbol.TradingMode.ToString();
                Check("BROKER_DIRECTION",!mode.Contains("CloseOnly")&&!mode.Contains("Disabled")&&!(f.Side>0&&mode.Contains("ShortOnly"))&&!(f.Side<0&&mode.Contains("LongOnly")),"Broker-Handelsmodus "+mode);
                Check("COOLDOWN",f.KnownAt>m.LastExit.AddMinutes(5),"Cooldown nach Ausstieg");
                Check("UNIQUE_SIGNAL",m.LastAttempt<f.KnownAt,"Signal bereits verarbeitet");
                if(MaxCurrencyBias>0&&f.Side!=0&&ExecutionRules.IsFiat(m.Symbol.BaseAsset.Name)&&ExecutionRules.IsFiat(m.Symbol.QuoteAsset.Name))
                {
                    foreach(var currency in new[]{m.Symbol.BaseAsset.Name,m.Symbol.QuoteAsset.Name})
                    {
                        int bias=currency==m.Symbol.BaseAsset.Name?f.Side:-f.Side;
                        int same=Positions.Count(pos=>{var ps=Symbols.GetSymbol(pos.SymbolName);int pd=pos.TradeType==TradeType.Buy?1:-1;
                            return ExecutionRules.IsFiat(ps.BaseAsset.Name)&&ExecutionRules.IsFiat(ps.QuoteAsset.Name)&&((ps.BaseAsset.Name==currency&&pd==bias)||(ps.QuoteAsset.Name==currency&&-pd==bias));});
                        Check("FX_COUNT_"+currency,same<MaxCurrencyBias,"Optionale Waehrungs-Anzahlgrenze",same,MaxCurrencyBias);
                    }
                }
                var plan=f.Side<0?d.Short:d.Long;Check("PLAN",f.Side==0||plan.Valid,plan.Block,plan.Risk,plan.RemainingBudget);
            }
            Check("ARMED",_armed,"Neue Einstiege pausiert");
            if(own!=null){d.Status="POSITION OFFEN";d.Reason=_managed.TryGetValue(own.Id,out var st)&&st.ProtectionOnly?"Altposition: Broker-Schutz unveraendert, Zeitregel unbekannt":"Broker-SL/TP aktiv; Exit-Regel gespeichert";}
            else if(d.Checks.All(x=>x.Passed)){d.Status="BEREIT";d.Reason="Extremzone und alle Systembedingungen erfuellt";}
            else {var first=d.Checks.First(x=>!x.Passed);d.Reason=first.Code+": "+first.Detail;}
            return d;
        }
        void StoreDecision(Decision d)
        {
            try
            {
                _decisions.WriteLine(JsonSerializer.Serialize(d,Json));_snapshots.Add(d);if(_snapshots.Count>200)_snapshots.RemoveAt(0);
                Log("DECISION",d);
                if(d.Feature!=null)Print("ENTSCHEIDUNG {0} | {1} | {2} | Z={3:0.000} ATR={4:G7} Richtung={5:0.000}",d.Symbol,d.Status,d.Reason,d.Feature.Z,d.Feature.Atr,d.Feature.Drift);
            }catch(Exception ex){Fail("Entscheidungsprotokoll: "+ex.Message);}
        }
        void Place(Market m,Decision d)
        {
            if(Account.IsLive||!_armed||_fatal||_halting)return;
            // Rebuild once immediately before order submission: no stale account budget.
            d=Snapshot(m,true); if(d.Status!="BEREIT") {StoreDecision(d);return;}
            while(_orderTimes.Count>0&&(DateTime.UtcNow-_orderTimes.Peek()).TotalSeconds>=60)_orderTimes.Dequeue();
            if(_orderTimes.Count>=200){Log("ORDER_THROTTLED",new{symbol=m.Symbol.Name,reason="API_RATE_GUARD",decisionId=d.Id});return;}
            _orderTimes.Enqueue(DateTime.UtcNow);
            m.LastAttempt=d.Feature.KnownAt;
            var p=d.Feature.Side>0?d.Long:d.Short;var s=m.Symbol;int side=p.Side;
            StoreDecision(d);Log("ORDER_REQUEST",new{decisionId=d.Id,plan=p,lotMode=Sizing.ToString()});Flush();
            if(_fatal)return;
            var watch=Stopwatch.StartNew();
            // Server protection is part of the entry order; never knowingly open naked.
            double reduction=Decay==LabDecay.PricePerDay?DailyPriceReduction:DailyAtrFraction*d.Feature.Atr;
            double previewMinimum=p.FeeReserve/Math.Max(1e-12,Gross(s,p.Units,1))+2*p.SlipPips*s.PipSize+s.TickSize;
            string comment=ExitMetadata.Encode(new ExitMetadata {Target=p.Target,Minimum=previewMinimum,Reduction=reduction,
                Exponential=Decay==LabDecay.Exponential,Tau=TauDays,HoldDays=MaxHoldDays,StopDistance=Math.Abs(p.Entry-p.Stop),Units=p.Units});
            TradeResult result;
            _submitting=true;
            try {result=ExecuteMarketRangeOrder(side>0?TradeType.Buy:TradeType.Sell,s.Name,p.Units,p.SlipPips,p.Entry,Label,
                Math.Abs(p.Entry-p.Stop)/s.PipSize,Math.Abs(p.Target-p.Entry)/s.PipSize,comment);}
            finally {_submitting=false;}
            watch.Stop();
            if(!result.IsSuccessful){Log("ORDER_REJECTED",new{decisionId=d.Id,error=result.Error.ToString(),elapsedMs=watch.ElapsedMilliseconds});Note(s.Name+": Order abgelehnt: "+result.Error);return;}
            var pos=result.Position;
            _initialVolumes[pos.Id]=pos.VolumeInUnits;SamplePosition(pos);
            double minDistance=previewMinimum;
            double initial=side*(p.Target-pos.EntryPrice);
            if(initial<=minDistance || !pos.StopLoss.HasValue || !pos.TakeProfit.HasValue || Math.Abs(pos.VolumeInUnits-p.Units)>1e-6)
            {
                Log("POST_FILL_INVALID",new{positionId=pos.Id,decisionId=d.Id,initial,expectedUnits=p.Units,actualUnits=pos.VolumeInUnits});
                _managed[pos.Id]=new ManagedTrade {PositionId=pos.Id,Symbol=s.Name,Entry=pos.EntryPrice,Side=side,Volume=pos.VolumeInUnits,EntryTime=pos.EntryTime,MaxHoldDays=MaxHoldDays,EntryDecision=d};
                _armed=false;RequestClose(pos,"POST_FILL_INVALID");SaveState();return;
            }
            _managed[pos.Id]=new ManagedTrade{PositionId=pos.Id,Symbol=s.Name,Side=side,Entry=pos.EntryPrice,Volume=pos.VolumeInUnits,EntryTime=pos.EntryTime,
                InitialDistance=initial,MinimumDistance=minDistance,Target=p.Target,OriginalStop=pos.StopLoss.Value,DailyReduction=reduction,
                Exponential=Decay==LabDecay.Exponential,TauDays=TauDays,MaxHoldDays=MaxHoldDays,UpdatedDays=-1,EntryDecision=d};
            Log("ORDER_FILLED",new{decisionId=d.Id,positionId=pos.Id,symbol=s.Name,side,units=pos.VolumeInUnits,entry=pos.EntryPrice,
                requested=p.Entry,signedAdverseSlippage=side*(pos.EntryPrice-p.Entry),elapsedMs=watch.ElapsedMilliseconds,stop=pos.StopLoss,takeProfit=pos.TakeProfit});
            if(pos.Comment!=comment)Note("WARNUNG: Broker-Kommentar nicht identisch. Nach Neustart nur Schutzuebernahme moeglich: "+pos.Id);
            m.Latest=d;
            SaveState();
            // A redundant/rejected TP tweak must not churn a protected position.
            if(ExecutionRules.NeedsTargetEdit(pos.TakeProfit,p.Target,s.TickSize))
            {
                var amended=ModifyPosition(pos,pos.StopLoss,p.Target,ProtectionType.Absolute);
                if(!amended.IsSuccessful)
                {
                    Log("INITIAL_TP_REJECTED",new{positionId=pos.Id,error=amended.Error.ToString(),keptStop=pos.StopLoss,keptTarget=pos.TakeProfit});
                    if(!ExecutionRules.ProtectionPresent(pos.StopLoss,pos.TakeProfit))
                    {_armed=false;RequestClose(pos,"INITIAL_PROTECTION_MISSING");}
                    else
                    {_managed[pos.Id].RetryAfter=Server.Time.AddSeconds(30);Note(s.Name+": TP-Anpassung abgelehnt, aber Broker-SL/TP vorhanden. Position bleibt offen; Wiederholung spaeter.");}
                }
            }
            else Log("INITIAL_TP_ALREADY_SET",new{positionId=pos.Id,target=pos.TakeProfit});
            try {if(AccountStopRisk()>Account.Equity*TotalRiskPercent/100 || (Account.MarginLevel??double.PositiveInfinity)<MinimumMarginLevel)
                {_armed=false;RequestClose(pos,"POST_FILL_ACCOUNT_LIMIT");}}
            catch(Exception ex){_armed=false;Note("Nach Fill Umrechnung unklar: "+ex.Message+". SL/TP bleiben gesetzt; neue Orders pausiert.");}
            Note(s.Name+": "+(side>0?"LONG":"SHORT")+" "+p.Lots.ToString("0.###",Inv)+" Lots ausgefuehrt. ID "+pos.Id);
        }
        void ManagePositions()
        {
            foreach(var p in Positions.Where(p=>Own(p)).ToArray())
            {
                if(!_managed.TryGetValue(p.Id,out var st)) {
                    if(_stateWarnings.Add(p.Id))Fail("Nicht zugeordnete Bot-Position: "+p.Id+". Moegliche zweite Instanz; Broker-Schutz unveraendert");
                    continue;
                }
                if(Math.Abs(p.VolumeInUnits-st.Volume)>1e-6)
                { st.Volume=p.VolumeInUnits;st.ProtectionOnly=true;Log("POSITION_SIZE_CHANGED",new{positionId=p.Id,volume=p.VolumeInUnits,mode="BROKER_PROTECTION_ONLY"});SaveState(); }
                if(st.ProtectionOnly)
                {
                    // No lost historical exit schedule is invented. No TP/SL edit or re-entry.
                    if(p.StopLoss.HasValue&&p.TakeProfit.HasValue)_unprotected.Remove(p.Id);
                    else if(_unprotected.Add(p.Id))Note("UEBERNAHME SCHUTZ FEHLT: "+p.Id+"; bitte SL/TP manuell pruefen. Neue Orders blockiert.");
                    continue;
                }
                if(Server.Time<st.RetryAfter)continue;
                if(!p.StopLoss.HasValue){_armed=false;RequestClose(p,"STOP_MISSING");continue;}
                if(st.OriginalStop>0 && st.Side*(p.StopLoss.Value-st.OriginalStop)<-Symbols.GetSymbol(p.SymbolName).TickSize)
                {_armed=false;RequestClose(p,"STOP_WIDENED");continue;}
                if((Server.Time-p.EntryTime).TotalDays>=st.MaxHoldDays){RequestClose(p,"TIME_LIMIT");continue;}
                if(st.InitialDistance<=0||st.MinimumDistance>st.InitialDistance){RequestClose(p,"INVALID_RECOVERY");continue;}
                int days=Math.Max(0,(int)(Server.Time-p.EntryTime).TotalDays);
                if(days<=st.UpdatedDays && p.TakeProfit.HasValue)continue;
                var s=Symbols.GetSymbol(p.SymbolName);
                if(!s.MarketHours.IsOpened())continue;
                double dist=MathEx.TargetDistance(st.InitialDistance,st.MinimumDistance,days,st.DailyReduction,st.Exponential,st.TauDays);
                double target=RoundPrice(s,st.Entry+st.Side*dist);
                target=MathEx.InwardTarget(st.Target,target,st.Side);
                // Respect a manually tightened TP; never move it back outwards.
                if(p.TakeProfit.HasValue)target=MathEx.InwardTarget(p.TakeProfit.Value,target,st.Side);
                double quote=st.Side>0?s.Bid:s.Ask;
                if(st.Side*(quote-target)>=0){RequestClose(p,"DECAY_TARGET_MARKET");continue;}
                if(st.Side*(target-quote)<MinDistance(s,false,quote)+s.TickSize){st.RetryAfter=Server.Time.AddSeconds(10);continue;}
                if(p.TakeProfit.HasValue&&Math.Abs(target-p.TakeProfit.Value)<s.TickSize/2){st.UpdatedDays=days;SaveState();continue;}
                var result=ModifyPosition(p,p.StopLoss,target,ProtectionType.Absolute);
                if(result.IsSuccessful){st.Target=target;st.UpdatedDays=days;Log("TARGET_UPDATED",new{positionId=p.Id,target,days});SaveState();}
                else {st.RetryAfter=Server.Time.AddSeconds(30);Log("TARGET_UPDATE_REJECTED",new{positionId=p.Id,target,error=result.Error.ToString()});}
            }
        }
        void RequestClose(Position p,string reason)
        {
            if(Account.IsLive||!Own(p))return;
            if(_managed.TryGetValue(p.Id,out var st) && Server.Time<st.RetryAfter)return;
            if(st!=null)st.RetryAfter=Server.Time.AddSeconds(5);
            _exitReasons[p.Id]=reason;Log("CLOSE_REQUEST",new{positionId=p.Id,symbol=p.SymbolName,reason,entry=p.EntryPrice,stop=p.StopLoss,target=p.TakeProfit,net=p.NetProfit});
            Print("AUSSTIEG ANGEFORDERT | {0} #{1} | Grund={2} | Netto {3} {4}",p.SymbolName,p.Id,reason,p.NetProfit.ToString("0.00",Inv),Account.Asset.Name);
            var result=ClosePosition(p);
            if(!result.IsSuccessful){_exitReasons.Remove(p.Id);Log("CLOSE_REJECTED",new{positionId=p.Id,reason,error=result.Error.ToString()});}
        }
        void OnPositionClosed(PositionClosedEventArgs args)
        {
            var p=args.Position;if(!Own(p))return;SamplePosition(p);
            string why=_exitReasons.TryGetValue(p.Id,out var requested)?requested:args.Reason.ToString();
            _brokerCloseReasons[p.Id]=why;_exitReasons.Remove(p.Id);
            // Event only supplies the cause. Money is reconciled from History, once per closing deal.
            Log("CLOSE_EVENT",new{positionId=p.Id,symbol=p.SymbolName,reason=why,eventNet=p.NetProfit,accounting="pending_broker_history"});
            if(_markets.TryGetValue(p.SymbolName,out var m))m.LastExit=Server.Time;
            _unprotected.Remove(p.Id);_lastReconcile=default;
        }
        DateTime _startTime;
        object EffectiveParameters() => GetType().GetProperties()
            .Where(p=>p.GetCustomAttributes(typeof(ParameterAttribute),true).Length>0 && TelemetryConfiguration.IsTradingParameter(p.Name))
            .OrderBy(p=>p.Name,StringComparer.Ordinal)
            .ToDictionary(p=>p.Name,p=>p.GetValue(this) is IFormattable f?f.ToString(null,Inv):p.GetValue(this)?.ToString(),StringComparer.Ordinal);
        string ParameterHash()
        {
            var raw=JsonSerializer.Serialize(EffectiveParameters(),Json);
            using(var h=System.Security.Cryptography.SHA256.Create())return Convert.ToHexString(h.ComputeHash(Encoding.UTF8.GetBytes(raw))).Substring(0,16);
        }
        DealRecord Deal(HistoricalTrade h)=>new DealRecord {Key=h.ClosingDealId+":"+h.PositionId+":"+h.EntryTime.Ticks,
            PositionId=h.PositionId,Symbol=h.SymbolName,CloseTime=h.ClosingTime,Volume=h.VolumeInUnits,Net=h.NetProfit,Own=RecoveryRules.OwnLabel(h.Label,AdoptLegacy)};
        void InitializeLedger()
        {
            _startTime=Server.Time;
            var initial=History.Select(Deal).ToArray();
            _ledger.Begin(_startTime,_openingNet,Positions.Where(x=>!Own(x)).Sum(x=>x.NetProfit),initial);
            foreach(var p in Positions.Where(Own)){_initialVolumes[p.Id]=p.VolumeInUnits;SamplePosition(p);}
            _historyReady=true;
        }
        void SamplePosition(Position p)
        {
            if(!_excursions.TryGetValue(p.Id,out var x))_excursions[p.Id]=x=new Excursion {PositionId=p.Id,SinceAdoption=p.EntryTime<_startTime};
            x.Add(Server.Time,p.NetProfit);
        }
        void ReconcileHistory()
        {
            try
            {
                var hs=History.ToArray();
                foreach(var h in hs)
                {
                    var row=Deal(h);bool changed=_ledger.Upsert(row);
                    if(!changed||!row.Own||row.CloseTime<_startTime)continue;
                    if(_markets.TryGetValue(h.SymbolName,out var closedMarket)&&h.ClosingTime>closedMarket.LastExit)closedMarket.LastExit=h.ClosingTime;
                    string why=_brokerCloseReasons.TryGetValue(h.PositionId,out var w)?w:"HISTORY_RECOVERED_CAUSE_UNKNOWN";
                    Log("DEAL_RECONCILED",new{key=row.Key,positionId=h.PositionId,symbol=h.SymbolName,side=h.TradeType.ToString(),
                        brokerCloseUtc=h.ClosingTime,entryUtc=h.EntryTime,entry=h.EntryPrice,close=h.ClosingPrice,volume=h.VolumeInUnits,
                        net=h.NetProfit,gross=h.GrossProfit,commission=h.Commissions,swap=h.Swap,reason=why,carryIn=h.EntryTime<_startTime});
                    _trades.WriteLine(string.Join(",",Server.Time.ToString("O",Inv),h.PositionId,Csv(h.SymbolName),h.TradeType,N(h.VolumeInUnits),N(h.EntryPrice),N(h.ClosingPrice),h.ClosingTime.ToString("O",Inv),N(h.NetProfit),N(h.GrossProfit),N(h.Commissions),N(h.Swap),Csv(why),h.EntryTime<_startTime));
                }
                foreach(var entry in _initialVolumes.ToArray())
                {
                    double open=Positions.Where(x=>x.Id==entry.Key).Sum(x=>x.VolumeInUnits);
                    double accounted=open+_ledger.ClosedVolume(entry.Key);
                    bool match=Math.Abs(accounted-entry.Value)<=Math.Max(1e-6,entry.Value*1e-9);
                    if(!match){if(!_pendingHistory.ContainsKey(entry.Key))_pendingHistory[entry.Key]=DateTime.UtcNow;}
                    else
                    {
                        _pendingHistory.Remove(entry.Key);
                        if(open==0&&_finishedPositions.Add(entry.Key))
                        {
                            _excursions.TryGetValue(entry.Key,out var ex);
                            var deals=_ledger.Session.Where(x=>x.PositionId==entry.Key).ToArray();
                            Log("POSITION_FINISHED",new{positionId=entry.Key,symbol=deals.FirstOrDefault()?.Symbol,net=deals.Sum(x=>x.Net),excursion=ex,source="broker_history"});
                            _managed.Remove(entry.Key);_unprotected.Remove(entry.Key);SaveState();
                        }
                    }
                }
                var closed=_ledger.Session.Where(x=>x.Own).GroupBy(x=>x.PositionId).Where(g=>!Positions.Any(p=>p.Id==g.Key)&&!_pendingHistory.ContainsKey(g.Key)).ToArray();
                _realized=_ledger.Realized(true);_closed=closed.Length;_wins=closed.Count(g=>g.Sum(x=>x.Net)>0);_losses=closed.Count(g=>g.Sum(x=>x.Net)<0);
                _historyAllOwnNet=_ledger.Current.Where(x=>x.Own).Sum(x=>x.Net);
                _historyReady=true;_historyScanFailures=0;
            }
            catch(Exception ex){_historyReady=false;_historyScanFailures++;Log("HISTORY_SYNC_ERROR",new{error=ex.Message,attempt=_historyScanFailures});}
        }
        double BotOpenNet()=>Positions.Where(p=>Own(p)).Sum(p=>p.NetProfit);
        double BotPnl()=>_ledger.SessionPnl(BotOpenNet(),true);
        void UpdateMetrics(bool write)
        {
            // Single accounting frame: text, panel and structured event use the SAME numbers.
            double eq=Account.Equity,open=BotOpenNet(),bot=_ledger.SessionPnl(open,true);
            _accountDelta=eq-_initialEquity;_otherDelta=_ledger.SessionPnl(Positions.Where(x=>!Own(x)).Sum(x=>x.NetProfit),false);
            _unexplained=DealLedger.Unexplained(_accountDelta,bot,_otherDelta);
            _accountCheck=!_historyReady||_pendingHistory.Count>0?"HISTORY_PENDING":Math.Abs(_unexplained)>Math.Max(2,eq*0.00002)?"RESIDUAL_UNEXPLAINED":"WITHIN_TOLERANCE";
            // Account equity is broker-provided; this stop does not depend on a potentially incomplete bot ledger.
            _peak=Math.Max(_peak,eq);double dd=_peak>0?100*(_peak-eq)/_peak:100;
            _maxDrawdown=Math.Max(_maxDrawdown,dd);_maxDrawdownMoney=Math.Max(_maxDrawdownMoney,_peak-eq);
            if(dd>=DrawdownStopPercent&&!_halting){_halting=true;_armed=false;Log("DRAWDOWN_HALT",new{dd,equity=eq,highWater=_peak,reference=EquityReference});}
            if(write)_equity.WriteLine(string.Join(",",Server.Time.ToString("O",Inv),N(eq),N(bot),N(_initialEquity+bot),N(_realized),N(open),N(Account.Margin),N(Account.FreeMargin),N(Account.MarginLevel??double.PositiveInfinity),N(dd),Positions.Count(Own)));
        }
        protected override void OnTimer()
        {
            if(!_started)return;
            try
            {
                if(Account.IsLive){_armed=false;Fail("Konto ist live");Stop();return;}
                if((Server.Time-_lastReconcile).TotalSeconds>=5){_lastReconcile=Server.Time;ReconcileHistory();}
                UpdateMetrics((Server.Time-_lastMetric).TotalSeconds>=5);if((Server.Time-_lastMetric).TotalSeconds>=5)_lastMetric=Server.Time;
                if(_halting&&(Server.Time-_lastEmergency).TotalSeconds>=5){_lastEmergency=Server.Time;foreach(var p in Positions.Where(Own).ToArray())RequestClose(p,"DRAWDOWN_HALT");}
                ManagePositions();CheckLoads();DiscoverBatch();for(int i=0;i<LoadParallelism;i++)LoadOne();EvaluateMarkets();
                if((Server.Time-_lastRender).TotalSeconds>=StatusSeconds){_lastRender=Server.Time;PrintStatus();}
                if((Server.Time-_lastCoverage).TotalSeconds>=30){_lastCoverage=Server.Time;PrintCoverage();}
                if(DesktopPanel&&_panel!=null&&(Server.Time-_lastPanelRender).TotalSeconds>=2)
                {_lastPanelRender=Server.Time;try{RefreshSymbolPicker();RenderPanel();}catch(Exception ex){Print("PANEL FEHLER: "+ex.Message);DesktopPanel=false;}}
                if((Server.Time-_lastFlush).TotalSeconds>=5){_lastFlush=Server.Time;Flush();}
            }
            catch(Exception ex){RecordFatal("TIMER_FAILURE","OnTimer",ex.Message,ex);}
            PumpOnline();
        }
        DateTime _lastPanelRender;
        void PrintCoverage()
        {
            var ms=_markets.Values.ToArray();
            for(int i=0;i<ms.Length;i+=15)Log("COVERAGE",new{part=i/15,selected=_selected.Count,items=ms.Skip(i).Take(15).Select(m=>new{
                symbol=m.Symbol.Name,stage=m.LoadStage,ready=m.Ready&&!m.Failed,problem=m.Problem,marketOpen=m.Symbol.MarketHours.IsOpened(),
                quoteAge=m.LastQuote==default?(double?)null:(Server.Time-m.LastQuote).TotalSeconds,lastDecision=m.Latest?.At,
                lastReason=m.Latest?.Reason,timeouts=m.Lease.Timeouts,waiting=m.Loading}).ToArray()});
        }
        void PrintStatus()
        {
            double eq=Account.Equity,open=BotOpenNet(),bot=_ledger.SessionPnl(open,true),other=_ledger.SessionPnl(Positions.Where(x=>!Own(x)).Sum(x=>x.NetProfit),false);
            double residual=DealLedger.Unexplained(eq-_initialEquity,bot,other);
            string check=!_historyReady||_pendingHistory.Count>0?"HISTORY_PENDING":Math.Abs(residual)>Math.Max(2,eq*0.00002)?"RESIDUAL_UNEXPLAINED":"WITHIN_TOLERANCE";
            int ready=_markets.Values.Count(x=>x.Ready&&!x.Failed),failed=_markets.Values.Count(x=>x.Failed),loading=_markets.Values.Count(x=>x.Loading),positions=Positions.Count(Own);
            var blockers=_markets.Values.Where(x=>x.Latest!=null).SelectMany(x=>x.Latest.Checks.Where(c=>!c.Passed)).GroupBy(c=>c.Code).ToDictionary(g=>g.Key,g=>g.Count());
            Log("STATUS",new{state=StatusText,engineFault=_faults.Snapshot(),localFaultFile=_faultFileState,telemetry=_online?.Snapshot(),currency=Account.Asset.Name,equity=eq,balance=Account.Balance,pnl=bot,openNet=open,closedNet=_realized,
                accountDelta=eq-_initialEquity,accountStartEquity=_initialEquity,accountStartBalance=_initialBalance,openingOwnNet=_openingNet,otherDelta=other,
                residual,accountCheck=check,historyAvailableOwnClosed=_historyAllOwnNet,historyCoverage="available_broker_history_not_guaranteed_complete",pendingHistory=_pendingHistory.Keys.ToArray(),
                dd=_maxDrawdown,drawdownBasis="ACCOUNT_EQUITY_THIS_RUN_OR_EXPLICIT_REFERENCE",highWater=_peak,ready,loaded=_markets.Count,selected=_selected.Count,pending=_loadQueue.Count,loading,failed,
                closed=_closed,wins=_wins,losses=_losses,positions,margin=Account.MarginLevel,usedMargin=Account.Margin,freeMargin=Account.FreeMargin,
                all=AllBrokerSymbols,lots=FixedLots,sizing=Sizing.ToString(),currencyRiskPercent=CurrencyRiskPercent,blockers,
                memoryMb=GC.GetTotalMemory(false)/1048576.0,parameterHash=_parameterHash});
            Print("STATUS {0} | Modelle {1}/{2} | laden {3}, warten {4}, Fehler {5} | KontoDelta {6:0.00} {7} | BotDelta {8:0.00} | Abgleich {9} Rest {10:0.00} | Positionen {11}",
                StatusText,ready,_selected.Count,loading,_loadQueue.Count,failed,eq-_initialEquity,Account.Asset.Name,bot,check,residual,positions);
            PrintFaultDiagnostic();
            Log("POSITIONS",new{items=Positions.Where(Own).Select(p=>new{positionId=p.Id,symbol=p.SymbolName,side=p.TradeType.ToString(),entry=p.EntryPrice,
                entryUtc=p.EntryTime,volume=p.VolumeInUnits,stop=p.StopLoss,target=p.TakeProfit,net=p.NetProfit,commission=p.Commissions,swap=p.Swap,
                protectionOnly=_managed.TryGetValue(p.Id,out var st)?st.ProtectionOnly:true,excursion=_excursions.TryGetValue(p.Id,out var ex)?ex:null}).ToArray()});
        }
        PositionSeed Seed(Position p)=>new PositionSeed {Id=p.Id,Symbol=p.SymbolName,Side=p.TradeType==TradeType.Buy?1:-1,
            Entry=p.EntryPrice,Volume=p.VolumeInUnits,EntryTime=p.EntryTime,Stop=p.StopLoss,Target=p.TakeProfit,Comment=p.Comment};
        void LoadPositionState()
        {
            Dictionary<int,ManagedTrade> stored=null;
            if(IOFile.Exists(_stateFile))
            {
                try {stored=JsonSerializer.Deserialize<Dictionary<int,ManagedTrade>>(IOFile.ReadAllText(_stateFile),Json);}
                catch(Exception ex){Note("Alte Zustandsdatei unlesbar; Broker-Schutz bleibt unveraendert: "+ex.Message);}
            }
            foreach(var p in Positions.Where(x=>Own(x)).ToArray())
            {
                ManagedTrade st=null;
                if(stored!=null&&stored.TryGetValue(p.Id,out var candidate)&&RecoveryRules.ValidStored(candidate,Seed(p)))st=candidate;
                string reason="Datei";
                if(st==null)st=RecoveryRules.Recover(Seed(p),out reason);
                st.RetryAfter=default;_managed[p.Id]=st;
                if(!p.StopLoss.HasValue||!p.TakeProfit.HasValue)_unprotected.Add(p.Id);
                Note("UEBERNOMMEN ID="+p.Id+" Symbol="+p.SymbolName+" Einheiten="+N(p.VolumeInUnits)+" SL="+(p.StopLoss.HasValue?N(p.StopLoss.Value):"FEHLT")+
                    " TP="+(p.TakeProfit.HasValue?N(p.TakeProfit.Value):"FEHLT")+" Modus="+(st.ProtectionOnly?"BROKER-SCHUTZ UNVERAENDERT":"EXIT-REGEL WIEDERHERGESTELLT")+" Quelle="+reason);
                Log("POSITION_ADOPTED",new{id=p.Id,symbol=p.SymbolName,label=p.Label,entry=p.EntryPrice,volume=p.VolumeInUnits,
                    entryTime=p.EntryTime,stop=p.StopLoss,target=p.TakeProfit,protectionOnly=st.ProtectionOnly,source=reason});
            }
            Note("UEBERNAHME FERTIG: "+_managed.Count+" Positionen, davon "+_managed.Values.Count(x=>x.ProtectionOnly)+" mit erhaltenem Broker-Schutz ohne alte Zeitregel.");
            SaveState();
        }
        void OnPositionOpened(PositionOpenedEventArgs args)
        {
            var p=args.Position;
            if(_started&&Own(p)&&!_submitting&&!_managed.ContainsKey(p.Id))
                Fail("Unerwartete neue Bot-Position "+p.Id+". Zweite Instanz moeglich; nicht gleichzeitig laufen lassen");
        }
        void SaveState()
        {
            try{string tmp=_stateFile+".tmp";IOFile.WriteAllText(tmp,JsonSerializer.Serialize(_managed,Json));IOFile.Move(tmp,_stateFile,true);}
            catch(Exception ex){RecordFatal("POSITION_STATE_WRITE","SaveState",ex.Message,ex);}
        }
        void Flush(){try{_events?.Flush();_decisions?.Flush();_ticks?.Flush();_equity?.Flush();_trades?.Flush();}catch(Exception ex){RecordFatal("AUDIT_FLUSH","Flush",ex.Message,ex);}}
        static string Csv(string s)=>"\""+(s??"").Replace("\"","\"\"")+"\"";
        protected override void OnStop()
        {
            _armed=false;
            if(_started)
            {
                Log("STOP",new{message="Bot beendet: serverseitige SL/TP bleiben; Zeitpflege endet bis Neustart.",openPositions=Positions.Count(p=>Own(p))});
                SaveState();Flush();
                foreach(var m in _markets.Values)if(m.Subscribed)m.Symbol.Tick-=OnMarketTick;
                Positions.Closed-=OnPositionClosed;
                Positions.Opened-=OnPositionOpened;
            }
            try{if(_panel!=null)Chart.RemoveControl(_panel);}catch{} _panel=null;
            _online?.Dispose();
            _started=false; _events?.Dispose();_decisions?.Dispose();_ticks?.Dispose();_equity?.Dispose();_trades?.Dispose();_lock?.Dispose();
        }
    }
}
