# ExtremeLab – vorhandene Module und tatsächliche Datenwege

**Arbeitskennung:** S01-INTERFACE-MAP. **Geltung:** vorhandene Originalquellen des Plattformarchivs 0.9.7 und die 38 gesicherten Websiteinputs. Dies ist eine Ist-Zuordnung, keine neue Zielarchitektur, keine S02-Aktivierung und keine Produktfreigabe.

## Ergebnis

Es gibt nicht einen einheitlichen „Botdatenstrom“. Vier verschiedene Datenbedeutungen müssen erhalten bleiben: letzter beobachteter Bestand, historisches Engine-Journal, daraus abgeleiteter passiver Vergleich und komprimierte Fernansicht. Zusätzlich existiert der ältere XL1/XL2-Websitepfad. Gleiche Kontonummern oder ein JSON-Feld mit der Zahl 1 machen diese Formate nicht austauschbar.

| Architekturbegriff | Tatsächlich vorhandene Module | Bedeutung und Grenze |
|---|---|---|
| Lokaler Hub | `server.mjs`, `core/control.mjs`, `core/store.mjs`, `core/registry.mjs`, `core/mcp.mjs` | Authentisierung, lokale SQLite-Daten, menschliche/Agent-/Bridge-Zugänge. Kein durch diese Prüfung eingerichtetes Cloudprodukt. |
| Observer | `core/observation.mjs`, `integrations/ctrader-observer20/observer/src/ObserverProtocol.cs` | Letzter nichtatomarer Bestand; keine vollständige Historie oder ursprünglichen Handelspläne. Nativer Sender nur als Quelle untersucht. |
| Journal | `core/engine-journal.mjs`, native `Th3JournalProtocol20.cs`/`Th3JournalOutbox20.cs` | Persistierte Engineereignisse und zusammenhängende Projektion; nicht die Liste aller aktuell offenen Brokerpositionen. |
| Abgleich | `core/reconciliation-read20.mjs`, `core/reconciliation20.mjs` | Derselbe passive Reader für HTTP und MCP. Explizit ausgewählte Profile, Kontoidentität und exakte Positions-ID. Kein Ausführungsrecht. |
| Fernansicht | `core/remote-view20.mjs`, `integrations/vercel-view20/*`, gesicherte `api/revolution.js`/`view20-public/revolution.js` | Verlustbehaftete Projektion mit Teilmengen- und Quellenmarkierungen; kein Ersatz für Journal/Restore. Der Addonclient ist vollständig vorhanden, aber nicht der finale Skin-/Liveclient. |
| Ältere Website | `api/live.js`, `api/socket.js`, `lib/storage.mjs`, `lib/security.mjs` | Zwei verschiedene Pfade: Live-HTTP benötigt fehlenden JavaScript-Relay; WebSocket benutzt den vorhandenen Storage mit XL1/XL2-Validator. Nicht pauschal beide vom fehlenden Relay abhängig. |
| Globale Kontosnapshots | `server.mjs` Konto-API, Tabelle `snapshots` | Separater Provider-/Kontopfad. Observer- und Journalnachrichten füllen ihn nicht automatisch. Keine Kontoabfrage ausgeführt. |

## Verifizierte Verbindung und beobachtete Grenzen

**Eingang und Speicherung:** Neue Tests senden synthetische Meldungen über den unveränderten HTTP-Router und die echte Authentisierung in eine echte SQLite-Datei. Vor dem ersten Engineereignis ist das Engine-Journal trotz vorhandener Beobachtung leer. Auch die globale Kontosnapshot-Tabelle bleibt leer. IDs oberhalb der sicheren JSON-Zahlengrenze und präzise Dezimalstrings bleiben unverändert.

**Lücken und Wiederanlauf:** Eine Nachricht mit Sequenz 2 vor Sequenz 1 wird gespeichert, aber noch nicht in die zusammenhängende Lesemenge projiziert. Nach Lieferung des fehlenden Vorgängers rückt der Cursor vor. Ein wirklicher Server-/SQLite-Neustart erhält die Daten, markiert deren Aktualität aber erneut als ungeklärt. Erneute identische Quittungen erfrischen die Quelle nicht.

