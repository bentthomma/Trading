# ExtremeLab · S01 LiveEncodingFix · privater Prüfstand

**Quellenbestand unverändert: 38/59 Originalinputs, 21 fehlen.**
Ein tatsächlich reproduzierter HTTP-Fehler wird in einer separaten Kopie des
vorhandenen `api/live.js` korrigiert. Keine Integration oder Freigabe.

```sh
python -B verify_package.py
python -B tools/run_live_encoding_checks.py --node /absoluter/pfad/zu/node --reports-dir /neuer/externer/logordner
```

Voraussetzungen: Linux/libseccomp, Python mit Brotli, Node22.16.0 (hier geprüft).
Keine Installation, Downloads, Cloud-/IP-Verbindungen oder Broker. Echte HTTP-
Anfragen laufen über temporäre Unix-Domain-Sockets. Der Runner sperrt die Anlage
anderer Socketfamilien für seine Kinder. Keine allgemeine Sandboxbehauptung.

Aktueller Runner: `tools/run_live_encoding_checks.py`. Übernommene Runner und alte
`current_*`-Ergebnisse sind historische Arbeitsstände, keine aktuelle Gesamtabnahme.
Erwartet:49 unterschiedliche erfolgreiche Methoden; Original-Gegenprüfung2/18
passend zum **erweiterten vorgeschlagenen Vertrag**,16 erwartete Abweichungen;
3 gezielte Verhaltensregressionen und3 Paketmanipulationen erkannt. Die negativen
Gegenprüfungen werden nicht zu den49 addiert. Reproduzierbarer Patch-Rundlauf
benötigt zusätzlich `/usr/bin/patch` und verändert nur eine Wegwerfkopie.

Quellenvorschlag und lokaler Entscheidungsvertrag: `proposals/live-encoding/`.
Herkunft, Grenzen und Folgeauftrag: `RUN_S01_REPORT.md`, `UEBERGABE.md`.
Der endgültige ZIP-Testbeleg wird separat bereitgestellt; das Archiv selbst
behauptet keine noch nicht durchgeführte frische Endprüfung.
