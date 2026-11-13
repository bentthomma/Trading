# ExtremeLab · S05 – dauerhafte Gebührenzuordnung im vorhandenen Orderkern

## Ergebnis

S05-GAP-01 ist im separaten privaten Reducer-Kandidaten korrigiert. Eine Gebührenmeldung
vor dem zugehörigen Fill oder Close bleibt erhalten und wird beim späteren Deal ohne
erneuten Gebührenaufruf zugeordnet. Kostenkonflikte, fehlende Altbelege und inkompatible
Zustände werden nicht durch Nullbeträge oder automatische Freigaben verborgen.

Basisrevision: `90a8a8b81679ec786832ea6d846d6af2183ae329`.
Eingangsarchiv SHA-256: `30ad63852d60954a369bd3763fe3266a426477ad042755ff04d281ae3fd4ded4`.
Unverändertes Originalmodul SHA-256:
`fc5c5c82f2b6dcdc73dba863a8abde35fd86728ea8261970cb375b934c2650d4`.
Kandidaten-/Patch-/Runnerhashes stehen in `source-bindings.json`; die konkrete Endrevision
und die frische Endausführung werden außen im Paket gebunden, nicht rückwirkend erfunden.

## Tatsächliche Änderung

Genau eine private Kopie von `core/planning/order-lifecycle.mjs`. Der vorhandene Reducer,
seine Identitätskontrollen, exakte Dezimalfunktionen und der originale SQLite-Store werden
weiterverwendet. Keine neue Datenbank, Tabelle oder Handelssteuerung. Der versionierte
Orderzustand 2 speichert Kostenbelege und die ursprüngliche Gebührenbasis im selben Snapshot.
Die alte Archivquelle bleibt unverändert. Die Zustandsversion ist nicht die SQLite-
Schemaversion; letzteres wurde nicht verändert.

Vor-/Nachlieferung desselben bestätigten Betrags konvergiert. Eine andere Callback-ID
kann denselben Deal nicht ein zweites Mal belasten. Die Testfälle umfassen Eintritts- und
Schließungsgebühren, Teilfills, terminale Meldungen, Gegenwährungen, Nullgebühren, Erstattungen
und 18-stellige Nachkommabeträge. 120 Zustellreihenfolgen in einer Methode liefern dieselbe
wirtschaftliche Projektion. Diese Permutationen zählen nicht als 120 zusätzliche Tests.

Mehrdeutige Beträge werden nicht nach Eingangsreihenfolge ausgewählt. Ursprünglich
unbekannte Beträge bleiben dann unbekannt; ein ursprünglich bekannter Ausführungsbetrag
bleibt als solcher erhalten, jedoch mit sichtbarem Kontokonflikt. Andere Sperren werden
nicht gelöscht. Ein Kostenbeleg allein erzeugt weder Fill noch Brokerakzeptanz oder Autorität.

## Upgrade und Originalgrenze

Alte v1-Snapshots bleiben lesbar, benötigen vor Veränderung aber ein ausdrückliches Upgrade.
Alte bekannte Werte erhalten den Herkunftsmarker `legacy_snapshot`. Fehlende historische
Gebührenpayloads können nicht aus ihren Hashes rekonstruiert werden: Die Lücke bleibt
nach dem Upgrade ausdrücklich offen. Ein gesonderter Replay der tatsächlichen vollständigen
Rohereignisse kann den Verlauf neu aufbauen, ist aber kein automatisches Heilungsversprechen.
Der alte Reader weist neue v2-Zustände zurück. Kein stilles Down-/Upgrade.

Die alte `order-state-machine.json`, der ursprüngliche Quellenprüfer und die historischen
GAP-Charakterisierungen beziehen sich weiter auf das unmodifizierte Original. Ihr `fixed:false`
ist kein widersprüchlicher aktueller Kandidatenstatus. Die zentrale S05-Übergabe und
Kriterienübersicht verweisen jetzt ausdrücklich auf diesen Kandidaten und seine Grenzen.

## Persistenz, Prozessabbruch und Retention

Die Tests benutzen echte SQLite-Dateien, ursprüngliche `Store.transaction`, `Store.set/get`
und einen zweiten Node-Prozess. Ein absichtlicher Fehler vor Commit rollt Snapshot und
Auditeintrag gemeinsam zurück. Zwei weitere Kindprozesse werden unmittelbar vor/nach Commit
mit SIGKILL beendet: gespeichert ist jeweils genau der alte oder neue Zustand. Nach Retry
bleibt genau eine wirtschaftliche Gebühr. Kein Brokeraufruf findet statt.

