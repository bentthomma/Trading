# S05 · Geld- und Orderbuch: gebundener Referenz- und Anschlussvertrag

## Umfang und Quellen

Private, unaktivierte Vorbereitung auf `84de33629ebd05b4eb28e5351334357dc6827e75`.
Keine neue Handelslogik, kein zweiter Controller und keine Produktinstallation.
S00/S01 bleiben bestanden; S02 und damit der formale S05-Start bleiben offen.
AM-002 (keine verpflichtende zweite Reviewerinstanz) bleibt unverändert.

`source-bindings.json` bindet Arbeitsbuch S.21–27, das ursprüngliche MPG05-Lehrskript
und seine Ergebnistabelle, LAB03 sowie die vorhandenen Order-/Dezimal-/Storemodule.
Das gesamte Masterarchiv wurde gelesen; nur sieben konkret verwendete Mitglieder
werden separat mitgeliefert. PDF-Seiten 25/26 wurden zusätzlich lokal gerendert.
Die ursprünglichen Platform- und S02-Quellen bleiben unverändert.

## 1. Drei verschiedene Verträge, keine stillschweigende Gleichsetzung

**MPR1** ist ein fiktives, vollständig finanziertes Long-Stück in CHF, Multiplikator 1,
Preisraster 0,01, ganze Stücke, keine Fremdwährung, Finanzierung oder Shortposition.
Der Quotevertrag muss einen Einstieg vorher zugelassen haben. Das Geldorakel berechnet
keine Signale und prüft nicht alle Einstiegszeiten. MPR1 füllt im Lehrmodell vollständig.
Die ergänzenden Teilfillfälle dieses Pakets sind separat bezeichnete Schnittstellenfälle.

**LAB03** ist ein anderes synthetisches Aktienportfolio in GE. Seine Gebühr ist ein
Fixbetrag plus Stückgebühr, je Order auf volle Cents aufgerundet. Selbst bei Fixbetrag 0
liefert seine vorhandene `commission(1)` für 0,005 pro Stück den Wert 0,01.
Zwei Ein-Stück-Fills kosten damit 0,02 statt der exakten 0,01 aus MPR1. Beide Regeln sind
unter ihrem eigenen Vertrag korrekt; LAB03 darf nicht als austauschbare MPR1-Gebühr dienen.

**Der Original-Orderkern** projiziert Mengen und Gebühren pro unveränderlicher Orderabsicht.
Er hält drei Achsen (Transport, Broker, Steuerung), aber noch kein vollständiges Kontobuch.
`reservationUnits` ist eine Menge, weder Cash noch automatisch Margin. Separate Gebühren
bleiben je Währung; unbekannte Gebühren sind nicht null. Der originale C#-Ledger ist
nur als Quellreferenz gebunden, nicht neu kompiliert oder ausgeführt.

## 2. Exakte MPR1-Kontogleichungen

Für zugelassenen Kaufpreis p, normale Stopausführung s, Stückgebühr f, Cash C und Budget B:

```
normaler Verlust pro Stück = p - s + 2*f
q_risk = floor(B / (p - s + 2*f))
q_cash = floor(C / (p + f))
q = min(q_risk, q_cash)
Cash nach Kauf = C - q*p - q*f
Equity am Bid b = Cash nach Kauf + q*b
Brutto realisiert = q*(Exitfill - p)
Netto realisiert = Brutto realisiert - Einstiegsgebühr - Ausstiegsgebühr
Endcash = C + Netto realisiert
```

Spread und Slippage sind schon in den verwendeten Fillpreisen enthalten. Eine zusätzliche
Pauschalabbuchung derselben Preiswirkung ist falsch. Interne Zwischenrundung auf Rappen
ist in MPR1 nicht vorgesehen. Python prüft mit exakten Brüchen; die zweite Rechnung
verwendet die tatsächlich vorhandenen JS-Festdezimalfunktionen, nicht Number/Float64.

Die drei Originalausgänge sind Alternativen: 36 Stück ergeben -24,48 / +46,08 / -42,48 CHF.
Sie werden nicht zu einem Tradeverlauf oder Profitfaktor zusammengesetzt. 12 CHF Cash
und 0,03 Budget ergeben 0 Stück. Kostenstress mit 0,015 je Seite ergibt bei festgehaltenen
36 Stück -25,20; vorab neu bemessen wären es 35 Stück. Das ist keine Kontoeinstellung.

## 3. Identität, Gebühren und Wiederholung

