# S06 – Journal-, Sicherungs- und Wiederherstellungsgrenzen

## Auftrag, Stand und Scope
Basis `d3c1e0ba1aeb11cb9df30240622caa944d6fb2bd`, Masterplan 1.2.0 unverändert.
Private S06-Vorarbeit am archivierten Trading_Local 0.9.7 und dem bereits vorhandenen
S05-v2-Kandidaten. Kein formaler S06-Abschluss und keine produktive Integration.
Die Reviewerpflicht bleibt entfernt. Keine Broker-/Konto- oder Veröffentlichungsaktion.

## Tatsächliche Speicherketten

| Vorhandener Weg | Gespeicherter Inhalt | Bedeutung für v2-Kostenbelege |
|---|---|---|
| `Store.set` in `Store.transaction` | JSON im vorhandenen KV-Feld, gemeinsam mit Audit möglich | Ganze v2-Zustände, Originalintent, Receipt-/Basishashes und Konflikte bleiben erhalten. Die Tests komponieren diesen Weg; ein produktiver v2-Writer ist noch nicht installiert. |
| `Store.backup()` | SQLite-Backup inklusive committed WAL | Ganze KV-Zustände bleiben bytegleich, unabhängig von Tabellen- oder Orderzustandsversion. Kein Copy einer offenen Hauptdatei ohne WAL. |
| `Control.export` / `confirmRestore` | Botprofile, gewünschte Parameter; maximal 500 Auditereignisse im Export | Kein vollständiger Orderexport. Import übernimmt ausschließlich validierte Profile, nicht die exportierte Ereignisliste und keine generischen KV-Zustände. Ziel-KV bleibt erhalten. |
| `JournalArchives` / Archivworker / `verifyJournalArchive` | Raw-Enginejournal-Receipts, Streams, Originalpläne und ggf. Build-Lineage | Historische Evidenz. Generischer v2-Orderzustand und Kostenbelege des Testwriters sind nicht enthalten. Kein Restore- oder Ausführungsbefehl. |
| `prepareRestoreJob` / Originalworker | Austausch des ganzen SQLite-Profils aus bestätigter Quelle | Bewahrt den ausgewählten KV-Stand und dessen Konflikte. Bevorzugt nicht automatisch neuere Daten. Neuere Zielstände bleiben zusätzlich im Vor-Restore-Backup. |

Die vollständigen Quellen sind in `source-bindings.json` gebunden. Die Testschlüssel
`s06.private-test.order-v2` und `s05.private-test.order` sind ausdrücklich keine erfundenen
Produktnamespaces. Die reale Enginejournal-API wird zusätzlich ohne Netzwerk mit
synthetischen nativen Nachrichten ausgeführt (R14/R21).

## Reproduzierter Originalfehler S06-GAP-01
`targetSnapshot` band bislang ausgewählte Profil-/Runtime-/Policywerte, jedoch nicht den
vollständigen KV-Bestand. Deshalb änderte ein neu gespeicherter Gebührenbeleg weder den
Vorschaudigest noch den Vergleich vor dem tatsächlichen Dateiaustausch. Derselbe Fehler
betrifft echte Enginejournal-Receipts, nicht nur den Testwriter. Die drei neuen Sollprüfungen
R01, R02 und R21 scheitern am unveränderten bisherigen Maintenance-Modul.

## Minimaler separater Patch
Nur `core/maintenance.mjs` wird im temporären Kandidaten verändert. Der vorhandene
Zielvergleich erhält `kvSha256`: SHA-256 über einen festen Formatpräfix und sämtliche
`[key,value]`-Paare, BINARY-sortiert und eindeutig per JSON plus Zeilenumbruch gerahmt.
Der Hash bindet exakte gespeicherte Texte; selbst semantisch gleiches JSON mit anderen
Bytes kann eine neue Vorschau verlangen. Gleiche Bytes in anderer SQLite-Einfügereihenfolge
bleiben hingegen identisch. Einfügen, Löschen und Wertänderung sind abgedeckt.

Vorschau, Vorbereitung und `preRestoreBackup` verwenden denselben bestehenden
`targetSnapshot`-Weg. Keine neue Datenbank, Journalinstanz, öffentliche Route oder Authority.
Nur der Digest wird im privaten Wartungsauftrag gebunden; Keys/Kostenpayloads erscheinen
nicht in der öffentlichen Vorschau. Quell-SHA und OS-Profilsperre bleiben unverändert.

