# Evidenz- und Ergebnislabels

Diese Labels werden als getrennte Felder gespeichert. Sie sind keine aufaddierbaren Qualitätsstufen und kein Prozentwert für die Qualität des Bots. Ein Inhalt kann technisch reproduziert sein, wirtschaftlich negativ abschneiden und operativ noch ungeprüft sein.

## 1. Herkunft und Belegart

| Code | Bedeutung | Zulässige Formulierung | Nicht daraus ableiten |
|---|---|---|---|
| `DEFINITION` | Begriff oder festgelegter Vertrag | „Definiert wie …“ | Marktvorhersage |
| `LITERATURE_FINDING` | Ergebnis einer konkret benannten externen Untersuchung | „Quelle berichtet unter diesen Bedingungen …“ | Eigener heutiger Handelsvorteil |
| `OWN_HYPOTHESIS` | Widerlegbare eigene Annahme | „Wir untersuchen, ob …“ | Geschätzte Wahrscheinlichkeit ohne Versuch |
| `SYNTHETIC_FIXTURE` | Absichtlich konstruierter Rechen-/Softwarefall | „Dieser Fall prüft …“ | Historische Marktperformance |
| `HISTORICAL_DESCRIPTIVE` | Beschreibung historischer Daten | „In diesem Datensatz beobachtet …“ | Kausalität oder ausführbare Rendite |
| `HISTORICAL_POLICY_TEST` | Vollständige Policy unter historischem Modellvertrag | „Unter dem dokumentierten Vertrag …“ | Garantierte reale oder künftige Rendite |
| `PROSPECTIVE_SHADOW` | Später tatsächlich eingegangene Daten, archivierte Entscheidungen ohne echte Ausführung | „Prospektiv beobachtet …“ | Reale Fillqualität |
| `BROKER_DEMO_OBSERVED` | Tatsächlich beobachtete Demo-Order-/Kontozustände | „Im Demo-System beobachtet …“ | Gleiche Liquidität und Ausführung im Livekonto |
| `BROKER_LIVE_OBSERVED` | Tatsächlich abgeglichene Live-Fills und Kontobewegungen | „In diesem Konto/Zeitraum realisiert bzw. bewertet …“ | Universelle oder dauerhafte Überlegenheit |
| `EXTERNAL_UNVERIFIED_REFERENCE` | Screenshot oder fremde Angabe ohne rekonstruierbaren Vertrag | „Ungeprüfte externe Referenz …“ | Fairer Benchmark oder Weltbestnachweis |

## 2. Technischer Implementierungsstand

`DOCUMENTED_ONLY`, `DRAFT_SPEC`, `IMPLEMENTED_UNVERIFIED`, `TECHNICALLY_REPRODUCED`, `INDEPENDENTLY_CHECKED`.

Jeder Status nennt Gegenstand, Version, Datum und Beleg. Ein bestehender Bericht mit 31 oder 529 Prüfungen ist ein Bericht über seinen damaligen Gegenstand; er wird nicht als neue Prüfung der aktuellen Website übernommen. Ein Diagramm-Reproduktionsskript ist kein vollständiger Handelsautomat.

## 3. Datensatz- und Teststatus

| Feld | Zulässige Werte / Regel |
|---|---|
| `data_reality` | `synthetic`, `historical_research_returns`, `historical_quotes`, `prospective_quotes`, `broker_execution_events` |
| `publication_vintage` | Konkrete Version oder `unknown`; heutige revidierte Daten nicht als damaliger Veröffentlichungsstand ausgeben |
| `human_seen` | `true`, `false`, `unknown`; unbekannt ist nicht ungesehen |
| `used_for_selection` | Konkrete Versuch-IDs oder ausdrücklich leere Liste |
| `evaluation_role` | `training`, `inner_validation`, `outer_walk_forward`, `locked_holdout`, `reproduction`, `descriptive_only` |
| `holdout_state` | `not_available`, `sealed`, `opened_once`, `consumed`, `invalidated` |
| `execution_fidelity` | Exakter Modellvertrag, kein pauschales „realistisch“ |

**Bekannter Altbestand:** LAB04 2020–2025 ist veröffentlicht und damit bekannt. Wiederholungen tragen `evaluation_role=reproduction`, `human_seen=true` und `holdout_state=consumed`. Eine neue Datendatei oder ein neuer Dateiname setzt diesen Status nicht zurück. Eine algorithmische Trennung kann weiterhin beschrieben werden, jedoch nicht als menschliche Unkenntnis.

## 4. Ergebnisstatus

| Code | Wann verwenden? | Konsequenz |
|---|---|---|
| `NOT_RUN` | Kein vollständiger Lauf vorhanden | Keine Leistungskennzahlen erfinden |
| `RUNNING` | Job tatsächlich gestartet und bestätigt | Fortschritt aus tatsächlichen Ereignissen |
| `ABORTED` | Lauf abgebrochen | Im Versuchszähler erhalten; kein vollständiges Ergebnis |
| `INVALID` | Kritischer Daten-, Zeit-, Ledger- oder Protokollfehler | Betroffene Leistungsbehauptung gesperrt |
| `INCONCLUSIVE` | Wesentliche Evidenz/Präzision fehlt | Kein Sieger; gezielte nächste Datenerhebung oder Prüfung |
| `REJECTED_FOR_THIS_PROTOCOL` | Gültig, aber vorher fixierte Gates verfehlt | Fassung bleibt dokumentiert, keine Promotion |
| `ADVANCE_TO_PROSPECTIVE_SHADOW` | Alle vorgeschriebenen historischen Gates bestanden | Nur nächste Beobachtungsstufe zulässig |

`NO_TRADE` ist zusätzlich ein legitimer **Fallstatus**, kein automatisch ungültiger Run. Er kann durch Mindestvolumen, fehlendes Signal, Kosten, Spread, Portfolioreservierung oder Risikolimit entstehen. Grund, Zeit, verpasste Gelegenheit und Auswirkungen bleiben auswertbar. No-Trade-Fälle werden nicht still aus Medians oder Erfolgsquoten entfernt; bedingte Auswertungen werden getrennt benannt.

## 5. Zahlen richtig benennen

- Winrate: Nenner und Nettodefinition angeben; null abgeschlossene Trades → nicht definiert, nicht 0 % oder 100 %.
- Profit Factor: Brutto-/Nettobasis definieren; null Verlustsumme → mathematisch Sonderfall, kein automatischer Sieger.
- Drawdown: Equity oder Balance, Messfrequenz und markierte offene Bestände nennen.
- Kapitalziel: Nettovermögen, realisiertes Guthaben oder liquidierter Modellwert exakt unterscheiden; nicht erreicht → zensiert.
- Ruinrisiko: Definition, Szenarioverteilung, Abhängigkeit und Unsicherheit nennen; null beobachtete Fälle → kein Nullrisikonachweis.
- Stichprobengröße: Trades, Kontopfade, Instrumente und unabhängige Zeitinformation getrennt nennen.
- Vergleich: zusätzliche Rendite bei zusätzlicher Exposition nicht unbesehen als Alpha bezeichnen.
- Kosten: Preiseffekte und separat gebuchte Gebühren konsistent zerlegen, nicht zweimal abziehen.

## 6. Fachliche Quellen

Arbeitsbuch MP01, MP03, MP08–12; Atlas BF14, BP14, BR01; Trading Master RES01–08, SQC06/SQC08 und DOC08–10; `capability_matrix.json`, `implementation_register.json`, `master_1_0/implementation_map.json`. Alle dortigen Quellenbezüge benötigen beim Import die konkreten Dateihashes aus dem Quelleninventar.
