# ExtremeLab · S01 – Originale Fernansicht durchgängig bis zum API-Lesepfad geprüft

Stand: 13. November 2026. Privates Quellen-/Integrationsaudit, keine Produktfreigabe.

## Ergebnis

Der vollständig vorhandene RemoteView20-Pfad wurde erstmals in diesem S01-Paket
mit dem **tatsächlichen Produktions-API-Einstieg** zusammen ausgeführt:

`originales SQLite-Journal → originaler lokaler Producer → api/revolution.js →
originale Authentisierung/HTTP-/Service-/Projektionsmodule → JSON-Lesepfad`.

Nur Wire-Transport und die beiden Vercel-Providerbibliotheken sind ausdrücklich
synthetische Testadapter. Die zuvor vorhandenen Originaltests riefen dagegen den
Service direkt auf und prüften damit nicht den ausgelieferten Blob-/API-Adapter.
Es wurde keine parallele Produktimplementierung und kein Ersatz-Reader gebaut.

**Keine zusätzliche Website-Eingabedatei ist wiederhergestellt worden.** Es bleiben
36 von 59 vollständigen Originalinputs und 23 fehlende Inputs. Der vollständige
Website-Build und der finale Skin-Reader bleiben `blocked_capability`.

## Quelle und Versionsbindung

Ausgangsarchiv: `ExtremeLab_S01_AddonBuildAudit_Offline.zip`, SHA-256
`ffe6f6ffd813d6304306ef08070899f981834b12a0a6e11810c5d55566fdcf4d`.
Es ist unverändert unter `baseline/prior_addon_build_audit.zip` erhalten.

Originales Plattformarchiv: `Th3R3v0lut10n_Technik_1_0_Arbeitsstand_0_9_7.zip`, SHA-256
`6530c9c46cab0c6f411fdb682f3c74d4c9140742e698aa48c835bc60ba190c6d`.
64 ausgewählte Quelldateien werden bei jedem vollständigen Prüflauf direkt mit
dessen tatsächlichen ZIP-Mitgliedern verglichen. Ein alter Dateikatalog wird
nicht anstelle der tatsächlichen Quellbytes als Wahrheit angenommen.

Die zehn Addon-Dateien stimmen vollständig mit den bereits gesicherten
Produktionsquellen überein. Auch ihre zehn am 13.11. lesend erhaltenen Provider-UIDs
stimmen mit den vollständigen SHA-1-Dateihashes überein. Zusätzlich sind SHA-256
und Bytes dokumentiert. SHA-1-UIDs sind historische Quellenidentifikatoren, keine
unabhängige Signatur oder Freigabe. Beleg: `S01_REMOTE20_SOURCE_BINDING.json`.
Plattform 0.9.7, Ansicht 2.0 und die Engine-Versionslinien bleiben getrennt.

Die begrenzte vertiefte Archivsuche lieferte keine weiteren der 23 Inputs.
Suchumfang, vier Originalarchive und die nicht erschöpfenden Grenzen sind in
`S01_REMOTE20_ARCHIVES_CHECKED.json` festgehalten. Keine erneute Schleife aus
identischen abgeschnittenen Provider-Inhaltsabfragen.

## Drei neue, konkret geprüfte Fehlergrenzen

### 1. Kopplung gespeichert, obwohl der Aufrufer eine Fehlerantwort erhält

`lib/service.mjs`, `pair`: Zuerst wird der Datensatz über den originalen
Registry-Adapter geschrieben, erst danach der Authentisierungscache aktualisiert.
Scheitert letzterer, antwortet der echte HTTP-Einstieg mit 503. Der Datensatz ist
im Testanbieter dennoch aktiv; das einmalige Token wurde nicht zurückgegeben.
Ein blindes erneutes Koppeln erhält daher 409 statt einer neuen Kopplung.

Der vorhandene **explizite** Weg wurde vollständig ausgeführt: authentisierter
Statusabruf → konkrete Geräte-ID widerrufen → neu koppeln. Die neue Geräte-ID
unterscheidet sich von der verlassenen Kopplung. Kein automatisches Aufheben
einer bestehenden Zuordnung und kein stillschweigendes Überschreiben.

### 2. Widerruf gespeichert, alter Autorisierungscache noch verwendbar

`lib/service.mjs`, `revoke` und `record`: Ein Fehler nach dem Registry-Commit,
aber vor dem Cache-Update, kann eine 503-Antwort und einen noch gültigen alten
Cacheeintrag hinterlassen. Der Gegenversuch kann damit zunächst weiterhin lesen.
Ein erzwungener Statusabruf lädt den bereits widerrufenen Datensatz; danach werden
Lesen und Schreiben mit der alten Gerätekopplung abgewiesen. Auch ohne diesen
Abruf endet die Berechtigung an der vorhandenen Fünfminutengrenze, sobald der
Registryabruf wieder erfolgreich ist. Die Grenze wurde separat geprüft.

Das ist **keine neue Behauptung sofortiger Revokation**: Die Originalkomponente
weist selbst `revocationMaximumSeconds: 300` aus. Der neue Test bindet diese
bereits bekannte Grenze an den tatsächlichen API-/Registry-Adapter.

### 3. Snapshot sichtbar, obwohl dem Producer die Bestätigung fehlt

Ein Cache-Schreibversuch kann im Anbieter bereits erfolgt sein und anschließend
trotzdem fehlschlagen. Der Originalhandler antwortet mit 503; der originale lokale
Producer setzt daher korrekt **keine** Empfangsbestätigung. Der Lesepfad kann den
bereits gespeicherten Snapshot trotzdem liefern.