**Identität und Leserechte:** Engine und Observer werden ausdrücklich ausgewählt. Gleiche Kontonummer und Positions-ID bei einem anderen Broker reichen nicht zum Zusammenführen. HTTP und das tatsächliche MCP-Tool `get_bot_reconciliation` liefern dieselbe Auswahl und Positionszuordnung. Der erfundene Name `get_position_reconciliation` ist kein gültiges Tool. Eine HTTP-200-Antwort kann bei MCP ein fachliches `isError:true` enthalten; nur der HTTP-Status reicht nicht zur Erfolgsauswertung.

**Aktuell ist nicht vollständig:** Eine aktuelle Beobachtung mit unvollständiger Coverage bleibt `partial`/`truncated`. Ein aktueller Engine-Status kann die übergeordnete Quelle frisch machen, während ein einzelner Positionsbericht eine ältere `sourceAt` behält. Das vorhandene Remote-UI zeigt diese Zeilenzeit und warnt vor historischen Zählern; dieses UI wurde hier statisch, nicht im Browser ausgeführt.

**Projektion ist kein Journal:** Der Remote-Producer übernimmt nur einen Teil von Originalplan und Ereignismetadaten, begrenzt Zeilen und Nutzlast und unterscheidet `positionCountIsOpenInventory=true` (Observer) von `false` (Engineberichte). Ein solcher Anzeigesnapshot wird an den Originaleingängen nicht als Observation oder JournalBatch akzeptiert.

**Kein automatischer Formatkonverter:** Der ursprüngliche Websitevalidator erwartet XL1/XL2-Ereignisse mit `run/kind/utc/data`. Er verwirft die ursprünglichen Observation-, JournalBatch20- und Fernansicht-Dokumente. Ein gültiges synthetisches XL2-Ereignis wird dagegen unverändert in das bestehende `ExtremeLabAnalysis/2`-Format übernommen. Ein neuer Konverter wurde nicht gebaut.

## Genaue Schnittstellen

### IF-01 – Laufzeitbindung vor Telemetrie

**Belegstatus:** `original_http_sqlite_tested_native_source_only`.

```json
{
  "route": "/api/bridge/heartbeat",
  "method": "POST",
  "credential": "bridge bearer",
  "schema": "profile manifest + botId + runtimeId + accountId + sequence"
}
```

Ein Heartbeat bindet ein Profil an eine Laufzeit; die Testprofile melden blocked=true. Die Observer-Nachricht folgt erst nach Bestätigung.

**Grenze:** Kein gestarteter nativer Bot, kein Brokerkontakt; Empfangsbestätigung ist keine Orderfreigabe.

Quellen: `server`, `control`, `native-observer`, `native-journal`. Prüfzuordnung: I01, I02, I03, I07.

### IF-02 – Beobachterbestand

**Belegstatus:** `original_http_sqlite_tested_native_source_only`.

```json
{
  "route": "/api/bridge/observation",
  "method": "POST",
  "credential": "profile-bound bridge bearer",
  "schema": "Observation/schemaVersion=1",
  "storage": [
    "observer:v1:state:<botId>",
    "observer:v1:latest:<botId>"
  ]
}
```

Nichtatomarer letzter Bestand mit Coverage, Sequenz und Quellzeit; Dezimalwerte und native IDs bleiben Strings. Kein ursprünglicher Handelsplan und keine vollständige Historie.

**Grenze:** Aktualität ist nicht Vollständigkeit. Beobachterbericht ist keine unabhängige Bestätigung eines Brokers.

Quellen: `native-observer`, `server`, `observation`, `store`. Prüfzuordnung: I01, I02, I03, I07, I09.

### IF-03 – Dauerhaftes Engine-Journal

**Belegstatus:** `original_http_sqlite_tested_native_source_only`.

```json
{
  "route": "/api/bridge/journal",
  "method": "POST",
  "credential": "profile-bound bridge bearer",
  "schema": "JournalBatch20/schemaVersion=1",
  "storage": [
    "enginejournal:v1:<botId>:*"
  ]
}
```

Ereignis- und Sequenzbindung, Duplikaterkennung und atomare lokale Speicherung. Projektion schreitet nur über zusammenhängende Sequenzen fort.

**Grenze:** stored>0 bedeutet nicht lückenlose Projektion. Historische Positionsberichte sind kein vollständiger jetzt offener Brokerbestand.

Quellen: `native-journal`, `native-outbox`, `server`, `journal`, `store`. Prüfzuordnung: I01, I02, I03, I06, I07.

### IF-04 – Autorisierte lokale Lesemodelle

**Belegstatus:** `original_http_sqlite_tested`.

