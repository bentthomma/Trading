# ExtremeLab · S01 BotDeliveryRecovery · privat/offline

Aktueller Quellenstand **38/59**, **21 fehlen**. Neu gesichert sind die tatsächlichen
Produktionsbytes von `build-bot.mjs` und `api/bot-download.js`, nicht neue Ersatzmodule.

Reproduktion (Python mit Brotli, Linux/libseccomp, Node24.x):

```sh
python -B verify_package.py
python -B tools/run_bot_delivery_checks.py --node /absoluter/pfad/zu/node --reports-dir /neuer/externer/logordner
```

Der Runner schreibt nur in Wegwerfverzeichnisse und den externen Logordner. SDK-Download
wird ausdrücklich verweigert; kein npm install, keine .NET-Installation, kein Botstart.
Exit0 bedeutet 33 begrenzte Methoden plus15 Originalprüfaussagen bestanden, NICHT
vollständiger Websitebuild, nativer Binärbuild oder unabhängige Abnahme.

`RUN_S01_REPORT.md` erklärt Quellen, Grenzen und den tatsächlichen Prüfumfang.
`UEBERGABE.md` nennt den exakten Fortsetzungspunkt. Für dieses Paket ist nur
`tools/run_bot_delivery_checks.py` der aktuelle Gesamtrunner. Übernommene frühere
Runner und deren `current_*`-Ergebnisse sind historische Prüfstände; nicht blind als
aktuelle Gesamtabnahme ausführen oder ihre Zahlen erneut addieren.

Frischer Endpaketbeleg wird separat geliefert. Keine öffentlichen Schreibaktionen,
Brokerzugriffe oder Änderungen des gültigen Masterplans/Gatestatus.
