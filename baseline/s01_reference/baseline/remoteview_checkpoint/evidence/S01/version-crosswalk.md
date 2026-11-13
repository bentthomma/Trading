# S01 – Quellen- und Versionsabgleich

## Aktueller Arbeitsstand: S01-ENDPOINTRECOVERY-20261113

| Bestand | Aktueller Nachweis | Abgrenzung |
|---|---|---|
| Produktionswebsite, gebundenes Vercel-Deployment | 36 von 59 Eingabedateien vollständig lokal vorhanden; alle SHA1-UID- und SHA256-gebunden | 23 fehlen. Kein vollständiger Build oder Deployment. |
| Endpunkte / UI-Patch | Fünf zusätzliche Produktionsdateien komplett hashgebunden; originaler UI-Patch wird unverändert isoliert geprüft | Fehlende Relay-/Skinquellen bleiben fehlend; Handlerprüfungen verwenden explizite Dienst-/Transportattrappen. |
| Engine 1.2.1 | Originalarchiv 30/30 Manifestdateien geprüft; 12 originale C#-Inputs reproduzieren exakt alle drei Produktionssegmente und den vollständigen gepackten Sourcehash | Keine Engine1.9 und kein neuer nativer Binärbuild. |
| 1.2.1 Empfänger/Protokoll | Historisch im Vorgänger mit archivierter synthetischer Wire-Fixture über Loopback-TLS/SQLite geprüft; hier nicht erneut ausgeführt | Kein laufender C#-Sender, kein cTrader, kein Broker. |
| Engine 1.9 | Historischer Liefernachweis und Preview-Wrapper | Originalquellen und Releasebytes weiterhin nicht wiederhergestellt. |
| Native Engine 2.0.0-alpha.5 | Separater bekannter Quellstand und historische Source-Identity-Prüfung | Nicht mit1.2.1 oder1.9 gleichsetzen; in diesem Lauf nicht neu gebaut. |
| Trading Local 0.8.0 / Plattform0.9.7 | Bereits gefundene getrennte Archivstände;0.9.7 im Vorgänger auf passende Produktionssource-UIDs gescannt | Frühere Runtimezahlen bleiben historisch; keine neue Hub-Abnahme. |
| AccountLive1.3.4 / RemoteView20 | Bestehende unabhängige Website-Addons | Kein vollständiges Websiteprodukt. |

Die ursprüngliche Website-`package.json` nennt1.3.1 und Node22.x. Die separate Hubplattform0.9.7 verlangt eine andere Laufzeit; diese Nummern sind kein gemeinsamer Produktrelease.

Die acht Namen in `build-release20.mjs` sind nur die oberste Ebene: das echte `build.mjs` importiert zusätzlich `build-bot15.mjs`. Fehlende Unterstufen dürfen nicht durch einen erfolgreichen Teilbuild verdeckt werden.

## Historie und Freigaben

Vollständige unmittelbare Vorgängerfassung dieses Crosswalks im unveränderten `baseline/prior_s01_sourcebinding.zip`; ältere Fassung in `baseline/prior_s01_source_recovery.zip`. Frühere Node-/native Testzahlen werden nicht als in diesem Lauf neu ausgeführt gezählt. S00 und der kanonische Planstatus wurden nicht geändert. Die aktuelle Nutzeranweisung autorisiert die private S01-Arbeit, keine öffentliche Installation oder Brokeraktion.


## S01-ADDON-BUILD-AUDIT – keine Versionsgleichsetzung

Das produktionsgebundene `account-addon.br` erzeugt sechs Quellen der Konto-Addon-Stufe 1.3.4. Alle sechs sind exakt mit dem Originalarchiv `ExtremeLab_AccountLive_1_3_4_Quellcode_und_Tests.zip` (SHA-256 `6d01f3abb68974f5f6a6289138bb52f21cf6f9275a5fed1d388fe4ee21bc8b1b`) abgeglichen. Die 26 archivierten Originaltests wurden auf den tatsächlich neu erzeugten Modulen ausgeführt; Providerantworten bleiben synthetisch.

**Nicht der finale Website-Reader:** Der authentisiert gelesene, unvollständige `build-ui.mjs`-Präfix schreibt später `lib/ctrader-readonly.mjs` und ersetzt `public/konto-live.html`. Seine 1500 Bytes reichen für diesen statischen Schreibpfadnachweis, aber nicht zum Ausführen oder zum Prüfen der finalen Modulbytes. Die Skin-Payload ist auf SHA-256 `abab24849786a62c367d84913173868afd3e22ad3dcc16d68b9ee3698ed5d37e` gebunden und bleibt unzugänglich.

Kein neuer 1.2.1-/1.9-/2.0-Botbuild, kein Beweis der endgültigen Produktionsoberfläche. Die Website-Eingabequellen bleiben 36/59; sechs Build-Erzeugnisse erhöhen diese Zahl nicht.


## Aktuelle private Ergänzung: S01-RemoteView20-Integration (13.11.2026)

Die zehn Dateien des Original-Addons `integrations/vercel-view20` aus Plattform
0.9.7 stimmen bytegleich mit den bereits vorhandenen Produktionsinputs überein.
Die zugehörigen zehn Provider-SHA1-UIDs wurden erneut lesend abgeglichen.
Quelle, aktuelle SHA256 und exakte Pfadzuordnung: `S01_REMOTE20_SOURCE_BINDING.json`.
Die Plattform-/Botversion 0.9.7, die Ansichtsversion 2.0 und Engine 1.2.1/1.9
werden dadurch nicht zu einer einzigen Version gleichgesetzt.

Neu geprüft wird der tatsächliche Produktions-API-Einstieg zusammen mit dem
originalen lokalen Journal und dem originalen Producer. Nur Transport und
Blob-/Cacheanbieter sind Attrappen; keine Cloud-, Browser- oder Brokerabnahme.
Die vorhandene nichtatomare Registry-/Cache-Grenze ist reproduziert, nicht
behoben. 36/59 vollständige Produktionsinputs bleiben unverändert; 23 fehlen.
Die bisherigen Addon-/Endpoint-Testzahlen sind historische Angaben.
