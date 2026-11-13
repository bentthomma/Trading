# ExtremeLab · S01 LiveEncodingFix – technischer Bericht

13. November 2026. Privater, nicht integrierter Quellenfehler-Vorschlag.

## Ergebnis und Abgrenzung

Keine neue Produktionsdatei: **38/59 vollständig, 21 fehlen**. Vier Originalarchive
mit insgesamt122 regulären Dateieinträgen wurden auf vollständige Byteübereinstimmung
mit den fehlenden21 Source-IDs geprüft; kein Treffer. Die Vercel-Anbindung liefert
für den erneut gezielt gelesenen Skinbuilder weiterhin einen gekürzten Inhalt.
Die Suche war partiell, nicht sämtliche Ablagen umfassend.

Statt die abgeschlossene1.2.1-Stufe wiederholt zu prüfen, wurde die bereits in
EndpointRecovery belegte Abweichung HTTP-ENCODING-Q0 am vorhandenen Live-Handler
weiterbearbeitet. Der Originalcode ist **unverändert** unter
`baseline/vercel_recovered/src/api/live.js` gesichert. Nur eine separate private
Fassung in `proposals/live-encoding/src/api/live.js` wurde verändert.

## Originalfehler, Gegenprüfung und echte HTTP-Grenze

Der Originalhandler prüft lediglich ein Wortmuster für «gzip» und eine Größen-
schwelle. Er sendet damit bei großen Antworten gzip trotz `gzip;q=0`. Er erkennt
auch `not-gzip` als Treffer und übersieht großgeschriebenes `GZIP`. Bei kleinen
Antworten ignoriert er die ausdrückliche Ablehnung unkomprimierter Daten. Bereits
gesetzte Vary-Felder werden im gzip-Fall überschrieben.

Die neuen Tests starten **Node http.Server und http.request** über einen
temporären Unix-Domain-Socket. Headerparser, Antwortobjekt, Datenübertragung,
Kompression und Dekompression sind echt, nicht nachgebaut. Das ursprüngliche
Security-Modul wird bytegleich geladen; Sitzungsschlüssel und Nachrichten sind
ausschließlich synthetisch. Nur `relayRequest` ersetzt die nicht vorhandene
Originalabhängigkeit. Es wird kein wirklicher Relay-, Speicher- oder Kontodienst
angesprochen. ESM-Laden erfolgt im Node-vm-Modulraum ohne Änderung der getesteten
Handlerbytes; kein Vercel-Bundler-/Hostingnachweis.

Die unveränderte Originaldatei besteht2 der18 neuen Methoden und verletzt16 des
erweiterten vorgeschlagenen Vertrags. Das sind **nicht16 neu gefundene unabhängige
Sicherheitslücken**: Einige Methoden prüfen bewusst neu gewählte Fehlerbehandlung
und Vary-Regeln. Baselinefehler bleiben erwartete Gegenbelege, keine positiven
Abnahmeergebnisse. Der q=0-Fehler ist im aktuellen Lauf erneut an echten HTTP-
Antworten reproduziert, nicht nur aus einem historischen Bericht übernommen.

## Begrenzte Korrektur

Die vorhandene Handlerdatei bekommt einen lokalen Accept-Encoding-Parser und
eine Vary-Zusammenführung. Explizite Einträge haben Vorrang vor Wildcards.
Ausgeschlossene Kodierungen werden nicht gewählt; kleine gzip-only-Antworten
werden ebenfalls komprimiert. Die4096-Byte-Schwelle entscheidet nur bei gleichen
Präferenzen. Content-Length misst weiterhin die tatsächlich übertragenen Bytes,
inklusive UTF-8 und gzip. Große String-IDs und JSON-Daten bleiben unverändert.

Authentisierung, Methodensperre, Relayparameter und Fehlerredaktion bleiben
erhalten. Unzulässige Anfragen erreichen den Relay nicht. Unterschiedliche
Kodierungswünsche paralleler Anfragen beeinflussen sich nicht. Vary behält
bereits vorhandene Werte und den Stern, statt sie pauschal zu ersetzen.

Normative Basis: RFC9110 §§5.6.1,8.4.1.3,12.4.2,12.5.3,12.5.5,
https://www.rfc-editor.org/rfc/rfc9110.html (gelesen13.11.2026).
Insbesondere ist q=0 ein Ausschluss. Die folgenden Entscheidungen sind dagegen
**lokale Vorschlagsregeln, keine zwingende RFC-Vorgabe**:

- Ohne Header bleibt die Antwort unkomprimiert; implizite identity-Präferenz1.
- Widersprüchliche doppelte Kodierungseinträge erhalten das kleinste Gewicht.
- Fehlerhafte Syntax wird nach Authentisierung/Methodenprüfung mit leerem400
  abgelehnt; ohne akzeptable Darstellung folgt ein leeres406.
