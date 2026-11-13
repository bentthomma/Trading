# ExtremeLab – S07: Teil6-Originaldaten, Quellenbindung und echte Qualitätsgrenzen

## Ergebnis und Umfang

Basis ist die letzte belegte S04-Revision `e69a917a5cac207d0c9f88a2a98f69bf56d524b1`. Der aktive Masterplan 1.2.0, alle bisherigen Produkt-/Quellenbytes und sämtliche formalen Status bleiben unverändert. Dies ist ein neues, zusammenhängendes privates S07-Vorbereitungspaket, keine vorgezogene Freigabe des gesamten Schritts.

Geprüft wird das tatsächlich in der Bibliothek wiedergefundene `Adaptive_Trading_Lab_Teil6.zip` (264.138.803 Bytes, SHA-256 `cf2dd5842c6a22a15e82f6d19d7c16cf404d6b613640289dfe663e525bcdef3d`). Es enthält 753 Mitglieder: 240 Krypto-Monats-ZIPs samt 240 CHECKSUMs und Metadaten, 22 EURUSD-Monats-ZIPs, einen separat verworfenen EURUSD-Piloten und zugehörige Dokumente/Tabellen. Keine ursprüngliche Transformationsquelldatei ist in diesem Teilarchiv enthalten. Der neue Auditor ist eine unabhängige Datenprüfung plus ausdrücklich neuer Ableitungsschritt, kein vorgetäuschter Lauf des alten Transformcodes und kein zweiter Produkt-/Handelscontroller.

## 1. Krypto-Rohdaten: vollständiger Originalabgleich

Alle 175.240 Rohkerzen von BTCUSDT, ETHUSDT, BNBUSDT und SOLUSDT wurden gelesen. Die 240 Monatsarchive stimmen mit ihren archivierten Prüfsummen, Metadaten, Größen und dem Gesamtinventar überein. CSV-Spalten, kalendarische Monatseinordnung, Zeitraster, Reihenfolge, Duplikate, endliche Dezimalwerte, positive Spotpreise, OHLC-Beziehungen und Teil-/Gesamtvolumina werden geprüft.

Der tatsächlich archivierte Formatwechsel wird eingehalten: Millisekunden bis Ende 2024, Mikrosekunden ab Januar 2025. Die Zeiteinheit wird aus der versionierten Monatsspezifikation gewählt und am Monatsbereich geprüft; es gibt kein stilles Raten nach Zahlenlänge.

Die historischen Qualitätsbefunde sind neu reproduziert:
- Je Symbol 43.810 Rohzeilen, 14 fehlende Originalstunden und fünf nach der vorhandenen Regel ausgeschlossene Zeilen.
- Zusammen 20 Quarantänezeilen; jede ist auf Originalarchiv, CSV-Mitglied und physische Zeile zurückführbar.
- Gemeinsame Open-Tabelle: 43.805 Zeitpunkte statt 43.824 erwarteter Stunden; 19 fehlende Stunden. Keine Interpolation.

Die Quarantäne ist eine explizite Auswahlregel: abweichende Schlussdauer oder kein Trade-/Volumeneintrag. Sie bedeutet nicht, dass jede solche Rohzeile per se erfunden wäre. Ursachen wie Wartung oder Handelsunterbrechung sind hier nicht unabhängig belegt. Zeitrasterprüfung ist kein Nachweis historischer Tick-/Lotfilter.

## 2. Neue Erkenntnis: Open-Tabelle ist nicht dezimal exakt

127.623 von 175.220 Preistexten der ursprünglichen Open-Tabelle unterscheiden sich im exakten Dezimalvergleich von den Rohpreisen. Beispiel: Quelle `28923.63000000`, alte Tabelle `28923.630000000001`. Maximale absolute Differenz: `0.00000000001` USDT.

Alle Werte ergeben bei erneuter Umwandlung denselben Float64-Wert wie die Originalpreise. Damit ist die Abweichung in diesem Test vollständig als Darstellungs-/Konvertierungsproblem eingegrenzt, nicht als nachgewiesene wirtschaftliche Verlustursache. Es wird keine höhere Profitabilität durch die Korrektur behauptet.

