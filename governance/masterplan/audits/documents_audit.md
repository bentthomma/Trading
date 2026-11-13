# ExtremeLab: Audit der PDFs und Arbeitsmaterialien für den Masterplan

Stand dieser Analyse: 11. November 2026. Gegenstand: bereitgestellte Dateien, nicht neu ausgeführte Tradingforschung. Keine Produktdateien verändert, keine mitgelieferten Programme gestartet, keine Handelsverbindung eingerichtet.

## 1. Wichtigster Befund

Die Sammlung enthält bereits einen erstaunlich konkreten methodischen Unterbau für Datenverträge, zeitlich korrekte Merkmale, Ausführung, gemeinsame Kapitalrechnung, Forschungsregister und stufenweise Abnahme. Diese Teile sollten als Ausgangsmaterial in das neue System übernommen werden. Der Bestand ist aber überwiegend ein Lehr- und Forschungswerk. Die 124 Lehrblätter sind keine 124 fertigen Bots, die 405 Szenarien keine 405 bewiesenen Handelsregeln, und die 43 Datentypen keine 43 angeschlossenen Datenfeeds.

Der beste unmittelbare Nutzen ist deshalb: aus den vorhandenen Verträgen und Gegenbeispielen die verbindlichen Schnittstellen und Abnahmetests des künftigen Systems gewinnen; aus den Wissenskapiteln eine versionierte Hypothesenbibliothek gewinnen; aus vier vorhandenen Offline-Laboren ausgewählte Referenzrechnungen übernehmen. Die Dokumentation liefert keine Grundlage für eine Behauptung, unser System sei der Konkurrenz bereits überlegen.

## 2. Prüfverfahren und ehrlicher Umfang

### Was in dieser Analyse tatsächlich gemacht wurde

- Alle fünf gelieferten PDFs geöffnet, Seitenanzahl ermittelt, SHA-256 berechnet und sämtliche 2.738 Seiten sowohl mit pypdf als auch mit Poppler textuell erfasst. Keine Seite hat eine vollständig leere Textextraktion. Das bestätigt Erfassbarkeit, nicht automatisch inhaltliche Richtigkeit.
- Beide Arbeitsmaterial-ZIPs auf absolute Pfade, `..`, Symlinks und Gesamtgröße geprüft und in getrennte Verzeichnisse entpackt. Kein enthaltener Launcher und kein Reproduktionsskript wurde ausgeführt.
- Den strukturierten Gesamtbestand, Domainstruktur, Kapitelindex, 124 Lehrblätter, Implementierungsregister, Capability-Matrix, bekannte Grenzen, Laborverträge, neue Fachvorlagen und Forschungsbericht untersucht.
- Die zentralen Abschnitte zu Informationszeit, MPR1, Positionsgröße/Gapverlust, gemeinsamer Kasse, Versuchstrennung, Mehrzeitebenen, Musterdefinition, Regimefiltern, ML-Grenzen, Forschungsregister und Betriebszuständen vertieft gelesen; den 19-seitigen Release-Blueprint vollständig textuell gelesen.
- Code der Referenz- und Forschungs-Labore in den einschlägigen Kernfunktionen gelesen und die vier Kernhashes selbst nachgerechnet. Das ist keine vollständige Codeprüfung aller mitgelieferten Programme.
- Acht konkrete PDF-Seiten visuell geprüft: Arbeitsbuch S. 16, 24, 28, 36; Atlas Master S. 188, 282; Blueprint S. 7, 16. Diagramme stimmen in diesen Beispielen mit den untersuchten Regeln überein und kennzeichnen synthetische Fälle.
- Versionsvergleich auf Dateiebene zwischen v8 und Master durchgeführt.

### Nicht behaupten

Es gab keine Wort-für-Wort-Begutachtung aller 2.738 PDF-Seiten, keine erneute unabhängige Prüfung sämtlicher 616 Quellenangaben, keine visuelle Prüfung jeder Seite und keine neue historische Profitabilitätsstudie. Viele Seiten sind bewusst dieselben Inhalte in mehreren Lesebänden. Vor produktiver Übernahme eines einzelnen Algorithmus bleibt dessen enger fachlicher und technischer Review ein eigener Planpunkt.

## 3. Quellen und genaue Fundstellen

Alle Pfade sind relativ zu `/workspace/scratch/c1ca1f076d80`.

