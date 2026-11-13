# ExtremeLab – privates S01 Addon-Build-Audit

Arbeitsumfang: Original-Addon als Zwischenstufe reproduzieren, archivierte Originaltests auf dessen echten Erzeugnissen ausführen und die Grenze zur fehlenden finalen Skin-Stufe dokumentieren. Kein vollständiger Website-Build und keine Installation.

```sh
python -B verify_package.py
python -B tools/run_addon_checks.py --reports-dir /tmp/extremelab-addon-pruefung
```

Der Berichtsordner muss ausserhalb des Pakets liegen und leer beziehungsweise neu sein. Voraussetzungen: Linux, libseccomp, Python 3 mit Brotli sowie Node 22.16.0 (tatsächlich geprüft). Kein npm install, keine Zugangsdaten, keine Providerverbindung. Die Tests arbeiten in Wegwerfkopien mit gesperrtem Netzwerk-Verbindungsaufbau.

Die sechs Dateien unter `baseline/derived_account_stage` sind erzeugte **Zwischenstände**, keine sechs zusätzlichen Provider-Inputs und keine bestätigten finalen Website-Dateien. `baseline/vercel_recovered/src` bleibt bei 36 von 59 Originalinputs. Frühere Tests/Protokolle in übernommenen Dateien sind historische Belege.

Aktueller Bericht: `RUN_S01_REPORT.md`. Fortsetzung: `UEBERGABE.md`. Quellen-/Versionsinventar: die fünf bestehenden Lieferdateien unter `evidence/S01/`. Unverändertes Vorgängerpaket: `baseline/prior_endpointrecovery.zip`.

Der externe ZIP-Hash muss zuerst zur Übergabe passen. Das interne Manifest beweist Integrität relativ dazu, keine unabhängige Freigabe. Offizielle Gates unverändert; keine GitHub-Schreibaktionen oder Brokeraktionen.
