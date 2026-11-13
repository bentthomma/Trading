# ExtremeLab – aktueller Entwicklungsstand

Die private Referenzrevision ist `66b04bfc8a46f0ef6b5b69b06f9b8c168f124783`. Auf dem benannten Übergabezweig ist der bereinigte Quellsnapshot jetzt tatsächlich vorhanden: 651 freigegebene Quelldateien zusätzlich zu den 25 Startdateien, durch frischen GitHub-Readback geprüft. Private Originalarchive, Eingaben und Git-Historie bleiben lokal; der öffentliche Snapshot ersetzt die vollständige private Testbasis nicht. Details: UPLOAD_STATUS.md.

## Erhaltene Arbeit

S00 und S01 sind abgeschlossen. Plan 1.2.0 ist unverändert; die unabhängige Reviewerpflicht wurde mit AM-002 entfernt. S02 wartet auf den echten C#-Nachweis und anschließend AM-003. S03, S04, S05, S06 und S07 enthalten vorbereitete und lokal geprüfte Arbeit, keine pauschale Produktabnahme.

- S03: fünf bestätigte Desktopreferenzen, vier Hauptbereiche, ein beobachtetes Setup; feldgenaue Zustands-/Quellenbindung. Keine neue Designrunde.
- S04: Originalauswerter fortgesetzt; fehlerhafte letzte Snapshots, nichtendliche Zahlen und doppelte JSON-Felder behandelt. Private Rohdaten nicht veröffentlichen.
- S05: MPR1-Referenz und Original-Orderkern geprüft. Der separate v2-Gebührenpatch erhält frühe Kostenbelege, Konflikte und explizite Migration. Keine produktive Installation.
- S06: separater Restorepatch bindet den KV-Zustand. Native Vertragsanalyse benennt fehlende Preise/Kostenidentitäten und den noch fehlenden Reader-/Writeranschluss.
- S07: Teil6 und Master-Monatsdaten getrennt versioniert; Oktober-FX bleibt quarantänisiert. Provider-Rohdateien und Nutzungsrechte bleiben teilweise offen.

## Unmittelbarer Anschluss

`evidence/S06/native-binding/` enthält NB-04/J13: die gespeicherte Positionsprojektion ist nicht vollständig an unveränderte Rohbelege gebunden. J14 zeigt, warum ein Vergleich nur mit dem letzten Payload gültige Legacy-Zusammenführungen zerstören würde. Der nächste Kandidat muss die Original-Mergeregeln über den kontiguierlichen Belegverlauf wiederverwenden; keine Rohbelege umschreiben. Die Korrektur ist noch nicht implementiert.

Parallel kann ein geeigneter Host `evidence/S02/check_native.py` wirklich kompilieren/ausführen. Der frühere fehlende Compiler ist kein für alle Umgebungen gültiger Blocker.

## Historische Nachweise

Alte Testzahlen sind keine heute neu ausgeführten Tests. Native Modelle wurden quellenbasiert abgeglichen, nicht als laufender C#-Bot nachgewiesen. Formaler Fortschritt nur über den vorhandenen Plancontroller; keine manuelle PASS-Änderung.

## Publikationsgrenze

Der Nutzer hat den GitHub-Quellupload beauftragt, nicht eine Veröffentlichung privater Kontodaten oder einen Produktdeploy. Kein `git push --all`, kein Upload des privaten Git-Bundles, keine Veröffentlichung von Rohlogs, Zugangsdaten, Quellen mit ungeklärten Weitergaberechten oder Schriftdateien. Private Originale und Historie bleiben lokal als Prüfquelle.
