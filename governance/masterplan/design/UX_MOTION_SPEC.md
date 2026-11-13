# ExtremeLab · Verbindlicher Vertrag für Gestaltung, Bedienung und Bewegung

**Version:** 1.1.0 · **Stand:** 11. November 2026 · **Zeitzone:** Europe/Zurich  
**Geltung:** Plan für S30–S35. Die fünf genannten Desktopentwürfe sind vom Nutzer als Designbasis angenommen. Produktimplementierung, responsive Ansichten und tatsächliche Bewegung sind noch nicht geprüft.

## 1. Ziel, Reihenfolge und verbindliche Referenzen

Die Website erklärt zuerst den Bot: Was beobachtet er? Worauf wartet er? Welche Entscheidung hat er getroffen? Welche Position schützt er? Was untersucht er gerade? Die Darstellung bleibt dabei ruhig, verständlich und bedienbar. Mehr Daten erzeugen mehr fachlichen Inhalt, aber keine laufende visuelle Unruhe.

Die aktuelle Nutzeranweisung lautet in ihrem entscheidenden Teil: „Design kommt nach Technik“ und „ausfahren sowie einfahren beides Animationen“. Deshalb steht die abgeschlossene technische Grundlage vor der visuellen Umsetzung. S03 sichert früh die Referenzen und Entscheidungen als Dokumentation. S21 weist die technische Daten-, Zustands- und Jobintegration nach. Erst nach den im Plan festgelegten technischen Vorgängern beginnen S30–S35 mit dem freigegebenen Erscheinungsbild und dessen Bewegungsverhalten. Eine schöne Oberfläche ersetzt keinen fehlenden Daten- oder Ausführungsvertrag.

| Referenz | Verbindlicher Gegenstand | Funktion |
|---|---|---|
| `assets/design/approved/A01-r04.png` | Botübersicht | Botzustand, genau ein beobachtetes Setup, letzte Entscheidungen, Positionen und Forschung |
| `assets/design/approved/A02-r03.png` | Beobachtung | Markt-/Zeitebenenmatrix, Botstatus, Datenfrische und Prüfverlauf |
| `assets/design/approved/A03-r03.png` | Forschung | Aufträge des Bots, Versuchsrahmen, Variantenvergleich und nachvollziehbare Ergebnisse |
| `assets/design/approved/A04-r03.png` | Bot-Einstellungen | Wenige operative Vorgaben, Verbindung und noch nicht angewendete Änderungen |
| `assets/design/approved/A05-r03.png` | Positionen | Bestand, ursprünglicher Plan, aktueller Schutz und Entscheidungsverlauf |

Die vier Hauptbereiche heißen **Übersicht, Beobachtung, Forschung, Positionen**. Das Zahnrad öffnet die Bot-Einstellungen. Es gibt keine eigenständige Hauptnavigation „Strategien“ und keinen Katalog dekorativer Strategiekarten. Strategiefamilien und Varianten bleiben innerhalb der Forschung erreichbar. Die Komponente **„Beobachtetes Setup“ kommt ausschließlich auf der Übersicht vor und dort genau einmal**. Ein Link aus anderen Bereichen führt zur vorhandenen Darstellung oder zu einer klar begrenzten Detailansicht; er dupliziert die Karte nicht dauerhaft.

Diese aktuelle Regel ersetzt ältere Entwürfe mit fünf Navigationspunkten, doppelten Setupkarten oder einem Strategiekatalog. Frühere Dateien bleiben Verlauf. Die numerischen Werte, Verbindungen und Statusbeispiele in den Bildern sind Illustrationen; sie geben keine Kontoeinstellung, Handelsleistung oder ausgeführte Funktion frei. Die Umsetzung bindet reale Daten und ihre tatsächlichen Einheiten an die dargestellten Felder.

Die vorhandene Evidenz liegt in `design/approval.json`, `design/reference_inventory.json` und `design/DESIGNENTSCHEIDUNGEN.md`. S30 prüft diese Dateien und hält Referenzdateien, Prüfsummen, Bildmaße, Nutzerentscheidung und übertragenen Umfang in seinem Baselinebericht fest. Eintrittsnachweise sind die abgeschlossenen technischen Schritte S21, S22 und S25; die vollständigen Abhängigkeiten stehen in `plan.json`. Die Designumsetzung folgt auf S25 und ihre Abnahme S35 liegt vor dem Gesamtabschluss S26. Eine spätere sichtbare Abweichung wird begründet und am konkreten Gesamtstand geprüft. Kleine technische Entscheidungen innerhalb dieser Vorgaben werden autonom getroffen. Es entsteht keine Rückfragepflicht für jeden Abstand oder jede interne Komponente.

## 2. Gestaltungsgrundlage und lesbare Hierarchie

### 2.1 Farbe, Typografie und Flächen