```json
{
  "routes": [
    "/api/hub/bots/<id>/observation",
    "/api/hub/bots/<id>/journal"
  ],
  "method": "GET",
  "mcp_tools": [
    "get_bot_observation",
    "get_bot_journal"
  ],
  "credential": "human local session / separate agent token"
}
```

Die beiden Lesemodelle bleiben getrennt; ein Bridge-Token ist kein Agent-Lesetoken. Neustart und Duplikate erfrischen Quellen nicht.

**Grenze:** Kein einheitlicher Event-Store oder automatischer Übertritt zwischen den Modellen nachgewiesen.

Quellen: `server`, `observation`, `journal`, `registry`, `mcp`. Prüfzuordnung: I01, I07, I12.

### IF-05 – Passiver Positionsvergleich

**Belegstatus:** `original_http_sqlite_tested`.

```json
{
  "route": "/api/hub/reconciliation20",
  "method": "GET",
  "mcp_tool": "get_bot_reconciliation",
  "selection": [
    "engineBotId",
    "observerBotId"
  ],
  "join_keys": [
    "broker",
    "id",
    "environment",
    "currency",
    "nativePositionId"
  ]
}
```

Zwei Profile explizit wählen; derselbe Originalreader dient HTTP und MCP. Werte, Originalplan und Quelle bleiben getrennt.

**Grenze:** Keine Schreib-/Handelsfreigabe, keine unabhängige Brokerverifikation, keine automatische Zuordnung nach Symbol oder Kontonummer allein.

Quellen: `server`, `comparison-reader`, `comparison`, `registry`, `mcp`. Prüfzuordnung: I04, I05, I12.

### IF-06 – Begrenzte Fernansicht erzeugen

**Belegstatus:** `original_projection_with_transport_double_tested`.

```json
{
  "target": "/api/revolution?action=receive",
  "method": "POST",
  "schema": "th3rev20_readonly/schemaVersion=1",
  "credential": "separate synthetic device bearer in this run"
}
```

Observerquelle meldet positionsbezogenen Bestand; Enginequelle meldet historische Berichte. Quellzeit je Zeile bleibt erhalten, Top-Level-Status kann neuer sein.

**Grenze:** Verlustbehaftete Ansicht, kein Journal-Backup oder Ereignis-Replay. Vault/Transportbestätigung in neuen Tests sind Attrappen.

Quellen: `remote`, `observation`, `journal`, `view-projection`. Prüfzuordnung: I08, I09, I10, I11.

### IF-07 – Fernansicht empfangen und lesen

**Belegstatus:** `source_bound_not_cloud_tested_this_run`.

```json
{
  "route": "/api/revolution",
  "actions": [
    "receive",
    "status",
    "snapshot",
    "pair",
    "revoke"
  ],
  "credentials": "device bearer for receive; owner session for other actions"
}
```

Gebundene Produktionsbytes entsprechen den Addonquellen des Originalarchivs. Gerätezuordnung und lesbare Projektion haben einen eigenen Vertrag.

**Grenze:** Echte Cloud-Cache/Blob-Konsistenz und neue Produktions-API-End-to-End-Ausführung wurden hier nicht geprüft.

Quellen: `view-api`, `view-http`, `view-service`, `view-projection`. Prüfzuordnung: original:remote-view20.

### IF-08 – Vorhandener Fernansicht-Client

**Belegstatus:** `source_bound_static_only`.

```json
{
  "page": "revolution.html",
  "consumer": "view20-public/revolution.js",
  "api": "/api/revolution"
}
```

Client warnt vor historischen Positionszählern, zeigt Zeilenquellzeit und Teilmengen. Vollständiger Addonclient liegt vor.

**Grenze:** Nicht mit fehlendem finalen Skin-/Live-Dashboard gleichsetzen; kein neuer Browserlauf und keine Designabnahme in diesem Paket.

Quellen: `view-ui`, `view-projection`. Prüfzuordnung: nur Quellenprüfung in diesem Lauf.

### IF-09 – Älterer Live-HTTP-Pfad

**Belegstatus:** `blocked_missing_original_dependency`.

```json
{
  "route": "/api/live",
  "method": "GET",
  "import": "../lib/relay.mjs"
}
```

Der gesicherte Handler ruft relayRequest auf. Die vollständigen Bytes dieses JavaScript-Relays fehlen.

**Grenze:** Der vorhandene Python-Relay ist kein Ersatz; der frühere Encoding-Vorschlag bleibt separat und nicht installiert.