## Upgrade und Rückfall
Ein älterer, noch nicht ausgeführter Restoreauftrag besitzt die neue Zielbindung nicht.
Er wird vom Kandidaten mit `RESTORE_TARGET_CHANGED` abgelehnt und ersetzt nichts (R20).
Eine neue Vorschau ist nötig; es wird kein Altergebnis umgebunden. Ein bereits abgeschlossener
Auftrag bleibt idempotent und kann neue Daten nicht durch Wiederholung zurückrollen (R19).
Die Datei kann nach Prüfung auf das Original zurückgenommen werden; der Patch ändert
weder SQLite-Schema noch den S05-v2-Zustand. Rücknahme entfernt aber den neu geprüften Schutz.

## Bewusster Rollback ist keine aktuelle Brokerrealität
Ein ausdrücklich neu bestätigtes älteres Backup stellt dessen älteren Belegstand wieder her.
Das ist das dokumentierte Replace-Verhalten, keine Konfliktauflösung durch Zeitvergleich.
Die vorherige aktuelle Datenbank ist im Vor-Restore-Backup lesbar (R10). Nach Erfolg sind
Steuerung gesperrt, Tokens widerrufen, Runtimebindungen entfernt und Konto/Provider getrennt
(R11). Kein Test hat einen Broker kontaktiert oder neue Orders freigegeben.

## Prozessabbrüche und Retention
R17 beendet den tatsächlichen Restoreworker in zwei unterschiedlichen Phasen mit SIGKILL,
auch nach dem Dateiaustausch. Der vorhandene Recoveryweg stellt den vorherigen vollständigen
v2-Zustand wieder her; Originalquelle und Kostenbeträge bleiben gleich. Die vorhandene
Maintenance-Suite prüft weitere Phasen. Das sind lokale Prozessabbrüche, kein Stromausfall,
Windows-, Hardware- oder Crash-während-eines-Brokeraufrufs-Nachweis.
R16 führt die originale Eventretention aus und stellt anschließend den erhaltenen
KV-Kostenbeleg über den echten Vollrestore wieder her. Ein fehlender alter Auditpayload
wird trotzdem nicht aus einem Hash rekonstruiert.

## Verbleibende Integrationslücken
1. Der generische Restore prüft Datenbankstruktur, JSON und Profile, nicht den gesamten
   wirtschaftlichen Inhalt beliebiger KV-Dokumente. R15 stellt einen syntaktisch gültigen,
   fachlich beschädigten v2-Orderzustand wieder her; der bestehende v2-Reader weist ihn danach
   zurück. Eine erfolgreiche Maintenance-Meldung darf deshalb kein Order-/Broker-PASS ersetzen.
2. Ein produktiver v2-Writer/-Readeranschluss, eine Code-/Orderzustands-Kompatibilitätsbindung
   je Backup und die tatsächliche native Reconciliation bleiben offen. Kein Namespace wird
   dafür in diesem Paket erfunden.
3. JSON-Profil- und NDJSON-Journalexport sind keine austauschbaren Vollsicherungen.
4. Der neue Digest bindet den KV-Bestand, nicht pauschal alle Änderungen an anderen Tabellen.
   Der vorhandene Profil-/Pending-/Nachrichtenvergleich bleibt wie zuvor. Eine weitere
   globale DB-Revision/Writerintegration müsste anhand tatsächlicher Writer geprüft werden.
5. Der Vergleich ist keine Sicherheit gegen einen bösartigen Host, der Daten, Jobs und Hashes
   vollständig gemeinsam ersetzt. Die Original-OS-Sperre gilt für kooperierende Prozesse;
   ein fremder direkter DB-Writer ist keine unterstützte Nebenläufigkeit.
6. Ganze-KV-Hashing ist linear und konservativ: auch nichtwirtschaftliche KV-Änderungen
   verlangen eine neue Vorschau. Keine Produktionslast- oder Maximalkapazitätsmessung.
   Bestehende Backupgröße 128 MiB und Enginejournalbudget 256 MiB sind nicht gleichgesetzt.

## Reproduktion
```sh
python -B evidence/S06/run_checks.py --sources /pfad/MPR1_LAB03_SelectedSources.zip \
  --workbook /pfad/Trading_Start_und_Arbeitsbuch_1_0.pdf --output /neuer/externer/logordner
```
Linux/WSL, Python und Node mit `node:sqlite`, Git und libseccomp. Quellen werden nur in
neuen temporären Verzeichnissen rekonstruiert; keine Installation, keine Downloads.
