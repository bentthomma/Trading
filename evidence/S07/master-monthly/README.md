# S07 Master-Labor – Reproduktion und Grenzen

Private Ergänzung zur vorhandenen Teil6-Prüfung, keine Aktivierung des formalen Schritts.

```sh
python -B evidence/S07/master-monthly/run_checks.py \
  --source /absolut/Master_Monthly_Sources.zip \
  --output /neuer/externer/logordner
```

Das unveränderte vollständige Master-Arbeitsarchiv ist ebenfalls zulässig, sofern sein Hash zum Source-Lock passt. Das mitgelieferte kleine Teilarchiv enthält genau die 74 tatsächlich benutzten Originalmitglieder. Der Runner benötigt Python, Git und Linux/libseccomp. Keine zusätzlichen Pythonpakete, Brokeranmeldungen oder Downloads. Vollständige monatliche Rohanbieter-ZIPs sind nicht enthalten; die Dateien sind geprüfte archivierte Ableitungen mit aufgezeichneten, nicht erneut belegten upstream-Hashes.

Die Analyse erzeugt in einem **neuen** Ausgabeverzeichnis vier Dateien. Root-Kataloge werden durch den vorhandenen `evidence/S07/prepare_catalog.py` reproduziert; er liest die hashgebundene neue Monatskomponente. Die S07-Historie und Teil6-Originaldaten werden nicht überschrieben.

Die Korrektur des alten Schreibers liegt als separater Einzeilenpatch bei. Er wird nur auf synthetischen vollständigen Anbieterformaten ausgeführt. `--verify-packaged --output-dir <collection>` benutzt dagegen die tatsächlich vorhandenen Collection-Bytes. Kein neuer Backtest und keine native Ausführung. Die Zahl der unittest-Methoden enthält die Originalassertionen nicht ein zweites Mal.

Plan 1.2.0 und Zustand bleiben unverändert: S00/S01 passed; S02 blocked; S03/S04/S07 pending. Der private Arbeitszweig dokumentiert Vorarbeit und darf spätere Integration nicht vorwegnehmen. Keine unabhängige Reviewerpflicht.