Die bestehenden S02-Felder bleiben maßgeblich: AccountRef (provider, account_id,
environment, currency, model), Deal, Cashflow, BrokerOrder, Position und InstrumentVersion.
Kein Symbolname oder pauschaler Lotfaktor ersetzt eine Instrumentenbindung.
Die Kostenkonvention muss zusätzlich festlegen, ob eine Cashflow-Kommission bereits in
Deal.commission enthalten ist. Bis eine eindeutige wirtschaftliche Charge-ID und ihre
Quellbindung existieren, darf ein solcher Beleg nicht nochmals abgebucht werden.

Transport-Event-ID und Deal-ID haben unterschiedliche Deduplizierungsaufgaben.
Anders benannte Callbacks derselben unveränderten Deal-ID erzeugen keine zweite Position
und keine zweite Gebühr. Ein widersprüchlicher Deal bleibt als Kontokonflikt gesperrt.
Cancel-Anfrage, Cancel-ACK, bestätigtes ungefülltes Restende und Positionsschluss bleiben
getrennt. Ein späterer Fill darf nicht allein wegen der Reihenfolge der Nachrichten verschwinden.

**Nachgewiesene Lücke S05-GAP-01:** Kommt `DEAL_COST_CONFIRMED` vor dem zugehörigen Fill,
speichert der Originalkern einen Vorfall und den Ereignishash, aber nicht den Gebührenpayload
als später verarbeitbaren Beleg. Nach dem Fill wird dieselbe Ereignis-ID deshalb als bereits
verarbeitet ignoriert. Die Gebühr bleibt ausdrücklich unbekannt. Das überlebt eine Speicherung
mit Original-Store und erneutes Lesen in einem zweiten Node-Prozess. Mit anderer Event-ID kann
die Gebühr nachgetragen werden, aber der frühere Vorfall bleibt bestehen. Ein künstliches
Umbenennen ist **keine empfohlene Reparatur**. Benötigt wird ein versionierter, dauerhafter
Abgleich der ursprünglichen ungeklärten Gebührenbelege, einschließlich Konflikten und Retention.
Dieses Paket reproduziert die Lücke; es verändert sie nicht durch eine neue Nebenarchitektur.

## 4. S02-Anschlusslücken ohne Vertragsabschwächung

* S02-Deal verlangt eine Geldkommission, der alte Reducer erlaubt `fee=null`. Unbekannt darf
  nicht mit `0` übersetzt werden. Beobachtung quarantänisieren oder expliziten zukünftigen
  Vertrag ergänzen; aktuelle S02-Schemata werden hier nicht gelockert.
* S02-Zeitstempel haben sechs Dezimalstellen, der alte Reducer drei. Eine verlustbehaftete
  Kürzung ist kein C01-Nachweis; Originalzeit und versionsgebundene Darstellung erhalten.
* Der alte Origin trägt weder Kontowährung noch Kontomodell. Bei einer späteren Adapterbindung
  müssen diese Dimensionen außerhalb der alten Projektion ausdrücklich erhalten und geprüft werden.
* Unbekannte Kosten/FX/Spezifikation sperren bestätigte Geldresultate, nicht die Speicherung
  tatsächlich beobachteter Rohereignisse.

## 5. Nachweisgrenzen

Die SQLite-Tests speichern geprüfte Zustandsobjekte über den vorhandenen Store und lesen sie
in einem zweiten Prozess. Das ist ein ausgeführter Persistenz-/Kompatibilitätstest, aber keine
bereits bestehende komplette S05-Integration und kein Crash während eines echten Brokeraufrufs.
Es gibt keinen Sender, keine Brokeranbindung, keinen neuen Kontowriter, keine Orderbefugnis.
C01/C04 sind im eng definierten Lehrfall belegt. C02/C03 sind für den vorhandenen Reducer
teilweise belegt; der gesamte S05-Produktabschluss bleibt offen.

## 6. Nächster konkreter Anschluss

Bestehenden Original-Orderkern gezielt um verzögert zuordenbare Gebührenbelege ergänzen:
vor Änderung gespeichertes Zustandsformat, Migration, Konfliktbehandlung, Event- und
Dealkennung sowie Retention abgleichen. Dann exakt diese Gegenfälle erneut prüfen.
Kein neues Ledger parallel zu den gebundenen Originalmodulen. End-to-End/native Parität
und die S02-/AM-003-Aktivierung bleiben eigenständige spätere Nachweise.
