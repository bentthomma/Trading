# S06 – präziser Fortsetzungspunkt
Basis: d3c1e0ba1aeb11cb9df30240622caa944d6fb2bd. Masterplan1.2.0, Statusdatei unverändert.
S00/S01 passed, S02 blocked, S06 pending. Keine Reviewerpflicht.

Fertig vorbereitet: Quellen-/Pfadmatrix für Profilimport, SQLite-Backup, Raw-Journalarchiv,
Vollrestore, Retention und Recovery mit dem vorhandenen S05-v2-Kostenbelegzustand.
Drei Originalgegenfälle belegen fehlende KV-Bindung in der Restoreentscheidung.
Separater Patch ausschließlich core/maintenance.mjs ergänzt dieselbe KV-Bytebindung
bei Vorschau, Vorbereitung und Worker-Zielvergleich. Kein produktiver Namespace oder
v2-Writer wurde installiert. S05-Patch ist unverändert und Voraussetzung der Testkomposition.

Der vorherige Restorelauf hatte22 Methoden, passende Original-Restore-/Journalregressionen47,
die bestehende Gebühren-Suite38:107 unterschiedliche Methoden. R15 ist ausdrücklich ein
belegter offener semantischer Restoreanschluss, kein bestandener Fachvalidierungsfix.
Tatsächliche frische Endwerte und Commit stehen im externen Lieferbeleg.

Rest: Generic Restore bestätigt keine gültige Order-/Codeversion; produktiver v2-Reader/
Writer, nativer Abgleich und kontoweites Cash-/FX-Buch fehlen weiter. Bewusster Restore
alter Snapshots kann neue Belege zurücksetzen; Vor-Restore-Datei bewahrt den alten Zielstand,
gibt aber keine aktuelle Brokerrealität. Keine Datenbank- oder Rechteerweiterung ergänzen.

Der dort vorgesehene native Quellenabgleich ist jetzt als separates S06-Analysepaket
ausgeführt: `native-binding/handoff.md` und `native-binding/integration-gaps.md`.
Die 28 konkreten Feldzuordnungen bestätigen fehlende native Preis-/Gebührenfelder und
keinen bestehenden produktiven v2-Writeranschluss. Neue Restlücke NB-04: gespeicherte
Anzeigeprojektion ist nicht vollständig an Rawbelege gebunden; J14 begrenzt eine
zulässige Reparatur auf die tatsächlichen Legacy-Mergeregeln.
Der oben beschriebene Restorepatch und dessen damalige Tests bleiben unverändert;
sie sind keine neu ausgeführten Resultate der Native-Vertragsprüfung.

Reproduktion: README_DE.md des äußeren Pakets bzw. run_checks.py in dieser Ablage.
Quellen, private historische Inputs und komplette vorherige Git-Historie bleiben erhalten.
