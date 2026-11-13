# S03 – Konkrete Datenfelder, Zustandskombinationen und vorhandene Aktionen

**Geltung:** Ergänzung der bestehenden fünf Desktopreferenzen. Dokumentation und lokale
Quellenbeispiele, keine UI-Implementierung, kein neuer Endpoint und keine Handelsfreigabe.
Die Bildoriginale, Navigation und 32 späteren DUX-Fälle bleiben unverändert.

## 1. Drei Zuordnungen berichtigt

`recent_decisions`, `inspection_history` und `position_history` waren pauschal als vollständig
identifizierte Quellverträge bezeichnet. Der vorhandene `EngineJournal.view` liefert dagegen
begrenzte Projektionen, `counts`, Streamcursor und gruppierte `status.report.decisionReasons`.
Er liefert keine `events`-/`decisions`-Timeline. Ein separater Roharchivdownload existiert im
Originalserver, aber daraus entsteht nicht automatisch eine vollständige positionsbezogene UI-Chronik.
Die drei Einträge sind jetzt **Teilquelle vorhanden, Zielvertrag offen**. Keine neue Suchschleife:
S06/S09/S14/S21 müssen die entsprechende endgültige Projektion festlegen.

## 2. Konto- und Positionswerte richtig lesen

Der Observeraccount enthält Broker, ID, Umgebung, Typ, Währung, `equity` und `balance`.
**`freeMargin` fehlt.** Weder `equity - balance` noch die Abwesenheit eines Wertes ist freie Margin.
Das finale Margindatum braucht einen eigenen belegten Kontoreader; bis dahin „Nicht verfügbar“.
Die kompakte Fernprojektion enthält ebenfalls keine Equity-/Marginwerte.

`observation.coverage.positionCount` ist der gemeldete Zähler des Observerumfangs;
`observation.positions.length` ist die Zahl geladener Zeilen. `journal.counts.positions`
zählt dagegen gespeicherte Positionsberichte, die auch geschlossene und frühere Berichte enthalten.
Die Fernprojektion unterscheidet dies durch `counts.positionCountIsOpenInventory`.
Ein leeres Array bestätigt weder ein leeres vollständiges Konto noch eine geschlossene Position.

Beispiel aus dem echten Original-Core mit synthetischen Daten: **eine geladene Position,
zwei gemeldete Positionen, `fresh=true`, `status=incomplete`**. Die UI darf nicht allein
wegen Frische das Vollständigkeitssignal grün darstellen. Sie zeigt beide Eigenschaften.

In der Tabelle „Kurs“ muss zusätzlich die Art der Quote festgelegt werden. Der Observer liefert
`symbols[].bid`, `ask` und `quoteAt`, keinen eindeutigen `positions[].currentPrice`.
Es wird weder eine Bid-/Ask-/Mid-Auswahl geraten noch aus einem Bild eine Preisregel abgeleitet.
Dezimalwerte und Kennungen bleiben verlustfrei; das geprüfte Beispiel verwendet die ID
`9007199254740993` und den Preisstring `1.100000000000000001`.

## 3. Vier unabhängige Qualitätsmerkmale

Identität, Datenfrische, Datenumfang und Berechtigung bleiben unabhängig. Hinzu kommen bei
Handlungsanzeigen Entwurf-/Auftrags-/Quittungszustand. Ein einzelner grüner Status darf diese
Dimensionen nicht zusammenfassen.

| Tatsächlicher Fall | Anzeigevorgabe | Unzulässiger Schluss |
|---|---|---|
| Quelle frisch, Observerliste teilweise | „Aktuell gemeldet“ und „Unvollständig“, geladene/gemeldete Anzahl unterscheiden | Fresh bedeutet vollständig |
| Feed frisch, einzelne Position alt | Zeileneigene Quellzeit und veraltet markieren | Jüngster Heartbeat erfrischt die Zeile |
| Keine aktuelle Observerposition, ein historischer Bericht | Getrennte Abschnitte/Umfänge; fehlende Zuordnung kenntlich | Position wurde bestätigt geschlossen |
| Zwei Reports stimmen überein | „Meldungen stimmen überein“ | Brokerbestätigung / wirksamer Schutz bewiesen |
| Konto/Broker/Umgebung/Währung verschieden | Nicht zusammenführen; Auswahlkonflikt anzeigen | Gleiche native Nummer oder Symbol genügt |
| Originalplan unbekannt oder nicht geladen | „Originalplan nicht verfügbar“, Grund aus Projektion | Aktuelle Settings ersetzen damaligen Plan |

