# Plattform- und Integrationsaudit für den konsolidierten Masterplan

**Stand: 11. November 2026. Prüfung der tatsächlich beigefügten Dateien; keine Implementierung, kein Brokerzugriff und keine neu ausgeführten Plattform- oder Profitabilitätstests.**

## 1. Ergebnis, das die Reihenfolge des Masterplans bestimmt

Die Materialien sind nützlich, bilden aber noch keinen einheitlichen Softwarestand. Der vorhandene lokale Control Hub ist **Trading Local 0.7.0**, während die Th3R3v0lut10n-Dokumente bereits **0.8.0** voraussetzen. Der enthaltene C#-Bot ist eine **Ready17-Bridgevariante**, nicht die im neueren Status und Log erwähnte ExtremeLab-1.9-Engine. Das Statuspaket enthält keinen wiederherstellbaren vollständigen Quellstand, sondern drei Statusdateien und eine zeitlich begrenzte Snapshotreferenz. `Adaptive_Trading_Lab_Teil6.zip` enthält Daten, keine Forschungsengine. Ein neuer Masterplan muss diese Versions- und Quellenlücken zuerst behandeln.

Der lokale Hub liefert trotzdem gute, tatsächlich implementierte Donoren: Profilverwaltung, SQLite mit kontrollierter Migration, Konfigurationsvorschlag und Readback, Runtime-/Kontobindung, getrennte Fähigkeiten, MCP, begrenzte KI-Adapter, Wartung/Restore, dunkle Oberfläche und Frischeanzeigen. Eine bloße Kopie des Hubs nach Vercel wäre keine funktionierende Integration: SDK und Server sind bewusst an Loopback und gleiche Origin gebunden. Die gemeinsame Website benötigt eine authentifizierte Projektion vom Ausführungsrechner und später separat kontrollierte Kommandos. **Nachträglich gelesene aktuelle Vercel-Quellausschnitte belegen, dass ein solcher begrenzter RemoteView20-Weg bereits angelegt und deployt ist. Er wird als Donor geprüft und erweitert, nicht neu erfunden; siehe Abschnitt10.**

**Produktentscheid für den neuen Plan:** gemeinsame Website und gemeinsames Fachmodell; getrennte Verantwortlichkeiten für lokale Ausführung, Forschung und Fernprojektion. Bestehende Funktion wird gezielt übernommen. Historische Pläne liefern Prüfregeln, aber keinen Beleg, dass ihre Funktionen bereits laufen.

## 2. Umfang und Nachweisgrenze der Prüfung

Untersucht wurden diese Originale unter `upload/`:

| Artefakt | Tatsächlicher Inhalt | Eigener Nachweis dieser Runde |
|---|---|---|
| `Trading_Local_Quellcode_und_Startpaket.zip` | 271 Dateien, 3.387.930 unkomprimierte Bytes; Node-Core, UI, Dokumentation, Tests, SDK, Ready17-Integration | Sichere Entpackung; alle 270 Einträge des internen `SOURCE-SHA256.txt` erneut passend; zentrale Codepfade gelesen |
| `Adaptive_Trading_Lab_Teil6.zip` | 753 Dateien, 267.784.643 unkomprimierte Bytes; 263 ZIP, 245 JSON, 240 CHECKSUM, 3 MD, 2 CSV | Inhaltsinventar; alle 240 Binance-Archive gegen Manifest und CHECKSUM erneut geprüft; Hashes der drei abgeleiteten/Indexdateien passend |
| `Th3R3v0lut10n_2_0_Status_Verifiziert_2026-11-07.zip` | 3 Dateien, 8.328 Bytes: STATUS, FORTSETZUNG, SHA256SUMS | Vollständig gelesen; enthält keine Engine-, Observer- oder Plattformquellen |
| `Th3R3v0lut10n_2_0_Gesamtplan_v0_4.md` | 850 Zeilen, 98.449 Zeichen | Struktur, Ausgangsstand, Architektur, Forschungs- und Produktabgrenzung gelesen |
| `Th3R3v0lut10n_2_0_Ausfuehrungshandbuch_v1_0.md` | 4.880 Zeilen, 277.407 Zeichen | 26 AP/151 Unteraufgaben vollständig strukturell erfasst; zentrale Arbeits-, Vertrags-, Forschungs-, Betriebs- und Übergaberegeln gelesen |

Vor Entpackung wurden absolute/übergeordnete ZIP-Pfade und Symlinks ausgeschlossen sowie Dateigrößen begrenzt. Keine enthaltenen Launcher, Installer oder Tests wurden gestartet. Die interne SHA-Konsistenz bestätigt Inhaltsgleichheit, nicht Herausgeberauthentizität. Historische Prüfergebnisse wurden als historische Belege gelesen, nicht als heute wiederholt ausgegeben.

### Originalarchiv-Hashes

