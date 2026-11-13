# S01 – konsolidierter Quellen- und Versionsabgleich

Arbeitskennung: **S01-INVENTORY-CONSOLIDATION** · 2026-11-13

## Aktueller, nach Bytes abgeglichener Bestand

| Bestand | Verifizierter Quellenstatus | Nicht daraus ableiten |
|---|---|---|
| Website-Originalinputs | **38 vollständig, 5 nur Präfixzugriff, 16 nur Metadaten = 59**;21 Vollquellen fehlen. | Kein vollständiger Websitebuild. |
| Engine 1.2.1 | 12 Originalquell-Dateien und drei produktionsidentische Botsegmente vorhanden; Quellzuordnung bereits belegt. | Kein neuer nativer Build, keine Gleichsetzung mit1.9/2.0. |
| Pythonrelay 1.3.3-qa | Original aus Engine 1.2.1-Archiv und getrennte Vorschlagskopie vorhanden. | Nicht der fehlende Vercel-JavaScriptrelay. |
| Journalansicht nach patch_ui | Originale Zwischenstufe und separater SnapshotConsumer-Vorschlag vorhanden. | Nicht der finale Skin-/Live-Verbraucher. |
| Account-Addon | Sechs erzeugte Zwischendateien, historische Originaltests belegt. | Spätere Skin-Stufe überschreibt Reader; keine finale Readerabnahme. |
| Dashboard polished-02 | Archiv/Brotli-Bundle geprüft; sechs Originalausgaben; kein Hash passt zu fehlenden Produktionsinputs. | Nicht als Skinbundle einsetzen oder als zusätzliche Eingabedateien zählen. |
| Platform 0.9.7 | Vollarchiv vorhanden, ausgewählter privater Donor. | Keine Behauptung einer Liveinstallation. |
| Engine 1.9 | Nur historische Preview-/Quellenmetadaten. | Keine originalen Releasebytes oder neue native Kompilation. |

## Ein verbindlicher aktueller Index

`S01_CURRENT_INVENTORY.json` bindet alle aktuellen Angaben an Katalog, Originalbaum, Masterplan und unveränderten Gatecheckpoint. `baseline-lock.json`, `donor-map.json`, `path-map.json` und `reproduction-report.json` referenzieren genau diesen Index. Historische `current_*`-Blöcke bleiben explizit historisch.

## Regeln der Zuordnung

Eine vollständige Quelle ist kein Buildartefakt und kein geprüfter Laufzeitadapter. Eine Build-Zwischenstufe zählt nicht als zusätzlicher Produktionsinput. Ein privater Patch ist kein Produktionsoriginal. Providerpräfixe werden nie als Vollquelle abgelegt. Herkunft per Hash ist keine unabhängige Freigabe oder Nutzungsrechtserteilung.

## Formale Grenzen

Masterplan 1.1.0 und GATE_STATUS.json sind bytegleich. Deren älterer 28/31-Quellenzähler ist ein historischer Checkpoint; pending/Freigaben bleiben unverändert. S01-C02 erlaubt den Inventarabschluss trotz `blocked_capability`, aber dieses Paket erteilt keine unabhängige Abnahme. Entwicklungsstand: private lokale Verzeichnisfassung, kein installierter Git-Entwicklungszweig.

## Historie

Die vollständige vorherige Versionschronik steht unverändert unter `baseline/inventory_checkpoint/evidence/S01/version-crosswalk.md`. Vorherige Tests werden nicht als neu gezählt. Die drei Vorschläge und ihre Originalbindungen stehen weiterhin unverändert unter `proposals/`.