Der originale Abgleich liefert `nativeProtectionConfirmed=false`, `flatConfirmed=false` und
`brokerIndependentlyVerified=false`. Diese Tatsachen bleiben im UI sichtbar; es gibt keinen
neuen Schalter, um sie zu überschreiben. Ein vollständiger historischer Plan bleibt lesbar,
auch wenn die aktuelle Positionsmeldung veraltet ist.

## 4. Änderungen prüfen, bestätigen und verwerfen sind getrennt

Ein lokaler Formularentwurf ist noch kein Serverobjekt. Der bestehende
`POST /api/hub/bots/{botId}/proposals` speichert einen Vorschlag und ändert `desired/revision`.
**Diese Route ist deshalb keine schreibfreie Validierung.** Der spätere Button „Änderungen prüfen“
muss erkennbar zwischen lokaler Prüfung und expliziter Vorschlagserstellung trennen.
Das ist eine offene S21/S23/S32-Integration, keine in S03 aktivierte Aktion.

Die Bestätigung bindet Vorschlags-ID, Digest, Konto, Runtime und tatsächliche Basisrevision.
Die Rückgabe kann `pending` oder bei Wiederholung bereits `applied` sein. HTTP 200 allein
belegt keine Anwendung. Ein lokaler Entwurf kann verworfen werden; ein persistiertes
`proposed` besitzt eine eigene Cancel-Route. Ein `pending`-Auftrag darf nicht als unverändert
storniert dargestellt werden. Transportfehler lösen keine blinde Wiederholung aus.

Die Routen dienen hier nur als belegte Original-Schnittstellen. Keine davon wird gegen einen
laufenden Dienst aufgerufen. Ein `GET bot` kann intern Timeoutmetadaten durch `expire()`
nachführen; lesende UI-Absicht bedeutet nicht pauschal keine lokalen Datenbankschreibvorgänge.

## 5. Exakte Quellenstellen

`field-contracts.json` enthält die unten aufgeführten Originalverträge und **44 gebundene
Zeilenbereiche** mit SHA-256 über genau den jeweiligen Textausschnitt. `source-bindings.json`
bindet die vollständigen unveränderten Dateien/Archivmitglieder an den Basis-Gitstand.
Diese Prüfungen belegen Herkunft und dokumentierte Form, nicht zukünftige Produktintegration.

| Vertrag | Originalzugang | Grenze |
|---|---|---|
| `hub_bot` | `GET /api/hub/bots/{botId}` | Transportstatus, Vorschlagsrevision und tatsächliche Konfiguration sind getrennt. bot() kann über expire() lokale Timeoutmetadaten nachführen; GET ist keine Brokeraktion, aber nicht garantiert ohne lokalen DB-Schreibeffekt. |
| `observer` | `GET /api/hub/bots/{botId}/observation` | Gekoppelte Observermeldung, ausdrücklich kein unabhängiger Brokerbeleg. Nicht-atomarer Snapshot; fresh kann bei partial true sein. Kein freeMargin-Feld, kein originaler Plan (planId muss null sein). |
| `journal_projection` | `GET /api/hub/bots/{botId}/journal?limit={1..100}` | Neueste gespeicherte Projektionen pro Schlüssel und gruppierte Gründe, keine vollständige chronologische Entscheidungs-/Positionshistorie. counts.positions zählt Berichte, nicht offenen Bestand. Roharchive sind separat möglich, keine belegte finale UI-Timeline. |
| `reconciliation` | `GET /api/hub/reconciliation20?engineBotId={id}&observerBotId={id}` | Zwei Profile ausdrücklich auswählen; Konto, Broker, Umgebung und Währung müssen passen. Nie nach Symbol/Label oder nur Kontonummer joinen. Fehlender, mehrdeutiger oder korrupter Originalplan bleibt unbekannt. Übereinstimmende Meldungen sind kein unabhängig bestätigter Schutz. |
| `remote_projection` | `remote-view20 snapshot / validateRemoteProjection20` | Höchstens 20 Zeilen je Kategorie, ggf. weitere Kompressionskürzung. Nur paired_observer plus positionCountIsOpenInventory=true ist gemeldeter Bestandszähler. Empfangszeit ersetzt keine Quellzeit. Keine komplette Konto-/Originalplan-/Backupdarstellung. |
| `configuration_history` | `GET /api/hub/bots/{botId}/configuration-history` | Nur übernommene Konfigurationen, nicht Strategieentscheidungen, Brokerfills oder Positionshistorie. |
| `proposal_create` | `POST /api/hub/bots/{botId}/proposals` | Erzeugt persistenten Vorschlag und aktualisiert desired/revision; deshalb nicht als rein lokale oder schreibfreie Prüfung ausgeben. Erteilt keine Anwendung. Erneute gleiche Anfragekennung muss zum gleichen Request passen. |
| `proposal_confirm` | `POST /api/hub/proposals/{proposalId}/confirm` | Lokale autorisierte Bestätigung; zuerst pending, nicht angewandt. HTTP 200 kann auch bestehendes pending/applied zurückgeben; nur gebundenen Quittungs-/Readbackzustand auswerten. Die Aktion ist hier nicht freigegeben/ausgeführt. |
| `proposal_cancel` | `POST /api/hub/proposals/{proposalId}/cancel` | Nur gespeicherter proposed-Vorschlag; pending oder bereits versandte Änderung lässt sich nicht als unverändert verwerfen. Lokaler ungesendeter Entwurf ist davon getrennt. |