| Gegenstand | Ausgangswert | Verbindliche Anwendung |
|---|---|---|
| Seitenhintergrund | `#070a08` | Ruhige durchgehende Grundfläche |
| Kartenfläche | `#0b0f0d` | Matte Flächen ohne ständig animierten Schatten |
| Zurückhaltende Trennlinie | `#1d2621` | Dekorative Gliederung; allein kein ausreichender Zustandsindikator |
| Haupttext | `#edf1ee` | Überschriften, wichtige Werte, aktive Information |
| Sekundärtext | `#89968e` | Zusätzliche Angaben; nicht für unlesbar kleine Texte verwenden |
| Markenakzent | `#26dc77` | Aktive Navigation, eine vorrangige Handlung, passende positive Zustände |
| Fokusring | zunächst `#70e8a5` | Sichtbarer Tastaturfokus mit Abstand zur Komponente |
| Kartenecken | 17 CSS-Pixel | Zusammengehörige Flächen, keine wechselnden Radien je Seite |
| Bedienelementecken | 9 CSS-Pixel | Buttons, Eingaben und kompakte Auswahlflächen |
| Schrift | Inter, danach geeignete Systemschrift | Eine gemeinsame Schriftsprache; Zahlen mit tabellarischer Breite |
| Grundraster | 4 CSS-Pixel | Vorzugsweise Abstände 8, 12, 16, 20, 24, 32; genaue Geometrie aus den Referenzen |

Die aufgeführten Farben sind rekonstruierte Ausgangswerte der gewählten Richtung. S30 misst die tatsächlichen Komponentenfarben einschließlich Transparenz, Hover- und Fokuszuständen im Browser. Überschrift, Hauptwert, Status und Nebenangabe besitzen eine konsistente Rangfolge. Ein Hauptwert wird nicht allein durch größere Helligkeit zu einer Handlungsaufforderung.

Für den ersten Aufbau gelten 14–15 CSS-Pixel als regulärer Text, 12–13 für kurze Nebenangaben und Chartachsen sowie 24–30 für Seitentitel. Die konkreten Werte werden an den Referenzen ausgerichtet und in gemeinsamen Tokens festgehalten. Kleinere Schrift wird nicht benutzt, um überladene Karten passend zu machen. Dichte Daten bleiben durch lokale Tabellen, sinnvolle Spalten und gezielte Details lesbar.

Für die rein deckenden Farbpaare ergeben rechnerische sRGB-Kontrastprüfungen etwa 17,44:1 für Haupttext auf Seitenhintergrund, 6,26:1 für Sekundärtext auf Kartenfläche und 10,97:1 für dunklen Text auf dem grünen Akzent. Heller Haupttext direkt auf dem grünen Akzent erreicht dagegen nur etwa 1,59:1. Daher erhalten flächig grüne Hauptbuttons dunklen Text. Die dekorative Rahmenfarbe erreicht zur Kartenfläche nur etwa 1,24:1; notwendige Eingabegrenzen und Fokusindikatoren brauchen zusätzliche erkennbare Merkmale. Diese Rechnungen belegen nur die genannten deckenden Paare, nicht die vollständige Oberfläche.

Projektabnahmeziel sind mindestens 4,5:1 für reguläre relevante Texte und 3:1 für große Texte sowie notwendige grafische Kontrollindikatoren. S34 prüft tatsächlich gerenderte Zustände. Farbe wird durch Wort, Symbol oder Form ergänzt: „Offen“, „Veraltet“ oder „Fehler“ dürfen nicht ausschließlich grün, gelb oder rot codiert sein.

### 2.2 Konkrete Sprache und Informationsmenge

Eine Karte beantwortet eine Hauptfrage. Überschrift und Inhalt wiederholen nicht dieselbe Aussage in mehreren dekorativen Zeilen. Geeignete kurze Texte sind „Wartet auf M15-Kerzenschluss“, „Referenzdaten fehlen“ und „Schutzänderung ausstehend“. Sie werden nur angezeigt, wenn die Daten den Zustand tragen. „Intelligente Analyse läuft“ oder „Optimale Strategie gefunden“ ersetzt keine konkrete Zustandsbeschreibung.

Der Primärbutton beschreibt die nächste Handlung: „Änderungen prüfen“, „Plan ansehen“, „Neuer Versuch“. Gleiche Handlungen heißen auf allen Seiten gleich. Icons unterstützen erkennbare Bezeichnungen. Neue Bereiche erhalten keine beliebigen Erfolgszähler, Marketingtexte oder dauerhaft sichtbare technische Diagnosen. Versions-, Quellen- und Zeitangaben bleiben dort erreichbar, wo sie eine Entscheidung erklären.

Zahlen besitzen eindeutige Einheiten und passende Genauigkeit. Geld, Preis, Prozent, Menge und Zeit werden nicht austauschbar dargestellt. Ein negativer Wert behält sein Vorzeichen. Fehlende Werte sind kein Nullwert. Tabellen- und Diagrammwerte aus einer gemeinsamen Auswahl stammen aus demselben bestätigten Datenstand. Die Beispielsummen in den Entwurfsbildern werden nicht als statische Produktdaten übernommen.

## 3. Funktionsvertrag der fünf Ansichten

**Übersicht:** Der Nutzer erkennt zuerst Botzustand und aktuellen Ansatz. Der große Chart zeigt den gerade beobachteten Markt. Daneben steht die einzige Setupkarte mit klarer Trennung zwischen bereits beobachtetem Kontext, erkanntem Rücklauf und noch offener Bestätigung. „Beobachtet“ bedeutet nicht „Order erteilt“. Die letzten Entscheidungen führen zu ihrem Verlauf. Kontoangaben bleiben als unterstützende Information erreichbar.

**Beobachtung:** Die Matrix zeigt pro Markt die ausgewählten Zeitebenen, Botstatus und Zeitpunkt der letzten Prüfung. Ein frischer Datenfeed und ein frisch berechneter Botzustand sind getrennte Informationen. Sortierung, Filter und Auswahl bleiben bei Updates stabil. Die Seite zeigt keine zweite Setupkarte. Ein ausgewählter Markt kann einen kompakten Verlauf haben, ohne die Übersicht zu kopieren.

