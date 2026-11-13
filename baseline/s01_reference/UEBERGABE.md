# ExtremeLab · Übergabe S01-NEGATIVE-ACK-RECEIPT

## Basis

Letzte bestätigte Basis: `ExtremeLab_S01_ControlAckBoundary_Offline.zip`, SHA-256 `33d560a6186b3e02794f8db57d70e98902e95960a5592e3768349e1ef6c40e89`. Der aktuelle Kandidat baut auf dessen Fristfix auf, nicht direkt auf einer älteren ungehärteten Datei. Die Originalbytes bleiben unverändert.

- Vorheriger Kandidat `core/control.mjs`: `02c2ab2bf9410bc0ea17b88f734b4e91d0f9762907694f0b146bb9d5d5937bae`.
- Neuer kumulativer Kandidat: `ef5fbc946409a3ad1a51f78ba75a0bfe95f181ff3f51e43e23c19b2ea09d7920`.
- Originalplattform: `6530c9c46cab0c6f411fdb682f3c74d4c9140742e698aa48c835bc60ba190c6d`.
- Masterplan 1.1.0 / S00 / S01 / S02: unverändert, keine formale Abnahme oder Aktivierung.

## Fertiggestelltes privates Arbeitspaket

Quellen und SDK-Vertrag abgeglichen; alte Defekte reproduziert; nur `Control.ack` im separaten Kandidaten geändert. Negative Belege werden einmalig im vorhandenen KV gespeichert. Authentisierung, Prüfung, Status und Audit sind transaktional verbunden. Exakte Duplikate akzeptiert, geänderte abgewiesen, kein Rücksetzen späterer Konfiguration, keine neue Freigabe.

Relevante neue Gegenfälle: Speicherfehler vor/nach Ereignisschreiben, zwei tatsächliche Prozessabbrüche um COMMIT, konkurrierender SQLite-Schreiber, Legacy-Ablehnungen aus Originalcode, Eventretention, Neustart und Token-/Runtimebindung. Kein SDK-/Brokerstart.

Die vollständige vorbereitende Suite besteht mit 87 unterschiedlichen Methoden (21 neu, 16 Vorgänger, 50 unveränderte Originalregressionen; insgesamt zwei statische SDK-Methoden). Die frische Endausführung nach ZIP-Entpacken ist separat protokolliert und allein für Aussagen über das gelieferte Endpaket maßgeblich. Drei Defektgegenfälle, drei Mutationen und drei Paketmanipulationen nicht addieren. Vorbereitungsfehlversuch wegen falscher SDK-Testreferenz bleibt in den Logs erhalten.

## Wirkliche Restgrenzen

1. **Legacy-Ablehnungen ohne Beleg:** expliziter 409 `ACK_RECEIPT_UNAVAILABLE`, keine nachträgliche Erfindung. Das ist eine genehmigungspflichtige Upgradeverhaltensentscheidung, kein Migrationsnachweis.
2. Das originale SDK kennt die neuen Detailcodes nicht, behandelt 409 aber terminal; generische Diagnose `HUB_HTTP_409`. Statisch abgeglichen, nicht nativ ausgeführt.
3. Receipts schützen im ACK-Pfad vor Überschreiben, nicht vor direkter DB-Manipulation, Downgrade auf alten Code oder gemeinsamem Datenbank-Rollback. Keine externe Restore-Authority.
4. S01-Originalinventar weiterhin 38 vollständige Websiteinputs von 59. Fehlende 21 Quellen weder ersetzt noch frei gegeben.

## Exakter Folgeauftrag

Am vorhandenen `sdk/HubBridge.cs`-/`sdk/HubProtocol.cs`-Fehler- und Wiederanlaufvertrag weiterarbeiten: Legacy-Ablehnung mit verlorener Antwort, identische Quittung nach Serverneustart, geänderter Payload, generische 409-Diagnose und sichere rein beobachtende Fortsetzung. Native Originaltests verwenden, sofern passende Werkzeuge tatsächlich vorhanden sind. Keine neue Transport-/Controller-/Quittungsarchitektur; niemals eine fehlende native Ausführung als bewiesen darstellen. Vor SDK-Patch Schema-/Error-Whitelist und Host-Fault-Reset-Vertrag exakt abgleichen.

Keine erneute allgemeine Suche nach denselben 21 Websitequellen oder Wiederholung unveränderter Gesamtsuiten ohne neue Hypothese. Keine Eigenfreigabe. Öffentliche Installation/GitHub-Schreiben/Brokeraktionen bleiben ausdrücklich unzulässig ohne gesonderte Freigabe.

## Reproduzierbarkeit

`python -B evidence/S01/negative-ack-audit/run_checks.py --node /absoluter/pfad/zu/node24 --reports-dir /neuer/externer/logordner`

Als unprivilegierter Benutzer; Netzwerkguard und Quellprüfungen sind Bestandteil des Runners. Die Archividentität und frischen Prüfprotokolle werden mit der finalen Lieferung zusätzlich bereitgestellt.
