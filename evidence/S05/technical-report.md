# ExtremeLab · S05 – exakte Kontoreferenz und vorhandener Orderkern

## Ergebnis

Die vier S05-Lieferdateien sind als unaktivierte Vorbereitung vorhanden: `ledger-contract.md`,
`golden-ledger.json`, `order-state-machine.json` und `reconciliation-tests.json`.
Der neue numerische Referenzprüfer rechnet exakt mit Brüchen und wird mit den tatsächlich
vorhandenen JavaScript-Dezimalfunktionen verglichen. Die Ordertests verwenden den Originalkern,
keinen nachgebauten Controller. Produktquelle, Schema, Masterplan und Fortschrittsstatus bleiben
unverändert. S05 wird nicht als vollständiges Produkt freigegeben.

Basis: `84de33629ebd05b4eb28e5351334357dc6827e75`, Masterplan 1.2.0 mit
SHA-256 `bdf130088d8a8fe57b69c88f39b7234460bda3dc363d2e3d8a8ff3a2521466c5`.
S00/S01 sind bestanden. S02 bleibt blockiert; S03/S04/S05/S07 bleiben formal pending.

## 1. Tatsächliche Quellen

Die erhaltene ursprüngliche Plattform 0.9.7 besitzt bereits `core/planning/order-lifecycle.mjs`
und exakte Dezimaloperationen. Der Mengenreducer wird deshalb direkt importiert. Seine
vollständigen ursprünglichen 41 Ordertests werden unverändert ausgeführt. Der vorhandene
SQLite-Store wird für den Speicher-/Zweitprozessvergleich verwendet, nicht durch eine
Datenbankattrappe ersetzt. Dies verdrahtet noch keinen produktiven Account-Ledger.

MPR1 stammt aus dem Arbeitsbuch 1.0, Seiten 21–27, insbesondere MP06/MPW06. Die gedruckten
Gleichungen wurden anhand des PDFs gelesen; Seiten 25 und 26 lokal gerendert. Die originale
MPG05-Ergebnistabelle und das ursprüngliche Lehrskript sind zusätzlich aus dem hashgebundenen
Master-Arbeitsarchiv erhalten. Sie sind ein Lehrbeispiel, keine Marktperformance.

Sieben tatsächlich verwendete Mastermitglieder sind im privaten Quellen-Teilarchiv erhalten.
Die MPR1-PDF wird unverändert beigelegt. Alle Hashes einschließlich der S02-Vertragsfelder
stehen in `source-bindings.json`. Es werden keine Fonts, Zugangsdaten oder neuen Kontodaten ergänzt.

## 2. Exakte Zahlen, keine zusätzliche Gebührenabbuchung

| Separater Lehrfall | Stücke | Netto CHF | Endcash CHF |
|---|---:|---:|---:|
| Normaler Stop | 36 | -24,48 | 9.975,52 |
| Ziel | 36 | +46,08 | 10.046,08 |
| Gap | 36 | -42,48 | 9.957,52 |
| 12 CHF Cash / 0,03 Lehrbudget | 0 | 0 | 12 |
| Höhere vorher bekannte Gebühr 0,015 je Seite | 35 | -24,50 | 9.975,50 |
| Dieselbe höhere Gebühr, bereits festgehaltene 36 Stück | 36 | -25,20 | 9.974,80 |

Die ersten drei Pfade sind Alternativen derselben Anfangsposition. Ihre Summierung zu einer
angeblichen Ergebnisserie oder einem Profitfaktor wäre falsch. Kaufpreis 100,25 enthält die
modellierte Kaufslippage; Stop-/Ziel-/Gapfills enthalten die jeweiligen Modellkosten im Preis.
Nur die getrennte Stückgebühr wird zusätzlich gebucht. Anfangscash 10.000, Budget 25,
Gebühr 0,005 pro Stück/Seite ergeben 36 Stück, 6.390,82 Restcash und 9.998,74 Equity am Bid100,22.
Python-Fraction und die originalen JavaScript-Festdezimalfunktionen ergeben für alle sechs
Fälle dieselben exakten Zeichenketten. Es werden keine tolerierten Floatfehler als exakte
Gleichheit ausgegeben.

## 3. LAB03 ist kein austauschbarer MPR1-Gebührenrechner

Der tatsächlich ausgeführte LAB03-Originalcode rundet jede Orderkommission auf ganze Cents auf.
Mit Fixgebühr0 und Stückgebühr0,005 kostet ein einzelnes Stück0,01; zwei einzelne Ausführungen
kosten0,02. Ein gemeinsamer Zweistück-Fill kostet0,01. MPR1 verlangt dagegen keine Rappen-
Zwischenrundung: ein Stück0,005, zwei getrennte Stücke zusammen0,01. Das ist ein Unterschied
zweier ausdrücklich verschiedener Lehrverträge, kein Fehler der ursprünglichen LAB03-Regel.
LAB03-Portfolioergebnisse wurden in diesem Lauf nicht neu simuliert oder optimiert.

## 4. Originalverhalten: Mengen stabil, Gebührenreihenfolge noch offen

Die 15 neuen Methoden prüfen den vorhandenen Orderkern mit synthetischen Meldungen.
12 ausgeführte von36 angeforderten Stück lassen24 reservierte Einheiten, keine24 CHF.
Zwei Fills mit12 und6 Einheiten, Restcancel18 und Teilclose3 führen zu15 offenen Einheiten.
Alle24 Reihenfolgen dieser vier wirtschaftlichen Belege ergeben dieselben Mengen und
Gebühren; Wiederholungen erhöhen sie nicht. Widersprüchliche Deal-IDs und fremde Kontoumgebungen
bleiben gesperrt. Währungen werden nicht ohne FX-Beleg zu einem Betrag addiert.