**Forschung:** Aufträge, Varianten und Entscheidungen bleiben unterscheidbar. Quelle „Bot“ oder „Manuell“, Datenstand, Zeiträume, Kostenmodell und Ergebnisstatus sind nachvollziehbar. Laufender Fortschritt ist keine Profitabilitätsfreigabe. Ein unvollständiger Versuch zeigt den passenden Zustand statt einer Gewinnerauszeichnung. Details aus Richtung B werden innerhalb der ruhigen Gestaltung A angeboten. Filter und Vergleichsauswahl verändern nur die betreffende Untersuchung.

**Bot-Einstellungen:** Der Bereich enthält operative Vorgaben, keine manuelle Auswahl dekorativer Strategiepakete. Beobachten, Demonstration, neue Einstiege und Schutz bestehender Positionen sind fachlich getrennt. Der technische Vertrag bestimmt, welche Funktionen der konkrete Adapter tatsächlich besitzt. Ein lesender Beobachtungsmodus sendet keine Handelsänderung. Eine Aussage wie „Schutz weiterführen“ bezeichnet entweder bereits bestehende native Schutzaufträge oder eine konkret freigegebene Verwaltung; die Oberfläche darf daraus keine zusätzliche Fähigkeit erfinden. Nicht verfügbare Fähigkeiten werden nachvollziehbar deaktiviert oder ausgelassen.

Einstellungen durchlaufen **Entwurf → Prüfung → Übertragung ausstehend → native Bestätigung beziehungsweise Ablehnung**. Ein erfolgreicher lokaler Speichervorgang wird nicht als angewandte Botregel dargestellt. Vor dem Senden zeigt die Oberfläche die tatsächlichen Unterschiede und den betroffenen Betrieb. Eine laufende Übertragung besitzt eine eindeutige Kennung; erneutes Klicken erzeugt keinen zweiten wirtschaftlichen Auftrag. Das Schließen des Panels löscht keinen bereits gesendeten Auftrag. Dessen Zustand bleibt im Verlauf erreichbar. Die in den Bildern gezeigten Grenzwerte sind keine freigegebenen Risikowerte.

**Positionen:** Tabelle, Chart, ursprünglicher Plan, aktuelle Schutzaufträge und Entscheidungsverlauf beziehen sich auf dieselbe ausgewählte Position. Ein neuer Regelentwurf überschreibt nicht stillschweigend ihren ursprünglichen Plan. Unbestätigte Schutzänderungen bleiben ausstehend. Beim Schließen einer Position wird die Zeile erst nach dem bestätigten fachlichen Zustandswechsel in den Verlauf überführt. Der letzte bekannte Zustand und seine Herkunft bleiben prüfbar.

## 4. Bewegungssystem: jede Zustandsänderung hat Anfang und Ende

### 4.1 Gemeinsame Regeln

Öffnen und Schließen, Ein- und Ausfahren, Einblenden und Ausblenden werden paarweise implementiert. Eine Komponente mit schönem Eintritt und abruptem Entfernen besteht die Abnahme nicht. Der standardmäßige Ablauf verwendet begrenzte, ruhige Übergänge ohne Nachschwingen. Bewegung verdeutlicht den Zusammenhang zwischen Auslöser und Ergebnis.

Die folgenden Werte sind verbindliche **Startwerte für den Prototyp**, keine bereits gemessene Produktleistung. S33 prüft sie am tatsächlichen Ablauf. Kleine Anpassungen innerhalb der angegebenen Bandbreiten werden mit Grund dokumentiert; eine neue Bewegungsart oder deutliche Veränderung des Charakters wird als zusammenhängende Vorschau gezeigt.

| Token | Startwert | Verwendung |
|---|---|---|
| `motion.quick` | 140 ms; Rahmen 100–180 | Hover, Auswahlmarker, kleine Beschriftungswechsel |
| `motion.content` | 200 ms; Rahmen 160–240 | Tabs, normale Inhaltswechsel, Hinweise |
| `motion.panel` | 280 ms; Rahmen 220–320 | Drawer, Dialog, größere aufklappende Bereiche |
| `motion.exit` | 180 ms; Rahmen 140–220 | Übliche Ausblendung vor dem Entfernen |
| `ease.enter` | `cubic-bezier(0.22, 1, 0.36, 1)` | Sanft abbremsender Eintritt |
| `ease.exit` | `cubic-bezier(0.4, 0, 1, 1)` | Kontrollierter Austritt |
| `ease.change` | `cubic-bezier(0.4, 0, 0.2, 1)` | Ausgewogener Wechsel zwischen Zuständen |
| `offset.small` | 4–8 CSS-Pixel | Kleine Popover und Inhaltswechsel |
| `offset.panel` | 12–20 CSS-Pixel | Dialoginhalt; Drawer folgt seiner tatsächlichen Kante |

`opacity` und `transform` sind die bevorzugten visuellen Mittel. Wenn ein Bereich tatsächlich Platz auf- oder abbaut, wird seine gemessene Höhe nur während dieses begrenzten Übergangs animiert. Die Anwendung liest und schreibt Layoutwerte geordnet; kontinuierliche Messschleifen oder Animationen großflächiger Unschärfe gehören nicht zum Bewegungsstil. Eine Bibliothek wird erst gewählt, wenn die vorhandene Technik und die benötigten Abläufe geprüft sind.

### 4.2 Übergangsmatrix

