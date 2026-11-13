# S06 – Befund vor Änderung

Basis d3c1e0ba1aeb11cb9df30240622caa944d6fb2bd; Masterplan 1.2.0 unverändert.
Private isolierte S06-Vorarbeit nach der vorhandenen S05-Gebührenkorrektur.

Quellen: archivierte Plattform 0.9.7, vorhandener S05-Ein-Dateien-Kandidat.
Kein produktiver Writer für den neuen Orderzustand ist im untersuchten Core verdrahtet.
Die Tests komponieren den v2-Zustand ausdrücklich unter einem privaten Test-KV-Schlüssel.

Zu prüfen: SQLite-Vollsicherung und Vollrestore erhalten beliebige KV-Bytes,
Konfigurationsexport/-import hingegen nur Profile; Journalarchive exportieren ausschließlich
enginejournal-Belege, nicht generische Orderzustände. Der vorhandene Restore-Zieldigest
bindet ausgewählte Profileinstellungen, aber nicht den gesamten KV-Bestand.
Hypothese: neue Gebührenbelege nach Vorschau oder nach Vorbereitung werden ohne erneute
Zustandsentscheidung überschrieben. Erst reproduzieren, dann minimal korrigieren.

Keine neue Restore-Authority, kein Kontozugriff, keine native oder Produktfreigabe.
