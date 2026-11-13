# ExtremeLab · S01 – Originaler Bot-Build- und Downloadpfad wiederhergestellt

13. November 2026 · privates Quellen-/Reproduktionspaket · keine Produktfreigabe.

## Ergebnis

Zwei bislang fehlende Produktionsinputs sind vollständig und exakt wiederhergestellt:
`src/build-bot.mjs` (3.076 Bytes) und `src/api/bot-download.js` (1.979 Bytes).
Der aktuelle Quellenkatalog enthält damit **38 von 59 Inputs**, **21 fehlen**.
Die vorherigen 36 Produktionsdateien bleiben bytegleich. Es wurde kein Ersatzreader,
kein geschätztes Bundle und keine parallele Produktimplementierung angelegt.

Die Originalquellen des Engine-1.2.1-Builders wurden mit den bereits gesicherten
Botsegmenten tatsächlich ausgeführt. Er entpackt exakt die zwölf Dateien des
Original-Enginearchivs. Der Lauf wurde dann **vor dem ersten SDK-Download bewusst
abgewiesen**. Das ist ein ausgeführter, an einer kontrollierten Grenze gescheiterter
Buildversuch, kein erfolgreich kompilierter Bot.

## 1. Ausgangsstand und Herkunft

Vorgänger: `ExtremeLab_S01_RemoteViewIntegration_Offline.zip`, SHA-256
`70a42bcc7adec76792bf19a42b38ef74d0d1371e45793c7cbb20668bfc25f036`.
231 manifestierte Vorgängerdateien wurden vor Änderungen anhand tatsächlicher Bytes
geprüft. Die veränderten früheren Metadaten, Berichte und der bisherige Inventartest
bleiben unter `baseline/remoteview_checkpoint/` erhalten. Damit ist jeder übernommene
Vorgängerpfad entweder unverändert oder anhand seines Originalcheckpoints rekonstruierbar.

Neuer Originalspender: `ExtremeLab_Release_1_2_1_Pruefung.zip`, 14.633 Bytes,
Library-Datei `file_000000004b2c8210b206fbdfb885d0a8`, SHA-256
`c7ed79c05ecfbdd1ba75e0974aa850de44d78ed265859621570d8a8dadc24c0c`.
ZIP-CRC und **11/11** Einträge seines vollständigen Inhaltsmanifests stimmen.
Das Archiv bleibt unverändert unter `baseline/original_release121_audit.zip` erhalten.

Aus den zwei dokumentierten Archivmitgliedern wird jeweils genau eine reine
`//`-Kommentarzeile entfernt. Alle übrigen Bytes bleiben erhalten. Erst der Abgleich
des vollständigen Ergebnisses mit der tatsächlich gelesenen Produktions-ID akzeptiert
die Wiederherstellung; semantische Ähnlichkeit allein genügt nicht.

| Produktionspfad | Vollständige SHA-1-Quellen-ID | SHA-256 der gesicherten Bytes |
|---|---|---|
| `src/build-bot.mjs` | `cb2628ce0d6dafe7f0a5805c23ac71df0ed1aa4b` | `8f860380eedb09dbdd75fd32bad0666ff489aef3ed65f7d674d584a92c8875a8` |
| `src/api/bot-download.js` | `6aea26a19a9f84fd97286554d44a6d564264329e` | `218ca030d075a988ed0ee260a59631efd2ac674607dd018573f44ff903dabde0` |

Beide Quellen-IDs wurden in diesem Aufruf über die lesende Vercel-Anbindung erneut
beobachtet. Provider-IDs sind hier Quellenkennungen, keine unabhängige Signatur oder
Freigabe. Vollständige Transformation und Provenienz:
`evidence/S01/S01_BOT_DELIVERY_SOURCE_BINDING.json`; reproduzierbarer Leser:
`tools/bot_delivery_sources.py`.

Vier Originalarchive wurden auf passende Quelldateien geprüft. Der Suchumfang und
negative Funde stehen in `S01_BOT_DELIVERY_ARCHIVES_SEARCHED.json`; die Suche ist
nicht über alle externen Ablagen vollständig. Der gekürzte Inhaltsconnector liefert
weiterhin keine vollständigen Overlay-/Skin-Dateien. Keine Zugriffssperre wurde
umgangen, kein neuer Share-Link erzeugt.

