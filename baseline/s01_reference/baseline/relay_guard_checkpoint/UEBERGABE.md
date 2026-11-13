# S01 RelaySnapshotGuard – exakte private Fortsetzungsübergabe

## Maßgebliche Linie

Dieser Stand setzt `ExtremeLab_S01_LiveEncodingFix_Offline.zip` mit SHA256
`a4e99bb549eb34e6fde1aca0b2c775c1136bf361ac0653617df29648085a133b` fort.
**Keine zusätzliche Produktionsquelle: weiterhin 38/59, 21 fehlen.**
Der Masterplan1.1.0 mit SHA256
`60303e48156a187d065ad66e884398a71853e955a4acc1322ab8d9dd9d97ae7d`
und der offizielle Status sind unverändert. Private S01-Arbeit ist autorisiert,
keine formale S00-/S01-Abnahme wurde erteilt.

## Abgeschlossenes fachliches Paket

Original-Python-Relay 1.3.3-qa aus dem Engine121-Archiv auf reproduzierte BARS-
Snapshotfehler geprüft. Ein vorhandener Readpfad wird in genau einer getrennten
Quelldatei korrigiert: kein neuer Relay, keine Ingest-/ACK-Änderung, keine
Journalbereinigung. Echtes SQLite, aiohttp-HTTP/WebSocket und Unix-Transport.
Original-Gegenfälle: Zahl -> HTTP500; Zeichenkette -> falsche vollständige
Kerzenzählung. Vorschlag: unvollständige Diagnose mit Ereignissequenzen, keine
Zählung ungültiger Chunks, Wiederherstellung durch neuen gültigen Checkpoint.

Wichtig: Pythonrelay ist **nicht** die fehlende `src/lib/relay.mjs`. Er darf sie
weder ersetzen noch die Zahl vorhandener Websiteinputs erhöhen. Der vorhandene
JavaScript-Encodingpatch bleibt unverändert und wurde nicht nochmal ausgeführt.

## Präziser Vertrag und Grenzen

Neue Diagnose: `checkpoint.invalidPayloadSequences` und
`completeness=invalid_candle_payload`. Rohdaten bleiben sichtbar; ein Client muss
Diagnose und `partialSnapshot` beachten. Keine vollständige Kerzenfeldvalidierung,
keine direkte Integrationsfreigabe. `checkpoint.complete` beschreibt weiterhin
gespeicherte Teile, nicht zwingend alle in einer größenbegrenzten Antwort
enthaltenen Daten. Die Tests und der Bericht dokumentieren diese Grenze.

## Reproduzieren

```sh
python -B verify_package.py
python -B tools/run_relay_snapshot_checks.py --reports-dir /neuer/externer/ordner
```

Linux/libseccomp, Python mit aiohttp und Brotli, nativer patch-Befehl.
Erwarteter Umfang: 19 neue +24 Originalstorage +20 Inventar =63 Methoden,
2 gesonderte Original-Gegenfälle,3 Verhaltensmutationen,3 Paketproben.
Maßgeblich sind ausschließlich die tatsächlichen externen Abschlussprotokolle
zum endgültigen ZIP. Keine historischen Testzahlen addieren.

Alle 277 Vorgängerdateien sind über unveränderte Dateien oder
`baseline/live_encoding_checkpoint/` rekonstruierbar. Dessen
`ORIGINAL_MANIFEST.json` enthält die alte Bindung; das neue Rootmanifest bindet
das ganze aktuelle Paket. Vor Anwendung immer externen ZIP-Hash und beide
Quelldateihashes aus `proposals/relay-snapshot-guard/proposal.json` prüfen.

## Konkreter nächster Schritt

Keinen zweiten Relay und keine wiederholte Snapshot-Suite anlegen. Für die
beabsichtigte Websiteintegration zuerst vollständige Originalbytes des finalen
Snapshotverbrauchers und JavaScript-Relays beschaffen und hashbinden. Dann die
neuen Diagnose-/Partialantworten am echten Verbraucher überprüfen. Ohne diese
Quellen bleibt genau diese Fähigkeit blockiert; keine Ersatzsuffixe erfinden.
Der Pythonpatch ist abgeschlossen vorbereitet, aber nicht unabhängig genehmigt
oder installiert. Öffentliche Installation braucht separate Zustimmung.

GitHub nur lesend: Initialcommit, vollständiger Baum nurREADME. Keine Broker-
oder Kontoaktion, keine Änderung an Masterplan, Gates oder Originalprodukten.