-401/405 behalten Vorrang. Ist keine Darstellung zulässig, bleibt auch ihr Body
  leer. Bestehende Frontend-Fehlerverarbeitung muss bei späterer Integration gegen
  diese leeren Antworten geprüft werden. Der vollständige finale Client fehlt.

Keine zusätzliche Dependency, kein generischer HTTP-Server-Ersatz, kein Eingriff
in Strategien oder Handelsentscheidungen. Synchrones gzip und die vorgelagerte
Antwortgrößen-/Lastgrenze wurden nicht durch eine neue Plattformlösung ersetzt.

## Quellenbindung und Änderungsumfang

Vorgängerarchiv SHA256:
`ad0e0b5fa25c68f62a4872680804193ae420399d84748be900c1263b933f8326`.
Original-Live-Datei SHA256:
`f57f31f122dfd980ba3dfbc7b6fe935c28ea1ad1fae4fc605ef817ed0f6baac2`.
Vorschlag SHA256:
`e4c0e4f238e2ce4585f3b9cf0fa74f1530e5179378f83c4e1181bc49d11d713f`.

Alle38 Originalinputs, ihr Quellenkatalog, Masterplan und Gatecheckpoint bleiben
bytegleich. Acht vorhandene Berichts-/Inventardateien werden fortgeschrieben; ihre
alten Bytes sowie das vorherige Manifest bleiben im Checkpoint. Alle258 früheren
Dateien lassen sich damit rekonstruieren. Der neue Patch wird im Test mit dem
echten patch-Werkzeug vorwärts und rückwärts auf einer Wegwerfkopie angewendet.
Er darf nicht ungeprüft auf einen späteren/neuen Originalstand übertragen werden.

Die Änderung liegt außerhalb einer aktivierten Produktintegration: weder der
kanonische Plan noch sein erlaubter Dateibereich oder die Freigabegates werden
erweitert. Der Vorschlag ist nur eine private technische Vorbereitung.

## Tatsächlicher Prüfumfang

Aktueller Runner prüft18 native HTTP-Methoden,9 unveränderte Security-Methoden
und20 relevante Inventarmethoden. Das ergibt49 unterschiedliche Methoden.
Die18 Baseline-Gegenmethoden,3 Verhaltensmutationen,3 Paketmanipulationen und
der Patch-Rundlauf werden separat geführt und nicht zur49 addiert.

Die Mutationen ändern das echte Vorschlagsmodul und aktualisieren absichtlich
seine Testhashbindung. Damit müssen Assertions am Verhalten scheitern, nicht
nur am unpassenden Quellhash: q=0-Ausschluss, Erhalt von Vary und gzip-only bei
kleinen Antworten. Die Originaldateien werden niemals mutiert.

Ein Kernel-Probeversuch bestätigt EPERM für IPv4, IPv6 und Packet-Sockets bei
funktionierender Unix-Socketkommunikation. Die Sperre gilt für Testkindprozesse;
keine allgemeine Sicherheits-, Mehrhost- oder Produktionssandboxabnahme.

Historische Node24-/Bot-/RemoteView-Zahlen sind nicht neu ausgeführt. Dieser Lauf
verwendet Linux, Python3.13.5, Node22.16.0. Maßgebliche tatsächliche Vorpack- und
Endresultate liegen im separat gelieferten execution.json/Abschlussbeleg.

## Weiterhin offen

21 vollständige Inputs fehlen, insbesondere Relay, Overlay und Skin. Es gibt
keinen kompletten Websitebuild, finalen Skinreader, Browser-/Vercel- oder
Brokernachweis. Auch mit korrekter HTTP-Aushandlung ist der native Import des
Originalhandlers ohne `lib/relay.mjs` nicht möglich.

Nächster sinnvoller Schritt bei neuen Quellen: Original-Relay und finalen Client
hashbinden und den bestehenden Vertrag gegen echte Antwortformen, insbesondere
400/406 ohne Body, prüfen. Vor Integration sind die exakten Patchbytes und die
lokalen Verhandlungsregeln unabhängig zu prüfen. Ohne neue Quellen oder begründete
Fehlerhypothese keine Wiederholung dieser abgeschlossenen HTTP-Tests als Fortschritt.

GitHub wurde nur gelesen: Initialcommit1a5cfe9d3139276f5432c79a8ee0be1938b7066c,
vollständiger Baum nur README. Keine öffentlichen Schreibaktionen, keine
Installation, Kontoverbindung oder Brokeraktion. Formale S00/S01-Status unverändert.