## 6. Vollständiger Elementindex

„Vorhandene Felder“ bedeutet nicht verbundenes Produkt. „Teilquelle“ benennt verfügbare
Rohinformationen, deren fachliche Zielprojektion/Interaktion noch fehlt. Ein offener Vertrag
ist ausdrücklich kein behaupteter Endpoint.

| Ansicht / Element | Zuordnungsstufe | Vertrag / Felder |
|---|---|---|
| overview · Botstatus | Vorhandene Felder | `hub_bot`: `bot.status`, `bot.runtimeBlocked`, `bot.releaseApproved`, `bot.controlBlocker` |
| overview · Aktueller Ansatz | Zielvertrag offen | `offen`: Kein fertig belegtes Zielfeld |
| overview · Beobachtete Märkte | Teilquelle; Ziel offen | `observer`: Kein fertig belegtes Zielfeld |
| overview · Offene Positionen | Vorhandene Felder | `observer`: `observation.coverage.positionCount`, `coverage.positionsComplete`, `fresh`, `reason` |
| overview · Forschungsjobs | Zielvertrag offen | `offen`: Kein fertig belegtes Zielfeld |
| overview · Beobachteter Chart | Zielvertrag offen | `offen`: Kein fertig belegtes Zielfeld |
| overview · Beobachtetes Setup | Zielvertrag offen | `offen`: Kein fertig belegtes Zielfeld |
| overview · Setupdetails | Zielvertrag offen | `offen`: Kein fertig belegtes Zielfeld |
| overview · Letzte Entscheidungen | Teilquelle; Ziel offen | `journal_projection`: `status.report.decisionReasons` |
| overview · Positionsvorschau | Vorhandene Felder | `observer`: `observation.positions[].id`, `observation.positions[].entry`, `observation.positions[].net`, `observedAt` |
| overview · Forschungsvorschau | Zielvertrag offen | `offen`: Kein fertig belegtes Zielfeld |
| overview · Eigenkapital | Teilquelle; Ziel offen | `observer`: `observation.account.equity`, `observation.account.currency`, `observedAt` |
| overview · Freie Margin | Teilquelle; Ziel offen | `observer`: Kein fertig belegtes Zielfeld |
| overview · Offenes Ergebnis | Teilquelle; Ziel offen | `observer`: `observation.positions[].net`, `coverage.positionsComplete`, `observation.account.currency` |
| observation · Markt-/Zeitebenenmatrix | Zielvertrag offen | `offen`: Kein fertig belegtes Zielfeld |
| observation · Datenstatus | Vorhandene Felder | `observer`: `fresh`, `status`, `reason`, `observedAt`, `receivedAt` |
| observation · Aktivität | Teilquelle; Ziel offen | `journal_projection`: `status.report.decisionReasons` |
| observation · Prüfverlauf | Teilquelle; Ziel offen | `journal_projection`: `status.report.decisionReasons`, `streams[].cursor`, `streams[].highWater` |
| observation · Marktauswahl und Filter | Zielvertrag offen | `offen`: Kein fertig belegtes Zielfeld |
| observation · Marktverlauf | Zielvertrag offen | `offen`: Kein fertig belegtes Zielfeld |
| research · Forschungsaufträge | Zielvertrag offen | `offen`: Kein fertig belegtes Zielfeld |
| research · Versuchsrahmen | Zielvertrag offen | `offen`: Kein fertig belegtes Zielfeld |
| research · Variantenvergleich | Zielvertrag offen | `offen`: Kein fertig belegtes Zielfeld |
| research · Netto, Rückgang, Trades und Kosten | Zielvertrag offen | `offen`: Kein fertig belegtes Zielfeld |
| research · Neuer Versuch | Zielvertrag offen | `offen`: Kein fertig belegtes Zielfeld |
| research · Forschungsjob abbrechen | Zielvertrag offen | `offen`: Kein fertig belegtes Zielfeld |
| research · Wissen und Hypothesen | Zielvertrag offen | `offen`: Kein fertig belegtes Zielfeld |
| positions · Bestandstabelle | Vorhandene Felder | `observer`: `observation.positions[].id`, `observation.positions[].units`, `observation.positions[].stop`, `observation.positions[].target` |
| positions · Anzahl, offenes Ergebnis und Margin | Teilquelle; Ziel offen | `observer`: `observation.coverage.positionCount`, `observation.positions[].net`, `coverage.positionsComplete` |
| positions · Positionschart | Teilquelle; Ziel offen | `observer`: `observation.symbols[].bid`, `observation.symbols[].ask`, `observation.symbols[].quoteAt` |
| positions · Ursprünglicher Plan | Vorhandene Felder | `reconciliation`: `positions[].originalPlan.state`, `positions[].originalPlan.planHash`, `positions[].originalPlan.values` |
| positions · Aktueller Schutz | Teilquelle; Ziel offen | `reconciliation`: `positions[].observer.values`, `positions[].engine.values`, `positions[].exitHealth.state`, `nativeProtectionConfirmed` |
| positions · Entscheidungsverlauf | Teilquelle; Ziel offen | `journal_projection`: `positions[].report.positionId`, `positions[].sourceTime`, `positions[].sequence`, `positions[].streamId` |
| positions · Plan ansehen | Zielvertrag offen | `offen`: Kein fertig belegtes Zielfeld |
| settings · Beobachten / Demo | Teilquelle; Ziel offen | `hub_bot`: `bot.environment`, `bot.runtimeBlocked`, `bot.releaseApproved` |
| settings · Neue Einstiege | Teilquelle; Ziel offen | `hub_bot`: `bot.runtimeBlocked`, `bot.controlBlocker` |
| settings · Positionsschutz weiterführen | Teilquelle; Ziel offen | `reconciliation`: `nativeProtectionConfirmed`, `positions[].exitHealth.state` |
| settings · Positions-, Margin- und Tagesverlustgrenzen | Teilquelle; Ziel offen | `hub_bot`: `bot.desired`, `bot.actual` |
| settings · Verbindung und letzte Meldung | Vorhandene Felder | `hub_bot`: `bot.status`, `bot.lastSeen`, `bot.runtimeId`, `bot.accountId`, `bot.environment` |
| settings · Änderungsübersicht | Vorhandene Felder | `hub_bot`: `bot.revision`, `bot.desired`, `bot.actualRevision`, `bot.actual`, `bot.proposals` |
| settings · Änderungen prüfen | Teilquelle; Ziel offen | `proposal_create`: `proposal.id`, `proposal.status`, `proposal.digest` |
| settings · Änderung bestätigen | Teilquelle; Ziel offen | `proposal_confirm`: `proposal.status`, `proposal.expiresAt`, `bot.actualRevision` |
| settings · Entwurf verwerfen | Teilquelle; Ziel offen | `proposal_cancel`: `proposal.status` |
| overview · Projektfortschritt im Detail | Zielvertrag offen | `offen`: Kein fertig belegtes Zielfeld |

## 7. Prüfung und formaler Rest

Sieben reproduzierbare Quellenbeispiele stammen aus der unveränderten bestehenden
Core/SQLite-Testfixture, nicht aus handgeschriebenen Erfolgsantworten. Ihre Eingaben sind
synthetisch; keine realen Konten wurden gelesen. Die unveränderten Originaltests des
Positionsabgleichs werden als eigener Prüfbereich ausgeführt. Keine neue Oberfläche,
C#-Ausführung, Browser-/Responsive-/Motionabnahme oder Brokerprüfung wird daraus abgeleitet.

S03 bleibt vorbereitete Dokumentation. Die noch offene technische S02-Abnahme und die vorbereitete
Pfadaktivierung werden nicht durch eine Dokumentdatei ersetzt. Die Reviewerpflicht bleibt entfernt.
Nach Erfüllung dieser Voraussetzungen: vorhandene S03-Fassung neu binden und den bestehenden
`verify`-/`finish`-Weg verwenden; keine weitere allgemeine Inventur nötig.
