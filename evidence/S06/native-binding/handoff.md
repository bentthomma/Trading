# S06 Native Vertragsbindung – Fortsetzung
Basis ed47b63828680ad382f907472bcf2587c7e4af3d. Plan 1.2.0 und Status unverändert.
32 Originalmodule + 11 Repoquellen gebunden; 28 Feldzuordnungen. Keine neue Produktdatei.

Erreicht: echte Journal-Acceptance/Observer/Reconciliation/SQLite/Archivpfade ausgeführt.
V2-Gebührenmodell ist nicht an den produktiven nativen Journalweg angeschlossen.
Native C#-Modelle haben an dieser Stelle keine Ausführungspreise/Kommissionen; Wire v1
exportiert nur Aggregate. Ein neuer Writer darf diese fehlenden Fakten nicht raten.

Neue konkrete Restlücke NB-04/J13: Eine veränderte abgeleitete Positionsprojektion wird
nicht vollständig gegen das intakte Raw-Receipt gebunden, auch nach SQLite-Neustart.
J14 beweist zugleich, dass naive Gleichheit mit nur dem neuesten Receipt gültige
Legacy-Merges zurückweisen würde. Die Korrektur ist NICHT implementiert.

Nächster JS-only-Block: vorhandene Projektions-/Leselogik anhand kontiguierlicher Rawbelege
prüfen und die Original-Mergeregeln für eine fail-closed Wiederprüfung wiederverwenden.
Nicht ungefragt sämtliche Journalzustände neu schreiben. Keine neue native Gebührenspur,
kein Schemawechsel und kein Brokerkontakt aus diesem Auftrag ableiten.

Neue Suite: 16 JS-Laufzeitmethoden +5 Quellen-/Schemamethoden; relevante unveränderte
Originalregressionen:29 Enginejournal +28 Observer +31 Reconciliation. 109 Methoden;
C#-Kompilationen0. J13 charakterisiert eine offene Grenze. Frischer tatsächlicher
Endnachweis außerhalb des ZIP, keine Addition von Vorbereitungs-/Wiederholungsläufen.

Reproduktion: python -B evidence/S06/native-binding/run_checks.py
 --sources /.../MPR1_LAB03_SelectedSources.zip
 --workbook /.../Trading_Start_und_Arbeitsbuch_1_0.pdf
 --output /neuer/externer/protokollordner
Die alten privaten Rohdaten, S03/S04/S05/S07 und alle Quellpatches bleiben erhalten.