Ein vorgezogener Sequenzcursor löst die echte Eventretention aus: Der alte Auditdatensatz
wird gelöscht, der noch benötigte Gebührenbeleg im KV-Snapshot bleibt erhalten. Das ist
keine simulierte Datenbank, aber auch kein Stromausfall-, Langzeit- oder Windowsnachweis.
Datenbank-Rollback und ein bösartiger Host mit vollständiger Schreibkontrolle liegen außerhalb
der Integritätsgarantie. Speicherbudgets werden nicht durch stilles Abschneiden eingehalten.

## Kritische Nachprüfung und Korrekturen im eigenen Entwurf

Die erste neue Prüfung fand eine Lücke: Ein manipuliertes abgeleitetes Dealgebührenfeld
konnte beim Lesen still neu projiziert werden, wenn sein alter Dealhash angepasst war.
Der finale Validator vergleicht deshalb auch die einzelnen projizierten Fill-/Close-
Datensätze mit den gespeicherten Werten, nicht nur Gesamtsummen. Der Gegenfall besteht nun.
Zusätzlich werden fehlende Empfangshashes und nachgestellte Gebühren-Zeilenumbrüche
abgewiesen; unaufgelöste Belegkonflikte können nicht durch Editieren ihrer Flags verschwinden.
Die ursprünglichen Quellen und Tests sind dafür nicht gelockert worden.

Ein erster Runner-Versuch erreichte das Werkzeugzeitlimit, weil die Dateibaumprüfung unnötig
pro Datei wiederholt wurde. Der Check berechnet den Snapshot jetzt einmal. Danach wurde eine
falsche Runner-Erwartung an den Node-Auswahlzähler korrigiert: Node22 meldet für die Auswahl
12 ausgeführte Methoden, nicht zusätzlich drei 'skipped'. Beide Vorbereitungsstände werden
als solche aufbewahrt und sind keine bestandenen Endläufe oder Produktfehler.

Der echte Git-Scopeprüfer erkannte eine zunächst mitgeführte vollständige Modulkopie als
Berührung ihrer Originalquelle außerhalb des erlaubten S05-Bereichs. Diese Kopie ist aus
dem endgültigen Repositorydiff entfernt. Geliefert wird nur der exakte Patch; die vollständige
Datei entsteht im Test kontrolliert im Wegwerf-Originalbaum. Ihr Hash bleibt gebunden.
Collector, Pfadregeln und Originalquelle wurden nicht verändert. Die verworfene erste
Kandidatenfassung bleibt als lokaler Git-Zwischenstand nachvollziehbar.

## Prüfumfang

Vorbereitend: 38 neue Verhaltensmethoden, 41 unveränderte ursprüngliche Ordertests,
12 relevante Vorgänger-Grenztests und 25 unveränderte S05-Rechen-/Schema-/Quellenmethoden,
zusammen 116 unterschiedliche Methoden. Drei davon sind ausschließlich statische S02-
Schemaabgleiche, keine C#-Ausführung. Drei historische reine GAP-Charakterisierungen werden
nicht als erwartetes Verhalten des korrigierten Kandidaten verwendet. Stattdessen scheitern
identische neue Korrektheitsassertionen gezielt dreimal am unmodifizierten Original.

Drei Mutationen entfernen Kostenpersistenz, Konfliktbehandlung oder den verstärkten
Einzeldealabgleich; die konkreten Tests erkennen alle. Die Vorwärts-/Rückwärtsanwendung des
Ein-Dateien-Patches verwendet das echte Git-Patchwerkzeug und stellt das Original exakt her.
Frische Endpaketzähler, Befehle, Exitcodes und Loghashes stehen im separaten Prüfbeleg.
Keine historischen 81/63/42/115-Testzahlen werden zu diesem Lauf addiert.

## Restarbeit und nächste sinnvolle Fortsetzung

Das gesamte Kontobuch ist nicht fertig integriert. Kontoweite Cashflows, bestätigte
Cash-/FX-Salden, Gebührenarten/Belastungsidentitäten, native Ausführung und die produktive
Writertransaktion sind weiterhin eigene Anschlüsse. Die Version-2-Felder müssen beim
späteren Adapter-/Writeranschluss übernommen werden; kein aktuelles C#-Pendant wird behauptet.

Nächster unabhängiger Block ist der vorhandene Journal-/Restore-Abgleich (S06-Vorarbeit):
Welche Snapshot-, Export-, Backup- und Restorepfade tragen den vollständigen v2-Zustand und
welche können ihn kürzen oder auf einen älteren Zeitpunkt zurücksetzen? An tatsächlichen
vorhandenen Quellen prüfen, Kostenbeleg- und Ursprungserhalt einbeziehen, keine zweite
Restore-Authority aufbauen. Bei fehlender konkreter Verbindung eine Integrationslücke
benennen; keine zusätzlichen Brokerrechte aus einer erfolgreichen Wiederherstellung ableiten.

Masterplan1.2.0, S00/S01 und offizielle Status unverändert. Keine Reviewerpflicht,
keine Installation, keine Veröffentlichung, keine Konto-/Brokeraktion.
