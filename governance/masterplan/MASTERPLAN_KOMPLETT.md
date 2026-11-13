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


# S00 · Plansteuerung im Arbeitsprojekt verankern

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Genau einen ausführbaren Plan mit geschützten Abhängigkeiten, überprüfbaren Nachweisen und kleinen Änderungsaufträgen etablieren.

## Abhängigkeiten
Keine

## Eingaben
- Dieses Planpaket vollständig lesen; Originalquellen nur lesend behandeln.
- Zielrepository zunächst unbekannt: kein Produktverzeichnis aus einem alten temporären Pfad annehmen.

## Arbeitsumfang
- Plan, Quelleninventar und historische AP-Zuordnung als neue kanonische Planversion erfassen. Alte Pläne werden Referenzstände und nicht parallel ausführbare Aufträge.
- Einmaliger Bootstrap vor dem Lock: Planpaket samt control-Verzeichnis in den isolierten Arbeitsbereich kopieren, unverändert prüfen, danach lock erzeugen. Ab diesem Zeitpunkt keine Bootstrapausnahme mehr. Initial nur S00 starten; Produktfortschritt steht überall auf pending.
- Der vorhandene lokale Git-Collector liefert den tatsächlichen Änderungsumfang einschließlich unversionierter/ignorierter Dateien, Löschungen, Umbenennungen und Untermoduländerungen. verify/finish prüfen die aktuelle Gitbindung erneut. GitHub-CI bleibt ein separat installierbarer, hier nicht aktivierter Anschluss.
- Keine separate Reviewer- oder Writeridentität erforderlich. Derselbe Bearbeiter darf ausschließlich über den bestehenden nachweisgebundenen verify/finish-Pfad abschließen. Keine manuelle Statusfreigabe aus einer bloßen Zusammenfassung; Autor, Prüfungen und Quellrevision bleiben protokolliert.
- Planänderungen versionieren: alter/neuer Hash, Nutzerauftrag beziehungsweise Begründung und betroffene Folgeschritte werden dokumentiert. Keine unabhängige Reviewerfreigabe; Abhängigkeiten, Scopes, Tests und Berechtigungsgrenzen bleiben verbindlich.
- Fortsetzungsprotokoll anlegen: letzte bestandene Stufe, aktueller Commit, offene Befunde, nächster freigegebener Schritt. Nach Kontextverlust zuerst dieses Protokoll lesen.
- Plansteuerung für die späte Designphase prüfen: S30–S35 verlangen gültige, hashgebundene Desktopfreigabe; veränderte Freigabe oder Referenzbilder sperren Start und Abschluss. S03 darf nur dokumentieren, S21 nur technische Integration verändern; der reale Dateidiff darf diese Grenze nicht umgehen.

