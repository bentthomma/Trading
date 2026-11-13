# ExtremeLab · S01 SnapshotConsumerGuard

13. November 2026 · privater Ein-Dateien-Vorschlag, keine Installation

## Ergebnis und präzise Quellenabgrenzung

Der archivierte Journalrenderer kann strukturell ungültige BARS-Kerzenpayloads
übernehmen und dann beim Lesen/Zeichnen scheitern. Bei einem gültigen Snapshot
geht außerdem dessen Unvollständigkeitsdiagnose im Originalimport verloren.
Beide Fälle sind in echtem Chromium am Originalcode reproduziert.

Der neue Vorschlag korrigiert ausschließlich eine separate Kopie von
`baseline/recovery_donors/expected_patched_app.js`. Diese vollständige
Zwischenstufe lässt sich mit dem unveränderten originalen `patch_ui.mjs` aus
`baseline/derived_assets/public/app.js` bytegleich erzeugen. Sie ist NICHT
der fehlende finale Skin-/Live-Client. Die neue Verbindung verwendet sein
vorhandenes Journalimportinterface, keinen behaupteten bestehenden Live-Poller.
HTML, CSS, Layout und Strategien bleiben unverändert.

Der neue Quellabgleich liefert keine zusätzlichen Websiteinputs: **38/59,
21 fehlen**. Vier zugängliche Originalarchive wurden geprüft, keine vollständige
finale Snapshot-Verbraucherquelle gefunden. Die öffentliche statische Abfrage
scheiterte; das beweist keine Abwesenheit der Ressourcen. Bibliothekssuche und
Listings waren partiell. Einzelheiten und Archivehashes in
`evidence/S01/S01_CONSUMER_SOURCE_ACCESS.json`. Nicht erneut derselbe gekürzte
Vercel-Dateiabruf. Keine historische Benutzerdatei als Testdaten verwendet.

## Fehler und minimale Korrektur

1. **Ungültige Kerzenstruktur:** Die reale SQLite-Projektion des bestehenden
   Pythonrelay-Vorschlags liefert Rohereignisse und Diagnose. Das Original-UI
   übernimmt die Ereignisse; bei `candles:42` meldet der Renderer
   `number 42 is not iterable`. Der korrigierte Pfad zeichnet solche Payloads
   nicht, bewahrt aber sämtliche ursprünglichen Ereignisse inhaltlich unverändert.
   Listen mit Nichtobjekten werden als ganzer ungültiger Chunk behandelt.
   Direkte Kerzenlisten in DECISION sowie einzelne BAR-Objekte erhalten
   dieselbe begrenzte Strukturprüfung. Keine vollständige OHLC-/Zeitprüfung.
2. **Verlorene Diagnose:** Der Originalimport übernimmt `events`, verwirft
   aber `partialSnapshot` und `checkpoint`. Der Vorschlag übernimmt einen
   normalisierten, klar begrenzten Diagnosesatz in `meta.snapshot`. Der bestehende
   Datenqualitätbereich zeigt Snapshot-Ausschnitt, unvollständigen/unklaren
   Antwortumfang, Checkpointstatus und ungültige Ereignissequenzen an. Die
   Diagnose wird als Text escaped, nicht als aktives HTML übernommen.
3. **Analyseexport/-reimport:** Der vorhandene vollständige Analyseexport behält
   Diagnose und Rohereignisse. Sein Kennzeichen `imported_journal_not_live` bleibt
   erhalten. Ein echter Browser-Blobdownload und erneuter Import prüfen die
   Rundreise. Das ist KEIN signierter Herkunftsnachweis; vom Nutzer gelieferte
   Metadaten bleiben untrusted. Der separate Entscheidungs-/Notizexport wird
   nicht zu einem neuen allgemeinen Snapshotformat umgebaut.