| ID | Datei | Umfang / Rolle |
|---|---|---|
| DOC-P1 | `upload/Trading_Master_1_0.pdf` | 1.691 Seiten, Gesamtband; SHA `4186b9a2baa61d5cedb415c00d5b5ef3302deafb0c96ff277c8eed2d1731f81c` |
| DOC-P2 | `upload/Marktverhalten_Atlas_Master_1_0.pdf` | 563 Seiten; Marktverhaltens-Ausschnitt des Gesamtbands; SHA `e7c1f789c66886f187df48fa875b3946513ae75f65695d854dbc76e56d59a06f` |
| DOC-P3 | `upload/Trading_Start_und_Arbeitsbuch_1_0.pdf` | 55 Seiten; zwölf praktische Kapitel als eigener Leseband; SHA `160c847357f0c5f883b820d85c79d5d18f815c182489459548b6b562fd25d167` |
| DOC-P4 | `upload/Marktverhalten_Atlas_v8.pdf` | 410 Seiten; Vorgänger, keine unabhängige zusätzliche Strategievalidierung; SHA `2dd68beb41ffcd15504dd680179032e6423c18f66263a69c8fa2fef4f16f6a75` |
| DOC-P5 | `upload/Benedikt_Full_Release_Blueprint.pdf` | 19 Seiten; anderer Workspace, Produkt-/Workflow-Donor, nicht ExtremeLab-Implementierung; SHA `3a851a394401ce2e8b758362dfffb39ccef18ab40d4439ded75294e40fd88ab3` |
| DOC-A1 | `analysis/documents/Trading_Master_1_0_Arbeitsmaterialien/` | Entpackter Master-Bestand; 1.284 Dateien |
| DOC-A2 | `analysis/documents/Trading_Handbuch_Arbeitsmaterialien_v8/Trading_Handbuch_Arbeitsmaterialien_v8/` | Entpackter v8-Bestand; 1.136 Dateien |

Zusätzlich erzeugte Analysehilfen: `analysis/documents/inventory.json`, `extraction_coverage.json`, `version_comparison.json`, `chapter_index.json`, `card_index.json`, `lab_code_inventory.json`. Für jedes PDF liegen `<Dateistamm>.json` als `{page,text}`-Liste, `.txt` mit Seitentrennern und `.poppler.txt` mit Layouttext vor. Diese sind interne Analysehilfen und keine neuen Originale.

## 4. Versionsbereinigung: was nicht doppelt importiert werden sollte

Der Master ist die geeignete kanonische Wissensfassung. Sein README sagt ausdrücklich, dass Gesamtband, Atlas und Arbeitsbuch sich inhaltlich überschneiden. Die damalige v8-Ausgabe enthält 209 Kapitel, 105 Marktverhaltenskapitel und 315 Szenarien. Master enthält 251 Kapitel, 135 Marktverhaltenskapitel und 405 Szenarien. Die Differenz setzt sich aus 30 weiteren Verhaltenskapiteln und zwölf praktischen Arbeitskapiteln zusammen. Die Zahl der Lehrblätter bleibt 124 und die Zahl der ausführbaren Labore bleibt vier.

Der eigene Dateivergleich ergibt beim Master-Bestand: 1.107 Dateien sind byteidentisch zu v8; 24 bestehende Pfade sind verändert; 153 Pfade kommen neu hinzu. Neu hinzugekommene Fachmodule sind `behavior_transmission_content.json`, `behavior_physical_content.json`, `behavior_credit_content.json` und `master_practice_content.json`. Die vier Laborkerne sind in beiden Beständen identisch.

**Planfolge:** Master als kanonische Wissensquelle registrieren, v8 als historische Version mit Alias-/Änderungsbeziehungen erhalten. Denselben Inhalt aus Gesamtband, Atlas, Arbeitsbuch, Markdown und JSON nicht fünfmal in einen Suchindex oder Trainingskorpus laden. Sonst entstehen Scheinbestätigung, doppelte Treffer und unnötige Kosten. PDF-Seiten bleiben als lesbare Fundstellen erhalten; strukturierte JSON-Objekte sind für maschinenlesbare Integration geeigneter.

Belege: DOC-A1 `README.md` Abschnitte 2–3; `handbook_data.json.metadata`; DOC-A2 gleicher Metadatensatz; eigene `version_comparison.json`.

## 5. Tatsächlicher Bestand und seine Grenzen

| Bestand | Tatsächlich geliefert | Sinnvolle Nutzung | Verbotene Umdeutung |
|---|---|---|---|
| 825 Begriffe / 33 Katalogbereiche | Definitionen, Querverweise, Quellen | Suche, Begriffsklärung, Methodenregister | 825 unabhängige Strategien |
| 251 Kapitel / 124 Lehrblätter | Fachtexte, Lehrspezifikationen, Pseudocode | Spezifikationsgrundlagen, Gegenbeispiele | vollständiger Broker-Code |
| 405 bedingte Szenarien | Beobachtung, Bedingungen, Mechanismus, Alternative, Invalidierung, Datenbedarf | Hypothesenregister / Pattern-Spezifikation | kalibrierte Eintritts- oder Gewinnwahrscheinlichkeiten |
| 285 Grafiken | Überwiegend synthetische oder mathematische Erklärfälle | Erklärungen, Test-Fixtures nach Prüfung | historische Marktperformance |
| 43 Datentypen | 394 spezifische und 19 gemeinsame Felder | Ausgangspunkt für Datenschemas | angeschlossene oder lizenzierte Feeds |
| Sechs historische Monatsdatensätze | 336 gemeinsame Monate 1998–2025, 9.744 numerische Werte | Makro-/Faktor-Kontext, begrenzte Forschung | 2.016 unabhängige Monate; einzelne Aktienticks |
| Vier Offline-Labore | Konkrete Python-Kerne samt Resultaten | Referenzrechnungen, eng begrenzte Wiederverwendung | universeller Live-Simulator |
| START_HIER / Navigator / Journal | Lokales Lesen, Suchen, Notieren, JSON-Austausch | Workflow- und Wissens-UI-Donor | Cloud-Sync, automatischer Teststart oder Brokersteuerung |

