# Unabhängige Architektur- und Ablaufprüfung des neuen Masterplans

**Prüfstand:** 11. November2026; `analysis/build_masterplan.py`, KartenS00–S12. Die Datei wird parallel weiterbearbeitet. Dieser Bericht bewertet den gelesenen Zwischenstand und ist keine Freigabe einer späteren Gesamtversion. Keine Produktdateien und keine Karten wurden geändert.

## Gesamteinschätzung

Die Richtung ist tragfähig: aktuelle Website erhalten, LocalHub gezielt weiterverwenden, reinen C#-Domänenkern mit Replay-/Liveadaptern teilen, Python für Orchestrierung und Analyse nutzen. Die Trennung zwischen unveränderlicher Historie, Vorschlag, bestätigter Runtime, Brokerbestand und Forschung ist sichtbar. Die Karten enthalten sinnvoll konkrete Outputs, Gegenfälle, Abbruchbedingungen und Rückfallwege.

Die folgenden Befunde sollten vor der Planfreigabe behoben werden. Die größten Risiken liegen im **Abhängigkeitsgraphen**, **nicht auf echte Repositorypfade abgebildeten Scopes** und in einer **zu starken Exactly-once-Formulierung**. Es handelt sich überwiegend um gezielte Planreparaturen, nicht um eine neue Architektur.

## H01 — Quellenlücken blockieren entgegen der eigenen Aussage sämtliche Folgearbeit

**Priorität: hoch. Fundstelle:** S01 (Checks und Stopconditions), S02 `dependencies=[1]`, daraufS03/S04/S07/S09.

S01 erklärt, dass fehlende0.8-/1.9-Quellen nur abhängige Ports blockieren und Design-/Datenanalyse weitergehen können. Gleichzeitig verlangtS01 einen reproduzierten Build und vollständige Quellen; eine unzuordenbare Quellenbehauptung ist Stopcondition. Alle fachlichen Folgepfade hängen überS02 von vollständig abgeschlossenemS01 ab. Der maschinenlesbare Graph kann die prose-seitig erlaubte unabhängige Arbeit daher nicht freigeben.

**Konkreter Fix:** S01 als verbindlich abgeschlossenes **Inventar-/Baselineentscheidgate** definieren: jeder Eintrag endet mit `complete`, `missing`, `prefix_only`, `rejected` oder `historical_claim`; fehlende Quellen sind ein gültiger Inventarabschluss. Zusätzlich explizite Fähigkeiten/Gates `website_source_complete`, `engine19_source_complete`, `platform_baseline_selected` führen. Nur die tatsächlichen Ports/Builds verlangen die jeweilige vollständige Quelle. S02/S07 dürfen auf dem geprüften Inventar aufbauen. S03 darf vorhandene Browserbaseline dokumentieren, die Implementierung verlangt später vollständige Webquelle. Keine fehlende1.9-Quelle durch Umbenennung des vorhandenenC17 ersetzen.

## H02 — Native Kontoverbindung blockiert das gesamte Offline-Labor; Hostabnahme kommt danach

**Priorität: hoch. Fundstelle:** S04, S05 `deps=[2,4]`, S06 `deps=[5]`, S08 `deps=[1,4,6,7]`, S10 `deps=[5,6,7,9]`.

S04 verlangt `native-read-evidence.json`, wirklichen Brokerabruf und eine lesende native Verbindung. S05/S06 und somitS10 benötigenS04. Der Zielhost wird jedoch erst inS08 abgenommen, das wiederumS04 undS06 benötigt. Es besteht kein syntaktischer DAG-Zyklus, aber ein **fachlicher Ablaufwiderspruch**: native Integration vor der formalen Hostabnahme. Zudem verhindert ein fehlender Kontozugang auch vollkommen autonome Ledger-/Simulatorarbeit.

**Konkreter Fix:** S04 in zwei ausdrücklich getrennte Ergebnisse aufteilen: `offline_log_audited` mit den vorhandenen Logs und `native_read_verified` mit realem Zielhost. Ein nicht verfügbarer Zielzugang ist `blocked_target`, kein Fehler des Offlineaudits. S05 benötigtS02 plus eingefrorene Broker-/synthetische Referenzfixtures, nicht den realen Kontolauf. S06 kann ebenfalls offline arbeiten. Host-/Buildnachweis vor `native_read_verified` einordnen; vollständiger nativer Status ist später Voraussetzung für Demo-/Liveübertragung, nicht für Offlineforschung. Das Register muss diese getrennten Zustände verstehen; eine Fußnote allein reicht nicht.

## H03 — Pfadscopes passen nicht zur vorhandenen Codebasis und können legitime Änderungen verhindern

**Priorität: hoch. Fundstelle:** S03 `apps/web/design/**`; S04 `apps/hub/ingest/**`; S06 `apps/hub/storage/**`; S08 `apps/hub/supervisor/**`; ergänzend neue `core/...`-Extraktionspfade.