## 2. Originalbuilder statt Compilerattrappe

`build-bot.mjs` wird bytegleich aus dem aktuellen Produktionsquellenbestand in eine
Wegwerfkopie übernommen. Die vollständige Verkettung von `bot-src.0..2` besitzt den
im Builder fest gebundenen SHA-256
`9e919ec1a94a5c0c569d7b9f46811ae98fed92a02b74773ef12d1821a14d81a3`.
Die zwölf vom echten Builder geschriebenen `.cs`-/`.csproj`-Dateien stimmen jeweils
bytegleich mit `original_engine121_source.zip` überein.

Am ersten `curl`-Aufruf verweigert ein ausdrücklich als Verweigerer angelegtes
Testprogramm den Zugriff mit Exit125. Es liefert **weder Installer noch SDK noch
gefälschtes Buildresultat**. Zusätzlich blockiert der Linux-Netzfilter ausgehende
Verbindungs-/Sendeoperationen in sämtlichen Testkindern. Der Builder selbst endet
mit Exit1. Es entstehen keine `release-artifacts`, kein neues `.algo` und kein
Erfolgsmanifest. `dotnet` war bei der Umgebungsprüfung nicht auf PATH vorhanden.

Fehlendes Segment, vertauschte Segmente und ein verändertes Byte werden vor der
SDK-Grenze abgewiesen. Bei korrekten Quellen bleiben nach dem absichtlichen Abbruch
extrahierte Dateien im privaten Test-Tempverzeichnis zurück: Der originale Cleanup
steht nach dem erfolgreichen Build, nicht in einem `finally`. Der Testbesitzer
entfernt seine Wegwerfkopie kontrolliert. Dies ist eine Charakterisierung, keine
Produktkorrektur oder Stromausfallabnahme.

## 3. Echte Download-API und ursprüngliche Prüfungen

Das unveränderte ursprüngliche `download.test.mjs` läuft gegen die wiederhergestellten
Produktionsbytes. Die `.js`-Datei wird ausschließlich für den Testimport unverändert
als `.mjs` abgelegt. Die Security-Abhängigkeit ist zugleich bytegleich mit der im
Originalarchiv getesteten Fassung. Die **15 ursprünglichen Prüfaussagen** bestehen:
Sitzungspflicht, exakte Binärantwort, feste Dateibenennung, Prüfsumme, HEAD ohne
Binärkörper, private Cachevorgabe, ungültige/abgelaufene Signaturen, Methodensperre,
Abfragebeschränkung sowie Ablehnung fehlender oder beschädigter Artefakte.

Alle Binärinhalte sind deutlich markierte **synthetische Testbytes**, keine geladenen
Handelsbots. Es gab weder Besitzerlogin noch Cloud-/Brokerverbindung.

Sechs zusätzliche Methoden prüfen die jetzt zugänglichen Originalgrenzen:

- Ein bereits gefüllter Artefaktcache ersetzt die erforderliche Sitzung nicht.
  Fehlender Sitzungsschlüssel sowie Bearer-/Producer-Ersatzdaten werden abgewiesen.
- Falscher Dateiname, falsche Länge, falsche Prüfsumme und defektes Manifest werden
  bei einem neuen Modulimport abgewiesen.
- Ein bereits geladenes Modul liefert nach einer Dateiveränderung weiterhin seine
  vorher korrekt geprüften, zwischengespeicherten Bytes. Ein neuer Import erkennt
  die beschädigte Plattendatei. Es werden nicht nachträglich die neuen beschädigten
  Bytes als angeblich geprüft ausgegeben.
- Ein fehlgeschlagener Erstabruf wird nicht als erfolgreiches Artefakt gecacht.
  Nach Reparatur der Testdateien funktioniert ein erneuter Abruf im selben Modul.
- Der Handler prüft Dateiname/Länge/Inhaltshash, **nicht unabhängig die behauptete
  Buildherkunft**. Synthetisch geänderte `sourceSha256`-/Buildfelder werden bei
  konsistenten Dateihashes durchgereicht. Der Charakterisierungstest bestätigt diese
  vorhandene Vertrauensgrenze; er ist keine Buildattestation und keine Freigabe.

Das im neuen Archiv enthaltene historische `.algo`-Manifest bleibt historische
Metadaten. Die eigentliche Binärdatei liegt in diesem Archiv nicht bei. Weder seine
Erfolgsfelder noch frühere Binärhashes werden als neuer nativer Build ausgegeben.