| Übergang | Eintritt / Wechsel | Austritt / Rückwechsel | Verhalten bei Unterbrechung |
|---|---|---|---|
| Hauptbereich | Auswahlmarker 160 ms; vorhandener Inhaltsbereich 140 ms aus, neuer Inhalt 180 ms ein, höchstens 6 px Versatz | Beim Zurückwechseln derselbe Paarablauf; Header bleibt stehen | Neueste Navigation gewinnt; ältere Antworten überschreiben weder Titel noch Inhalt |
| Lokaler Tab | Marker 140 ms; Inhalt 160–200 ms überblenden, Container bleibt stabil | Bisheriger Inhalt blendet 120–160 ms aus | Ab dem sichtbaren Zwischenstand zum zuletzt gewählten Tab wechseln |
| Accordion | Höhe von gemessenem Startwert zum Ziel in 240 ms; Inhalt 160 ms ein | Inhalt 120 ms aus, Höhe in 200 ms zum geschlossenen Zustand | Richtung aus aktueller Höhe umkehren; kein Sprung auf null oder volle Höhe |
| Seitlicher Drawer | 280 ms aus seiner Kante; Hintergrund 180 ms auf Zielabdunklung | 220 ms zurück zur Kante; Hintergrund synchron 160–200 ms aus | Wiederöffnen nutzt aktuelle Position; keine zweite übereinanderliegende Instanz |
| Popover / Auswahlmenü | 140–180 ms, 4 px Versatz und Opazität; Ursprung beim Auslöser | 120–160 ms zum selben Bezugspunkt | Fokus und Auswahl folgen nur dem zuletzt gültigen Zustand |
| Dialog | Hintergrund 160–180 ms; Inhalt 220–280 ms, 12 px oder dezente Skalierung 0,98→1 | Inhalt 160–200 ms zurück; Hintergrund anschließend oder synchron aus | Schließen während Eintritt wird sauber umgekehrt; Aktion bleibt fachlich eindeutig |
| Tooltip | Nach 300 ms Verweilen beziehungsweise bei gezieltem Fokus 120 ms ein, 4 px | 100 ms aus; direkt bei Kontextverlust zurücknehmen | Kein Tooltip über bereits entfernten Auslösern; kein Zwang zum Verweilen auf Touch |
| Neue Tabellenzeile | Platz reservieren, 160–200 ms dezent einblenden | Bei bestätigter Entfernung 140–180 ms aus, dann Platzabbau 180 ms | Stabile fachliche Kennung; erneutes Ereignis erzeugt keine zweite Zeile |
| Geänderte Sortierung | Bestehende Zeilen in 180–220 ms zwischen ihren Positionen bewegen | Rücksortierung nach derselben Regel | Während Bearbeitung keine automatische Umordnung; explizite Sortierung bleibt maßgeblich |
| Toast / Hinweis | 180–220 ms aus 8 px, feste Ankerfläche | 160–180 ms zum Anker aus | Gleiche Meldung zusammenführen; neue Meldung stapelt nicht unkontrolliert |
| Ladezustand → Inhalt | Platzhaltende Fläche; fertig verfügbarer Inhalt 160–200 ms ein | Platzhalter 100–140 ms aus | Alte Anfrage verliert ihre Anzeigehoheit; fertiger Cacheinhalt wartet nicht künstlich |
| Inhalt → leer / Fehler | Größe und Kontext erhalten; zuständige Fläche 160–200 ms wechseln | Erholung blendet den bestätigten Inhalt 160–200 ms zurück ein | Kein globales Flackern; anderer vorhandener Inhalt bleibt sichtbar |
| Verbindung verloren / wieder da | Status 120–180 ms wechseln; Datenfläche bleibt erhalten | Aktualitätsmarkierung nach bestätigtem Abgleich 160 ms zurücknehmen | Ein Transport-Heartbeat hebt eine fachliche Veraltet-Markierung nicht allein auf |
| Detail auf derselben Seite | Auslöser sichtbar lassen; Detail 220–280 ms öffnen | Detail 180–220 ms schließen und Fokus zurückführen | Route, Scrollposition und Auswahl bleiben erhalten |

Eine vollständige Seitenneuladung ist kein Übergang. Für dieselbe Anwendung bleiben Navigation und dauerhafte Elemente gemountet; nur die zuständige Fläche wechselt. Eine Übergangsgruppe darf die gesamte Seite nicht nach jeder Datenaktualisierung erneut einblenden.

### 4.3 Lebenszyklus und schnelle Bedienung

Jede bewegte Komponente besitzt explizite Zustände **geschlossen, öffnet, offen, schließt**. Die Schließanimation läuft vor dem Entfernen des betreffenden visuellen Elements. In der Schließphase nimmt es keine neue fachliche Aktion an. Das Ende wird über das tatsächliche Übergangsende verfolgt; ein begrenzter Fallback verhindert hängende Zustände bei ausgebliebenen Ereignissen. Bei deaktivierter Bewegung erfolgt die Zustandsänderung unmittelbar und korrekt.

Schnelle Gegenbewegung beginnt beim aktuell dargestellten Zustand. Die Anwendung spielt nicht erst eine veraltete Öffnung vollständig ab, bevor sie schließen darf. Wiederholtes Öffnen erzeugt keine zusätzlichen Backdrops, Fokusfallen oder Listener. Ein im Hintergrund fertig gewordener Request darf keine inzwischen geschlossene Fläche erneut öffnen.

