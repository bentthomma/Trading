# ExtremeLab · S07 – Master-Labor-Monatsdaten und eingefrorene Ausgaben

## Ergebnis

Die sechs zusätzlichen Monatstabellen und die LAB04-Eingabe sind im vorhandenen Master-Arbeitsarchiv wiedergefunden. 7 Datensätze, 2.352 Datensatz-Monatszeilen und 10.416 numerische Werte wurden anhand der tatsächlich erhaltenen CSV-Bytes geprüft. Alle Reihen beziehen sich auf dieselben 336 Kalendermonate 1998-01 bis 2025-12; es sind nicht 2.352 unabhängige Zeitbeobachtungen. Die sechs Sammlungstabellen allein enthalten 9.744 Werte und 29 numerische Spalten.

Dies ist private S07-Vorarbeit, kein vollständiger Schrittabschluss, keine Anlagestrategie, kein neuer Performancebericht. S00/S01 bleiben bestanden, S02 blockiert; formale Folgeschrittzustände und Masterplan 1.2.0 bleiben unverändert. Keine Reviewerpflicht.

## 1. Quellen und Nachweisgrenze

Eingangsrevision: `1b4b1c254a1861aaa9c09b6edb616e770cee61f1`. Das vorherige S07-Projektarchiv wurde mit SHA-256 `6f8711efa996ea0d41056dbae24ac3e43a40b681d8ec2a2ef35575ca49f09e7e` und seinem Manifest bestätigt.

Zusätzliche Quelle: `Trading_Master_1_0_Arbeitsmaterialien.zip`, 90.594.027 Bytes, SHA-256 `35aaaa4eb8e40a7811f6a2ddc9a1b2991c0968b07cb8dbc08b25a1a5c95d0fb0`. Alle 1.284 ZIP-Mitglieder wurden beim Bezug auf ZIP-CRC geprüft. 74 relevante Mitglieder mit zusammen 1.505.297 unkomprimierten Bytes wurden bytegleich in ein eigenes privates Teilarchiv übernommen. Dieses enthält nur Monatstabellen, Originalskripte und archivierte LAB04-Belege, keine Fonts. Originalarchiv und originale CSVs bleiben unverändert.

Wichtig: Die Originalskripte und READMEs sagen ausdrücklich, dass vollständige Anbieter-Roh-ZIPs nicht mitgeliefert wurden. Für sieben Originalquellen sind deren Hashes aufgezeichnet, aber ihre Bytes fehlen im untersuchten Masterarchiv. Aktuell verifiziert sind deshalb die erhaltenen Ableitungen und deren Zeilen, nicht ein erneuter Raw-to-Derived-Lauf der damaligen Anbieterdateien. Aktuelle Downloads wurden nicht als identischer Ersatz eingeführt. Ein heutiger neuer Quellstand wäre eine neue Version.

## 2. Tatsächliche Datenprüfung

Der unveränderte Original-Collection-Verifier besteht mit 50 Prüfaussagen. Zusätzlich werden exakte Spalten, 336 lückenlose eindeutige Monatskennungen, strikte Dezimalzeichenketten, endliche Werte, Fehlwertkennungen und die unterschiedlichen Renditebedeutungen geprüft. Negative Long-short-Faktoren werden nicht als negative Preise behandelt; Total- und Cash-Renditen benötigen dagegen einen positiven Bruttofaktor.

`data/catalog/master-monthly-v1/point-lineage.csv` bindet jeden der 10.416 Werte an erhaltenes Archivmitglied, dessen SHA-256, physische CSV-Zeile, Spalte und Originaldezimaltext. Der Herkunftsgrad heißt ausdrücklich `preserved_derived_csv_not_upstream_raw`. Perioden sind Renditemonate und keine belegten Veröffentlichungszeitpunkte. Sämtliche Datenstände nennen 202609 in den archivierten Metadaten; diese Vintage wurde nicht aus neu heruntergeladenen Rohbytes verifiziert.

Die Originaltransformer rechnen Prozentwerte mit Decimal. Die sechs Collection-Reihen dividieren jeweils durch 100; LAB04 bildet `(Mkt-RF + RF) / 100` und `RF / 100`. Die erhaltenen Transformfunktionen wurden auf gekennzeichneten synthetischen Rohtabellen tatsächlich ausgeführt. Der originale Parser-Selbsttest hat 35 Prüfaussagen; er ist keine unabhängige Validierung der fehlenden Original-ZIPs.

## 3. Bestätigte Unterschiede zwischen ähnlichen Reihen

LAB04-US-Marktrendite und aus dem US-Fünffaktordatensatz rekonstruierte Marktrendite unterscheiden sich in **87 von 336 Monaten**. Größte absolute Differenz: **0,0006 Dezimalrendite**, also 0,06 Prozentpunkte bzw. 6 Basispunkte. Beispiel Januar 1998: LAB04 `0.0058`, US5F `mkt_excess + rf = 0.0057`.

Die drei Regionalreihen verwenden im Juli 2025 jeweils `rf = 0.0035`; US5F und LAB04 verwenden `0.0034`. Das sind drei abweichende Spaltenpaare, aber nur **ein betroffener Kalendermonat**. Die drei Regional-RF-Spalten wurden nicht als drei zusätzliche unabhängige Cashhistorien gezählt.

Die Unterschiede liegen in hashbestätigten erhaltenen Ableitungen. Die Ursache ist nicht bewiesen. Weder eine angebliche Providerrevision noch eine Rundungsursache oder ein wirtschaftlicher Schaden werden behauptet. Die Reihen bleiben getrennt; es gibt keine automatische Gleichsetzung aufgrund desselben Monats, derselben Bezeichnung oder desselben deklarierten Vintages. Alle Abweichungen stehen in `series-differences.json`.

