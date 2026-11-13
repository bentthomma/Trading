# ExtremeLab · Masterplan 1.0

## Einstieg

1. MASTERPLAN.pdf oder MASTERPLAN_KOMPLETT.md lesen. MASTERPLAN.md enthält die kürzere Übersicht ohne die 30 Arbeitskarten.
2. Die drei Bestandsaudits und website_audit.md für konkrete Quellen-/Funktionsbelege verwenden.
3. plan.json ist der einzige operative S00–S29-Plan. Alte AP01–AP26 stehen im Crosswalk als Referenzen.
4. control/README_DE.md lesen; danach validate und next ausführen.
5. Zu Beginn ist ausschließlich S00 bereit. Es wurde kein Produktfortschritt behauptet.

## Ausführung

Python ab 3.10 genügt für den Wächter; keine zusätzlichen Pakete, keine Netzwerkverbindung und kein Brokerzugang erforderlich.

Globale Optionen stehen vor dem Unterbefehl. Beispiel: python3 control/planctl.py --project-root /absoluter/pfad status.

Die mitgelieferte Plansperre wird unverändert mitkopiert. Nicht löschen, um einen Fehler zu umgehen. Legitime Änderungen benötigen das dokumentierte versionierte Amendment.

Die erstmalige Sperre aus dem Bootstrap in S00 ist für dieses ausgelieferte Paket bereits erzeugt. Beim Übernehmen des Pakets wird sie geprüft und erhalten; sie wird nicht durch einen neuen Lock umgangen. Die CI-Einbindung und alle Produktaufträge bleiben offen.

## Inhalt

- 30 Arbeitskarten, davon 28 im Kernplan und 2 ausdrücklich optionale Erweiterungen.
- 211 konkrete Teilaufgaben und 123 deklarierte Abnahmeprüfungen.
- Vollständige Zuordnung zu den historischen 26 AP.
- Ausführbarer Planwächter samt isolierten Tests.
- Vorlagen für Auftrag, Architekturentscheid, Planänderung, Fehler, Übergabe und Abnahme.
- Sechs zusätzliche Forschungsvorlagen mit absichtlich gesperrtem Entwurfsstatus.
- Quelleninventar, Kapitelindex, Donor-/Bot-/Plattform-/Dokumentaudit.

## Grenzen

Dies ist das Plan- und Ausführungspaket. Die Website wurde nicht verändert, keine neuen Strategieläufe ausgeführt und kein Handel aktiviert. Der lokale Wächter prüft Struktur/Dateiintegrität; vertrauenswürdige CI und getrennte Reviewer müssen die tatsächliche Ausführung und Identität belegen.

S01/S02 lösen reale Quellpfade auf; bis zum geprüften Amendment sind S03–S29 scope-blockiert. Fehlende native Quellen blockieren betreffende Integrationen, nicht das bewusst getrennte Offline-Labor.
