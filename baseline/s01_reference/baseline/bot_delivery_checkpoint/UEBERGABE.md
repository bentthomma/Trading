# S01 BotDeliveryRecovery – exakte Fortsetzungsübergabe

## Basis und neuer Stand

Vorgänger: `ExtremeLab_S01_RemoteViewIntegration_Offline.zip`, SHA-256
`70a42bcc7adec76792bf19a42b38ef74d0d1371e45793c7cbb20668bfc25f036`.
Originalspender: `baseline/original_release121_audit.zip`, SHA-256
`c7ed79c05ecfbdd1ba75e0974aa850de44d78ed265859621570d8a8dadc24c0c`.
Masterplan1.1.0 SHA-256
`60303e48156a187d065ad66e884398a71853e955a4acc1322ab8d9dd9d97ae7d`.

**38/59 vollständige Websiteinputs;21 fehlen.** Neu: tatsächliche Produktionsbytes
`src/build-bot.mjs` und `src/api/bot-download.js`. Die Originalarchive und die alten
36 Produktionsdateien sind unverändert. Kein formaler S01-Finish, kein S00-Finish.

## Nicht erneut von vorn bearbeiten

Die zwei Rekonstruktionen sind anhand vollständiger Provider-IDs und SHA-256 gebunden.
Der Originalbuilder extrahiert12 Original-Enginequellen exakt; danach absichtlich
Exit1 am offline verweigerten SDK-Download. Es gibt keinen neuen Binärbuild und
keinen Botstart. Der Originaldownloadtest besteht15 Prüfaussagen gegen die echte
Produktionsdatei, mit synthetischen Binärbytes. Sechs neue Download-Grenzmethoden
sowie sieben Quellen-/Buildermethoden sind vorhanden.20 relevante Inventarmethoden
wurden ausgeführt; nur deren Erwartungszähler36/23 wurde auf38/21 fortgeführt.

Der Paketprüfer und die vollständige Wiederholung aus dem endgültigen ZIP sind in
den externen Abschlussdateien nachgewiesen. Interne PREPACK-Ergebnisse sind nicht
mit dem externen Endbeleg gleichzusetzen. Ältere Runner/Ergebnisse bleiben historisch.

## Bekannte Grenzen

-21 fehlende Originalinputs: genaue Liste `evidence/S01/S01_MISSING_SOURCES.txt`.
-Weiterhin kein Overlay-/Skin-Gesamtbuild und kein finaler Skin-Reader.
-Kein tatsächlicher .NET6.0.428-/Automate1.0.21-Build; keine Binärdeterminismusbehauptung.
-Downloadhandler prüft Dateiinhalt, nicht unabhängig die Build-/Releasebehauptungen.
-Sein erfolgreich geladenes Modul hält einen geprüften In-Memory-Snapshot. Frisch
 geladene Module prüfen die Plattendateien neu. Fehlgeschlagene Kaltabrufe sind wiederholbar.
-Abgebrochener Originalbuilder räumt sein Tempverzeichnis nicht selbst auf; der Test
 entfernt ausschließlich seine eigene Wegwerfkopie. Nicht als Produktfix ausgeben.
-Providerkennungen sind Quellenbindungen, keine unabhängigen Freigaben.

## Exakter Folgeauftrag

Neue Vollquellen für die verbleibenden21 Produktionsinputs suchen, insbesondere
`live-overlay.b64`, `skin.0..8`, `build-ui.mjs`, `lib/relay.mjs` und die getrennten
1.4-/1.5-Build-/Downloaddateien. Nur neue Quellen oder begründete Originalfehlerhypothesen
weiter bearbeiten; keine identische Wiederholung dieser abgeschlossenen1.2.1-Stufe
als neuen Fortschritt. Bei neuen Bytes zuerst vollständige Quellenbindung, danach
Originalpipeline. Ein vorhandenes Zwischenmodul ersetzt den finalen Skin-Reader nicht.

Das ursprüngliche Release-Prüfarchiv selbst enthält zusätzlich historische
Buildmetadaten, aber kein `.algo`. Diese nicht als neu ausgeführten Build zählen.

## Reproduktion und Grenzen

`python -B tools/run_bot_delivery_checks.py --node /absoluter/pfad/zu/node --reports-dir /neuer/externer/logordner`

Linux/libseccomp, Python mit Brotli, Node24.x. Keine Downloads, Cloud- oder Brokeraktionen.
Masterplan, Gatecheckpoint und offizielle Statusdateien nicht ändern. GitHub ausschließlich
über Connector lesen. Keine Veröffentlichung/Installation ohne gesonderte Zustimmung.