Belege: DOC-A1 `capability_matrix.json`, `implementation_register.json`, `master_1_0/implementation_map.json`, `materials/data/research_collection/collection_index.json`. Die Labor- und Datenangaben wurden am gelieferten Bestand überprüft, nicht erneut ausgeführt.

## 6. Priorisierte Übernahme der vorhandenen Bausteine

### Priorität 0: Verträge und nachvollziehbare Arbeit

**Acht Fachvorlagen bereits vorhanden:**

1. `master_1_0/templates/01_instrumentvertrag.json`
2. `02_datenvertrag.json`
3. `03_forschungsvorhaben.json`
4. `04_strategievertrag.json`
5. `05_ausfuehrungsvertrag.json`
6. `06_risikovertrag.json`
7. `07_versuchsjournal.json`
8. `08_freigabepruefung.json`

Jede enthält eigenes `record_schema`, leere `record`-Felder, Feldhilfe, getrennte Lehrbeispiele und Abnahmehinweise. Der Umschlag lautet `trading-master-template/1.0`. Die Vorlagen sind **keine** Konfiguration der vier Laborkerne und werden vom Starter nicht importiert. Ihre Schemas erlauben bewusst `null`, weil es Arbeitsakten sind. Der spätere Systemplan muss deshalb zusätzlich zwischen `draft` und `ready_to_run` unterscheiden und für Letzteres eine strenge fachliche Vollständigkeitsprüfung liefern. Ein formal gültiges leeres JSON darf keinen Simulationsjob und keine Order freigeben.

**Wiederverwendbar:** Feldbedeutungen, Quellenverweise, revisionsbezogene Identität und die Trennung von Beispielwert und Projektdaten. **Neu erforderlich:** Adapter ins kanonische Runtime-Modell, maschinelle Einheiten-/Zeit-/Abhängigkeitsprüfungen, Freigabesignaturen, tenantbezogene Autorisierung und ausgefüllte kleine Referenzfälle.

**Gate:** Ein leerer Vertrag bleibt Entwurf; ein Lehrbeispiel wird niemals als reales Symbol importiert; unbekannter Multiplikator, Zeitbezug oder Triggerpreis führt zu benanntem Blocker. Erst vollständige, zueinander passende Versionen ergeben einen ausführbaren Snapshot.

Belege: DOC-A1 `master_1_0/templates/index.json`, `template_envelope.schema.json`, alle acht Vorlagen; `CODEX_UEBERGABE.md` Abschnitte 2 und 4; DOC-P3 MP02 S. 9–12, MP03 S. 13–16, MP11 S. 44–46.

### Priorität 0: Ereignisse, Ledger, Risiko und schwierige Gegenfälle

Aus MP05–07 und DOC06 ergeben sich unmittelbar gute Abnahme-Fixtures:

- Absicht, Anfrage, Order, Fill, Position und Buchung sind getrennte Objekte.
- Ein Timeout ist unklarer Brokerstatus, keine Ablehnung; Wiederholung mit neuer ID kann doppelt ausführen.
- Stornoanforderung hebt mögliche weitere Fills noch nicht auf.
- Doppelte Fill-ID darf nicht ein zweites Mal buchen; echte Korrektur braucht eigene ID mit Referenz.
- Gewünschte Menge und ausgeführte Menge bleiben getrennt.
- Cash, Bestandswert, Gebühren und Equity werden nach jedem Ereignis versöhnt.
- Stopbudget begrenzt den normalen Modellpfad, keine beliebige Kurslücke.
- Eine unter Mindestvolumen gerundete Order ergibt null, nicht automatisch die nächsthöhere Menge.
- Mehrere Module brauchen gemeinsame Reservierungen, Nettierung und eine vorab festgelegte Priorität.

Konkreter vorhandener MPR1-Testfall: 10.000 CHF Startkasse, 0,25 % **synthetisches Lehrbudget**, Einstieg 100,25, Stop 99,60, normaler Stopfill 99,58, 0,005 CHF Gebühr pro Stück/Seite. Zulässig 36 Stück, normaler Nettoverlust 24,48 CHF, Zielgewinn 46,08 CHF, Gapfill 99,08 ergibt 42,48 CHF Verlust. Diese Werte eignen sich als Fixture unter genau diesem Vertrag; das Lehrbudget ist kein vorgeschlagenes Live-Risikolimit.