Ein vollständiger Checkpoint wird nicht mit einer vollständigen Antwort
gleichgesetzt: Ein tatsächlicher Größenlimitfall mit dem unveränderten
Relaylimit bleibt ausdrücklich partiell. Unbekannte Vollständigkeit bleibt
`null`. Ein neuer gültiger Checkpoint beziehungsweise ein normaler Journalimport
setzt alte Warnungen zurück; das Rohjournal wird nicht bereinigt oder geändert.

## Tatsächlicher Prüfpfad

**Realer SQLite-Store → originale Snapshotprojektion aus dem vorhandenen
Relayvorschlag → JSON-Import des archivierten Renderers → echter DOM →
echter Blobdownload → erneuter Import.**

Es gibt keinen Fake-DOM, keinen nachgebauten Renderer und keine Datenbankattrappe.
Der Test ruft die vorhandene Storeprojektion direkt auf. HTTP/WebSockettransport
war Gegenstand des vorherigen Pakets und wurde hier NICHT erneut behauptet.

Der Browser läuft auf `about:blank`; das Original-HTML erhält zur Isolation
keine externen Script-/Stylesheetimporte. Das vollständige echte App-Script
wird geladen. Der Test zeigt nur den lokalen Renderercontainer, nicht einen
produktiven Login. Das ist eine Funktions-/DOM-Prüfung, keine visuelle Abnahme
und kein Nachweis der Website-Navigation. So konnte der frühere
Navigationsblocker umgangen werden, ohne Schutzmaßnahmen der Produktionsseite
zu ändern oder fremde Authentisierung zu umgehen.

Alle Testprozesse laufen unprivilegiert. Vor Start der Browser-/Node-Kinder
verbietet der geerbte seccomp-Filter andere Socketfamilien als AF_UNIX.
Playwright blockiert zusätzlich alle Requests; jede Browsermethode prüft
null Netzwerkrequests und null unaufgefangene Seitenfehler. Chromium benötigt
hier `--no-sandbox`: Die Isolation beruht deshalb auf unprivilegiertem Prozess,
Netzwerkfilter und ausschließlich synthetischen Testdaten, nicht auf einer
behaupteten Chromium-Sicherheitsabnahme. Keine Broker- oder Kontoanbindung.

## Verifizierte Fälle und kritische Gegenprüfung

Die neue Suite enthält 14 Browsermethoden und 2 Quellenmethoden. Sie prüft
gültige und ungültige Payloads, gemischte Chunks, Größenlimit, unbekannten
Checkpoint, Export/Reimport, Erholung, HTML-Escaping der Diagnose, normalen
Journalimport, leere Snapshots sowie bisherige Replay-/Duplikat-/Lücken- und
Positions-/Fehlersperrenanzeige. Unterfälle werden nicht als Methoden addiert.

Zwei Gegenläufe mit den unveränderten Originalbytes müssen gezielt scheitern:
Iteratorfehler und fehlende Snapshotmetadaten. Drei temporäre Mutationen nehmen
jeweils Strukturprüfung, Diagnoseimport oder Exportbindung zurück. Sie müssen
an konkreten Verhaltensaussagen scheitern, nicht an Hashprüfungen; der Runner
verlangt auch die passende Fehlerdiagnose. Paketproben testen zusätzlich
veränderte Bytes, unerwartete Datei und Symlink. Ein nativer Patchrundlauf muss
exakt ursprüngliche beziehungsweise vorgeschlagene Bytes rekonstruieren.

Der vollständige neue Prüflauf führt zusätzlich die vorhandenen 12+8
Inventarmethoden aus. **36 unterschiedliche Methoden**, keine erneut
gezählten Relay-/Encodingregressionen. Die beiden erwarteten Originalfehler,
drei Mutationen und drei Paketproben gehören nicht zu dieser Erfolgszahl.

Die Entwicklungsprüfung der 16 neuen Methoden bestand. Maßgeblich für den
Endstand ist ausschließlich die externe Abschlussprüfung nach frischem
Entpacken des endgültigen ZIP. Das interne Dokument ersetzt diesen Nachweis
nicht und markiert keine unabhängige Abnahme als erteilt.

## Erhaltung und verbleibende Grenzen

