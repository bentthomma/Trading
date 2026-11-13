# ExtremeLab · S01 – Dauerhafte Bindung negativer Quittungen

**Arbeitskennung:** S01-NEGATIVE-ACK-RECEIPT. Privater, unaktivierter Vorschlag am bestehenden `Control.ack`-Pfad. Kein neuer Controller, keine weitere Datenbank, keine Produktinstallation, keine Strategieänderung. S00/S01 bleiben formal offen; S02 wird nicht gestartet.

## 1. Maßgebliche Quellen

Fortgesetzt wurde die tatsächliche ControlAckBoundary-Übergabe, nicht eine gleich nummerierte oder ähnlich benannte Parallelfassung. Das Ausgangsarchiv wurde vollständig entpackt, CRC-geprüft und anhand seines extern übergebenen SHA-256 `33d560a6186b3e02794f8db57d70e98902e95960a5592e3768349e1ef6c40e89` bestätigt. Dessen Paketprüfer bestätigt 374 manifestierte Dateien. Seine Übergabe nennt ausdrücklich den negativen ACK-/Duplikatpfad als nächsten Auftrag. Die aktuelle Bibliothekssuche lieferte keine neuere einschlägige ACK-Übergabe in den ausgewerteten Treffern; dies ist keine Behauptung einer vollständigen Suche aller externen Ablagen.

Der Masterplan 1.1.0 wurde gelesen und bleibt unverändert (SHA-256 `60303e48156a187d065ad66e884398a71853e955a4acc1322ab8d9dd9d97ae7d`). Diese Arbeit ist private Fortsetzung des vom Nutzer beauftragten S01-Zweigs, keine Umgehung oder formale Aktivierung eines Planschritts.

| Bezug | SHA-256 |
|---|---|
| Unverändertes Originalarchiv Plattform 0.9.7 | `6530c9c46cab0c6f411fdb682f3c74d4c9140742e698aa48c835bc60ba190c6d` |
| Original `core/control.mjs` | `9bbd47368f7b5c87a6ab402219f7d5cbc9cd173a7a244dfcbc3da741b897147c` |
| Vorheriger privater Fristkandidat | `02c2ab2bf9410bc0ea17b88f734b4e91d0f9762907694f0b146bb9d5d5937bae` |
| Neuer kumulativer privater Kandidat | `ef5fbc946409a3ad1a51f78ba75a0bfe95f181ff3f51e43e23c19b2ea09d7920` |
| Inkrementeller ACK-Patch | `1dd35b5234d89c9387391ab26fcdf8305632db15107f7bbb832ff52d5c16c7c0` |

Acht tatsächlich vorliegende Originaldateien sind zusätzlich einzeln gebunden: Control, Store, Schema, Maintenance, Errors, HTTP-Server sowie HubBridge/HubProtocol. Der Codeabgleich bestätigt, dass ausschließlich die Methode `Control.ack` gegenüber dem vorherigen Fristkandidaten verändert ist. Sein Fristfix bleibt enthalten und wird nicht durch eine ältere Fassung ersetzt.

Alle 374 Vorgängerdateien bleiben bytegenau rekonstruierbar: 371 am selben Pfad, die drei alten Einstiegstexte unter `baseline/negative_ack_checkpoint/`. Das alte Manifest ist dort separat erhalten. Die fünf S01-Lieferdateien, 38 gesicherten Websiteinputs, frühere Vorschläge, Masterplan und Gatecheckpoint sind unverändert.

## 2. Reproduzierter Defekt und abgegrenzter Nutzen

Der alte ACK-Pfad vergleicht negative Quittungen zunächst mit dem **aktuellen** Botzustand. Erst danach erkennt er bereits abgeschlossene Aufträge. Nach einer später erfolgreich bestätigten Änderung wird deshalb eine unveränderte ältere Ablehnung zurückgewiesen. Dieselbe alte Quittungsidentität mit neuen Werten wird hingegen als Duplikat angenommen. Eine Rücksetzung der aktuellen Revision oder ein Handelsbypass war damit nicht nachgewiesen.

Drei neue Gegenprüfungen scheitern gezielt am vorherigen privaten Kandidaten: unveränderte Wiederholung wird abgewiesen; veränderte Wiederholung wird akzeptiert; ein dauerhafter bindender Beleg fehlt. Die erwarteten fachlichen Assertionfehler werden separat von erfolgreichen Tests gezählt.