- Trading Local: `3b2806bcea54ee52da971a7c6708ddc07b247832b73779258470c9afa0a84c0d`
- Adaptive Teil6: `cf2dd5842c6a22a15e82f6d19d7c16cf404d6b613640289dfe663e525bcdef3d`
- Status: `6828cccc645bb174c15b44d288d1c91cebb356e8ddfc60a300cdfeda0f1ddf2e`

Vollständige Inventare stehen unter `analysis/platforms/*-inventory.json`; das extrahierte alte AP-Register unter `analysis/platforms/legacy_ap_crosswalk.json` und `.md`.

## 3. Versionsmatrix: vorhandene Bytes, historische Aussage, fehlender Nachweis

| Bereich | Aktuell vorhandene Bytes | Historischer/plangemäßer Stand | Konsequenz |
|---|---|---|---|
| Local Core/UI/MCP | 0.7.0; `package.json:3`, `README_DE.md:3,53`, `core/mcp.mjs:23` | v0.4-Plan und Ausführungshandbuch setzen 0.8.0 voraus | 0.8.0 aus authentischer Projektquelle wiederfinden und diffen; sonst 0.7.0 ausdrücklich als verfügbare Basis festschreiben |
| Datenbankschema | 2; `core/store.mjs:7` | Status nennt ebenfalls Schema2 | Gleiche Schemanummer beweist nicht identische komplette Plattform |
| SDK/Ready17Local | Artefakt0.3.0, Vertragsversion1.0.0, net10-Konfiguration | Status bestätigt alte Bridge bleibt0.3.0 | Integrationsmuster wiederverwenden; Handelslogik nicht als1.9 ausgeben |
| aktuelle Engine1.9 | im hier geprüften Plattformpaket nicht enthalten | Status nennt26 produktiveC#-Dateien und566 wiederholte Logikprüfungen | Für echte Portierung Originalquelle und .algo/Buildbeleg beschaffen; Log ersetzt Source nicht |
| Observer2.0-alpha.2 | keine Quellen im Status-ZIP | Status beschreibt gebauten lesenden Observer, `planId=null`, `exitMode=observed_only` | Codebeschaffung und neues End-to-End-Gate; fehlende Originalpläne sichtbar lassen |
| Forschungslabor Teil6 | nur Daten | Dateiname könnte fälschlich vollständige Plattform suggerieren | Offline-Labore aus anderen Arbeitsmaterialien separat zuordnen; nicht vorhanden erfinden |
| Website Vercel | Root prüft die aktuelle URL separat | alte Website-/Local-UI-Dokumente | Tatsächliche Deployment-/Quellidentität vor jeder Änderung binden |

Der Status beschreibt ausdrücklich, dass der damalige Observer weder Order-/Exitverwaltung noch SL/TP-Änderungen enthält und die echte Windows-/Hub-Verbindung nicht nachgewiesen war. Die Snapshotreferenz mit Ablaufdatum ist kein dauerhaftes Quellrepository. Vor einem neuen aktiven Integrationspfad muss ein persistentes, vollständig reproduzierbares Baselinepaket vorliegen.

## 4. Tatsächlich implementierte lokale Plattform und gezielte Wiederverwendung

Die folgenden Pfade beziehen sich auf `analysis/platforms/Trading_Local_Quellcode_und_Startpaket/Trading_Local/`.