Eintritt, Austritt und Datenanforderung besitzen voneinander getrennte Verantwortungen. Ein abgebrochener visueller Übergang ist kein Abbruch einer bereits bestätigten Brokeraktion. Sicherheitsrelevante Zustände und tatsächliche Fehler werden sofort wirksam; ihre fachliche Verarbeitung wartet nicht auf dekorative Bewegung. Die Anzeige kann ihren visuellen Wechsel dennoch ruhig ausführen.

Initial verfügbare Inhalte werden direkt in einer stabilen Fläche dargestellt oder einmalig sehr zurückhaltend eingeblendet. Hydration, Cachewiederherstellung, Sichtbarwerden eines Tabs und wiederholte Telemetrie starten keine erneute Eintrittssequenz der gesamten Seite. Ein Ladesymbol läuft nur so lange, wie eine tatsächliche Aufgabe offen ist. Unbekannter Fortschritt wird nicht durch erfundene Prozente ersetzt.

## 5. Live-Daten ohne Neuladen und ohne visuelle Unruhe

### 5.1 Fachliche Ereignisse und Darstellung

Push, Stream oder passend getaktetes Polling werden nach den vorhandenen technischen Fähigkeiten gewählt. Der sichtbare Vertrag ist gleich: Daten ändern sich an der zuständigen Stelle. Kein vollständiger Reload, kein ungewollter Ansichtswechsel und kein Zurücksetzen der Bedienposition.

Eine stabile Entitätskennung verbindet Position, Forschungsjob oder Markt über Updates hinweg. Ereigniszeit, Empfangszeit und Reihenfolge werden getrennt behandelt. Verspätete oder doppelte Nachrichten überschreiben keinen jüngeren bestätigten Zustand und werden nicht doppelt als neue Entscheidung angezeigt. Ein Ergebnis wird nicht gleichzeitig mit Metadaten eines anderen Versuchs eingeblendet.

Schnelle Quotes dürfen für die Darstellung bis zum nächsten geeigneten Renderzyklus zusammengefasst werden; fachliche Orders, Deals und Entscheidungen bleiben vollständig im Journal. Die Oberfläche zeigt den neuesten zulässigen Wert und den tatsächlichen Datenzeitpunkt. Sie animiert keine erfundenen Zwischenpreise, PnL-Werte oder Fortschrittsstände. Tabellarische Ziffern und reservierte Breiten verhindern, dass Nachbarfelder bei jedem Tick verrutschen.

Normale Wertänderungen erscheinen direkt und ruhig. Sichtbares Einfügen, Entfernen oder Umordnen benutzt die Übergangsmatrix. Damit ist die Forderung nach sanften Wechseln erfüllt, ohne jede Preisziffer als blinkende oder rollende Animation auszuführen. Zustandswechsel können einmalig dezent markiert werden; identische Werte und Heartbeats lösen diese Markierung nicht erneut aus.

### 5.2 Bedienposition und konkurrierende Änderungen

Chartzoom, sichtbarer Zeitbereich, manuelles Scrollen, ausgewählter Datensatz, offene Details und Tastaturfokus bleiben bei gewöhnlichen Datenupdates erhalten. Ein bewusst aktivierter „Aktuelles Ende folgen“-Modus darf den Chart weiterführen. Sobald der Nutzer in die Historie navigiert, entscheidet die konkrete Bedienung nachvollziehbar über diesen Modus; die Ansicht springt nicht unvermittelt zurück.

In einer Positionstabelle verschiebt ein neuer Marktpreis keine Zeile unter dem Mauszeiger. Automatische Sortierung wird bei Bearbeitung oder offenem Zeilendetail ausgesetzt. Neu eingegangene Datensätze können durch einen ruhigen Zähler angekündigt werden, wenn sofortiges Einfügen die aktuelle Leseposition verändern würde. Eine Aktion „Neue Einträge anzeigen“ übernimmt sie kontrolliert.

Ein bearbeitetes Formular behält den eigenen Entwurf. Externe neue Konfigurationen erscheinen als Vergleich oder Konflikt, statt Eingaben zu überschreiben. Wiederverbindung führt einen kontrollierten Abgleich aus. Die Anwendung stellt eine geänderte Position nicht als unverändert dar, nur um einen Entwurf bequem zu erhalten.

### 5.3 Leere, alte und fehlende Daten

„Keine offenen Positionen“, „Noch keine Daten“, „Daten veraltet“, „Keine Berechtigung“ und „Verbindung unterbrochen“ sind unterschiedliche Zustände. Sie erhalten kurze, passende Texte und bei Bedarf eine konkrete Handlung. Ein Konto ohne bestätigte Werte zeigt keine erfundene Nullbilanz. Ein aktiver Transport beweist keinen aktiven Bot und keine aktuelle Marktserie.

Bei Unterbrechung bleibt der letzte bestätigte Stand sichtbar und trägt seinen Zeitpunkt. Der Verbindungsstatus ändert sich innerhalb seiner eigenen Fläche. Beim Wiederanlauf wird nur nach einem erfolgreichen fachlichen Abgleich wieder „Aktuell“ angezeigt. Gescheiterte Einzeldaten führen nicht automatisch zu einem globalen leeren Bildschirm.

## 6. Bedienung, responsive Verhalten und Zugänglichkeit

### 6.1 Gemeinsame Bedienregeln

Alle wesentlichen Aktionen sind mit Tastatur erreichbar. Fokus ist sichtbar, folgt der Lesereihenfolge und geht nicht durch Liveupdates verloren. Dialoge erhalten einen passenden Anfangsfokus; beim Schließen kehrt er zum Auslöser oder zu einem sinnvollen noch vorhandenen Element zurück. Escape schließt die oberste abbrechbare Ebene. Ein bereits gesendeter Auftrag wird dadurch nicht rückwirkend verworfen. Hintergrundelemente eines modalen Dialogs nehmen keine Eingaben an.

