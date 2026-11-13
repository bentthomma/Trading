# ExtremeLab · S01 RemoteView20 Originalintegration (privates Prüfpaket)

**Originalquellen unverändert. Keine Produktfreigabe oder Installation.**

Der echte lokale SQLite-Journalproducer ist mit dem echten Produktions-API-
Einstieg bis zum JSON-Lesepfad verbunden. Nur Transport und Vercel-Provider sind
synthetische Testadapter. 36/59 Website-Originalinputs bleiben unverändert;
23 fehlen. Kein vollständiger Websitebuild und keine erfolgreiche Browserabnahme.

- `RUN_S01_REPORT.md`: Ergebnisse, nichtatomare Fehlergrenzen, Grenzen.
- `UEBERGABE.md`: Ausgangshashes und genaues Weiterarbeiten.
- `evidence/S01/`: fünf fortgeführte S01-Lieferdateien und Quellnachweise.
- `baseline/platform097_remote/`: 64 unveränderte Originalquellen.
- `baseline/original_platform097.zip`: Originalarchiv für den Byteabgleich.
- `tools/run_remote20_checks.py`: vollständiger brokerfreier Prüflauf.

```sh
python -B verify_package.py
python -B tools/run_remote20_checks.py --node /pfad/zu/node24 --reports-dir /neuer/externer/ordner
```

52 unterschiedliche Testmethoden im Vorverpackungslauf. Die nach tatsächlicher
frischer ZIP-Prüfung separat mitgelieferte Abschlussprüfung ist für die Endfassung
maßgeblich. Keine historische Testzahl als neuer Lauf. Leserechte auf Originale
sind keine Aussage über Weitergaberechte außerhalb dieses privaten Projekts.