Der geprüfte LocalHub verwendet `core/store.mjs`, `core/control.mjs`, `core/application.mjs`, `core/restore.mjs`, `server.mjs`, `sdk/`, `public/` und `integrations/ctrader-extremelab17/`. Das aktuelle Vercelprojekt verwendet `lib/`, `api/`, `view20-public/` und gepackte Buildassets. Die Karte verwendet dagegen teilweise neue Monorepopfade, ohne vorab eine genehmigte Migration/Pathmap festzulegen. Ein strikt prüfender Planwächter würde nötige Änderungen an den vorhandenen Dateien blockieren oder indirekt einen nicht verlangten Neuaufbau belohnen.

**Konkreter Fix:** InS01/S02 `repository-path-map.json` mit logischem Bereich→tatsächlichem Repository/Pfad/Owner erzeugen. Die Scopes anschließend über einen versionierten und unabhängig geprüften Planänderungsweg konkretisieren. Alternativ schon jetzt bestehende relevante Pfade ausdrücklich erlauben. Neuer C#-Domainordner ist zulässig, sobald der Extraktions-ADR festlegt, was umzieht und wie unverändertes Verhalten belegt wird. Es darf kein impliziter Framework-/Ordnerrewrite erfolgen. S06 braucht z.B. tatsächlicheStore-/Schema-/Restorepfade; S04 den konkretenServer-/Vertrags-/Empfangsweg.

## H04 — Exactly-once-Aussage über den Broker ist zu stark; unklarer Sendebereich fehlt explizit

**Priorität: hoch. Fundstelle:** S05 Aufgabe4, S06 Aufgabe1/2 und Check1.

S06 fordert nach Abbruch an jedem relevanten Commit „genau einen wirtschaftlichen Auftrag“. Vor dem ersten Send darf korrekterweise null entstehen; nach einem mehrdeutigen Send kann ohne eindeutige Brokerbelege das Ergebnis unbekannt bleiben. S05 erlaubt nach Reconciliation „eindeutig fehlende“ Absichten erneut zu senden, ohne zu definieren, welcher Beleg tatsächliches Nichtannehmen nachweist. Ein leerer Snapshot oder eine unvollständige Historie genügt dafür nicht.

**Konkreter Fix:** Dauerhafte Markierung `DISPATCH_MAY_HAVE_STARTED` vor dem externen Send verlangen. Den Gegenfall auf „höchstens eine erneut veranlasste wirtschaftliche Verpflichtung; bestätigte Deals genau einmal verbuchen; unbekannter externer Send bleibt unknown und budgetiert“ ändern. VorSend-Abbruch=0, belegterFill=1, unklarerSend=keinBlindRetry. Erneutes Senden nur bei einer unterstützten brokerseitigen idempotenten ClientID oder belastbarem terminalem Nichtannahmenachweis; der konkrete Adapter dokumentiert diesen Beweis. Fehlende Historie ist keine Nichtannahme. Dieser Vertrag ist im alten Ausführungshandbuch3.6 bereits richtig beschrieben und sollte unverändert übernommen werden.

## H05 — Bootstrap des Planwächters muss mit seiner eigenen Sperre vereinbar sein

**Priorität: mittel. Fundstelle:** allgemeine `forbidden_paths`, S00 Aufgaben2–4 und `allowed_paths`.

S00 soll Planwächter und kanonischen Plan im noch unbekannten Zielprojekt verankern. Zugleich verbietet die allgemeine Karte `plan.json` und `control/plan.lock.json`; erlaubt sind u.a.`tools/acceptance/**`, nicht generell `control/**`. Ohne präzise Bootstrapphase kann entweder der erste notwendige Import nicht erfolgen oder die Sperre wird später pauschal umgangen. Branchschutz verlangt außerdem eine tatsächliche Repositoryverwaltung, obwohl das Zielrepository erst inS01 gesichert wird.

**Konkreter Fix:** Einmaligen `bootstrap` vor dem ersten Planlock definieren: ausschließlich bereitgestellte gehashte Steuerdateien in isoliertes Ziel kopieren, keine Produktänderung; danach Lock und normaleScoperegeln aktivieren. Alternativ S00 nur lokales Governancepaket abnehmen und den echten CI-/Branchschutzabschluss als separaten Gate vor dem ersten produktiven Merge einordnen. `prepared_locally` darf nicht als eingerichteterBranchschutz gelten. Implementierer darf seinen eigenen unabhängigenReview nicht freigeben.

## H06 — Universelle positive-Preis-Regel schließt zulässige Instrumentdomänen aus

**Priorität: mittel. Fundstelle:** S07 Aufgabe3; S10 Aufgabe5.

S07 verlangt global positivePreise, währendS10 unter passenden Daten auch Futuresrollen unterstützt. Ein universeller `price>0`-Validator ist für ein Allround-Instrumentmodell zu pauschal. Das alte Ausführungshandbuch3.4 nennt ausdrücklich instrumentabhängige Preisdomänen.

**Konkreter Fix:** `InstrumentContractVersion.priceDomain` definieren. PositivePreise nur für die aktuell unterstützte und ausdrücklich so definierte Domäne verlangen; andereDomänen sperren oder mit eigenen Referenzfällen unterstützen. Ask≥Bid, endlicheWerte, Raster undOHLC-Geometrie bleiben getrennte Prüfungen. Keine Datenkorrektur allein deshalb, weil ein Wert dem universellenPositivfilter widerspricht.