## 3. Begrenzte Korrektur im vorhandenen Handler

Neue, tatsächlich akzeptierte negative Quittungen erhalten einen kleinen Beleg im **bereits vorhandenen** `kv`-Speicher. Schlüssel: `configurationRejectedAck:<proposalId>`. Inhalt: festes Schema `hub.rejected-ack/v1` und SHA-256-Fingerabdruck der semantischen ACK-Felder. Gebunden sind Bot-ID, Runtime-ID, Auftrags-ID, Revision, Digest des Auftrags, `accepted=false`, validierte Werte und optionaler Grund.

JSON-Schlüsselreihenfolge ist unerheblich; nicht mitgelieferter und null-Grund sind gleichwertig. Ein sonstiger Grund muss Text sein. Unbekannte Erweiterungsfelder, HTTP-Header und Zugriffstoken sind nicht Teil des Fingerabdrucks. Grund und Werte werden nicht als zusätzliche Rohkopie in diesen Beleg geschrieben. Es handelt sich um eine Integritäts-/Wiederholungsbindung, nicht um Verschlüsselung, Signatur oder eine unabhängige Identitätsbestätigung.

Der Handler schreibt den Beleg ausschließlich per `INSERT`, nicht per Upsert. Die bestehende `Store.transaction` umfasst nun Prüfung, Belegeintrag, terminalen Auftragsstatus und Auditereignis zusammen. Ihre vorhandene `BEGIN IMMEDIATE`-Semantik wird auch mit einer konkurrierenden echten SQLite-Verbindung geprüft. Es gibt **keine Schemaänderung, keine neue Tabelle und keine automatische Bestandsmigration**.

Die Grenze ist bewusst eng: Wer die Datenbank direkt kontrolliert, kann weiterhin Belege manipulieren oder gemeinsam mit dem übrigen Profil zurückrollen. „Unveränderlich“ bedeutet hier: Der ACK-Pfad überschreibt einen einmal gespeicherten Beleg nicht. Es ist kein externer Restore-Witness und kein append-only Datenträger.

### Entscheidungsverhalten

| Zustand | Ergebnis |
|---|---|
| Erste gültige negative Quittung | Beleg, `rejected` und Ereignis werden gemeinsam gespeichert. |
| Exakte spätere Wiederholung | `duplicate:true`; keine erneute Zustandsübernahme, kein zweites Ablehnungsereignis. |
| Gleiche Identität, andere Werte oder anderer Grund | HTTP 409 `ACK_PAYLOAD_CONFLICT`. |
| Bereits abgelehnt, aber Beleg fehlt/ist ungültig | HTTP 409 `ACK_RECEIPT_UNAVAILABLE`; kein Backfill aus aktuellen Werten. |
| Beleg vorhanden, Status aber nicht passend | HTTP 409 `ACK_RECEIPT_STATE_CONFLICT`; kein Überschreiben. |
| Alte erfolgreiche Quittung ohne Ablehnungsbeleg | Bestehender positiver Duplikatpfad bleibt verwendbar. |
| Falsche Authentisierung/Runtime/Revision/Digest, fehlende Auslieferung oder bestehender Sperrgrund | Vorhandene Sperren behalten Vorrang. |

Die erste negative Quittung muss weiterhin den unveränderten tatsächlichen Zustand belegen. Nur bei einer **bereits belegten** Ablehnung wird die Wiederholung nicht länger mit einem inzwischen anderen aktuellen Zustand verglichen. Der Patch setzt weder eine neuere Revision zurück noch gibt er die Laufzeit frei.

Eine zusätzliche Folge der breiteren Transaktion ist ausdrücklich beabsichtigt: Schlägt ein ACK fehl, werden auch während dieses Aufrufs vorgenommene Ablaufmarkierungen zurückgerollt. Die Fristprüfungen anderer Aufrufe bleiben bestehen; die zugehörigen Fristregressionen wurden erneut ausgeführt.

## 4. Bestandsdaten und tatsächlicher SDK-Vertrag

Die Legacy-Prüfung erzeugt eine Ablehnung durch die **unveränderte ursprüngliche ACK-Methode**, nicht nur durch Erfinden einer Datenbankzeile. Der neue Handler darf daraus keinen präzisen historischen Payload ableiten. Ihre Wiederholung bleibt daher ausdrücklich unbestätigt. Bereits erfolgreiche historische Quittungen bleiben kompatibel.