Eine **zusätzliche, versionierte** Tabelle bewahrt deshalb die originalen Preiszeichenketten. Die vorherige Tabelle und frühere Runs bleiben unangetastet. Alle 175.220 neuen Werte werden gegen die jeweils richtige Originalzeile geprüft. `point-lineage.csv` enthält pro Zeitstempel/Quellmonat die vier CSV-Zeilennummern; `crypto-source-files.json` liefert die zugehörigen Archiv-/CSV-Hashes. Rohquelle, Prüf-/Transformcode, neue Tabelle und Zeilenverzeichnis bestimmen die neue Dataset-ID. Geänderte Quellen oder Transformversionen erhalten eine neue Identität; vorhandene Ausgabeverzeichnisse werden nicht überschrieben.

Die Auswahl ist rückblickend: Schlussdauer und Gesamtvolumen einer Kerze stehen nicht schon bei deren Eröffnung fest. Die gefilterte Tabellenmitgliedschaft erhält deshalb ausdrücklich **keine Point-in-Time-Freigabe** für Onlineentscheidungen. Die exakte Tabelle bleibt Open-only. Sie belegt weder intrabar Preisfolgen noch Stopfills, ausführbare Bid/Ask-Quotes oder aktuelle Brokerpreise.

## 3. EURUSD: sämtliche 22 Monatsdateien statt Stichproben

40.674.799 Zeilen für Februar 2024 bis November 2025 wurden vollständig gelesen. Kein ungültiges Zeit-/Zeilenformat, kein nichtpositiver Bid/Ask und kein Ask unter Bid wurde in dieser Hauptkohorte gezählt. Die tatsächlichen Original-CSV-Hashes und beigefügten Statusdateien sind pro Monat gebunden.

Ein relevanter Originalfehler bleibt offen:

| Originaldatei | Physische Zeile | Original-Zeitstempel |
|---|---:|---|
| DAT_ASCII_EURUSD_T_202510.csv | 1.185.416 | 20251026 195958437 |
| dieselbe Datei | 1.185.417 | 20251026 190000248 |

Der Rücksprung beträgt 3.598.189 Millisekunden. Innerhalb dieses Tages treten außerdem 1.494 nicht benachbarte Wiederholungen auf, die auch hinsichtlich der gesamten Originalzeile identisch sind. Eine bloße Prüfung benachbarter Duplikate hätte diese Wiederholungen nicht gefunden.

Der Oktober-2025-Teil und damit der ungeändert zusammengesetzte Tick-Replaykandidat bleiben quarantänisiert. Keine automatische Sortierung, Spaltenvertauschung, Zeitverschiebung oder Deduplikation wird vorgenommen. Eine neue kuratierte Teilversion wäre ein eigener belegter Transformschritt, nicht eine rückwirkende Korrektur alter Runs.

Die Providerbeschreibung nennt fixe EST ohne Sommerzeitkorrektur. Der beobachtete Rücksprung wird **nicht** ungeprüft als Sommerzeitfehler erklärt. UTC-Grenzzeiten im Bericht sind Ergebnisse dieser dokumentierten festen Offsetregel, keine unabhängige Zertifizierung der tatsächlichen Ereigniszeit.

Alle Volumenfelder der Hauptkohorte sind null. Laut Provider wird Handelsvolumen nicht geliefert: Das Feld ist fehlende Information, nicht der Nachweis von null Marktaktivität oder verfügbarer Ausführungsliquidität. 7.350 Zeitabstände über 60 Sekunden sind beobachtet; ohne bestätigten Session-/Feiertagskalender sind dies nicht pauschal 7.350 Datenfehler. Innerhalb jedes Tages werden alle Zeitstempel auf Wiederholungen geprüft; es wurden keine rückwärts wechselnden Kalendertage festgestellt. Monatsgrenzen sind separat ausgewiesen.

## 4. Verworfener Pilot bleibt getrennt

Die zusätzliche Januar-2004-Datei enthält 941.613 Zeilen. Nach der dokumentierten Bid/Ask-Spaltenfolge liegen in 941.593 Zeilen Askwerte unter Bid; die übrigen 20 sind gleich. Der bereits verworfene Pilot wird nur zur Nachprüfung seines Ausschlusses gelesen. Es werden weder seine Spalten still vertauscht noch seine Zeilen zur 2024/2025-Kohorte addiert. Kein freigegebenes historisches Replay wird daraus abgeleitet.