**Gate:** unabhängige Rechnung trifft jeden Kontoschritt; keine doppelte Spread-/Slippage-Buchung; Gapverlust wird nicht auf Stopbudget gekappt; keine erfundenen Fills bei fehlendem Quote; Wiederanlauf darf erst nach festgelegtem Brokerabgleich neues Risiko eröffnen.

Belege: DOC-P3 MP05 S. 21–24, MP06 S. 25–28, MP07 S. 29–32; DOC-P1 DOC06 S. 792–793; DOC-A1 `expansion/master_practice_content.json`, `expansion/dataops_content.json`.

### Priorität 1: Wissens- und Hypothesenregister

Geeignete Donoren: `catalog_Master_1_0.json`, `knowledge_graph_Master_1_0.json`, `knowledge_coverage_Master_1_0.json`, `behavior/scenario_registry.json`, `implementation_register.json` und `handbook_data.json`.

Jede Hypothese sollte Quellenobjekt/Seite, Behauptungsart, beobachtbares Merkmal, mögliche Mechanik, Alternativerklärung, Widerlegung, benötigte Daten, Informationszeit, prognostizierten Horizont, gültigen Instrumentvertrag und bisherigen Evidenzstatus erhalten. Bestehende Szenariofelder sind dafür nützlich, brauchen aber einen Adapter und festgelegte Enum-Werte. Ein Literaturbefund, eine eigene Erklärung, synthetische Demonstration, historische Messung und produktive Freigabe dürfen nicht denselben Status bekommen.

**Gate:** Von einem Suchtreffer führt ein prüfbarer Weg zur konkreten Quelle; mehrere Lesebände desselben Kapitels zählen als ein Inhalt. Eine unbelegte Aussage erhält keine erfundene Confidence. Ein Forschungsjob darf erst aus einer vollständigen formalen Hypothese entstehen, nicht allein aus einem gefundenen Absatz.

### Priorität 1: Forschungsverfahren und Ergebnisarchiv

LAB04 bietet einen konkreten Donor für `protocol`, Kandidatenfamilie, chronologische Auswahl, eingefrorene Endauswahl, Quellen- und Codehash, neue Ergebnisordner und unveränderte Kostenstresstests. `materials/research_lab.py` enthält insbesondere:

- `select_candidate`, Zeile 402;
- `calculate_development`, Zeile 434;
- `new_output`, Zeile 479;
- `seal_archive`, Zeile 483;
- `verify_archive`, Zeile 492;
- `run_develop`, Zeile 518;
- `run_holdout`, Zeile 575.

`run_holdout` kontrolliert die eingefrorenen Code-/Protokoll-/Datenhashes und den exakten Entwicklungspräfix; es setzt jedes Konto mit seinem eigenen Endstand fort. Es setzt keine frisch gewählten Parameter je Kostenfall ein. Diese Mechanik ist brauchbar. Sie ist kein manipulationssicherer externer Zeitstempel und kann die Kenntnis öffentlich bekannter Geschichte nicht beseitigen.

**Gate:** sämtliche Varianten, Abbrüche und negative Ergebnisse werden registriert; Datenfenster/Labels vor dem Lauf fixiert; zukünftige Daten ändern frühere Entscheidungen nicht; bereits betrachtete Testdaten bleiben als betrachtet markiert. Bekannte alte Resultate werden als Reproduktion bezeichnet. Methoden wie PBO oder Deflated Sharpe werden erst ausgewiesen, wenn tatsächlich implementiert und zum Versuch passend gerechnet.

Belege: DOC-P1 RES01–08 S. 486–517, SYS01–03 S. 596–605, VALC01–06 S. 608–627, SQC08 S. 733–734; DOC-P3 MP08 S. 33–36; DOC-A1 `materials/research_lab.py`, `materials/data/lab04/lab04_protocol.json`, `research_record_template.json`.

### Priorität 2: vorhandene Simulationskerne als Referenzen