Ein neu erzeugtes Producerobjekt liest den vor dem Versand in SQLite gesicherten
Slot und sendet denselben Slot nicht nochmals. Im nächsten Slot wird wieder ein
vollständiger Stand bestätigt. Eine neue Übertragung macht veraltete Journal-
Quellzeit nicht künstlich frisch. Dies ist ein Producer-Instanzwechsel mit echter
SQLite-Persistenz, kein Stromausfall-/Betriebssystem-Neustartnachweis.

**Diese Grenzen wurden reproduziert, nicht im Produkt behoben.** Die erfolgreichen
Gegenversuche sind Charakterisierungen und keine bestandene Cloud-Abnahme.

## Vorhandene Schutzregeln am echten Consumer bestätigt

Die API verlangt die originale signierte Besitzersitzung und die passende Origin
für Kopplung/Widerruf. Ein Besitzer-Cookie ersetzt kein Producer-Token. Abweichende
Kontozuordnung, `writesAllowed: true`, Handelsaktionen und ungültige Körper werden
abgewiesen. Große IDs und Geldwerte bleiben aus den Originalereignissen erhalten.
Die lokale Ausführungspolitik bleibt gesperrt; öffentliche Zustandsausgaben
enthalten das synthetische Gerätetoken nicht.

Der echte Blob-Adapter übermittelt die vorherige ETag und `allowOverwrite` passend
zur Operation. Ein dazwischenliegender synthetischer Writer verhindert den
Overwrite. Der Registry-Reader cancelt den Stream an seiner 8192-Byte-Grenze.
Anbieterfehler werden nicht mit privaten Fehlerdetails an die Anzeige gegeben.
Die Providerdoubles bestätigen den **Consumervertrag**, nicht reale SDK-, Cloud-
Konsistenz-, Mehrhost- oder Dauerhaftigkeitseigenschaften.

## Frontend und Browsergrenze

Der vollständige Original-Frontendcode ist statisch gelesen: Kopplung und
Widerruf führen im `finally` einen vollständigen Statusabruf aus. Die geprüften
API-Recoveryoperationen sind dort grundsätzlich angeschlossen. Bei einer
verlassenen Kopplung entsteht jedoch keine nachträglich rekonstruierte Token-
Datei; erforderlich bleibt Widerruf und erneutes Koppeln. Das ist ein statischer
Anschlussbefund, **kein erfolgreicher Browserablauf**.

Der installierte System-Chromium ließ sich starten. Die Navigation wurde aber
vor dem Seitenladen mit `ERR_BLOCKED_BY_ADMINISTRATOR` blockiert; kein
Anwendungs-Request erreichte die eingerichtete Offline-Route. Die Browserpolicy
wurde nicht verändert. Ein erster Versuch mit dem strengen Node-Netzfilter war
bereits an der Unix-IPC/zygote-Kommunikation gescheitert. Diese Versuche zählen
nicht als erfolgreiche Tests. Detail: `S01_REMOTE20_BROWSER_BOUNDARY.json`.

## Tatsächliche Prüfumfänge

Vorverpackung: **14 neue Original-API-/Wiederanlaufmethoden, 18 unveränderte
Original-RemoteView20-Tests und 20 vorhandene S01-Inventarregressionen**, insgesamt
52 unterschiedliche Methoden; alle bestanden. Die Inventartests sind relevant,
weil die fünf verbindlichen Lieferdateien und die Fähigkeitsmatrix fortgeführt
wurden. Die früheren 55 Addon- und 78 EndpointRecovery-Tests wurden nicht erneut
zu diesem Lauf addiert.

Drei gezielte Veränderungen an temporären Originalkopien – entfernte
Sitzungsprüfung, falsche ETag und ausgelassene Slot-Persistenz – werden durch
Verhaltensassertionen erkannt. Paketänderung, Zusatzdatei und Symlink werden
separat vom Paketprüfer abgewiesen. Diese Proben erhöhen die 52 nicht.

Ausführung: Linux, Python 3.13.5, lokal vorhandenes Node 24.11.1 (SHA-256 in
Prüfprotokollen). Seccomp blockiert in sämtlichen Verhaltens-/Inventartestkindern
`connect`, `sendto`, `sendmsg`, `sendmmsg`; ein EPERM-Gegenversuch prüft den Filter.
Keine allgemeine Sandbox-Zertifizierung. Kein HTTP-Server, kein Broker und kein
Handelsbot wurde gestartet. Das vollständige Endpaket wird frisch entpackt und
unter UID 65534 erneut geprüft. **Erst der externe Abschlussbeleg dokumentiert
diesen tatsächlich abgeschlossenen Lauf**, nicht diese Vorverpackungsangabe.

## Änderungen und offene Arbeit

Geändert sind ausschließlich private S01-Metadaten, Berichte und Prüfwerkzeuge.
Die 36 Produktionsquellen, Masterplan und offizieller Gatecheckpoint bleiben
bytegleich. Der Gatecheckpoint enthält historische Inventarzähler; die aktuelle
Quellabdeckung steht im bereits vorhandenen 36/59-Quellenmanifest, nicht in einem
nachträglich umgeschriebenen Freigabestatus.

Die private S01-Inventar-/Reproduktionsunterlage ist um diesen durchgängigen Pfad
ergänzt. Der komplette Websitebuild benötigt weiterhin die fehlenden Original-
Inputs, insbesondere Overlay/Skin und den finalen Reader. Ein neuer vollständiger
Export ist zuerst gegen die gebundenen Quellen-IDs zu prüfen. Erst dann die
komplette Originalreihenfolge ausführen; vorhandene Zwischenmodule nicht als
finale Ersatzquellen einsetzen. Dieses abgeschlossene Remote20-Paket ohne neue
Quellen oder konkrete Fehlerhypothese nicht nochmals als neuen Fortschritt
wiederholen. Keine Änderung an formalen S00-/S01-Abnahmen.
