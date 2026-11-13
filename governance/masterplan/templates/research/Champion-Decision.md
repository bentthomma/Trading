# Entscheidung über einen Champion-Kandidaten

**Vorlagenstatus: DRAFT. Keine automatische Promotion.**

Diese Entscheidung bezieht sich auf unveränderliche Strategie-, Daten-, Kosten- und Codeversionen. Technische Korrektheit, wirtschaftliche Evidenz und betriebliche Eignung werden getrennt entschieden.

## 1. Gegenstand

| Feld | Wert |
|---|---|
| Entscheidungs-ID / UTC-Zeit | … |
| Planschritt / Projekt / Experiment-ID | … |
| Kandidaten-ID und SHA-256 | … |
| Bisheriger Champion / SHA-256 oder `none` | … |
| Protokoll-ID / Freeze-Hash / Freeze-Zeit | … |
| Alle berücksichtigten Versuche / gemeinsamer Versuchszähler | … |
| Eingabe-, Transformations- und Ergebnismanifest | … |
| Unabhängiger Prüfer | … |
| Beantragte nächste Stufe | … |

## 2. Zulässigkeit vor Kennzahlen

Jede Zeile benötigt einen Belegpfad, einen ausgeführten Prüfbefehl oder ein konkret reproduziertes Gegenbeispiel.

| Frage | Pass / Fail / Unklar | Beleg |
|---|---|---|
| Waren Protokoll, Suchbudget, Auswahlregel und Hauptmetriken vor der Auswertung fixiert? | … | … |
| Sind alle Versuche einschließlich negativer, abgebrochener und ungültiger vorhanden? | … | … |
| Stimmen Daten-/Code-/Konfigurationshashes mit dem Run überein? | … | … |
| Stimmen Ledger und unabhängige Cash-/Bestands-/Gebührenidentitäten? | … | … |
| Bestehen Präfixtest, Feature-Fit-Cutoff und Prüfung reifer Labels? | … | … |
| Sind No-Trade, offene Positionen, Margin und Nichtausführungen enthalten? | … | … |
| Wurde gemeinsame Kasse tatsächlich simuliert, ohne virtuelle Kapitalsummen? | … | … |
| Sind Schlussabschnitt und bereits gesehenes Wissen ehrlich gekennzeichnet? | … | … |

Ein kritisches `Fail` ergibt `INVALID` für die betroffene Leistungsbehauptung. Wesentlich fehlende Daten oder zu geringe Testabdeckung ergeben `INCONCLUSIVE`; unbekannt zählt nicht als bestanden.

## 3. Vergleich auf mehreren Zielen

| Dimension | Kandidat | Champion / feste Referenz | Gepaarter Unterschied / Unsicherheit | Gate |
|---|---:|---:|---|---|
| Nettorendite nach vollständigen Kosten | … | … | … | … |
| Wachstum und Kapitalbindung | … | … | … | … |
| Zeit bis 2×/10×/30×, Nichterreichen zensiert | … | … | … | … |
| Maximaler Drawdown und Dauer der Erholung | … | … | … | … |
| Tail-Verluste, Gapverluste, Insolvenz-/Liquidationsfälle | … | … | … | … |
| Exposition / Leverage / Faktor- und Sektorkonzentration | … | … | … | … |
| Turnover / Spread / Slippage / Finanzierung | … | … | … | … |
| No-Trade / Ablehnungen / Fillquote | … | … | … | … |
| Kapazität im tatsächlichen Instrumentvertrag | … | … | … | … |
| Stabilität über äußere Folds, Märkte und Regime | … | … | … | … |

Zusätzlich Cash-Referenz und vorab definierte Referenz mit vergleichbarer Exposition zeigen. Ein höherer Gewinn durch höhere Exposition ist nicht automatisch zusätzliche Signalqualität. Ein hoher Profit Factor, eine hohe Trefferquote oder viele Simulationstrades genügen nicht zur Promotion.

**Equal-entry-Diagnose:** isoliert Exitmechanik bei gleichen Eingaben und Anfangspositionen. Sie kann Unterschiede erklären, beweist aber keine Gesamtportfolioverbesserung.

**Policyvergleich:** führt die vollständigen Regeln einschließlich geänderter Haltedauer, Folgeeintritte, Reservierungen, gemeinsamer Kasse und Kosten aus. Nur dieser Vergleich kann die behauptete vollständige Policyverbesserung beurteilen.

## 4. Unsicherheit und Gegenprüfungen

- Gepaarte Zeit-/Portfolioergebnisse auf denselben Daten verwenden.
- Blockbootstrap übernimmt zusammengehörige Zeitblöcke aller betroffenen Instrumente; gleichzeitige Trades sind keine unabhängigen Münzwürfe.
- Blocklänge und Clusterregel stammen aus Trainingsdiagnose und sind vor Schlussauswertung fixiert.
- Äußere Walk-forward-Ergebnisse und gesperrter Schlussabschnitt bleiben unterscheidbar.
- Preis-/Kostenstress mit gleicher Policy und separater Kennung; kein stiller erneuter Parametergewinner pro Stressfall.
- Entfernen eines Moduls ist eine neue registrierte Ablation, kein nachträgliches Löschen eines Verlustjahrs.
- Null beobachtete Insolvenzfälle bedeuten nicht null künftiges Insolvenzrisiko. Nenner, Abhängigkeit, Szenariomodell und Intervall angeben.

## 5. Entscheidung

Genau einen Ergebnisstatus wählen:

- `INVALID`: konkrete technische oder zeitliche Verletzung; betroffene Resultate nicht zur Auswahl verwenden.
- `INCONCLUSIVE`: Daten, unabhängige Zeitblöcke, Kostenbelege oder Präzision fehlen. Champion unverändert; eine gezielte Folgeaufgabe benennen.
- `REJECTED_FOR_THIS_PROTOCOL`: gültiger Versuch verfehlt vorab fixierte wirtschaftliche oder Risikogates. Keine Aussage über sämtliche verwandten Strategien.
- `ADVANCE_TO_PROSPECTIVE_SHADOW`: sämtliche vorgeschriebenen historischen Gates bestanden; erlaubt nur die vorab benannte nächste Beobachtungsstufe.
- `KEEP_CHAMPION`: Kandidat ersetzt die vorhandene Fassung nicht.

**Beschluss:** …

**Begründung anhand der Gates:** …

**Nicht belegte Aussagen:** …

**Genau eine Folgeaufgabe / zuständiger Planschritt:** …

Ein späterer Demo- oder Livewechsel benötigt die dazugehörigen Betriebs-, Risiko- und Berechtigungsnachweise. Diese Forschungsentscheidung ersetzt sie nicht. Der Konkurrenz-Screenshot wird höchstens als externe ungeprüfte Zahlenreferenz genannt; unbekannte Testbedingungen schließen einen belegten Überlegenheitsvergleich aus.

## 6. Änderungs- und Rückfallnachweis

Promotionen beziehen sich auf genaue Hashes. Jede Änderung an Modell, Feature, Kosten, Instrumentvertrag oder Datenpipeline invalidiert die vorherige Freigabe für diese neue Kombination. Vor einer möglichen Aktivierung müssen Rückfallversion, Trigger, offene Positionsbehandlung und Recoveryweg konkret vorliegen. Alte Entscheidungen bleiben unverändert lesbar.

**Quellen:** Trading Master RES01–08, SYS01–03, VALC01–06; Arbeitsbuch MP08–12; Blueprint S. 7–9 und 16–18. Die konkreten Quellhashes stehen im Quelleninventar.
