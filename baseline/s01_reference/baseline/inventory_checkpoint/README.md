# ExtremeLab S01 · SnapshotConsumerGuard

Privater Ein-Dateien-Vorschlag für den vollständig archivierten Journalrenderer.
**Nicht** die finale Live-/Skin-Website; keine Veröffentlichung oder Freigabe.

Der bestehende Import-/Analyseexport erhält Snapshotdiagnosen und zeichnet
strukturell ungültige Kerzenpayloads nicht. Rohereignisse bleiben erhalten.
Reale SQLite-Projektion, echter Chromium-DOM und echter Blobdownload; synthetische
Testdaten, keine IP-Netzwerkverbindungen. Keine Designänderung.

Start: `UEBERGABE.md`, Details: `RUN_S01_REPORT.md`, Vorschlag und Patch:
`proposals/snapshot-consumer-guard/`. Der gesamte vorherige Stand ist
rekonstruierbar; Ausgangsarchive und Produktoriginale wurden nicht verändert.

```sh
python -B verify_package.py
# Nicht als root; externe, noch nicht vorhandene Protokollablage:
python -B tools/run_snapshot_consumer_checks.py --reports-dir /tmp/neuer-prueflauf
```

Voraussetzungen: Linux/libseccomp, Python/Playwright/aiohttp, Chromium unter
`/usr/bin/chromium`, Node, natives patch. Keine automatischen Downloads.

36 unterschiedliche Methoden (16 neu,20 Inventar),2 erwartete Originalfehler,
3 Mutationen,3 Paketproben. Wiederholungen zählen nicht doppelt. Die tatsächliche
frische ZIP-Endprüfung steht außerhalb des ZIP in der Abschlussdatei.

Websitequellen unverändert38/59;21 fehlend. Masterplan und formale Gates
unverändert. Keine Kontoverbindung, kein Botstart, kein Deployment.
