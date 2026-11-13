# Verbindliche Designentscheidungen

Stand: 11. November 2026. Gültig für Masterplan 1.1.0. Die ausdrückliche Nutzerfreigabe betrifft den zuletzt vorgelegten Desktopstand. Sie ist in approval.json mit den genauen Bildkennungen und Prüfsummen dokumentiert.

## 1. Reihenfolge: Technik, dann Gestaltung

Die Technik wird zuerst fertiggestellt und geprüft. Vor Beginn der eigentlichen Designumsetzung müssen S21, S22 und S25 abgeschlossen sein. Dazu gehören funktionierende Daten- und Jobwege, bestätigte native Zustände im vereinbarten technischen Umfang und die geprüften Betriebsabläufe. Ein wirtschaftlicher Gewinnnachweis wird nicht als Voraussetzung für den Bau einer korrekten Oberfläche verwendet.

S03 sichert frühzeitig ausschließlich Referenzen, Entscheidung und Gestaltungsgrenzen. Das ist Dokumentation, keine vorgezogene CSS-, Layout- oder Animationsarbeit. S21 verbindet die technischen Wege und prüft sie ohne Redesign. S30 bis S35 setzen anschließend Gestaltung, Zustände, Bewegung, responsive Ansichten und visuelle Abnahme um. S26 darf die vollständige Releasefreigabe erst danach abschließen.

## 2. Gewählte Richtung und genaue Referenzen

A01 aus der ersten Vergleichsrunde ist die gestalterische Grundlage. B03 liefert ausschließlich die gewünschte Detailtiefe der Forschung. Die aktuelle verbindliche Desktopreferenz besteht aus folgenden fünf Dateien:

| Referenz | Ansicht | Bedeutung |
|---|---|---|
| A01-r04 | Botübersicht | Botzustand, aktuelle Beobachtung, genau ein Setup-Panel, jüngste Entscheidungen, Positionen und Forschung |
| A02-r03 | Beobachtung | Markt- und Botzustände über Zeitebenen, Datenfrische und Prüfverlauf; keine zweite Setup-Karte |
| A03-r03 | Forschung | Aufträge, ausgewählter Versuch, Daten-/Kostenrahmen, Variantenvergleich und Ergebnis in der Gestaltung von A |
| A04-r03 | Bot-Einstellungen | Über das Zahnrad erreichbare kompakte Betriebs- und Grenzeneinstellungen mit nachvollziehbarem Änderungszustand |
| A05-r03 | Positionen | Bestand, ursprünglicher Plan, aktueller Schutz und Entscheidungsverlauf |

Die PNG-Dateien liegen unter assets/design/approved/. Die fünf Dateien werden unverändert geführt. Ein Austausch erfordert eine neue Fassung und einen aktualisierten Freigabenachweis. Frühere Bilder, einschließlich der verworfenen Strategiekarten und doppelten Setupdarstellung, sind keine gleichberechtigten Umsetzungsalternativen.

## 3. Produktstruktur

Die Hauptnavigation enthält genau vier Bereiche: Übersicht, Beobachtung, Forschung und Positionen. Einstellungen werden über das Zahnrad geöffnet. Ein eigener Strategiekatalog in der Hauptnavigation entfällt. Strategieentwicklung und Strategievarianten gehören fachlich in die Forschung; die wenigen operativen Vorgaben gehören in die Bot-Einstellungen.

Der Bot ist der Mittelpunkt. Die Oberfläche beantwortet: Was beobachtet er? Welche Bedingung fehlt? Warum wartet er? Welche Entscheidung wurde tatsächlich getroffen? Welcher Schutz ist bestätigt? Welche Untersuchung läuft? Kontowerte unterstützen diese Fragen.

Das beobachtete Setup erscheint genau einmal als eigener Baustein auf der Botübersicht. Die Beobachtungsseite wiederholt diese Karte nicht. Sie beantwortet die breitere Frage nach Markt-, Zeit- und Datenzuständen. Ein gezielt geöffnetes Detail darf zusätzliche Informationen zum ausgewählten Vorgang zeigen, ohne eine zweite dauerhaft sichtbare Setup-Karte einzuführen.

## 4. Gestaltung und Texte

Die Farbgrundlage bleibt: Hintergrund #070a08, Flächen #0b0f0d, Rahmen #1d2621, Text #edf1ee, Sekundärtext #89968e, Markenakzent #26dc77. Die Ausgangsradien sind 17 px für Karten und 9 px für Bedienelemente. Inter ist die Ausgangsschrift; Zahlen verwenden stabile tabellarische Breiten. Die tatsächlichen Größen werden anhand der freigegebenen Referenz und der vereinbarten Viewports präzisiert.

