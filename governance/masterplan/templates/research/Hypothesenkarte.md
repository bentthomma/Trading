# Hypothesenkarte

**Vorlagenstatus: ENTWURF. Kein Forschungsstart und keine Handelsfreigabe.**

Diese Karte wird für genau eine prüfbare Behauptung ausgefüllt. Ein neuer Parameter, Filter, Horizont oder Datenausschluss erzeugt eine registrierte Revision oder Variante. Leere Pflichtfelder, `null`, `TODO` oder unbelegte Annahmen sperren den Übergang zu `READY`. Synthetische Lehrwerte sind als solche zu kennzeichnen.

## 1. Identität und Auftrag

| Feld | Auszufüllen |
|---|---|
| Hypothesen-ID / Revision | `HYP-… / …` |
| Zugehöriger Planschritt / Projekt | … |
| Autor / unabhängiger Prüfer | … |
| Status | `DRAFT` |
| Entscheidung, die untersucht wird | … |
| Instrument-/Daten-/Strategie-/Ausführungsvertrag mit Versions-ID | … |
| Vorherige verwandte Versuche, auch negative | … |
| Quellenobjekte mit Kapitel/Seite und Datei-SHA-256 | … |

**Quellenbeispiel:** Arbeitsbuch Master 1.0, MP03 S. 13–16 (Informationszeit), MP04 S. 17–20 (Hypothese und Gegenfall), MP05–06 S. 21–28 (MPR1), MP08 S. 33–36 (Auswahl). Atlas Master BP09 S. 171–174, BP14 S. 188–191, BR01 S. 278–281. Der Masterplan enthält die Originalhashes im Quelleninventar.

## 2. Beobachtung, Erklärung und Widerlegung

**Beobachtung, die aus den Eingaben direkt nachgerechnet werden kann:**

> Beispiel: Nach einem vorab definierten Ausbruch berührt eine der nächsten drei abgeschlossenen M5-Bars eine eingefrorene Zone. Der Erkennungszeitpunkt liegt nach Verfügbarkeit dieser Bar.

**Hypothese über den zusätzlichen Nutzen:**

> Beispiel: Die Retestbedingung verändert gegenüber allen sonst zulässigen Ausbrüchen die nach Ausführung und Kosten verbleibende Ergebnisverteilung. Ob der Unterschied positiv ist, ist offen.

**Mögliche Erklärung:** …

**Mindestens zwei Alternativerklärungen:** beispielsweise gleichzeitige Nachricht; Markttrend erklärt beide Gruppen; Bid-/Ask-Wechsel erzeugt die Form; Auswahl günstiger Instrumente; Muster erst nachträglich erkennbar.

**Vorher festgelegter Gegenfall / Widerlegung:** …

**Welche Beobachtung fehlt, um die Erklärungen auseinanderzuhalten?** …

**Belegart:** `definition / eigene_hypothese / synthetischer_lehrfall / historische_beobachtung / prospektive_beobachtung`. Ein Literaturzitat ist kein eigener Handelstest.

## 3. Exakte Messung und Zeitvertrag

- Beobachtungseinheit: …
- Preisbasis und Seite: `Bid / Ask / Mid / Trade / …`; ein Mid ist kein garantierter Fill.
- Erkennungsregel, Fenster, Toleranzen, Ablauf und Invalidierung: …
- Intervallhierarchie: Kontext … / Setup … / Ausführung …
- Ausschließlich abgeschlossene höhere Bars oder explizit separate laufende Features: …
- `event_time`, `available_at`, `received_at`, Feature-Fit-Cutoff und Zeitzone: …
- Pivot-/Pattern-Ankerzeit und spätere Bestätigungszeit: …
- Warm-up, fehlende Bars, Quotealter/TTL, Handelskalender und Sommerzeit: …
- Zielvariable mit Beginn, Ende, Reifezeit und Einheit: …
- Handelssignal, ausführbarer Auftrag und tatsächlich gebuchter Fill getrennt: …

**Pflichtprüfung:** Werden ausschließlich spätere Daten geändert, bleiben frühere Features, Entscheidungen und Buchungen identisch. Eine andere Darstellung im Chart darf die archivierte damalige Entscheidung nicht überschreiben.

## 4. Vergleich und Versuchsfamilie vorab festlegen

| Vergleich | Zweck | Vor Ergebnis fixierte Version |
|---|---|---|
| Feste einfache Familienregel | Prüft Zusatznutzen gegenüber z. B. Donchian/EMA/Range-Regel | … |
| Variante ohne dieses Merkmal | Ablation des Musters / der höheren Zeitebene | … |
| Cash-Referenz | Vergleich mit dem zutreffenden Cash-/Zinsvertrag | … |
| Referenz mit vergleichbarer Exposition | Trennt mögliche Regelwirkung von höherem Markt-/Leverage-Risiko | … |
| Aktueller freigegebener Champion | Prüft vollständige neue Policy | … |

