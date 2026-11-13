> Historischer Bericht des Vorgängerpakets (28/59). Aktueller Stand und neue Quellbindung: `S01_SOURCE_BINDING.md`.

# S01 – Produktionssource-Rekonstruktion und Build-Identität (private Prüfung)

**Datum:** 12.11.2026 · **Plan:** 1.1.0 · **S00:** nicht abgenommen · **S01:** `pending` · **Keine Freigabe oder Produktintegration.**

## Originalquelle und Identitätsgrenze

Vercel-Projekt `extremelab-desk`, Eigentümerteam `ben-a958e9d0`, Produktionsdeployment `dpl_6AuCdiuxGSFKnF7svRpykB7XRAmp`: 59 explizit aufgelistete Quelldateien. 20 der 59 konnten durch SHA-1-Bytegleichheit in den privaten unveränderten Quellarchiven identifiziert werden; weitere acht vollständige Dateiinhalte konnten aus lesenden Connectorantworten mit exakter SHA-1-Prüfung gesichert werden. Der private Kandidat enthält **28/59 komplette Quelldateien**. Jede Datei besitzt einen zusätzlichen eigenen SHA-256-Hash; der Vergleich zum 40-stelligen Vercel-Source-UID ist dokumentiert. Der Provider-UID ist **kein Herausgebersignaturnachweis** (SHA-1) und ein identischer Bytehash beweist nicht die gesamte Git-/Buildprovenienz.

**31 Quelldateien bleiben fehlend.** Darunter `skin.0–8`, `bot-src.0–2`, `live-overlay.b64`, mehrere Bot-/API-Dateien und weitere Build-Skripte. Diese dürfen nicht mit Ersatzcode oder synthetischem Inhalt als vollständige Produktionsquelle ausgegeben werden.

## Gebundene, abgeleitete Inhalte

Die vier unveränderten `assets.0–3` ergeben nach Verkettung SHA-1 `4fb080ee08dcfbca24cf7c1cd41e5109780ead6f`, exakt dem Vergleichswert aus dem byteidentischen originalen `build.mjs`. Sicheres Brotli-/JSON-Entpacken ohne JS-Ausführung ergab genau fünf Dateien: `public/index.html`, `public/app.js`, `public/online.js`, `public/desk.css`, `public/robots.txt` (jeweils SHA-256 im Beleg). Das ist **nur der Asset-Entpackschritt**, nicht das vollständige `build.mjs`: Es lädt zusätzlich den fehlenden Live-Overlay-Input und `build-bot15.mjs`.

Das vollständige originalgebundene `account-addon.br` hat SHA-256 `321aa9d5065ade59fc22bac871ea4f2b162c12ade105e3104477a19ae7c88283` und enthält sechs Originaldateien, die für die separate, brokerfreie Offlineprüfung verwendet werden können. Kein Secret wird gelesen, entschlüsselt oder gelöscht.

## Historische Produktions-Buildlogs (kein eigener Website-Build)

Mit Vercels lesender Build-Event-Abfrage wurden zwei echte Produktionsbuilds nachgewiesen. Beide nennen denselben Source-SHA-256 `9e919ec1a94a5c0c569d7b9f46811ae98fed92a02b74773ef12d1821a14d81a3`, .NET SDK `6.0.428`, cTrader.Automate `1.0.21`, Bot `ExtremeLabReady121` v1.2.1 und jeweils erfolgreichen Build. Die angebauten `.algo`-Dateien unterscheiden sich aber: 90.700 vs. 90.703 Bytes und SHA-256 `09052b50…` vs. `763afdc6…`. Die Original-`.algo`-Bytes liegen nicht vor, daher ist die Ursache (z. B. Zeitstempel, Umgebung, weitere Eingaben) **nicht bestimmt**. Die historische Bibliotheksquelle 1.2.1 hat ihre eigenen 30/30 korrekten SHA256SUMS, jedoch **keine nachgewiesene Bytebindung** an die produktiven Buildoutputs.

Die Vercel-Logs zeigen auch den achtteiligen Release-Build als in Produktionsbuilds durchlaufene Seiteneffekte: `build.mjs`, `postbuild-132.mjs`, `version133.mjs`, `build-account-addon.mjs`, `build-bot.mjs`, `build-bot14.mjs`, `build-ui.mjs`, `build-revolution20.mjs`. Das `package.json` nennt als Standard nur `node build.mjs`; welcher konkrete Override den vollständigen Release-Build aufgerufen hat, ist nicht endgültig geklärt. Die Quellen der Vorgänger-Engine 1.9 bleiben davon unabhängig fehlend.

## Echter Offline-Gegenversuch mit vorhandenen Quellbytes

Beim isolierten Versuch mit den fünf entpackten **originalen** Assets weist die originalgebundene Stufe `postbuild-132.mjs` diese mit `Unexpected live UI source; not patched` ab. Das ist ein **erwarteter Blocker**, denn die vorherige Stufe benötigt `live-overlay.b64` und dessen `patch-live.mjs`. Es wurde keine Ersatz-Patchversion eingeführt, um diesen Schutz zu umgehen.

Unabhängig davon wurden `build-account-addon.mjs` und `build-revolution20.mjs` mit den echten bereits vorhandenen Dateien in einem lokalen temporären Ordner ausgeführt. Beide arbeiten ohne Brokerverbindung. Zweimalige Aufrufe verändern die resultierenden öffentlichen Dateibytes nicht; das Account-Addon legt nur einen Navigationslink an und die View nur einen eigenen Read-only-Link. Ein absichtlich manipuliertes `account-addon.br` wird mit `ACCOUNT_ADDON_INTEGRITY` zurückgewiesen, bevor öffentliche Seiten verändert werden. Diese isolierten Teilbeobachtungen **ersetzen nicht** die achtstufige Gesamtfolge.

## Laufzeit- und Freigabetransparenz

Historisches Vercel-Websiteprojekt: Node 22.x, native .NET6-Compilerlogs für v1.2.1; eigenständiger Hub 0.9.7: Node24. Die native Engine 2.0-alpha5 ist weder Source- noch Binary-Nachweis der früheren 1.9. **S00 nicht unabhängig akzeptiert, S01 formal unverändert pending.** Keine GitHub-Schreibaktion, kein Push, keine Veröffentlichung/Deployment, kein Browser-Login, keine Brokeraktion. Der einzige zulässige nächste Schritt ist die gezielte Beschaffung der 31 fehlenden Originaldateien und von Engine 1.9 auf lesendem Weg sowie eine spätere unabhängige Prüfung nach Gate-Freigabe.