Quellen: `legacy-live`. Prüfzuordnung: nur Quellenprüfung in diesem Lauf.

### IF-10 – Separater WebSocket-Pfad

**Belegstatus:** `source_bound_original_validator_tested`.

```json
{
  "route": "/api/socket",
  "messages": [
    "auth",
    "ping",
    "snapshot",
    "publish"
  ],
  "storage": "lib/storage.mjs"
}
```

Viewer und Producer benutzen den im Original vorhandenen Snapshotvertrag. Dieser Handler importiert storage.mjs, nicht den fehlenden relay.mjs. Der originale Validator erwartet XL1/XL2-Ereignisse mit run/kind/utc/data, nicht JournalEvent20.

**Grenze:** Native JournalBatch20-, Observation- und Remoteprojektion werden vom Originalvalidator abgewiesen. Kein Konverter implementiert; kein neuer WebSocket-/Cloudtest.

Quellen: `legacy-socket`, `legacy-storage`, `legacy-validator`. Prüfzuordnung: I13.

### IF-11 – Separater Konto-Snapshot-Pfad

**Belegstatus:** `separation_only_tested_no_account_connection`.

```json
{
  "route": "/api/account-live?action=snapshot",
  "storage": "SQLite snapshots table",
  "method": "GET"
}
```

Globale Kontosnapshots werden durch Observer- und Journalnachrichten nicht befüllt. Die echte Kontoabfrage besitzt eine eigene Provideranbindung.

**Grenze:** Die Kontoabfrage selbst wurde nicht aufgerufen; keine Kontoanbindung oder unabhängige Providerbestätigung.

Quellen: `server`, `store`. Prüfzuordnung: I01.

### IF-12 – Native Ausführung ist eine andere Grenze

**Belegstatus:** `source_only_not_executed`.

```json
{
  "boundary": "native dispatch / journal receipt"
}
```

Journalquittungen tragen grantsTrading=false. Der native Dispatch gehört nicht zum lesenden Fernansichts-/Vergleichsweg.

**Grenze:** Kein nativer Build, keine native Prozessausführung und kein Beleg eines Broker-Sicherheitsverhaltens.

Quellen: `native-dispatch`, `native-journal`, `journal`. Prüfzuordnung: I02.

## Quellbindung und Prüfbedeutung

`vendor-manifests/S01_INTERFACE_SOURCE_BINDINGS.json` bindet 23 ausgewählte Dateien an ihre tatsächlichen Originalbytes. Für Archivmitglieder sind Archivhash, vollständiger Mitgliedspfad und Dateihash enthalten; fünf Website-/Addon-Dateien werden zusätzlich bytegleich zwischen beiden Quellen nachgewiesen. `evidence/S01/interface-map.json` verknüpft Schnittstellen, Quellen, Grenzen und konkrete Test-IDs. Die bestehenden Pfad- und Donormatrizen verweisen auf genau diese Fassung.

Hashes und Textanker sind Nachvollziehbarkeitswerkzeuge, keine unabhängige Abnahme und kein Beweis jeder semantischen Aussage. Funktionale Aussagen stammen aus den angegebenen Originalquellen und den zugehörigen Testfällen. Die acht neuen Referenzprüfungen verhindern unter anderem erfundene Routen/Toolnamen, veraltete Hashes und Hochstufung fehlender Quellen.

## Laufgrenzen und offene Integration

Die neue HTTP-Prüfung benutzt Unix-Sockets statt IP-Listen. Originalrouter, HTTP-Parser, Sessionprüfung, Control und SQLite laufen unverändert. Ein eng begrenzter Transportadapter liefert dem unveränderten Host-/Origin-Prüfer den erwarteten lokalen Port. Die Remote-Vault und die Empfangsbestätigung sind Testdoubles; echte Broker-, Provider-, Browserstart- und Cloudadapter werden durch Fallen ersetzt und dürfen nie aufgerufen werden. Linux-seccomp verweigert IP-Socket-Erzeugung für den Prüflauf und seine Kindprozesse; das ist keine allgemeine Sicherheits-Sandbox.

Nicht nachgewiesen sind native C#-Kompilation oder -Ausführung, echte Brokerdaten, echte Vercel-Konsistenz, der vollständige Websitebuild, der finale Skin-/Liveclient und eine unabhängig erteilte Freigabe. Die 21 fehlenden vollständigen Websiteinputs bleiben fehlend. Der Python-Relay ersetzt den fehlenden JavaScript-Relay nicht. Vorhandene Produktkorrekturvorschläge bleiben separat und unverändert.

