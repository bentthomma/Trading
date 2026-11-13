# ExtremeLab – S01 Quellen- und Produktionsstand · privater Abnahmekandidat

**12.11.2026 · MASTERPLAN 1.1.0 · S01-PREACCEPTANCE (kein offizieller Abschluss)**

## Auftrag und unveränderbare Grenze

S01 heißt „Quellen, Versionen und Produktionsstand eindeutig sichern“, ist explizit von S00 abhängig und verlangt fünf Dateien: `baseline-lock.json`, `version-crosswalk.md`, `donor-map.json`, `reproduction-report.json`, `path-map.json`. Alle fünf wurden auf Grundlage des zuvor nachgewiesenen S01-Quellenzweigs fortgeschrieben. **S00 ist noch nicht unabhängig abgenommen; S01 bleibt im kanonischen Plan `pending`.** Kein `planctl finish`, keine GitHub-Schreibaktion, keine Produktionsmigration.

## Nachweisbare, unveränderte Quellen

| Quelle | Identität / Status |
|---|---|
| Kanonischer Masterplan 1.1.0 | SHA-256 `60303e48156a187d065ad66e884398a71853e955a4acc1322ab8d9dd9d97ae7d` – unverändert |
| GitHub `bentthomma/Trading` | `main` `1a5cfe9d3139276f5432c79a8ee0be1938b7066c`; nur `README.md`; ungeschützt |
| Vorgänger S01 Quellenfund | ZIP SHA-256 `a08629a25c8a6d3bb5522f479d9614ffd9cd305422a95cf0a08d6249fee3666f` |
| Trading_Local 0.8.0 | Originalarchiv SHA-256 `535c028557c357b271716a7ac9df45f5d544cc5c52e08ec8c66d6af22cb10524` (Vorgänger nachgewiesen) |
| Trading_Local / Plattform 0.9.7 | Originalarchiv SHA-256 `6530c9c46cab0c6f411fdb682f3c74d4c9140742e698aa48c835bc60ba190c6d`, CRC und Hashprüfung, 1.028 Einträge, vollständig lokal wiederhergestellt |
| Original Engine 1.9 | **Nicht** als vollständiger Source- oder Binärbestand wiederhergestellt |

## Neue Vercel-Quellenprüfung – vorherige 404 korrekt eingeordnet

Zuerst wurde für `extremelab-desk` bei `get_project`/`list_deployment_files` ohne explizites Team ein HTTP 404 beobachtet. Nach lesender Abfrage der Team-Mitgliedschaft und Auswahl des **tatsächlichen Eigentümerteams** `ben-a958e9d0` (ID `team_9CV4XJ0RQxIVJeMBBRqtfuGZ`) waren Projekt und Source-Tree lesbar.

- Produktionsprojekt: `prj_pIEbUZ8G8K4oWx7FgnLgClOaAFkg`; Deployment `dpl_6AuCdiuxGSFKnF7svRpykB7XRAmp`; `READY`, Ziel `production`; Aliase `extremelab-bt.vercel.app`, `extremelab-desk.vercel.app`. Projektmetadaten: Node `22.x`, **nicht** Node24 des separaten 0.9.7-Hubs.
- Die Vercel-Source-Tree-API meldet **59 verschiedene Eingabedateipfade**. Genau diese 59 Pfade und Provider-IDs stehen im neuen `vercel_prod_source_tree.json`. Das sind **nicht** 59 lokal gesicherte Dateien und kein bestätigter vollständiger Git-Repositoryinhalt.
- Darunter sind die früher fehlenden Segmente `assets.0–3`, `bot-src.0–2`, `skin.0–8`, `account-addon.br` und `live-overlay.b64` als Provider-Eingabepfade vorhanden.
- Inhalts-API: Bei **acht ausgewählten kleineren Dateien** wurde der komplette Base64-Inhalt geliefert; diese Dateien wurden nicht lokal als Quellfiles materialisiert. Weitere **acht** Abfragen lieferten ausdrücklich `truncated=true` mit abgeschnittenem Base64. Die restlichen **43** Dateien sind nur über ihre Provider-Metadaten geprüft. Ein SHA-1-Beispiel der vollständig gelieferten `package.json` stimmt mit Vercels 40-stelliger ID überein; andere IDs wurden nicht unabhängig als Vollhash geprüft.
- Die vollständig lesbare `build-release20.mjs` nennt acht Stufen in fester Reihenfolge: `build.mjs`, `postbuild-132.mjs`, `version133.mjs`, `build-account-addon.mjs`, `build-bot.mjs`, `build-bot14.mjs`, `build-ui.mjs`, `build-revolution20.mjs`. Alle acht Namen existieren in der Source-Tree-Liste. Für drei Stage-Dateien waren die Inhaltsantworten abgeschnitten. **Kein achtstufiger Website-Build wurde tatsächlich wiederholt.**
- Die historische 1.9-Preview `dpl_DPoekz6ga9QJ5ebcWiRSLqFLKpRX` liefert nur drei Source-Eingabepfade (`build.mjs`, `package.json`, `vercel.json`). Das lesende `build.mjs` verweist auf ein externes `delivery.json` und verifiziert dessen SHA-256 `fa032264e11efeb4ab7b54c0a4c93a97935281fb08b8fb4d4c41ba5f5e14875e`. Dies ist nicht das historisch genannte Release-ZIP (`57d1f113...`) und belegt keine verfügbaren Engine-1.9-Originalbytes. Kein externer Share-Link wurde geöffnet oder generiert.

