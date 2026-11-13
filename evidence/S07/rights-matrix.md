# S07 – Herkunft, Nutzungszweck und ungeklärte Rechte

Diese Arbeit liest bereits vom Nutzer bereitgestellte Archive privat zur Qualitätsprüfung. Sie veröffentlicht keine Marktdaten und erteilt keine rechtliche oder Handelsfreigabe. Rohdaten bleiben außerhalb der Git-Historie. Nutzungsrechte sind zweckgebunden, nicht aus einem kostenlosen Download oder einem Code-Lizenzhinweis abzuleiten.

| Quelle | Tatsächlicher Beleg | Private Qualitätsprüfung | Spätere Forschung | Produktion / Website |
|---|---|---|---|---|
| Binance Vision Krypto-Spot | 240 mitgelieferte CHECKSUMs, Metadaten und eingefrorene Source-Dokumente; Retrieval laut Archiv 30.10.2026 | Durchgeführter aktueller Umfang | Archivierte Terms bezeichnen rein persönliche, nichtproduktive historische Forschung; konkreter späterer Einsatzzweck gesondert prüfen | Nicht freigegeben; keine Ableitung aus MIT-Codehinweis |
| HistData EURUSD 2024–2025 | 22 Original-ZIPs mit CSV und Statusdatei; kein gesonderter Signatur-/Lizenznachweis im Teil6-Archiv | Durchgeführter aktueller Umfang | Nutzung/Weitergabe und Brokerbezug ungeklärt; Zeitfehler zusätzlich sperrend für Replay | Nicht freigegeben |
| HistData 2004-Pilot | Separat als rejected_pilots archiviert | Nur Ausschluss nachgeprüft | Quarantäne; keine automatische Spaltenvertauschung | Gesperrt |
| Master-Labor-Monatsreihen | Sechs Sammlungstabellen + LAB04, Original-Extractor und historische Herkunftsmetadaten wiedergefunden; Anbieter-Roh-ZIPs fehlen weiterhin | Erhaltene 336-Monatsfenster und Code geprüft, keine neue Quelle bezogen | Revidierte USD-Forschungsreihen; Nutzungszweck und individuelle Rechte bleiben ungeklärt | Nicht freigegeben |
| Synthetische Gegenfälle | Neu gespeicherter Prüfcode | Tests, keine Marktdaten | Kein Performance-/Abdeckungsnachweis | Kein Handelsbeleg |

## Exakte Dokumentherkunft

Das Archiv enthält `adaptive_trading_lab/data_real/source_docs/TERMS_AND_CONDITIONS.md`, SHA-256 `99c4921dbe023cd68c1a447775707d621453cc78aec6ac0bfe2e6c06a5114ee0`, sowie `README.md`, SHA-256 `2e133d9945a9263a02781369078e72805eff074680f305cd5460016471c6caad`. Diese Bytes werden gegen das archivierte Inventar geprüft; das ist kein heute neu signierter Providerbeleg.

Öffentlich lesend gegengeprüft am 13.11.2026:
- https://github.com/binance/binance-public-data/blob/master/TERMS_AND_CONDITIONS.md — Version 1.0, angegebener Stand 26.08.2026, nennt private nichtproduktive historische Forschung und gesonderte kommerzielle Einschränkungen. Dieser Befund ist keine individuelle Rechtsberatung.
- https://www.histdata.com/f-a-q/data-files-detailed-specification/ — ASCII-Ticks mit Zeit/Bid/Ask/Volume, fixe EST ohne Sommerzeitanpassung.
- https://www.histdata.com/f-a-q/ — Volumen wird nicht geliefert; Datenlücken können auch Handelsunterbrechungen sein. Keine Vollständigkeitsgarantie daraus ableiten.

Die HistData-Zeitregel wird dokumentiert, aber durch den Original-Rücksprung vom 26.10.2025 nicht als widerspruchsfrei nachgewiesen. Keine Ursache (etwa Sommerzeit) wird ohne weiteren Beleg behauptet.

Aktuelle Webantworten wurden als Referenz geprüft, nicht als unveränderte vollständige HTML-Snapshots gebündelt. Die ursprünglichen mitgelieferten Binance-Dokumente bleiben dagegen vollständig im Originalarchiv erhalten. Kostenpflichtige Datenbeschaffung, Feedwechsel und öffentliche Weitergabe bleiben ausgeschlossen.

## Ergänzung: Master-Labor

Originalarchiv `Trading_Master_1_0_Arbeitsmaterialien.zip`, SHA-256 `35aaaa4eb8e40a7811f6a2ddc9a1b2991c0968b07cb8dbc08b25a1a5c95d0fb0`. Das gelieferte private Teilarchiv enthält 74 byteidentische Mitglieder (Monatsdaten, Transformcode und historische LAB04-Belege), keine Schriftdateien. Der Original-README bezeichnet bewusst nicht mitgelieferte Anbieter-ZIPs. Aufgezeichnete Anbieterhashes sind daher historische Angaben, keine neu verifizierten Rohbytes. Keine neue kommerzielle oder Weitergabeberechtigung wird erklärt.

Lesender semantischer Quellenabgleich am 13.11.2026: Kenneth-French-Datenbibliothek und Beschreibungen für US-Fünffaktoren sowie entwickelte Dreifaktormärkte. Die regionale Beschreibung nennt USD-Renditen und US-RF. Sie erklärt die im Archiv festgestellte RF-Differenz vom Juli 2025 nicht; Ursache bleibt offen. URLs und genaue Prüfaussagen stehen in `master-monthly/provider-references.json`. Die Daten wurden nicht aus einer aktuelleren Webfassung ersetzt.