## Erlaubte Pfade
- governance/**
- .github/workflows/plan-gates.yml
- docs/plan/**
- tools/acceptance/**
- evidence/S00/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json

## Lieferdateien
- evidence/S00/governance.json
- evidence/S00/ci-negative-tests.json
- evidence/S00/handoff.md

## Prüfungen
- S00-C01 — Ein absichtlich gestarteter Folgeschritt mit offener Abhängigkeit wird abgewiesen.
- S00-C02 — Eine Änderung außerhalb der erlaubten Pfade, ein fehlender Nachweis und eine veränderte Planversion verhindern Abschluss.
- S00-C03 — Reviewerpflicht ist auf ausdrücklichen Nutzerauftrag entfernt. Tatsächliche Gitbindung, technische Prüfungen und kontrollierter lokaler verify/finish-Pfad sind eingerichtet; externer CI-/Branchschutzstatus bleibt separat dokumentiert und erteilt keine Veröffentlichungserlaubnis.
- S00-C04 — Keine Produktstufe wird allein aufgrund des vorliegenden Plans als bestanden markiert.
- S00-C05 — Negative Gateprüfungen weisen vorgezogenen Designstart, ungültige Desktopfreigabe und veränderte Referenzbilder ab; höchstens zwei tatsächlich unabhängige Arbeitspakete laufen gleichzeitig.

## Ausgeschlossen
- Keine Engineentwicklung, keine Datenmigration, keine Websiteveröffentlichung.

## Stopbedingungen
- Ohne tatsächlichen lokalen Git-Änderungsnachweis, passende Revision oder vollständige gehashte Prüfbelege ist kein lokaler Abschluss zulässig. Online-CI, öffentliche Installation und Brokeraktionen werden nicht aus lokaler Prüfung abgeleitet.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet.

## Rückfall
Neue Governanceintegration zurücknehmen; Originalquellen und veröffentlichte Website bleiben bestehen.


# S01 · Quellen, Versionen und Produktionsstand eindeutig sichern

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Den tatsächlichen Bestand und fehlende Quellen verbindlich feststellen; Inventarfreigabe und vollständige Integrationsfähigkeit getrennt nachweisen.

## Abhängigkeiten
S00

## Eingaben
- Quelleninventar und alle drei Auditberichte dieses Pakets.
- Vercel-Produktionsdeployment dpl_6AuCdiuxGSFKnF7svRpykB7XRAmp; vollständige Quellen noch nicht vollständig materialisiert.

## Arbeitsumfang
- Alle Originalarchive unverändert mit SHA256, Herkunft und Zugriffsdatum erfassen. Kein ungeprüftes Startskript ausführen.
- Vercel-Quellbaum vollständig sichern: auch assets.0–3, skin.*, bot-src.*, account-addon.br und live-overlay.b64 sowie alle Buildstufen. Die derzeitigen 23 Dateipräfixe sind ausdrücklich unvollständig.
- Den zu ExtremeLabReady 1.9 gehörenden vollständigen C#-Quellstand und das native Artefakt suchen und verknüpfen. Vorhandenes C17/1.7 darf nicht als 1.9 bezeichnet werden.
- Trading_Local 0.7.0 gegenüber dem in alten Plänen vorausgesetzten 0.8.0 abgleichen. Fehlende 0.8-Funktionen einzeln erfassen; kein stilles Versionshochstufen.
- Websitequellstand, cBot-Build, Brokerprofil, Datenpakete und frühere Labors jeweils separat versionieren. Historische ChatGPT-Site-Experimente erhalten einen Legacy-Eintrag.
- In einem isolierten Zweig unveränderten Build reproduzieren. Erst nach Quellenprüfung erforderliche Herstellerwerkzeuge einsetzen; weder Produktivkonto noch Produktionsdaten für den Build verwenden.
- Donormatrix erstellen: übernehmen, adaptieren, nur Referenz, verwerfen, ungeklärt. Datei-/Funktionsnamen und Besitz-/Nutzungsnachweis mitführen.
- path-map.json erzeugen: Jedes logische Modul wird auf tatsächlich vorhandene Repositorydateien oder ausdrücklich neue Dateien abgebildet. Die vorgeschlagenen apps/*-Pfade erzwingen keine Verlagerung vorhandener core/, sdk/, public/ oder server.mjs-Dateien.

## Erlaubte Pfade
- baseline/**
- docs/architecture/**
- vendor-manifests/**
- evidence/S01/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json

## Lieferdateien
- evidence/S01/baseline-lock.json
- evidence/S01/version-crosswalk.md
- evidence/S01/donor-map.json
- evidence/S01/reproduction-report.json
- evidence/S01/path-map.json

## Prüfungen
- S01-C01 — Jede Quelle ist vollständig, nur als Präfix oder fehlend klassifiziert; keine fehlende Vollquelle wird als vorhanden bestätigt.
- S01-C02 — Reproduktionsbericht enthält für verfügbare vollständige Quellen reale Buildnachweise; fehlende native/Websitequellen stehen als blocked_capability mit genauer Ursache. Inventarabschluss ist trotzdem möglich.
- S01-C03 — Inventarabschluss gibt keine fehlende native Integrationsfähigkeit frei. Unabhängige Offline-Datenarbeit und Referenzdokumentation dürfen fortgesetzt werden; Designimplementierung bleibt bis S30 gesperrt.
- S01-C04 — Produktionsdomain und Entwicklungszweig sind eindeutig; keine versehentliche Veröffentlichung.

## Ausgeschlossen
- Keine Reparatur der Originalstrategien in derselben Änderung.
- Keine automatische Vereinigung der Vercel- und alten ChatGPT-Site-Codebasis.

## Stopbedingungen
- Eine Quelle wird ohne vollständigen Beleg als vollständig/produktionsidentisch ausgegeben. Fehlende Quellen dürfen mit genauer blocked_capability-Kennzeichnung im Inventar abgeschlossen werden.
- Ungeklärtes Nutzungsrecht sperrt die betreffende Codeübernahme, nicht das Quelleninventar.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet.

## Rückfall
Integrationszweig verwerfen oder zum gesicherten Ausgangscommit zurückkehren; Originalarchive bleiben unverändert.


# S02 · Zielarchitektur, Begriffe und Schnittstellen festlegen

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Eine gemeinsame Sprache für Daten, Entscheidungen, Aufträge und Nachweise festlegen, bevor weitere Systeme gekoppelt werden.

## Abhängigkeiten
S01

## Eingaben
- Abgenommene Versionsmatrix; tatsächliche Hub-, cTrader- und MT5-Verträge.
- Die vorgeschlagenen Verträge im Ordner contracts sind Entwürfe, keine existierenden Endpunkte.

## Arbeitsumfang
- Vier Verantwortungen trennen: Website/Bedienung, lokaler Hub/Journal, Forschungsworker, Broker-Ausführung mit eigenem Risikoprüfer.
- Standardentscheidung festhalten: bestehende Web-/Node-Oberfläche erhalten, C#-Entscheidungskern möglichst ohne cTrader-Abhängigkeit extrahieren, Python für Datenanalyse und Forschungsorchestrierung nutzen. Eine Abweichung benötigt einen begründeten Architekturentscheid.
- Das Domänenmodell auf InstrumentVersion, Quote, Bar, FeatureSnapshot, SignalIntent, OrderIntent, BrokerOrder, Deal, Position, Cashflow, Run und PolicyVersion abbilden.
- Zeitstempel trennen: Ereigniszeit, öffentliche Verfügbarkeit, Empfang, Merkmalsfertigstellung, Entscheidung, zulässige Ausführung. Geld, Preis, Stück, Units, Lots, Pip und Kontowährung ausdrücklich typisieren.
- Inbox/Outbox, Sequenz, Wiederholung, Idempotenz, Revision, Schema- und Datenversion definieren. Kontozustand unbekannt ist ein eigener Zustand.
- Fähigkeiten trennen: lesen, Forschung anfordern, Vorschlag erstellen, Demo-Konfiguration übernehmen, nativen Auftrag ausführen. Ein MCP-Zugang erhält daraus keine pauschalen Brokerrechte.
- Alt- und Neuverträge über versionierte Adapter verbinden; eine Migration verändert nie rückwirkend frühere Entscheidungen.
- Nach Architekturentscheidung die Pfadkarte freigeben und S03–S35 über ein versioniertes, nachweisgebundenes Planamendment auf reale Dateiscopes auflösen. Ohne resolved Scope bleibt deren Start gesperrt. S03 erhält ausschliesslich Dokumentationspfade; S21 technische Daten-/Zustands-/Vertragsintegration ohne CSS, öffentliche Layoutänderung oder neue Designsprache; S30–S35 enthalten die spätere Designimplementierung.
- Geld/Preis/Mengen als kanonische Dezimalzeichenketten mit expliziter Einheit übertragen; Zeit als UTC-ISO8601 plus eindeutigem Sequenzwert. Native Double-Werte an der Brokergrenze kontrolliert quantisieren; Indikatoren dürfen Float mit dokumentierter Toleranz verwenden.

## Erlaubte Pfade
- contracts/**
- docs/architecture/**
- adapters/contracts/**
- evidence/S02/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json

## Lieferdateien
- evidence/S02/architecture.md
- evidence/S02/domain-contract.json
- evidence/S02/capability-matrix.json
- evidence/S02/adr-001.md

## Prüfungen
- S02-C01 — Identische fachliche Ereignisse sind in C#, Python und JavaScript ohne Einheitenverlust darstellbar.
- S02-C02 — Unbekannte Schemafelder, NaN/Infinity, unzulässige Einheiten und fehlende Versionsbezüge werden für ausführbare Aufträge abgewiesen.
- S02-C03 — Eine Forschungsantwort kann ohne separate Freigabekette keine Brokerorder erzeugen.
- S02-C04 — Die Website kann ausfallen, ohne dass bestätigte lokale Schutzregeln verschwinden.

## Ausgeschlossen
- Noch kein neuer Brokerwrite und keine neue Strategie.
- Kein universeller öffentlicher Remotezugriff auf localhost.

## Stopbedingungen
- Fachliche Bedeutungen eines vorhandenen Feldes sind unklar.
- Eine Schnittstelle vermischt gemeldeten und bestätigten Zustand.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet.

## Rückfall
Neue Vertragsversion deaktivieren; bestehende kompatible Leser bleiben nutzbar.


# S03 · Freigegebene Designreferenzen früh dokumentieren und erhalten

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Die fünf bestätigten Desktopreferenzen, ihre Grenzen und die spätere Bedienstruktur unverwechselbar sichern, ohne vor Abschluss der Technik Oberfläche oder Animationen umzubauen.

## Abhängigkeiten
S01, S02

## Eingaben
- Vollständiger Websitequellstand, ursprünglicher Browseraudit und Quellenstatus aus S01; Architektur- und Pfadentscheidung aus S02.
- design/approval.json, design/reference_inventory.json und assets/design/approved/: A01-r04, A02-r03, A03-r03, A04-r03, A05-r03.
- design/DESIGNENTSCHEIDUNGEN.md, design/UX_MOTION_SPEC.md und design/visual_acceptance_TEMPLATE.json als verbindliche spätere Umsetzungsgrundlage.

## Arbeitsumfang
- Die fünf Referenzen mit ID, Dateipfad, SHA256, Bildabmessungen, Freigabewortlaut und Datum erfassen. Ältere Varianten bleiben Historie und erhalten keinen gleichrangigen Freigabestatus.
- A01-r04 als führende Gestaltung dokumentieren: nahezu schwarzer grüner Hintergrund, zurückhaltendes Grün, lesbare Typografie, ruhige Karten, klare Hierarchie. Vorhandene Ausgangsfarben #070a08, #0b0f0d, #1d2621, #26dc77 und #edf1ee sowie Inter erfassen; endgültige Tokenzuordnung erst in S30 implementieren.
- Zielnavigation verbindlich abbilden: Übersicht, Beobachtung, Forschung, Positionen. Bot-Einstellungen über das Zahnrad. Wissen, Projektfortschritt und Detailanalysen über passende Unteransichten oder Detailzugänge; kein zusätzlicher Strategie-/Regelkatalog.
- Beobachtetes Setup ausschliesslich einmal in der Übersicht verorten. Beobachtung zeigt Prozess und Begründung, Forschung Vergleiche und Nachweise, Positionen tatsächlichen Bestand; keine Kopie derselben Setup-Kachel auf einer anderen Seite.
- Für bestehende Konto-, Journal-, Revolution- und weitere Routen eine Kompatibilitätszuordnung dokumentieren. Die spätere sichtbare Navigation richtet sich nach den freigegebenen vier Hauptbereichen; alte URLs bleiben prüfbar zugeordnet.
- Seiten und Elemente mit echten Datenverträgen verbinden: Quelle, Zeit, Zustand, Aktion, ACK und Fehlfall. Ein Bild ist kein Beleg für implementierte Datenverbindung, profitable Strategie oder angewandte Schutzregel.
- Leer-, Lade-, verzögert-, veraltet-, Fehler-, Berechtigungs-, Entwurfs-, Bestätigungs- und Ergebniszustände sowie sämtliche Ein- und Ausblendungen als Abnahmematrix dokumentieren.
- Freigabeumfang ausdrücklich begrenzen: bestätigt sind die fünf Desktopbilder. Responsive Ansichten, mobile Bedienung, echte Übergänge, Tastatur, reduzierte Bewegung und Laufzeitqualität werden erst S33–S35 nachgewiesen.
- Technik-/Designgrenze im Übergabebericht festhalten. Kein CSS, Theme, Layout, Routing-Menü, Komponentenumbau oder Animationscode entsteht in S03; die Referenzdateien bleiben unverändert.

## Erlaubte Pfade
- docs/ui/baseline/**
- docs/ui/navigation/**
- evidence/S03/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json
- apps/web/**
- design-tokens/**
- design/approval.json
- assets/design/approved/**

## Lieferdateien
- evidence/S03/design-baseline.json
- evidence/S03/navigation-map.md
- evidence/S03/screen-state-matrix.json
- evidence/S03/visual-acceptance.md
- evidence/S03/reference-preservation-report.json

## Prüfungen
- S03-C01 — Genau die fünf aktuellen Desktopreferenzen sind mit ihrer tatsächlichen Version und ihrem SHA256 verknüpft; frühere Entwürfe sind als überholt gekennzeichnet.
- S03-C02 — Die Dokumentation enthält genau vier Hauptbereiche, Einstellungen über das Zahnrad und genau eine Setup-Kachel in der Übersicht; Strategie-/Regelkataloge sind ausgeschlossen.
- S03-C03 — Desktopfreigabe, noch offene mobile/motionbezogene Validierung und noch nicht implementierte Funktionen sind eindeutig getrennt.
- S03-C04 — Der tatsächliche Dateidiff enthält ausschliesslich Dokumentation/Nachweise; keine Produkt-CSS-, Layout-, Navigations- oder Animationsänderung.
- S03-C05 — Jede geplante Kennzahl oder Aktion besitzt eine belegte Quelle beziehungsweise einen ausdrücklich offenen Vertrag; Bildinhalte gelten nicht als Live- oder Ergebnisnachweis.

## Ausgeschlossen
- Keine Designimplementierung, keine Tokens im produktiven Theme, keine öffentliche Layout- oder Menüänderung.
- Keine neue Bildgeneration oder Wiederöffnung der bestätigten Desktopauswahl als Voraussetzung dieser Dokumentation.
- Keine technische oder wirtschaftliche Abnahme allein aus den Referenzbildern.

## Stopbedingungen
- Referenz-ID, Bildhash oder dokumentierter Freigabeumfang widersprechen einander.
- Eine Aufgabe erfordert CSS, Produktkomponenten oder Animationen; sie gehört in S30–S35 und wird nicht hier vorgezogen.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet.

## Rückfall
Ausschliesslich fehlerhafte Dokumentation im Arbeitszweig korrigieren oder zurücknehmen; genehmigte Referenzen und bestehende Website unverändert erhalten.


# S04 · Botzustand und Verlustursachen lesend rekonstruieren

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Offline die verfügbare Botbeobachtung und Verlustkomponenten rekonstruieren; den nativen Lesebeleg als späteres separates Gate vorbereiten.

## Abhängigkeiten
S02

## Eingaben
- Vorliegendes cTrader-Log und Bot-Audit.
- Native Leseschnittstelle wird spezifiziert; tatsächlicher Zielhost- und Read-only-Nachweis folgt in S08 und ist keine Voraussetzung für dieses Offline-Audit.

## Arbeitsumfang
- Logparser für umgebrochene Ereignisse, mehrere Runs und Ereignistypen reproduzieren. Alle Originalzeilen mit Ereignis-ID verknüpfen.
- Verfügbare Log-/Exportdaten für Positionen, Deals, Gebühren, Swap und Cashflows strukturieren. Fehlende native Brokerhistorie als konkreten Beschaffungsauftrag für S08 erfassen.
- Offenen PnL, realisierten Netto-PnL und reine Saldoänderung getrennt anzeigen. Positionssummen mit Brokerkonto abgleichen.
- Pro Symbol, Strategie, Haltedauer, Session, Richtung und Kostenart eine Verlustzerlegung erzeugen; fehlende Dealhistorie sichtbar lassen.
- Zeitreihen-Vollständigkeit, letzten erfolgreichen Snapshot, Prozessende und Reloads erfassen. Killed ist ein beobachtetes Ende, noch keine bewiesene Speicherursache.
- Lesenden Adapter zunächst mit aufgezeichneten und synthetischen Ereignissen prüfen; kein bestehender Bestand wird verwaltet. Native Ende-zu-Ende-Prüfung ist ausdrücklich S08.

## Erlaubte Pfade
- adapters/ctrader/observer/**
- apps/hub/ingest/**
- research/diagnostics/**
- tests/observer/**
- evidence/S04/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json

## Lieferdateien
- evidence/S04/readonly-reconciliation.json
- evidence/S04/loss-attribution.md
- evidence/S04/telemetry-coverage.json
- evidence/S04/native-read-evidence.json

## Prüfungen
- S04-C01 — 21 offene Positionen aus dem Log werden als historischer Snapshot und nicht als heutiger Bestand dargestellt.
- S04-C02 — Ein fehlgeschlagener Positionsabruf ergibt unknown und verhindert neue Handelsabsichten; niemals leere Liste als Erfolgsersatz.
- S04-C03 — Vorliegende Kontogleichungen sind nachvollzogen; nicht auflösbare Differenzen bleiben explizit unconfirmed und blockieren wirtschaftliche Gesamtaussagen, nicht die Offline-Engineentwicklung.
- S04-C04 — Observervertrag und Offlinefälle enthalten keine Order-/Stop-/Close-Wirkung; native_read_evidence steht bis S08 ehrlich auf not_observed.

## Ausgeschlossen
- Keine Strategieoptimierung auf unvollständige Kontohistorie.
- Keine automatische Altpositionsübernahme.

## Stopbedingungen
- Nicht aufgeklärte Abweichung wird als bestätigte Gesamtrendite oder heutiger Bestand dargestellt. Fehlende History ist ein dokumentierter Befund und Beschaffungsauftrag, kein Verbot der Offlineanalyse.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet.

## Rückfall
Neuen Beobachter deaktivieren; Rohdaten und vorherige bestätigte Projektionen erhalten.


# S05 · Gemeinsames Geld- und Orderbuch bauen

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Jede wirtschaftliche Veränderung exakt zuordnen und Doppelaufträge, Teilfüllungen und Scheingewinne verhindern.

## Abhängigkeiten
S02

## Eingaben
- Normative Brokeridentitätsverträge aus S02; für die Offlineimplementierung synthetische Golden Cases. Native Identitätsparität folgt erst S08/S23.
- Unveränderte Rohereignisse; synthetische Grenzfälle aus Arbeitsbuch.

## Arbeitsumfang
- Orderabsicht, brokerseitige Order, Deal, Position und Gebührenbuchung separat modellieren; ein Intent ist noch keine Position.
- Kontobuch für Cash, gebundene Mittel, Menge, realisierte/ungeklärte Ergebnisse und mark-to-market Equity mit zeitgerechtem FX-Kurs führen.
- Annahme, Ablehnung, Teilfill, Vollfill, Cancel angefordert, Cancel bestätigt und unbekannt getrennt halten. Späte Fills nach Cancel-Anfrage sind zulässige Ereignisse.
- Bei unklarer Orderantwort zuerst anhand Client-ID/Brokerhistorie abgleichen, anschließend nur eindeutig fehlende Absicht erneut senden.
- Kommission, Spread, Slippage, Swap und Finanzierung so buchen, dass der verwendete Ausführungspreis nicht nochmals als pauschale Kosten abgezogen wird.
- Einzahlungen, Auszahlungen und Wechselkursbewegungen von Strategierendite trennen; Netto-Profitfaktor aus wirklich geschlossenen, definierten Tradeeinheiten ableiten.
- Wiederholte und anders geordnete Telemetrie deterministisch auf denselben bestätigten Buchstand projizieren.

## Erlaubte Pfade
- core/ledger/**
- core/orders/**
- contracts/ledger/**
- tests/ledger/**
- evidence/S05/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json

## Lieferdateien
- evidence/S05/ledger-contract.md
- evidence/S05/golden-ledger.json
- evidence/S05/order-state-machine.json
- evidence/S05/reconciliation-tests.json

## Prüfungen
- S05-C01 — MPR1-Referenzfall: 36 Stück; normaler Verlust 24,48 CHF; Zielgewinn 46,08 CHF; Gapverlust 42,48 CHF unter genau dessen Annahmen.
- S05-C02 — Duplikate erzeugen weder zweite Gebühr noch zweite Position; Teilfills reservieren nur noch die verbleibende Menge.
- S05-C03 — Timeout nach einem echten Fill erzeugt nach Wiederanlauf keinen zweiten Auftrag.
- S05-C04 — Nettoergebnis plus Gebührenaufschlüsselung führt auf dieselbe Kontogleichung zurück.

## Ausgeschlossen
- Keine optimierte Signalwahl; keine Broker-Sonderfälle durch generische Lot-Faktoren kaschieren.

## Stopbedingungen
- Währung, Multiplikator, Fillmenge oder Identitätszuordnung bleibt unbekannt.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet.

## Rückfall
Neue Projektion neu aus dem unveränderten Journal aufbauen; bei Schemakonflikt alte Anwendung nur mit kompatiblem Snapshot starten.


# S06 · Journal, Wiederanlauf und Originalpläne dauerhaft machen

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Nach Prozessende den tatsächlichen Brokerbestand und die ursprüngliche Handelsabsicht wieder zusammenführen.

## Abhängigkeiten
S05

## Eingaben
- Abgenommenes Order-/Geldbuch und Datenbankmigrationsplan.
- Vorhandene Trading_Local-SQLite-, Backup- und Recoverybausteine.

## Arbeitsumfang
- Vor einem ausführbaren Auftrag Intent, Risiko-Reservierung, Originalstop, Ziel, Strategie-/Policyversion und Datenreferenz dauerhaft speichern.
- Inbox/Outbox und Commit-Grenzen implementieren. Transport-ACK, Hubpersistenz und Brokerbestätigung bleiben unterschiedliche Nachweise.
- Vor Transportbeginn DISPATCH_MAY_HAVE_STARTED dauerhaft setzen. Nach Crash kann die Wirkung unklar sein: Reservierung halten, Broker identifizieren, nicht blind wiederholen. Netzwerkübergreifendes Exactly-once wird nicht vorausgesetzt.
- Bei Neustart zuerst native Orders/Deals/Positionen lesen, danach lokal rekonstruieren. Nicht zuordenbarer Altbestand bleibt quarantänisiert und sichtbar.
- Unveränderlichen fachlichen Verlauf von kurzfristigen UI-Snapshots trennen. Die bisherigen 100.000 Events/20.000 Snapshots dürfen keine benötigte Handelsbeweiskette abschneiden.
- Disk-full, beschädigten letzten Datensatz, Wiederholung, fehlenden Cursor und abgestürzte Migration kontrolliert behandeln.
- Backup und Wiederherstellung mit Schema- und Codeversion binden. Nach Restore wird Brokerrealität erneut gelesen, nicht aus einem alten Backup gehandelt.

## Erlaubte Pfade
- apps/hub/journal/**
- apps/hub/storage/**
- core/recovery/**
- tests/recovery/**
- evidence/S06/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json

## Lieferdateien
- evidence/S06/journal-durability.md
- evidence/S06/recovery-matrix.json
- evidence/S06/retention-policy.json
- evidence/S06/restore-evidence.json

## Prüfungen
- S06-C01 — Bei jedem simulierten Commit-/Sendabbruch entstehen höchstens eine nachweisbare wirtschaftliche Wirkung oder ein explizit ungeklärter, weiter reservierter Zustand; kein blinder Retry.
- S06-C02 — Fehlende Journalpersistenz sperrt neue Orders; lesende Diagnose und bestehender nativer Schutz bleiben verfügbar.
- S06-C03 — Kein übernommener Altbestand erhält erfundene Entry-ATR-, Strategie- oder Risikometadaten.
- S06-C04 — Ein Restoretest belegt Datenlesbarkeit und Brokerreconciliation, nicht bloß einen passenden ZIP-Hash.

## Ausgeschlossen
- Keine stillen Datenlöschungen zur Fehlerbehebung.
- Keine Erweiterung von Risiko nach einem Neustart.

## Stopbedingungen
- Eine aktive native Wirkung wird ohne Originalplan/Bestandsbeleg automatisch verwaltet. Offline-Recoverytests dürfen und müssen ungeklärten Bestand als reservierten Zustand abbilden.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet.

## Rückfall
Auf kompatiblen gesicherten Datenstand zurück; neue Orders bis zur erneuten Reconciliation gesperrt.


# S07 · Datenkatalog, Herkunft und Qualitätsprüfungen aufbauen

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Jeder Simulation einen nachvollziehbaren, ausreichend genauen und zulässig verwendbaren Datensatz zuordnen.

## Abhängigkeiten
S02

## Eingaben
- Teil6-Datenarchiv; Master-Labordaten; Broker-Symbolmetadaten.
- Quell-, Transformations- und Nutzungsregister.

## Arbeitsumfang
- Binance-Roh-OHLCV, abgeleitete Open-Tabelle, EURUSD-Ticks, Monatsfaktorportfolios und synthetische Daten als verschiedene Datenprodukte registrieren.
- Die gefundenen 19 fehlenden Stunden und 20 quarantänisierten Zeilen explizit übernehmen. Der verworfene 2004-Pilot bleibt getrennt.
- Tick-/Kerzenreihen auf monotone Zeit, Duplikate, endliche und instrumentgemäß zulässige Preise, Ask>=Bid, OHLC-Konsistenz, Raster, Session und Vollständigkeit prüfen. Preispositivität gilt nur für entsprechend spezifizierte Instrumente; mögliche negative Futurespreise erhalten einen eigenen Vertrag.
- Instrumentenidentität, Börse/Broker, Quoteart, Währung, Vertrag, Tick-/Volumenschritt, Halt, Roll, Split, Dividende und damalige Universumsmitgliedschaft versionieren.
- Gültigkeitsmatrix definieren: Open-only kann keine intrabar Stopausführung belegen; Monatsrenditen können keine Minutenstrategie prüfen.
- Nutzungsrechte pro Quelle dokumentieren. Persönliche historische Forschung, Produktionshandel und Weitergabe über eine Website sind getrennte Verwendungen.
- DatasetManifest mit Rohhash, Transformcodehash, Zeitraum, Lücken, Ausschlüssen und Lizenz-/Kostenstatus einfrieren. Keine stille Interpolation handeln lassen.

## Erlaubte Pfade
- data/catalog/**
- data/transforms/**
- data/quality/**
- contracts/data/**
- tests/data/**
- evidence/S07/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json

## Lieferdateien
- evidence/S07/dataset-registry.json
- evidence/S07/data-quality-report.json
- evidence/S07/rights-matrix.md
- evidence/S07/coverage-grid.json

## Prüfungen
- S07-C01 — Jeder verwendete Datenpunkt ist auf Rohquelle und Transformationsversion zurückführbar.
- S07-C02 — Inkompatible Datenauflösung verhindert den betreffenden Versuch oder erzwingt einen ausdrücklich anderen Modellmodus.
- S07-C03 — Nicht verfügbare Aktien-/Gold-/Silberhistorien werden als Lücke geführt, nicht durch Symbolnamen simuliert.
- S07-C04 — Ein Quellwechsel oder eine Korrektur erzeugt eine neue Datasetversion und verändert archivierte Runs nicht.

## Ausgeschlossen
- Keine automatische kostenpflichtige Datenbeschaffung.
- Keine öffentliche Weiterverteilung ungeklärter Datensätze.

## Stopbedingungen
- Benötigte Quote-/Corporate-Action-/Lizenzinformationen fehlen.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet.

## Rückfall
Neue Datasetversion quarantänisieren; vorherige eingefrorene Version für zulässige Referenztests behalten.


# S08 · Zielhost, Datenladen und Prozessüberwachung absichern

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Die reale Ausführungsumgebung messbar stabil machen und Forschung vom zeitkritischen Bot entkoppeln.

## Abhängigkeiten
S01, S04, S06, S07

## Eingaben
- Tatsächlicher cTrader-Build und Zielhost für den ersten Adapter; MT5-Hostabnahme folgt erst bei S28.
- Beobachtete Reload-/Killed-Ereignisse und Datenladestatus.

## Arbeitsumfang
- Herstellerbuild, Architektur, Betriebssystem, native Artefakte und erforderliche Paketversionen in einer Hostmatrix erfassen.
- Datenabfragen begrenzen und fair planen: priorisierte aktive Positionen, dann gültige Setups, danach Hintergrunduniversum; identische Reihen gemeinsam cachen.
- Prozess-Heartbeat, Speicher-/CPU-Spitzen, Warteschlangenalter, Barverzug und Abbruchgrund instrumentieren. Ursachen nicht aus einem einzelnen Killed-Text erraten.
- Ausführung, Hub und Forschungsworker getrennt betreiben. Forschungsjobs bekommen feste Ressourcen- und Zeitbudgets sowie kontrollierten Abbruch.
- cTrader-Cloudfähigkeiten am konkreten Build prüfen. Wegen fehlendem HTTP und widersprüchlicher WebSocket-Dokumentation ist lokaler/VPS-Host die vorläufige Integrationsbasis.
- Zielhostimport, Reconnect, Schlafmodus, Brokerunterbruch und veralteten Feed als echte Betriebsfälle prüfen.
- Lesende Native-Ende-zu-Ende-Prüfung aus S04 jetzt nachholen: Broker/Engine/Hub/Websiteprojektion abgleichen, tatsächlich schreibfreien Observer belegen, native-read-capability nur für den getesteten Build erteilen.

## Erlaubte Pfade
- runtime/**
- adapters/ctrader/host/**
- apps/hub/supervisor/**
- tests/runtime/**
- evidence/S08/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json

## Lieferdateien
- evidence/S08/host-matrix.json
- evidence/S08/runtime-budget.json
- evidence/S08/resource-observations.json
- evidence/S08/native-import-report.json
- evidence/S08/native-readonly-parity.json

## Prüfungen
- S08-C01 — Ein Forschungslasttest verzögert lokale Schutzverarbeitung nicht über das vorher festgelegte Budget.
- S08-C02 — Nicht geladene Reihen werden nicht als gültiger neutraler Indikator gewertet.
- S08-C03 — Nach einem Daten-/Prozessausfall wird keine Order auf veralteten Informationen neu eröffnet.
- S08-C04 — Cloud-/lokale Fähigkeiten sind pro Herstellerbuild getestet und nicht nur aus allgemeinen Produkttexten abgeleitet.
- S08-C05 — Native Kontodaten und schreibfreier Observer sind am echten Zielhost nachgewiesen; fehlender Zugriff bleibt als Blocker und wird nicht durch Fixtures ersetzt.

## Ausgeschlossen
- Keine neue Cloudinfrastruktur auf Kosten des Nutzers ohne konkreten Bedarf und Budget.
- Keine Umgehung nativer Netzwerkgrenzen.

## Stopbedingungen
- Native Kompatibilität oder stabiler Schutzpfad nicht nachgewiesen.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet.

## Rückfall
Neue Worker stoppen; letzter bestätigter Executorstand und lesende Diagnose bleiben bestehen.


# S09 · Mehrzeitanalyse mit kausalen Merkmalen vereinheitlichen

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Woche/Tag, Stunden und Minuten verbinden, ohne aus späteren Kerzen unbemerkt Zukunftswissen zu beziehen.

## Abhängigkeiten
S02, S07

## Eingaben
- C17 TimeRecipe, FrameView, TimePlanner, TimePicker als Donoren.
- Zeit- und Datenverträge aus S02/S07; vollständige 1.9-Quelle nur sofern gesichert.

## Arbeitsumfang
- Kontext-, Setup-, Trigger- und Schutzebene getrennt modellieren: zunächst D1/H4, H1/M15, M5/M1; W1 nur bei ausreichender Historie.
- Bars pro Handelskalender und Quoteart aggregieren; offene Kerzen bleiben getrennt von bestätigten Merkmalen.
- As-of-Verknüpfung verwenden: ein Merkmal darf erst ab seinem tatsächlichen available_at in eine Entscheidung eingehen.
- Bestehende 14 Rezepte fachlich katalogisieren und als versionierte Kandidaten übernehmen. Die alte Scorezahl bleibt ein Score und wird nicht als Gewinnwahrscheinlichkeit angezeigt.
- Aufwärmfenster, maximale Alterung, fehlende Teilreihen und widersprüchliche Horizonte behandeln; unknown/no-trade ist eine gültige Ausgabe.
- Präfixtest implementieren: spätere Daten, eine spätere Revision oder ein später bestätigter Pivot dürfen frühere Features und Signale nicht ändern.
- Langsame und schnelle Ebenen nur bei neuer relevanter Information aktualisieren; keine identischen H4-Merkmale auf jedem Tick neu berechnen.

## Erlaubte Pfade
- core/features/**
- core/timeframes/**
- contracts/features/**
- tests/causality/**
- evidence/S09/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json

## Lieferdateien
- evidence/S09/timeframe-recipes.json
- evidence/S09/feature-contract.json
- evidence/S09/prefix-test-report.json
- evidence/S09/mtf-parity.json

## Prüfungen
- S09-C01 — M5-Entscheidung um 10:35 nutzt niemals den erst um 11:00 bestätigten H1-Schluss.
- S09-C02 — Fehlende/alte Kontextdaten erzeugen einen begründeten unklaren Zustand statt Vorwärtsauffüllung ohne Altersgrenze.
- S09-C03 — Batchberechnung und schrittweise Replayberechnung ergeben dieselben Features/Entscheidungen innerhalb festgelegter numerischer Toleranz.
- S09-C04 — Zeitstempelkonventionen an Wochenenden, DST und Sitzungsgrenzen sind getestet.

## Ausgeschlossen
- Keine optimierten Rezeptgewichte; keine automatische Auswahl anhand späterer Gewinne.

## Stopbedingungen
- Eine Eingangsgröße hat keinen belegten Verfügbarkeitszeitpunkt.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet.

## Rückfall
Neues Rezept deaktivieren; gespeicherte vorherige Featureversion weiterhin lesbar.


# S10 · Deterministischen Replay- und Ausführungssimulator bauen

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Denselben Entscheidungskern mit historischen Ereignissen und nativen Brokerrückmeldungen prüfen können.

## Abhängigkeiten
S05, S06, S07, S09

## Eingaben
- Geprüftes Ledger, Featureverträge, Datensätze und Referenzfälle.
- Vorhandene LAB01–04 sind getrennte Donoren, kein schon fertiger universeller Simulator.

## Arbeitsumfang
- Den C#-Domänenkern von Plattformaufrufen trennen; Daten-/Orderports ersetzen echte Brokeraktionen im Replay. Python orchestriert Experimente, schreibt nicht parallel eine andere Handelslogik.
- Ereignisreihenfolge für Session, Barbestätigung, Signal, Quote, Orderantwort, Fill, Gebühr und Finanzierung explizit implementieren.
- Tick-/Quote-Replay, OHLC-Modell und synthetischen Stresstest getrennt ausweisen. Bei OHLC-Doppeltreffern eine vorab fixierte konservative Regel und Sensitivität rechnen.
- Bid/Ask, Spread, Slippage, Latenz, Teilfills, Mindestmenge, Tickrundung, Hebel, Margin, Stop-out und Haltekosten aus InstrumentVersion verwenden.
- Aktienkapitalmaßnahmen, Leihe/Short-Verfügbarkeit, Futuresrollen und FX-Umrechnung nur unterstützen, wenn die nötigen Daten vorliegen.
- MPR1 als eng definierten Referenzautomaten vollständig umsetzen; seine Lehrparameter bleiben Referenzfall, nicht produktive Strategieempfehlung.
- Gleiche Eingaben und gleicher Seed müssen reproduzierbare Ereignis-/Ledgerhashes ergeben. Ergebnis enthält auch abgelehnte, ungefüllte und ungeklärte Fälle.

## Erlaubte Pfade
- core/replay/**
- core/execution-model/**
- adapters/simulation/**
- tests/replay/**
- evidence/S10/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json

## Lieferdateien
- evidence/S10/engine-manifest.json
- evidence/S10/execution-model.md
- evidence/S10/mpr1-golden-report.json
- evidence/S10/replay-parity.json

## Prüfungen
- S10-C01 — Keine Order wird zum Signalbarpreis gefüllt, bevor das Signal verfügbar war.
- S10-C02 — Gap, fehlender Quote, doppeltes Ereignis, beidseitiger Schwellentreffer, Teilfill und Marginablehnung bestehen die unabhängig gerechneten Referenzfälle.
- S10-C03 — MPR1-Werte aus S05 und sämtliche Queue-/Ablaufgegenfälle stimmen.
- S10-C04 — Derselbe eingefrorene Run reproduziert seine Trace- und Ledgerhashes auf einem zweiten Prozess.

## Ausgeschlossen
- Keine Leistungsoptimierung vor korrektem Ledger.
- Keine Ergebnisfüllung für unbekannte Ausführung.

## Stopbedingungen
- Broker- und Replaysemantik weichen wirtschaftlich relevant ab oder Datenauflösung genügt nicht.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet.

## Rückfall
Neue Modellversion sperren; alte Runs unverändert sichtbar halten.


# S11 · Portfolio-, Margin- und Risikoprüfung zentralisieren

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Alle Strategien teilen sich dieselbe Kasse und dieselben Gesamtgrenzen; parallel laufende Bots dürfen Risiko nicht mehrfach vergeben.

## Abhängigkeiten
S05, S06, S10

## Eingaben
- Ledger, Orderreservierungen, echte Symbolverträge und Kostenmodell.
- LAB03 als begrenzter Donor gemeinsamer Portfoliorechnung.

## Arbeitsumfang
- Vor jedem Auftrag Menge nach Stopabstand einschließlich bekannter Gebühren, Währungsumrechnung, Volumenschritt und Mindestmenge bestimmen.
- Ein gemeinsames Konto-/Symbol-/Strategie-/Sektor-/Währungsbudget führen; Pending Orders reservieren Risiko und Margin vor dem Fill.
- Korrelierte oder gegenläufige Positionen wirtschaftlich bewerten. Verschiedene Magic Numbers sind keine getrennten Risikokonten.
- Tagesverlust-, Drawdown-, Margin- und Expositionsgrenzen mit eingerasteten Zuständen und definiertem Reset bauen.
- 100, 1.000, 10.000 und 1.000.000 CHF in derselben Modelllogik prüfen. Unzulässige Mindestmenge führt zu no-trade, nicht zu unbemerktem Risikoaufschlag.
- Gap- und Liquiditätsstress getrennt vom normalen Stopbudget rechnen; kein Stopniveau wird als garantierte Verlustobergrenze bezeichnet.
- Für Forschung mehrere vorab definierte Risikoprofile vergleichen; eine experimentelle aggressive Variante erhält eigene Verlust-/Ausfallverteilung.

## Erlaubte Pfade
- core/risk/**
- core/portfolio/**
- contracts/risk/**
- tests/risk/**
- evidence/S11/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json

## Lieferdateien
- evidence/S11/risk-policy.json
- evidence/S11/portfolio-budget.json
- evidence/S11/risk-reference-tests.json
- evidence/S11/capital-feasibility.json

## Prüfungen
- S11-C01 — Zwei gleichzeitige Strategien können dasselbe freie Risiko nicht doppelt reservieren.
- S11-C02 — Das tatsächlich modellierte Stoprisiko überschreitet das genehmigte Budget nicht durch Mindestlot-Aufrundung.
- S11-C03 — Tagesverlustsperre bleibt bis zum definierten Sitzungswechsel aktiv, auch wenn offener PnL kurz steigt.
- S11-C04 — Unbekannter Kontostand, unbekannte Vertragsgrößen oder nicht berechenbare definierte Stressszenarien sperren neue Exposition. Stressverlust ist keine garantierte absolute Verlustobergrenze.

## Ausgeschlossen
- Keine Renditeziele durch nachträglich erhöhten Hebel erfüllen.
- Keine pauschale Empfehlung eines Risikoprozents für ein echtes Konto.

## Stopbedingungen
- Margin-/Mengen-/Kontraktmetadaten fehlen oder Kontobudgets widersprechen sich.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet.

## Rückfall
Auf letzte freigegebene Risikopolicy zurück; neue Exposition bis zum Abgleich blockieren.


# S12 · Gewinnsicherung, Sessions und sichere Ausstiege spezifizieren

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Gewinne regelgebunden laufen lassen und Schutz nur über bestätigte, kausal berechnete Anpassungen verändern.

## Abhängigkeiten
S10, S11

## Eingaben
- C17 RelativeMath.ProtectedStop/Target und Davids einmalige Gewinnsicherung.
- Orderzustände, Risikopolicy, Sessionkalender und vollständige Originalpläne.
- Diese Karte implementiert und prüft Offline-Exitlogik; native Stop-ACK-Parität ist zusätzlich in S23 zwingend.

## Arbeitsumfang
- Fixstop, kostenbereinigtes Break-even, ATR-Trailing, Struktur-Trailing und zeitbasierte Beendigung als getrennte Policys implementieren.
- Für Long darf Schutz nur steigen, für Short nur fallen, sofern die Policy keine ausdrücklich getrennte neue Position eröffnet. Bei weniger klarer Lage Schutz nicht unbemerkt lockern.
- Neuen Stop erst ab berechnetem und tatsächlich bestätigtem Änderungszeitpunkt wirksam behandeln. Brokerreject und Freeze-/Stop-Distance berücksichtigen.
- Gewinnzielentfernung, Zielverschiebung und Stopintelligenz getrennt testen. Ein Vergleich muss die gleiche Take-Profit-Bedingung enthalten, wenn nur Stoplogik bewertet wird.
- Sessionende, Wochenendgap, Swap-/Finanzierungszeit und maximale Haltedauer im Plan vor Einstieg berücksichtigen.
- Altpositionen nur mit nachvollziehbarem Plan übernehmen; unbekannte ursprüngliche Stop-/ATRwerte verhindern automatische Neuerfindung.
- Exitprioritäten für Stop, Zeitende, Margin, Policywechsel und Datenfehler festlegen. Bei fehlendem Fill bleibt offener Bestand als solcher sichtbar.

## Erlaubte Pfade
- core/exits/**
- core/sessions/**
- adapters/ctrader/protection/**
- tests/exits/**
- evidence/S12/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json

## Lieferdateien
- evidence/S12/exit-policies.json
- evidence/S12/session-policy.json
- evidence/S12/stop-ack-tests.json
- evidence/S12/legacy-position-policy.md

## Prüfungen
- S12-C01 — Ein höheres späteres Hoch kann keinen früheren Trailingstop verbessern.
- S12-C02 — Bei Kurslücke wird der nächste tatsächlich verfügbare Preis verwendet, nicht rückwirkend die gewünschte Stopmarke.
- S12-C03 — Im simulierten Adapter bleibt abgelehnte Stopänderung abgelehnt und alter bestätigter Stop wirksam; native Gegenprüfung ist S23 vorbehalten.
- S12-C04 — Kostenbereinigtes Break-even und Schutzpreis sind getrennt vom garantierten Nettoergebnis beschrieben.

## Ausgeschlossen
- Noch keine Wahl des profitabelsten Exitparameters.
- Keine autonome Verwaltung unbekannter Altpositionen.

## Stopbedingungen
- Schutzbestätigung, Preisraster oder ursprünglicher Positionsplan ist nicht belegt.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet.

## Rückfall
Neue Exitpolicy für neue Positionen sperren; bestehende Positionen behalten ihre gebundene und bestätigte Policy.


# S13 · Wissensbibliothek in prüfbare Hypothesen übersetzen

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Die PDFs als durchsuchbaren fachlichen Unterbau nutzen und jede daraus abgeleitete Handelsidee auf einen messbaren Vertrag reduzieren.

## Abhängigkeiten
S02, S07

## Eingaben
- Master-1.0-Katalog, Knowledge Graph, Szenarienregister und Kapitelindex.
- 251 Kapitel, 124 Lehrblätter und 405 Szenarien sind Wissenseinträge, keine fertigen Bots.

## Arbeitsumfang
- Master 1.0 als Wissenshauptfassung registrieren; Atlas/Arbeitsbuch auf ihre Masterkapitel verlinken und v8 als Vorgänger behandeln.
- Einträge in Definition, institutionelle Mechanik, Forschungsbefund, synthetisches Beispiel, Hypothese und implementierte Funktion klassifizieren.
- Jede Hypothese mit Quellen-ID/PDF-Seite, benötigten Daten, Assetklasse, Horizont, Gegenhypothese, Widerlegungsbedingung und erwartbarem Kostenmechanismus versehen.
- Die acht bestehenden JSON-Vorlagen adaptieren. Draft darf null enthalten; ready_to_run verlangt vollständige fachliche Werte und passende Enginefähigkeiten.
- Die 43 dokumentierten Datentypen nicht alle sofort implementieren. Pro erster Strategie genau die tatsächlich benötigten Typen auswählen und den Rest als fehlende Capability kennzeichnen.
- Überblick über umgesetzte, geprüfte, verworfene und datenbedingt blockierte Ideen erstellen. Quellenbeleg und eigene Testergebnisse bleiben getrennt.
- Die Website-Suche soll vom Begriff zur Quelle, von der Hypothese zum Versuch und vom Ergebnis zurück zur genauen Regel führen.

## Erlaubte Pfade
- knowledge/**
- contracts/research/**
- research/hypotheses/**
- tests/knowledge/**
- evidence/S13/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json

## Lieferdateien
- evidence/S13/knowledge-catalog.json
- evidence/S13/hypothesis-registry.json
- evidence/S13/ready-contract-validation.json
- evidence/S13/knowledge-traceability.md

## Prüfungen
- S13-C01 — Jede ausführbare Hypothese hat eine vollständige maschinenlesbare Spezifikation und einen Quellen-/Begründungsbezug.
- S13-C02 — Ein formal gültiges JSON mit null in Pflichtfeldern wird nicht zur Ausführung zugelassen.
- S13-C03 — Duplizierte PDFs erhöhen weder Strategiezahl noch Evidenzmenge.
- S13-C04 — Ein verworfener Versuch bleibt mit Begründung auffindbar.

## Ausgeschlossen
- Kein automatischer Wissen-zu-Gewinn-Compiler.
- Keine vollständige Umsetzung aller Lehrblätter vor dem ersten funktionierenden Durchlauf.

## Stopbedingungen
- Eine Idee lässt sich nicht in verfügbare Beobachtungen, Regeln und Widerlegung übersetzen.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet.

## Rückfall
Eintrag als Entwurf/deaktiviert markieren; alte IDs und Quellenverweise erhalten.


# S14 · Strategiefamilien als unveränderte Referenzen portieren

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Mehrere wirklich unterschiedliche Entscheidungslogiken vergleichbar machen, bevor ihre Parameter verbessert werden.

## Abhängigkeiten
S09, S10, S11, S12, S13

## Eingaben
- Geprüfte Donorfunktionen und eindeutige Lizenz-/Besitzlage.
- Simulator, gemeinsames Risikobuch und Hypothesenregister.

## Arbeitsumfang
- Vier erste Familien registrieren: Trend/Pullback; Band-/Range-Rückkehr; Ausbruch/Retest; Gold/Silber-Momentum-Divergenz.
- Hauptbot und David V2 als Varianten derselben Trendfamilie führen. Gold/Silber-Donor als Goldsignal mit Silberreferenz kennzeichnen; er ist kein bereits implementiertes marktneutrales Paarportfolio.
- Pro Familie Einstieg, Invalidierung, Zustandswechsel, Ausstieg, Menge, Zeitebenen, Handelszeit und fehlende Daten vollständig beschreiben.
- Pure Signalberechnung von MT5/cTrader-Aufrufen trennen. Davids Vektor-/Einzelsignalpfad als Paritätsreferenz verwenden.
- Bekannte Ausführungsfehler nicht mitportieren: unknown Positionsabruf, unklare Retryantwort, fehlende Teilfills, unbestätigter Schutz, veraltete Silberreferenz.
- Zuerst Originalparameter reproduzieren, dann genau eine geänderte Variante anlegen. Alle Referenzen bekommen unveränderliche IDs.
- Einfaches Nicht-Handeln und passende ungehebelte/margenangepasste Referenzanlage als Vergleich implementieren.

## Erlaubte Pfade
- core/strategies/**
- adapters/legacy-reference/**
- research/reference-policies/**
- tests/strategy-parity/**
- evidence/S14/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json

## Lieferdateien
- evidence/S14/strategy-registry.json
- evidence/S14/reference-policies.json
- evidence/S14/port-parity-report.json
- evidence/S14/donor-change-log.md

## Prüfungen
- S14-C01 — Jede Familie erfüllt denselben SignalIntent-Vertrag und denselben Geld-/Kostenpfad.
- S14-C02 — Originalsignalparität wird auf eingefrorenen Daten nachgewiesen; fachliche Abweichungen sind einzeln begründet.
- S14-C03 — Gold-/Silberreferenz wird bei zu altem oder asynchronem Preis nicht verwendet.
- S14-C04 — Eine Strategie kann no-trade ausgeben, ohne durch einen anderen Default heimlich ersetzt zu werden.

## Ausgeschlossen
- Keine gemeinsame Hyperparameteroptimierung aller Familien.
- Keine Verwendung von Codekommentaren als Performancebeleg.

## Stopbedingungen
- Quelle, Regeldefinition oder benötigte Referenzdaten fehlen.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet.

## Rückfall
Neue Familie deaktivieren; unveränderte Referenz und Donorabbildung erhalten.


# S15 · Nachvollziehbare Mustererkennung hinzufügen

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Muster mit Zeitpunkt, Unsicherheit und Gegenfällen erkennen und ihren zusätzlichen Nutzen messbar prüfen.

## Abhängigkeiten
S09, S13, S14

## Eingaben
- Zeitgerechte Features und drei erste fest definierte Patternhypothesen.
- BP-Kapitel und Szenarienregister; genügend negative Beispiele.

## Arbeitsumfang
- Mit drei deterministischen Familien starten: Ausbruch/Retest, Trend-Pullback und Kompression/Expansion. Range-Randkontakte und Divergenzen als nächste Kandidaten katalogisieren.
- Anker, Fenster, ATR-/Volatilitätsnormierung, Toleranzen, Mindestdauer, Bestätigung und Ablauf pro Pattern fixieren.
- Retrospektiven Pivotzeitpunkt von Erkennungszeit unterscheiden. Ein bestätigter Swing kann erst nach der Bestätigung verwendet werden.
- PatternEvent mit Richtungsannahme, timeframe, known_at, available_at, expiry, invalidation, Featureversion und Qualitätsstatus erzeugen.
- Geometrische Musterqualität, heuristischen Score und kalibrierte Wahrscheinlichkeit getrennt halten. Ohne Kalibrierung keine Prozentchance anzeigen.
- Positive, negative und unklare Fälle aus mehreren Marktphasen prüfen; dieselbe überlappende Bewegung nicht als viele unabhängige Treffer zählen.
- A/B-Versuchsplan gegen dieselbe Strategie ohne Pattern vorbereiten; technische Fixtures und Kausalität jetzt prüfen. Wirtschaftliche Ablation erst nach S16-Protokollfreeze in S18 durchführen.

## Erlaubte Pfade
- core/patterns/**
- research/patterns/**
- contracts/patterns/**
- tests/patterns/**
- evidence/S15/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json

## Lieferdateien
- evidence/S15/pattern-registry.json
- evidence/S15/pattern-fixtures.json
- evidence/S15/pattern-causality.json
- evidence/S15/pattern-ablation-plan.json

## Prüfungen
- S15-C01 — Das Entfernen aller späteren Daten ändert kein bereits emittiertes PatternEvent.
- S15-C02 — Jeder Treffer und jede Ablehnung lässt sich mit damaligen Merkmalen und Regeln nachvollziehen.
- S15-C03 — Patternwissen allein vergibt keine neue Handelsfreigabe.
- S15-C04 — Unterschiedliche Zeitebenen werden nicht als unabhängige Mehrheitsstimmen gezählt.

## Ausgeschlossen
- Keine Bild-KI auf beliebigen Screenshots als erste Handelsentscheidung.
- Keine RL-/Deep-Learning-Plattform ohne belastbaren einfachen Vergleich.

## Stopbedingungen
- Ankerdefinition benötigt Zukunftsdaten oder Patternlabel ist rückblickend angepasst.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet.

## Rückfall
Patternfilter deaktivieren; zuvor eingefrorene Strategie ohne Filter bleibt Referenz.


# S16 · Versuchsprotokoll und unabhängige Bewertung einfrieren

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Vor der Suche festlegen, woran Verbesserung gemessen wird und welche Daten für welche Entscheidung verwendet werden dürfen.

## Abhängigkeiten
S07, S10, S14

## Eingaben
- Reproduzierbare Referenzstrategien, Datasetversionen und Risikoprofile.
- Historische LAB04-/Site-Ergebnisse sind bereits bekannt und keine neuen unberührten Holdouts.

## Arbeitsumfang
- Zielmetrik, Risikorahmen, Nettokosten, Benchmark, Anlageuniversum, Suchbudget und Auswertungsregeln vor dem ersten Variantenlauf registrieren.
- Chronologische Trainings-, Auswahl- und äußere Testfenster festlegen. Features, Skalierungen, Schwellen und Regimemodelle nur aus der erlaubten Vergangenheit schätzen.
- Überlappende Labels/Haltedauern an Fensterrändern trennen; Zeitabstand und Datenrevisionen dokumentieren. Kein zufälliges Mischen benachbarter Zeitreihenzeilen.
- Einen finalen Holdout nur einmal für die vorab fixierte Entscheidung verwenden. Nach Einsicht wird er verbraucht; neue Verbesserung benötigt neues späteres oder unabhängiges Material.
- Alle versuchten und gescheiterten Konfigurationen zählen. Auswahlverzerrung, effektive Versuchszahl und gegebenenfalls Deflated Sharpe/PBO als Zusatzdiagnostik ausweisen.
- Blockweise Unsicherheitsintervalle über Tage/Wochen/Marktgruppen berechnen; korrelierte Trades oder wiederverwendete Pfade nicht als unabhängige Stichprobe behandeln.
- Ergebnisstatus passend, besser belegt, schlechter, unzureichende Evidenz oder unzulässig trennen. Ein grüner Techniktest ist kein Profitabilitätsnachweis.

## Erlaubte Pfade
- research/protocols/**
- research/evaluation/**
- contracts/runs/**
- tests/evaluation/**
- evidence/S16/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json

## Lieferdateien
- evidence/S16/frozen-research-protocol.json
- evidence/S16/split-manifest.json
- evidence/S16/metric-definitions.md
- evidence/S16/decision-gates.json

## Prüfungen
- S16-C01 — Protokollhash und Suchbudget stehen vor den Ergebnisdateien fest.
- S16-C02 — Ein bekannter Schlussabschnitt wird nicht durch Umbenennung erneut holdout.
- S16-C03 — Modellwahl und abschließende Bewertung verwenden nicht dieselben unverbrauchten Daten.
- S16-C04 — Jede Erfolgsbehauptung enthält Nettoergebnis, Drawdown, Exposition, Kosten, Stichprobenumfang und Unsicherheit.

## Ausgeschlossen
- Kein Rennen bis zu einer gewünschten Screenshotzahl.
- Kein globales Siegerlabel aus einem einzigen günstigen Markt.

## Stopbedingungen
- Endprüfung wurde zur Auswahl benutzt oder Versuchshistorie fehlt.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet.

## Rückfall
Unzulässigen Versuch als explorativ markieren; neues Protokoll und neues zulässiges Testmaterial planen.


# S17 · Fortsetzbare Forschungsjobs und Ergebnisregister bauen

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Viele reproduzierbare Versuche ausführen, ohne Websiteanfragen oder den Handelsprozess zu überlasten.

## Abhängigkeiten
S06, S10, S16

## Eingaben
- Eingefrorenes Runprotokoll und reproduzierbarer Replaykern.
- Aktuelle Vercel-Konfiguration: maxDuration 60 Sekunden; kein Dauerworker im Request.

## Arbeitsumfang
- ResearchJob mit Dataset-/Engine-/Strategy-/Policyhash, Split, Seed, Budget und Idempotenzschlüssel einführen.
- Warteschlange und Worker mit Zuständen queued, accepted, running, checkpointed, succeeded, failed, cancelled, expired bauen.
- Jobs in kleine wiederholbare Pakete teilen; Teilergebnisse und Cursor dauerhaft sichern. Fortschritt nur aus tatsächlich abgeschlossenen Fällen berechnen.
- CPU, RAM, Laufzeit, Datentransfer und Ergebnisspeicher pro Job begrenzen. Offlineworker werden separat geprüft; gemeinsame Last mit nativem Executor ist zusätzlich ein Gate in S24.
- Identische Aufgaben deduplizieren und Featurecaches ausschließlich nach Daten-/Merkmalversion wiederverwenden.
- Ergebnisregister mit unveränderlichen Rohmetriken, Trades, Abweisungen, Ledger, Protokoll und Belegen führen; große Dateien separat speichern.
- Website und Bot dürfen Forschungsanfragen einreichen, bekommen aber sofort nur eine bestätigte Job-ID. Keine lange synchrone Antwort im Handelszyklus.

## Erlaubte Pfade
- apps/research-worker/**
- apps/hub/jobs/**
- apps/web/api/research/**
- research/run-store/**
- tests/jobs/**
- evidence/S17/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json

## Lieferdateien
- evidence/S17/job-contract.json
- evidence/S17/worker-resume-report.json
- evidence/S17/run-registry.json
- evidence/S17/resource-cost-report.json

## Prüfungen
- S17-C01 — Ein unterbrochener Job setzt am bestätigten Checkpoint fort und zählt Fälle nicht doppelt.
- S17-C02 — Ein abgebrochener Job erzeugt kein scheinbar vollständiges Ergebnis.
- S17-C03 — Identischer Jobschlüssel erzeugt denselben archivierten Run oder eine eindeutige Konfliktmeldung.
- S17-C04 — Workerbudgets und kontrollierter Abbruch sind offline getestet; Native-Koexistenz bleibt bis S24 unbestätigt.
- S17-C05 — Server und Worker verweigern DRAFT/ready_to_run=false, fehlende Pflichtfelder, unbekannte Dataset-/Policyversion und Protokollhashabweichung; UI-Zustand allein erteilt keine Runfreigabe.

## Ausgeschlossen
- Keine unbegrenzte Cloudschleife und keine automatische Budgeterhöhung.
- Kein Trading direkt aus einem Workerresultat.

## Stopbedingungen
- Ergebnis-/Checkpointpersistenz oder Jobkontozuordnung ist nicht eindeutig.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet.

## Rückfall
Queue pausieren; laufende Pakete kontrolliert beenden; bestätigte Ergebnisse und lokale Ausführung erhalten.


# S18 · Exits und Parameter mit kontrollierten Vergleichen verbessern

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Den Nutzen jeder Änderung einzeln messen und robuste Kandidaten statt einzelner Glückstreffer auswählen.

## Abhängigkeiten
S12, S14, S15, S16, S17

## Eingaben
- Unveränderte Referenzfamilien, Patternvarianten, vorab definierte Suchräume und Vergleichsgruppen.

## Arbeitsumfang
- Erste Suchrunde klein halten: pro Familie höchstens eine vorab begründete Parametergruppe und ein festes Kandidatenbudget.
- Equal-entry-Tests verwenden, um ausschließlich Ausstiegslogik zu vergleichen; anschließend dieselben Kandidaten im realen gemeinsamen Portfoliopfad prüfen.
- Fixstop, Trailing, adaptive Ziele, Zeitabbau und Sessionfilter getrennt abtragen. Take-Profit-Effekt von Stopanpassung isolieren.
- Nach Kosten, Slippage-/Spreadstress, Verzögerung, Gapereignissen, Gebührenminimum und 100-CHF-Mindestmengen neu rechnen.
- Parameterplateaus gegenüber isolierten Spitzen bevorzugen; leichte Nachbaränderungen und spätere Zeitfenster ausdrücklich zeigen.
- Schlechte Märkte, No-trade-Fälle und gescheiterte Konfigurationen in der Ergebnismatrix behalten.
- Nur innerhalb des inneren Auswahlfensters einen Kandidaten bestimmen und dessen vollständige Policy für die äußere Prüfung einfrieren.

## Erlaubte Pfade
- research/experiments/exits/**
- research/experiments/parameters/**
- research/reports/**
- tests/experiments/**
- evidence/S18/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json

## Lieferdateien
- evidence/S18/ablation-matrix.json
- evidence/S18/candidate-trials.json
- evidence/S18/cost-stress-report.json
- evidence/S18/candidate-selection.md

## Prüfungen
- S18-C01 — Die verglichenen Varianten teilen sich Inputs und Bedingungen, soweit die getestete Frage dies verlangt.
- S18-C02 — Ergebnisunterschiede lassen sich auf die benannte Änderung und deren Folgewirkungen zurückführen.
- S18-C03 — Keine Kandidatenauswahl verwendet Ergebnisse des äußeren Testfensters.
- S18-C04 — Der beste Kandidat darf als unprofitabel oder unzureichend belegt enden; Suche wird dann nach Protokoll geschlossen.

## Ausgeschlossen
- Kein Verschieben des Stopbudgets zur Ergebnisverschönerung.
- Kein endloser Suchlauf bis Profitfaktor/80%-Ziel zufällig erreicht wird.

## Stopbedingungen
- Suchbudget verbraucht, Datenleck festgestellt oder Kostenmodell ungültig.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet.

## Rückfall
Unveränderte Referenz bleibt Champion; Kandidat und Misserfolg werden archiviert.


# S19 · Regimeabhängige Auswahl gegen feste Strategien prüfen

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Strategien nur dann wechseln oder mischen, wenn der kausale Auswahlmechanismus nach Kosten einen belegten Mehrwert hat.

## Abhängigkeiten
S09, S11, S14, S16, S17, S18

## Eingaben
- Eingefrorene Strategiekandidaten, regimebezogene Features und Portfoliorisikobuch.
- Alte TimePicker-Hysterese als Referenz, nicht als bereits bewiesene Optimierung.

## Arbeitsumfang
- Zunächst einfache beobachtbare Zustände definieren: Trend/Range, hohe/niedrige Schwankung, liquide/teuer, Ereignisnähe und unbekannt.
- Zustandsdiagnose von erwarteter Handelsrichtung trennen. Ein Volatilitätsalarm ist noch kein Kaufsignal.
- Feste Einzelfamilien, feste Mischung, einfache regelbasierte Auswahl und adaptive Auswahl bei gleichem Risikobudget vergleichen.
- Wechselhysterese, Mindesthaltezeit, Wechselkosten, auslaufende Setups und maximale Expositionsänderung vorab definieren.
- Bei offenen Positionen ursprüngliche Schutzpolicy gebunden halten. Eine neue Entrystrategie schreibt keinen alten Positionsplan um.
- Nur im Trainings-/inneren Auswahlfenster Gewichtung lernen; in jedem äußeren Fenster das vorher festgelegte Updateverfahren ausführen.
- Bei Unsicherheit oder Drift neue Exposition reduzieren/aussetzen gemäß festem Vertrag; Forschungskandidat und aktiver Champion bleiben getrennt.

## Erlaubte Pfade
- core/selector/**
- research/experiments/selector/**
- contracts/policies/**
- tests/selector/**
- evidence/S19/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json

## Lieferdateien
- evidence/S19/selector-policy.json
- evidence/S19/regime-causality.json
- evidence/S19/switch-cost-report.json
- evidence/S19/selector-comparison.json

## Prüfungen
- S19-C01 — Eine später erkannte Trendphase führt nicht zu rückdatierten Wechseln.
- S19-C02 — Adaptive Auswahl wird bei identischen Kosten-/Risikobedingungen gegen beste erlaubte feste Referenzen geprüft.
- S19-C03 — Häufige Wechsel und schlechtere Ergebnisse können eine Ablehnung auslösen; Komplexität gilt nicht als Verbesserung.
- S19-C04 — Unklare Zustände und fehlende Daten erzeugen eine explizite, geprüfte Rückfallentscheidung.

## Ausgeschlossen
- Keine Auswahl des rückblickend besten Bots pro Kerze.
- Kein autonomes Lernen auf dem laufenden Echtgeldbestand.

## Stopbedingungen
- Kausale Zustandsbestimmung, Wechselkosten oder Policybindung sind nicht nachgewiesen.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet.

## Rückfall
Auf zuvor freigegebene feste Strategie/Mischung oder no-trade zurück; bestehende Schutzpläne behalten.


# S20 · Breiten Allround-Test über Märkte, Zeiten und Kapital durchführen

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Die Übertragbarkeit systematisch messen und Datenbreite von bloßer Anzahl künstlicher Symbolprofile unterscheiden.

## Abhängigkeiten
S07, S10, S11, S16, S17, S19

## Eingaben
- Nachgewiesene Datennutzungsrechte und Datasetabdeckung.
- Eingefrorener Kandidat/Selektor; gemeinsame Kapital- und Kostenregeln.

## Arbeitsumfang
- Drei Ausbaustufen planen: etwa 8–12 gut dokumentierte Instrumente, später etwa 100 liquide Einzelaktien, danach 500+ Titel. Pflicht dieser Karte ist nur die vor Testbeginn eindeutig freigegebene erste Kohorte; jede Erweiterung ist ein neuer gebundener Forschungsauftrag mit eigener Daten-/Budgetprüfung.
- Jede Stufe nach Ländern, Sektoren, Liquidität, Volatilität und historischen Marktphasen schichten. Delistete Titel und damalige Universumsmitgliedschaft berücksichtigen.
- M1/M5/M15/H1/H4/D1 nur dort testen, wo die passende Historie existiert; W1 für längerfristigen Kontext getrennt behandeln.
- Horizonte 7/30/90/365 Tage sowie rollierende Starttermine vorab festlegen; warme Vorlaufperioden nicht als investierbare Testtage zählen.
- Kapital 100/1.000/10.000/1.000.000 CHF mit Mindestkosten, Marktliquidität und Kapazitätsmodell prüfen. Die Rendite ist nicht automatisch skalierungsunabhängig.
- Ein echtes Mehrinstrumentenportfolio separat von unabhängigen Modellkonten rechnen. Summierte fiktive Kontogewinne sind kein gemeinsamer Portfoliogewinn.
- Nettoertrag, Erholungsdauer, Zeit bis Ziel, Ziel-Nichterreichung, Drawdown, Verlustwahrscheinlichkeit, Exposition, Umsatz und Marktkapazität gemeinsam auswerten.

## Erlaubte Pfade
- research/universe/**
- research/experiments/allround/**
- data/equities/**
- tests/universe/**
- evidence/S20/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json

## Lieferdateien
- evidence/S20/allround-matrix.json
- evidence/S20/universe-history.json
- evidence/S20/portfolio-vs-cases.json
- evidence/S20/coverage-performance-report.json

## Prüfungen
- S20-C01 — Jede Zelle trägt real/synthetisch, Datenauflösung, Anzahl unabhängiger Zeitblöcke und Fehlstatus.
- S20-C02 — Kein abgelehnter oder verlustreicher Markt wird nach Ergebnisansicht aus der Gesamtwertung entfernt.
- S20-C03 — Zeit bis 2x/10x/30x enthält auch Nichterreichung und Ausfall; keine Durchschnittszeit nur über Gewinner.
- S20-C04 — Die breite Erweiterung verändert nicht nachträglich die Auswahlentscheidung des eingefrorenen Kandidaten.
- S20-C05 — Kohorten- und Mindestabdeckungsdefinition wurde vor Ergebnissen fixiert. Fehlende geplante Markterweiterungen bleiben sichtbar; kein nachträgliches Verkleinern einer erfolglosen Kohorte.

## Ausgeschlossen
- Nicht alle weltweiten Aktien und alle Intervalle als bereits verfügbar versprechen.
- Keine Renditeannualisierung kurzer Extrempfade als belastbare Jahresprognose.

## Stopbedingungen
- Survivorship-/Corporate-Action-/Quoteinformationen fehlen oder Datenbudget ist erschöpft.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet.

## Rückfall
Betroffene Marktstufe als datenbedingt blockiert ausweisen; kleinere gültige Abdeckung weiter betreiben.


# S21 · Website technisch mit Daten, Jobs und Zuständen verbinden

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Echte Fachverträge, Forschungsjobs und Zustandswechsel in der bestehenden Oberfläche beziehungsweise einem isolierten technischen Prüfaufbau integrieren; die genehmigte Neugestaltung folgt erst nach S25.

## Abhängigkeiten
S03, S04, S06, S13, S16, S17

## Eingaben
- Referenzdokumentation aus S03, bestehender RemoteView20-Weg, verifizierte APIs, Ergebnisregister und aufgelöste technische Dateiscopes.
- Bestehende Oberfläche unverändert als technische Hülle; neue Fachvorgänge dürfen in einem ausdrücklich technischen internen Prüfaufbau nachgewiesen werden.

## Arbeitsumfang
- Gemeinsamen Projekt-/Bot-/Kontokontext, Routenkompatibilität und Datenadapter implementieren. Öffentliche Hauptnavigation, Kartenanordnung, Farben und Typografie bleiben bis S30 unverändert.
- Quellzustand, Ereigniszeit, Empfangszeit, Datenalter, Revisionsfolge, Verbindung und unbekannten Kontostand als getrennte technische Felder führen; die spätere Gestaltung darf keine Bedeutung ergänzen müssen.
- Reale Laborjobs durchgängig anbinden: Definition, Validierung, Annahme, Queue, Fortschritt, Abbruch, Wiederanlauf, Archiv, Vergleich und Export verwenden denselben versionierten Run.
- Wissensbezug Quelle→Hypothese→Implementierung→Ergebnis sowie Markt-/Datenabdeckung als lesbare Fachansichten bereitstellen. Projektstatus umfasst S00–S35 mit Abhängigkeiten, Nachweisen, Blockern und nächstem freigegebenen Schritt.
- Entwurf, vorgeschlagene Änderung, freigegebene Policy, angenommener Auftrag und natives applied-Readback als getrennte Zustände integrieren. Eingangs-ACK ist keine Broker- oder Schutzbestätigung.
- Ereignisreihenfolge, Duplikate, verspätete Antworten nach Kontowechsel, Snapshot/Replay, Lücken und Reconnect im Datenmodell prüfen; stabile fachliche Identitäten für spätere Aktualisierung ohne Seitenneuladen bereitstellen.
- Remoteprojektion mit Authentisierung, Replaygrenzen, Widerruf, TTL, Quellen-/Cachekennzeichnung und demselben Capabilitymodell verbinden; keinen ungeschützten Webzugriff auf localhost erzeugen.
- Einen begrenzten echten Offlinejob über die UI oder den technischen Prüfaufbau starten und bis zum archivierten Ergebnis nachweisen. Native Demo-/Performancefreigaben dürfen dafür noch offen sein und bleiben sichtbar gekennzeichnet.
- Den tatsächlichen Diff gegen die Technikgrenze prüfen: keine neue Designsystembibliothek, keine CSS-/Themeänderung, keine öffentliche Layoutpolitur, keine Menüumgestaltung und keine Motionimplementierung. Unvermeidbare Integrationsänderungen an Bestandsdateien müssen S01/S02 exakt abbilden und ihr unverändertes Erscheinungsbild nachweisen.

## Erlaubte Pfade
- apps/web/data/**
- apps/web/state/**
- apps/web/integration/**
- apps/web/test-harness/**
- apps/web/api/projection/**
- apps/web/route-compat/**
- apps/hub/remote-view/**
- adapters/remote-projection/**
- tests/web/integration/**
- evidence/S21/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json
- apps/web/styles/**
- apps/web/theme/**
- apps/web/design-system/**
- apps/web/motion/**
- **/*.css
- **/*.scss
- design-tokens/**
- design/approval.json
- assets/design/approved/**

## Lieferdateien
- evidence/S21/integrated-ui-report.json
- evidence/S21/navigation-regression.json
- evidence/S21/remote-projection-tests.json
- evidence/S21/accessibility-report.md
- evidence/S21/technical-design-boundary.json
- evidence/S21/state-contract-integration.json

## Prüfungen
- S21-C01 — Bestehende URLs und technische Arbeitsabläufe bleiben verwendbar; der tatsächliche Diff enthält keine vorgezogene öffentliche Design-, CSS-, Menü- oder Animationsumsetzung.
- S21-C02 — Leere, fehlende, veraltete und fehlerhafte Daten erhalten echte Zustände; keine erfundenen Livewerte oder Gewinne.
- S21-C03 — Kennzahl und Aktion sind bis Definition, Quelle, Zeitpunkt, Run, Konto und Revision zurückverfolgbar.
- S21-C04 — Abgelaufene oder widerrufene Projektionen ermöglichen keinen weiteren Zugriff; Reconnect und falscher Kontext verlieren keine Zustandsgrenzen.
- S21-C05 — Mindestens ein begrenzter echter Offlinejob durchläuft UI/Prüfaufbau→ACK→Worker→Archiv→Resultat; das ist weder Designabnahme noch native Profitabilitätsfreigabe.
- S21-C06 — Duplikate, umgekehrte Reihenfolge, Ereignislücke und verspätete Antwort nach Kontextwechsel sind fachlich geprüft; zukünftige Darstellung kann stabil auf dieselben IDs und Zustände aufbauen.

## Ausgeschlossen
- Keine Umsetzung der fünf freigegebenen Layouts, keine neuen Hauptseiten, keine visuelle Politur oder Animation vor S30.
- Keine Änderung an fachlicher Engine, Gewinnberechnung oder Brokerrechten zugunsten eines vereinfachten UI-Zustands.
- Kein technisches Preview als fertiges neues Produktdesign oder als Gesamtfreigabe ausgeben.

## Stopbedingungen
- Verbindliche Daten-/Zustandsverträge oder reale Quellendpunkte fehlen.
- Eine Änderung benötigt CSS, öffentliche Layout- oder Navigationsgestaltung; diesen Teil in S30–S35 zurückstellen, technische Integration eng weiterführen.
- Ein UI-Erfolg wird bestätigt, obwohl der zugehörige Fachservice oder native Readback noch offen ist.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet.

## Rückfall
Neue Adapter und technische Prüfwege gezielt deaktivieren; bisherige öffentliche Ansicht und bestätigte lokale Schutz-/Brokerzustände unverändert weiterführen.


# S22 · KI-Zugriff auf echte Daten, Jobs und Vorschläge begrenzen

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Eine KI kann Arbeit tatsächlich nachvollziehen und Forschung ausführen, ohne aus Textausgaben Handelsautorität zu erlangen.

## Abhängigkeiten
S02, S13, S16, S17, S21

## Eingaben
- Gemeinsame Toolregistry und vorhandene Trading_Local-Rechte.
- Job-, Daten-, Plan- und Ergebnisverträge.

## Arbeitsumfang
- Lesewerkzeuge für Quellen, Datenqualität, Positionen, Ledger, Versuche, Kandidaten, Planstatus und Nachweise an dieselben Fachservices anschließen.
- Forschungsaufträge benötigen ein vollständiges zulässiges Protokoll und ein Budget. Ein bloßer Gewinnwunsch ist kein Runparameter.
- Strategie-/Parameteränderungen als versionierte Vorschläge mit Diff, Quellen, Versuchsnachweis, Wirkungsbereich und Rückfall erzeugen.
- Toolrechte nach Projekt/Konto/Fähigkeit begrenzen; Secrets weder in Prompts noch in Ergebnissen ausgeben.
- Externe PDFs, Webseiten und Logs als Daten behandeln. Darin enthaltene Anweisungen können keine Rechte, Ziele oder Planregeln ändern.
- KI darf Misserfolge analysieren und neue Hypothesen formulieren; endgültige Policy-Promotion verlangt die gleichen Gates wie manuelle Arbeit.
- Werkzeugfehler, leere Daten, Timeouts und fehlende Autorisierung als explizite Antworten liefern; kein behaupteter Run ohne Job-ACK.

## Erlaubte Pfade
- apps/hub/mcp/**
- apps/web/api/tools/**
- core/proposals/**
- tests/tools/**
- evidence/S22/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json

## Lieferdateien
- evidence/S22/tool-registry.json
- evidence/S22/ai-capability-tests.json
- evidence/S22/proposal-evidence.json
- evidence/S22/prompt-injection-tests.json

## Prüfungen
- S22-C01 — Ein lesender Zugang kann keine Policy anwenden oder native Order auslösen.
- S22-C02 — Manipulative Anweisungen in einem importierten Dokument ändern keine Systemrechte.
- S22-C03 — Jeder behauptete Job hat eine bestätigte ID, Status und reale Ergebnisreferenz.
- S22-C04 — KI- und manuell erzeugte Vorschläge durchlaufen denselben Versions-/Prüfpfad.

## Ausgeschlossen
- Keine freie Shell oder beliebige Brokerfunktion aus dem Chat heraus.
- Kein persönlicher Brokerzugang im Browsercode.

## Stopbedingungen
- Toolscope, Kontobindung oder tatsächlicher Empfänger der Daten ist unklar.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet.

## Rückfall
Schreibende Vorschlags-/Jobfähigkeit deaktivieren; geprüfte Lesefunktionen weiter anbieten.


# S23 · Bestätigte Konfiguration und begrenzte Demosteuerung anbinden

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Freigegebene Konfigurationen bis zum nativen Readback verfolgen und jeden steuernden Auftrag exakt an Konto, Version und Umfang binden.

## Abhängigkeiten
S05, S06, S08, S11, S12, S21, S22

## Eingaben
- Native Host-/Observerabnahme aus S08.
- Ein konkret benanntes, für den Test freigegebenes Demokonto; keine Echtgeldfreigabe aus diesem Plan ableiten.

## Arbeitsumfang
- Bestehenden Vorschlag→Anwendung→Readback→ACK-Vertrag erweitern; unsupported und restart_required bleiben sichtbare Parameterzustände.
- CommandEnvelope mit Konto/Bot/Runtime/Policyhash, Nonce, Ablauf, erwarteter Revision und erlaubter Operation definieren.
- Vor Anwendung lokale Capability, frische Kontodaten, exakte Parametergrenzen und Konfliktfreiheit prüfen. Auf dem nativen Owner-Thread anwenden.
- Nur bestätigtes Readback setzt applied. Empfang oder Annahme des Auftrags erzeugen noch keine Behauptung über wirksame Brokerregeln.
- Start, Pause neuer Einstiege, geordnetes Stoppen und Notfallzustand fachlich trennen. Prozessstop darf nicht als bestätigte Positionsschließung erscheinen.
- Wiederholung, Ablauf, neu gestartete Runtime, geänderte Revision, Netzwerkabbruch und widersprüchliche parallele Vorschläge testen.
- Fernsteuerung zunächst auf zulässige Demo-Konfiguration beschränken. Produktionsänderung benötigt später eine konkrete Konto-/Operations-/Risikofreigabe.

## Erlaubte Pfade
- apps/hub/control/**
- adapters/ctrader/commands/**
- contracts/commands/**
- tests/control/**
- evidence/S23/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json

## Lieferdateien
- evidence/S23/command-contract.json
- evidence/S23/native-readback.json
- evidence/S23/control-negative-tests.json
- evidence/S23/demo-scope.json

## Prüfungen
- S23-C01 — Wiederholter oder abgelaufener Command wird nicht erneut wirksam.
- S23-C02 — Falsches Konto, fremde Runtime und veraltete Basisrevision werden abgewiesen.
- S23-C03 — Nur das native Readback bestätigt applied; jedes teilweise Scheitern ist sichtbar.
- S23-C04 — Kein Research-/KI-Zugang kann den lokalen Risikoprüfer umgehen.

## Ausgeschlossen
- Keine Echtgeldausführung.
- Keine pauschale schreibende Fernfreigabe.

## Stopbedingungen
- Zielkonto/Runtime oder exakte Wirkung eines Parameters ist unklar.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet.

## Rückfall
Neue Steuerfähigkeit deaktivieren; Konfigurationsrollback als neue bestätigte Revision durchführen.


# S24 · Prospektiven Schatten- und Demobetrieb durchführen

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Auf nach dem Einfrieren eintreffenden Daten prüfen, ob Verhalten, Kosten und Stabilität zur Simulation passen.

## Abhängigkeiten
S08, S11, S12, S19, S20, S23

## Eingaben
- Eingefrorene technische Demokonfiguration, Protokoll, native Leseschnittstelle und freigegebener Demoumfang. Ein wirtschaftlich abgelehnter Forschungskandidat darf als ausdrücklich technische Referenz getestet werden; dies ist keine wirtschaftliche Promotion.
- Realzeit kann nicht durch historische Wiederholung ersetzt werden.

## Arbeitsumfang
- Zuerst Schattenbetrieb ohne Orderwirkung: Signale, Ablehnungen, kalkulierte Fills und Kontext vollständig speichern.
- Danach begrenzte Demoausführung mit demselben Policyhash. Jeder tatsächliche Auftrag und jede Abweichung vom Replay erhält einen Grund.
- Mindestens 30 Handelssitzungen und mindestens 100 abgeschlossene Trades als vorläufige technische Beobachtungsuntergrenze vorab fixieren; bei langsamen Strategien Beobachtungszeit verlängern, nie Trades erzwingen.
- Für statistische Profitabilitätsaussagen zusätzlich die im Protokoll erforderliche unabhängige Evidenz verlangen; 100 korrelierte Trades sind kein Erfolgsbeweis.
- Preis-/Fillabweichung, Slippage, Swap, Sessionverhalten, Reconnect, Schutzbestätigung, Cancel/Fill-Rennen und Restbestände vergleichen.
- Zwischenberichte dienen Fehlerdiagnose. Eine fachliche Policyänderung startet eine neue Kandidatenversion und gegebenenfalls eine neue Beobachtungsphase.
- Zeitgebundene Zielwahrscheinlichkeit, maximalen Kontorückgang, Erholungszeit und Ausfallraten mit Nichterfolgen berichten.
- Finalen Forschungsworker gleichzeitig mit nativem Demoexecutor belasten: Ressourcen-/Warteschlangenbudgets, Schutzlatenz, priorisierten Abbruch und Wiederanlauf messen; S17-Offlinebudget genügt dafür nicht.
- Technisches Abnahmeurteil und wirtschaftliches Kandidatenurteil getrennt speichern. Technische Vollständigkeit, Kosten-/Fillabgleich und alle Schutzgates können bestanden sein, während wirtschaftliche Evidenz unzureichend oder negativ ist. Dieser Fall sperrt die behauptete wirtschaftliche Promotion, nicht S25 oder die spätere Designphase.

## Erlaubte Pfade
- operations/shadow/**
- operations/demo/**
- research/forward/**
- tests/native-acceptance/**
- evidence/S24/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json

## Lieferdateien
- evidence/S24/forward-protocol.json
- evidence/S24/shadow-report.json
- evidence/S24/demo-reconciliation.json
- evidence/S24/prospective-decision.md
- evidence/S24/native-worker-coexistence.json
- evidence/S24/technical-economic-decisions.json

## Prüfungen
- S24-C01 — Kein Forward-Resultat wird als rein historischer unberührter Holdout umetikettiert oder umgekehrt.
- S24-C02 — Simulation, Schattenmodell und tatsächliche Demo-Fills tragen verschiedene Evidenzlabels.
- S24-C03 — Nicht erklärbare wirtschaftliche Abweichungen blockieren wirtschaftliche Promotion. Handelt es sich um ungeklärte Fill-, Ledger-, Kostenmodell- oder Schutzfehler, bleibt zusätzlich die technische Abnahme gesperrt; reine Unprofitabilität ist kein technischer Fehler.
- S24-C04 — Bei zu kleiner wirtschaftlicher Evidenz lautet das wirtschaftliche Urteil inconclusive; ein Kalenderende erzwingt keinen Sieger. Die technischen Beobachtungs- und Schutzkriterien bleiben eigenständig verbindlich.
- S24-C05 — Unter finaler Workerlast bleiben vorab definierte lokale Schutz-/Antwortbudgets erfüllt; bei Überlast wird Forschung gedrosselt/abgebrochen und native Ausführung bleibt im freigegebenen Zustand.

## Ausgeschlossen
- Keine Echtgeldausführung als Teil der technischen Demoabnahme.
- Keine Tricks zur Erhöhung der Tradezahl.

## Stopbedingungen
- Ledgerabweichung, unbestätigter Schutz, Laufzeitinstabilität oder veränderte Policy im Messfenster.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet. Der technische Kartenabschluss verlangt alle technischen Beobachtungs- und Abnahmekriterien, jedoch kein positives Gewinnurteil. Wirtschaftliche Ablehnung oder Unklarheit wird vollständig dokumentiert und bleibt für jede Promotion wirksam.

## Rückfall
Neue Einstiege gemäß Demo-Runbook pausieren; Bestand nur über bestätigte zugelassene lokale Aktionen behandeln.


# S25 · Updates, Wiederherstellung und Dauerbetrieb mit Bestand prüfen

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Eine Version zuverlässig installieren, aktualisieren und zurücknehmen können, während echte Zustände erhalten bleiben.

## Abhängigkeiten
S06, S08, S21, S23, S24

## Eingaben
- Technisch abgenommene, eingefrorene Demokonfiguration aus S24 und vollständiger Journal-/Brokerabgleich. Ein positives wirtschaftliches Kandidatenurteil ist keine Eingangsvoraussetzung.
- Gleicher Zielhost wie in der nativen Abnahme.

## Arbeitsumfang
- Installer/Startpaket mit Code-, Datenbank-, Vertrags- und Runtimeversion sowie reproduzierbarem Buildmanifest erstellen.
- Updatezustände mit offenen Positionen/Pendings proben: keine neuen Einstiege während unklarer Übergabe, bestätigter Schutz bleibt erhalten.
- Migration mit Backup und Kompatibilitätsprüfung vorbereiten; fehlgeschlagene Migration darf die alte Anwendung nicht auf eine unlesbare Datenbank lenken.
- Restart, Brokerunterbruch, volle Platte, duplizierte Pakete, veraltete Remoteansicht und beschädigten Cache im Dauerlauf prüfen.
- Restore auf separater Testinstanz ausführen und dann native Brokerrealität neu abgleichen; alte Aufträge nie blind wiederholen.
- Messbare Alarme für ausbleibenden Heartbeat, Shadow/Live-Abweichung, Datenlücke, Ressourcenlimit und fehlgeschlagene Schutzaktion einrichten.
- Betriebsanleitung mit Start, Diagnose, Blocker, kontrollierter Pause, Update und Rückfall schreiben; Logs ohne Secrets exportierbar machen.
- Den technisch geprüften Stand vor der Designphase festhalten: Commit, Installer, Verträge, Datenbankschema, Run-/Policyhash und technische Freigabe. S30 darf erst nach diesem Gate beginnen; S26 prüft später die Kompatibilität des tatsächlich ausgelieferten Stands einschliesslich der Oberfläche.

## Erlaubte Pfade
- packaging/**
- apps/hub/migrations/**
- operations/runbooks/**
- tests/upgrade/**
- evidence/S25/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json

## Lieferdateien
- evidence/S25/release-manifest.json
- evidence/S25/upgrade-with-state.json
- evidence/S25/restore-drill.json
- evidence/S25/operations-runbook.md

## Prüfungen
- S25-C01 — Update/Restore erzeugt keine doppelte wirtschaftliche Wirkung und keinen stillen Verlust der Originalpläne.
- S25-C02 — Schema- und Runtimekonflikt führt zu expliziter Sperre statt improvisiertem Weiterbetrieb.
- S25-C03 — Alarme sind mit konkreten simulierten Störungen ausgelöst und beobachtet worden.
- S25-C04 — Anleitung wurde auf sauberem Zielhost nachvollzogen; Build allein ist keine Installationsabnahme.
- S25-C05 — Technischer Installations-/Betriebsnachweis ist abgeschlossen und von der wirtschaftlichen Bewertung getrennt. Ein negatives oder unklares Gewinnurteil blockiert weder technische Wartbarkeit noch S30.

## Ausgeschlossen
- Keine unkontrollierte In-place-Migration des Produktionskontos.
- Keine automatische Freigabe über bestandene Unit-Testzahl.

## Stopbedingungen
- Wiederherstellung oder Bestandsübergabe ist ungeklärt.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet.

## Rückfall
Vorheriges kompatibles Release und gesicherten Datenstand herstellen; danach nativen Bestand neu abgleichen.


# S30 · Freigegebene Referenzen in Design-Tokens und Bauteile übersetzen

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Nach vollständiger technischer Abnahme eine gemeinsame, überprüfbare Gestaltung aus den bestätigten Bildern ableiten und als wiederverwendbare Grundlage implementieren.

## Abhängigkeiten
S21, S22, S25

## Eingaben
- Abgeschlossene technische Gates S21, S22 und S25 mit Commit-/Vertragsbezug; negatives oder unklares Gewinnurteil ist kein Blocker.
- Gültige hashgebundene Desktopfreigabe und unveränderte fünf Referenzbilder; reale Pfade sind durch S01/S02 aufgelöst.
- S03-Referenzdokumentation, S21-Zustandsverträge sowie design/UX_MOTION_SPEC.md.

## Arbeitsumfang
- Vor jeder Änderung Gate und Hashes prüfen. Reihenfolge dokumentieren: technische Abnahme abgeschlossen, Desktopreferenzen bestätigt, erst jetzt Designimplementierung beginnen.
- Jede Referenz auf Zweck, Informationshierarchie, Kartenmasse, Abstände, Schriftgrössen, Randlinien und Farbrollen abbilden. A01-r04 bleibt führend; Forschung darf die in A03 gezeigte höhere Datendichte nutzen.
- Semantische Tokens für Hintergrund, Flächen, Rand, Text, Fokus, Erfolg, Warnung, Fehler, Abstand, Radius und Typografie aus der bestehenden Sprache ableiten. Zahlen und Währungen erhalten stabile typografische Breite; Farbe allein trägt keine Bedeutung.
- Die Vierer-Navigation und den Zahnradzugang als gemeinsamen Shellvertrag festlegen. Beobachtetes Setup besitzt genau eine Instanz und ein festes Ziel: Übersicht.
- Wiederverwendbare Grundbauteile für Karte, Status, Kennzahl, Button, Feld, Tabs, Tabelle, Hinweis, Dialog und Drawer implementieren; Fokus, disabled und loading sind echte Zustände.
- Design-Tokens und Bauteilverträge mit der vorhandenen Architektur verbinden. Keine neue Frameworkmigration oder zweite konkurrierende Komponentenbibliothek ohne begründeten Architekturentscheid.
- Motionrollen, Ebenen, Portal-/Overlayregeln, aktive/ausblendende Zustände und reduced-motion-Vertrag als gemeinsame Bauteileigenschaften implementieren. Ein-/Austrittsmuster und Lifecycle werden bereits hier vorbereitet und von S31/S32 benutzt; S33 vervollständigt und prüft die bewegten Gesamtwege.
- Eine kleine Komponentenprüfansicht mit realistischen kurzen/längeren deutschen Texten, negativen Zahlen und fehlenden Werten erstellen; Produktseiten erst in S31/S32 zusammensetzen.
- Token- und Referenzzuordnung technisch prüfen und offene Interpretationen ausdrücklich dokumentieren. Unklare Pixelwerte sind messbare Designentscheidungen, keine erfundenen exakten Messungen aus einem Bild. Die vorgeschlagenen Motion-/Leistungsziele aus UX_MOTION_SPEC vor der Messung als benanntes Prüfprofil fixieren; Änderungen benötigen Begründung und dokumentierte technische Prüfung, keine nachträgliche Grenzsenkung zugunsten eines grünen Ergebnisses.

## Erlaubte Pfade
- apps/web/design-system/**
- apps/web/styles/tokens/**
- apps/web/component-preview/**
- apps/web/components/transitions/**
- docs/ui/implementation/**
- tests/web/components/**
- evidence/S30/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json
- design/approval.json
- assets/design/approved/**
- core/ledger/**
- core/risk/**
- core/execution/**
- adapters/ctrader/**
- adapters/mt5/**
- contracts/trading/**

## Lieferdateien
- evidence/S30/reference-token-map.json
- evidence/S30/design-token-audit.json
- evidence/S30/component-contract.json
- evidence/S30/component-review.md
- evidence/S30/technical-entry-gate.json

## Prüfungen
- S30-C01 — S21, S22 und S25 sowie gültige Desktopfreigabe sind vor Designcodeänderung nachgewiesen; kein Gewinnziel wirkt als Eingangsgate.
- S30-C02 — Fünf Referenz-IDs und Bildhashes stimmen mit der unveränderten Freigabe überein; A01 bleibt visuelle Hauptreferenz.
- S30-C03 — Tokens sind zentral und semantisch verwendet; keine beliebigen Zusatzfarben, Gradients, dekorativen Sterne oder neue visuelle Metaphern.
- S30-C04 — Alle Grundbauteile besitzen überprüfbare Fokus-, disabled-, Lade- und Fehlerzustände mit den vereinbarten Daten-/ACK-Bedeutungen.
- S30-C05 — Shellvertrag enthält vier Hauptbereiche, Zahnrad-Einstellungen und ausschliesslich eine Setup-Instanz in der Übersicht.
- S30-C06 — Kein fachlicher Vertrag, Brokerrecht oder Berechnungsalgorithmus wurde durch die Gestaltung verändert; Komponentenprüfung und tatsächlicher Diff liegen vor.

## Ausgeschlossen
- Keine neue Designrichtung oder zusätzliche Hauptnavigation.
- Keine Produktseitenvollimplementierung in dieser Karte und keine Änderungen am Entscheidungskern.
- Keine nachträgliche Behauptung, ein freigegebenes Bild belege mobile Bedienung oder Motion.

## Stopbedingungen
- Technikgate, reale Scopeauflösung oder Referenzfreigabe fehlt/ist ungültig.
- Ein Bauteil benötigt eine fachliche Vertragsänderung; diese geht an den zuständigen technischen Schritt zurück.
- Gestaltung weicht materiell von den bestätigten fünf Referenzen ab.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Die fünf Desktopbilder sind bereits als Ausgangsdesign freigegeben; mobile Ansichten, Verhalten und Laufzeit werden erst anhand der hier geforderten realen Nachweise abgenommen. Kein wirtschaftlicher Erfolg ist Voraussetzung dieser Designkarte.

## Rückfall
Neue Token-/Komponentenversion im Arbeitszweig zurücknehmen; technische Integration und bisherige bestätigte Website bleiben lauffähig.


# S31 · Vier Hauptseiten nach den freigegebenen Desktopreferenzen bauen

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Übersicht, Beobachtung, Forschung und Positionen als zusammenhängendes Botprodukt auf den vorhandenen technischen Verträgen umsetzen.

## Abhängigkeiten
S30

## Eingaben
- Abgenommene Tokens/Bauteile aus S30 und technische Daten-/Zustandsverträge aus S21.
- Referenzen A01-r04, A02-r03, A03-r03 und A05-r03; verbindliche Vierer-Navigation.

## Arbeitsumfang
- Die gemeinsame Shell mit genau Übersicht, Beobachtung, Forschung und Positionen implementieren. Kontokontext und Verbindung bleiben über Seitenwechsel erhalten; Einstellungen öffnet das Zahnrad.
- Übersicht nach A01-r04 umsetzen: Botstatus, wenige aussagekräftige Kennzahlen, aktuelle Aktivität und genau ein beobachtetes Setup. Der erste Blick beantwortet, was der Bot tut, warum und ob Handlungsbedarf besteht.
- Beobachtung nach A02-r03 für Ablauf, Markt-/Mehrzeitkontext, Signale, Ablehnungen und Entscheidungen gestalten. Keine zweite Setup-Kachel und kein verschleierter Strategiekatalog.
- Forschung nach A03-r03 mit echter Queue, Versuchskontext, Vergleich, Evidenz und Ergebnisdetails umsetzen. Strategievarianten gehören als prüfbare Forschungsobjekte hierher; ungeprüfte Vorschläge bleiben von aktiver Policy getrennt.
- Positionen nach A05-r03 mit bestätigtem Bestand, Konto-/Währungskontext, ursprünglichem Positionsplan, Schutzreadback und nachvollziehbarem Verlauf aufbauen. Offene, geschlossene und unbekannte Zustände bleiben verschieden.
- Zahlen, Währungen, Zeiträume, Zeitzonen und Quellenstatus aus den Fachverträgen darstellen. Ergebnisse behalten Run-/Daten-/Policybezug; Demodaten oder Fixtures erhalten eine explizite Prüfkennzeichnung.
- Details durch progressive Offenlegung zugänglich machen: kurze Haupttexte, klare Aktionen, technische IDs und vollständige Diagnose erst im Detail. Kein Werbetext, erfundene Kompetenzbehauptung oder zufälliger Fülltext.
- Scroll, Filter, Tabellenwahl, Chartzeitraum und Kontokontext zwischen den relevanten Ansichten gezielt erhalten. Bestehende Links über die S03-Zuordnung prüfen; keine vollständigen Seitenneuladevorgänge im normalen Arbeitsablauf.
- Jede der vier Seiten bereits mit den gemeinsamen Ein-/Austritts- und Lifecyclebausteinen aus S30 zusammensetzen; keine harte Remountstruktur vorsehen, die später neu gebaut werden müsste. Erst einzeln am Referenzformat, dann im gemeinsamen Durchlauf prüfen; Datenbindung, leere/fehlende Zustände und vorhandene Übergänge separat erfassen. Gesamtvollständigkeit und Live-Motion-Abnahme folgen S33.

## Erlaubte Pfade
- apps/web/shell/**
- apps/web/pages/overview/**
- apps/web/pages/observation/**
- apps/web/pages/research/**
- apps/web/pages/positions/**
- apps/web/view-models/**
- apps/web/route-compat/**
- tests/web/pages/**
- docs/ui/page-mapping/**
- evidence/S31/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json
- design/approval.json
- assets/design/approved/**
- core/ledger/**
- core/risk/**
- core/execution/**
- adapters/ctrader/**
- adapters/mt5/**
- contracts/trading/**

## Lieferdateien
- evidence/S31/four-page-map.json
- evidence/S31/desktop-comparison.json
- evidence/S31/data-binding-report.json
- evidence/S31/route-state-regression.json
- evidence/S31/copy-and-hierarchy-review.md

## Prüfungen
- S31-C01 — Genau vier Hauptbereiche sind vorhanden; Zahnrad öffnet Einstellungen ohne fünften Hauptbereich.
- S31-C02 — Beobachtetes Setup erscheint im gesamten Produkt genau einmal in der Übersicht; auch versteckte oder responsive Doppelinstanzen sind ausgeschlossen.
- S31-C03 — Die vier Seiten entsprechen den zugehörigen Referenzen in Hierarchie, Informationsdichte und gemeinsamer Designsprache.
- S31-C04 — Forschung zeigt tatsächliche Jobs und vollständige Ergebnisse samt Verlusten, Ablehnungen und Unklarheit; keine erfundenen Live- oder Erfolgszustände.
- S31-C05 — Quellen, Zeitpunkte, Einheiten, Kontext und Fachbedeutungen stimmen bei Kennzahlen und Aktionen mit S21/S23 überein.
- S31-C06 — Seitenwechsel verlieren weder Kontokontext noch ungespeicherten Entwurf stillschweigend; bestehende Routen und zentrale Workflows sind geprüft.
- S31-C07 — Kurze eindeutige deutsche UI-Texte erklären Handlungen/Zustände; unbelegte Versprechen und technische Detailfluten auf der Hauptansicht fehlen.

## Ausgeschlossen
- Kein Strategie-/Regelkatalog als zusätzliche Produktseite.
- Keine Änderung an Forschungsselektion, Risiko-, Geld- oder Orderlogik.
- Keine öffentliche Veröffentlichung einer unvollständig abgenommenen Oberfläche.

## Stopbedingungen
- Die gleiche Information benötigt widersprüchliche Fachzustände oder fehlt im Vertrag.
- Eine Seite dupliziert das beobachtete Setup oder erweitert die Hauptnavigation.
- Für gestalterische Wirkung werden echte Werte durch erfundene Daten ersetzt.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Die fünf Desktopbilder sind bereits als Ausgangsdesign freigegeben; mobile Ansichten, Verhalten und Laufzeit werden erst anhand der hier geforderten realen Nachweise abgenommen. Kein wirtschaftlicher Erfolg ist Voraussetzung dieser Designkarte.

## Rückfall
Betroffene Seite beziehungsweise Shelländerung gezielt zurücksetzen; technische Adapter und gespeicherte Zustände erhalten.


# S32 · Bot-Einstellungen, Dialoge und vollständige Bedienzustände umsetzen

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Die fünfte Referenz und alle erforderlichen Bedienzustände konsistent ergänzen, damit reale Arbeit ohne doppelte Regeln oder missverständliche Bestätigungen möglich ist.

## Abhängigkeiten
S31

## Eingaben
- Referenz A04-r03, vier integrierte Hauptseiten, S23-Konfigurations-/Readbackvertrag und Capabilitymatrix.
- Zustandsmatrix aus S03 sowie Komponenten- und Motionvertrag aus S30.

## Arbeitsumfang
- Bot-Einstellungen nach A04-r03 über das Zahnrad umsetzen. Werte aus tatsächlichen unterstützten Parametern beziehen; unsupported, restart_required und read-only bleiben erkennbare Zustände.
- Aktuell bestätigte Konfiguration, lokalen Entwurf, validierten Vorschlag, übermittelten Auftrag und bestätigtes Readback getrennt darstellen. Erst natives Readback darf angewendet melden.
- Ungespeicherte Änderungen bei Navigations-/Kontowechsel konsistent behandeln: behalten, gezielt verwerfen oder kontrolliert abbrechen. Späte Antworten dürfen einen anderen Entwurf nicht überschreiben.
- Dialoge, Drawer, Dropdowns, Tabs, Akkordeons, Hinweise und Bestätigungen aus den gemeinsamen Bauteilen einschliesslich Ein-/Austrittsmuster aus S30 zusammensetzen; pro Arbeitsvorgang eine klare Hauptaktion und einen verständlichen Rückweg. Exitphase und Fokus-Lifecycle gehören von Anfang an zur Komponente.
- Für jede Hauptseite und jede Aktion die Zustände initial/leer, Laden, Teilresultat, Aktualisieren, veraltet, offline, Berechtigung fehlt, Fehler, Abbruch und erfolgreich implementieren. Eine absichtlich leere Forschungsliste unterscheidet sich von einem Ladefehler.
- Fehler benennen Ursache und sinnvollen nächsten Schritt; lokale Eingaben bleiben nach Netzwerkfehler erhalten. Wiederholen benutzt denselben fachlich zulässigen Auftrag und erzeugt keine Doppelwirkung.
- Pause neuer Einstiege, Stoppen des Prozesses und Schliessen einer Position in Text, Zustand und Wirkung trennen. Sichtbare Schaltflächen bleiben durch tatsächliche Capabilities und Bestandskontext begrenzt.
- Fokusinitialisierung, Tastatur, Escape, Fokusfalle wo angemessen, Rückkehr zum Auslöser und Hintergrundsperre festlegen. Während einer Ausblendung bleiben unsichtbare Elemente nicht bedienbar.
- Zustandsmatrix mit nachvollziehbaren Fixtures und wenigstens den technisch verfügbaren realen Durchläufen ausführen. Die ein-/ausblendenden Übergänge dieser Bauteile bleiben verbindlicher Prüfgegenstand von S33.

## Erlaubte Pfade
- apps/web/settings/**
- apps/web/components/dialogs/**
- apps/web/components/drawers/**
- apps/web/components/forms/**
- apps/web/components/states/**
- apps/web/view-models/configuration/**
- tests/web/states/**
- docs/ui/state-matrix/**
- evidence/S32/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json
- design/approval.json
- assets/design/approved/**
- core/ledger/**
- core/risk/**
- core/execution/**
- adapters/ctrader/**
- adapters/mt5/**
- contracts/trading/**

## Lieferdateien
- evidence/S32/settings-reference-review.json
- evidence/S32/screen-state-matrix.json
- evidence/S32/configuration-ack-report.json
- evidence/S32/dialog-keyboard-report.json
- evidence/S32/error-recovery-report.json

## Prüfungen
- S32-C01 — Bot-Einstellungen entsprechen A04-r03, sind ausschliesslich über den vorgesehenen Zugang erreichbar und enthalten keinen neu erfundenen Strategiekatalog.
- S32-C02 — Entwurf, Auftrag angenommen und tatsächlich angewendet sind im Normal-, Timeout-, Teilfehler- und Reconnectfall eindeutig verschieden.
- S32-C03 — Jede definierte Ansicht/Aktion besitzt die relevanten Leer-/Lade-/Fehler-/Veraltet-/Berechtigungs-/Ergebniszustände mit überprüfbarer Quelle.
- S32-C04 — Abbruch, Wiederholung und Seitenwechsel verlieren keinen Entwurf stillschweigend und erzeugen keine doppelte Fachwirkung.
- S32-C05 — Dialoge und Detailflächen sind mit Tastatur erreichbar, verlassen und korrekt fokussiert; ausgeblendete Inhalte sind nicht interaktiv.
- S32-C06 — Pause/Stop/Positionsaktion bleiben fachlich getrennt; eine bestätigende Animation ersetzt keine tatsächliche native Rückmeldung.

## Ausgeschlossen
- Keine neuen Steuerrechte, Parametersemantik oder Brokeroperationen.
- Keine optisch erfolgreiche Bestätigung vor dem fachlichen ACK/Readback.
- Keine leeren Demoaktionen, die eine reale Wirkung vorspiegeln.

## Stopbedingungen
- Unterstützte Parametermenge, Bestätigungsbedeutung oder Capability ist unklar.
- Ein Dialog braucht eine fachliche Aktion ausserhalb der vorhandenen Verträge.
- Entwurf oder Fokus geht bei Zustandswechsel reproduzierbar verloren.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Die fünf Desktopbilder sind bereits als Ausgangsdesign freigegeben; mobile Ansichten, Verhalten und Laufzeit werden erst anhand der hier geforderten realen Nachweise abgenommen. Kein wirtschaftlicher Erfolg ist Voraussetzung dieser Designkarte.

## Rückfall
Betroffene Bedienkomponente auf den letzten geprüften Stand zurücksetzen; bestätigte native Konfiguration und lokal gespeicherte Entwürfe nicht überschreiben.


# S33 · Alle Wechsel und Liveaktualisierungen ruhig in beide Richtungen animieren

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Jeder normale Strukturwechsel erhält einen nachvollziehbaren Ein- und Austritt; laufende Daten aktualisieren sich ohne Neuladen, Sprünge oder Verlust der Nutzerposition.

## Abhängigkeiten
S31, S32

## Eingaben
- Vollständige Seiten-/Zustandskomponenten aus S31/S32, zentrale Tokens sowie design/UX_MOTION_SPEC.md.
- Reale Ereignisfolge, Replay-/Reconnectverträge und stabile Identitäten aus S21.

## Arbeitsumfang
- Eine vollständige Übergangsinventur erstellen: Hauptnavigation, Untertabs, Einstellungen, Dialoge, Drawer, Menüs, Akkordeons, Tooltips, Hinweise, Tabellen-/Filteränderungen sowie Lade-/Leer-/Fehler-/Ergebniswechsel. Jeder Eintrag erhält enter, exit, Unterbrechung und reduced-motion-Verhalten.
- Verbindliche Timing-/Easingrollen zentral aus dem Motionvertrag implementieren. Gemeinsame Bauteile verwenden dieselbe Bewegungslogik; keine zufälligen Einzelanimationen, endlosen Dekoeffekte oder abweichenden Federn.
- Ausblendende Elemente erst nach Abschluss ihrer Exitphase aus dem DOM entfernen, dabei sofort gegen weitere Interaktion schützen. Fokus- und Hintergrundzustand anhand des tatsächlichen Dialogzustands synchronisieren, nicht nur anhand sichtbarer Opazität.
- Schnelles Öffnen/Schliessen, Seitenwechsel während Übergang und Richtungswechsel aus dem aktuell sichtbaren Zustand fortsetzen oder kontrolliert ersetzen. Keine Warteschlange veralteter Animationen, keine verlorenen Klicks, keine hängen gebliebenen Overlays.
- Höhen-/Layoutwechsel räumlich nachvollziehbar führen und Platz reservieren. Nach Möglichkeit transform/opacity nutzen; unvermeidbare Layoutanimationen klein begrenzen und messen. Datenänderung remountet weder Seite noch Chart noch bereits geöffnete Details.
- Nur betroffene Felder und Reihen aus geordneten, deduplizierten Ereignissen aktualisieren. Fachwerte entsprechen dem tatsächlich neuesten zulässigen Zustand; keine erfundenen Zwischenkurse oder überholten Zähleranimationen.
- Scroll, Zoom, Auswahl, Tabellenfokus, Eingabe und offene Flächen bei Telemetrie erhalten. Neue Zeilen bewegen die gelesene Position nicht ungefragt; bei Bedarf neue Einträge mit einer bewusst nutzbaren Anzeige anbieten.
- Reconnect und Datenalter sichtbar behandeln: letzter bestätigter Wert plus Frischehinweis, klarer Wiederverbindungszustand und geordneter Snapshotabgleich. Ein Sanftübergang darf einen tatsächlichen Ausfall oder eine Schutzwarnung nicht verschleiern.
- Reduced-motion-Zweig vollständig implementieren: räumliche Bewegung, Parallax und grosse Skalierung entfallen, Zustandswechsel bleiben verständlich und unmittelbar nutzbar. Diese dokumentierte Barrierefreiheitsausnahme ist keine fehlende Normalanimation.
- Reale Bildschirmaufnahmen und automatisierte Zustandsfolgen für beide Richtungen, Unterbrechung, Burst, Fehler und Reconnect sichern. Fachliche ACK-/Warnsignale dürfen niemals auf das Ende einer dekorativen Animation warten.

## Erlaubte Pfade
- apps/web/motion/**
- apps/web/design-system/motion/**
- apps/web/components/transitions/**
- apps/web/live-view/**
- apps/web/view-state/**
- tests/web/motion/**
- tests/web/live-updates/**
- docs/ui/motion/**
- evidence/S33/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json
- design/approval.json
- assets/design/approved/**
- core/ledger/**
- core/risk/**
- core/execution/**
- adapters/ctrader/**
- adapters/mt5/**
- contracts/trading/**

## Lieferdateien
- evidence/S33/transition-inventory.json
- evidence/S33/enter-exit-interruption-report.json
- evidence/S33/live-update-stability.json
- evidence/S33/reconnect-and-burst-report.json
- evidence/S33/motion-recording-index.json
- evidence/S33/reduced-motion-report.json

## Prüfungen
- S33-C01 — Die Übergangsinventur deckt alle sichtbaren Strukturwechsel ab; jeder normale Ein- und Austritt besitzt geprüfte Animation statt abruptem Einblenden oder Entfernen.
- S33-C02 — Schnelle Umkehr und wiederholte Bedienung hinterlassen weder blockierenden Overlay noch unsichtbar bedienbaren Inhalt; kein verspätetes Ereignis setzt alten UI-Zustand zurück.
- S33-C03 — Normale Navigation und Telemetrie benötigen keinen vollständigen Seitenreload; Fokus, Scroll, Chartzoom, Auswahl und lokale Eingaben bleiben stabil.
- S33-C04 — Duplikate, Lücken, verkehrte Reihenfolge und Bursts werden fachlich korrekt verarbeitet; angezeigte Preise, Bestände und Bestätigungen bleiben echte Zustände.
- S33-C05 — Timer, Listener und Animationen werden beendet oder wiederverwendet; schnelles Wechseln erzeugt keine wachsenden parallelen Effekte oder dauerhaft hängenden Ladeindikatoren.
- S33-C06 — Reduced-motion ist vollständig nutzbar und geprüft; eine wichtige Warnung oder native Bestätigung wird nie durch Motion verzögert.
- S33-C07 — Video und Protokoll belegen beide Richtungen sowie Fehler-/Reconnectfälle auf dem genauen Build; statische Screenshots gelten nicht als Motionnachweis.

## Ausgeschlossen
- Keine fachliche Zustandsänderung oder verzögerte Warnmeldung zugunsten eines Effekts.
- Keine simulierten Kurse, Fakeprogress, Dauerblinken, Parallaxdekoration oder flächige teure Blur-Animation.
- Keine Änderung der freigegebenen Informationshierarchie oder des Forschungs-/Brokerprotokolls.

## Stopbedingungen
- Übergang versteckt einen Fehler oder meldet Anwendung ohne Readback.
- Ein-/Ausblendung verliert Fokus, ist nicht unterbrechbar oder blockiert Folgeaktion.
- Liveverarbeitung verliert Reihenfolge, Kontext oder den letzten bestätigten Wert.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Die fünf Desktopbilder sind bereits als Ausgangsdesign freigegeben; mobile Ansichten, Verhalten und Laufzeit werden erst anhand der hier geforderten realen Nachweise abgenommen. Kein wirtschaftlicher Erfolg ist Voraussetzung dieser Designkarte.

## Rückfall
Betroffenen Motionbaustein auf den letzten geprüften ruhigen Übergang zurücknehmen; reale Datenverarbeitung erhalten und fehlerhafte Effektvariante deaktivieren.


# S34 · Responsive Bedienung, Zugänglichkeit und Laufzeitqualität nachweisen

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Das bestätigte Desktopkonzept auf tatsächlich nutzbare kleinere Ansichten übertragen und Bedienbarkeit sowie flüssige Laufzeit unter benannter Last messen.

## Abhängigkeiten
S33

## Eingaben
- Integrierter Desktopstand mit vollständiger Motion aus S33; die Desktopfreigabe ersetzt keine responsive Validierung.
- Verbindliche Messprotokolle und Budgets aus design/UX_MOTION_SPEC.md, benannte Browser/Geräte und reproduzierbare Datenszenarien.

## Arbeitsumfang
- Responsive Regeln für die Referenzgrösse sowie 1440×900, 1024×768, 390×844, 360×800 und 320×740 CSS-Pixel festlegen und prüfen. Informationspriorität erhalten; keine verkleinerte unlesbare Desktopkopie oder duplizierte Setup-Komponente.
- Navigation, Settingszugang, Tabellen, Charts, Detailflächen und Formulare auf schmale Breite übertragen. Horizontaler Tabellenscroll ist lokal gekennzeichnet; die gesamte Seite läuft nicht versehentlich horizontal über.
- Touch, Tastatur, Desktopzoom auf 200 Prozent, Textvergrösserung, Fokusreihenfolge und Screenreaderzustände prüfen; ein Gerät mit DPR grösser 1 einschliessen. Beschriftungen, Fehlerzuordnung, Kontrast und Nicht-Farbcodierung anhand des UX-Vertrags abnehmen.
- Reduced-motion, langsame Verbindung, offline, leere und stark gefüllte Ansichten in derselben Matrix prüfen; Tooltips dürfen keine einzige Zugriffsmöglichkeit auf notwendige Informationen sein.
- Leistungsprofil vor Messung einfrieren: Gerät, Browser, Build, Viewport, Datenmenge, Ereignisrate, Dauer und Messverfahren. Interaktionslatenz, Framestabilität, Layoutverschiebung, Render-/DOMwachstum und Speicherentwicklung erfassen.
- Normalbetrieb und im Vertrag benannte Burstlast prüfen. Ereignisse fachlich verlustfrei zusammenführen, sichtbare Aktualisierung begrenzen, lange Tabellen bei belegtem Bedarf virtualisieren; keine blinde Animation tausender Zeilen.
- Engstellen gezielt beseitigen, ohne Datenkorrektheit oder freie Bedienung zu opfern. Nur betroffene Komponenten messen und erneut prüfen; Vorher-/Nachherdaten zum gleichen Szenario sichern.
- Responsive Abweichungen gegenüber den Desktopbildern als begründete Übertragung dokumentieren und technisch prüfen. Eine neue visuelle Richtung bleibt ausgeschlossen; mobile/motionbezogene Freigabe nicht rückwirkend behaupten.
- Alle noch offenen hohen Bedien-/Darstellungsbefunde beheben oder den tatsächlich abgenommenen Umfang klar begrenzen; S35 erhält die vollständige Mess- und Befundmatrix.

## Erlaubte Pfade
- apps/web/styles/responsive/**
- apps/web/components/responsive/**
- apps/web/accessibility/**
- apps/web/performance/**
- apps/web/design-system/responsive/**
- tests/web/responsive/**
- tests/web/accessibility/**
- tests/web/performance/**
- docs/ui/quality/**
- evidence/S34/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json
- design/approval.json
- assets/design/approved/**
- core/ledger/**
- core/risk/**
- core/execution/**
- adapters/ctrader/**
- adapters/mt5/**
- contracts/trading/**

## Lieferdateien
- evidence/S34/responsive-matrix.json
- evidence/S34/accessibility-audit.md
- evidence/S34/keyboard-touch-screenreader.json
- evidence/S34/performance-protocol.json
- evidence/S34/performance-results.json
- evidence/S34/responsive-comparison-index.json

## Prüfungen
- S34-C01 — Alle vereinbarten Breiten sind mit wirklichen Ansichten belegt; Kernaktionen, Werte und Hinweise bleiben lesbar und erreichbar, ohne ungewollten Seitenüberlauf.
- S34-C02 — Tastatur, Fokus, Touch, Zoom und Screenreader erfüllen die konkret im UX-Vertrag festgelegten Anforderungen; kritische Informationen werden nicht nur durch Farbe oder Hover vermittelt.
- S34-C03 — Dieselbe Setup-Instanz bleibt über responsive Wechsel erhalten; keine zweite nur per CSS versteckte Setup-Kachel.
- S34-C04 — Laufzeitbudgets sind mit vorab benanntem Gerät/Browser/Build und reproduzierbarer Normal-/Burstlast gemessen; ungemessene pauschale 60-fps-Behauptungen fehlen.
- S34-C05 — Längere Bedienung und Verbindungswechsel erzeugen kein unbeschränktes DOM-, Listener- oder Speicherwachstum und keine dauerhafte Reaktionsblockade.
- S34-C06 — Mobile, reduced-motion, Leer-/Fehler- und Livefälle sind tatsächlich geprüft; Desktopbildfreigabe wird nicht als Ersatz verwendet.
- S34-C07 — Optimierung bewahrt Ereignisordnung, aktuelle Werte, Fokus und Warnlatenz; Differenz und relevante Gegenfälle sind belegt.

## Ausgeschlossen
- Keine Geräte-/Netzwerkleistung aus einem Mockup ableiten.
- Keine kosmetische Verbesserung durch Weglassen von Warnungen, Messwerten oder Verlustfällen.
- Keine Änderungen an Markt-/Broker- oder Forschungslogik.

## Stopbedingungen
- Kernaktion ist bei einer Pflichtbreite oder mit Tastatur nicht nutzbar.
- Messbudget wird überschritten oder Messgerät/-daten sind nicht nachvollziehbar.
- Responsive Anpassung verändert Hauptnavigation oder fachliche Bedeutung.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Die fünf Desktopbilder sind bereits als Ausgangsdesign freigegeben; mobile Ansichten, Verhalten und Laufzeit werden erst anhand der hier geforderten realen Nachweise abgenommen. Kein wirtschaftlicher Erfolg ist Voraussetzung dieser Designkarte.

## Rückfall
Problematische responsive/Optimierungsänderung zurücknehmen; vorher geprüfte Datenbindung und zentrale Motion erhalten, betroffenen Qualitätsbefund offen lassen.


# S35 · Fünf Referenzansichten, Motion und Bedienung gemeinsam abnehmen

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Die tatsächlich funktionierende Oberfläche gegen alle fünf freigegebenen Bilder und den vollständigen UX-/Motionvertrag prüfen und ein versionsgebundenes Urteil für S26 liefern.

## Abhängigkeiten
S30, S31, S32, S33, S34

## Eingaben
- Genauer Code-/Buildstand, abgeschlossene S30–S34-Nachweise, gültige unveränderte Desktopfreigabe und fünf Referenzbilder.
- design/visual_acceptance_TEMPLATE.json, vollständige Zustands-/Übergangsinventur und S34-Messprofil.

## Arbeitsumfang
- Abnahmebuild, Referenzhashes, Tokenstand, Datenfixtures, Browser, Viewports und ausführende Instanz vor dem Durchlauf festhalten. Nur das tatsächlich geprüfte Artefakt kann übernommen werden.
- Alle fünf Desktopansichten nach Referenz-ID vergleichen: A01-r04 Übersicht, A02-r03 Beobachtung, A03-r03 Forschung, A04-r03 Einstellungen und A05-r03 Positionen. Hierarchie, Platzierung, Karten, Typografie, Abstände und Informationsdichte nachvollziehbar bewerten.
- Dynamische Werte beim Bildvergleich nur mit eng begründeten, vorab dokumentierten Masken behandeln. Struktur, Texte, Zustände und Layoutfehler dürfen nicht grossflächig aus dem Vergleich verschwinden.
- Vollständige Bedienläufe aufnehmen: Navigation hin/zurück, Öffnen/Schliessen jeder Fläche, Formbearbeitung, ACK/Fehler, Forschung starten/abbrechen/Ergebnis prüfen, Positionsdetails und Reconnect.
- Normalmotion, schnelle Umkehr, reduced-motion und Livebursts anhand der Inventur prüfen. Beide Richtungen müssen im Video erkennbar sein; ein schönes Standbild erfüllt diese Prüfung nicht.
- Responsive-, Tastatur-, Fokus-, Text-/Kontrast- und Leistungsnachweise auf denselben Build beziehen. Bei geänderten Bauteilen betroffene Nachweise erneuern; keine pauschale Übernahme alter Messergebnisse.
- Produktregeln explizit zählen und prüfen: vier Hauptbereiche, Zahnrad-Einstellungen, genau eine Setup-Instanz ausschliesslich in der Übersicht, kein Strategie-/Regelkatalog, keine erfundenen Daten oder Werbeversprechen.
- Befunde nach Wirkung einordnen. Kritische/hohe Funktions-, Daten-, Bedien- oder Bewegungsfehler sperren Abschluss. Bei nötiger Produktkorrektur die laufende Abnahme über planctl block anhalten. Den konkreten Korrekturauftrag in der zuständigen Umsetzungskarte durch ein versioniertes, nachweisgebundenes Planamendment ergänzen; danach planctl relock über den bestehenden Amendmentweg ausführen. Die geänderte Karte und ihre abhängigen Nachfolger werden dadurch auf pending gesetzt. Die zuständige Karte normal starten, den begrenzten Korrekturauftrag ausführen und alle betroffenen Nachweise erneuern, bevor S35 erneut beginnt. Keine direkte Änderung der Statusdatei, kein Force-Abschluss und kein improvisierter Reopen-Schalter.
- Abnahmemanifest mit bestanden/nicht bestanden je Bild, Zustand, Übergang, Breite und Qualitätsgate erstellen. Verbleibende geringe Abweichungen begründen und anhand der dokumentierten Kriterien akzeptieren; neue Designrichtungen verlangen eine geprüfte Referenzänderung.
- S26 die exakten Artefakte, Nachweise, offenen Grenzen und betroffenen technischen Regressionen übergeben. Das Urteil lautet Design-/Bedienungsabnahme; Wirtschaftlichkeit und Echtgeldrechte bleiben getrennte Entscheidungen.

## Erlaubte Pfade
- tests/web/acceptance/**
- docs/ui/acceptance/**
- evidence/S35/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json
- design/approval.json
- assets/design/approved/**
- core/ledger/**
- core/risk/**
- core/execution/**
- adapters/ctrader/**
- adapters/mt5/**
- contracts/trading/**

## Lieferdateien
- evidence/S35/final-design-acceptance.json
- evidence/S35/reference-comparison-index.json
- evidence/S35/motion-evidence-index.json
- evidence/S35/workflow-acceptance.json
- evidence/S35/findings-and-disposition.json
- evidence/S35/release-handoff.md

## Prüfungen
- S35-C01 — Fünf aktuelle Desktopreferenzen sind einzeln am finalen Build geprüft; keine historische Variante ersetzt unbemerkt eine bestätigte Referenz.
- S35-C02 — Alle Pflichtübergänge besitzen bestandene Ein-/Ausblend-, Umkehr- und reduced-motion-Nachweise; keine abrupten normalen Strukturwechsel bleiben unbewertet.
- S35-C03 — Liveupdates bewahren Kontext, Fokus, Auswahl und Datenwahrheit ohne Vollreload; normale, verzögerte, fehlerhafte und wiederverbundene Zustände sind belegt.
- S35-C04 — Die vier Hauptbereiche, der Zahnradzugang und genau eine Setup-Instanz sind nachgewiesen; Forschungsdetails enthalten keine eigenständige Strategie-Katalognavigation.
- S35-C05 — Pflichtbreiten, Tastatur/Touch/Screenreader, Leer-/Fehlerfälle und Leistungsbudgets sind auf den finalen Build gebunden und vollständig bewertet.
- S35-C06 — Kein offener kritischer/hoher Befund im abgenommenen Umfang; Bildmasken und akzeptierte geringe Abweichungen sind nachvollziehbar begründet.
- S35-C07 — Technische Prüfung ist dokumentiert, finale Nachweise stimmen mit Version/Hash überein; weder Desktopbilder noch Designabnahme werden als Gewinn- oder Brokerfreigabe ausgegeben.

## Ausgeschlossen
- Keine eigenmächtige Anpassung der Referenzen, Freigabe oder Abnahmekriterien, um Fehler zu verstecken.
- Keine Produktcodekorrekturen in derselben Abnahmeänderung; sie gehen an S30–S34 zurück.
- Keine wirtschaftliche Überlegenheitsbehauptung oder Echtgeldaktivierung aus Designabnahme.

## Stopbedingungen
- Referenz-/Freigabehash oder geprüfter Build stimmt nicht überein.
- Pflichtnachweis fehlt, ein hoher/kritischer Befund bleibt offen.
- Ein visueller Erfolg wird durch ausgeblendete Fehler-/Datenbereiche oder unechte Werte erreicht.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Die fünf Desktopbilder sind bereits als Ausgangsdesign freigegeben; mobile Ansichten, Verhalten und Laufzeit werden erst anhand der hier geforderten realen Nachweise abgenommen. Kein wirtschaftlicher Erfolg ist Voraussetzung dieser Designkarte.

## Rückfall
Abnahmekandidat nicht freigeben; laufendes S35 mit planctl block anhalten und letzten bestätigten technischen Stand weiterführen. Den konkreten Korrekturauftrag über ein dokumentiertes versioniertes Amendment an der zuständigen Umsetzungskarte ergänzen. Erst planctl relock invalidiert die geänderte Karte und ihre abhängigen Nachfolger auf pending; anschliessend die zuständige Karte regulär starten und betroffene Nachweise erneuern. Bereits bestandene Karten nicht per block/resume oder direkter Statusdateiänderung scheinbar wieder öffnen.


# S26 · Releaseentscheidung anhand des vollständigen Nachweises treffen

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Technische Produktreife und wirtschaftliche Evidenz getrennt entscheiden und genau den geprüften Stand freigeben.

## Abhängigkeiten
S20, S21, S22, S24, S25, S35

## Eingaben
- Vollständiger Nachweisordner mit Source-/Policy-/Daten-/Runhashes.
- Ausstehende Befunde aus allen Schritten und unveränderte Freigabekriterien.
- S35-Abnahmemanifest für die fünf Desktopreferenzen, responsive Ansichten, vollständige Ein-/Ausblendungen, Livezustände, Bedienbarkeit und gemessene Laufzeit; gebunden an den finalen Commit.

## Arbeitsumfang
- Vier Entscheidungen getrennt treffen: Design und Bedienung zur freigegebenen Baseline abgenommen, Forschungssystem technisch nutzbar, native Demokonfiguration technisch abgenommen, wirtschaftliche Verbesserung belegt/ungeklärt/abgelehnt. Die Desktopbildfreigabe allein erfüllt keine Runtime-Abnahme.
- Alle harten technischen Gates, Ausführungsabweichungen, Datenlücken und offenen hohen Risiken vollständig zusammenführen.
- Kandidat gegen vorherigen Champion, passende passive Referenz, Cash und konkurrierende feste Familien bewerten; unterschiedliche Exposition erklären.
- Screenshotwerte der Konkurrenz nur als fremde unbestätigte Zielreferenz zeigen. Mangels Zeitraum/Markt/Kosten keinen fairen Direktvergleich behaupten.
- Release umfasst genau einen reproduzierbaren Commit plus Policy-/Schema-/Datenkompatibilitätsmatrix und Rückfallversion.
- Ein eng begrenztes technisches Labor-Preview kann bereits über S21 separat nachgewiesen werden. Die S26-Gesamtfreigabe verlangt S24/S25 sowie S35; bei wirtschaftlich unzureichendem Kandidaten darf der tatsächlich geprüfte technische/Demo-Umfang freigegeben werden, ohne Echtgeld- oder Gewinnbehauptung.
- Den finalen UI-Build mit dem S25-Paket abgleichen und die tatsächlich betroffenen Integrations-, Installations-, Authentisierungs- und Wiederanlauffälle erneut ausführen. Unveränderte native Nachweise dürfen nur mit begründeter Wirkungsanalyse übernommen werden; ein neuer Commit allein erlaubt keine ungebundene Übernahme alter Berichte.
- Ein späterer Echtgeldpilot ist ein separater konkreter Auftrag mit Konto, maximalem Kapital, Operationen, Verlust-/Risikogrenzen und Abbruchregel; der Plan autorisiert ihn nicht automatisch.

## Erlaubte Pfade
- releases/**
- docs/release/**
- operations/promotion/**
- evidence/S26/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json

## Lieferdateien
- evidence/S26/release-decision.json
- evidence/S26/evidence-index.json
- evidence/S26/performance-scorecard.json
- evidence/S26/known-limitations.md

## Prüfungen
- S26-C01 — Keine offenen kritischen Ledger-/Causality-/Schutz-/Zugriffsbefunde im freigegebenen Umfang.
- S26-C02 — Die Entscheidung gilt für exakte Versionen; nachträgliche Änderung invalidiert betroffene Nachweise.
- S26-C03 — Erfolgs-/Fehlerfälle und Unsicherheit werden vollständig berichtet.
- S26-C04 — Technikfreigabe wird nicht als Garantie für Gewinn oder Marktführerschaft bezeichnet.
- S26-C05 — S35 ist abgeschlossen; Referenzhashes, Motion-/Zustandsprüfungen und finaler ausgelieferter Commit stimmen überein. Negative wirtschaftliche Evidenz wird sichtbar berichtet, ohne die technische/designbezogene Abnahme umzudeuten.

## Ausgeschlossen
- Keine pauschale Behauptung bester Bot der Welt.
- Keine Echtgeldaktivierung durch das Bestehen dieser Karte.

## Stopbedingungen
- Ein hartes Gate ist fehlgeschlagen oder ein für die Behauptung notwendiger Nachweis fehlt.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet.

## Rückfall
Releasekandidat zurückziehen; letzten akzeptierten technischen Stand und bisherigen Champion behalten.


# S27 · Zusatzdaten und lernende Modelle gezielt ergänzen

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
News, Kalender, Mikrostruktur oder lernende Modelle nur für nachgewiesene ungelöste Fragen hinzufügen.

## Abhängigkeiten
S16, S17, S19, S26

## Eingaben
- Ein dokumentierter Befund zeigt, welcher Engpass mit den vorhandenen Daten/Regeln nicht beantwortet werden kann.
- Aktivierungs-ADR mit Datenbedarf, Budget und Abnahmekriterium.

## Arbeitsumfang
- Nachrichten-/Kalenderadapter zuerst nur als zeitgerechten Ereignis-/Handelsverbotsfilter prüfen; Veröffentlichung, Empfang und Revision speichern.
- Orderbuch-/Trade-/Options-/Makrodaten nur übernehmen, wenn das konkrete Pattern diese Information benötigt und Historie sowie Nutzung geklärt sind.
- Einfache trainierbare Klassifikation oder Regimefilter gegen deterministische Referenz vergleichen. Sequenzmodelle erst nach positivem einfachen Zusatznutzen prüfen.
- Trainingsdaten, Featurefit, Modellversion, Kalibrierung, Inferenzzeit und Fallback vollständig in den bisherigen Runvertrag integrieren.
- ML-Modell im Livepfad ausschließlich als eingefrorene freigegebene Version einsetzen; Nachtraining erzeugt einen neuen Kandidaten.
- Komplexität, Rechenzeit und Datenkosten als zusätzliche Nachteile in die Entscheidung aufnehmen.

## Erlaubte Pfade
- research/extensions/**
- data/external/**
- core/models/**
- tests/models/**
- evidence/S27/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json

## Lieferdateien
- evidence/S27/extension-adr.md
- evidence/S27/new-data-contract.json
- evidence/S27/model-comparison.json
- evidence/S27/fallback-tests.json

## Prüfungen
- S27-C01 — Die Zusatzinformation verbessert die vorher definierte Entscheidung in äußerer Prüfung oder wird verworfen.
- S27-C02 — Korrigierte spätere Newswerte werden nicht rückwirkend als damals verfügbar eingesetzt.
- S27-C03 — Modellausfall oder ungeklärter Eingang führt auf den festgelegten sicheren Funktionsumfang zurück.

## Ausgeschlossen
- Nicht Teil des ersten verbindlichen Kernreleases.
- Kein unbeschränktes Online-RL auf Kontogeld.

## Stopbedingungen
- Keine konkrete Frage, kein Datenzugang oder kein messbarer Zusatznutzen gegenüber der einfacheren Referenz.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet.

## Rückfall
Erweiterung deaktivieren und eingefrorene Baseline verwenden.


# S28 · MT5-Ausführung, weitere Konten und Nutzer separat erweitern

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Nach dem ersten stabilen System weitere Plattformen und Personen hinzufügen, ohne deren Konten oder Rechte zu vermischen.

## Abhängigkeiten
S02, S05, S06, S11, S23, S25, S26

## Eingaben
- Konkreter Erweiterungsbedarf und eigener freigegebener Umfang.
- Bewährte Domänenverträge, Kontobuch und Risikoprüfer.

## Arbeitsumfang
- MT5 als eigenen nativen Adapter implementieren; Order-/Deal-/Netting-/Hedging-/Volumenbesonderheiten auf gemeinsame Verträge abbilden.
- Die bereits portierten Strategieideen bleiben im gemeinsamen Entscheidungskern; ein Python-Referenzbot ist keine zweite unkontrollierte Produktionslogik.
- Jedes Konto erhält eigenes Ledger, Risiko, Brokerprofil, Secrets, Daten-/Policyrechte und Ressourcenbudget.
- Mehrnutzer-Authentifizierung, Mandantentrennung und Objektzugriffsprüfung für UI/API/MCP/Dateiexporte durchziehen.
- Einladungs-/Widerrufs-/Gerätewechsel-/Offboardingwege mit tatsächlichen Berechtigungsnachweisen prüfen.
- Schreibenden Fernzugriff erst nach eigenem Threat-/Commandreview und konkretem Konto-/Operationsumfang aktivierbar machen.

## Erlaubte Pfade
- adapters/mt5/**
- apps/hub/tenancy/**
- apps/web/identity/**
- tests/tenancy/**
- evidence/S28/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json

## Lieferdateien
- evidence/S28/mt5-adapter-parity.json
- evidence/S28/tenant-isolation.json
- evidence/S28/access-matrix.json
- evidence/S28/extension-release.md

## Prüfungen
- S28-C01 — Ein Nutzer/Token kann weder fremde Kontoobjekte lesen noch deren Vorschläge anwenden.
- S28-C02 — MT5-Teilfills und Hedging/Netting führen auf dieselbe wirtschaftliche Buchlogik.
- S28-C03 — Ein Konto- oder Plattformfehler beeinflusst keine andere Kontoberechtigung oder Risikoreservierung.

## Ausgeschlossen
- Nicht im ersten Kernrelease.
- Keine automatische Echtgeldverwaltung fremder Konten.

## Stopbedingungen
- Kontotrennung, Native-Adapter-Parität oder reale Berechtigungsgrenzen nicht nachgewiesen.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet.

## Rückfall
Neue Plattform/Mandantengruppe sperren; bestehendes Einzelnutzersystem weiter betreiben.


# S29 · Kontrollierte Weiterentwicklung dauerhaft betreiben

Kanonischer Plan: 1.2.0 · Statusquelle: `control/state.json`

Keine verpflichtende unabhängige Reviewer-Abnahme. Technische Nachweise bleiben erforderlich.

## Ziel
Aus realen Fehlern, Datenänderungen und neuen Beobachtungen lernen, ohne den geprüften Champion heimlich zu verändern.

## Abhängigkeiten
S26

## Eingaben
- Akzeptiertes technisches Release, Ergebnisregister, Drift-/Betriebsmetriken und Forschungsbudget.

## Arbeitsumfang
- Laufend Datenfrische, Feedlücken, Exposition, Schutzbestätigung, Ledgerabgleich und Ressourcen beobachten.
- In festen Forschungszyklen Kostenabweichung, Performance nach Marktphase, Verteilungsänderung und Kalibrierung prüfen; Driftalarm startet Diagnose, nicht sofortigen Strategiewechsel.
- Neue Hypothesen als neue Arbeitsaufträge mit einem begrenzten Suchbudget anlegen. Bestehende historische Holdouts bleiben als verbraucht markiert.
- Champion und Kandidat parallel vergleichbar beobachten; nur der gleiche fachliche Nachweisweg aus S16–S26 erlaubt eine Promotion. Änderungen an sichtbarer Struktur, Zuständen, Motion oder UI-Verträgen öffnen zusätzlich die tatsächlich betroffenen Gates S30–S35; reine Strategieänderungen ohne UI-Auswirkung erzwingen keine sachfremde Neugestaltung.
- Daten-/Code-/Schema-/Brokeränderungen automatisch den betroffenen Tests und Schritten zuordnen. Abhängige Nachweise werden bei relevanter Änderung erneut geöffnet. Designreferenzen und UX-/Motionverträge sind versionierte Prüfgrundlagen; eine neue Designentscheidung benötigt eine begründete, geprüfte Änderung statt stiller Abweichung.
- Wöchentlichen nachvollziehbaren Bericht mit Änderungen, Kosten, Gewinnen/Verlusten, No-trade-Fällen, Blockern und nächsten zugelassenen Versuchen erzeugen.
- Monatlich Archiv/Restore/Source- und Lizenzstatus überprüfen; Ausbau nur bei erkennbarer Daten-/Rechen-/Produktgrenze planen.

## Erlaubte Pfade
- operations/monitoring/**
- operations/research-cycles/**
- docs/status/**
- tests/drift/**
- evidence/S29/**

## Gesperrte Pfade
- secrets/**
- production-data/**
- **/.env
- **/.env.*
- **/*credentials*
- plan.json
- control/plan.lock.json

## Lieferdateien
- evidence/S29/maintenance-policy.json
- evidence/S29/research-cycle-template.json
- evidence/S29/drift-response.md
- evidence/S29/continuation-state.json

## Prüfungen
- S29-C01 — Kein laufender Champion verändert sich ohne neue Version, vollständige Gates und gebundene Entscheidung.
- S29-C02 — Automatisierung besitzt bestätigte Laufzeit, Budget, nächste Ausführung und Fehlermeldung; ein Plantext wird nicht als laufender Dienst ausgegeben.
- S29-C03 — Ein neuer Datenstand kann historische Aussagen ergänzen, aber alte Berichte nicht unsichtbar überschreiben.
- S29-C04 — Jeder Forschungszyklus endet mit Ergebnis, Ablehnung oder Blocker; kein unbegrenztes Suchen auf derselben Prüfmenge.

## Ausgeschlossen
- Kein Versprechen dauerhafter Hintergrundarbeit aus einem Chat ohne eingerichteten Worker.
- Keine Gewinn- oder Konkurrenzgarantie.

## Stopbedingungen
- Voraussetzungen, Budget oder ein hartes Technikgate sind nicht mehr erfüllt.

## Übergabe
Nachweise an Plan, tatsächliche Gitrevision und Dateihashes binden; alle Kartenprüfungen ausführen. Derselbe Bearbeiter darf mit planctl verify/finish abschließen. Keine unabhängige Reviewer-Abnahme. Folgeschritt über next auswählen; Veröffentlichung und Brokerzugriffe bleiben separat gesperrt.

Alle Prüfungen und Lieferartefakte dieser Karte sind erforderlich. Teilweise fehlende native Evidenz ist nur erlaubt, wo die Karte dies ausdrücklich als späteres Gate bezeichnet.

## Rückfall
Forschungsqueue pausieren und neue Exposition gemäß freigegebener Policy begrenzen; Ursachen zuerst klären.
