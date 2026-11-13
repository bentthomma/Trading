# ExtremeLab Masterplan 1.2.0

Gültig ist `plan.json`, der zugehörige Lock und `control/state.json`.

Der Nutzer hat die verpflichtende Reviewer-Abnahme ausdrücklich aufgehoben:
„Ne lösch das komplett mit dem Revierer und mach weiter“.
AM-002 dokumentiert den alten und neuen Hash. Frühere Fassungen und unabhängige
Reviewberichte bleiben reine Historie, nicht aktive Freigabevoraussetzungen.

Ein Bearbeiter darf lokal starten, prüfen, abschließen und fortsetzen.
Pflicht bleiben reale Gitänderungen, passende Revisionen, vollständige gehashte
Nachweise, bestandene Kartenprüfungen, Abhängigkeiten und Design-/Scope-Gates.
Keine fingierte zweite Identität. Der lokale Abschluss ist keine Behauptung einer
installierten GitHub-CI und kein Broker-/Deploymentrecht.

## Sicherheits- und Arbeitsgrenzen

Keine öffentlichen GitHub-Schreibaktionen, Deployments, Broker-/Kontoverbindungen
oder Live-/Demobots ohne separate ausdrückliche Freigabe. Originalarchive bleiben
unverändert. S01 darf fehlende Fähigkeiten konkret als blocked_capability erfassen;
dies gibt keine unbewiesene Integration frei.

## Ausführung

`python -B governance/masterplan/control/planctl.py --project-root . next`

Die Karten unter `steps/` enthalten den konkreten Umfang. Der vorhandene Controller
bleibt die einzige Statusschnittstelle. `finish` prüft Git und Hashes erneut.
Die Evidenz liegt als `evidence/Sxx/completion.json` nach dem geprüften Commit vor.
Nur diese genaue Datei und die Statusdatei dürfen vor dem Abschluss uncommitted sein.
Prüfartefakte müssen bereits im geprüften Commit liegen und unverändert sein.

## Historie

Die frühere 1.1.0-PDF, alten Audits, Quellenreferenzen und historischen Nachweise
sind keine aktuelle Anweisung. Der Originalstand bleibt im Vorher-Gitcommit und
im unveränderten Ausgangsarchiv vollständig rekonstruierbar.