**S05-GAP-01 ist am unveränderten Original reproduziert:**

1. `DEAL_COST_CONFIRMED` trifft vor dem zugehörigen Fill ein.
2. Der Reducer legt `DEAL_COST_WITHOUT_EXECUTION` sowie den Hash der Event-ID ab.
3. Der spätere Fill ohne Gebührenbetrag wird korrekt aufgenommen; seine Gebühr bleibt unbekannt.
4. Die Wiederholung exakt derselben Gebührenmeldung trifft auf den gespeicherten Hash und
   wird als Duplikat übersprungen. Der Betrag wird nicht nachgetragen.

Eine Speicherung mit originalem Store und Lesen in einem zweiten Node-Prozess bewahrt diese
Lücke. Ein anders benanntes Kostenevent kann den Betrag später zuordnen, beseitigt jedoch den
früheren Vorfall nicht. Ein künstliches Umbenennen ist keine freigegebene Reparatur.

Wichtig: Die Gebühr wird sichtbar als unbekannt geführt, nicht fälschlich als bestätigte Null.
Ein tatsächlicher finanzieller Schaden oder ein Brokerfehler wurde nicht nachgewiesen.
Die drei zugehörigen bestandenen Charakterisierungstests bestätigen die **offene** Lücke,
nicht deren Behebung. Eine dauerhafte Nachverarbeitung muss im bestehenden Zustands-/Journal-
vertrag einschließlich Migration, Konflikten und Retention geplant und gezielt geprüft werden.

## 5. Wiederanlauf und noch fehlende Produktverbindung

Vier neue Methoden verwenden echte SQLite-Dateien und einen zweiten Node-Prozess, um gespeicherte
Originalzustände neu zu lesen. Dealwiederholung zählt nicht doppelt. Unklare Sendefolge behält
Operation-ID und Reservierung; eine nachträgliche Freigabe oder Ersatzoperation wird abgewiesen.

Es wurde dabei **kein echter Auftrag gesendet**. Die Tests benutzen Store.set/get in einer
benannten Testkomposition und beweisen nicht, dass bereits ein vollständiger Account-Cashwriter
an einen nativen Sender angeschlossen wäre. Weder Crash-in-Dispatch noch Stromausfall oder
C#-Ausführung werden behauptet. Der originale C#-Ledger ist nur als Quellreferenz gebunden.

S02 enthält weitere Pflichtdimensionen (Kontowährung/-modell, Instrumentversion, sechsstellige
UTC-Zeiten), die der alte Orderorigin nicht vollständig trägt. Unbekannte Legacygebühren dürfen
nicht für S02-Deal in Null umgewandelt werden. Eine gesonderte Cashflow-Kommission braucht eine
Identitätsbindung, damit dieselbe Dealgebühr nicht noch einmal abgebucht wird. Kontoweite FX-,
Finanzierungs-, Dividenden- und Netto-Tradeabrechnung sind hier noch nicht implementiert.

## 6. Ausgeführte Prüfungen und kritische Nachprüfung

Vorbereitend:20 numerische/Schema-Methoden,5 Quellenmethoden,15 Originalkern-Grenzmethoden und41
unveränderte originale Orderregressionen =81 unterschiedliche Methoden. Von den neuen Methoden
sind drei bewusste Charakterisierungen der ungelösten Gebührenreihenfolge. Die24 Reihenfolgen,
sechs Zahlenfälle, drei fehlerhaften Rechenvarianten und Paketmanipulationen werden nicht addiert.

Die Gegenprüfungen erkennen die absichtliche Verwendung nur einer Gebührenseite, unzulässiges
Aufrunden der Stückzahl und doppelte Kaufgebühr. Ein eigener Nachprüfpunkt wurde berichtigt:
Der Runner darf Quellenpfade nicht vor der Symlinkprüfung auflösen, sonst würde die
Quellfunktion anders reagieren als der tatsächliche Kommandozeilenweg. Der Endrunner erhält
die absolute Originalpfadangabe bis zur Typ-/Hashprüfung. Originalquellen wurden nicht verändert.

Die maßgebliche Endprüfung erfolgt erst nach ZIP-Erzeugung, frischer Entpackung und unter einem
Benutzer ohne Administratorrechte. Netzwerkverbindungen sind über den vorhandenen geprüften
seccomp-Guard gesperrt; echte EPERM-Probe und vollständige Befehle liegen im externen Receipt.
Keine unveränderte S07-Gesamtprüfung und kein40-Millionen-Tickscan werden hier erneut ausgeführt.

## 7. Konkrete Fortsetzung

Nächstes zusammenhängendes Paket: S05-GAP-01 am vorhandenen Original-Orderkern beheben, ohne
zweites Ledger. Vor der Änderung den dauerhaften Umgang mit vorzeitig eintreffenden Kosten,
Belegkonflikten und älteren gespeicherten Zuständen festlegen; anschließend die jetzt vorhandenen
Originalfälle, Neustart und Retention ausführen. Die MPR1-Kontogleichungen müssen dafür nicht
neu erfunden werden. Formale S02-/S05-Abnahme und native Brokerparität bleiben separat.
