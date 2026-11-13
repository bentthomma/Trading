# Native Journal → v2-Orderzustand: konkreter Anschlussvertrag

## Ergebnis
Diese Fassung schließt den Quellenabgleich ab, nicht die native Gebührenintegration.
32 Originaldateien und 11 unveränderte Repoquellen sind hashgebunden. 28 Feldzuordnungen
stehen in `field-matrix.json`. Alle dort genannten Fundstellen beziehen sich auf die
extrahierte archivierte Plattform 0.9.7. C# wurde gelesen, nicht kompiliert oder gestartet.

## NB-01: Native Mengenbelege sind noch keine Geldbelege
`Th3NativeOrderAdapter20.CaptureNativeLedger20` erzeugt `NativeDealFact20` aus den
vorhandenen Deal-IDs, Order-/Positionsbezügen, Mengen, Status, Ausführungszeit und
verknüpften Eröffnungsdeals. `NativeDealFact20` enthält weder einen Ausführungspreis
noch eine Kommission oder Gebührenwährung. Diese Felder gehen nicht erst im Hub verloren:
sie sind schon in diesem nativen Zwischenmodell nicht vorhanden.

`JournalOrderProjection20.Project` exportiert anschließend nur 11 Orderfelder,
einschließlich aggregierter Filled-/Remaining-Mengen. Die einzelnen Deals und ihre
Bezüge werden nicht exportiert. Bei mengenmäßig nicht darstellbarem Konflikt bleiben
filledUnits/remainingUnits absichtlich null und state=outcome_unknown; Null ist keine Nullmenge.

Folge: Aus `order.reported` kann kein vollständiger S02-Deal oder S05-BROKER_FILL erzeugt
werden. Position-entry ist kein belegter Dealpreis; Position-net ist weder Kommission
noch Cashflow. `plan.costEstimate` ist nur ein Schätzwert. Keine Ersatz-Deal-ID aus
Position/Order/Sequence bauen, keine Nullgebühr erfinden.

## NB-02: Der Transport unterstützt noch keinen Gebührenereignistyp
C# und JS legen dieselben vier Payload-Feldlisten fest: plan.recorded, order.reported,
position.reported und engine.status. Die Extraktion aus C# ist ein statischer Beleg;
die tatsächliche JS-Eingangsprüfung ist ausgeführt. Unbekannte Gebühren-/Dealtypen oder
zusätzliche fee/dealId/price-Felder werden vor dem Schreiben abgewiesen (J02/J04).
Ein `schemaVersion=2` an der Batch löst nicht das Orderzustandsupgrade aus (J03).

Eine Erweiterung muss PRODUCER und EMPFÄNGER samt Schema-/Buildversion gemeinsam binden.
Die lokale S05-Zustandsversion 2, Journal-Batch-Version 1, native Ledger-Formatnummer 1,
S02-Vertragsversion und SQLite-Schema sind unterschiedliche Versionsebenen.

## NB-03: Der existierende Hub ist noch kein v2-Orderwriter
`EngineJournal.accept` speichert Raw-Receipts, Sequenzen, Pläne und Anzeigeprojektionen
in einer vorhandenen SQLite-Transaktion. Es importiert oder ruft den Orderreducer nicht.
Im gescannten Originalumfang von 92 .mjs/.js-Dateien außerhalb tests/evidence/artifacts/
node_modules existiert weder ein Verweis auf order-lifecycle.mjs noch ein benannter
externer Aufruf seiner Schreib-/Validierungsfunktionen. Dies ist eine begrenzte
lexikalische Quellprüfung, kein Universalbeweis über dynamisch erzeugten Fremdcode.

J10 speichert einen gültigen S05-v2-Zustand mit offenem Kostenbeleg im ausdrücklich
benannten Testnamespace. Ein echtes Journal-accept mit Fill-Summe lässt ihn unverändert,
ebenso nach SQLite-Neustart. Erst ein separat vollständig konstruiertes Ausführungsereignis
reicht dem existierenden Reducer zur Zuordnung. Das ist Testkomposition, KEIN installierter
Writer und keine aus der Zusammenfassung rekonstruierte echte Ausführung.

## NB-04: Gespeicherte Anzeigeprojektion und Rohbeleg sind nicht vollständig gebunden
J13 ändert im isolierten SQLite-Profil ausschließlich `position.reported`'s abgeleitetes
Nettofeld. Der Original-Reader zeigt den veränderten, syntaktisch gültigen Wert, während
das Raw-Receipt unverändert bleibt. Das überlebt tatsächliches Wiederöffnen. Eine neue
Statusmeldung repariert es nicht. Der Receiptvalidator weist dagegen manipulierte
Raw-Bytes ab (J15). Dies ist eine konkret nachgewiesene Integritätsgrenze der lokalen
Projektion, kein behaupteter Brokerangriff oder nachgewiesener wirtschaftlicher Verlust.

