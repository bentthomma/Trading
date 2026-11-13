# S05-GAP-01 · bestehender Orderzustand 2 (privater Kandidat)

## Zweck und Begrenzung

Eine `DEAL_COST_CONFIRMED`-Meldung bezeichnet weiterhin **den vollständigen Gebührenbetrag
für genau einen Deal**, keine inkrementelle Belastung und keine allgemeine Cashflowbuchung.
Kontoumgebung, Plan und Intent werden vor der Übernahme mit `commonIdentity` geprüft.
Die tatsächliche Authentisierung und Normalisierung bleiben Aufgaben des bisherigen Hosts.
Eine syntaktisch gültige Meldung ist keine authentisierte Brokerbestätigung.

Nur `core/planning/order-lifecycle.mjs` wird in einer getrennten Kandidatenkopie geändert.
Der SQLite-Store, seine Tabellen, das Sender-/SDK-Verhalten und der Masterplan bleiben gleich.
Es gibt keinen zweiten Gebühren- oder Ledgerdienst. Keine Produktinstallation.

## Zustandsfelder

`schemaVersion=2` ergänzt:

* `costEvidence`: begrenzte Belegliste im vorhandenen Orderzustand. Jeder Eintrag bindet
  Event-ID, Hash des empfangenen Events, Intenthash, Zeit, Deal-ID, exakten Dezimalbetrag
  und Währung. `hash` bindet genau diese normalisierten Felder. Unbekannte zusätzliche
  Kostenbelegfelder werden beim erneuten Lesen abgewiesen. Der originale Empfangsbeleg
  muss vorhanden sein und denselben Eventhash besitzen.
* `fills[].feeBasis` bzw. `closes[].feeBasis`: ursprünglich beobachtete Gebühr oder explizit
  aus einem Altsnapshot erhaltene Gebühr, einschließlich Herkunftsmarker und eigenem Hash.
  Die Basis bleibt durch spätere Gebührenprojektion unverändert. Eine ursprünglich
  unbekannte Gebühr und ein bestätigter Nullbetrag sind unterschiedliche Zustände.
* `legacyCostGaps`: Verweise auf beim Upgrade bereits ungeklärte historische Kostenfälle.
  Ohne Rohereignis lässt sich aus einem gespeicherten Eventhash kein Betrag ableiten.
* `costs.pendingCostDealIds` und `costs.conflictedFeeDealIds`: abgeleitete, sortierte IDs,
  keine neuen Positionen oder gebuchten Geldwerte.

Die bisherigen 20.000 Eventbelege und 10.000 Deals bleiben Grenzen. Kostenbelege werden
nicht still gekürzt; der bestehende Eventgrenzwert weist neue Ereignisse zurück. Das
zusätzliche Speicher-/Latenzprofil bei vollständiger Grenzauslastung ist nicht gemessen.

## Projektion und Konflikte

Ein Kostenbeleg vor dem Fill/Close wird dauerhaft im selben Snapshot behalten. Ohne Deal
entsteht weder eine Position noch eine Gebührensumme. Erst ein exakt zugeordneter Deal
mit einem widerspruchsfreien Betrag erhält die Anreicherung. Ein identischer Eventretry
bleibt idempotent; andere Callback-IDs derselben Gebühreninformation zählen nicht doppelt.

Widersprüchliche Beträge oder Währungen bleiben als Kontokonflikt sichtbar. Ist die
ursprüngliche Ausführungsgebühr unbekannt, bleibt sie bei Widerspruch unbekannt – auch
wenn vorher bereits eine einzelne Gebührenmeldung vorläufig zugeordnet war. Ist die
Ausführungsgebühr bekannt, bleibt dieser originale Wert erhalten, aber der Konflikt
sperrt den vollständigen Abgleich. Ein solcher Wert ist nicht als konfliktfrei abgestimmt
zu bezeichnen. Es gibt kein 'neueste Meldung gewinnt', kein automatisches FX und keine
Löschung eines widersprechenden Kostenbelegs.