## Frisch ausgeführte isolierte Tests und Reproduktion

Unter Linux mit vorhandenem Node **v24.11.1** und einer temporär frisch entpackten 0.9.7-Kopie wurden tatsächlich wiederholt:

| Prüfgruppe | Pass | Fail | Skip | Exit |
|---|---:|---:|---:|---:|
| Target-Admisson/HTTP/Process/UI (vier Originaldateien) | 79 | 0 | 0 | 0 |
| Observation/Journal/RemoteView (sechs Originaldateien) | 91 | 0 | 0 | 0 |
| Bereits vorhandene S01-Inventur-Unittests | 14 | 0 | 0 | 0 |
| Neue S01-Status-/Sourcenachweistests | 12 | 0 | 0 | 0 |

Synthetische lokale Profile; Node-Testschutz für externe Direktverbindungen über kooperativen `--import`-Guard, keine OS-Sandboxbehauptung. Keine Konten oder Handelsbots gestartet. Die früher protokollierte komplette Node-24-Suite **964 pass / 19 skip** wurde in diesem Aufruf **nicht erneut** ausgeführt und wird ausschließlich als historische Evidenz weitergeführt.

Der originale native Source-Identity-Generator für `Th3Revolution20 2.0.0-alpha.5` wurde in einer separaten Wegwerfkopie gestartet: **58 Eingaben**, Sourcehash `b0b0aa1f3a55a987fccfa09d039047a25883a5926bae0d71bd3bba0cccf604e4`; die erzeugten Manifest-/Identitätsdateien sind byteidentisch zum Original. Keine native C#-Kompilation, kein `.algo`-Start, keine Brokerverbindung.

## Gate-/Abnahmematrix

| Gate | Ergebnis |
|---|---|
| S01-C01 Quellenstatus vollständig/präfix/fehlend | Kategorien explizit dokumentiert; Website-Bytes und Ready19 offen |
| S01-C02 Build-/Reproduktionsevidenz | Node24 + Generator nachgewiesen; vollständige Website/native Builds als `blocked_capability` offen |
| S01-C03 Kein vorgezogener native Integrationszugriff | Dokumentarisch erfüllt: keine Produkt-/Brokerfreigabe |
| S01-C04 Produktions- und Entwicklungsquellen getrennt | Produktionsziel und GitHub-`main` bekannt; Verbindung zwischen beiden Codebasen **nicht** verifiziert |
| Vorgänger S00 | **BLOCKIERT** (unabhängiger Review/Branchschutz/Writer fehlen) |
| Formale S01-Freigabe | **NICHT ERTEILT** |

## Nächste erforderliche Nachweise

1. **S00 unabhängig abnehmen** (CI/Review-/Branchschutz/geschützter Writer, nicht durch lokalen Simulationsstatus). S01 kann nicht vorher offiziell starten/abschließen.
2. Die Originalbytes aller 59 Vercel-Input-Pfade ohne die Connector-Texttrunkierung beschaffen, privat mit SHA-256 archivieren, Vollständigkeit gegen die Build-Eingabekarte prüfen und den achtstufigen Website-Build mit originaler Toolchain **offline** reproduzieren.
3. Das Original-Ready19-Paket samt `.algo` über vollständige Bytequelle und historischen Hash wiederherstellen; niemals mit der 2.0-alpha5-Engine gleichsetzen. Native .NET10-/Windows-/cTrader-Rebuild und unabhängiges Review getrennt nachholen.
4. Nach Quellenabgleich und S00-Gate unabhängigen S01-Review durchführen; bis dahin alle Produktstufen `pending` belassen.

**Kein GitHub-Push, kein PR, keine Veröffentlichung, kein Deployment, keine Brokeraktion.**

## Fortsetzung S01 – bytegenaue Produktionsquellen und Buildlogs (12.11.2026)

**28/59** Vercel-Inputdateien byteidentisch wiedergefunden; **31/59** bleiben offen. Vier Quellassets verifiziert als ein Brotli-Inhalt mit fünf Website-Assets extrahiert. Originales Postbuild verweigert die fehlende Live-Overlay-Patchstufe; ohne Ersatzcode. Account-Addon und Read-only-View einzeln offline geprüft, Doppelaufrufe byteidempotent, manipuliertes Addon korrekt abgewiesen. Zwei historische .NET6-Bot-1.2.1-Buildlogs zeigen gleichen Sourcehash bei zwei verschiedenen `.algo`-Hashes (90.700 vs. 90.703 Bytes). Keine Kausalität behauptet, kein vollständiger Build. Siehe `docs/architecture/S01_RECOVERY_READBACK.md` und hashgebundene `evidence/S01/`-Dateien. **S00 not accepted / S01 pending.**