| Labor | Bereits vorhandene Mechanik | Begrenzung / Integrationsentscheidung |
|---|---|---|
| LAB01 `reference_engine.py` | Long-Donchian, ATR-Stop, nächster Open, Gappriorität, Cash/Risiko-Mengenlimit, bidseitige Bewertung | Ein synthetisches vollständig finanziertes Instrument; keine Shorts, reale Kalender, Finanzierung oder Brokerparität. Gute kleine Referenz für Ledger-/Ausführungsfixtures. |
| LAB02 `multistrategy_lab.py` | Donchian, EMA-Cross, Breakout-Retest, Long/Short, getrennte Konten, Zustand `retest_step` | Kein gemeinsames Portfolio; kontinuierlicher künstlicher UTC-Stundenraster; kein vollständiges Futures-/CFD-Konto. Regeln separat importieren und gegen neuen Vertrag testen. |
| LAB03 `portfolio_lab.py` | Zwei fixe Module 60/40, gemeinsame Kasse, Target-Nettierung, Verkäufe vor Käufen, Mengen-/Kostenlimits | Sechs fiktive Aktien; keine echten Corporate Actions/Settlement/FX/Shorts; In-Process-Deduplikation ist kein Recovery. Gute Portfolio-Referenz, kein Livekern. |
| LAB04 `research_lab.py` | Sechs Long/Cash-Varianten, chronologische Auswahl, Kostenstress, Archivlock | Monatsrenditen eines aggregierten Forschungsportfolios, keine ausführbaren Quotes; nicht für Minutenhandel übernehmen. Forschungsorchestrierung wiederverwenden, Preis-/Fillmodell getrennt halten. |

Die vier Kontomodelle nicht durch einen gemeinsamen Funktionsnamen vermischen. Ein `account_model_id`, `execution_model_id` und `data_contract_id` muss Unterschiede sichtbar halten. Erst ein expliziter, geprüfter Adapter kann Resultate in dieselbe Berichtssicht überführen.

Kernhashes wurden eigenständig bestätigt:

- LAB01 `83c71ef06f7a809e6a6651fc20c263a73b9a877a819cf10359be44539978d562`
- LAB02 `de02a63777e6df59d5687702f42840ad2f82e0da5f85d70751dcef876298cc82`
- LAB03 `bbb614d142b12802c096d4bee59f8a8dde5478e68d841bea6a354c30561f482c`
- LAB04 `771855c932669c80bcb11c2fccc1022bb8efd12aada9ab086ff6405cceeebd0b`

## 7. Mehrere Zeitintervalle: bereits gut begründet, noch als Featurevertrag umzusetzen

Die Sammlung spricht die zentrale Nutzerforderung ausdrücklich an. BF06, BF09, BP14 und BR10 erklären, dass derselbe Markt kurzfristig rückläufig und längerfristig steigend sein kann. Ein Fünfminutenchart, eine Stunden- und eine Tageskerze sind überlappende Ansichten, keine drei unabhängigen Beweise. BP14 verlangt eine Hierarchie: welche Ebene beschreibt Kontext, welche liefert Setup, welche erlaubt Ausführung?

Vorgeschlagener enger Startvertrag: ein vorher gewähltes Ausführungsintervall, dazu genau eine mittlere und eine höhere Kontextzeitebene. Beispielsweise M5/H1/D1 kann ein Forschungsprofil sein; M15/H4/D1 ein anderes. Keine laufende nachträgliche Auswahl der gerade passendsten Ebene. Diese Paare sind Planvorschläge, keine aus den PDFs validierten profitablen Konfigurationen.

Ein Merkmal benötigt mindestens `instrument_id`, `timeframe`, `bar_start`, `bar_end`, `event_time`, `available_at`, `received_at`, `is_final`, Daten-/Transformationsversion, Wert und Qualitätsstatus. Endgültige höhere Bars werden erst nach tatsächlicher Verfügbarkeit verwendet. Laufende höhere Bars sind ein anderes, explizites Feature und dürfen nicht nachträglich in frühere kleine Bars zurückgeschrieben werden. Sessionkalender, Sommerzeit, Wochenenden und Datenlatenz gehören zum Adapter.

**Gate-Fixtures:**

1. Bei Entscheidung 10:05 ist der Schluss einer um 12:00 endenden H4-Bar nicht verfügbar.
2. Ein Pivot am Zeitpunkt t mit zwei rechten Bestätigungsbars wird erst nach deren verfügbarer Bestätigung signalisiert; Extremzeit und Erkennungszeit bleiben getrennt.
3. Angehängte oder veränderte spätere Bars verändern keine frühere Feature-/Signalhistorie.
4. Training und Live-Replay liefern mit identischen Ereignissen dieselben Merkmale.
5. Fehlende höhere Bar erzeugt einen benannten Zustand, keinen stillen Nullwert und keine futuristische Füllung.
6. Der tatsächliche Zusatznutzen jeder Ebene wird mit Ablation gegen die einfachere Regel gemessen; alle Varianten bleiben im Register.

Belege: DOC-P2 BF06 S. 32–34, BF09 S. 42–45, BF14 S. 59–62, BP14 S. 188–191, BR01 S. 278–281, BR10 S. 311–316; entsprechende Masterseiten 942, 952, 1098, 1188, 1221. DOC-P3 MP03 S. 13–16. Hier sind teils Diagramm und Folgekapitel auf derselben Seite; maßgeblich bleiben Kapitel-ID und tatsächliche PDF-Seite.

## 8. Mustererkennung: ja, aber als überprüfbare Merkmalsfamilie

