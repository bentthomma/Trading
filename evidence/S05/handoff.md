# ExtremeLab · S05 – Gebührenreihenfolge: aktueller Fortsetzungspunkt

Basis des Korrekturlaufs: `90a8a8b81679ec786832ea6d846d6af2183ae329`.
Masterplan1.2.0 unverändert; S00/S01 passed, S02 blocked, S05 formal pending.
Keine Reviewerpflicht und keine neue Veröffentlichungs-/Brokerbefugnis.

S05-GAP-01 ist im **privaten Ein-Dateien-Kandidaten** aus
`evidence/S05/fee-reconciliation/order-lifecycle.patch` korrigiert. Die vollständige
Kandidatenkopie wird nur in einem neuen temporären Originalbaum erzeugt. Originalquelle
und alte Charakterisierungstests bleiben unverändert und beschreiben weiterhin den
ungepatchten Ursprung. Die MPR1-Referenz wurde nicht neu erfunden.

Kostenbelege bleiben im bestehenden Orderzustand gespeichert, werden nach Fill/Close
zugeordnet, bei Duplikaten nur einmal berücksichtigt und bei Widerspruch gesperrt.
Schema2 mit explizitem v1-Upgrade, unbekannte Legacybeträge bleiben ungeklärt; kein
automatischer Downcast oder unbelegter Backfill. Details: `fee-reconciliation/state-contract.md`.

Vorbereitend116 unterschiedliche Methoden:38 neue,41 originale Orderregressionen,
12 relevante bisherige Ordergrenzen,25 bisherige Geld-/Schema-/Quellenprüfungen.
Drei statische Schemamethoden darin, keine C#-Ausführung. Zwei echte Prozessabbrüche,
originale SQLite-Transaktionen und Retention sind Bestandteil der Verhaltensmethoden.
Drei Originalgegenfälle sowie drei Mutationen separat; nichts doppelt zählen.
Die verbindlichen Endpaketergebnisse entstehen nach frischem Entpacken und liegen separat.

Nächster konkreter unabhängiger Auftrag: S06-Quellenabgleich der vorhandenen Journal-,
Export-, Backup-/Restore- und Wiederanlaufpfade mit dem v2-Kostenbelegzustand. Keine erneute
Gebührenkorrekturschleife, keine neue Datenbank oder Restore-Authority. Produktwriter,
Cash-/FX-Rechnung und native Identitätsparität bleiben getrennte spätere Integration.
Plan-/Gatezustände nicht aufgrund dieses Kandidaten ändern.

Reproduktion:
`python -B evidence/S05/fee-reconciliation/run_checks.py --sources /.../MPR1_LAB03_SelectedSources.zip --workbook /.../Trading_Start_und_Arbeitsbuch_1_0.pdf --output /neuer/externer/logordner --node /.../node`
Linux/WSL, Node mit node:sqlite, Python/jsonschema und libseccomp; keine Downloads.
Alle historischen Branchrefs und bisherigen privaten Inputs werden im äußeren Paket erhalten.
