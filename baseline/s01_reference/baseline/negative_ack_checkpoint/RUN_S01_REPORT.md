# S01 – Konfigurationsauftrag, Laufzeitquittung und Wiederanlauf

**Arbeitskennung:** S01-CONTROL-ACK-BOUNDARY. Private Prüfung und isolierter Ein-Dateien-Vorschlag; keine Installation oder formale Abnahme.

## 1. Tatsächlicher Ausgangsstand

In der Bibliothek wurden zwei neuere, parallele Arbeitspakete gefunden. Beide basieren auf InventoryConsolidation; keines ist ein durchgehender Nachfolger des anderen. Ihre ZIP-Hashes und exakten Manifeste wurden geprüft:

- InterfaceMap: SHA-256 `d75823854890646bcc804ff86941f89af4d36da02d9e2f3ac31e5a5bc22fc13a`, 359 manifestierte Dateien. Maßgebliche Fortsetzungsbasis mit dem ausdrücklichen Folgeauftrag zum Konfigurations-/ACK-Pfad.
- InterfaceBinding: SHA-256 `5f79259894050cf132caa2e436b1bd8ee01a393f92f89464e3236e4917c1b1e6`, 358 manifestierte Dateien. Paralleler Quellenabgleich; seine offenen IF-11-/IF-12-Fernansichtsbefunde werden nicht als behoben oder übernommen ausgegeben. Bericht, Übergabe und Manifest sind unter `baseline/control_ack_checkpoint/parallel_InterfaceBinding/` erhalten. Dies ist nicht dessen vollständiges Archiv.

Das unveränderte vollständige Plattformarchiv 0.9.7 hat SHA-256 `6530c9c46cab0c6f411fdb682f3c74d4c9140742e698aa48c835bc60ba190c6d`. Der Masterplan 1.1.0 bleibt hashgleich. Websitebestand unverändert: 38 von 59 vollständigen Originalinputs; 21 fehlen. Kein erneuter Suchlauf nach denselben fehlenden Dateien.

## 2. Reproduzierter Fehler im vorhandenen Steuerpfad

Der Original-Core behandelt einen Auftrag exakt bei `expiresAt` noch als gültig: `expire` verwendet `<`, die Auslieferung `>=`. Das vorhandene C#-SDK verlangt dagegen `command.ExpiresAt > serverTime`; vor der Anwendung prüft es zusätzlich seine aktuelle Uhr und lehnt bei `now >= ExpiresAt` ab.

Vier gezielte HTTP-Gegenfälle scheitern am unveränderten Original mit fachlichen Assertions:

1. Ein zuvor nicht ausgelieferter Auftrag wird genau zum Ablaufzeitpunkt erstmals übertragen.
2. Eine Quittung genau zum Ablaufzeitpunkt gilt noch als regulär statt als verspätete Zustandsklärung.
3. Der Zeitpunkt kann zwischen Ablaufprüfung und Auftragsauswahl die Grenze erreichen; die spätere Auswahl muss dieselbe strikte Gültigkeit einhalten.
4. Die Uhr kann beim Protokollieren der Auslieferung weiterlaufen. Im Original stammt `serverTime` dann von einer späteren Abfrage als die Auswahl. Die Antwort kann somit selbst behaupten, der mitgelieferte Auftrag sei bereits abgelaufen.

Dies wurde mit Originalserver, HTTP-Parser, Authentisierung, echter SQLite und gezielt injizierter Uhr geprüft. Die C#-Ablehnung ist aus dem gebundenen SDK-Quellcode abgeleitet, nicht durch einen neu ausgeführten nativen Build belegt. Es ist kein beobachteter Produktionsvorfall.

## 3. Begrenzte Korrektur

Eine getrennte Kopie von `core/control.mjs` enthält genau drei deklarierte Änderungen:

- Ablauf bei `expires_at <= now`.
- Auswahl nur bei `expires_at > responseTime`.
- Einmal erfasster Entscheidungszeitpunkt für Auswahl und `serverTime` der Antwort.

`source-bindings.json` bindet jede Ersetzung an die tatsächliche Originaldatei. Der Patch lässt sich mit GNU patch exakt vorwärts und rückwärts anwenden. Keine Strategie, kein SQL-Schema, kein Token-/Bestätigungsrecht und kein SDK-Code werden verändert. Originaldateien, bestehende Privatvorschläge und die fünf S01-Lieferdateien bleiben erhalten.

**Keine Zusage, dass die Zeit während Transport/Verarbeitung stillsteht:** Ein vor Ablauf ausgewählter Auftrag kann später beim Empfänger eintreffen. Die aktuelle Ablaufprüfung im nativen Callback bleibt deshalb erforderlich. Der Patch bindet den Metadatenzeitpunkt korrekt; er ersetzt diese zweite Prüfung nicht und verlängert keine Frist.

## 4. Durchgängig geprüfter bestehender Ablauf

