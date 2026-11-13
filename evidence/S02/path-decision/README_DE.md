# S02 · Exakte Pfadentscheidung – vorbereitet, nicht aktiviert

## Ergebnis und Geltung

Der aktive Plan bleibt 1.2.0; S00 und S01 bleiben passed, S02 bleibt wegen fehlender tatsächlicher C#-Ausführung blocked. Dieser Stand behebt die offene Pfadzuordnung, nicht die fehlende Werkzeugkette. Es wird keine Reviewerpflicht eingeführt.

33 Folgekarten sind vollständig abgebildet. 13 bisher abstrakte Modulbereiche werden durch 49 konkrete, im gebundenen Plattformarchiv vorhandene Originaldateien ersetzt. Ihre relativen Verzeichnisse bleiben unter `product/Trading_Local/` erhalten. Nichts wird jetzt dorthin extrahiert. Weitere Bereiche sind ausdrücklich neue, noch nicht implementierte Namespaces – keine wiedergefundenen Originale. Der Websitebestand bleibt 38/59.

Das Ursprungsarchiv bleibt unverändert. Jeder ausgewählte Member ist mit SHA-256, Byteanzahl und exaktem Archivpfad gebunden. Die bereits vorhandene spätere ACK-Korrektur wird zusätzlich gebunden und darf bei einer späteren Materialisierung nicht durch die ältere Originaldatei überschrieben werden. Vor der ersten Änderung ist die Original-/Vorgänger-/Kandidatenauswahl nachzuweisen.

## Schreibkonflikte und Schutzgrenzen

Sechs Paare besitzen Schnittmengen; alle sind durch direkte oder transitive Abhängigkeiten geordnet. Kein unabhängiges Kartenpaar bekommt denselben konkreten Schreibbereich. Das ist eine Aussage über diese Planfassung, keine allgemeine Multiwriter-Sperre und keine Erlaubnis, denselben Schritt mehrfach parallel zu starten.

S03 bleibt Dokumentation. S21 bekommt nur Backend-/Projektionsquellen, keine Layout-/CSS-Dateien. Designgates, Broker- und Veröffentlichungsverbote, Ausschlüsse und alle fachlichen Kriterien bleiben byteinhaltlich gleich. Bereits abgeschlossene S00/S01 sowie der blockierte S02-Zustand bleiben auch im isolierten echten Controller-Replay unverändert.

## Änderungsdateien statt geschützter Plankopie

Ein erster vollständiger Planentwurf innerhalb des Arbeitsbaums wurde vom echten Git-Collector als Kopie der geschützten `plan.json` erkannt und vom Original-Scopeprüfer abgewiesen. Der Prüfer wurde nicht abgeschwächt. Der eingecheckte Vorschlag enthält deshalb nur das fachliche Delta. Die vollständige hypothetische Planfassung entsteht ausschliesslich ausserhalb des Arbeitsbaums:

```sh
python -B evidence/S02/path_resolution.py check
python -B evidence/S02/path_resolution.py export --destination /neuer/externer/ordner
```

Existierende Ziele oder symbolische Verknüpfungen werden abgewiesen. Export ist keine Aktivierung. Es gibt weder ein automatisches `relock` noch eine automatische `completion.json`.

## Reihenfolge der späteren Aktivierung

