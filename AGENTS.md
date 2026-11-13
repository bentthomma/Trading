# ExtremeLab – Arbeitsregeln

Lies zuerst `docs/handoff/CURRENT_STATUS.md` und `STARTPROMPT_CODEX.txt`. Neueste private Referenz: `66b04bfc8a46f0ef6b5b69b06f9b8c168f124783`. Der GitHub-Startsatz ist nicht der vollständige private Projektbestand; den Importstatus ehrlich prüfen.

## Autorität und Quellen
S00/S01 sind abgeschlossen. AM-002 entfernt die zwingende unabhängige Reviewerrolle. Technische Kriterien, Abhängigkeiten, Quellenbindungen und Designgates bleiben. Der Hauptagent darf regulär prüfen und abschließen, nie Statuswerte von Hand auf passed schreiben. Maßgeblich sind nach Wiederherstellung `governance/masterplan/plan.json`, `control/plan.lock.json` und `control/state.json`. Der ganze Codebaum ist noch kein fertiges laufendes Produkt.

Der konkrete Nutzerauftrag erlaubt jetzt den bereinigten Quelltransfer nach `bentthomma/Trading`. Private Rohlogs, Kontowerte, Geheimnisse, unveröffentlichte Datenrechte und Schriftdateien bleiben ausgeschlossen. Keine privaten Git-Bundles/Althistorien pushen, keine Force-Pushes und keine neue Deployment-/Brokerbefugnis. Ein Quellupload aktiviert keine Produktabnahme.

## Team
Nutze echte Unteragenten, soweit tatsächlich unterstützt. Zwölf Rollen in `.codex/agents/`; maximal zwei unabhängige Arbeitspakete parallel. Nur die Leitung integriert und schreibt Plan-/Lock-/Status. Unteragenten haben exakte Dateizuweisungen, keine eigenen Unteragenten und keine externen Schreibrechte. Kein Pflichtreviewer und keine erfundenen Thread-IDs. Fehlt Delegation, dieselben Aufgaben seriell ausführen.

## Erster Block
`native_contracts`: vorhandenen S02-C#-Probe mit echter Werkzeugkette ausführen; keine Attrappe. `hub_recovery`: NB-04/J13 am Originaljournal lösen, gültige Legacy-Merges aus J14 erhalten. Danach AM-003 nur über vorhandenen Änderungsweg und erst nach den erforderlichen Nachweisen. S03-/S04-/S05-/S06-/S07-Vorarbeit nicht nochmals neu anfangen.

## Arbeitspakete
Quellen prüfen, vorhandene unvollständige Arbeit fortsetzen, passende Negativtests und Regressionen ausführen, Fehler korrigieren, tatsächlichen Gitdiff/Hashes sichern. Große zusammenhängende Ergebnisse statt neuer Attrappenschichten und Statusschleifen. Private Inputs außerhalb öffentlicher Klons halten. Vorhandene neuere Stände niemals durch einen alten Bootstrap ersetzen.

## Belege und Grenzen
Historische Testzahlen, echte neue Läufe, statische Prüfungen und native Tests trennen. J13 ist noch ein offener Befund, kein behobener Fehler. Ein Blocker erlaubt unabhängige Vorbereitung, nicht das Überspringen abhängiger Produktintegration. Keine erfundenen Quellen, keine rückwirkende Belegumschreibung, kein Neuordnen von Rohdaten ohne versionierten Transformvertrag.

Kein Konto anbinden, keinen Live-/Demobot starten, keine Orders oder Schutzwerte ändern. Keine Website oder CI-Deploymentstrecke aktivieren. Keine Token in Logs, keine Sicherheitsfreigaben umgehen. Kein Hintergrundarbeitsversprechen. Am Laufende konkrete Änderungen, geprüfte Ergebnisse und Fortsetzung dokumentieren.
