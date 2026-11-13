# S01 – Addon-Build-Audit · Fortsetzungsübergabe

## Ausgangsbasis

Vorgänger: EndpointRecovery ZIP, SHA-256 `269436124048029d40921cbb35d30be254d67e6a4f815761cdee69676a2fdeba`, unverändert eingebettet. Masterplan 1.1.0 und `GATE_STATUS.json` unverändert. Private S01-Fortsetzung durch Nutzer autorisiert; kein kanonischer Abschluss.

## Erreicht

Der echte `build-account-addon.mjs` erzeugt sechs exakt archivgleiche Zwischenquellen aus dem produktionsgebundenen Payload. Nativer Import des echten `api/account-live.js` funktioniert auf diesen Erzeugnissen. Die 26 unveränderten Originaltests verwenden diese Module und ihre ursprünglichen synthetischen Providerantworten. Neun neue Original-Build-Grenztests und 20 S01-Inventarregressionen ergänzen die Prüfung. Vorverpackung: 55 Testmethoden, zwei gezielte Verhaltensmutationen erkannt; Endpaketprüfung separat neben dem ZIP.

**Quellanzahl unverändert: 36/59; 23 fehlen.** Die sechs Erzeugnisse erhöhen diese Zahl nicht. Sie liegen unter `baseline/derived_account_stage`, niemals als Ersatz im Provider-Eingabebaum. Originalarchiv `baseline/original_accountlive134.zip`, SHA-256 `6d01f3abb68974f5f6a6289138bb52f21cf6f9275a5fed1d388fe4ee21bc8b1b`.

## Wichtigster Integrationsbefund

Der lediglich 1500 Bytes lange authentisierte `build-ui.mjs`-Präfix zeigt spätere Schreiboperationen auf `lib/ctrader-readonly.mjs` und `public/konto-live.html`. Die endgültigen Skin-Readerbytes fehlen. **Die aktuellen 26 Readerprüfungen nicht als Prüfung des finalen Produktionsreaders ausgeben.** Auch `lib/market-reader.mjs` ist ein fehlendes Skin-Erzeugnis, kein zusätzlicher Providerinput.

Fehlgeschlagene Addon-Builds können Teilresultate beziehungsweise alle sechs Erzeugnisse hinterlassen. Ein späterer Addon-Wiederholungslauf kann den Ansichtsstufen-Link aus der Kontoseite entfernen. Beide Grenzen sind reproduziert, nicht behoben. Der geordnete Replay der Ansichtsstufe stellt den zuvor geprüften Zwischenbaum wieder her. Nur erfolgreiche frische Arbeitsstände verwenden; keine Existenzprüfung als Erfolgsersatz.

## Tatsächlich übergebene Werkzeuge

`tools/run_addon_checks.py --reports-dir <neuer externer Ordner>` prüft Originalbindungen, Originaltestlauf, neun Build-Gegenfälle, 20 Inventarregressionen, zwei temporäre Verhaltensmutationen, drei Paketmanipulationen und unveränderte Paketbytes. Linux/libseccomp, Python mit Brotli, Node 22.16.0. Kein Netzaufbau in Testkindern; keine echten Zugangsdaten. Nur die externe Abschlussprüfungs-JSON belegt den tatsächlichen frischen ZIP-Lauf.

## Nächster Arbeitspunkt, keine Wiederholungsschleife

1. Neue vollständige Originalquelle für Live-Overlay/Skin/übrige 23 Inputs beschaffen, falls ein tatsächlich vollständiger lesender Export oder ein neues Originalarchiv verfügbar wird. Aktuelle Connectorantworten bleiben gekürzt; keine wiederholten identischen Abfragen ohne neuen Zugriffsweg.
2. Neue Vollbytes gegen den vorhandenen Providerkatalog prüfen. Keine Ersatz-Reader oder erfundene Suffixe einbauen.
3. Danach Originalpipeline frisch ausführen, finale Schreibreihenfolge nachweisen und erst die dadurch erzeugten finalen Reader-/Handlerquellen prüfen.

Solange diese Fähigkeit fehlt, gilt `blocked_capability` für die betroffene Integration. S01-C02 erlaubt trotzdem das abgeschlossene Inventarvorbereiten; ein offiziell bestandenes Gate folgt daraus nicht. Die fünf vorhandenen S01-Lieferdateien wurden hierfür fortgeschrieben. Kein weiterer Claim-/Governancecontroller nötig.

GitHub dieses Aufrufs unverändert (Initialcommit, README allein). Keine Workflow-/PR-Abfrage dieses Mal. Keine Veröffentlichung, keine Brokeraktion, kein C#-Build und keine Wiederholung der vorherigen 78 EndpointRecovery-Tests.
