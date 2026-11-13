# Fachliche Verträge · Entwurfsstand

Diese Verträge definieren den erforderlichen Integrationsumfang. Sie sind keine bereits implementierten Endpunkte oder Brokerfähigkeiten.

## Gemeinsame Ereignishülle

Jedes Ereignis trägt schema_version, event_id, source_id, run_id, bot_id, account_ref, instrument_version, event_time, available_at, received_at, sequence, payload_hash und payload.

Wirtschaftliche Zeit, Empfangszeit und Verfügbarkeit sind verschieden. Eine Event-ID und fortlaufende Sequenz sind kein vollständiger Beweis, dass die Quelle alle Ereignisse geliefert hat; coverage und gap_state gehören in die Datenprojektion.

## Zahlen und Einheiten

- Geld als kanonische Dezimalzeichenkette plus ISO-Währung; keine stillen float-Summen für Gebühren.
- Preis als Dezimalzeichenkette plus Instrumentversion/Raster.
- Menge als Dezimalzeichenkette plus explizit Stück, Units oder Lots und Konversionsversion.
- Volumen-, Pip-, Tick-, Kontrakt- und FX-Werte niemals anhand des Symbolnamens erraten.
- Zeit in UTC und eindeutige Ereignisreihenfolge; Anzeige kann lokal erfolgen.
- Indikatoren dürfen endliche Floatwerte mit versionierter Formel und numerischer Toleranz verwenden.

## Fachobjekte

InstrumentVersion, DatasetManifest, Quote, Bar, FeatureSnapshot, PatternEvent, SignalIntent, OrderIntent, BrokerOrder, Deal, Position, Cashflow, RiskReservation, PolicyVersion, ResearchJob und RunResult.

## Zentrale Zustandsgrenzen

Signal ist keine Order. Orderabsicht ist kein Fill. Fill ist keine bestätigte Schutzänderung. Empfang ist keine Persistenz. Hub-ACK ist kein Broker-ACK. Lokaler Regelentwurf ist keine aktive Policy. Forschungsresultat ist keine Freigabe.

Vor möglicher nativer Übertragung wird DISPATCH_MAY_HAVE_STARTED dauerhaft vermerkt. Ein Prozessabbruch kann einen unklaren Zustand hinterlassen. Er bleibt reserviert und wird reconciled; es gibt keinen blinden Retry und kein angenommenes netzwerkübergreifendes Exactly-once.

## Forschung

Ein Job benötigt gültige Policy-/Engine-/Datenhashes, vollständiges Protokoll, erlaubte Fähigkeiten, Suchbudget, Ressourcenbudget und Idempotenzschlüssel. DRAFT, null in Pflichtfeldern und ready_to_run=false sperren den Start auf Server und Worker.

Die detaillierten Forschungsentwürfe liegen in templates/research/. Die dortigen JSON-Pointer-Prüflisten sind erst nach vollständiger Implementierung fachliche Startgates.
