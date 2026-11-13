# ExtremeLab – nächste private S01-Übergabe

## Maßgebliche Basis

Dieses Paket führt `ExtremeLab_S01_InventoryConsolidation_Offline.zip` (SHA-256 `e948472e28dad697a677add0fa74fb0915d6d115de34f0cec81157e7bad727a6`) fort. Alle 344 Vorgängerdateien sind bytegenau erhalten oder unter `baseline/interface_checkpoint/` gesichert. Masterplan 1.1.0 mit SHA-256 `60303e48156a187d065ad66e884398a71853e955a4acc1322ab8d9dd9d97ae7d` bleibt unverändert.

## Abgeschlossenes privates Arbeitspaket

Vorhandene Schnittstellen sind in `evidence/S01/S01_EXISTING_INTERFACES.json` und `docs/architecture/S01_EXISTING_INTERFACES.md` an 23 Quellen und 42 Zeilenbereiche gebunden. Drei vorhandene Inventardokumente verweisen auf dieselbe Karte. Zehn Schnittstellenbereiche sind getrennt; zehn View20-Originalinputs stimmen mit ihrem Plattformdonor überein. Keine neuen Websiteinputs: weiterhin 38/59 vollständig.

14 neue Verhaltenstests zeigen insbesondere die Trennung von generischem Kontosnapshot und botbezogenen Quellen, vorhandenen passiven Abgleich, unterschiedliche Quittungen, Historien- versus Bestandszähler und die unzureichende semantische Bindung im Websitevalidator. IF-11 und IF-12 bestätigen weiterhin offene Grenzen, keine Behebung.

## Reproduktion

```sh
python -B evidence/S01/interface-audit/run_checks.py \
  --node /absoluter/pfad/zu/node24 \
  --reports-dir /neuer/externer/berichtspfad
```

Linux, unprivilegierter Benutzer, Python3 und libseccomp erforderlich. Kein Download, kein Startskript, kein Broker. Die Source-/Package-Manifeste sind Integritätsnachweise, keine unabhängige Review. Der frische Endlauf und alle Exitcodes stehen im separat übergebenen `execution.json` und den Protokollen.

## Konkreter nächster Anschluss

Nicht nochmals die 21 fehlenden Websiteinputs suchen und nicht einen neuen passiven Positionsabgleich entwerfen. Der bestehende `core/reconciliation-read20.mjs` ist als Donor belegt.

Ein sinnvoller nächster privater Korrekturauftrag ist die **semantische Bindung der vorhandenen Fernansicht**: `core/remote-view20.mjs`, die bytegleichen `integrations/vercel-view20/lib/projection.mjs` / `baseline/vercel_recovered/src/lib/projection.mjs` und der vorhandene `view20-public/revolution.js` müssen Bestandsart und Zeilenfrische gemeinsam und sichtbar auswerten. Erst den IF-12-Gegenfall sowie Altbestand-/Cachekompatibilität präzisieren, dann gegebenenfalls einen minimalen separaten Patch an diesen vorhandenen Komponenten erstellen. Die konservierten Produktionsoriginale nicht überschreiben; keine zweite Datenbank, kein neuer Vertrag für den fehlenden Relay.

Der gegenwärtige Befund ist nur am Validator plus realem Producer ausgeführt; ein tatsächlicher `RemoteView20Service.receive`- und Verbraucher-Gegenversuch ist ein klarer nächster Integrationsnachweis. Die früheren Cloud-/Cachetests nicht als hierfür schon ausgeführt deklarieren. IF-11 ist zunächst eine mehrstufige Frischesemantik, keine automatische Verpflichtung, sämtliche historischen Zeilen zu löschen oder den Gesamtstatus falsch auf stale zu setzen.

## Unveränderte Grenzen

S01 ist nicht formal abgenommen, S02 nicht aktiviert. Keine Selbstfreigabe, keine GitHub-Schreibaktion, kein Deployment, keine Broker-/Kontoaktion. Fehlende finale Live-/Skin-Quellen bleiben blockiert; die View20-Teilansicht ist kein Ersatz dafür. Die Lesesuche nach neueren Übergaben war partiell und beweist keine globale Abwesenheit externer Dateien.
