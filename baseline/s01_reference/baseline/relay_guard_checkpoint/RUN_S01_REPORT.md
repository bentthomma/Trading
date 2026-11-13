# ExtremeLab · S01 RelaySnapshotGuard – technischer Bericht

13. November 2026 · privater, nicht integrierter Ein-Dateien-Vorschlag

## Ergebnis und Quellenabgrenzung

Die Quellenbeschaffung lieferte keine zusätzlichen vollständigen Produktions-
inputs: **38 von 59 vorhanden, 21 fehlen**. Der authentisierte JavaScript-Relay-
Abruf ist weiterhin gekürzt. Öffentliche statische Abrufe waren in dieser
Umgebung nicht erfolgreich; die Bibliothekssuche war partiell. Die vollständige
Websitepipeline und der finale Skin-Client bleiben blockierte Fähigkeiten.

Statt identische Präfixabrufe oder die fertige Encodingprüfung zu wiederholen,
wurde eine konkret begründete Fehlerhypothese am **vorhandenen Original-Python-
Relay** geprüft. Seine tatsächliche Version ist `1.3.3-qa`, enthalten im früheren
Engine-1.2.1-Archiv. Der ältere LiveBridge-1.3.2-Relay besitzt andere Bytes; er wurde
nicht anstelle des neueren Originals eingesetzt. Seine 24 unveränderten
StorageTests dienen als relevante Rückwärtsregressionen, nicht als Freigabe.

## Reproduzierter Originalfehler

Der originale WebSocket-/Journalpfad akzeptiert BARS-Nachrichten mit `data` als
Objekt, ohne `data.candles` auf einen Arraytyp zu begrenzen. Er speichert die
Nachricht und quittiert sie dauerhaft. Beim späteren `/snapshot` berechnet die
originale Projektion `len(data.get('candles', []))` und leitet Vollständigkeit nur
aus der Teilnummerierung ab.

Zwei tatsächliche native Gegenversuche gegen die unveränderten Originalbytes:

- Ein synthetisch quittierter Zahlenwert als `candles` führt beim HTTP-Snapshot
  zu **500** statt einer lesbaren Zustandsantwort (`TypeError` in der Projektion).
- Eine synthetisch quittierte Zeichenkette wird als Kerzenfolge gezählt. Die
  Anzahl entspricht ihrer Zeichenlänge; das Checkpointfeld meldet fälschlich
  **`complete=true`**.

Es handelt sich um reproduzierte lokale Fehler, nicht um beobachtete Produktions-
vorfälle. Die Originalquellen wurden nicht verändert. Die C#-Quelle im selben
Archiv erzeugt für BARS tatsächlich `bars.Skip(...).Take(...).ToArray()`; dieses
Original wurde gelesen und hashgebunden, nicht neu kompiliert oder gestartet.

## Begrenzte Korrektur am Originalpfad

Nur `Store.events` wird in einer separat abgelegten Kopie von `relay.py` geändert.
Die Projektion prüft, ob `candles` eine Liste aus Objekten ist. Fehlende Werte,
null, Boolesche Werte, Zahlen, Zeichenketten, Objekte statt Listen sowie Listen
mit Nichtobjekten erhalten einen explizit unvollständigen Checkpoint:

```
partialSnapshot: true
checkpoint.complete: false
checkpoint.completeness: "invalid_candle_payload"
checkpoint.invalidPayloadSequences: [betroffene Ereignissequenzen]
```

Nur strukturell gültige Teilpayloads tragen zur Kerzenanzahl bei. Die unveränderten
Rohereignisse bleiben im Snapshot und Journal enthalten; sie werden weder
umgeschrieben noch gelöscht. Bereits versandte Quittungen behalten ihre Semantik.
Ein neuer gültiger Checkpoint stellt den projizierten Zustand wieder her, während
die älteren Rohereignisse über die Ereignislesefunktion erhalten bleiben.

Ein leeres gültiges Array behält die vorherige Teilvollständigkeitssemantik.
Ein fehlendes `totalParts` wird bei gültigem Payload weiterhin als unbekannte
Vollständigkeit ausgegeben. Bei ungültigem Payload bleibt die Antwort auch ohne
`totalParts` ausdrücklich partiell. Dies wurde gezielt gegen eine absichtlich
entfernte Schutzbedingung geprüft.

**Neue Diagnosefelder/-werte sind ein vorgeschlagener Schnittstellenvertrag.**
Es gibt keine allgemeine OHLC-, Zeitstempel-, Wertebereichs- oder Finanzdaten-
validierung. Ein Objekt mit fachlich falschem Inhalt wird durch diesen begrenzten
Strukturtest nicht als falsch erkannt. Auch einzelne BAR-Updates erhalten hier
keine neue Schemaabnahme. Die Aufnahme ungültiger Rohdaten wird nicht unterbunden.

## Tatsächlicher Integrationsumfang

Geprüft werden der echte `Relay.app`-Router, aiohttp-WebSocket und HTTP-Client,
die originalen Authentisierungs-/Lese-/Schreibmethoden sowie echte SQLite-Dateien.
Es gibt keinen Ersatz-Relay, keine nachgebaute Datenbank, keine Fake-ACK-Logik und
keine Umgehung des HTTP-Parsers. Der Transport läuft lokal über Unix-Sockets.
Schlüssel, Runs und Ereignisse sind ausschließlich synthetisch.