## 4. Relevante Regressionen und kritische Nachprüfung

Vorverpackung: **33 unterschiedliche Methoden** bestanden (7 neue Quellen-/Builder-,
6 neue Download-Grenzmethoden, 20 relevante Inventarmethoden). Die 15 ursprünglichen
Prüfaussagen sind separat gezählt, nicht als 15 zusätzliche Testmethoden.

Die bisherige Inventarmethode wurde ausschließlich von 36/23 auf 38/21 aktualisiert;
ihre Originalbytes bleiben im Checkpoint. Sie prüft weiterhin alle 59 eindeutigen
Pfade, jeden vollständigen SHA-1-/SHA-256-Inhalt und die Abwesenheit fehlender Dateien.
Die übrigen 19 Inventarmethoden bleiben unverändert. Alte RemoteView-, Addon- und
Endpoint-Prüfzahlen werden nicht zu diesem Lauf addiert.

Zwei gezielte Mutationen in Wegwerfkopien (entfernte Sitzungspflicht bzw. entfernte
Inhaltsprüfsumme) werden von Verhaltensassertionen erkannt. Drei Paketmanipulationen
(veränderte Quelldatei, Zusatzdatei, Symlink) werden vom vorhandenen Paketprüfer mit
den passenden Ablehnungsgründen abgewiesen. Diese Gegenproben erhöhen die33 nicht.

Während der Vorbereitung scheiterte ein Metadaten-Abgleich zunächst an einem noch
nicht vorhandenen Pfadeintrag; die angefangenen Metadaten wurden aus dem Checkpoint
zurückgesetzt und korrekt ergänzt. Ein erster Gesamtrunner scheiterte nach den
bestandenen Verhaltenstests am standardmäßig anders formatierten Node-Testreport.
Explizites TAP-Format korrigiert den Runner. Der anschließend vollständig ausgeführte
Vorverpackungslauf endet mit Exit0. Der unterbrochene erste Lauf wird nicht als
bestandener Gesamtlauf gezählt.

**Maßgeblich für das endgültige ZIP sind ausschließlich die separat gelieferten
frischen Prüfprotokolle und `ExtremeLab_S01_BotDeliveryRecovery_Abschlusspruefung.json`.**
Interne PREPACK-Angaben bleiben ausdrücklich Vorverpackungsbelege. Die Laufzeit ist
Linux/Python3.13.5/Node24.11.1. Keine Windows-, Cloud-, Browser- oder native Botabnahme.

## 5. Umfang und Restarbeit

Die fünf vorhandenen S01-Lieferdateien, aktueller Quellenkatalog, Pfadliste und
Fähigkeitsmatrix sind fortgeführt. Alte Ursprungsarchive, 36 frühere Produktions-
inputs, Masterplan und Gatecheckpoint bleiben unverändert. Offizielle S00-/S01-
Abnahme bleibt unverändert; die private S01-Quellenarbeit ist nicht der formale Finish.

Es fehlen **21** Originalinputs, darunter Overlay, neun Skinsegmente, Skinbuilder,
Relay sowie die Build-/Downloadquellen der anderen Botversionen. Der vollständige
Websitebuild und der finale Reader nach der Skin-Stufe bleiben deshalb ausdrücklich
`blocked_capability`. Ein erfolgreicher isolierter Downloadtest beseitigt diese
Quellenlücken nicht.

Nächster Quellenauftrag: die verbleibenden Originale anhand neuer Vollarchive oder
eines vollständigen authentisierten Exports sichern. Die jetzt gebundenen1.2.1-
Builder-/Downloadbytes nicht erneut rekonstruieren. Sobald die passende native
Toolchain vollständig offline verfügbar ist, kann ein separater Buildnachweis auf
diesen echten Quellen aufsetzen; weder Installer-Attrappe noch Ersatz-`.algo` verwenden.

GitHub ausschließlich lesend: `main=1a5cfe9d3139276f5432c79a8ee0be1938b7066c`,
vollständiger Baum `47fdd2b4cb70efc67db93f93f178015259204d86` enthält nur README.
Keine Veröffentlichung, GitHub-Schreibaktion, Kontoanbindung oder Brokeraktion.
