# Prüfung der Wächtererweiterung 1.1

**Prüfer:** /root, getrennt vom Implementierungsagenten /root/plan_guard_design.  
**Datum:** 11. November 2026.  
**Geprüfter Code:** control/planctl.py.  
**SHA-256:** 3c6a73afb93225373806725d3e5fd85c67457a1c0305b11cac719d44358d3319.

## Umfang und Ergebnis

Die Änderung wurde auf ihren tatsächlichen Kontrollfluss, den bestehenden Amendmentweg, sichere Referenzpfade und die neuen Negativtests geprüft. Der Rootlauf des vollständigen Testsatzes bestand mit **47 Tests in 0,660 Sekunden**. Die unveränderten 32 bisherigen Tests und 15 neue Designprüfungen sind im vollständigen Testprotokoll unter evidence/plan_package_test_output.txt enthalten. Dies ist eine Prüfung des Steuerungswerkzeugs, keine Produkt-, Design- oder Handelsabnahme.

Das Planschema akzeptiert für jeden Designeintritt ausschließlich type, path, sha256 und scope; unbekannte Typen und zusätzliche Felder werden abgewiesen. Der Gatehash bindet die vollständigen Approval-Bytes an den gesperrten Plan. Approval und Referenzen werden relativ zu einem aufgelösten project_root gelesen. Relative Ausbrüche, absolute Pfade und externe Symlinks werden abgewiesen. Alle Bildhashes werden aus den tatsächlichen Dateien berechnet.

start prüft Aktivierung, Scope, technische Abhängigkeiten und die Referenzbindung, bevor Fortschritt geschrieben wird. verify liest die Referenzen erneut, bleibt selbst aber nur lesend. finish wiederholt die Nachweis- und Eintrittsprüfung vor dem Abschluss. status und next stellen fehlerhafte Referenzen als Blocker dar. validate prüft zusätzlich die Eintrittsvoraussetzungen bereits laufender oder bestandener Schritte; noch ausstehende Referenzdateien werden über status/next geprüft.

Die Tests enthalten den gültigen Ablauf mit fünf Referenzen, Start vor abgeschlossener Technik, fehlende und beschädigte Approval-Dateien, falschen Scope, geänderte Bilder, fehlende Bilder, unsichere Pfade, doppelte Referenzen, Schemafehler und Beschädigung nach dem Start. Auch ein CLI-Aufruf aus einem anderen Arbeitsverzeichnis wird geprüft. Bei erwarteten Prüfungsfehlern bleibt der Fortschrittsstand unverändert.

## Grenzen und Einordnung

Die Erweiterung behauptet keine externe Identitätsprüfung und führt keine Produkttests aus. Ein lokaler Hash beweist unveränderte Bytes, aber nicht deren fachliche Wahrheit. Wer gleichzeitig Validator, Plan, Lock und Status überschreiben kann, besitzt außerhalb dieses Werkzeugs weiterhin vollständige lokale Änderungsmacht. Die geschützte CI-Einbindung aus S00 bleibt erforderlich.

Der bestehende relock-Weg bindet Planänderungen an alte/neue Version, Hash und getrennte Prüferkennung. Er berechnet betroffene Schritte und Nachfolger selbst. Die S35-Rückkehr zu einer bestandenen Umsetzungskarte muss diesen Weg nutzen; es wurde kein zusätzlicher Force- oder Reopen-Bypass eingeführt.

Die Review des neuen Planinhalts und der Designvorgaben erfolgt getrennt in audits/final_plan_review.md durch den Agenten, der diese Plan- und Designdokumente nicht verfasst hat. Diese lokale Agententrennung wird nicht als bereits eingerichteter externer Repositoryschutz ausgegeben.
