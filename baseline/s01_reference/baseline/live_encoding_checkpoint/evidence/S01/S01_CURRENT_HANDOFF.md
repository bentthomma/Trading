# S01 verifizierte private Fortsetzung – Quellenrekonstruktion

**Masterplan 1.1.0, S00 nicht abgenommen, S01 pending.**

- Vorgänger S01 ZIP: SHA-256 `69cbd85b929c5cd6eaf0a0092ffabfade0d2d37b14e8f80d148361b4bf1ff55c`, unverändert unter `baseline/prior_s01_preacceptance_2026_11_12.zip`.
- Öffentliches GitHub `main` laut lesender Connectorprüfung: `1a5cfe9d3139276f5432c79a8ee0be1938b7066c`, nur README, ohne Branchschutz. Nicht als Quellbasis der Website ausgeben.
- Production-Vercel Source Tree: `dpl_6AuCdiuxGSFKnF7svRpykB7XRAmp` im Team `team_9CV4XJ0RQxIVJeMBBRqtfuGZ`. **28/59 Originalbytes** exakt SHA1-UID-gleich, mit lokalem SHA-256; **31 fehlen**. Nicht alle Vercel-UIDs sind Signaturen.
- 4 unveränderte `assets`-Segmente (`4fb080ee...` als SHA1 der Verkettung) lieferten durch reines Entpacken 5 Website-Dateien. Account-Addon sechs eingebettete Quellen unabhängig hashgebunden.
- Originales `postbuild-132.mjs` verweigert unbearbeitete Asset-Inputs, weil `live-overlay.b64` fehlt. Keine Mocks/Bypasses, keine vollständige Website-Buildabnahme. Unabhängige Account-Addon-/View-Skripte sind beim Wiederholen byte-idempotent; Addon-Tampering wird korrekt abgewiesen.
- Zwei echte historische Vercel-.NET6-Produktionsbuilds von **Engine1.2.1** mit identisch gemeldetem SourceSHA, aber verschiedener `.algo`-SHA-256 und 3 Byte Längendifferenz; kein Nachweis binär-deterministischer Reproduzierbarkeit und ausdrücklich **keine Engine1.9**.
- Quellenpaket 1.2.1 aus der Bibliothek separat 30/30 SHA256SUMS verifiziert, dessen Bindung zu den Vercel-Buildinputs aber nicht belegt.
- Die fünf geforderten S01-Lieferdateien sind aktualisiert. `plan.json`, `control/plan.lock.json`, `S00`-Gates und GitHub-Original bleiben unverändert.

## Nächster Schritt
Die 31 fehlenden Vercel-Dateibytes und die exakten originalen Ready19-Bytes auf zulässigem **lesenden** Weg sichern; danach die vollständige 8-Stufen-Buildfolge mit den echten Inputs isoliert reproduzieren. Anschließend unabhängige Fach- und Gateprüfung; keine S01-Finish-Aktion vor S00.