Iconbuttons besitzen eine verständliche zugängliche Bezeichnung. Statusänderungen werden gezielt angekündigt; ein Screenreader erhält nicht jede Preisänderung als neue Meldung. Warnungen und Fehlermeldungen bleiben lange genug verfügbar und stehen auch im zuständigen Verlauf. Eine kurz sichtbare Toastmeldung ist keine alleinige Darstellung einer abgelehnten Konfiguration.

Pointer- und Touchziele erhalten als Projektziel mindestens 44 × 44 CSS-Pixel bedienbare Fläche, auch wenn das sichtbare Icon kleiner ist. Tabellenaktionen dürfen innerhalb ihrer Zeile ausreichend große Ziele verwenden. Eingabefehler stehen direkt am betroffenen Feld mit kurzer Ursache und Korrekturmöglichkeit. Eine ungültige Eingabe springt nicht durch die ganze Seite.

### 6.2 Responsive Ausgangsmodell

Die Desktopbilder sind die freigegebene Basis. Ihre mobile Ableitung wird in S34 konkret gebaut und in S35 als zusammenhängender Stand geprüft. Sie wird nicht als bereits bildlich freigegeben ausgegeben.

| Bereich | Ausgangsverhalten |
|---|---|
| Breiter Desktop, ab 1.200 CSS-Pixel | Referenzraster mit Hauptfläche und Kontextspalte, darunter geordnete Zusatzkarten |
| Schmaler Desktop / Tablet, 641–1.199 | Zusammengehörige Karten in maximal zwei Spalten; Kontext wird unter oder neben dem Hauptinhalt angeordnet, ohne Bedeutungswechsel |
| Mobile, bis 640 | Eine Inhaltsspalte; kompakter Marken-/Statuskopf, vier Hauptbereiche als eindeutig beschriftete untere Navigation; Einstellungen weiter über Zahnrad |
| Dichte Tabellen | Lokaler horizontaler Bereich oder semantisch gleichwertige Datensatzkarten; keine horizontale Bewegung der gesamten Seite |
| Dialoge / Drawer auf Mobile | Passende volle Breite beziehungsweise untere Detailfläche; sichere Abstände zu Systemleisten, sichtbare Schließ- und Hauptaktion |

Das mobile Navigationsmodell ist eine konkrete Umsetzungsannahme für den Prototyp. Es muss mit der tatsächlichen Informationsmenge und dem vereinbarten mobilen Referenzstand bestätigt werden. Die vier Funktionen bleiben dieselben; es entstehen keine zusätzlichen Menüebenen ohne sachlichen Grund.

Die Prüfmatrix enthält mindestens 1440 × 900, 1024 × 768, 390 × 844, 360 × 800 und 320 × 740 CSS-Pixel. Zusätzlich werden 200 % Inhaltszoom auf Desktop sowie ein Gerät mit höherer Pixeldichte geprüft. Es gibt keine abgeschnittenen relevanten Zahlen, unerreichbaren Schaltflächen oder überlagernden Fußleisten. Eine veränderte Höhe und eine eingeblendete Bildschirmtastatur dürfen den Abschluss eines Formulars nicht verhindern.

### 6.3 Reduzierte Bewegung

Bei gewünschter reduzierter Bewegung entfallen räumliche Fahrten und Skalierung. Kurze Opazitätswechsel bis 100 ms oder direkte Zustandswechsel sind zulässig, wenn sie verständlich bleiben. Ein Drawer wird funktional geöffnet und geschlossen, ohne die volle Fläche durch das Bild fahren zu lassen. Ladeinformation bleibt als Text oder ruhiges Symbol erhalten. Dies ist der vorgesehene alternative Bewegungsmodus, kein Fehler gegen die normale Smoothness-Vorgabe.

## 7. Leistung, Messung und visuelle Abnahme

### 7.1 Messvertrag statt pauschaler Smoothness-Behauptung

S34 legt vor der Messung Browser und Version, Betriebssystem, Gerät, CPU/GPU, Bildschirmfrequenz, Pixeldichte, Viewport, Produktionsbuild, Datenlast und Messwerkzeug fest. Mindestens ein übliches Notebook und ein reales Mobilgerät werden geprüft. Emulation ergänzt diese Messung, ersetzt sie aber nicht. Die unveränderten Fixtures und deren Seed werden mit dem Bericht abgelegt.

Erste Testlast: 100 beobachtete Marktzeilen, 50 Positionen, 20 Forschungsjobs, 2.000 geladene Chartpunkte und 200 eingehende Quotes pro Sekunde über 60 Sekunden; ein separater Burst liefert 1.000 Quotes pro Sekunde über fünf Sekunden. Die repräsentativen Eintritts-, Austritts- und Umkehrabläufe werden während dieser Last mindestens fünfmal aufgenommen. Diese Werte sind ein festzulegender Entwicklungsprüffall, keine bereits bestätigte Produktkapazität. Die tatsächliche Zielkapazität aus dem technischen Vertrag kann einen höheren, separat budgetierten Test verlangen.

