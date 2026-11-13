# ExtremeLab – S01 Control/ACK Boundary

Privater Ein-Dateien-Vorschlag am vorhandenen Hub: konsistente Ablaufgrenze und Antwortzeit, mit Original-HTTP-/SQLite-Wiederanlaufprüfungen. Kein installierter Stand.

- Bericht: `RUN_S01_REPORT.md`
- Fortsetzung: `UEBERGABE.md`
- Quell-/Zustandskarte: `docs/architecture/control-ack-boundary.md`
- Kandidat und exakter Patch: `evidence/S01/control-ack-audit/`
- Maßgebliche Originalbasis: `baseline/original_platform097.zip`
- Unverändertes Quelleninventar: 38/59 Websiteoriginale, 21 fehlende Vollquellen.

## Reproduktion

Als normaler Benutzer auf Linux mit libseccomp, Python 3, GNU patch und Node >=24.10:

```sh
python -B evidence/S01/control-ack-audit/run_checks.py \
  --node /absoluter/pfad/zu/node24 \
  --reports-dir /neuer/externer/logordner
```

Der Runner entpackt die Originalplattform temporär, reproduziert vier fachliche Originalfehler, wendet den Patch an, prüft bestehende Komponenten und dreht ihn exakt zurück. Netzwerk-Sockets ausser AF_UNIX werden verweigert. Er verändert keine Produktinstallation und führt kein natives SDK aus. Ergebnislogs müssen ausserhalb des Pakets liegen. Frühere Testzahlen in übernommenen Dokumenten sind historische Angaben.
