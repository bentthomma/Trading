# Tatsächlicher Konfigurations- und Quittungsweg

Beschreibende Ist-Karte mit isoliertem Fristvorschlag. Quelle: Plattform 0.9.7, nicht eine neue Zielarchitektur. Die Datei- und Fragmenthashes stehen in `evidence/S01/control-ack-audit/source-bindings.json`.

| Übergang | Tatsächlicher Consumer/Producer | Bindung und Speicher | Nachweis |
|---|---|---|---|
| Agent -> Vorschlag | MCP `preview_configuration_change`, `core/registry.mjs` -> `Control.propose` | Autorisierung, erwartete Revision, Anfragekennung; `proposals` und `bots.desired` in SQLite | C05; keine direkte Bestätigung durch Agent |
| Mensch -> Bestätigung | `POST /api/hub/proposals/{id}/confirm` -> `Control.confirm` | Digest, Runtime, Konto, gelesene tatsächliche Revision, Demo-Testprofil und ausdrückliche aktuelle Freigabe | C04–C06; keine Brokerfreigabe dieser Testausführung |
| Hub -> Bridge | `POST /api/bridge/heartbeat` -> `Control.heartbeat` | Token/Profil, Instanz, Sequenz, Werte, Auftragsablauf; Auslieferungsmarker | C01/C03/C04/C13/C17 |
| Native Übernahme | `sdk/HubBridge.cs` -> Dispatcher -> `ApplyForNewTrades` + Readback | Exakt dieselbe Runtime-Operation; neue Revision und Werte müssen übereinstimmen | Nur Quellenabgleich C15; keine native Ausführung |
| Bridge -> Hub | `POST /api/bridge/ack` -> `Control.ack` | Kommando-ID, Runtime, Revision, Digest, Werte und Auslieferungsbeleg | C06/C10/C11/C16 |
| Datenbankneustart | `new Control(store)` | pending -> timed_out/CORE_RESTART; disconnected; policy blocked | C07/C08/C09 |
| Spätquittung | `Control.ack` | Altes tatsächliches Ergebnis kann reconciliert werden, Freigabe bleibt separat | C02/C07/C12/C14 |

## Statusbegriffe nicht zusammenziehen

`revision` zählt den gewünschten Stand, `actualRevision` den zuletzt akzeptierten Laufzeitstand. `proposed`, `pending`, `applied`, `rejected` und `timed_out` sind verschiedene Auftragszustände. `timed_out` bedeutet keine Bestätigung; es bedeutet weder „sicher nicht angewandt“ noch „erneut anwenden“. Ein Heartbeat ist auch dann keine Ersatzquittung, wenn er bereits die angeforderten Werte meldet.

`releaseApproved` und die globale Policy sind andere Größen als ein abgeschlossenes ACK. Die Tests setzen Freigaben ausschliesslich in synthetischen lokalen Testdatenbanken; sie erteilen keine Freigabe für Nutzerkonten oder Bots. Ein Neustart beziehungsweise Token-/Runtimewechsel bleibt gesondert gesperrt.

## Zeitvertrag des isolierten Vorschlags

Ablauf ist inklusive: `expiresAt <= now` ist abgelaufen. Eine auszuliefernde Antwort enthält nur bei `expiresAt > responseTime` einen Auftrag. `responseTime` wird für Auswahl und Metadaten einmal erfasst. Nach diesem Entscheidungszeitpunkt kann Zeit vergehen; die native Prüfung bei tatsächlicher Anwendung bleibt unverzichtbar. Die in C17 injizierte Zeitbewegung beweist bewusst **nicht**, dass der Auftrag im nativen Callback noch gültig wäre.

## Offene Ablehnungssemantik

Positive ACK-Duplikate ändern eine neuere tatsächliche Revision nicht zurück. Negative ACK-Duplikate sind dagegen an den aktuellen Botwertestand gebunden, nicht an den ursprünglichen Ablehnungspayload. C16 macht diese begrenzte Abweichung sichtbar. Es wurde dabei kein neuer Anwendungseintrag und keine neue Steuerfreigabe erzeugt. Ein Dauerbeleg oder Migrationsvertrag wird in diesem Paket weder implementiert noch aktiviert.