Ein einfacher Vergleich 'row.report == latestRaw.payload' wäre falsch: Der bestehende
Reducer erhält bei erlaubten Legacy-Nullmeldungen ältere planId/Mengen/IDs. J14 belegt
einen solchen gültigen Unterschied. Eine spätere Reparatur muss die tatsächliche
kontiguierliche Projektion bzw. feldgenaue Herkunft rekonstruieren und prüfen. Sie darf
nicht alte Rawbelege überschreiben oder beim Lesen heimlich fehlende Daten erfinden.
Die Reparatur ist in diesem Analysepaket ausdrücklich NICHT implementiert.

## NB-05: S02 fordert mehr Identität und Zeitsemantik
JournalAccount20 enthält Broker/Id/Environment/Currency, aber kein Kontomodell.
Der getrennte Observer meldet hedged; das ist nur innerhalb seiner geprüften Kontobindung
zu hedging übersetzbar. Brokertext ist noch keine normative Provider-ID. Buildhash,
Plan-ID und konfigurierte Revision sind keine Instrument-/Policy-/Datasetversion.

S02-Deal verlangt price, commission, execution_time und source_proof_id; unbekannte
Kommission passt nicht durch ein Null- oder Weglassfeld. Deshalb unvollständige native
Beobachtung erhalten, keinen gültigen ausführbaren Deal vortäuschen. Der künftige
Gebühren-Cashflow muss dieselbe wirtschaftliche Buchungsidentität referenzieren, sonst
droht doppelte Belastung. Sechs S02-Zeitachsen nicht auf sourceTime/receivedAt reduzieren.
Millisecond→Microsecond-Formatierung liefert keine zusätzliche gemessene Präzision.

## NB-06: Beobachtung, Archiv und historische Tests sind begrenzte Nachweise
Gleiche Engine-/Observerwerte bestätigen weder Gebühren noch Broker-Schutzorder.
Observer-historyComplete ist im Originalvertrag false (J05/J06). Der NDJSON-Archivworker
erhält echte Originalreceipts, aber keine beliebigen S05-v2-KV-Zustände (J11).
Ein Transport-ACK bestätigt den persistierten kontiguierlichen Bereich, nicht Brokerwirkung
(J01/J07/J08). Die bisherigen archivierten .NET-Resultate werden nur als Historie gebunden.
Es wird daraus kein aktueller Build oder aktuelle Native-Parität abgeleitet.

## Präzise Integrationsreihenfolge, keine neue Freigabeinstanz
1. Den erhaltenen Original-Nativadapter auf einem geeigneten .NET/cTrader-Testhost brokerfrei
   prüfen; zuerst belastbare tatsächliche Felder für Ausführungspreis/Gebühr/Währung und
   Unbekanntzustände nachweisen. Noch keine Kontoverbindung oder Botfreigabe.
2. Einen ausdrücklichen versionierten Raw-Execution-/Fee-Vertrag festlegen. Deal-/Buchungs-
   Identität, Eröffnungs-/Schließungsbezüge, vollständiger Betrag versus Delta, Erstattungen,
   Zeitpräzision und Abwesenheit der Gebühr müssen nativ belegt sein. Alte Leser nicht umetikettieren.
3. Bestehende C#-Outbox, JS-Acceptance, Archivformat und Build-/Schemaschranken gemeinsam
   erweitern. Disk-full, verlorenes ACK und Cursorlücken brokerfrei prüfen.
4. Einen bestehenden Hubwriter konkret anschließen: origin prüfen, v2-Validator/Upgrade
   anwenden, Rawbeleg + Orderprojektion + Cursor in derselben ursprünglichen Store.transaction.
   Kein zweiter Ledger, keine parallele Fee-Datenbank, keine blind erzeugten Namespaces.
5. NB-04 separat gegen echte Mergeregeln beheben; Restore darf danach Lesbarkeit nicht
   als wirtschaftliche Gültigkeit ausgeben. Vorherigen v1-/v2-Stand sichern, keinen Downcast.
6. Native S02-/S05-/S08-/S23-Nachweise und bestehende Planabhängigkeiten behalten.
   Dieses Dokument und syntaktisch gültige JSONs erteilen keine Brokerberechtigung.

## Nächster unabhängiger Arbeitsumfang
NB-04 ist mit den vorhandenen JS-Rohbelegen bearbeitbar. Die native Gebührenanbindung
bleibt bis zu vollständigen, wirklich ausgeführten nativen Feldnachweisen offen.
Keine erneute globale Quelleninventur und keine erneute Reviewerpflicht.
