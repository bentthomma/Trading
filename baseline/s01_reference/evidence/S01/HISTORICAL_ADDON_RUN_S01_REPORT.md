# ExtremeLab – S01 Addon-Build-Audit

## Ergebnis und Abgrenzung

Der originale Konto-Addon-Build ist als eigenständige **Zwischenstufe** reproduziert. Sechs erzeugte Dateien stimmen bytegleich mit dem gebundenen Brotli-Payload und dem archivierten Originalpaket 1.3.4 überein. Der tatsächliche `api/account-live.js`-Einstieg lässt sich danach mit seinen echten erzeugten Modulen importieren. Die 26 unveränderten Originaltests laufen auf genau diesen Modulen, mit den bereits archivierten synthetischen Providerantworten.

**Keine zusätzlichen Produktionsinputs wurden wiederhergestellt.** Es bleiben 36 vollständige von 59 gelisteten Originaldateien; 23 sind weiterhin unvollständig oder fehlen. Die sechs Erzeugnisse werden separat unter `baseline/derived_account_stage` aufbewahrt und nicht als zusätzliche Originalinputs gezählt. Ein vollständiger Website-Build, eine Brokerintegration oder eine unabhängige Produktabnahme ist nicht erfolgt.

## Nachvollziehbare Ausgangsbasis

- Vorgänger: `ExtremeLab_S01_EndpointRecovery_Offline.zip`, SHA-256 `269436124048029d40921cbb35d30be254d67e6a4f815761cdee69676a2fdeba`. Unverändertes Archiv im Paket unter `baseline/prior_endpointrecovery.zip`.
- Originales Konto-Addon-Archiv: SHA-256 `6d01f3abb68974f5f6a6289138bb52f21cf6f9275a5fed1d388fe4ee21bc8b1b`, gespeichert als `baseline/original_accountlive134.zip`.
- Produktionsgebundenes `account-addon.br`: SHA-256 `321aa9d5065ade59fc22bac871ea4f2b162c12ade105e3104477a19ae7c88283`.
- Vollständiger Masterplan 1.1.0: SHA-256 `60303e48156a187d065ad66e884398a71853e955a4acc1322ab8d9dd9d97ae7d`. Unverändert.

Die drei Eingabedateien Buildskript, API-Einstieg und Security-Modul sind zusätzlich exakt mit dem Konto-Addon-Archiv abgeglichen. Die Vollquellen werden vor jedem Reproduktionslauf gegen ihre gespeicherten SHA-256 und die providergebundenen SHA-1-UIDs geprüft. SHA-1 ist hierbei ein historischer Quellenidentifikator, keine unabhängige Signatur.

## Neue Quellenabgrenzung: der finale Reader ist nicht belegt

Das vollständige `build-release20.mjs` ordnet `build-ui.mjs` hinter dem Konto-Addon ein. Im authentisiert gelesenen **1500-Byte-Präfix** von `build-ui.mjs` sind acht erlaubte Bundle-Dateien sowie die anschliessenden Seitenkopien sichtbar. Darunter befinden sich:

| Pfad | Nachgewiesene Grenze |
|---|---|
| `lib/ctrader-readonly.mjs` | Das Skin-Bundle schreibt diesen Pfad später erneut. Die erfolgreichen Addon-Tests gelten nicht automatisch für diese fehlenden finalen Bytes. |
| `public/konto-live.html` | Die Skin-Stufe ersetzt die Addon-Seite durch `public/interface.html`. |
| `lib/market-reader.mjs` | Wird erst aus dem fehlenden Skin-Bundle erzeugt; kein zusätzlicher 60. Eingabeinput. |

Die Providerantwort bricht ab; 228 Base64-Zeichen des Buildskripts fehlen. Der Präfix wird nur statisch ausgewertet, niemals ausgeführt oder als vollständige Quelle behandelt. Die beobachtete Bundlebindung lautet `abab24849786a62c367d84913173868afd3e22ad3dcc16d68b9ee3698ed5d37e`; das vollständige Bundle ist weiterhin nicht verfügbar.

Die vollständig vorhandenen Quellen zeigen zudem zwei verschachtelte Buildaufrufe: `build.mjs` importiert `build-bot15.mjs`; `version133.mjs` importiert `build-account-addon.mjs`. Da der Hauptwrapper das Addon danach nochmals als eigenen Node-Prozess startet, wird es auf dem erfolgreichen vollständigen Pfad zweimal ausgeführt. Dies ist ein statischer Aufrufnachweis, kein erfolgreicher Gesamtlauf.

## Gegenprüfungen am unveränderten Originalcode

Die neuen Tests arbeiten mit echten Buildskripten in Wegwerfverzeichnissen, nicht mit einer Ersatzimplementierung des Builds:

1. Ein beschädigtes Addon wird vor jeglicher Dateiveränderung zurückgewiesen. Dieser vorhandene Integritätsschutz funktioniert.
2. Fehlt die Hauptseite, schreibt das Originalskript zunächst alle sechs Addon-Dateien und scheitert erst anschliessend. Exitcode ungleich null bedeutet daher nicht, dass keine Dateien entstanden sind.
3. Eine gezielt blockierte spätere Schreibstelle lässt bereits die erste erzeugte Datei zurück. Der Build ist nicht transaktional. Das ist eine synthetische Dateisystem-Gegenprüfung, keine Stromausfallprüfung.
4. Läuft nach der Ansichtsstufe erneut das Addon, verschwindet deren Link aus der Kontoseite, während er auf der Hauptseite stehen bleibt. Der erneute geordnete Aufruf der vorhandenen Ansichtsstufe stellt den vorherigen geprüften Dateibaum bytegleich her.