1. Den bereits vorhandenen `evidence/S02/check_native.py` mit einem echten .NET-SDK ausführen. Keine simulierte C#-Bestätigung. Native Schema- und Null-Grenzfälle müssen tatsächlich erfolgreich sein.
2. Die unten genannte exakte Planfassung exportieren. Im dafür vorgesehenen privaten Amendment-Schritt Plan, Kartenansichten und tatsächliche Quellenbindungen zusammen fortschreiben. Kein laufender Schritt darf beim `relock` aktiv sein; eine blockierte Karte bleibt blockiert, solange ihre Nachweise fehlen.
3. Die vorhandene `Controller.relock`-Operation mit AM-003 verwenden. Die isolierten Tests belegen ihren strukturellen Zustandsübergang; sie aktivieren ihn nicht im Arbeitsprojekt.
4. Aktuelle S02-Bindungen an den neuen Plan anpassen: `source-bindings.json` enthält den aktiven Plan als Quelle; `scope-resolution-draft.json` und `check_sources.py` prüfen noch die alten Sollpfade. Diesen alten Entwurf als Historie erhalten und den aktuellen Checker an die tatsächlich aktivierte, hashgebundene Resolution anschliessen. Kein unbedingtes Zulassen beliebiger Planbytes.
5. `criteria-status.json`, `domain-contract.json` (Planbezug, nicht Schema-Semantik) und Kartenansichten auf die tatsächliche Planfassung bringen; neue Tests und Belege an den aktuellen Git-Head binden. Alte S00/S01-Nachweise werden nicht neu datiert oder überschrieben.
6. S02 mit dem vorhandenen resume/start/verify/finish-Verfahren und vollständigen C01–C04-Nachweisen abschliessen. Folgeschritt ausschliesslich über `next` bestimmen.

Der historische `tools/acceptance/trusted_gate.py` ist ein S00-Bootstrap-Prüfer und bindet bewusst Plan 1.2.0. Der neue Test zeigt, dass er den abweichenden Kandidaten nicht selbst freigibt. Historische Bootstrap-Belege bleiben an ihrer damaligen Revision gültig; sie sind nicht durch pauschales Austauschen von Prüfsummen zu einer Abnahme von 1.2.1 zu machen. Ein späterer gehosteter Validatorwechsel wäre separat zu versionieren; Hosted CI wird hier nicht installiert.

## Zuständigkeiten und Rücknahme

Alle Handlungen bleiben privat und brokerfrei. Die Scopeentscheidung erlaubt keine Broker- oder Kontoaktion, kein Deployment und keinen öffentlichen GitHub-Write. Rücknahme: neuen Vorschlag verwerfen oder aus dem mitgelieferten Vorgängerzweig wiederherstellen. Kein Originalarchiv wurde verändert.

## Exakte Kandidatenbindung

- Aktiver Plan SHA-256: `bdf130088d8a8fe57b69c88f39b7234460bda3dc363d2e3d8a8ff3a2521466c5`
- Vorgeschlagener Plan SHA-256: `443b47e87cb783eed5b7b581c995e948601f912e70c4fd49cc2148a3f9b4fc30`
- Änderungen: nur Version sowie `allowed_paths`, `scope_status`, `path_resolution_note` der 33 späteren Karten.

## Kartenübersicht

| Karte | Konkrete Originalpfade | Neue/Dokumentations-/Testbereiche |
|---|---:|---:|
| S03 | 0 | 3 |
| S04 | 9 | 3 |
| S05 | 0 | 5 |
| S06 | 12 | 3 |
| S07 | 0 | 6 |
| S08 | 12 | 3 |
| S09 | 0 | 5 |
| S10 | 0 | 5 |
| S11 | 0 | 5 |
| S12 | 5 | 4 |
| S13 | 0 | 5 |
| S14 | 0 | 5 |
| S15 | 0 | 5 |
| S16 | 0 | 5 |
| S17 | 0 | 6 |
| S18 | 0 | 5 |
| S19 | 0 | 5 |
| S20 | 0 | 5 |
| S21 | 5 | 8 |
| S22 | 2 | 4 |
| S23 | 6 | 3 |
| S24 | 0 | 5 |
| S25 | 6 | 4 |
| S30 | 0 | 7 |
| S31 | 0 | 10 |
| S32 | 0 | 9 |
| S33 | 0 | 9 |
| S34 | 0 | 10 |
| S35 | 0 | 3 |
| S26 | 0 | 4 |
| S27 | 0 | 5 |
| S28 | 0 | 5 |
| S29 | 0 | 5 |

Mehrfach vorkommende Quellen bei abhängigen Schritten sind in der Gesamtzahl 49 nur einmal gezählt. `resolution.json` enthält alle Ziel-/Quellzuordnungen und die sechs tatsächlichen Schnittmengen.
