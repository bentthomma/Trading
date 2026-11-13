# S03 – Freigabeumfang und spätere visuelle Abnahme

## Bereits bestätigte Grundlage
Die historische Nutzerentscheidung vom 11.11.2026 (Europe/Zurich) bestätigt ausschließlich
A01-r04, A02-r03, A03-r03, A04-r03 und A05-r03 als Desktopkonzepte. Alle tatsächlichen Bildbytes,
Abmessungen und SHA-256 sind im design-baseline.json gebunden. A01 führt den Stil; Forschungs-
Detailtiefe aus B ist keine weitere Bildfreigabe. Die Bildmaße sind **keine gemessenen CSS-Viewports**.
Frühere Varianten sind nur Historie. Beispielzahlen, Risikowerte und Verbindungssymbole gelten nicht
als Echtdaten, Kontoeinstellungen, wirtschaftliche Leistung oder vorhandene Funktionen.

## Was dieses Paket prüft – und was nicht
Es prüft Quellenbindung und Dokumentkonsistenz. Es implementiert keine Oberfläche, kein CSS,
keine Animation, keinen Modusschalter und keine Brokeraktion. Alle 32 DUX-Produktfälle und alle
14 Ein-/Ausgangspaare bleiben NOT_RUN. Das Betrachten der fünf Bilder ist kein visueller Vergleich
mit einer implementierten Website. Mobile, Tastatur, Screenreader, reduced motion und Laufzeit
bleiben nicht nachgewiesen. Kein geänderter Header „1.2.0“ wird in alte Freigabedokumente geschrieben.

## Später verbindliche Evidenz
S30 legt gemessene Tokens/Geometrie fest. S31 bindet vier Hauptansichten an dieselben Referenzen.
S32 bindet Einstellungen/Details samt Entwurf, ausstehender Quittung, Ablehnung und Konflikt.
S33 testet Eintritt, Austritt, Unterbrechung und schnelle Umkehr. S34 testet echte Geräte und
Barrierefreiheit. S35 führt diese Nachweise für genau einen Build zusammen. Die technischen
Vorgänger S21/S22/S25 bleiben Voraussetzung für Designimplementierung, nicht für diese Dokumentation.

Die Originalvorlage visual_acceptance_TEMPLATE.json bleibt unverändert. Der neue Zustandsspiegel
übernimmt ihre Fälle, Responsivegrößen und Bewegungsstartwerte ohne Erfolge vorzufüllen.
Für spätere PASS-Werte sind Build, Fixture, tatsächlicher Ablauf, Zeitpunkt und passende Evidenz nötig.
Statische Bilder und gute Hashes ersetzen keine Laufzeitmessungen. Helle Schrift auf Grün und
dekorative Rahmen erhalten keinen ungeprüften Kontrast-PASS; die bestehenden Vorgaben bleiben Ziele.

## S03-Kriterienbindung im vorbereiteten Paket
- C01: source-bindings/design-baseline/reference-preservation-report gleichen exakt fünf Referenzen ab.
- C02: navigation-map + route-compatibility + screen-state-matrix halten vier Hauptbereiche und ein Setup.
- C03: desktop_basis ist angenommen; jede Produkt-/Mobile-/Motionprüfung bleibt offen.
- C04: ausschließlich neue Dokument-/Nachweisdateien; alle 600 Basisdateien bleiben identisch.
- C05: jede Kennzahl/Aktion besitzt eine nachprüfbare Quelle oder einen ausdrücklich offenen Vertrag.

Das sind vorbereitete lokale Nachweise, **keine Aktivierung oder formale Abnahme von S03**.
S02-C01 und das vorhandene AM-003 müssen zuerst korrekt abgeschlossen werden. Danach wird gegen
die dann gültige Revision neu gebunden; alte Plangrenzen werden nicht durch ein Dokument umgangen.


## Nachprüfung der Datenbedeutung

`field-contracts.json` verknüpft alle 44 Elemente mit neun belegten Originalverträgen bzw.
ausdrücklich offenen Zielverträgen. Drei Timelinezuordnungen sind auf „Teilquelle vorhanden,
Zielvertrag offen“ korrigiert. `screen-state-matrix.json` enthält zusätzlich sechs Kombinationen
orthogonaler Zustände. `docs/ui/baseline/S03_DATENBEDEUTUNG.md` hält die vollständige Begründung fest.
Original-Core/SQLite-Beispiele sind Quellen-/Semantiknachweise, keine bestandenen DUX-Fälle.
Alle 32 DUX-Fälle, 14 Übergangspaare und mobilen Prüfungen bleiben NOT_RUN.