## Nächster begrenzter Anschluss

Die Zuordnung der vorhandenen Datenwege ist nun konkret. Ein weiterer zulässiger Quellen-/Offlineauftrag betrifft den bestehenden **Konfigurationsvorschlag → menschliche Bestätigung → native ACK → bestätigte Revision**-Pfad in `core/control.mjs` und dem vorhandenen Bridge-SDK. Zu prüfen wäre die Trennung gewünschter, bestätigter und beobachteter Werte bei Neustart oder verspäteter Quittung. Das erfordert keinen neuen Controller und keine Brokeraktion. Diese Ist-Karte weder erneut als allgemeine Quellensuche beginnen noch als Freigabe eines neuen Planschritts interpretieren.

## Fundstellen

### server

`Th3R3v0lut10n_Technik_1_0_Arbeitsstand_0_9_7/Trading_Local/server.mjs`

SHA-256: `f1bd2940bcbaa63056c42cbbc117adc1ad774618f012c0b39da330a5c93c0082`

Zeilen 446–450; Anker in Zeile 447: `if(path.startsWith('/api/bridge/'))`.

Zeilen 487–491; Anker in Zeile 488: `if(path==='/api/hub/reconciliation20')`.

Zeilen 471–475; Anker in Zeile 472: `if(path==='/api/account-live')`.

Zeilen 434–438; Anker in Zeile 435: `if(path==='/mcp')`.

### control

`Th3R3v0lut10n_Technik_1_0_Arbeitsstand_0_9_7/Trading_Local/core/control.mjs`

SHA-256: `9bbd47368f7b5c87a6ab402219f7d5cbc9cd173a7a244dfcbc3da741b897147c`

Zeilen 17–21; Anker in Zeile 18: `export class Control`.

Zeilen 310–314; Anker in Zeile 311: `heartbeat(`.

Zeilen 364–368; Anker in Zeile 365: `ack(`.

### store

`Th3R3v0lut10n_Technik_1_0_Arbeitsstand_0_9_7/Trading_Local/core/store.mjs`

SHA-256: `e7b591605442b95162ad5f760f7ead582f4f2972797d9e8b006967753f414978`

Zeilen 123–127; Anker in Zeile 124: `CREATE TABLE kv`.

Zeilen 143–147; Anker in Zeile 144: `CREATE TABLE snapshots`.

### observation

`Th3R3v0lut10n_Technik_1_0_Arbeitsstand_0_9_7/Trading_Local/core/observation.mjs`

SHA-256: `af52f2ec951f26bed4f1c7c51acf928cb31fe58470619fb16522e1cccdb65ba6`

Zeilen 14–18; Anker in Zeile 15: `observer:v1:state:`.

Zeilen 15–19; Anker in Zeile 16: `observer:v1:latest:`.

Zeilen 165–169; Anker in Zeile 166: `this.store.transaction(()=>{`.

Zeilen 183–187; Anker in Zeile 184: `CORE_RESTART_AWAITING_OBSERVATION`.

Zeilen 104–108; Anker in Zeile 105: `historyAvailable:false`.

### journal

`Th3R3v0lut10n_Technik_1_0_Arbeitsstand_0_9_7/Trading_Local/core/engine-journal.mjs`

SHA-256: `1a56bc2cd9559dea9ac5231db2cab121d6a1c73e03410951390d7693bb63dd93`

Zeilen 19–23; Anker in Zeile 20: `enginejournal:v1:`.

Zeilen 224–228; Anker in Zeile 225: `if(added===0)return`.

Zeilen 226–230; Anker in Zeile 227: `this.store.transaction(()=>{`.

Zeilen 269–273; Anker in Zeile 270: `CORE_RESTART_AWAITING_JOURNAL`.

Zeilen 279–282; Anker in Zeile 280: `plansAreExecutionGrants:false`.

### comparison

`Th3R3v0lut10n_Technik_1_0_Arbeitsstand_0_9_7/Trading_Local/core/reconciliation20.mjs`

SHA-256: `a81776bf38e646462444b687f819fb7814ef65c3c6128f1cbc6a7dd1002e6197`

Zeilen 16–20; Anker in Zeile 17: `const sameAccount=`.