| Donor | Im Code vorhandene Leistung | Übernahme in gemeinsames System | Noch fehlender Schritt |
|---|---|---|---|
| `core/schema.mjs:4–9,46–79` | Kanonische JSON-Serialisierung/SHA, Manifest-/Typ-/Bereichsvalidierung, vollständige Werte | Gemeinsame Konfigurations- und Hashregeln; klarer Vertrag je Botfamilie | Neue Zahlensemantik/Einheiten und Plangültigkeit ausdrücklich versionieren |
| `core/schema.mjs:30–43` | Ready17-Profil: Risiko/Trade, Kontorisiko, Marginminimum, Positionen, Short | Referenz für ehrliche Fähigkeitsdarstellung | Keine zusätzlichen Strategieparameter vorgaukeln; 1.9/MT5 eigene Profile |
| `core/control.mjs:15–35,49–63` | Neustartsperre; menschliche/Agentrechte; Runtimefrische; unbestätigte Befehle getrennt | Kontrollpfad behalten; UI/Agenten verwenden dieselben Methoden | Fernrechte/mehrere Mandanten benötigen serverseitige neue Bindung |
| `core/control.mjs:88–125` | Archivierung widerruft Token/Grant und sperrt alte Commands; bewusste Reaktivierung | Profil-Lebenszyklus und Wiederanlauf | Archivieren ist kein Prozessstop und kein Positionsclose |
| `core/capabilities.mjs:63–91` | Deklaration, Implementierung, Verbindung, Freigabe und Aktion getrennt | Ein gemeinsames Capabilitymodell in Website, Chat und API | Simulation, Prozesssteuerung und Livefunktionen erst nach Implementierung aktivieren |
| `core/store.mjs:40–108,111–163` | Striktes SQLite-Schema, Migration mit Vorabsicherung, WAL/FULL, Integritätsprüfung | Lokaler Zustand und sichere Migrationsgrundlage | Neues Trade-/Deal-/Cashflowledger und Recorder getrennt ergänzen; Retention neu definieren |
| `core/application.mjs:15–31,35–89`, `core/maintenance*.mjs`, `core/restore.mjs` | Kontrollierter Wartungsprozess, Shutdown, Restore/Handoff und Wiederanlauf | Recovery als Produktfunktion erhalten | Mit aktueller Brokerrealität abgleichen; Datenrestore darf Trades nicht rückgängig vortäuschen |
| `core/vault.mjs:6–55` | WindowsDPAPI CurrentUser; andere OS nurRAM; Generationen gegen verspätete Secretwrites | Lokale Secrets am Host belassen | Kein fertiger Cloudvault, kein Mehrnutzerlogin; Zugriff auf entfernte Projektion separat |
| `core/registry.mjs:8–18,30–60` | Neun begrenzte Tools; Reads und Vorschläge; Rechte nach await erneut geprüft | Gemeinsame Servicefunktionen für KI/Website | Keine Shell-/SQL-/Brokerwrite-Tools hinzufügen; Researchjobs nach Budget und Datenzugriff kapseln |
| `core/mcp.mjs:2–4,19–35` | Begrenztes stateless StreamableHTTP-MCP, strukturierte Rückgaben | Agentzugriff auf tatsächliche Zustände | Gepinnte Protokollprofile prüfen, neue Tools je Gate aktivieren |
| `adapters/providers.mjs:4–13,22–66` | OpenAI/Anthropic/Gemini/Ollama/kompatible Adapter, Owner-konfigurierte Endpoints, begrenzte Runden/Tools | Assistent als erklärender/planender Client | Echte Providerabnahme offen; keine LLMentscheidung im zeitkritischen Ausführungspfad |
| `adapters/broker.mjs:3–9,197–224,245–317` | Lesender MCPadapter; Einheiten aus wirklichem Schema; Kontoabgleich; Partial-/Frischekennzeichnung | Lesende Kontoprojektion als Donor | Vollständige Orders/Deals, echtes Paging, Cashflows und richtige neue Schemas fehlen |
| `sdk/HubProtocol.cs:90–109,113ff`, `sdk/HubBridge.cs:74–214` | Loopback-Transport, Heartbeat, Kontobindung; Owner-Thread-Apply+Readback; ACK; keine erneute Anwendung gleicher Command-ID | Muster für robuste native Bridge | Vollständige Handelstelemetrie/Originalpläne und aktueller Enginesupport fehlen |
| `public/connection.mjs`, `public/system.mjs`, `public/management.mjs` | Frische-/Capability-/Archivstatus und konkurrierende UIantworten | Zustandsdarstellung übernehmen | Mit aktueller Vercel-Designbasis verbinden; keine zweite Konfigurationswahrheit |
| `public/plot.mjs`, `public/data.mjs:37–57` | Candleplots, Beobachtungskurven, sichtbare Datenlücken, sechs Perioden | Anzeige- und Interaktionsdonor | Chartperioden sind noch keine Strategie-MTF-Analyse; Cashflowbereinigung/Finanzkennzahlen neu |

### Was der Hub ausdrücklich noch nicht kann

`core/capabilities.mjs:86–90` markiert Start, Stop, Neustart, Backtest und Livehandel als `not_implemented`. `core/registry.mjs` enthält keine solchen Tools. `README_DE.md:119–125` trennt den lesenden Hub von der eigenständigen Orderlogik der alten C#-Strategie. Ein echtes Broker- oder Bot-Startsystem entsteht nicht durch das Freischalten bestehender UIbuttons.

`README_DE.md:201–205` begrenzt den Hub auf ein lokales Benutzerprofil, eine aktive Kontoverbindung, mehrere Botprofile und einen ausgewählten KI-Anbieter. Mehrere Profile sind weder mehrere Brokerkonten noch verschiedene Website-Nutzer. `sdk/HubBridge.cs:207–209` hält die kleine Commanddeduplizierung im Arbeitsspeicher; diese kann nicht als vollständiges dauerhaftes Order-Exactly-once-System übernommen werden.

### Datenhaltung ist noch kein Handelsbuch

`core/store.mjs:8–16,123–146` enthält KV, Bots, Proposals, Tokens, Events, Messages und Snapshots. Es gibt keine separaten unveränderlichen TradePlans, BrokerOrderObservations, ExecutionDeals, Reservations oder Cashflows. `event()` schneidet den Ereignisbestand auf ungefähr100.000 Einträge zurück (`:170–175`); `saveSnapshot()` behält20.000 Snapshots (`:180–184`); Chartgeschichte liest höchstens1.800 Beobachtungen (`:191–199`). Das ist eine lokale Bedienhistorie, keine vollständige Beweiskette für Langfristperformance.