Nur der passende neue `DEAL_COST_WITHOUT_EXECUTION`-Vorfall wird bei widerspruchsfreier
Zuordnung aufgelöst. Andere IDs, Kontofehler, fehlende Historie und alte Verlustfälle
bleiben gesperrt. Gleiche wirtschaftliche Belege führen bei anderer Zustellreihenfolge
zur selben Mengen-/Gebührenprojektion; Reihenfolge und Zeitpunkt der Auditvorfälle müssen
nicht byteidentisch sein. Erhaltene Beträge sind Integritätsnachweise, keine Signaturen.
Wer die gesamte lokale Datenbank kontrolliert und alle Hashes neu bindet, liegt außerhalb
von Schutz und Nachweis dieser Änderung.

## Version 1, Upgrade und Rückfall

`validateOrderState` kann v1 weiterhin lesend prüfen. `reduceOrderEvent` und
`reconcileOrder` verlangen vor Änderungen ausdrücklich v2, andernfalls
`ORDER_STATE_UPGRADE_REQUIRED`. `upgradeOrderState` erzeugt eine neue, rein lokale
Zustandskopie; es schreibt nicht selbst in SQLite und sendet nichts. Bereits bekannte
Altbeträge werden mit `feeBasis.source=legacy_snapshot` erhalten, nicht nachträglich als
ursprüngliche Raw-Ausführungsbelege ausgegeben.

Ein Altbeleg, dessen Betrag nie gespeichert wurde, bleibt ungeklärt. Derselbe bereits
quittierte Retry wird nicht heimlich zur neuen Migration umgedeutet. Auch ein neuer
Kostenbeleg löst die historische Lücke nicht automatisch auf. Nur ein gesonderter,
quellengeprüfter vollständiger Journal-Replay kann den alten Verlauf rekonstruieren.
Die vorhandenen kontrollierten Testereignisse belegen diesen Replayfall; ein allgemeiner
Produkt-Replaywriter ist hier nicht implementiert.

Ein alter v1-Reader weist v2 zurück. Kein Downcast durch Änderung von `schemaVersion`.
Vor einer realen Migration ist die alte Rohfassung/Revision zu sichern; Migration,
Zustandsbuchung und Audit müssen im vorhandenen `Store.transaction` zusammen erfolgen.
Die Tests komponieren diesen vorhandenen Pfad in echten SQLite-Dateien. Sie installieren
keinen produktiven Writer. Nach neuer wirtschaftlicher Aktivität wäre ein bloßer Rollback
auf einen alten Snapshot unzulässig; aktueller Bestand müsste zuerst abgeglichen werden.

## Wiederanlauf, Retention und Nachweisgrenzen

Die Testkomposition schreibt den ganzen Orderzustand in den bestehenden KV-Speicher.
Zwei Kindprozesse werden vor/nach dem tatsächlichen SQLite-COMMIT mit SIGKILL beendet.
Ein zweiter Prozess liest jeweils den vollständig alten oder vollständig neuen Snapshot
und verarbeitet die Wiederholung genau einmal. Das ist kein Stromausfall-, Hardware-,
Windows- oder Crash-während-eines-Brokeraufrufs-Nachweis.

Die originale Eventretention wird mit einem gezielt erhöhten SQLite-Sequenzstand ausgeführt.
Der alte Ereigniseintrag verschwindet; der KV-Snapshot mit dem Kostenbetrag bleibt erhalten.
Das prüft die konkrete Retentionsroutine, keinen Langzeitbetrieb oder vollständigen Restore.
Ein gemeinsamer Datenbankrollback kann auch Kostenbelege zurückrollen; keine externe Authority.

Kein Cash-/FX-/Netto-PnL-Writer, keine Multi-Currency-Ausgleichsrechnung, keine native
Brokerparität und kein Sender wurden ergänzt. S02, AM-003 und formale Folgeschritte
bleiben unverändert offen.
