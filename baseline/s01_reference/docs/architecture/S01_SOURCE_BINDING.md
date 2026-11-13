# S01 – Originalquellenbindung und reproduzierbare Teilprüfung

Arbeits-ID: **S01-SOURCEBINDING-20261112**. Private Fortsetzung der vorhandenen S01-Inventurlinie auf ausdrücklichen Nutzerauftrag. Kein neuer Produktcontroller und keine weitere S00-Forschungsrunde.

## Ergebnis

Drei bislang nur als Provider-Metadaten/Präfix bekannte Produktionsdateien sind jetzt vollständig vorhanden: `bot-src.0`, `bot-src.1`, `bot-src.2`. Damit sind **31 von 59 Eingabedateien** des gebundenen Vercel-Deployments lokal gesichert; **28 bleiben unvollständig**. Diese Dateizahl ist kein Fertigstellungsgrad des Produkts.

Die bisherigen 28 Quelldateien wurden nicht verändert. Das Originalarchiv der Engine1.2.1 und die Vorgängerübergabe liegen unverändert im Paket. Die aktuellen fünf S01-Lieferartefakte wurden fortgeschrieben, nicht durch ein paralleles Inventar ersetzt.

## Beweis der tatsächlichen Herkunft

Originalarchiv: `baseline/original_engine121_source.zip`, SHA256:
`8baa784faa8fada648b30ff8b81d99edd21958149dbde1fd5a720459319c3c43`.

Alle 30 Einträge seines eigenen SHA256-Manifests wurden geprüft. Die zwölf unveränderten Dateien unter `src/` werden als UTF-8-JSON mit sortierten Schlüsseln, kompakten Separatoren und Brotli-Qualität11 wieder gepackt. Das ergibt exakt **31.406 Bytes** mit dem SHA256:

`9e919ec1a94a5c0c569d7b9f46811ae98fed92a02b74773ef12d1821a14d81a3`

Dieser stimmt mit dem Sourcehash im authentifiziert gelesenen Produktions-Buildskriptpräfix und den historischen Vercel-Buildlogs überein. Das Aufteilen in 10.500, 10.500 und 10.406 Bytes ergibt außerdem alle drei in der aktuellen Providerliste bestätigten SHA1-UIDs. Die SHA256 jedes Segments und aller zwölf entpackten Quelldateien stehen im Bindungsbeleg. Ein separater Node-Decoder prüft die vollständigen Inhalte gegen die Archivquelle.

Ein Hash ist keine unabhängige Freigabe oder Rechtebestätigung. Die Kombination aus gepinntem Originalarchiv, vollständigem Payloadhash und drei Provider-UIDs belegt hier die konkrete Quellenzuordnung. **Sie belegt weder einen neuen Binärbuild noch eine Identität mit Engine1.9.**

## Reale Originalprüfung statt Ersatzimplementierung

Das originale `integration-tests/test_csharp_wire.py` und der originale Python-Empfänger wurden in einer Wegwerfkopie des unveränderten Archivs ausgeführt. Das Testskript verwendet die vorhandene synthetische Wire-Fixture, lokale TLS-Verbindungen und SQLite. `aiohttp3.13.3` und `cryptography46.0.4` entsprechen den ursprünglichen Anforderungen. Ausführung unter UID65534, Python3.13.5.

**18 ausgeführte Prüfaussagen bestanden**, darunter Authentisierung, bestätigtes Speichern vor ACK, Wiederverbindung ohne Duplikate, getrennte Lese-/Schreibberechtigungen, Ablehnung eines synthetischen Handelsbefehls sowie Konfliktabwehr nach Datenbankneustart. Darin wird die Authentisierung bei zwei Verbindungen geprüft: nicht als18 unterschiedliche Testmethoden ausgeben.