Für 60-Hz-Referenzgeräte gelten zunächst folgende Abnahmeziele: 95 % der während der geprüften Übergänge erfassten Frameintervalle höchstens 20 ms, kein anwendungseigener sichtbarer Stillstand über 100 ms, Reaktion auf lokale Bedienung bis zum ersten sichtbaren Feedback im 95. Perzentil höchstens 100 ms. Eintritt und Austritt müssen beide geprüft werden. Abweichungen werden mit Trace, Ursache und Entscheidung dokumentiert; sie werden nicht durch eine ungemessene Aussage „fühlt sich flüssig an“ ersetzt. Hintergrundaktivitäten des Betriebssystems werden kenntlich gemacht und bei Bedarf durch einen nachvollziehbaren Wiederholungslauf eingegrenzt.

Ein Aufnahmevideo allein beweist keine Framezeit. Es zeigt den Ablauf; die Messdaten zeigen dessen Zeitverhalten. Umgekehrt ersetzt eine gute Zahl nicht die sichtbare Prüfung auf Sprünge, Fokusverlust oder verwirrende Reihenfolgen. Beides gehört zur Abnahme.

### 7.2 Referenzvergleich

Die tatsächliche Website wird bei einem zum jeweiligen Referenzbild passenden Viewport mit festem Fixturestand aufgenommen. Das Paket enthält nebeneinander Referenz und Browserbild sowie eine Überlagerung oder markierte Abweichungsansicht. Sichtbare Hauptkanten, Spalten, Kartengrößen, Abstände, Hierarchie, Schriften und Farben werden geprüft. S30 hält die gemessenen Geometrietoleranzen fest; als Ausgangspunkt gelten ±2 CSS-Pixel für konstante Komponentenabstände und keine ungeplante Verschiebung ganzer Flächen.

Dynamische Inhalte dürfen nur mit eng begrenzten, begründeten Masken verglichen werden. Ganze Karten oder unpassende Layoutbereiche werden nicht maskiert, um einen Test bestehen zu lassen. Diagrammdaten werden über feste Fixtures reproduziert; Bildgenerator-Beispielkurven sind kein mathematischer Sollverlauf. Der erste fachlich korrekte Browserstand wird erst nach dem Referenzvergleich als zusätzliche technische Bildbaseline festgehalten.

Der Abschlussbericht benennt die wirklich geprüften Bildversionen und Produktrevisionen. Die angenommene Desktopgestaltung, noch offene mobile Ergänzungen, die geprüfte Bewegung und tatsächliche Datenfunktion bleiben unterscheidbar. Eine neue sichtbar abweichende Fassung ersetzt die Referenz nur über den vorgesehenen Änderungsweg.

## 8. Konkrete Abnahmefälle

Alle Fälle starten im Status `NOT_RUN`. Die zugehörige JSON-Vorlage enthält keine vorausgefüllten Erfolgsaussagen. Ein Ausfall bleibt offen und erzeugt einen konkreten Fehlerbericht mit betroffener Komponente, Datenstand, Reproduktionsschritten und Rückfall.

