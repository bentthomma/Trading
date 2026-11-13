# S01 RemoteView20 – exakte Fortsetzungsübergabe

## Ausgangsstand und unveränderte Grenzen

Vorgänger: `baseline/prior_addon_build_audit.zip`, SHA-256
`ffe6f6ffd813d6304306ef08070899f981834b12a0a6e11810c5d55566fdcf4d`.
Originalplattform 0.9.7: `baseline/original_platform097.zip`, SHA-256
`6530c9c46cab0c6f411fdb682f3c74d4c9140742e698aa48c835bc60ba190c6d`.
Masterplan 1.1.0 SHA-256
`60303e48156a187d065ad66e884398a71853e955a4acc1322ab8d9dd9d97ae7d`.
36/59 Produktionsinputs bytegleich, 23 fehlen. Formaler S01-Status unverändert.

## Neu erreicht

Zehn Original-Addondateien sind bytegleich zwischen Plattformarchiv und
Produktionsquelle gebunden. 64 originale lokale Dateien werden zusätzlich
gegen das mitgelieferte Archiv geprüft. Der originale SQLite-Journalproducer
läuft jetzt über den **tatsächlichen** API-Einstieg samt originalem Session-
prüfer, HTTP-Dispatcher und Registry-Adapter bis zum JSON-Lesepfad.

Prüfumfang: 14 neue Methoden, 18 unveränderte Originalmethoden und 20 bestehende
Inventarregressionen. Die finale ZIP-Prüfung ist im externen Ergebnis belegt;
interne PREPACK-Ergebnisse sind nicht mit ihr gleichzusetzen. Drei gezielte
Verhaltensmutationen sowie drei Paketmanipulationen sind getrennte Gegenproben.
Node 24.11.1 liegt lokal als Playwright-Treiber vor; keine Installation nötig.
Kein neuer .NET-/Windows-/Brokerbeleg.

## Wesentliche weiterhin offene Grenzen

- Registry-Schreiben plus Cache-Schreiben sind nicht atomar. Kopplung/Widerruf
  können nach 503 bereits gespeichert sein. Expliziter Status-/Widerruf-/Neu-
  kopplungsweg wurde am Original geprüft, nicht automatisch ausgeführt.
- Ein widerrufenes Gerät kann noch im alten Authcache stehen. Bestehende Grenze:
  höchstens fünf Minuten, danach erneute Registryprüfung. Keine Sofortwirkung.
- Ein Snapshot kann trotz fehlender ACK im Lesepfad vorhanden sein. SQLite-Slot
  verhindert wiederholten Versand nach Producer-Instanzwechsel. Keine künstliche
  Quellfrische durch jüngere Übertragung.
- SDK-Provider sind Testdoubles. Keine reale Vercel-Blob-/Cache-/Mehrhost-Abnahme.
- Browserstart möglich, Navigation vor Anwendung mit
  `ERR_BLOCKED_BY_ADMINISTRATOR` blockiert. Kein UI-Test erfolgreich, keine
  Browserpolicy verändert. Vorhandenes Frontend nur statisch abgeglichen.

## Reproduktion

Aus dem Paketroot mit Python (Brotli-Modul wie bisher) und Node 24.x:

```sh
python -B tools/run_remote20_checks.py \
  --node /absoluter/pfad/zu/node \
  --reports-dir /neuer/externer/pruefordner
```

Linux/libseccomp erforderlich. Ausgabe außerhalb des unveränderlichen Pakets.
Kein `npm install`, kein Netzwerkzugriff und keine Credentials erforderlich.
Vorhandener Paketprüfer: `python -B verify_package.py`.
Der Runner arbeitet in Wegwerfkopien und verändert weder die Originalquellen
noch den übergebenen Plan-/Gatecheckpoint. Mutationstests sind Testkopien.

## Nächster sinnvoller Schritt

Dieses Audit und die ältere Konto-Addon-Zwischenstufe sind abgeschlossen. Nicht
nochmals dieselben Prüfungen als neuen Fortschritt ausführen. Die derzeit
fehlende Fähigkeit bleibt der vollständige Originalexport von Overlay/Skin und
den weiteren 23 Inputs. Bei neuen Vollbytes zuerst Quellenbindung, dann die
**gesamte** Originalpipeline und deren finalen Reader prüfen. Ohne neue Quellen
keinen Ersatzreader, kein geschätztes Bundle und keinen formalen S01-Abschluss
anlegen. Die fünf S01-Lieferdateien enthalten nun die konkrete Teilintegration
und die gesonderten blockierten Fähigkeiten für eine unabhängige Bewertung.

GitHub nur lesend: Initialcommit `1a5cfe9d3139276f5432c79a8ee0be1938b7066c`, Baum
mit README allein. Keine Workflow-/PR-Abfragen in diesem Lauf. Keine öffentlichen
Änderungen, Veröffentlichung, echten Zugangsdaten oder Brokeraktionen.