Die 14 BP-Kapitel liefern eine brauchbare Ontologie: Trend/Pullback, Mean-Reversion, Support/Resistance/Retest, Ausbruch, Fehlausbruch, Kompression/Expansion, Gaps, Kerzen, klassische Geometrien, Momentum/Divergenz, Nachrichtenreaktion, Squeeze/Liquidation, Volumenprofil/VWAP und Zeitebenen/Regime. KBC02–06 ergänzen Chartschulen, Fibonacci, SMC/ICT und Charttransformationen. Der Text unterscheidet ausdrücklich beobachtbare Form und behauptete Absicht der Marktteilnehmer.

**Erste Umsetzung:** deterministische Detektoren mit festgelegten Parametern und Lebenszyklus `candidate → confirmed → expired/invalidated`. Zum Start drei wenig überlappende Familien, etwa Trend-Pullback, Breakout-Retest und Range-Abweichung. Ein höheres Hoch mit kleinerem Momentum ist ein Merkmal, keine automatische Umkehr oder Shortorder. Geometrische Kursziele werden nicht als geschätzte Erwartungswerte dargestellt.

**Spätere ML-Umsetzung:** tabellarische Baselines und kalibrierte Vorhersagen können ergänzt werden, sobald Labels, Datenmengen und Vergleichsregeln stehen. SQC06 enthält eine kleine kausale Sequenz-Lehrrechnung, aber keine neue RL-Policy und keinen trainierten universellen Transformer. ML-Klassen nicht allein wegen ihrer Namen übernehmen.

Ein PatternRecord braucht zusätzlich zum Featurevertrag: Detektor-ID/Version, Anker, Toleranzen, Erkennungszeit, Status, Invalidierungsbedingung, Zielhorizont, Datenbedarf und Referenz auf die Ausgangshypothese. Ein Confidence-Wert wird nur angezeigt, wenn seine Bedeutung definiert und empirisch kalibriert ist. Drei hoch korrelierte Detektoren werden nicht zu 90 % Gewissheit addiert.

**Gate:** identische Eingaben liefern identische Muster; keine subjektive Nachzeichnung; keine nachträglich bestätigten Wendepunkte in frühere Signale; unvollständige und gescheiterte Kandidaten bleiben zählbar; Zusatznutzen gegenüber einfachen Trend-/Volatilitätsmerkmalen nach Kosten und ohne neue Auswahl auf dem Testset.

Belege: DOC-P2 BP09 S. 171–174, BP10 S. 174–177, BP14 S. 188–191; DOC-P1 KBC02–06 S. 635–640, SQC01 S. 722, SQC02 S. 723–724, SQC06 S. 729–731. Volltext in `expansion/behavior_patterns_content.json`, `expansion/systematic_content.json`.

## 9. Strategiewechsel: eine eigene zu prüfende Regel

BF14, BR01, SQC02 und DOC09 liefern die richtige Grundlage: Regimeschätzung verwendet vorwärts gefilterte Informationen; nachträgliche Glättung liefert andere Aussagen. Der Detektor speichert Alarmzeit und vermuteten Wechselbeginn getrennt. Schwellen, Mindestverweildauer, Hysterese, Unsicherheit und Rückfall müssen zum eingefrorenen Verfahren gehören.

Ein schnellerer Wechsel ist nicht automatisch besser. Niedrige Schwellen können früher reagieren und häufiger falsch wechseln. Das verursacht Kosten und kann gerade in unklaren Zuständen schaden. Eine sinnvolle Untersuchung vergleicht feste Baseline, feste Modulkombination und kausalen Wähler bei identischem Daten-/Kapital-/Kostenvertrag. Ein Driftalarm erzeugt zuerst eine Diagnose und gegebenenfalls einen neuen Kandidaten, nicht automatisch einen besseren Champion.

**Gate:** Wähler wird im Walk-forward als Gesamtverfahren getestet; Zustandswahrscheinlichkeit wird nicht als Gewinnwahrscheinlichkeit angezeigt; Datendefekt und Marktänderung werden getrennt; Refit nutzt nur reife Labels; Champion bleibt aktiv oder fällt in einen spezifizierten Zustand zurück, solange kein neuer Kandidat die vorab definierte Prüfung bestanden hat.

## 10. Forschungsresultat des gelieferten LAB04

Der bereits veröffentlichte Bericht ist ein Negativbeispiel gegen eine automatische Überlegenheitsbehauptung. Im durchgehenden Modellpfad 2010–2025 werden aus 100.000 GE beim Auswahlverfahren 391.075,88 GE, bei gehaltenem Marktportfolio 819.252,39 GE und bei Geldmarktreferenz 123.462,14 GE. Geometrische Jahresraten im Bericht: 8,90 %, 14,05 % und 1,33 %. Größter Monatsend-Rückgang: Auswahl −21,15 %, Markt −24,84 %.