## 5. Register, Eignung und verbleibende Quellen

Die vier vorgesehenen S07-Lieferdateien liegen im Paket vor: `dataset-registry.json`, `data-quality-report.json`, `rights-matrix.md`, `coverage-grid.json`. Roh-OHLCV, alte Float64-Open-Tabelle, neue exakte Open-Tabelle, FX-Hauptkohorte, Pilot und synthetische Gegenfälle sind unterschiedliche Produkte. Monatsportfolios sowie breite Aktien-, Gold-/Silber- und weitere FX-Historien fehlen im **untersuchten Teil6-Archiv**. Es wird nicht behauptet, dass sie in sämtlichen anderen Bibliotheksarchiven fehlen.

Der Kompatibilitätsprüfer weist Open-only bei Intrabar-Stopversuchen, Monatsrenditen bei Minutenmodellen sowie fehlende oder quarantänisierte Daten zurück. Er prüft eine Katalogrelation, ist keine Zugangsberechtigung und erzeugt keine Order. Historische Instrument-/Brokerzuordnung, Tick-/Lotfilter, Kalender, Corporate Actions und Nutzungsrechte bleiben dort offen, wo kein Originalnachweis vorliegt. Negative Futurespreise sind ausdrücklich nicht mit dem Positivitätsvertrag dieser Spot-/FX-Quellen gleichgesetzt.

## 6. Tatsächliche Prüfgrenzen

Die neuen Methoden prüfen den Auditor, vollständige Originalpunkt-Zuordnungen, echte Datenfehler und gezielte synthetische Gegenfälle. Vorhandener Controller und Git-Collector prüfen den tatsächlichen neuen Dateidiff. Es gibt keinen neuen Backtest, keine C#-Kompilation und keine Broker-/Websiteaktion.

Bei der kritischen Nachprüfung wurde die Zeit-Duplikatprüfung von nur benachbarten auf alle Zeitstempel innerhalb jedes Tages erweitert. Zusätzlich wurde die Quellenhashbindung der vorherigen Zeile am Rücksprung auf vollständige Rohbytes statt Zeilenende-bereinigte Bytes präzisiert. Die endgültige frische Prüfung muss genau diese Fassung ausführen. Vorbereitungsdurchläufe und historische Testzahlen werden nicht addiert.

Die vollständigen Befehle, tatsächlich ausgeführten Methoden, Mutationen und Paketprüfungen stehen im separat erzeugten frischen Endnachweis. Ein bestandenes Audit bedeutet, dass der Bericht einschließlich seiner gefundenen Datenfehler reproduzierbar ist – nicht, dass alle Daten für Handel oder Replay freigegeben sind.

## 7. Fortsetzung

Das Teil6-Paket ist untersucht; es muss ohne neue Hypothese nicht erneut vollständig gesucht oder profiliert werden. Nächster unabhängiger S07-Block: die konkret genannten Master-Labor-Monatsportfolios und deren Original-Transformationsquellen bergen, ihre Einheiten/Zeiträume/Versionen prüfen und in dasselbe Register ergänzen. Der EURUSD-Oktober-Konflikt bleibt ein gesonderter, quellengebundener Korrekturauftrag. Formale Integration folgt erst auf die weiterhin offenen S02-Nachweise.

Keine neue Reviewerpflicht; keine Änderung von Masterplan, Gates oder bisherigen Abschlüssen; keine Datenkäufe, Veröffentlichung oder Brokeraktion.


## Nachfolgende Ergänzung: Master-Labor-Monate

Der historische Teil6-Bericht oben bleibt unverändert in seinen Befunden. Der fehlende Monatsbestand wurde im nächsten Arbeitspaket gezielt geborgen; die aktuelle Ergänzung steht in `master-monthly/technical-report.md`. Sieben erhaltene Ableitungen sind nun in den gemeinsamen Katalogen registriert. Die vollständigen Anbieter-Roh-ZIPs fehlen weiterhin. Die historische Aussage „Master-Labor nicht geprüft“ oben beschreibt nur den vorherigen Teil6-Lauf.