Der neue Plan muss Datenarten trennen: kritische Handelsbelege mit dauerhafter, rekonstruierbarer Aufbewahrung; kurzlebige Projektionen; Rohmarktarchive; begrenzte Debug-/Telemetriedaten. Snapshot-P&L, realisierte Deals, offene Bewertung und Cashflow-bereinigte Rendite brauchen eigene Bedeutungen. `public/data.mjs:50` berechnet Veränderungen aus vorhandenen Beobachtungen; diese Funktion allein liefert keine cashflowbereinigte Strategierendite.

### Fernverbindung benötigt einen neuen, begrenzten Vertrag

`sdk/HubProtocol.cs:90–97` akzeptiert ausschließlich `http://127.0.0.1:<port>/`. `server.mjs:373–381` prüft Host und Origin, weist Cross-Site zurück und deaktiviert CORS. Der Server soll deshalb nicht öffentlich freigegeben werden. Ausgehende, authentifizierte Hostprojektion mit Snapshot+Cursor, Kontobindung, asOf und Widerruf gehört in ein getrenntes Modul. Der inzwischen identifizierte Vercel-RemoteView20 ist dafür ein vorhandener Kandidat, dessen vollständige Quelle und Hostgegenstelle noch gesichert werden müssen. Eine HTTPantwort des Webservers darf alte Hostdaten nicht als frisch markieren. Die öffentlich beobachtete Website allein belegt keine gekoppelte Engine.

## 5. Datenpaket Teil6: konkret nutzbar, aber keine Allround-Abdeckung

### Binance-Spot

`data_real/source_inventory.json` fixiert vier Märkte, BTCUSDT/ETHUSDT/BNBUSDT/SOLUSDT, Monatsarchive Januar2021 bis Dezember2025, Intervall1h. Alle240 Archive wurden erneut gegen ihren gespeicherten SHA256 und die beigelegte CHECKSUM geprüft: keine Abweichung.

`data_real/quality.json` nennt43.805 gemeinsame Open-Zeitpunkte bei43.824 erwarteten Stunden,19 fehlende gemeinsame Stunden und20 quarantänisierte Rohzeilen. Diese Zahlen passen zur tatsächlich gelesenen CSV (43.805 Datenzeilen; Beginn2021-01-01 00:00UTC, Ende2025-12-31 23:00UTC). Alle drei dokumentierten Hashes stimmen:

- `common_open_prices.csv`: `37907d4b384392c4cfdf512a6367a4a73c51624441b9025bb1f6a725db08f289`
- `data_quality_exclusions.csv`: `06ba912fb4405da97bd4b5773557d8009d5a1a761043d02eb2aa22aeeb46b673`
- `source_inventory.json`: `53017fd0ee7313f741c78f34ca32d5c450376194a547fe329c2b907dc88345f1`

Die Roharchive enthalten vollständige Börsen-OHLCV-Kerzen mit Trades und Volumenfeldern. Die gemeinsame CSV enthält ausschließlich Openpreise. Für Candlestick-/Volumenmuster muss die Verarbeitung aus den Roharchiven erfolgen; die Openmatrix kann diese Information nicht rekonstruieren. Ab2025 verwenden die archivierten Spotdaten Mikrosekunden statt Millisekunden; die gespeicherte Dokumentation und Qualitätsdatei benennen das ausdrücklich. Zeitstempelkonvertierung gehört in einen geprüften Adapter, nicht in eine Heuristik im Chart.

Exakte Timestamp-Schnittmenge und keine Interpolation sind transparent dokumentiert. Für gemeinsame Portfolios ist aber eine intersection-basierte Auswahl allein noch keine realistische Kontoentwicklung bei Ausfällen. Die Planung benötigt eigene Regeln für je Markt vorhandene Daten, Handelbarkeit, bekannte Lücken, offene Positionen und zeitgerechte Bewertung.

Die archivierte `source_docs/TERMS_AND_CONDITIONS.md:29–49` unterscheidet Datennutzung mit CC BY-NC-SA und persönlicher Forschung von kommerzieller/produktiver Nutzung. Das ist hier eine Aussage über die mitgelieferte Lizenzdatei, keine aktuelle rechtliche Freigabe. `README.md` nennt für den Code MIT; daraus folgt keine MIT-Lizenz der Daten. Vor produktiver Website-/Drittverwendung muss der konkrete aktuelle Datensatzvertrag geprüft und im DataManifest eingetragen werden. Im Trading-Local-Paket wurde keine eigene LICENSE-Datei gefunden; Weitergabe/Rechte an übernommenen Komponenten müssen daher ebenfalls nachvollziehbar geklärt werden.

### EURUSD-Ticks

`data_fx/histdata/raw/` enthält22 Monatsarchive Februar2024 bis November2025. Ein zusätzliches Januar2004-Archiv liegt ausdrücklich unter `rejected_pilots/`. Die Samples zeigen Zeitstempel, zwei Preisfelder und ein Volumenfeld; der erste geprüfte reguläre Tick lautet2024-02-01 mit1.080760/1.080780. Der verworfene2004-Pilot beginnt unter anderem mit1.259000/1.257000 und damit bei der erwarteten Bid-/Askzuordnung negativem Spread. Er darf nicht ohne Qualitätsentscheidung reaktiviert werden.