Die erfolgreichen Charakterisierungstests **dokumentieren diese Grenzen; sie beheben sie nicht**. Die Reproduktionswerkzeuge verwerfen fehlgeschlagene temporäre Arbeitsstände, statt vorhandene Dateien als erfolgreichen Build zu übernehmen. Kein ursprüngliches Produktskript wurde verändert.

## Prüfungen und Zählweise

Der konsolidierte Vorverpackungslauf bestand mit 55 unterschiedlichen Testmethoden: 26 archivierte Originaltests, neun neue Build-/Provenienztests und 20 bestehende S01-Inventarregressionen. Zwei gezielte Veränderungen an temporär erzeugten Readerkopien – Entfernen der Lese-Whitelist im unteren Requestpfad und der Besitzerbindung des verschlüsselten Cookies – wurden von den unveränderten Originaltests erkannt. Diese Mutationen werden nicht zur Testzahl addiert.

Für die endgültige ZIP-Fassung ist ausschließlich die **separate** `ExtremeLab_S01_AddonBuildAudit_Abschlusspruefung.json` samt frischen Prüfprotokollen maßgeblich. Das Paket enthält keinen selbst behaupteten zukünftigen Testlauf. Nach den Originaltests wird zusätzlich geprüft, dass alle sechs erzeugten Modul-/Dateibytes unverändert geblieben sind.

Ausführung: Linux, Python 3.13.5, Node 22.16.0; die Endprüfung ist unter einem Benutzer ohne Administratorrechte vorgesehen. Alle Testkindprozesse erhalten eine Linux-seccomp-Sperre für `connect`, `sendto`, `sendmsg` und `sendmmsg`, die ein eigener EPERM-Gegenversuch überprüft. Keine allgemeine Sandbox-Zertifizierung. Reale ESM-Imports, Kryptografie und Builddateien; synthetische Transportantworten und synthetische Zugangsdaten aus den Originaltests. Kein HTTP-/WebSocket-Server, kein cTrader-/Brokerkontakt und kein nativer Botstart.

Die 78 Tests der vorherigen EndpointRecovery und die historischen C#-/Hub-Testergebnisse wurden nicht wiederholt und zählen nicht als aktuelle Tests. Der historische gzip-q=0-Befund bleibt offen und wurde hier weder korrigiert noch erneut geprüft.

## Quellenzugriff und verbleibende Fähigkeiten

Vier konkret materialisierte Archive mit zusammen 112 regulären Mitgliedern wurden gegen die vollständigen SHA-1-UIDs der 23 fehlenden Inputs abgeglichen: keine zusätzlichen Treffer. Dies ist eine begrenzte Raw-Member-Prüfung, kein vollständiger Ausschluss aller eingebetteten Quellen oder externen Ablagen. Die großen Inhaltsantworten bleiben abgeschnitten; die versuchten statischen Downloads gelangen nicht. Keine neue Freigabe-URL wurde erzeugt. Suchumfang und Fehler sind in `S01_SOURCE_ACCESS_BOUNDARIES.json` dokumentiert.

Die fünf bestehenden S01-Lieferdateien sind fortgeschrieben, ohne Versionslinien oder offizielle Zustände zusammenzulegen. `S01_CAPABILITY_MATRIX.json` unterscheidet nun ausdrücklich: gesicherte Inputs, reproduzierte Zwischenstufe, fehlende finale Readerbytes, komplette Websitepipeline und native Integrationen.

**Nach S01-C02 können fehlende Originale als `blocked_capability` dokumentiert werden; das Inventar muss nicht endlos auf sie warten.** Das ist keine Freigabe der fehlenden Integration und kein ausgeführter offizieller Planabschluss.

## Projektstatus und konkrete Fortsetzung

Der lesende GitHub-Abgleich dieses Aufrufs ergab weiterhin `main = 1a5cfe9d3139276f5432c79a8ee0be1938b7066c`, einen vollständigen Baum nur mit `README.md` und `protected=false` in der Branchantwort. Workflow- und PR-Listen wurden nicht erneut abgefragt. Das ausgewählte vorhandene Vercel-Deployment wurde als READY gelesen; es wurde weder verändert noch neu veröffentlicht.

Nächster Quellenbedarf bleibt ein vollständiger Export des gebundenen Live-Overlays, der neun Skin-Segmente und der übrigen fehlenden Inputs. Sobald diese Bytes verfügbar sind, zuerst ihre UID-/SHA-Bindung prüfen, dann die komplette unveränderte Pipeline in einem neuen Arbeitsverzeichnis ausführen und den **finalen**, nach Skin geschriebenen Reader gegen seine echten Exporte und Handler prüfen. Nicht die hier geprüften 1.3.4-Module als Ersatz einsetzen. Ohne neue Vollquelle dieselben abgeschnittenen Abfragen nicht als Fortschritt wiederholen.

Die private S01-Inventararbeit und dieses Build-Audit sind überprüfbar übergeben; formale Gatezustände, Masterplan und Produktquellen bleiben unverändert. Keine Veröffentlichung, GitHub-Schreibaktion oder Brokeraktion.