## 4. Historische LAB04-Runs nicht erneut als neuen Holdout verkaufen

Die Entwicklungseingabe ist ein bytegenaues Präfix mit 264 Monaten bis 2019-12. Der vollständige Input umfasst 336 Monate; die damaligen letzten 72 Monate liegen 2020-01 bis 2025-12. Eingabekopien, Protokoll und Selection-Lock in den archivierten Entwicklungs- und Endverzeichnissen stimmen überein. Diese Prüfung bindet die vorhandenen Artefakte; sie führt keine Strategiewahl oder Performanceberechnung aus.

Das damalige Holdout wurde bereits verwendet. Dieselben Monate dürfen nicht als neuer unbekannter, prospektiver Test bezeichnet werden. Die Collection-Reihen sind kein unabhängiger Ersatz-Holdout allein aufgrund anderer Dateinamen. Zugleich beweist eine reproduzierbare Periodenfolge keine Point-in-Time-Verfügbarkeit der revidierten Renditen.

## 5. Reproduzierter Fehler und minimale Korrektur im Original-Extractor

`prepare_research_collection.py` erzeugte den Zielordner mit `exist_ok=True` und ersetzte seine Dateien. Ein synthetischer Gegenversuch legt einen vorhandenen eingefrorenen CSV-Stand an und ruft denselben Originalbuilder erneut auf: Er ersetzt die Datei ohne Ablehnung.

Der getrennte private Kandidat ändert genau **eine Zeile** zu `exist_ok=False`. Gleiche Eingaben in einem neuen Ordner erzeugen byteidentische Ergebnisse wie das Original. Vorhandene Ordner und verlinkte Ziele werden abgewiesen; sämtliche vorhandenen Bytes bleiben erhalten. Nach fehlerhaftem letztem Quellarchiv wird kein Ausgabeverzeichnis geschrieben. Ein IO-Abbruch während der Veröffentlichung kann weiterhin einen unvollständigen neuen Ordner hinterlassen; dieser wird nicht als erfolgreicher Datensatz ausgegeben und nicht still überschrieben. Es wird keine plattformübergreifende atomare Verzeichnisveröffentlichung behauptet.

Originaldatei und Patch bleiben separat; kein Produktreader, Brokeradapter oder bestehender historischer Datenstand wurde geändert. Der Kandidat wird unter `data/transforms/master-monthly-v1/prepare_research_collection.py` bereitgehalten. Für `--verify-packaged` an dieser zusätzlichen Ablage immer `--output-dir` auf die zu prüfende vorhandene Sammlung setzen; die alte Standardpfadannahme gehört zum Original-Masterlayout.

## 6. Gemeinsamer Katalog statt konkurrierender Register

Der vorhandene `prepare_catalog.py` ergänzt die neue Monatskomponente nach eigener Inhaltsprüfung in dieselben S07-Lieferdateien. Alle bisherigen Teil6-Produkte und ihre Quarantänen bleiben bestehen. Der Sammelverweis `monthly-factor-portfolios` erhält sieben konkrete Kinddatensätze und wird nicht selbst als einzelner ausführbarer Feed ausgegeben.

Die neue gemeinsame `catalogue_version` bindet beide Komponenten. Die alte `dataset_version` ist ausdrücklich nur die Teil6-Komponentenkennung; archivierte Runs werden nicht umgebunden. Monatstafeln erlauben hier nur den privaten Modus `monthly_returns_audit`. Minuten-/Intrabar-/Online-Entscheidungsmodi, kommerzielle oder öffentliche Weiterverwendung sowie Brokerbefugnisse werden vom bestehenden Kompatibilitätsprüfer nicht freigegeben. Rechte bleiben ungeklärt, nicht durch Hashes erteilt.

## 7. Neuer Testumfang und Restarbeit

Vorbereitend bestanden 31 neue unittest-Methoden und 32 relevante unveränderte Teil6-Decoder-/Kompatibilitäts-/Katalogmethoden, zusammen 63 unterschiedliche Methoden. Die 35 Original-Parserassertionen sind in genau einer neuen Methode enthalten; die 50 Original-Verifierassertionen werden zusätzlich als Auditassertionen ausgewiesen, nicht zur Methodenzahl addiert. Eine Rücknahme des Schreibschutzes und zwei abgeschwächte Datenregeln werden gezielt erkannt. Vier Monats-Auditdateien und drei kombinierte Katalogdateien sind reproduzierbar.

Der vollständige 40-Millionen-Tickscan wird nicht ohne neue Hypothese wiederholt. Die tatsächlichen Endpaketwerte entstehen erst nach frischer Entpackung und stehen in einem separat gelieferten Prüfbeleg. Gesperrte Netzwerkaufrufe und unprivilegierter Benutzer sind dort überprüfbar.

Offen bleiben die sieben originalen Anbieter-ZIPs für vollständige Raw-to-Derived-Parität, die Ursache der Reihenunterschiede, Rechte für andere Verwendungen und die ohnehin offenen S02-/Zielhost-/Produktgates. Gold-/Silber- und Einzelaktienpreisabdeckung wird durch monatliche Forschungsportfolios nicht erfunden. Keine Veröffentlichung, Installation oder Brokeraktion.

Nächster unabhängiger fachlicher Block kann S05 sein: die eng definierten MPR1-Kontogleichungen und Order-/Gebühren-Gegenfälle anhand des vorhandenen Original-Arbeitsbuchs vorbereiten, ohne Daten-/SDK-Blocker zum Anlass für einen neuen Controller zu nehmen. S07-Rohquellenparität bleibt ein präziser Beschaffungsauftrag, keine globale neue Suchschleife.