Die beigefügten `.txt`-Dateien enthalten konkrete Gaps, z.B.114Sekunden im Februar2024. Das Datenpaket enthält aber keine vollständige normalisierte FX-Datenpipeline, kein allgemeines FX-DataManifest und keinen hier ausgeführten vollständigen Tickqualitätsbericht. Zeitzone/DST, Bid-/Askspaltenvertrag, Dubletten, Reihenfolge, Coverage, Nutzungsrecht, Brokerbezug und Spreadanomalien sind vor `DATA_READY` je Studie zu prüfen. Native Datenticks können nicht durch den Dateinamen allein als ausführungsgleiche Fusion-/cTraderquotes gelten.

### Grenzen der tatsächlichen Abdeckung

Dieses Paket liefert keine Aktien-Einzelhistorien, keine Delistings-/Corporate-Actiondaten, keine Gold-/Silberhistorie, keine breite FX-Paarhistorie und keine M1-/Tickhistorie der vier Kryptomärkte. Es enthält keinen Python-, JavaScript- oder C#-Forschungskern. Es ist ein wertvoller, bereits teilvalidierter Datenbaustein eines größeren Labors; das Wort Teil6 darf keine darüber hinausgehende Verfügbarkeit implizieren.

## 6. Der ältere Plan ist eine starke Spezifikation, braucht aber Konsolidierung

Das Ausführungshandbuch enthält bereits26 Arbeitspakete,151 Unteraufgaben, R01–R42 und T001–T124. Jede AP-Karte beschreibt Eingang, Änderungsorte, Lieferobjekte, Abnahme, Rückfall und Blocker. Der neue Masterplan sollte diese IDs referenzieren und die existierenden Fälle weiterführen. Neue Multi-Timeframe-/Pattern-/Portfolio-/Webintegrationsaufgaben werden als Ergänzung oder ausdrücklich bezeichnete Ersetzung zugeordnet. Eine neue parallele Liste ohne Crosswalk würde die vom Nutzer gefürchtete Drift verstärken.

Das alte Handbuch nennt `register/ARBEITSPAKETE.json`, `register/FORTSETZUNG.json`, `templates/ARBEITSBELEG.json`, `register/VERTRAGSBEISPIELE.json` und `pruefe_plan.py`. Im aktuellen Upload liegen sie **nicht als vollständiges ausführbares Planungspaket** vor. Die kleine FORTSETZUNG-Datei im Status-ZIP ist ein historischer Snapshotbeleg, kein vollständiger aktueller Arbeitszustand. Der neue Auftrag kann konkret Mehrwert liefern, indem diese Register, Arbeitskarten und überprüfbaren Zustandsübergänge tatsächlich als Dateien bereitgestellt werden.

### Verträge, die ausdrücklich weitergelten sollen

Ausführungshandbuch3.1–3.12 (Zeilen1612–1793) beschreibt bereits sinnvoll:

- Quelle für Brokerbestand ist der Broker; Quelle für angewandte Konfiguration ist die identifizierte Engine; Website ist Projektion.
- AccountKey umfasst Broker/Konto/Umgebung; SymbolKey native Brokeridentität; Runtime/Boot/Build/OwnerEpoch bleiben getrennt.
- OBSERVE erzeugt null Place/Modify/Cancel/Close/Reverse, einschließlich OnStart und Altpositionspflege. AutoArm=false allein beweist das nicht.
- IDs als Strings; Geld/Preis/Menge als kanonische Dezimalstrings mit Einheit; UTC und monotone Fristen getrennt; unbekannt bleibt null+quality/reason.
- Originalplan vor risikovergrößernder Nebenwirkung; TradePlan und Revisionen unveränderlich, keine rückwirkende Umdeutung von Kurztrade in Langfristtrade.
- Durable Intent/Reservierung und Markierung des unklaren Sendefensters; Timeout führt zu Reconciliation, nicht blindem Retransmit.
- Drei Orderachsen: Absicht/Transport, Brokerbestand und Kontrollaktion; Teilfill plus Cancelrequest ist zulässige Kombination.
- EventID+Payloadhash, Quelle/Boot/Sequenz und bestätigter zusammenhängender Cursor; geändertes Duplikat ist Konflikt.
- Schutz-/Exitverwaltung läuft getrennt von neuer Einstiegsfreigabe; tatsächlich bestätigter Schutz unterscheidet sich vom gewünschten Stop.
- Bekannte offene Verluste und Fremdbestand bleiben im Kontorisiko; eine Limitänderung gibt ungeklärte alte Verpflichtungen nicht frei.

Diese Regeln sind **Spezifikation**, keine bereits im0.7-Core vorhandene vollständige Implementierung.

### Gute Forschungsregeln übernehmen

