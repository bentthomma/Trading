# S01 LiveEncodingFix – exakte Fortsetzungsübergabe

## Aktueller privater Stand

Arbeitskennung S01-LIVE-ENCODING-FIX. Vorgänger ist BotDeliveryRecovery mit
SHA256 `ad0e0b5fa25c68f62a4872680804193ae420399d84748be900c1263b933f8326`.
**38/59 Originalinputs,21 fehlen**, keine neue vollständige Produktionsquelle.
Masterplan1.1.0 SHA256
`60303e48156a187d065ad66e884398a71853e955a4acc1322ab8d9dd9d97ae7d`.
Originalquellen, ursprüngliche Regeln und offizieller Status bleiben unverändert.

## Erledigtes fachliches Paket

Der zuvor belegte gzip-q0-Fehler ist mit echten HTTP-Antworten reproduziert und
in einer einzigen separat abgelegten vorhandenen Handlerdatei korrigiert.
Der Vorschlag berücksichtigt q-Gewichte, Wildcards, Alias/Großschreibung,
Vary-Erhalt, kleine gzip-only-Antworten und tatsächliche Bytelängen.
Kein zweiter Produktserver oder Relay wurde gebaut. Nur der fehlende Relay
ist eine Testattrappe; HTTP und Security sind real.

`proposals/live-encoding/proposal.json` bindet Original und Vorschlag getrennt.
`live-encoding.diff` darf nur nach exakter Basishashprüfung angewendet werden.
Das ist kein genehmigter Installationspatch. Der original bekannte gzip-Fehler
bleibt deshalb im archivierten Original und auf einer unveränderten Installation
vorhanden. Nicht behaupten, er sei öffentlich behoben.

## Prüfung und Grenzen

Aktueller Runner: `tools/run_live_encoding_checks.py` mit absolutem Nodepfad
und neuem externen Logordner. Linux/libseccomp/Python+Brotli/Node22.16.0.
49 Methoden sind der vorgesehene positive Testumfang. Originalkonter18 und
Mutations-/Paketproben werden separat geführt. Maßgeblich sind die tatsächlich
beigefügten externen Endprotokolle, nicht historische Zahlen im Vorgänger.

Leere400/406 bei ungültiger bzw. unmöglicher Aushandlung und restriktive
Doppeleinträge sind explizite lokale Policyentscheidungen. Finaler UI-Client
und echter Relay müssen bei späterer Integration diese Antworten vertragen.
Keine volle RFC-, Cloud-, Browser-, Windows- oder Brokerabnahme.

## Eindeutiger nächster Schritt

Nicht erneut das1.2.1-Botpaket, den Accountzwischenreader oder denselben
HTTP-Patch als neue Arbeit prüfen. Für den Gesamtbuild fehlen exakt die
21 Pfade aus `evidence/S01/S01_MISSING_SOURCES.txt`. Die vier erneut abgeglichenen
Archive und der abgeschnittene Vercel-Skinbuilder lieferten keine Vollquelle.
Die Suche war partiell; ein vollständiger authentisierter Quell-Export oder neue
Originalarchive sind sinnvoller als weitere identische Präfixabfragen.

Bei neuen Bytes: vollständige Hashbindung, dann finale Relay-/Clientantworten
am vorhandenen Vorschlag prüfen. Vor Veröffentlichung unabhängiges Review und
gesonderte Installationserlaubnis. Kein Masterplanamendment, keine Selbstabnahme,
keine Broker-/Kontoverbindung und kein Start eines echten Handelsbots.
