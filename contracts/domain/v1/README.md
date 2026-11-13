# Domainvertrag v1 · ExtremeLab S02

`schema.json` ist die normative **Wireform**, nicht der Nachweis realer Herkunft,
aktueller Kontodaten oder einer Handelsfreigabe. `golden-events.json` enthält genau
zwölf synthetische Ereignistypen; kein Konto wurde verbunden.

Python und JavaScript prüfen zusätzlich exakte Einheiten, Raster, Versionen und
kausale Zeitbeziehungen. Schemaprüfung allein ist dafür nicht ausreichend.
Instrument-/Policykataloge müssen von einem vertrauenswürdigen Aufrufer kommen.
Quell-/Datenversionsnamen bezeichnen Herkunft, beweisen diese aber nicht. Ein
passender Hash oder eine frei gewählte `authorization_chain_id` erteilt kein Recht.

Alle numerischen Fachwerte sind Strings. Prozent-zu-Bruchteil, Lot-zu-Unit und
Native-Double-Quantisierung sind jeweils ausdrücklich verschiedene Vorgänge.
Kein Parser darf eine unbekannte Einheit erraten. Bei `maximum_positions` bedeutet
`null`: keine zusätzliche Anzahlgrenze, weiter budgetgebunden; `0`: keine neuen
Positionen. Legacy `positions=0` darf deshalb nicht unverändert übernommen werden.

Der Envelope-Hash im Prüfer bindet alle Felder. `payload_hash` bindet nur den Payload;
Inbox-Idempotenz muss bei gleicher Quellen-/Stream-/Sequenzidentität den **ganzen**
Event vergleichen. Diese Prüfung ist hier spezifiziert, kein neuer produktiver
Inbox-Writer.

Der separate C#-Probe kann die tatsächliche Record-Serialisierung prüfen. Solange
sein Build und Roundtrip nicht gelaufen sind, ist die Drei-Sprachen-Abnahme offen.
Die C#-Probe ist keine vollständige native Risiko-/Autoritätsimplementierung.

Lokale Prüfung: `python -B evidence/S02/run_checks.py --reports-dir /neuer/externer/pfad`.