AP13/14 undKapitel4 verlangen R0=Originalregel und R1=reparierte Ausführung mit unveränderter Regel. Erst danach neue Strategievarianten vergleichen. Kontext/Setup/Trigger sowie Beobachtungsfenster und Abtastauflösung sind getrennte Größen. Ein Feature darf nur die damals verfügbare Information enthalten; laufende höhere Kerzen sind keine abgeschlossenen Kerzen. Preisrückkehr, direktes Limit und Kerzenbestätigung sind verschiedene Eintrittsregeln. Adaptive Allokation wird gegen feste Gewichte geprüft. Zielgewinn und Zeit-/Risikoende bleiben getrennt; Finanzierung, NoFill, Endmarkierung offener Bestände und Auswahlverzerrung gehören in jeden Wirtschaftstest.

Der alte Text bindet das Produkt an Extremzone/Gegenbewegung. Die aktuelle Nutzeranweisung delegiert die Strategiewahl frei. Im neuen Plan sollte die Extremzone deshalb eine unverändert gespeicherte Referenzfamilie sein. Trend-/Breakout-/Relative-Value-/Regimefamilien können eigenständige Hypothesen werden; sie werden nicht heimlich unter demselben Namen eingeschoben.

## 7. Empfohlene konkrete Integrationsfolge und harte Schrittgrenzen

Die Nummern unten sind Empfehlungen für die Konsolidierung, keine neue konkurrierende AP-Nummerierung. Der vollständige alte Crosswalk liegt separat vor.

1. **Quellen- und Deploymentabschluss (AP01 ergänzen):** Vercel-Deployment zu Repo/Commit binden; vorhandene0.7-Bytes sichern;0.8/1.9/Observer2.0 gezielt wiederfinden oder Missing markieren. Donorhashes, Lizenzen, Codezustand und übernommene Anforderungen dokumentieren. Gate: kein aktiver Port auf lediglich im Chat beschriebenen Quellen.
2. **Design- und Fachvertrag einfrieren (AP03/AP18/AP23):** aktuelle Vercel-Navigation/Tokens/Ansichten als Designbaseline; zentrale Entitäten, Modes, Einheiten und Statussemantik. Gate: UI kann Wunsch/Ist/Broker/Simulation/Unbekannt unterscheiden, keine zweite Konfigurationsdatenbank.
3. **Dateninventar und Recorder beginnen (AP13 parallel):** vorhandene vierCryptoH1/EURUSDTicks registrieren; Rechte, Zeitbasis, Gaps und benötigte weitere Assets. Gate: `DATA_READY` pro konkreter Studie, nicht global.
4. **Lesende Brücke mit nativen Gegenfällen (AP02/AP04):** aktuelle Engine/Observer und Hub-Endpunkt; Konto-/Runtime-/Versionbindung; Positions-/Orderabgleich. Gate: bestehende Position löst im OBSERVE-Modus keine einzige Brokeränderung aus; Testdaten werden nicht als Targetlauf ausgegeben.
5. **Dauerhaftes Handelsbuch und Wiederanlauf (AP06/AP07):** Originalplan, Intent, Reservierung, Deal, Cashflow; deduplizierte Inbox/Outbox; unklarer Sendestatus. Gate: Crash vor/nach Dispatch, Teilfill während Cancel, identisches/geändertes Duplikat, Diskfull, Snapshotcursorlücke ergeben definierte Zustände.
6. **Konfiguration und lokale Rechte (AP05):** vorhandenes Proposal/ACK-Muster auf echtes aktuelles Profil; Wirkung je `new_plans`/selektierteBestandsrevision. Gate: keine Anwendung mit falschem Konto, Runtime, Revision oder abgelaufenem Grant; ACK muss Readbackdaten enthalten.
7. **Exit/Session/Risiko gemeinsam schließen (AP08–AP12):** Stop-/Zeit-/Sessionpriorität, gemeinsame Brutto-/Währungs-/Margingrenzen, Volumenraster, Minfees, Operationsreserve, getrennte Workload. Gate: kein Spread-Doppelabzug, keine Mindestlot-Erzwingung, kein Close-Erfolg ohne Brokerbeleg.
8. **Replay mit gleichem Entscheidungsmodell (AP14):** ein GoldenEventTrace durch Liveadapter/Replay; Fillmodell nach Datenqualität; realistische Kosten/Konversion/Finanzierung. Gate: identische verfügbareInformation → identische beabsichtigteEntscheidung; Simulator-/nativerAdapterunterschiede dokumentiert.
9. **MTF-/Pattern-/Familienforschung (AP15–AP17 erweitern):** geschlosseneKontext-/Setup-/Triggerframes, vergangenheitskausale Muster, gesonderteFamilien, dann begrenzterSelektor. Gate: Time-availability-Test, Vergleich gegen einfacheBasis, eingefrorenerSuchraum, nicht nachträglich erweiterterTestbereich, Kostenstress.
10. **Website-Projektion und KI (AP18/AP19/AP23):** aktuellesDesign erhalten; ausgehendeHostevents, Geräte-/Nutzerrechte, Cursor/Frische; interne undexterneKI aufgemeinsameRegistry. Gate: fremdesKonto/entzogenerToken/alteHostdatenverweigern oder sichtbarstale; keineBrokercredentials imBrowser.
11. **Prozessbetrieb/Update/Demo/Release (AP20–AP24):** kontrollierterStart/Stop getrennt vonEntryblock; Handover undRestore gegenBrokerrealität; gestaffelteDemo; zweiterNutzer mit eigenenDaten. Gate: technische, wirtschaftliche undProduktfreigabe getrennt; negativesResearchergebnis ist akzeptierterLababschluss.
12. **Erweiterungen (AP25/AP26):** News/weitereKonten/MT5/RemoteWrites erst nach eigenemVertrag und Nutzenbeleg. Bereits vorhandeneMT5-Strategieideen können offline früh getestet werden; aktiverMT5-Adapter muss nicht den kritischen ersten cTraderPfad vergrößern.