Wichtig: Die Wire-Fixture ist archiviert und wurde in diesem Lauf **nicht neu durch C# erzeugt**. Kein cTrader, kein tatsächlicher Bot, kein Konto und kein Broker waren beteiligt. Der Python-Netzfilter ist eine kooperative Loopback-Beschränkung, keine Betriebssystem-Sandbox. Seine beobachteten Endpunkte stehen im Prüfbeleg.

## Tatsächlicher Buildgraph und verbleibende Grenze

`build-release20.mjs` nennt acht Hauptstufen. Der vollständige Originalcode von `build.mjs` zeigt zusätzlich einen Import von `build-bot15.mjs`. `patch-live.mjs` wird dagegen erst aus dem fehlenden `live-overlay.b64` erzeugt und ist kein zusätzlicher fehlender Provider-Input außerhalb der59.

Der echte erste Buildschritt wurde mit den vorhandenen31 Quellen ausgeführt. Er erzeugt die fünf originalen Basisassets bytegleich und endet anschließend mit `ENOENT` für `live-overlay.b64`. Das ist **ein tatsächlich ausgeführter, nicht erfolgreicher Buildversuch**, keine bestandene vollständige Buildreproduktion.

Die unveränderten Account-Addon- und RemoteView-Teilschritte wurden separat wiederholt. Idempotenz und die originale Ablehnung eines manipulierten Addons blieben erhalten. Der unveränderte `postbuild-132.mjs` lehnt ungepatchte Basisassets weiterhin korrekt ab. Diese Teilprüfungen wurden unter einer Linux-seccomp-Sperre für `connect`, `sendto`, `sendmsg` und `sendmmsg` ausgeführt; die Sperre wurde durch einen eigenen Verbindungsversuch mit erwarteter `EPERM`-Antwort geprüft. Das ist keine allgemeine Prozess-Sandbox.

## Native Builds und historische Zahlen

Das passende .NET-SDK6.0.428 ist nicht installiert. Ein Zugriff auf die offizielle Release-Metadatenquelle scheiterte hier an der DNS-Auflösung; ein SDK-Download über das verfügbare Downloadwerkzeug war ebenfalls nicht möglich. Deshalb wurden die originalen C#-Tests und `.algo`-Kompilation **nicht neu ausgeführt**. Die archivierten136/59 C#-Prüfwerte sind ausschließlich historische Angaben und werden nicht zur neuen Prüfzahl addiert.

Auch die bekannte Differenz zwischen zwei historischen1.2.1-Binärbuilds bleibt ungeklärt. Die Quellenzuordnung ist jetzt stärker belegt; Binärdeterminismus folgt daraus nicht. Native1.9-Originale fehlen weiterhin. Die separate2.0-alpha5-Engine und die Hubplattform0.9.7 bleiben eigene Versionslinien.

## Änderungen, Abgrenzung und Fortsetzung

Fortgeschrieben: Quellenmanifest und die fünf S01-Lieferdateien. Ergänzt: drei exakte Produktionssegmente, reproduzierbares Recovery-Werkzeug, Negativprüfungen, Original-Empfängerreplay und die tatsächliche Buildabhängigkeitsanalyse. Der Paketprüfer lehnt zusätzlich Symlinks und nichtreguläre Dateien ab; er ist keine neue Produkt-Governance.

Masterplan und offizielle Gate-Datei bleiben bytegleich zum Vorgänger. Die private S01-Arbeit wird nicht mit einer formalen Abnahme gleichgesetzt. Keine GitHub-Schreibaktion, kein Deployment, kein Produktdatenzugriff und keine Brokeraktion.

Nächster fachlicher Fortsetzungspunkt: die28 noch fehlenden Original-Websiteinputs beschaffen und exakt binden, insbesondere Overlay, UI-Segmente und native Buildskripte. Den nun belegten1.2.1-Quellstand nicht erneut suchen oder durch neue Botlogik ersetzen. Eine verfügbare native Toolchain kann danach für die unveränderten Original-C#-Tests verwendet werden; fehlende Fähigkeiten bleiben im Inventar ausdrücklich getrennt.