Eine gehaltene Marktserie und eine taktische Strategie dürfen sich in Exposition unterscheiden; diese Differenz muss ausgewiesen und zusätzlich kontrolliert werden. Der Konkurrenz-Screenshot bleibt `EXTERNAL_UNVERIFIED_REFERENCE`: Zeitraum, Daten, Instrumentvertrag und Kosten sind unbekannt. Er ist kein gleichwertiger Benchmark und begründet keinen Weltbestnachweis.

**Suchbudget:** höchstens … neue Varianten, … feste Familien, … Parameterwerte, … vorab festgelegte Zeitebenenprofile. Der Zähler enthält negative, abgebrochene und technisch ungültige Versuche mit entsprechendem Status. Parallele Agenten erhöhen das gemeinsame Budget nicht.

## 5. Daten, Ausführung und gemeinsames Kapital

- Dataset-ID, Rohbyteshash, Transformationshash, Lizenz-/Nutzungsstatus: …
- Historisch gültiges Universum einschließlich Delistings, Symbolwechseln und Corporate Actions: …
- Für jeden Zeit-/Marktpfad genau **ein gemeinsames Konto** über alle Kandidatenmodule; Vergleichsstrategien erhalten getrennte Konten mit gleichem Startvertrag.
- Anfangskapital, Kontowährung, FX-Bewertung, Mengenschritt, Minimum und Margin: …
- Spread, Kommission, Slippage, Verzögerung, Finanzierung/Swap, Borrow, Marktimpact: …
- Fehlende Daten, abgelehnte Orders, No-Trade, Teilfills, Stopgaps und offene Endpositionen: …
- Gleichzeitige Signale: Reservierung, Priorität, Nettierung, gemeinsames Risiko: …
- Risikolimits und Stressannahmen sind Forschungsannahmen; eine Stopregel garantiert keinen maximalen Gapverlust.

## 6. Zeitliche Trennung und Auswahl

Training: … / innere Validierung: … / äußere Walk-forward-Fenster: … / gesperrter Schlussabschnitt: …

Der vollständige Auswahlprozess wird im äußeren Walk-forward wiederholt. Skalierung, Imputation, Merkmalswahl, Regimemodell und Kalibrierung werden jeweils ausschließlich mit zugelassenen Trainingsinformationen angepasst. Purging folgt den echten Labelintervallen und deren Reifezeit; ein pauschaler Abstand ist kein Nachweis.

Für jeden Abschnitt festhalten: bereits menschlich oder algorithmisch betrachtet? Für welchen früheren Versuch? Der veröffentlichte LAB04-Schlussabschnitt 2020–2025 ist **bekannt**. Eine erneute Auswertung ist Reproduktion, keine neue unberührte Prüfung.

## 7. Messgrößen und Entscheidung

Gemeinsam bewerten: Nettogewinn und geometrisches Wachstum, Zeit bis zu vorab definierten Kapitalzielen, Drawdown, Tail-Verluste/Insolvenzfälle, Exposition, Umsatz, Kapazität, Kosten, Konzentration und No-Trade-Anteil. Trefferquote und Profit Factor sind zusätzliche Beschreibungen, keine alleinige Siegerregel.

Zeit bis 2×/10×/30× wird nur bei tatsächlich erreichtem, genau definiertem Kontowert gemessen. Nicht erreichte Ziele sind zensiert; kein erfundener Zielzeitpunkt. Für 100 CHF sind Mindestmenge, Gebühren und null zulässige Trades echte Ergebnisse.

**Vorab festgelegte Gates aus `Run-Protocol.json`:** …

**Unsicherheit:** gepaarte Unterschiede zu festen Referenzen; Abhängigkeit über gemeinsame Zeitblöcke, Instrumentgruppen und Ereignisse beachten. Nicht jeden Trade als unabhängige Stichprobe resamplen.

**Mögliche Ergebnisse:** `INVALID`, `INCONCLUSIVE`, `REJECTED_FOR_THIS_PROTOCOL`, `ADVANCE_TO_PROSPECTIVE_SHADOW`. Kein Ergebnis dieser Karte erteilt eine Live-Handelsfreigabe.

## 8. Abschluss und genau eine Folgeaufgabe

| Feld | Nach Lauf auszufüllen |
|---|---|
| Unverändertes Protokoll / Hash / Freeze-Zeit | … |
| Tatsächliche Daten-/Code-/Policy-Versionen | … |
| Alle Versuch-IDs / negative und abgebrochene Fälle | … |
| Ergebnisdateien / unabhängige Prüfung | … |
| Ergebnisstatus und erfüllte/verfehlte Gates | … |
| Datenlücken und nicht geprüfte Aussagen | … |
| Genau eine begründete Folgeaufgabe | … |

Nach einer Sichtung des Schlussabschnitts beginnt jede inhaltliche Anpassung eine neue Forschungsfassung. Das alte Ergebnis bleibt erhalten.