## 8. Vorschlag für tatsächlich prüfbare Planbefolgung

Ein Textdokument kann einen künftigen Agenten nicht technisch zwingen. Der neue Plan sollte deshalb eine konkrete Build-/CI-/Reviewvereinbarung liefern:

- Ein aktiver Auftrag besitzt `task_id`, `plan_version`, `baseline_commit`, `dependencies`, `owned_paths`, `inputs`, `outputs`, `checks`, `stop_conditions`, `rollback` und `evidence_requirements`.
- Statuswechsel auf `verified` benötigt passende Quell-/Artefakthashes, vorhandene Prüflogs und zugewiesenen Reviewer. `implemented` ist nicht gleich `target_verified` oder wirtschaftlich akzeptiert.
- Eine Gateprüfung verweigert den nächsten abhängigen Auftrag bei fehlendem Pflichtartefakt, unbekanntem Inputhash, nicht bestandenemTest, blockiertemTarget oder Änderung außerhalb derzugewiesenenPfade.
- Änderungen anSchemata, Kapital-/Kosten-/Fillmodell, Holdout undAkzeptanzschwellen benötigen einenADR mitVersion undAuswirkung; nicht still inImplementierung ändern.
- Parallelarbeit ist nachPfadbesitz erlaubt; zentraleVertrags-/Order-/Schemadateien haben genau einenIntegrator.
- Testausnahmen undNegativeResearch bleiben sichtbar. EinFehler wird nicht durchAbsenken derSchwelle grün. Änderungen anTestdaten nachErgebniskenntnis erzeugen einenneuenVersuch.
- JedeFortsetzung liestRegister, letztenArbeitsbeleg undtatsächlichenGitstand. Hintergrundfortschritt wirdnur fürwirklich eingerichteteJobs berichtet.

Das alte Handbuch liefert hierfür sehr gute fachliche Regeln und Testfälle. Neu benötigt wird ihre Bindung an die **aktuell vorhandenen Quellen und die aktuelle Website**, mit ausführbaren Registern/Prüfwerkzeugen und klarer Kennzeichnung noch fehlender Eingaben.

## 9. Noch offene Fragen, die autonom bearbeitbar sind

1. Dauerhafte0.8-/1.9-/Observerquellen und genaueVercel-Repositoryidentität gezieltauffinden; keine neueStrategie ausunklarerBasisportieren.
2. AktuelleoffizielleHost-/CLI-/Cloudtransportfähigkeitenprüfen; alteDokumentquellen nicht automatischalsheutigeGrenzenübernehmen.
3. VorhandeneMT5- undPDF-Laborkerne mitC#-/JS-Replays nachVerhaltensverträgen vergleichen; keine unprüfbareDefinition von"gleicheStrategie".
4. Datenrechte undvorhandeneDatenabdeckung jegeplantemProduktmodus konkretabnehmen.
5. Geld-/Preis-/ID-/Zeit-/Fee-/Cashflowverträge fürgemeinsameLedger definieren.
6. RealeWindows-/cTrader-/Demo-/Providerprüfungen getrenntvorbereiten; fehlendeZielumgebung blockiert nurdenjeweiligenNachweis.

**Nicht aus dieser Runde ableitbar:** Strategieprofitabilität, Marktüberlegenheit, Ursache eines Killed-Ereignisses, native Cloudverbindung, fertige1.9-Integration oder eine tatsächlich gekoppelte Vercel↔Host-Verbindung. Diese Punkte brauchen die jeweiligen Code-, Daten- und Zielnachweise.

## 10. Nachtrag: tatsächlich vorhandene aktuelle Vercel-Projektion

Root hat die vom Nutzer genannte Produktionswebsite im Browser geprüft und den zugänglichen Quellbaum des Deployments `dpl_6AuCdiuxGSFKnF7svRpykB7XRAmp` im Projekt `extremelab-desk` lesend erfasst. Das Quellenmanifest steht in `analysis/vercel-source-manifest.json`; die beobachteten Dateien in `analysis/vercel-source/`. Von41 abgerufenen Dateien sind18 vollständig und23 durch den Rückgabekanal auf einen1500-Byte-Präfix gekürzt. **Die Präfixhashes sind keine vollständigen Dateihashes. Diese Sammlung ist kein wiederherstellbarer kompletter Quellstand.**

