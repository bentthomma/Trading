# Änderungen der Arbeitskarten · Masterplan 1.1.0

## Entscheidung und Umfang

Die fünf Desktopreferenzen A01-r04, A02-r03, A03-r03, A04-r03 und A05-r03 sind als Baseline bestätigt. Die Designimplementierung folgt vollständig auf die technische Abnahme. Referenzfreigabe ist kein Nachweis für implementierte Funktionen, mobile Bedienung, Motion, Laufzeit oder wirtschaftliche Qualität.

Originalpaket 1.0.0 bleibt unverändert. S00–S29 und ihre bisherigen AP-Verweise bleiben erhalten. Sechs neue Karten S30–S35 bilden die eigenständige Designphase. Alle Produktkarten stehen weiterhin auf pending; S03–S35 benötigen weiterhin die reale Scopeauflösung durch S01/S02 und ein geprüftes Amendment.

## Umfang in Zahlen

| Merkmal | Version 1.1.0 |
|---|---:|
| Karten insgesamt | 36 |
| Aktive Kernkarten | 34 |
| Deaktivierte optionale Erweiterungen | 2 |
| Aufgaben | 274 |
| Verbindliche Abnahmeprüfungen | 168 |
| Geforderte Lieferartefakte | 159 |
| Neue Designkarten | 6 |
| Aufgaben in S30–S35 | 56 |
| Abnahmeprüfungen in S30–S35 | 40 |
| Lieferartefakte in S30–S35 | 33 |

## Geänderte Karten

| Karte | Verbindliche Änderung |
|---|---|
| S00 | Negative Gates für späte Designphase, Referenzintegrität und Freigabe prüfen. |
| S01 | Frühe Designarbeit bedeutet ausschliesslich Dokumentation; Implementierung erst ab S30. |
| S02 | Reale Scopeauflösung umfasst S03–S35; technische und gestalterische Pfade explizit trennen. |
| S03 | Nur Referenzen, Navigationszuordnung und Zustands-/Abnahmeplanung dokumentieren; kein CSS oder UI-Code. |
| S21 | Echte Daten, Jobs, ACKs und Zustände integrieren; bestehende Hülle oder isolierter Prüfaufbau, keine neue Gestaltung. |
| S24 | Technische Demoabnahme und wirtschaftliche Kandidatenbewertung getrennt dokumentieren. |
| S25 | Technisch abgenommene Demokonfiguration genügt als Eingang; Gewinnurteil ist kein Blocker. Technischen Stand vor Design festhalten. |
| S26 | Zusätzlich S35 zwingend; finalen Build gegen technische Nachweise prüfen. Gesamtfreigabe nach Technik und Design. |
| S27/S28 | Weiterhin deaktivierte optionale Erweiterungen; Phasenbezeichnung an neue Reihenfolge angepasst. |
| S29 | Nach S26; designrelevante Änderungen öffnen gezielt S30–S35 erneut. |
| S30 | Referenz-/Token-/Komponentenbasis erst nach S21, S22 und S25. |
| S31 | Vier Hauptbereiche: Übersicht, Beobachtung, Forschung, Positionen. |
| S32 | Gear-Einstellungen nach A04 plus vollständige Dialog-, Fehler-, Leer- und ACK-Zustände. |
| S33 | Alle Ein-/Ausblendungen, Richtungswechsel, Liveupdates und reduzierte Bewegung mit Verhaltensnachweis. |
| S34 | Responsive, Tastatur/Touch/Screenreader und gemessene Laufzeit unter definierten Bedingungen. |
| S35 | Fünf Referenzansichten plus Motion-/Live-/Bedienungsabnahme am finalen Build. |

## Reihenfolge und Sperren

S30 hat die Pflichtvorgänger S21, S22 und S25; über deren Abhängigkeiten sind sämtliche technischen Kernkarten S00–S25 vorgeschaltet. Danach gilt S30 → S31 → S32 → S33 → S34 → S35 → S26 → S29. S33 führt S31 zusätzlich explizit, S35 alle Designkarten als Pflichtvorgänger. S27/S28 bleiben optional und sind kein Pflichtvorgänger einer Kernkarte.