Das ist ein rückblickender Vergleich mit US-Forschungsrenditen in USD und pauschalen Kosten, keine CHF-/Brokerkonto-Rechnung. Im Endabschnitt 2020–2025 wurde MOM06 festgehalten; das frühere Verfahren wählte unter MOM03/06/12 und SMA03/06/12. Eingaben umfassen 336 Monate ab 1998, mit Vorlauf. Unterschiedliche Expositionen begrenzen die Interpretation als Alpha. Intramonth-Drawdowns sind nicht messbar. Der Schlussabschnitt ist inzwischen bekannt; wiederholtes Ausführen ist Reproduktion.

**Planfolge:** Bericht als Referenzdatensatz und Beleg sauberer negativer Ergebnisse erhalten. Nicht als aktuelle ExtremeLab-Performance und nicht als Konkurrenzvergleich ausgeben. Aus dieser Untersuchung folgt weder, dass alle Momentumansätze schlecht sind, noch dass die Gegenrichtung automatisch gewinnt.

Quelle: DOC-A1 `LAB04_Ergebnisbericht.md`; gespeicherte Berichte unter `materials/data/lab04/`; DOC-P1 VALC01–06. Hier keine neue Ausführung oder unabhängige Neuberechnung aller historischen Zahlen vorgenommen.

## 11. Blueprint übernehmen, ohne das Website-Design zu ersetzen

DOC-P5 betrifft `Benedikt Workspace` V1.2.10, eine Konstellationskarte mit Rollen, nicht den aktuellen ExtremeLab-Auftritt. Die dort genannten 529 Prüfungen und Screens sind dokumentierter Ausgangsstand bzw. Konzepte dieser anderen Anwendung, keine Belege für die Website des Nutzers.

**Direkt nützliche Prinzipien:**

- Auftrag mit `taskId`, `projectId`, `baseVersion`, `scope`, `inputs`, `allowedFiles`, `dependencies`, `expectedArtifact`, `acceptanceCriteria`, `reviewerRoleId`, Status, Zeitstempeln und Evidence-Refs (S. 7).
- Ergebnisversion und Freigabe explizit verknüpfen; Freigabe ohne konkrete Version vermeiden (S. 8–9).
- Aufgabenstatus und Artefaktstatus getrennt modellieren (S. 9).
- „Gesendet“, „zugestellt“, „in Arbeit“, „geprüft“ und „freigegeben“ haben verschiedene Nachweise (S. 2, 6–9).
- Entwürfe automatisch erhalten, Zustands-/Fehler-/Offline-/Konfliktmatrizen für jeden Ablauf, keine fingierten Ergebnisanzeigen (S. 13–15).
- Kleine Meilensteine, Messbasis vor Optimierung, eigenständige Design-/UI-/Funktionsfreigaben und echte End-to-End-Nachweise (S. 16–18).
- Eine normal zugängliche Listen-/Suchdarstellung zusätzlich zu Spezialvisualisierungen, reduzierte Bewegung und klarer Fokus (S. 14).

**Nicht ungefragt übernehmen:** Sternkarte, 81 Knoten, 178 Verbindungen, 44 Filamente, vorgeschlagene Lavendel-Tokens, feste Drei-Menü-Navigation, dortige Rollenanzahl. Der aktuelle ExtremeLab-Entwurf hat Vorrang. Im Masterplan erst die tatsächliche Website erfassen, Farben/Typografie/Abstände/Navigation als Baseline festhalten und neue Arbeitsbereiche darauf aufbauen.

## 12. Konkrete Reihenfolge aus dieser Dokumentprüfung

Diese Reihenfolge ist eine Empfehlung zur Einbettung in den Gesamtmasterplan; keine bereits ausgeführte Produktänderung.