| ID | Ursache / Prüfablauf | Erwarteter Nachweis und Fehlerreaktion |
|---|---|---|
| DUX-001 | Visuelle Umsetzung soll beginnen | Plan zeigt bestandene technische Vorgänger und freigegebene Referenzbasis; sonst kein Start von S30–S35 |
| DUX-002 | Referenzen werden übernommen | Alle fünf Dateien, Hashes und Nutzerentscheidung passen; fehlende oder veränderte Referenz blockiert die Baseline |
| DUX-003 | Navigation und Setupplatzierung | Genau vier Hauptbereiche, Einstellungen über Zahnrad, Setup nur einmal auf Übersicht; Duplikate und Strategiekatalog entfernen |
| DUX-004 | Bot beobachtet, handelt aber noch nicht | Übersicht unterscheidet Kontext, offene Bestätigung und tatsächliche Order; unbestätigte Wirkung korrigieren |
| DUX-005 | Markt und Botzustand unterschiedlich frisch | Beobachtung zeigt beide Zeitbezüge korrekt; gemeinsame falsche „Aktuell“-Anzeige ist Fehler |
| DUX-006 | Forschungsauftrag ist unvollständig oder verliert | Quelle, Protokollbezug und passender Ergebnisstatus bleiben sichtbar; keine automatische Gewinneranzeige |
| DUX-007 | Konfiguration speichern, senden, Ablehnung empfangen | Entwurf, ausstehend und native Bestätigung/Ablehnung bleiben getrennt; kein optimistischer Erfolg ohne ACK |
| DUX-008 | Position erhält neue Regeln oder Schutzänderung | Ursprungsplan bleibt erhalten, aktueller Schutz ist belegt; keine stillschweigende Übernahme eines Entwurfs |
| DUX-009 | Hauptbereiche schnell hin und zurück wechseln | Eintritt und Austritt vollständig, neuester Zielbereich gewinnt, kein Reload und kein alter Inhalt unter neuem Titel |
| DUX-010 | Drei lokale Tabs binnen 300 ms wählen | Ein gültiger letzter Tab, keine gestapelten Inhalte oder verwaisten Requests; Fokus bleibt sinnvoll |
| DUX-011 | Accordion während Öffnung schließen und erneut öffnen | Verlauf kehrt aus aktueller Höhe um; kein Sprung, kein hängender Zwischenzustand |
| DUX-012 | Drawer per Button, Escape und Außenklick schließen | Gleiche saubere Ausfahrt, keine Restabdunklung, Fokus zurück; nicht abbrechbare Aufgaben korrekt weiterführen |
| DUX-013 | Popover/Tooltip am Rand öffnen und Auslöser entfernen | Sichtbare Position bleibt innerhalb des Viewports; Austritt und Cleanup erfolgen ohne schwebenden Rest |
| DUX-014 | Dialog mit Tastatur öffnen, bearbeiten, schließen | Fokus innerhalb der gültigen Ebene, Rückkehr korrekt, Hintergrund nicht bedienbar; Eingaben bei Abbruch nach Vertrag |
| DUX-015 | Zeile einfügen, bestätigen, entfernen, erneut empfangen | Eine Entität bleibt eine Zeile; Eintritt und Austritt ohne Sprung oder doppelten Datensatz |
| DUX-016 | Sortierung ändern, während Detail oder Eingabe offen ist | Stabile Auswahl und Bedienposition; keine automatische Umordnung unter dem Nutzer |
| DUX-017 | Gleiche Toastmeldung und neue wichtige Meldung | Duplikate zusammengefasst, geordnete Ein-/Ausblendung; wichtiger Fehler bleibt im Kontext auffindbar |
| DUX-018 | Cachetreffer, langsame Antwort, Fehler, erneuter Erfolg | Kein kurzes Ladeflackern; reservierte Fläche; vollständige weiche Übergänge in beide Richtungen |
| DUX-019 | Reduzierte Bewegung aktivieren | Räumliche Animationen reduziert, Bedienung und Zustände vollständig; keine Pflicht zu voller Fahrt |
| DUX-020 | Quote-Last und identische Heartbeats liefern | Feldweise korrekte Werte, keine erfundenen Zwischenwerte oder wiederholte Eintrittsanimation |
| DUX-021 | Während Updates Chart zoomen und Seite scrollen | Zeitbereich, Zoom, Scrollanker, Fokus und offene Details bleiben erhalten |
| DUX-022 | Nachrichten verspätet, doppelt und mit Lücke liefern | Keine Rückkehr zu älterem Zustand; Lücke und Abgleich nachvollziehbar; Journalereignisse bleiben erhalten |
| DUX-023 | Formular ändern und externe neue Konfiguration empfangen | Lokaler Entwurf bleibt erhalten, Konflikt wird benannt; kein Überschreiben oder unbemerktes Anwenden |
| DUX-024 | Verbindung unterbrechen und neu aufbauen | Letzter Stand mit Zeit bleibt sichtbar, erst bestätigter Abgleich macht Daten aktuell; keine Nullbilanz |
| DUX-025 | Alle relevanten Wege nur per Tastatur nutzen | Logische Reihenfolge, sichtbarer Fokus, keine Falle, benannte Iconaktionen; jeder fehlende Weg ist ein Befund |
| DUX-026 | Normal-, Hover-, Fokus-, Fehler- und Auswahlfarben messen | Kontrastziele und zusätzliche Zustandskennzeichnung erfüllt; tatsächlich ungeeignete Paarung korrigieren |
| DUX-027 | Viewportmatrix, Touch und 200 % Zoom prüfen | Kein verdeckter Abschluss, kein globaler Querüberlauf, bedienbare Ziele; fehlerhafter Breakpoint blockiert S34 |
| DUX-028 | Übergänge mit festem Datensatz messen und aufnehmen | Eintritt und Austritt erfüllen dokumentierte Zeitziele; Traces und Videos referenziert; Stillstände werden behoben |
| DUX-029 | Last, Burst, Hintergrundtab und Wiederkehr prüfen | Keine Aktualisierungsflut oder neue Vollanimation, aktuelle Anzeige ohne verlorene Fachereignisse |
| DUX-030 | Fünf Referenzen gegen Browseraufnahmen vergleichen | Geometrie, Hierarchie und Farben passen; Masken eng begründet; unfreigegebene sichtbare Abweichung bleibt offen |
| DUX-031 | Lange Namen, große Beträge, fehlende Daten und Sprache prüfen | Einheiten, Vorzeichen und Texte eindeutig, kein Abschneiden relevanter Inhalte oder falscher Nullwert |
| DUX-032 | Gesamten Stand zur Designabnahme vorlegen | Exakte Referenzen, Produktrevision, bekannte Ausnahmen und Prüfergebnis sind vollständig; keine pauschale Freigabe ungeprüfter Bereiche |

## 9. Übergabe und Abschluss

S30 liefert die verbindliche Referenz-/Tokenbasis. S31 setzt die vier Hauptansichten um. S32 ergänzt Einstellungen, Details und Zustände. S33 vervollständigt Eintritt, Austritt und Liveverhalten. S34 prüft responsive Bedienung, Zugänglichkeit und Leistung. S35 führt den tatsächlichen visuellen und bewegten Gesamtstand mit den Referenzen zusammen. Die Abhängigkeiten und genauen Dateiscopes bestimmt weiterhin `plan.json`.

Die Übergabe enthält Referenzhashes, Produktcommit, gemessene Viewports, Fixtureversion, Komponenten-/Tokenstand, Screenshots, kurze Ablaufvideos, relevante Traces, Ergebnisse DUX-001–DUX-032 und offene Abweichungen. Es werden nur notwendige gezielte Wiederholungen ausgeführt: ein behobener Fehler prüft seinen betroffenen Ablauf und dessen konkretes Rückfallrisiko.

Die Abnahme ist erreicht, wenn die tatsächliche Website die freigegebene Gestaltung trägt, ihre Funktionen korrekt darstellt und die geprüften Wechsel in beide Richtungen ruhig funktionieren. Weder die Konzeptbilder noch dieses Dokument behaupten, dass diese Umsetzung bereits existiert.
