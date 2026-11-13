# ExtremeLab S01 – Ist-Schnittstellen und Originalintegration

Privates Offlinepaket. Start: `docs/architecture/existing-interfaces.md`, dann `RUN_S01_REPORT.md` und `UEBERGABE.md`.

Der neue Prüflauf verbindet die vorhandenen Originalkomponenten; keine neue Produktimplementierung. Ausführen als normaler Benutzer:

```sh
python -B verify_package.py
python -B tools/run_interface_checks.py --node /absoluter/pfad/zu/node --reports-dir /neuer/externer/logordner
```

Node >=24.10, Python und Linux/libseccomp. Kein automatischer Download. Alle Testdaten synthetisch, keine Broker-/Kontoverbindung. Nur AF_UNIX-Sockets erlaubt. Ergebnislogs müssen außerhalb dieses Pakets liegen. Alte Runner und Reports bleiben historische, unveränderte Belege; sie wurden nicht allein durch Aufnahme in dieses ZIP neu ausgeführt.

Maßgeblich für diese Ausführung sind die separat gelieferten frischen Prüfprotokolle und die Abschlussprüfung. Ein selbstenthaltenes Hashmanifest ist keine unabhängige Abnahme; der extern mitgeteilte ZIP-Hash verankert die Fassung. Quellenbestand und formale Gates sind unverändert.
