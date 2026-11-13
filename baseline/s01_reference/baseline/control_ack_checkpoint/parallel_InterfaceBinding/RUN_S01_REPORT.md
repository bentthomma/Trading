# ExtremeLab – S01 Schnittstellenbindung

**Arbeitskennung:** S01-INTERFACE-BINDING. Vorgänger: `ExtremeLab_S01_InventoryConsolidation_Offline.zip`, SHA-256 `e948472e28dad697a677add0fa74fb0915d6d115de34f0cec81157e7bad727a6`.

## Fachliches Ergebnis

Zehn vorhandene Schnittstellenbereiche sind auf 23 tatsächliche Quelldateien und 42 genaue Zeilenbereiche abgebildet. Alle Belege tragen Datei- und Fragmenthashes. Zehn vorhandene View20-Websiteinputs sind mit den entsprechenden Plattform-Addon-Dateien bytegleich. Das ist eine erneut geprüfte Quellbindung, keine Wiederherstellung von zehn zusätzlichen Dateien.

Die map-basierte Referenz ergänzt die vorhandene `path-map.json`, `donor-map.json` und `reproduction-report.json`. Keine Verlagerung in ein erfundenes Monorepo, kein neuer Adapter und keine Aktivierung von S02. Die vollständige Darstellung steht in `docs/architecture/S01_EXISTING_INTERFACES.md`; das maschinenlesbare Gegenstück in `evidence/S01/S01_EXISTING_INTERFACES.json`.

## Konkrete Ergebnisse an Originalkomponenten

* Botbezogene Observer-/Journalansichten und generische Konto-/Positionsabfragen lesen verschiedene Quellen. `get_positions` bleibt ohne bestätigten allgemeinen Kontosnapshot nicht verfügbar, obwohl eine autorisierte Botbeobachtung vorliegt. Nicht verfügbar ist nicht gleich null.
* Observer, Journal und Fernansicht verwenden zwar `schemaVersion:1`, aber unterschiedliche Identitäten, Cursor und Quittungen. Kreuzweise Übergaben werden zurückgewiesen. Ein Journal-High-Water 5 bei Contiguous 3 bleibt eine Lücke.
* Ein passiver Abgleich ist bereits implementiert. Er verbindet nur explizite Profile und native Positions-IDs im passenden Broker-/Konto-/Umgebungs-/Währungskontext, erhält exakte Dezimalstrings und verleiht keine Handelsbefugnis.
* Eine geschlossene Engineposition bleibt ein historischer Bericht. Der Originalproducer bezeichnet seinen Berichtszähler korrekt nicht als offenen Bestand.
* **Offene Grenze IF-11:** Ein frischer Engine-Gesamtstatus macht einen älteren Positionsbericht nicht aktuell. Die Fernansicht exportiert den alten Zeilenzeitpunkt, aber keine eigene Zeilen-Frischemarkierung. Der lokale passive Vergleich lehnt die aktuelle Vergleichbarkeit ab.
* **Offene Grenze IF-12:** Der vorhandene Produktionsvalidator akzeptiert eine widersprüchliche Bestandskennzeichnung eines synthetischen Engine-Uploads. Das verlangt ein künftig geprüftes semantisches Vertragsverhalten, keine Gleichsetzung von Authentisierung und Datenherkunft. Es ist nicht behoben.

## Tatsächlicher Testumfang

Die neue Suite enthält 14 Verhaltenstests am Originalcore mit echter lokaler SQLite-Persistenz und den vorhandenen Fixtures. Nur der ausgehende Website-Transport wird abgefangen. Dazu kommen fünf Prüfungen der Quellenkarte, darunter veränderte Zeilenbelege, erfundene Referenzen, eine Legacyquelle als angeblicher Produktionsinput und die unerlaubte Freigabe eines fehlenden Moduls.

Die relevante Originalregression umfasst `observation.mjs`, `engine-journal.mjs`, `reconciliation20.mjs`, `reconciliation20-tools.mjs` und `remote-view20.mjs`. Jeder Lauf wird separat als TAP protokolliert. Historische Tests werden nicht gezählt. Die endgültigen tatsächlich ausgeführten Zahlen, Runtimehashes und Exitcodes stehen ausschließlich im separat gelieferten frischen `execution.json`.

Zwei neue erfolgreiche Testmethoden reproduzieren ausdrücklich offene Grenzen. Bestandene Tests sind daher kein Beleg, dass diese Grenzen korrigiert sind. Es gibt keinen neuen C#-Build, keinen Browserlauf, keinen vollständigen HTTP-/Cloudpfad und keinen neuen Websitevollbuild in dieser Arbeit.

## Nachvollziehbare Änderung und Sicherung

Die drei ergänzten Inventardokumente sowie die Paketübersicht, der Bericht und die Übergabe sind vor Änderung unter `baseline/interface_checkpoint/` gesichert. Alle 344 manifestierten Dateien des Vorgängers müssen rekonstruierbar bleiben. Produktionsoriginale, drei frühere private Patchvorschläge, Originalarchive, Masterplan und Gatecheckpoint bleiben bytegleich. Der Quellstand bleibt 38 vollständig / 5 Präfix / 16 Metadaten, also 21 fehlende Vollquellen.

Der neue Runner muss unprivilegiert ausgeführt werden. Er prüft die Archivbindung, entpackt die Originalplattform, verifiziert deren 1.027 Manifestdateien, führt nur die abgegrenzten Tests aus und kontrolliert danach sämtliche extrahierten Originaldateien. Linux-seccomp sperrt ausgehende Netzwerk-Verbindungsversuche vererbt; dies ist keine universelle Sandbox. Die Berichte liegen ausserhalb des Pakets.

## Quellen- und Ausführungsgrenzen

Die C#-Sender sind nur statisch zugeordnet. Der archivierte Observerquellvertrag alpha.4 wird nicht mit den synthetischen alpha.3-Fixtures gleichgesetzt. `View20` ist eine vollständig vorhandene Teilansicht, nicht der fehlende finale Skin-/Live-Client. Der separate Python-Relay ist kein Ersatz für `lib/relay.mjs`.

GitHub wurde nur über die Anbindung lesend geprüft: `main` bleibt `1a5cfe9d3139276f5432c79a8ee0be1938b7066c`, der vollständig gelesene Baum enthält nur README.md. PR-/Workflowlisten und der Vercel-Produktionsalias wurden in diesem Arbeitspaket nicht erneut abgefragt. Vorhandene historische Providerbindungen sind keine neue Liveprüfung.

Keine Broker- oder Kontoaktion, keine Veröffentlichung, keine GitHub-Schreibaktion, keine Produktcodeänderung und keine formale Freigabe.
