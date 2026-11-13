# Wiederherstellung und öffentlicher Transfer

## Warum ein zusätzliches Paket
Die hier verfügbare GitHub-Verbindung kann Textdateien und Gitobjekte aus Textargumenten schreiben, übernimmt aber keinen lokalen ZIP-/Bundlepfad als Datei-Upload. Deshalb ist der direkt übertragene Startsatz nicht der vollständige Quellimport. Keine vollständige Übertragung behaupten, solange der Remote-Baum sie nicht belegt.

Das private Begleitpaket `ExtremeLab_Codex_Aktuell.zip` enthält den aktuellen vollständigen Originalstand, Teamkonfiguration und eine geprüfte öffentliche Dateiauswahl. Der alte Codex-Bootstrap auf b9845dc darf nicht verwendet werden.

## Original wiederherstellen
```sh
python -B tools/handoff/restore_private.py \
  --archive /pfad/ExtremeLab_S06_NativeVertragsbindung_Offline.zip \
  --destination /neuer/privater/extremelab-arbeitsordner
```
Im Begleitpaket liegt dieses Original unter `original/`. Ziel muss neu sein. Der Helfer prüft Archivhash, sichere Pfade, Paketmanifest, lokalen Gitstand und fehlende Remotes. Er lädt nichts hoch und installiert keine Werkzeuge. Linux/WSL ist für die bestehenden Gesamtrunner vorgesehen.

## Bereinigte Kopie vorbereiten
```sh
python -B tools/handoff/stage_public.py \
  --source /privater/extremelab-arbeitsordner/repository \
  --manifest /pfad/ExtremeLab_Codex_Aktuell/publish/approved-source-manifest.json \
  --destination /neuer/bereinigter/exportordner
```
Das erzeugt nur einen neuen Exportordner und prüft alle erlaubten Pfade und Bytes. Keine bestehenden Dateien überschreiben. Nicht freigegebene Daten, Archive, alte Kontoanalysen, Ausführungslogs, automatische Workflows und private Gitgeschichte bleiben ausgeschlossen. Die fehlenden Originale werden nicht durch leere Dateien ersetzt.

## Tatsächlicher GitHub-Import
Im authentisierten Codex-Host den aktuellen Remote-Stand von `bentthomma/Trading` lesen. Einen separaten Übergabezweig von diesem Stand anlegen, ausgewählte Exportdateien ohne Überschreiben widersprechender neuer Dateien übernehmen, vollständigen Diff kontrollieren, gewöhnlichen Commit erstellen und nur diesen Zweig pushen. Keine `--all`/`--mirror`/Force-Operation. README, AGENTS.md und die neue Codex-Konfiguration dieses Starts nicht mit dem alten README ersetzen. Alte Gitrefs sind lokale historische Testbelege, keine öffentlichen Uploadobjekte.

Nach Push Remote-Commit, Dateizahl und Hashes prüfen; `UPLOAD_STATUS.md` mit dem echten Ergebnis aktualisieren. Fehlt GitHub-Authentisierung, keine Token erfragen oder in Text ausgeben; vorhandenen sauberen Export erhalten und Transferblocker benennen.

Der öffentliche Export ist wegen zurückgehaltener Inputs nicht die vollständige private Testbasis. Historische Tests mit Originalarchivbezügen in der privaten Arbeitskopie durchführen. Keine Hashpins oder Gates abschwächen, nur damit der öffentliche Export vollständig wirkt.
