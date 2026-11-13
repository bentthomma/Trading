# S01 – Quelleninventar konsolidiert und nachgeprüft

**Arbeitskennung:** S01-INVENTORY-CONSOLIDATION  
**Basis:** ExtremeLab_S01_SnapshotConsumerGuard_Offline.zip  
**Basis-SHA-256:** `80e603e63abd663c27199179662e08b8be28cc77fc6c36919d5e92d4f3e760ff`

## 1. Konkreter Fehler und Korrektur

Im Vorgänger widersprachen mehrere als aktuell bezeichnete Felder dem tatsächlichen Quellenbestand. Der Reproduktionsbericht nannte 36 vorhandene und 23 fehlende Dateien; seine Begründung sprach noch von 31/59. Auch die offenen Lücken, die Donormatrix, die Pfadzuordnung und die führende Versionstabelle enthielten veraltete Zahlen.

Der neue lesende Prüfer reproduziert **acht operative Widersprüche** am unveränderten Vorgänger. Die fünf S01-Lieferdateien sind jetzt auf denselben hashgebundenen aktuellen Index abgestimmt. Die Originalfassungen wurden vor der Bearbeitung vollständig gesichert.

Historische Ausführungsblöcke mit Namen wie `current_*` sind nun ausdrücklich historisch eingeordnet. Frühere Testzahlen werden nicht als Ergebnisse dieses Laufs ausgegeben. Zwei bereits vollständig wiederhergestellte Dateien besitzen außerdem nicht länger ein missverständliches `blocked_capability`-Quellenlabel: Quelle und Integrationsfähigkeit sind getrennte Angaben.

Der Gatecheckpoint enthält weiterhin seinen alten Quellenzähler. Er wurde **nicht verändert**. Seine historischen Mengenangaben werden nicht als aktuelles Inventar verwendet; seine formalen Sperren bleiben bestehen.

## 2. Tatsächlicher Quellenstand

| Klasse | Anzahl | Bedeutung |
|---|---:|---|
| Vollständige Originalinputs | 38 | Tatsächliche Bytes stimmen mit Provider-UID und dokumentiertem SHA-256 überein. |
| Nur Präfixzugriff | 5 | Abgeschnittene Quellinhalte sind zugänglich; keine vollständige Datei ist bestätigt. |
| Nur Metadaten | 16 | Quellpfad und Provider-ID sind bekannt, aber keine vollständigen Bytes gesichert. |
| Gesamt | 59 | Weiterhin 21 fehlende Vollquellen; keine neue Produktionsquelle in diesem Lauf. |

Der erneute Abruf von `lib/relay.mjs` blieb abgeschnitten. Er wird deshalb als Präfixzugriff, nicht als wiederhergestellte Vollquelle klassifiziert. Fehlende Dateien werden nicht durch Platzhalter ergänzt.

Das zusätzliche Originalarchiv des Dashboards wurde einschließlich seiner komprimierten Nutzdaten untersucht. Seine fünf Premiumsegmente ergeben sechs manifestgebundene Dateien. Weder diese Ausgaben noch die Archivmitglieder passen zu den fehlenden Produktionsinputs. Der Bundlehash unterscheidet sich vom benötigten Skinhash. Der Builder wurde nicht ausgeführt; dies war Quellenanalyse, keine Designimplementierung.

Vier historische Originalarchivangaben im `baseline-lock` sind in diesem Paket nicht als Vollarchiv enthalten. Sie sind jetzt ausdrücklich historische Quellenrecords. Daraus folgt nicht, dass die Archive in allen externen Ablagen fehlen. Vier weitere dort genannte Originalarchive sind vollständig eingebettet und hashgeprüft. Die Bibliothekssuche war partiell, nicht vollständig.

## 3. Produktions- und Entwicklungsstand

Der Produktionsalias `extremelab-bt.vercel.app` wurde ausschließlich lesend geprüft. Er zeigt weiterhin auf `dpl_6AuCdiuxGSFKnF7svRpykB7XRAmp`.

GitHub `main` bleibt bei `1a5cfe9d3139276f5432c79a8ee0be1938b7066c`; der vollständig gelesene Baum enthält nur `README.md`. Der private Entwicklungsstand ist dieses Dateipaket, **kein nachgewiesener installierter Git-Entwicklungszweig**. PR- und Workflowlisten wurden in diesem Aufruf nicht erneut abgefragt.

## 4. Prüfumfang und Gegenfälle

Die 20 neuen Inventartests verwenden die tatsächlichen Dateien und gezielt verfälschte Kopien. Geprüft werden unter anderem ein Privatpatch anstelle des Originals trotz neu berechneter lokaler Hashes, ein Präfix als Vollquelle, zusätzliche oder doppelte Quellen, ein Zwischenreader als angeblicher Finalstand, umetikettierte historische Tests, ein nicht enthaltenes Archiv als angeblich vorhanden sowie Änderungen am Gatecheckpoint. Dazu kommen die 20 unveränderten vorhandenen Inventarregressionen.

Der vorhandene Erststufenprüfer führt den Originalbuilder begrenzt aus. Fünf Basisoutputs stimmen bytegleich; anschließend folgt das erwartete `ENOENT` für `live-overlay.b64`. Das ist weder ein Vollbuilderfolg noch eine native Kompilation.

Drei gezielt entfernte Schutzprüfungen müssen die passenden Gegenprüfungen scheitern lassen. Drei Paketmanipulationen – geänderte Bytes, eine Zusatzdatei und ein Symlink – müssen abgewiesen werden. Der neue Prüfer schreibt keine Statusdatei und ersetzt keine unabhängige Abnahme.

Die endgültigen Ergebnisse stehen ausschließlich im externen Protokoll der frischen ZIP-Prüfung. Vorbereitungsläufe werden nicht addiert. Der vollständige Runner verlangt einen unprivilegierten Benutzer und sperrt Netzwerkverbindungen per vererbtem Linux-seccomp. Das ist keine allgemeine Sicherheits-Sandbox.

## 5. Erhaltener Bestand und Abschlussgrenze

Masterplan, Gatecheckpoint, die 38 Produktionsoriginale, bestehende Tests und Runner, die drei privaten Produktvorschläge sowie die ursprünglichen Archive bleiben bytegleich. Es gibt keinen neuen Produktcodepatch. Alle 320 Dateien des Vorgängerpakets sind rekonstruierbar.

Die private Inventarkonsolidierung ist ein abgegrenztes Arbeitspaket. S01-C02 erlaubt ausdrücklich einen Inventarabschluss trotz dokumentierter `blocked_capability`. Eine formale Abnahme wurde hier nicht erteilt. Die 21 fehlenden Vollquellen blockieren weiterhin ihre jeweiligen Builds und Integrationen, aber nicht jede unabhängige Referenzdokumentation.
