# ExtremeLab · S01 InventoryConsolidation

Ein konsolidiertes privates Quelleninventar auf Basis von SnapshotConsumerGuard. Keine Produktänderung, kein neuer Controller und keine öffentliche Installation.

## Einstieg

`UEBERGABE.md` bezeichnet den Fortsetzungspunkt. `RUN_S01_REPORT.md` erklärt Änderungen und Prüfgrenzen. Die fünf ursprünglichen Pflichtlieferdateien bleiben unter `evidence/S01/` erreichbar und verweisen auf `S01_CURRENT_INVENTORY.json`. Die Kriterienzuordnung steht in `S01_INVENTORY_ACCEPTANCE.md`.

**38 vollständige Produktionsinputs, fünf nur als Präfix zugänglich, 16 nur als Metadaten bekannt.** Damit fehlen weiterhin 21 Vollquellen. Keine zusätzliche Produktionsdatei wurde wiederhergestellt. Originalquellen und die drei privaten Patchvorschläge sind unverändert.

## Offline prüfen

Erforderlich sind Linux, libseccomp, Python mit Brotli und Node. Keine Downloads. Die vollständige Prüfung muss als normaler Benutzer, nicht als root, laufen:

```sh
python -B verify_package.py
python -B tools/check_inventory_consistency.py
python -B tools/run_inventory_checks.py --reports-dir /absoluter/neuer/externer/logordner
```

Der Runner prüft 40 unterschiedliche Inventar- und Regressionstestmethoden. Zusätzlich führt er den echten ersten Original-Buildschritt aus: Dieser erzeugt fünf bytegleiche Basisdateien und scheitert anschließend am fehlenden Overlay. Der erwartete Fehler ist **kein erfolgreicher Vollbuild**. Die früheren Produktverhaltenstests werden nicht wiederholt. Negative Manipulationsproben werden separat gezählt.

Der SHA-256 des endgültigen ZIPs muss mit der externen Übergabe verglichen werden. Das Paketmanifest allein ist keine unabhängige Authentisierung. Protokolle bleiben außerhalb des Pakets. Die 320 Vorgängerdateien sind aus unveränderten Dateien und `baseline/inventory_checkpoint/` rekonstruierbar.

Masterplan, Gatecheckpoint und formaler Status bleiben unverändert. Ein konsistentes Inventar erteilt keine Produkt-, Broker- oder Veröffentlichungsfreigabe.
