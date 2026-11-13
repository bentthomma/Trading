# ExtremeLab · S01 RelaySnapshotGuard · privater Prüfstand

**38/59 Website-Originalinputs; 21 fehlen. Keine neue Produktionsquelle.**
Dieser Stand setzt das LiveEncodingFix-Paket fort und ergänzt einen getrennten,
minimalen Vorschlag am originalen Python-Relay aus dem Engine-1.2.1-Archiv.
Es ist **nicht** der fehlende JavaScript-Relay und keine Produktinstallation.

## Reproduzieren

```sh
python -B verify_package.py
python -B tools/run_relay_snapshot_checks.py --reports-dir /neuer/externer/logordner
```

Linux, libseccomp, Python 3.13.5, aiohttp 3.13.3 und `/usr/bin/patch` wurden für
diesen Lauf verwendet. Die geerbten Inventarprüfungen benötigen Brotli. Keine
Installation oder Downloads im Runner. Alle Testkinder dürfen ausschließlich
Unix-Domain-Sockets anlegen; IPv4/IPv6/Packet-Sockets sind gesperrt. Der Runner
übergibt keine fremden Umgebungsgeheimnisse oder Netzwerkdeskriptoren.
Dies ist eine Netzsperre, keine allgemeine Sicherheits-Sandbox.

Der vorgesehene Umfang ist 19 neue Methoden + 24 unveränderte Original-
StorageTests + 20 Inventarregressionen = **63 unterschiedliche Methoden**.
Zwei Original-Gegenfälle, drei Verhaltensmutationen, drei Paketmanipulationen und
der native Patch-Rundlauf werden gesondert geführt. Maßgeblich sind tatsächliche
extern gelieferte Endprotokolle, nicht diese Beschreibung eines Sollumfangs.

Originalbasis: `baseline/relay_snapshot/relay.py`. Getrennter Vorschlag:
`proposals/relay-snapshot-guard/`. Beide ursprünglichen Archive sind enthalten.
Die vorhandene LiveEncodingFix-Fassung ist unverändert, nicht nochmals als
neuer Funktionstest ausgeführt und nicht automatisch mit diesem Relay verbunden.

Bericht: `RUN_S01_REPORT.md`; exakter Fortsetzungspunkt: `UEBERGABE.md`.
Der Vorgänger bleibt über `baseline/live_encoding_checkpoint/` rekonstruierbar.
Masterplan, offizieller Status, Produktoriginale und Freigaben bleiben unverändert.