Zeilen 138–142; Anker in Zeile 139: `export function reconcilePositionViews20`.

Zeilen 152–156; Anker in Zeile 153: `engineIsOpenPositionList:false`.

### comparison-reader

`Th3R3v0lut10n_Technik_1_0_Arbeitsstand_0_9_7/Trading_Local/core/reconciliation-read20.mjs`

SHA-256: `9d93d080858478ad3afbe6c65d32fe7513b5682a4999b02be253fac4c049f193`

Zeilen 6–10; Anker in Zeile 7: `export function readReconciliation20`.

Zeilen 12–16; Anker in Zeile 13: `em.id!=='th3rev.ready20.v1'`.

### registry

`Th3R3v0lut10n_Technik_1_0_Arbeitsstand_0_9_7/Trading_Local/core/registry.mjs`

SHA-256: `a4a6b5ca140d2539128d23ff764fd72d9af78ec65f1d035a5932de5d38a3d40e`

Zeilen 12–16; Anker in Zeile 13: `tool('get_bot_observation'`.

Zeilen 13–17; Anker in Zeile 14: `tool('get_bot_journal'`.

Zeilen 14–18; Anker in Zeile 15: `tool('get_bot_reconciliation'`.

Zeilen 48–52; Anker in Zeile 49: `else if(name==='get_bot_reconciliation')`.

### mcp

`Th3R3v0lut10n_Technik_1_0_Arbeitsstand_0_9_7/Trading_Local/core/mcp.mjs`

SHA-256: `b8df5695fd3c953caa68dd3d1be491bbc164e62419724398807c7cc7804ccfcf`

Zeilen 34–38; Anker in Zeile 35: `isError:true`.

Zeilen 32–36; Anker in Zeile 33: `structuredContent`.

### remote

`Th3R3v0lut10n_Technik_1_0_Arbeitsstand_0_9_7/Trading_Local/core/remote-view20.mjs`

SHA-256: `8ace0751f7917d299a843578127a2b832051da463bdbf30723cbbeca5f46fe7c`

Zeilen 8–12; Anker in Zeile 9: `function snapshot(`.

Zeilen 13–17; Anker in Zeile 14: `kind:'paired_observer'`.

Zeilen 18–22; Anker in Zeile 19: `kind:'paired_engine_report'`.

Zeilen 19–23; Anker in Zeile 20: `base.positions=v.positions.map`.

Zeilen 64–68; Anker in Zeile 65: `Persist the slot before transmission`.

### native-observer

`Th3R3v0lut10n_Technik_1_0_Arbeitsstand_0_9_7/Trading_Local/integrations/ctrader-observer20/observer/src/ObserverProtocol.cs`

SHA-256: `3f43284dadb69f47d544d14e8986db60f33efc333c79783a69c6f5fd1ce8bd65`

Zeilen 79–83; Anker in Zeile 80: `public sealed record Observation(`.

Zeilen 95–99; Anker in Zeile 96: `api/bridge/heartbeat`.

Zeilen 98–102; Anker in Zeile 99: `api/bridge/observation`.

### native-journal

`Th3R3v0lut10n_Technik_1_0_Arbeitsstand_0_9_7/Trading_Local/integrations/ctrader-th3revolution20/src/Th3JournalProtocol20.cs`

SHA-256: `979115af3c388cc3aa473de66c5fba76c30c88098286ae4add71de9bdf092eb4`

Zeilen 121–125; Anker in Zeile 122: `public sealed record JournalBatch20(`.

Zeilen 119–123; Anker in Zeile 120: `public sealed record JournalEvent20(`.

Zeilen 123–127; Anker in Zeile 124: `public sealed record JournalReceipt20(`.

Zeilen 249–253; Anker in Zeile 250: `api/bridge/journal`.

### native-outbox

`Th3R3v0lut10n_Technik_1_0_Arbeitsstand_0_9_7/Trading_Local/integrations/ctrader-th3revolution20/src/Th3JournalOutbox20.cs`

SHA-256: `1f7e55be395f9171f8f5f0ceb642e2a74ef443b0de977a3d05744acb9ad8d57f`

Zeilen 22–26; Anker in Zeile 23: `class JournalOutbox20`.

### native-dispatch

`Th3R3v0lut10n_Technik_1_0_Arbeitsstand_0_9_7/Trading_Local/integrations/ctrader-th3revolution20/src/Th3JournalDispatch20.cs`