Vorgängerarchiv SHA256: `58a172d87232d80a0951f3e0ca65d7f5f4b0d30681492509c61e411e6d61d5f0`
Originalrenderer SHA256: `54c83b34deba050a30ed45c51d0b5a6cdb04a47513940ec2deb6f855179f7127`
Vorschlag SHA256: `8ee1a7a5701cbc662edcbeaed5130dd7e6b4f4124efc1472ea022c06936ab8af`
Unveränderter Relayvorschlag SHA256: `7882cac35c82f994d6c0725fc94ca71cce264a73cc7fcc5dfebd55abbbc62e5a`

Alle 302 Vorgänger-Manifestdateien bleiben direkt oder im Checkpoint
`baseline/relay_guard_checkpoint/` rekonstruierbar. Die bisherigen 38
Produktionsinputs und ihre Katalogbindung, beide alten Vorschläge, der
Masterplan und `GATE_STATUS.json` bleiben bytegleich. Die fünf S01-Lieferdateien
erhalten einen getrennten Ergänzungsblock; ihre vorherigen Bytes bleiben
im Checkpoint erhalten. Historische Inventarzähler werden nicht als aktuell
ausgegeben. Die genaue Rekonstruktionsliste steht in
`evidence/S01/S01_CONSUMER_PRESERVATION.json`.

Die Strukturprüfung macht nicht jedes beliebige Schema korrekt, authentisiert
keine Diagnosen, prüft keine Preise/Zeitstempel vollständig und repariert keine
anderen Ereignistypen. Fehlerhafte Rohereignisse bleiben absichtlich vorhanden.
Der originale Import ist nicht zu einer generell atomaren Transaktion umgebaut.
Der vollständige finale Website-Verbraucher, JavaScript-Relay und Skin-Build
fehlen weiterhin; diese 21 Inputs werden nicht durch den archivierten Renderer
ersetzt. Kein vollständiger Website-Build, keine Live-/Cloud-/Windows-Abnahme,
keine C#-Kompilation und kein Botstart in diesem Lauf.

## GitHub und nächster konkreter Schritt

Nur lesender Connectorabgleich: `main=1a5cfe9d3139276f5432c79a8ee0be1938b7066c`,
vollständiger Baum nur README, Branchantwort `protected=false`. PR-/Workflow-
listen wurden nicht erneut abgefragt. Keine GitHub-Schreibaktion.

Das Ein-Dateien-Paket ist als isolierter Korrekturvorschlag vorbereitet.
Nächster Integrationsnachweis: vollständige Originalbytes des tatsächlichen
finalen Snapshotclients/JavaScriptrelays beschaffen und dessen Behandlung der
Diagnose prüfen. Die jetzt geprüfte importbasierte Zwischenstufe darf nicht
als live integrierte Endfassung bezeichnet werden. Keine zweite Relay- oder
Consumerimplementierung auf Basis fehlender Suffixe erstellen. Formalstatus
und Masterplan bleiben unverändert. Installation und unabhängige Prüfung
bleiben separat erforderlich, nicht durch erfolgreiche Browsermethoden ersetzt.


## Korrektur des neuen Prüflaufs vor Übergabe

Die erste frisch entpackte Prüffassung bestand alle 36 normalen Methoden,
stoppt aber korrekt an ihrer neuen Mutationserwartung: Nach Entfernung des
Arrayguards meldet Chromium `ev.data.candles is not iterable`, nicht den
etwas anders formulierten Iteratorfehler des unveränderten Originalcodes.
Der Verhaltenstest hatte den eingebauten Fehler bereits erkannt. Nur die
exakte erwartete Diagnose im neuen Runner wurde berichtigt. Produktvorschlag,
Originalcode und Tests wurden dafür nicht gelockert oder verändert. Diese
vorläufige Gesamtausführung wird nicht als bestanden gezählt. Die endgültige
ZIP-Fassung wird vollständig frisch erneut geprüft; der externe Endbeleg
enthält beide Abläufe getrennt.