## H07 — „Nicht quantifizierbares Worst-Case-Risiko“ ist als universelles Zulässigkeitsgate zu unbestimmt

**Priorität: mittel. Fundstelle:** S11 Check4.

Der Wortlaut kann bedeuten, dass eine mathematisch harte Verlustobergrenze bekannt sein muss. Für Shortpositionen, Gaps und nicht garantierte Stops existiert im einfachen Modell keine endliche absolute Worst-Case-Garantie. Derselbe Schritt erklärt richtigerweise, dass Stopbudget keine garantierte Obergrenze ist. Der Test braucht eine operationalisierbare Semantik.

**Konkreter Fix:** Trennen zwischen `planned_stop_risk`, `declared_stress_loss`, `notional/margin_budget` und gegebenenfalls `unbounded_tail_flag`. Fehlende Kontrakt-/Kosten-/Expositionsdaten oder fehlende deklarierteStressrechnung sperren neueExposition. Ein explizit modelliertes Gaprisiko wird nicht zu einer garantiertenWorstCase-Zahl umetikettiert. Zulässigkeit nach vorab fixierterPolicy, keine nachträgliche Risikoausweitung.

## H08 — MT5 wird im Zielhosteingang vorgezogen, obwohl der aktive Adapter optional später folgt

**Priorität: mittel. Fundstelle:** S08 Eingang „Tatsächlicher cTrader-/MT5-Build und Zielhost“; vorgesehenerS28.

Wenn der erste aktive Pfad cTrader ist undMT5 erstS28 folgt, darf ein ungeprüfterMT5-Host nichtS08 blockieren. Die MT5-Strategieideen können zuvor offline als registrierteFamilien geprüft werden.

**Konkreter Fix:** S08 Pflichtmatrix nur für ausgewählten erstenExecutor. MT5 als optionales Matrixfeld `not_in_scope` führen, später eigenenAdapter-/Netting-/Hedging-/Ordersemantiknachweis inS28. Kein früherUniversaladapter nur zur Erfüllung eines unscharfen Eingangs.

## H09 — Allgemeiner Zahlenvertrag sollte die bereits erarbeiteten konkreten Regeln ausdrücklich übernehmen

**Priorität: mittel. Fundstelle:** S02 Aufgabe4 undChecks.

S02 verlangt Typisierung und verlustfreie Darstellung, benennt im Kartentext aber die vorhandenen präzisen Entscheidungen nicht: BrokerIDsalsStrings; Dezimalstrings mitWährung/Einheit; Integergrenzen; Rundungsmodus; UTC vs monotoneLease; null+quality statt0. Diese Regeln sind wesentlich, weil C#,Python undJavaScript dieselbeDomäne austauschen sollen.

**Konkreter Fix:** Ausführungshandbuch3.3 undaktuellenRemoteView20-Präfix explizit als Vertragsdonor aufnehmen. Eine GoldenVector-Datei mit großenBrokerIDs, Dezimalrundung, Prozent/Fraction, Lots/Units, negativesGeld, null, NaN/Infinity undZeitgrenzen anlegen. Die Karte kann kurz bleiben, wenn `domain-contract.json` diese konkreten Pflichtfelder/Tests enthält. Das ist kein zusätzlicherLegacyvertrag, sondern die kanonischeZusammenführung.

## Positive Feststellungen, die beibehalten werden sollten

- S09 behandelt höhere Zeitrahmen über `available_at` und Präfixtests; genau das verhindert rückwirkend perfekte H1-/Pivotinformationen im früherenM5-Signal.
- S10 trennt Tickreplay, OHLC-Modell und synthetischenStress und beschreibt Python ausdrücklich nicht als dritte unabhängigeSignallogik.
- S12 trennt TP-Entfernung, Zielverschiebung undStopintelligenz. Das adressiert direkt den bekanntenConfound frühererExitvergleiche.
- S04 trennt offeneP&L, realisierteErgebnisse undSaldoänderung; Killed bleibt beobachtetesEreignis, keine erfundeneUrsache.
- S07 behandelt Lizenz-/Produktions-/Weitergabekontext undDatenauflösungsgrenzen proDatenprodukt.
- Die neueID-FamilieS00–S29 kann die ausführbareQuelle sein, währendAP01–AP26 als expliziterCrosswalk undTestreferenz erhalten bleiben. Das verhindert zwei parallel konkurrierendePläne.

## Noch für den Gesamtplan zu prüfen

Nach vollständiger Generierung `plan.json` erneut prüfen: Abhängigkeitsgraph, native-vs-offlineGates, Zustandsgranularität, Scopeauflösung, Pfadschutz, Reviewertrennung, ÄnderungenanAkzeptanzschwellen/Holdout, optionaleS27/S28, Daten-/Kostenbudgets proJob undharterÜbergang vonResearchzuDemo. Die noch nicht gelesenen S13–S29 sind hier ausdrücklich nicht freigegeben.