Grün kennzeichnet aktive Auswahl und passende Zustände. Farbe wird durch Text, Symbol oder Position ergänzt. Die lesbare Darstellung wird gemessen; ein Farbwert allein ist noch kein Kontrastnachweis. Keine zusätzliche Sternkarte, keine dekorative KI-Bildsprache und keine neue Farbwelt einführen.

Beschriftungen benennen konkrete Aufgaben und Zustände. Kurze Beispiele sind „Beobachtet“, „Bestätigung offen“, „Prüfung läuft“ und „Stop unverändert“. Inhalt und Zeitpunkt müssen aus tatsächlichen Daten stammen. Allgemeine Erfolgsfloskeln und zufällige Erklärungstexte gehören nicht in die Oberfläche.

Die Beispielzahlen, Studienergebnisse, Instrumentpreise, Kontoverbindungen, Schutzmeldungen und Einstellwerte der Bilder sind keine fachliche Konfiguration oder reale Evidenz. Die Implementierung bindet diese Felder an die geprüften Domänenverträge. Insbesondere werden aus den Bildern weder Risikolimits noch eine Freigabe für Brokeraktionen übernommen.

## 5. Benutzerfreundlichkeit

Ein Bereich hat einen erkennbaren Schwerpunkt. Zusatzdetails öffnen sich im passenden Zusammenhang. Auswahl, Filter, Scrollposition und Chartansicht bleiben bei neuen Daten erhalten. Es gibt kein periodisches vollständiges Neuladen als Aktualisierungsmechanismus.

Die Zustände laden, leer, fehlerhaft, veraltet, ausstehend und bestätigt werden gezielt gestaltet. Ein gespeicherter Entwurf ist von einer tatsächlich am Bot angewendeten Änderung unterscheidbar. Unbekannte Werte werden nicht als Null oder Erfolg dargestellt. Beobachtung, Planung, Anwendung und native Bestätigung bleiben fachlich getrennt.

Die Einstellungsansicht wird anhand der tatsächlich verfügbaren Fähigkeiten aufgebaut. Ein reiner Beobachter darf durch einen Modusschalter nicht stillschweigend Schreibrechte erhalten. Zustände wie „Positionsschutz weiterführen“ müssen an die zuständige Instanz und deren tatsächliche Bestätigung gebunden sein. Sichere vorhandene Schutzfunktionen dürfen nicht nur zur Vereinfachung der Oberfläche abgeschaltet werden.

## 6. Bewegung ist Teil der Abnahme

Alle gestalteten Ansichts- und Strukturwechsel erhalten ein definiertes Übergangsverhalten: hin und zurück, auf und zu, ein und aus. Ein Element wird beim Schließen erst nach seinem Exit aus der Darstellung entfernt. Schnelle Wiederholung darf keinen Sprung, veralteten Inhalt oder verlorenen Fokus erzeugen.

Die genaue Tabelle mit Zuständen, Zeitwerten, Bewegungswegen und Prüfungen steht in UX_MOTION_SPEC.md. Datenaktualisierung und Animation bleiben getrennt: Ein tatsächliches Ereignis darf sichtbar eingeführt werden; eine Routineaktualisierung unveränderter Daten löst keine neue Animation aus. Die Oberfläche bleibt ruhig, während Informationen aktuell werden. Numerische Zwischenwerte werden nicht erfunden.

Bewegung wird an der laufenden Anwendung geprüft. Die Desktopbilder bestätigen das Erscheinungsbild, aber keine Bildrate, keinen Datenstream und keinen bereits funktionierenden Übergang. Reduzierte Bewegung, Tastaturbedienung und schmale Ansichten erhalten die passende Umsetzung und eigene Nachweise.

## 7. Freigabe und spätere Änderungen

Der aktuelle Desktopstand ist durch „Ok ja passt“ im Zusammenhang mit den zuletzt gezeigten fünf Bildern freigegeben. Das ist keine automatische technische Produktfreigabe. S03 dokumentiert die Auswahl; S30 prüft die integren Referenzen nach Abschluss der Technik; S35 vergleicht die tatsächlich umgesetzte Oberfläche mit ihnen.

Technische Entscheidungen innerhalb dieser Vorgaben werden autonom getroffen. Eine wesentliche Abweichung an Navigation, Aufbau, Farbwirkung oder Bedienmodell wird als konkrete Alternative sichtbar gemacht und mit dem Nutzer abgestimmt. Kleine Korrekturen zur exakten Umsetzung, Datenbindung, Barrierefreiheit und Leistung benötigen keine neue Grundsatzentscheidung.

Die neue Designphase wird durch Abhängigkeiten, erlaubte Dateibereiche, Nachweispflichten und die hashgebundene Designfreigabe im Planwächter begrenzt. Lokale JSON-Dateien ersetzen weder vertrauenswürdige CI noch tatsächliche Nutzeridentität. Die echten Browserbilder, Interaktionsaufzeichnungen und Prüfergebnisse entstehen während S30 bis S35.
