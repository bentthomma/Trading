# Team und Dateibesitz

Die Hauptsession führt, integriert und verwaltet Plan-/Statusänderungen. Maximal zwei unabhängige fachliche Pakete parallel, keine rekursiven Agentenbäume.

| Rolle | Gegenstand |
|---|---|
| native_contracts | Echtes C#, .NET, DTO-/Einheitenparität |
| architecture_paths | Architektur, Verträge, AM-003 und Pfadzuordnung |
| hub_recovery | Node, Journal, SQLite, Wiederanlauf, NB-04 |
| ledger_risk | Geld, Gebühren, Orderzustände, Risikoinvarianten |
| data_causality | Rohdaten, Zeitachsen, Kausalität und Qualität |
| research_jobs | Forschungsjobs, Abbruch, Resume, Ergebnisregister |
| strategy_replay | Unveränderte Strategiereferenzen und Replay |
| protocol_security | Berechtigungen, Protokollgrenzen, Negativfälle |
| web_integration | Echte Endpunkte/Reader und Zustandsintegration |
| ui_motion | Bestätigte Referenzen, spätere responsive Gestaltung/Motion |
| test_engineer | Fachliche Gegenprüfungen, kein Pflichtreviewer |
| source_release | Quellen, Pakete, Hashes und bereinigte Exportauswahl |

Jeder Auftrag nennt Basisrevision, konkrete Schreibpfade, Ausschlüsse und Erfolgskriterien. Quellenprüfung ohne Dateizuweisung ist lesend. Zwei Rollen dürfen nicht dieselben Dateien bearbeiten. Die Leitung integriert erst einen eingefrorenen geprüften Stand.

Erster Block: native_contracts und hub_recovery. architecture_paths prüft danach die vorhandene Amendmentfolge. Fehlende Subagent-Unterstützung bedeutet serielle Ausführung, keine neue Projektblockade.

Konfigurationsformat geprüft anhand offizieller OpenAI-Dokumentation am 13.11.2026: https://learn.chatgpt.com/docs/agent-configuration/subagents und https://learn.chatgpt.com/docs/agent-configuration/agents-md . Im Zielclient tatsächlich validieren; Konfiguration allein startet keine Agenten.