SHA-256: `e5e46a9538ce8e2f901b340b603ee8205117445f2dd81fee8cbb7eb2967e20ae`

Zeilen 11–15; Anker in Zeile 12: `class`.

### view-projection

`Th3R3v0lut10n_Technik_1_0_Arbeitsstand_0_9_7/Trading_Local/integrations/vercel-view20/lib/projection.mjs`

SHA-256: `091e2d07d413c73022e677ec93e4daa58d3c366e4bd3dd541ea5510a2e3aeff3`

Zeilen 4–8; Anker in Zeile 5: `REMOTE20_INTERVAL`.

Zeilen 22–26; Anker in Zeile 23: `validateRemoteProjection20`.

Zeilen 8–12; Anker in Zeile 9: `sameAccount20`.

### view-http

`Th3R3v0lut10n_Technik_1_0_Arbeitsstand_0_9_7/Trading_Local/integrations/vercel-view20/lib/http.mjs`

SHA-256: `72ce575cdb14e68deaa9e408302996ea3fb940a0f5fd42235bdca18f77e596b7`

Zeilen 13–17; Anker in Zeile 14: `export function createRemoteView20Handler`.

Zeilen 19–23; Anker in Zeile 20: `action==='receive'`.

Zeilen 24–28; Anker in Zeile 25: `action==='snapshot'`.

### view-service

`Th3R3v0lut10n_Technik_1_0_Arbeitsstand_0_9_7/Trading_Local/integrations/vercel-view20/lib/service.mjs`

SHA-256: `04cb153c5bcb0eb1785810b7adf1b12dca63fb7d86d9bb9f219a3f69381b2604`

Zeilen 17–21; Anker in Zeile 18: `export class RemoteView20Service`.

Zeilen 44–48; Anker in Zeile 45: `async receive(`.

Zeilen 54–58; Anker in Zeile 55: `async read(`.

### view-api

`Th3R3v0lut10n_Technik_1_0_Arbeitsstand_0_9_7/Trading_Local/integrations/vercel-view20/api/revolution.js`

SHA-256: `a7cea24ac39ed3bcffa581e7c3caa9aaaff9bdd8e80050fffa670dc256909139`

Zeilen 4–8; Anker in Zeile 5: `createRemoteView20Handler`.

Zeilen 10–14; Anker in Zeile 11: `ifMatch`.

### view-ui

`Th3R3v0lut10n_Technik_1_0_Arbeitsstand_0_9_7/Trading_Local/integrations/vercel-view20/public/revolution.js`

SHA-256: `d22330a2ff7236151db4d36a99a47352186abb2642731fd58c2fc0b7bc4af81f`

Zeilen 15–19; Anker in Zeile 16: `function render(v)`.

Zeilen 21–25; Anker in Zeile 22: `positionCountIsOpenInventory`.

Zeilen 24–28; Anker in Zeile 25: `['Quellzeit',stamp(p.sourceAt)]`.

### legacy-live

`baseline/vercel_recovered/src/api/live.js`

SHA-256: `f57f31f122dfd980ba3dfbc7b6fe935c28ea1ad1fae4fc605ef817ed0f6baac2`

Zeilen 1–5; Anker in Zeile 2: `from '../lib/relay.mjs'`.

Zeilen 10–14; Anker in Zeile 11: `relayRequest(`.

### legacy-socket

`baseline/vercel_recovered/src/api/socket.js`

SHA-256: `6ca57a8034f622e55983a7ca3956ad3a650ce500c4ab1262059f7cba95eefba2`

Zeilen 3–7; Anker in Zeile 4: `from '../lib/storage.mjs'`.

Zeilen 24–28; Anker in Zeile 25: `msg.type==='publish'`.

Zeilen 23–27; Anker in Zeile 24: `msg.type==='snapshot'`.

### legacy-storage

`baseline/vercel_recovered/src/lib/storage.mjs`

SHA-256: `afd0f7747f23d738ee688710f209099dd39fadbde7b5a65c0daabe07ea55931d`

Zeilen 25–29; Anker in Zeile 26: `setSnapshot`.

Zeilen 30–34; Anker in Zeile 31: `latest`.

### legacy-validator

`baseline/vercel_recovered/src/lib/security.mjs`

SHA-256: `ca3a0a1764078861c7c29f640a2d6728b85aa91e663ce129b9e5694fc987387f`

Zeilen 1–5; Anker in Zeile 2: `export`.