Das ist eine strengere Upgrade-Regel, keine transparente Migration. Bei einer vor dem Upgrade gespeicherten Ablehnung mit verlorener Empfangsantwort kann die Wiederholung nach dem Upgrade einen 409 erhalten. Vor produktiver Übernahme muss dieser Bestandsfall geprüft und ein kontrollierter Zustandsabgleich vorgesehen sein. **Keine automatische Entsperrung, keine Historienlöschung, kein erfundener Fingerabdruck.**

Die Originalquellen `sdk/HubBridge.cs` und `sdk/HubProtocol.cs` zeigen: Eine ausstehende Quittung wird vor dem nächsten Heartbeat erneut versendet. Die gespeicherte Quittung wird wiederverwendet; der Konfigurationscallback wird nicht wegen eines bloßen Transportsfehlers erneut ausgeführt. Der im Defekttest verwendete sehr späte Wiederholungsablauf ist deshalb nicht ohne Weiteres der normale SDK-Ablauf.

HTTP 409 gilt im SDK grundsätzlich als terminal (Ausnahme: `RUNTIME_CONFLICT`). Die neuen ACK-Fehlercodes sind **nicht** in seiner vorhandenen Liste bekannter Detailcodes enthalten; es erscheint daher der generische Transportfehler `HUB_HTTP_409`. Der bestehende Terminalpfad setzt den Fehler-/Blockierzustand und entfernt die ausstehende Quittung, statt den Auftrag unkontrolliert erneut anzuwenden. Dies ist ein **statischer Quellnachweis**, keine ausgeführte C#-Prüfung. SDK-Dateien wurden nicht verändert.

## 5. Tatsächlicher Prüfumfang

Die neuen Verhaltensprüfungen verwenden Originalserver, HTTP-Parser, Authentisierung und echte SQLite. Nachrichten und Kontobezeichnungen sind synthetisch. Der unveränderte bereits vorhandene Unix-Socket-Transport wird wiederverwendet; kein zweiter Controller und keine nachgebaute Serverentscheidung.

* Exakte/abweichende Wiederholungen nach späterer Konfiguration; Reason-Bindung, kanonische Reihenfolge und Datenminimierung.
* Fehlschlag beim Belegschreiben sowie nach Einfügen des Auditereignisses vor Commit: keine teilweise abgeschlossene Ablehnung.
* Verlorene Antwort als ausdrücklich gekennzeichnetes Verwerfungsmodell, echtes Schließen/Öffnen und unveränderte Sperre nach Neustart.
* Fehlende, beschädigte und fremde Belege; Legacy-Daten aus Originalcode; positive Legacy-Quittungen.
* Tokenrotation, Runtimewechsel und unveränderte Identitäts-/Sperrprüfungen.
* Ereignisaufbewahrung: Der Sequenzcursor wird im Test gezielt vorgerückt, dann die echte Store-Retentionsroutine ausgeführt. Die alte Ereigniszeile verschwindet, der separate Quittungsbeleg bleibt. Das simuliert Zeitablauf, keinen durchgeführten Langzeittest.
* Echte konkurrierende SQLite-Verbindung kann innerhalb der ACK-Transaktion nicht schreiben.
* Zwei echte, isolierte Kindprozesse werden unmittelbar vor bzw. nach dem tatsächlichen SQLite-`COMMIT` mit `SIGKILL` beendet. Nach neuem Öffnen stimmen Auftrag und Beleg überein; Wiederholung führt genau einmal zur gespeicherten Ablehnung. Dies ist **kein Stromausfall-, Hardware- oder Windowsnachweis**.
* Zusätzlich läuft der unveränderte Originaltest zum vollständigen Restore mit echtem Wartungsworker und gesperrter alter Autorität. R18 ergänzt nur die gezielte Priorität vorhandener Sperrgründe; er ist für sich kein vollständiger Restoretest.

Die vorhandene Ablauf-/Berechtigungssuite wird ohne ihre alte reine Defektbeschreibung C16 ausgeführt. C16 behauptete gerade das falsche Verhalten; R01/R02 ersetzen diese Charakterisierung durch Korrektheitsprüfungen. Es wird kein fehlgeschlagener Produkttest als bestanden versteckt.

### Zählweise