Alle sechs Designkarten besitzen denselben technisch geprüften design_approval-Eingang: design/approval.json, Scope desktop_baseline, gebunden an SHA256 `f8ab1f76c7d5a61ea11a334561019bdd2ac2be04a7a1dd7ed009275d5328de3e`. Das Gate prüft nicht nur einen Freigabetext, sondern auch die fünf referenzierten Bilddateien. Freigabe und bestätigte Bilder stehen in immutable_paths und dürfen nicht im normalen Aufgabenabschluss verändert werden.

Maximal zwei unabhängige Arbeitspakete bleiben zulässig; gemeinsam genutzte Shell-, Token-, State- oder Motiondateien machen die Arbeiten abhängig und damit seriell. Der kontrollierte nächste Schritt kommt weiterhin aus planctl next. Diese Planänderung startet keine Produktkarte und ersetzt keine spätere reale Repository-Scopeauflösung.

## Gestaltungsregeln im Auftrag

Die A01-Sprache ist führend. Es gibt vier Hauptbereiche und Einstellungen über das Zahnrad. Beobachtetes Setup erscheint genau einmal auf der Übersicht, auch bei responsiven Ansichten ohne versteckte Doppelkomponente. Strategie-/Regelkataloge entfallen; Varianten, Vergleich und Evidenz liegen in Forschung. Deutsche Texte bleiben kurz, konkret und an echte Fachzustände gebunden.

S33 erfasst jede Strukturänderung mit enter, exit, Unterbrechung und reduced-motion-Zweig. Unsichtbare Elemente bleiben nicht interaktiv, ausblendende Elemente bleiben nur solange wie nötig für die Exitphase im DOM. Livewerte sind echte bestätigte Zustände; keine erfundenen Zwischenpreise. Quelle, Datenalter, Warnungen und natives Readback behalten Vorrang vor einem dekorativen Effekt. Fokus, Scroll, Auswahl, Zoom und lokale Eingaben bleiben stabil.

Mobile Ansichten, Bewegungsverhalten und gemessene Laufzeit werden in S34/S35 tatsächlich validiert. Die vorliegenden Desktopbilder werden dafür nicht als bereits erteilte Funktionsabnahme verwendet. Wirtschaftlicher Erfolg ist kein Eingangsgate für S30–S35; unzureichende wirtschaftliche Evidenz bleibt trotzdem ein Hindernis für entsprechende Gewinnbehauptungen und Kandidatenpromotion.

## Prüfung dieser Planfassung

Die Schema- und DAG-Prüfung der bestehenden Kontrolle wurde lesend auf dem neuen Plan ausgeführt. Keine Zyklen, doppelten Schritt-/Prüf-IDs oder unbekannten Abhängigkeiten. Alle 36 Karten wurden aus plan.json mit denselben elf Pflichtabschnitten erzeugt. Neue Kontrolltests und die neue Plansperre erfolgen separat durch die Plansteuerungsprüfung; dieses Änderungsdokument behauptet keine bereits implementierten Produktfunktionen.

Plan-SHA256 beim Erzeugen dieser Karten: `60303e48156a187d065ad66e884398a71853e955a4acc1322ab8d9dd9d97ae7d`. Bindend ist nach Abschluss des Gesamtpakets die unabhängig geprüfte Plansperre; spätere Ergänzungen an plan.json erfordern eine neue Karten-/Hashprüfung.

## Präzisierter Korrekturrücklauf aus S35

Ein hoher oder kritischer Befund hält die laufende Abnahme mit `planctl block` an. Bereits bestandene Umsetzungskarten lassen sich im vorhandenen Wächter nicht über `block`/`resume` wieder öffnen. Deshalb wird der konkrete Korrekturauftrag durch ein unabhängig geprüftes, versioniertes Planamendment in der zuständigen Karte ergänzt. `planctl relock` setzt die geänderte Karte und ihre abhängigen Nachfolger auf `pending`; danach beginnt die zuständige Karte regulär und erneuert die betroffenen Nachweise. Erst dann kann S35 erneut abgenommen werden. Direkte Statusdateiänderungen, Force-Abschlüsse und ein zusätzlicher Reopen-Bypass sind ausgeschlossen. Dieser dokumentierte Ablauf nutzt die bestehende Plansteuerung und erweitert keine Berechtigung.