Die Prüfung verwendet denselben bereits vorhandenen Unix-HTTP-Testtransport, keinen zweiten Hub oder nachgebauten Controller. Synthetische Nachrichten stellen die Bridge dar; es wird kein Handelsbot gestartet. Die Serveradapter für Broker, Provider, Ferntransport und Browserstart sind explizit verboten. Eine vererbte Linux-seccomp-Regel lässt nur AF_UNIX-Sockets zu; IPv4-/IPv6-Proben müssen scheitern.

Belegt sind Vorschläge über den echten MCP-Einstieg, getrennte menschliche Bestätigung, explizite Freigabe in der Testdatenbank, Auslieferung, Heartbeat ohne vorgezogene Anwendung, exakte ACK-Bindung und Wiederanlauf nach echtem Datenbankschließen/-öffnen. Beispiele:

- Vorschlag und Heartbeat allein machen gewünschte Werte nicht bestätigt.
- Nach Neustart wird ein ausstehender Auftrag nicht erneut ausgeliefert; die Sperre bleibt gesetzt.
- Ein bereits ausgelieferter Auftrag kann mit passender verspäteter Quittung abgeglichen werden. Dadurch wird keine Laufzeitfreigabe wiederhergestellt.
- Ohne vorherige Auslieferungsmarkierung wird die Quittung abgewiesen.
- Der genaue Wiederholungs-ACK einer angewandten Revision erzeugt keinen zweiten Anwendungseintrag und setzt eine neuere bestätigte Revision nicht zurück.
- Eine neuere gewünschte, noch unbestätigte Revision bleibt erhalten, wenn eine ältere ausgelieferte Revision erst später bestätigt wird.
- Konto-/Runtimebindung, Tokenwiderruf, Agenten-/Menschenrechte und Sperren bleiben wirksam.

C09 modelliert eine vom Aufrufer verworfene HTTP-Antwort nach dem echten Commit und anschließenden Neustart. Es ist ausdrücklich **kein** Prozess-Kill, Netzabbruch, Stromausfalltest oder Nachweis eines nativen Apply-Callbacks.

## 5. Separate, weiterhin offene Grenze C16

Eine ursprüngliche negative Quittung wird mit den damaligen tatsächlichen Werten akzeptiert. Nach einer späteren erfolgreichen Konfigurationsänderung wird ihre identische Wiederholung jedoch mit `REJECTION_STATE_UNCERTAIN` abgewiesen. Dieselbe alte negative Quittungsidentität mit den **neuen** aktuellen Werten wird dagegen als Duplikat akzeptiert.

Ursache: Vor der Duplikatbehandlung vergleicht `ack` die Ablehnungswerte mit dem aktuellen Botzustand; der ursprüngliche negative Payload wird nicht als unveränderlicher Empfangsnachweis gespeichert. Die Prüfung zeigt zugleich: kein zweiter Ablehnungseintrag, keine Rücksetzung der aktuellen Revision, keine neue Steuerfreigabe. Das ist eine Protokoll-/Idempotenzgrenze, kein belegter Handels- oder Authentisierungsbypass.

Der vorhandene SDK-Ablauf sendet zunächst seine ausstehende Quittung erneut, bevor er den nächsten Heartbeat absetzt. Die synthetische Spätduplikatfolge ist deshalb nicht automatisch ein normaler SDK-Ablauf. Eine Änderung an der dauerhaften Quittungsbindung müsste Bestandsdaten und diesen tatsächlichen Consumer berücksichtigen. Sie wird nicht stillschweigend in den Fristpatch eingebaut.

## 6. Ausführung und Grenzen

Der frische Endlauf und alle tatsächlichen Zähler stehen im externen `Abschlusspruefung.json` und den separat gelieferten Protokollen. Die Suite enthält 17 neue Methoden; C15 ist nur statischer SDK-Abgleich, C16 charakterisiert eine offene Grenze. Relevante unveränderte Regressionen betreffen Core, Ready20, Profillebenszyklus, Kontofreigabe und dauerhafte Laufzeitfehler. Vier Original-Gegenfälle, drei gezielt zurückgenommene Schutzkorrekturen und Paketmanipulationen werden nicht als zusätzliche erfolgreiche Produktmethoden gezählt.

Kein .NET-Werkzeug wurde in den geprüften Laufzeitpfaden gefunden; kein Download, nativer Build oder Botstart wurde versucht. Kein vollständiger Websitebuild, keine echte Kontoverbindung, kein Cloud- oder Windowsnachweis. Nur Quellenbelege und begrenzte Offlineausführung.

## 7. GitHub und formale Grenzen

Lesende Anbindung: `main=1a5cfe9d3139276f5432c79a8ee0be1938b7066c`, vollständiger Baum `47fdd2b4cb70efc67db93f93f178015259204d86` enthält nur README. Branchantwort `protected=false`. Kein separater Ruleset-/Workflow-/PR-Abgleich in diesem Lauf und keine Schreibaktion.

Die gesamte Fortsetzung bleibt private S01-Arbeit. S00/S01 werden nicht formal abgeschlossen; S02 wird nicht aktiviert. Die isolierte Kandidatendatei ist kein installierter Produktstand und keine neue freigegebene Gesamtfassung.
