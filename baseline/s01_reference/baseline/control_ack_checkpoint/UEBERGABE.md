# ExtremeLab – S01-Fortsetzungsübergabe: tatsächliche Schnittstellen

## Maßgebliche Basis

Dieses Paket baut auf `ExtremeLab_S01_InventoryConsolidation_Offline.zip` mit SHA-256 `e948472e28dad697a677add0fa74fb0915d6d115de34f0cec81157e7bad727a6` auf. Die 344 manifestierten Vorgängerdateien bleiben am alten Pfad oder in `baseline/interface_checkpoint/` rekonstruierbar. Vollständiges Original: `baseline/original_platform097.zip`, SHA-256 `6530c9c46cab0c6f411fdb682f3c74d4c9140742e698aa48c835bc60ba190c6d`.

## Erledigter privater Umfang

`docs/architecture/existing-interfaces.md` und `evidence/S01/interface-map.json`: 12 Originalschnittstellen, ihre Quellen/Speicher und Grenzen. `vendor-manifests/S01_INTERFACE_SOURCE_BINDINGS.json`: 23 genaue Quelldateien, fünf bytegleiche Produktions-/Addonbindungen. Originalserver über Unix-HTTP und echte SQLite, Authentisierung, Neuöffnung, passive Reconciliation und Remoteprojektion geprüft; native Sender nur als Quelle. Die Pfad- und Donormatrix verweisen auf die Karte.

## Reproduktion

```sh
python -B tools/run_interface_checks.py --node /absoluter/pfad/zu/node --reports-dir /neuer/externer/logordner
```

Linux, libseccomp, Python und Node >=24.10; normaler Benutzer. Runner entpackt nur den lokalen Originalquellbaum in ein temporäres Verzeichnis, startet keinen Bot und verweigert IP-Sockets. Erwartet: 153 verschiedene Methoden, drei erkannte semantische Mutationen, drei Paketmanipulationen. Die tatsächlich ausgeführten frischen Ergebnisse sind extern mitgeliefert, nicht aus dieser Sollzahl abzuleiten. Archivprüfer und Vorgängerbytes vor jedem neuen Eingriff nachweisen.

## Was nicht behauptet werden darf

38/59 Originalwebsiteinputs vollständig; 21 fehlen weiterhin. Kein neuer Input, Vollbuild, nativer Build, Broker-/Kontotest oder vollständiger Cloudnachweis. Vorhandener `revolution.js`-Addonclient ist nicht der fehlende finale Skin-/Liveclient. `api/socket.js`/XL1-XL2 ist nicht `/api/bridge/journal`/Journal20. Der lokale Beobachter liefert keinen Engine-Handelsplan. Remoteprojektion ist kein Restorearchiv. `source.fresh=true` bedeutet nicht, dass jede Position frisch oder der Bestand vollständig ist. Neue Methoden beweisen nicht unabhängig native Ausführung oder Handelsfreigaben.

## Nächster konkreter Punkt

Am bestehenden `core/control.mjs`, zugehörigem Bridge-SDK und den Originaltests den **Vorschlag → ausdrückliche menschliche Bestätigung → native ACK → bestätigte Revision**-Pfad abgleichen, insbesondere Neustart und verspätete/widersprüchliche ACKs. Nur private Quellen-/Offlinearbeit, ohne neuen Controller, produktiven Start oder Planänderung. Der aktuelle Ist-Schnittstellenabgleich ist abgeschlossen; eine Wiederholung braucht eine konkrete neue Hypothese.

Masterplan 1.1.0, S00/S01-Gatestatus, Originals und drei Privatpatches bleiben unverändert. Keine unabhängige Abnahme oder S02-Aktivierung; keine GitHub-Schreibaktion, Publikation, Deployment- oder Brokeraktion.