1. **Kanonische Quellen festlegen.** Master/v8-Duplikate zuordnen, Quellen-IDs und Hashes, Implementierung vs Spezifikation kennzeichnen. Ende: nachvollziehbarer Donorkatalog.
2. **Verträge konsolidieren.** Acht Vorlagen, Runtime-Ereignisse, Instrument-/Konto-/Kostenmodelle und strenge Ready-Prüfung definieren. Ende: ein vollständig ausgefülltes kleines Profil plus zurückgewiesene Gegenfälle.
3. **Datenzeit und Instrumente sichern.** Ereignis-/Verfügbarkeitszeit, Vintages, Kalender, historische Universen, Corporate Actions, Währungen. Ende: Präfix-/Revisions-/Einheiten-Fixtures bestehen.
4. **Ledger und Ausführung aufbauen.** Deterministische kleine Rechnungen, Gaps, Mengen, Kosten, Teilfills, Deduplikation, offene Bestände. Ende: unabhängige Geld-/Bestandsidentitäten, keine stillen Modellwechsel.
5. **Gemeinsames Portfolio und Risiko.** Reservierungen, Priorität, Nettierung, Faktor-/Sektor-/Währungsbündel, Stressverluste. Ende: gleichzeitige Signale können Kapital nicht doppelt verbrauchen.
6. **Wissen strukturiert verfügbar machen.** Katalog/Graph/Szenarien mit Quellenbezug in Website; keine automatische Orderschaltung. Ende: Suchtreffer, Dokumentfundstelle und Evidenzstatus stimmen.
7. **Mehrzeitebenen und Pattern-Baselines.** Festes kleines Profil, causale Featureberechnung, bestätigte Muster, kein Repainting. Ende: Replay-Parität und Ablationsvergleich.
8. **Begrenzte Strategiefamilien importieren.** Die tatsächlich vorhandenen Regeln nach ihrem eigenen Vertrag portieren; Variantenbudget vorab. Ende: gleiche Referenzfälle und eindeutige Unterschiede dokumentiert.
9. **Chronologische Forschung durchführen.** Kandidat/Wähler als Verfahren, Kostenstress, alle Versuche, zeitliche Abhängigkeit, unberührter neuer Schlussabschnitt soweit möglich. Ende: technische und wirtschaftliche Entscheidung getrennt belegt.
10. **Erst dann adaptive Auswahl und ML ausbauen.** Keine automatische Champion-Promotion nach Driftalarm. Ende: zusätzliche Komplexität liefert unter vorab bestimmtem Vergleich messbaren Nutzen oder wird verworfen.
11. **Demo-Adapter und Betrieb separat prüfen.** Broker-Einheiten, Schutzbestätigung, Stornorennen, Netzwerkverlust, Restart/Reconcile, reale Symbolmetadaten. Ende: Demo-E2E und Recoverybelege; keine Ableitung aus Offline-Pass.
12. **Fortlaufende Pflege statt immer weiterer Begriffe.** Datenfrische, Quellenänderungen, Modell-/Feature-Drift, Incident- und Rückfallpfade, Wissensrevision. Ende: eine begründete nächste Aufgabe pro Befund.

## 13. Arbeitsvorlage pro Plan-Schritt

Der Masterplan sollte jede Aufgabe mit denselben prüfbaren Feldern ausliefern:

`step_id`, Ziel, Begründung, Voraussetzungen/abgenommene Versionen, Originalquellen, wiederverwendete Module, erlaubte Dateien, ausgeschlossene Erweiterungen, Eingabe-/Ausgabeverträge, kleine feste Fixtures, konkrete Arbeitsschritte, Abnahmekriterien, auszuführende Befehle, Evidence-Dateien, Reviewer, Blocker, Rollback, erlaubte nächste Schritte.

Der Workflow startet keinen Folgeschritt, solange eine erforderliche Vorversion nicht abgenommen ist. Eine Änderung am Instrument-/Daten-/Kostenvertrag invalidiert die davon abhängigen Resultate. Ein nachträglicher Planwechsel braucht eine neue Revision mit Begründung und Auswirkungen. Ein Markdown-Häkchen oder ein selbst gemeldetes „grün“ ersetzt keine Prüfung der referenzierten Dateien, Hashes und tatsächlichen Ergebnisse.

Daraus folgt keine unüberwindbare technische Sicherheitsgarantie: Eine wirksame Durchsetzung benötigt später echte Berechtigungen, geschützte Branches, CI-Gates und eingeschränkte Ausführungsrollen. Der Plan sollte deren Einrichtung als konkreten Schritt enthalten und nicht behaupten, allein durch eine `AGENTS.md` könne niemand weiterbauen.

## 14. Besonders wichtige eigene Querprüfung durch Root

- DOC-P3 S. 21–28: MPR1-Zustandsvertrag und numerischer Normal-/Gapfall.
- DOC-P3 S. 33–36: präzise Labelgrenze statt pauschalem Zeitabstand.
- DOC-P2 S. 188–191: explizite Hierarchie der Zeitebenen und höhere unbestätigte Bars.
- DOC-P2 S. 278–282: Alarmzeit, Wechselzeit, Hysterese und unzulässige rückblickende Glättung.
- DOC-P1 S. 729–731: Sequenzmodell vs Handelsziel und Offline-RL-Unterstützungsproblem.
- DOC-P1 S. 792–799: Orderobjekte, Stornorennen, Featurestore, Drift und cTrader-Grenzen.
- DOC-P5 S. 7–9 und 16–18: Arbeitsauftrag/Artefaktversion und stufenweise Freigabe.
- DOC-A1 `master_1_0/templates/`, `CODEX_UEBERGABE.md`, `implementation_map.json`, `LAB04_Ergebnisbericht.md`.

Das Material enthält bereits konkrete Vorkehrungen gegen viele der vom Nutzer befürchteten Rücksprünge. Der nächste Masterplan sollte sie in tatsächliche Systemverträge und nachweisbare Arbeitsschritte übersetzen und dabei den vorhandenen Website-Auftritt als eigenes, frisch zu prüfendes Produkt behandeln.
