# S03 – Dokumentierte Navigation und Kompatibilität

**Vorarbeit, keine installierte Navigation und kein S03-Abschluss.** Basis ist der private Commit
`b9845dc9f0434bd6ee7a94af239625a58f6b9135`; aktive Planfassung bleibt 1.2.0. S02/C01 und AM-003 bleiben offen.

## Vier Hauptbereiche und genau ein Setup

| Bereich | Bezug | Aufgabe |
|---|---|---|
| Übersicht | A01-r04 | Botstatus, Chart, genau eine Setupkarte, letzte Entscheidungen sowie kompakte Positionen/Forschung. |
| Beobachtung | A02-r03 | Markt-/Zeitebenenmatrix, Feed- und Berechnungsfrische, Prüfverlauf. Keine zweite Setupkarte. |
| Forschung | A03-r03 | Jobs, Daten-/Kostenrahmen, Vergleich und bewertete Ergebnisse. Wissen/Hypothesen nur Unteransichten. |
| Positionen | A05-r03 | Tatsächlicher bekannter Bestand, Originalplan, aktueller gemeldeter Schutz und Verlauf. |

A04-r03 ist **Bot-Einstellungen über das Zahnrad**, kein fünfter Hauptbereich. Ein Projektfortschritts-
oder Wissensdetail verändert diese Navigation nicht. Keine separaten Strategie-/Regelkataloge.
Links aus Beobachtung dürfen eine vorhandene Setupauswahl fokussieren oder ein begrenztes Detail
öffnen, aber keine zweite dauerhaft sichtbare Setupkarte erzeugen.

## Tatsächlich belegte alte Zugänge

| Bestehende Quelle | Geplante Zuordnung | Grenze |
|---|---|---|
| `/` – Original-Assetindex | Übersicht | Fehlender Overlay-/Skinstand verhindert eine Aussage über die finale heutige Navigation. |
| „Journal laden“ in der Hauptseite | Journal-/Analyseunteransicht | Im vorhandenen HTML eine Aktion, **keine belegte `/journal`-URL**. Imported ist nicht live. |
| `/konto-live.html` – Konto-Addon | Konto-Detail aus Übersicht/Positionen; Verbindung unter Zahnrad | Eigenständige Alt-URL erhalten oder kontrolliert migrieren; kein neues Hauptmenü. |
| `/revolution.html` – separate Fernansicht | Beobachtungs-/Positionsdetails | Projektion bleibt Verlustansicht, kein Journalbackup oder uneingeschränkter Fernzugriff. |
| Weitere Routen aus fehlenden Inputs | Noch unbekannt | Keine Redirects oder neue Endpunkte erfinden. |

`docs/ui/navigation/route-compatibility.json` hält Quellen und Grenzen maschinenlesbar fest.
Die Zuordnung installiert weder Redirects noch Router, Authentisierung oder CSS. Vor einer späteren
Migration müssen alte Links, Import/Export, Anmeldung, Back/Forward und Detailauswahl am tatsächlich
vollständigen Build getestet werden (S21/S31/S32). API-Routen sind keine Hauptnavigation.

## Quellen- und Wirkungswahrheit

`data-bindings.json` enthält jedes hier geplante Anzeigen-/Aktionsobjekt mit Quelle oder offenem
Zielvertrag, Einheit, Zeitbezug, Autorität und Fehler-/ACK-Regel. Es ist kein Endpointkatalog mit
behaupteten implementierten Diensten. Forschungsjobs sind nicht als vorhandene Hub-Backtests
markiert. Kontosnapshots, Observerbestand, Journalereignisse und Remoteprojektionen bleiben getrennt.

## Rückkehr und Kontext

Die zukünftige Umsetzung erhält ausgewählten Markt, Konto, Position, Run, Filter und Zoom lokal.
Die jüngste gültige Anfrage bestimmt die Anzeige. Schließen einer Oberfläche beendet keinen bereits
bestätigten Hintergrundauftrag und löscht keine Quittung. Zugriffsverlust darf keine Daten eines zuvor
gewählten fremden Kontos sichtbar lassen. Diese Regeln sind dokumentiert, noch nicht im Browser geprüft.