Im Rahmen dieses Plattformaudits wurden anschließend die vollständigen Buildwrapper, Konfiguration und die relevanten Präfixe gelesen:

| Aktueller Donor | Tatsächlich sichtbare Aussage | Grenze / nächster Nachweis |
|---|---|---|
| `lib/projection.mjs` (Präfix) | feste Websiteorigin und `/api/revolution`;30s Intervall,20 Zeilen,64KiB Klartextlimit; strikte Shapes, UTC- und Dezimalstringprüfung; Kontoidentität umfasst Broker/ID/Umgebung/Währung | Gesamtschema, Null-/Zahlenregeln und alle Datenfelder erst mit vollständiger Datei prüfen |
| `lib/service.mjs` (Präfix) | RemoteView20-Kontext;5min AuthTTL,8KiB Registrybudget, Tokenhash und Kontobindung, Widerrufsmetadaten | vollständige Lebenszyklus-, Concurrent-Write-, TTL- und Replayregeln nicht im Präfix sichtbar |
| `api/revolution.js` (Präfix) | privates Blob-Registryobjekt, ETag-bedingtes Schreiben,8KiB Leselimit, CacheNamespace, Service/Handler-Verbindung | echte Route-/Auth-/Kontotrennung und Hostgegenstelle End-to-End testen |
| `lib/storage.mjs` (Präfix) | privates gzip-Journalarchiv,16MiB Klartext-/3MiB Komprimatlimit, SHA-ID, begrenztes Dekomprimieren | Vollständige Retention/Paging/Autorisierung und Journalpersistenz brauchen vollständigen Code |
| `lib/relay.mjs` (Präfix) | konfigurierter HTTPS-Relay; nur live/status/snapshot/events; Cursor-/Symbolvalidierung; ohneKonfiguration `WAITING_FOR_RELAY_AUTHORIZATION` | Konfiguration wurde nicht gelesen und kein Relay aufgerufen; kein Verbindungsnachweis |
| `build-revolution20.mjs` (vollständig) | kopiert View20-Dateien und Projektion als Browservertrag; ergänzt Link in bestehender index-/konto-live-Seite; ausdrücklich read-only | vorhandenes Design gezielt ergänzen, Link nicht als gesamte Integration zählen |
| `build-release20.mjs` (vollständig) | acht sequenzielle Buildstufen einschließlich vorhandener UI und View20 | alle Stageeingaben und tatsächliches Deploymentbuildkommando sichern |
| `build.mjs` (vollständig) | entpackt gehashte `assets.0–3`, verarbeitet gehashte `live-overlay.b64`, führt Patch/weiteren Botbuild aus | gepackte Inhalte und sämtliche Patchdateien fehlen im bisher vollständig lesbaren Satz; keine Quellreproduktion behaupten |
| `package.json` + `version133.mjs` (vollständig) | Paketversion1.3.1, Node22; Patch ersetzt gezielt1.3.2→1.3.3 in gebauten Dateien | beobachtete UI1.3.3 ist durch Patch erklärbar; gemeinsames Release-/Buildmanifest soll Mehrdeutigkeit beseitigen |
| `vercel.json` (vollständig) | aktuelle API-Konfiguration `maxDuration:60`, Regionfra1, no-store und CSP | lange Studien brauchen fortsetzbaren Worker/Jobvertrag, keine stundenlange Simulation in einer einzelnen Anfrage |

**Überarbeitung der Planpriorität:** AP23 ist teilweise vorhandene Produktfläche, keine vollständig unbegonnene Idee. Zuerst vollständigen aktuellen Remotequellstand und lokale Sendergegenstelle sichern, seine tatsächlichen Fähigkeiten und Prüfbelege feststellen und dann denselben Weg ausbauen. Im0.7-Upload gibt es die neuere Sendergegenstelle nicht; sie darf nicht aus der vorhandenen Website erschlossen werden. Die Verbindung von aktueller Website, lokalem0.8-Kandidaten und Observer ist weiterhin ein nachzuweisendes Integrationsgate.

Die vom Root beobachtete Designbaseline lautet dunkler Hintergrund `#070a08`, Panel `#0b0f0d`, Border `#1d2621`, Akzent `#26dc77`, Text `#edf1ee`, gedämpfter Text `#89968e`, Fokus `#70e8a5`, Rot `#f1646e`, Amber `#dbb36b`, Inter14px und Kartenradius17px. Navigation: Übersicht, Märkte, Positionen, Regeln, Statistik, Verlauf. Diese Root-Beobachtung dient der UI-Übernahme; die vollständige visuelle Abnahme bleibt Root-Nachweis. Die Regelansicht bezeichnet lokale Änderungen ausdrücklich als nicht an den Bot übertragen. Neue Integration soll diesen Zustand erst nach echtem Readback ändern.
