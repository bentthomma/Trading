# S01 – private Quellenbindung

Dies ist ein Quelleninventar mit ausführbaren Nachweisen, keine Handelssoftware-Installation. Vollständiger Bericht: `docs/architecture/S01_SOURCE_BINDING.md`. Fünf aktuelle S01-Lieferartefakte: `evidence/S01/`.

## Prüfen

Vorausgesetzt sind Python3.13, Node22 und die separat vorhandenen Analyseabhängigkeiten aus `requirements-analysis.txt`. Kein Installationsskript wird automatisch ausgeführt.

```sh
python -B verify_package.py
python -B -m unittest discover -s tests -p 'test*.py' -v
python -B tools/check_build_boundary.py
python -B tools/replay_original_wire.py
```

Die Buildgrenzenprüfung benötigt Linux/libseccomp und schlägt ohne Sperre fehl. Der Original-Empfängerreplay verwendet ausschließlich lokale TLS-Verbindungen auf Port25345, temporäre Schlüssel und synthetische archivierte Daten. Er kompiliert/startet weder cBot noch Broker. Die gemeinsame Nutzung des Ports mit einem anderen Prozess führt zum Abbruch statt zur Änderung dieses Prozesses.

Exakte Produktionssegmente erneut in ein **noch nicht vorhandenes** Verzeichnis schreiben:

```sh
python -B tools/recover_bot_source.py --archive baseline/original_engine121_source.zip --output /tmp/s01-fresh-bot-source
node tools/check_bot_source_node.mjs /tmp/s01-fresh-bot-source evidence/S01/S01_ENGINE121_PRODUCTION_BINDING.json
```

Der bestehende Teilbuild-Regressionstest `tools/replay_partial_build.py` ist weiterhin vorhanden. Er ist kein vollständiger Websitebuild. Ein kompletter Build darf nicht durch ersetzte/erfundene Overlay- oder UI-Dateien vorgetäuscht werden.

## Interpretation

31/59 Quellen verfügbar;28 fehlen. Original-Engine1.2.1 ist anhand der tatsächlichen Produktionsinputs identifiziert. Native1.9, eine vollständige Website und ein neuer nativer Binärbuild sind damit nicht bestätigt. Bestehende historische Prüfberichte bleiben als solche erhalten. Der Manifestprüfer bestätigt Paketkonsistenz, keine unabhängige Abnahme. `UEBERGABE.md` benennt den exakten Fortsetzungspunkt.
