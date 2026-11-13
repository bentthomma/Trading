# ExtremeLab – private S01-Fortsetzung: Control/ACK-Grenze

## Maßgebliche Basis und Auflösung paralleler Übergaben

Fortgesetzt wird **InterfaceMap**, ZIP-SHA-256 `d75823854890646bcc804ff86941f89af4d36da02d9e2f3ac31e5a5bc22fc13a`. Die parallele InterfaceBinding-Fassung (`5f79259894050cf132caa2e436b1bd8ee01a393f92f89464e3236e4917c1b1e6`) wird nicht als dessen Vorstufe ausgegeben. Ihre separaten IF-11-/IF-12-Aufträge bleiben offen. Beide Originalmanifeste wurden vollständig geprüft; Details in `evidence/S01/control-ack-audit/provenance.json`.

Alle 359 manifestierten InterfaceMap-Dateien sind bytegleich am ursprünglichen Ort oder unter `baseline/control_ack_checkpoint/` rekonstruierbar. Die fünf S01-Pflichtdateien, 38 Produktionsoriginale, alle bisherigen Vorschläge, Masterplan 1.1.0 und Gatecheckpoint bleiben unverändert.

## Erledigter Umfang

Der tatsächliche Vorschlag-/Bestätigungs-/Heartbeat-/ACK-Pfad wurde über Original-HTTP, Session/MCP und SQLite geprüft. Vier fachliche Gegenfälle zeigen die widersprüchliche Ablaufgrenze beziehungsweise Antwortzeit. Ein separater Vorschlag ändert ausschliesslich `core/control.mjs`: inklusive Ablaufgrenze, strikt gültige Auswahl und gemeinsamer Entscheidungszeitpunkt.

Die vollständige nächste Prüfung ist reproduzierbar über:

```sh
python -B evidence/S01/control-ack-audit/run_checks.py --node /absoluter/pfad/zu/node24 --reports-dir /neuer/externer/logordner
```

Als unprivilegierter Linuxbenutzer; libseccomp und GNU patch erforderlich. Die tatsächlich gemessenen frischen Resultate stehen extern in der Abschlussprüfung/den Logs. Keine neue Ausführung alter Testzahlen behaupten. C15 ist statischer SDK-Abgleich; C16 weist eine weiterhin offene Grenze nach. Die C#-Bridge wurde nicht kompiliert oder gestartet.

## Konkreter nächster Anschluss

Den vorhandenen **negativen ACK-/Duplikatpfad** präzisieren, nicht einen weiteren Controller erfinden. C16 reproduziert: ursprüngliche negative Quittung, später angewandte Konfiguration, identische Wiederholung abgewiesen, veränderter Payload mit alter Quittungsidentität als Duplikat akzeptiert. Die aktuelle Revision bleibt dabei erhalten; kein Handelsbypass wurde bewiesen.

Vor einem Patch den tatsächlichen `sdk/HubBridge.cs`-Wiederholungsablauf und bestehende SQLite-/Bestandsdaten berücksichtigen. Insbesondere nicht durch pauschales Akzeptieren beliebiger Ablehnungen oder durch Löschen von Historie „lösen“. Ein atomarer unveränderlicher Quittungsbeleg wäre ein gesonderter, zu prüfender Vorschlag; keine vorhandene Datenbankmigration eigenmächtig aktivieren.

Der Fristpatch ist fachlich abgegrenzt. Seine drei Schutzstellen wurden getrennt geprüft. Nicht dieselbe Map-/Quellensuche oder die unveränderte gesamte Produktsuite wiederholen, ausser eine konkrete neue Hypothese erfordert es. Kein Rollout dieses Patches ohne gesonderte Freigabe und unabhängige Prüfung.

## Unveränderte Grenzen

38/59 Websiteinputs vollständig; 21 fehlen. Keine neue Produktquellenversion, keine Rekonstruktion fehlender Skin-/Relaydateien, kein Vollbuild. Native Callback-Ausführung, Windows-/Cloud-/Brokerverhalten sind unbestätigt. S00/S01 nicht formal abgenommen, S02 nicht aktiviert. Kein GitHub-Schreiben, Deployment, Konto- oder Brokerkontakt.