Zusätzlich wird die unveränderte archivierte C#-Wirefixture tatsächlich per
WebSocket angenommen und nach erneutem Senden identisch quittiert; beide
Ereignisse bleiben byteinhaltlich erhalten. Das ist kein neuer C#-Build.
Reader-/Writertrennung, Ablehnung von Handelsbefehlen, Methoden- und Querygrenzen
werden am echten HTTP-/WebSocket-Pfad nachgeprüft.

Wiederanlauf wird über Schließen und erneutes Öffnen des realen Stores geprüft;
die gespeicherten Zeilen und Quittung bleiben gleich. Kein neuer Prozesskill,
Stromausfall, Windows-/TLS-/Cloud- oder Multihostnachweis wird daraus abgeleitet.

## Kritische Nachprüfung und verbleibende Grenzen

Die reale Bytebegrenzung wurde mit erlaubten, großen synthetischen Ereignissen
ausgelöst, ohne das Produktlimit herunterzusetzen. Das vorhandene Verhalten
bleibt erhalten: `checkpoint.complete` beschreibt die gespeicherten Teile,
`partialSnapshot=true` weist auf die gekürzte Antwort hin. **Ein wahres
Checkpointfeld allein garantiert also nicht eine vollständige Antwort.**

Die Korrektur schützt die Projektion, macht ungültige Rohereignisse aber nicht
für jeden möglichen Client konsumierbar. Vor einer Integration muss der konkrete
Verbraucher die neue Diagnose und `partialSnapshot` beachten und darf die
Rohdaten nicht ungeprüft als Array behandeln. Der vollständige finale Website-
Client und der JavaScript-Relay fehlen. Deren Integration ist nicht nachgewiesen.

Die Prüffälle entfernen drei Schutzbedingungen in temporären Kopien des echten
Vorschlags. Die gezielten Verhaltenstests müssen dann durch Assertions scheitern,
nicht bloß wegen abweichender Hashes. Ein nativer `patch`-Rundlauf bestätigt die
exakten Vorwärts- und Rückwärtsbytes. Drei beschädigte Paketkopien prüfen separat
Inhaltsänderung, Zusatzdatei und Symlink; dies ersetzt keine unabhängige Review.

## Quellenbindung und Erhaltung

Vorgänger-ZIP SHA256:
`a4e99bb549eb34e6fde1aca0b2c775c1136bf361ac0653617df29648085a133b`

Engine121-Quellarchiv SHA256:
`8baa784faa8fada648b30ff8b81d99edd21958149dbde1fd5a720459319c3c43`

Original-Python-Relay SHA256:
`62fb6b0d437b090be6dd0b1a1e2af1d72e6a794e1c7b14b19ea523a4fa583f8c`

Vorschlag SHA256:
`7882cac35c82f994d6c0725fc94ca71cce264a73cc7fcc5dfebd55abbbc62e5a`

Der neue Unterschied betrifft genau eine Produktdateikopie. Die 38 gesicherten
Websiteoriginale, ihre Kataloge, der vorige Encodingvorschlag, der Masterplan und
die offizielle Gatedatei bleiben bytegleich. Letztere enthält noch historische
Inventarzähler; sie wird nicht als aktueller Quellzähler oder als Freigabe benutzt.
Die fünf bestehenden S01-Lieferdateien erhalten einen getrennten aktuellen
Ergänzungsblock. Ihre alten Bytes bleiben im Checkpoint, ebenso alte Übergaben
und das alte Manifest. Alle 277 Vorgänger-Manifestdateien sind rekonstruierbar.

## Testzählung und tatsächliche Endbelege

19 neue Quellen-/Store-/HTTP-Methoden, 24 unveränderte Original-StorageTests und
20 bestehende Inventarmethoden ergeben **63 unterschiedliche Methoden**. Die
zwei Original-Gegenprüfungen, drei Mutationen, drei Paketmanipulationen und der
Patch-Rundlauf werden nicht zur Zahl erfolgreicher Methoden addiert. Die vorherige
Encoding-Suite, Bot-Builds, .NET und alte große Testzahlen wurden nicht erneut
als Fortschritt gezählt.

Eine frühe Inventurprüfung des noch nicht neu manifestierten Arbeitsstands
scheiterte erwartungsgemäß an der unvollständigen Dateiliste. Der Prüfcode wurde
nicht gelockert; das tatsächliche Endmanifest wird nach Fertigstellung erzeugt.
Autoritativer Nachweis ist die externe `Abschlusspruefung.json` mit den aus dem
frisch entpackten ZIP ausgeführten Protokollen. Die im Paket enthaltene Soll-
beschreibung behauptet nicht selbst eine zukünftige bestandene Endprüfung.

## Projektstatus und Fortsetzung

GitHub wurde ausschließlich lesend abgeglichen: main bleibt
`1a5cfe9d3139276f5432c79a8ee0be1938b7066c`; der vollständig gelesene Baum enthält
nur README. Keine PR-/Workflowlisten erneut abgefragt. Kein Push, keine
Installation, keine Broker-/Kontoverbindung, kein echter Handelsbot gestartet.

Nächster sinnvoller Integrationsschritt: den tatsächlichen Snapshotverbraucher
an die explizite Ungültigkeitsdiagnose binden und dessen Verhalten bei partiellen
Antworten prüfen, sobald seine vollständigen Originalbytes vorliegen. Für die
Website fehlen weiterhin genau 21 Inputs. Nicht erneut dieselben Snapshottests
oder denselben gekürzten Sourceabruf ohne neue Hypothese als Fortschritt melden.
Unabhängiges Review und gesonderte Installationsfreigabe bleiben offen; offizielle
S00-/S01-Abnahme und Masterplan bleiben unverändert.