Der vorbereitende vollständige Lauf bestand mit **87 unterschiedlichen Methoden**: 21 neue (davon eine reine SDK-Quellprüfung), 16 relevante Vorgängerprüfungen (davon eine reine SDK-Quellprüfung) und 50 unveränderte Originalregressionen. Somit 85 ausgeführte Verhaltensmethoden plus zwei statische Methoden. Drei erwartete Fehler am Vorgänger, drei gezielte Sicherheitsregressionen und drei Paketmanipulationen sind separate Gegenproben.

Die maßgebliche Endabnahme dieses **privaten Pakets**, nicht des Produkts, wird nach frischem Entpacken ausgeführt. Deren tatsächlich gemessene Zähler, Befehle, Zeitpunkte, Exitcodes und Loghashes stehen außerhalb des ZIP in `ExtremeLab_S01_NegativeAckReceipt_Abschlusspruefung.json`. Keine historischen Testzahlen werden addiert.

Ein erster Vorbereitungslauf hatte 20/21 erfolgreiche Methoden: Der neue statische Test verwies auf eine nicht vorhandene Transportdatei. Die Referenz wurde anhand des Originals auf `HubProtocol.cs` korrigiert, einschließlich der tatsächlichen `HttpStatusCode.Conflict`-Bedingung. Anschließend bestanden 21/21 sowie der vollständige Lauf. Diese Vorbereitung ist in den separaten Logs erhalten und nicht der frische Endnachweis.

## 6. Grenzen und nächster fachlicher Anschluss

* Private Korrektur, kein Rollout. Die vorgeschlagene strengere Legacy-Regel und der neue Belegschlüssel sind unabhängig zu prüfen, bevor eine bestehende Installation geändert wird.
* Der bestehende native Consumer wurde nicht kompiliert oder gestartet. Es gibt keinen echten Konto-/Broker-, Cloud- oder Windowslauf.
* Der Beleg gilt nur im jeweiligen Datenbankzustand; vollständiger Restore kann Belege gemeinsam mit der Historie zurücksetzen. Kein externer Generationsnachweis.
* Keine automatische Löschung/Retentionsänderung für Belege. Anzahl wächst mit abgelehnten, in der Datenbank vorhandenen Aufträgen. Kein Last- oder Dauerlaufnachweis.
* Der ACK-Pfad hält bei Wiederholungen nun ebenfalls die bestehende Schreibtransaktion kurzzeitig. Ein belegtes Mehrprozess-Last-/Latenzprofil ist nicht enthalten.
* Websitequellen unverändert **38/59**; 21 vollständige Inputs fehlen weiterhin. Kein vollständiger Websitebuild und kein neuer formaler Gateabschluss.

Der nächste konkrete Anschluss ist der **bestehende SDK-Fehler-/Wiederanlaufpfad für Legacy-Ablehnungen und neue ACK-Konflikte**: generische 409-Diagnose, kontrollierter Zustandsabgleich, kein Apply-Replay. Dabei den vorhandenen `HubBridge`/`HubProtocol` verwenden und weder einen zweiten Quittungsspeicher noch automatische Freigaben einführen. Der jetzt geprüfte persistente ACK-Pfad muss nicht nochmals als allgemeine Quellenforschung wiederholt werden.

## 7. GitHub und externe Referenzen

Der lesende Connector-Abgleich dieses Laufs liefert `main=1a5cfe9d3139276f5432c79a8ee0be1938b7066c`, Baum `47fdd2b4cb70efc67db93f93f178015259204d86`, ausschließlich `README.md`, `truncated=false`; die Branchantwort enthält `protected=false`. Keine PR-/Workflow-/Ruleset-Gesamtprüfung in diesem Lauf. Keine Schreibaktion, Veröffentlichung oder Deployment.

Zur Interpretation der vorhandenen SQLite-Transaktionen wurden nur Primärquellen herangezogen: SQLite **Transaction** (https://www.sqlite.org/lang_transaction.html), **Isolation** (https://www.sqlite.org/isolation.html), **Atomic Commit** (https://www.sqlite.org/atomiccommit.html), abgerufen am 13.11.2026. `BEGIN IMMEDIATE` reserviert den Schreibzugriff; die tatsächlichen, hier engeren Prozessabbruchtests ersetzen keinen plattformübergreifenden Dauerhaftigkeitsnachweis.
