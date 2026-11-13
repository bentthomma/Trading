# WEB-01 · Aktuelle ExtremeLab-Website

Beobachtet am 11.11.2026. Rein lesende Bestandsaufnahme; keine Anmeldung mit Zugangsdaten, keine Parameteränderung, kein Upload und kein Deploy.

## Tatsächlich besuchte Seiten

- https://extremelab-bt.vercel.app/ — Titel Trading, Kontoübersicht.
- https://extremelab-bt.vercel.app/konto-live.html — dieselbe gestalterische Kontofläche.
- https://extremelab-bt.vercel.app/journal.html — Titel ExtremeLab 1.3.3 · Decision Desk; private Anmeldemaske, kein Brokerpasswort verlangt.
- https://extremelab-bt.vercel.app/revolution.html — Th3R3v0lut10n 2.0 · Online-Ansicht; als technischer Integrationskandidat und nur lesend bezeichnet.

Geöffnet wurden Märkte, Parameter, Statistik und Verlauf. Es war kein Konto verbunden; Kontowerte/Chart zeigten korrekte leere Zustände. Die Statistik unterscheidet beobachtete Kontowertänderung von nachgewiesenem Tradinggewinn und zeigt für fehlende bestätigte Abschlüsse keinen Profitfaktor.

Regeln stehen als lokaler Entwurf: Änderungen sind nicht an den Bot übertragen. Sichtbare Grundfelder sind Zielpuffer, Risiko pro Trade, Positionsgrenze, Puffer und Zielabbau; weitere Parameter liegen in einem Dialog. Diese Werte sind UI-Entwürfe, keine in dieser Prüfung bestätigte native Konfiguration.

Die Revolution-Seite beschrieb eine Kopplung für genau ein Botprofil/ein Demokonto, Übertragung alle30 Sekunden, Ablauf nach30 Tagen, Widerruf spätestens nach5 Minuten und separate Quell-/Übertragungszeit. Die Ansicht meldete fehlende bestätigte Zugangs-/Kontozuordnung. Der Serverablauf wurde nicht authentifiziert Ende zu Ende geprüft.

## Gestaltungsbasis aus gerendertem DOM

| Token | Wert |
|---|---|
| Hintergrund | #070a08 |
| Panel | #0b0f0d |
| Rand | #1d2621 |
| Grün | #26dc77 |
| Primärtext | #edf1ee |
| Sekundärtext | #89968e |
| Fokus | #70e8a5 |
| Fehler | #f1646e |
| Hinweis | #dbb36b |

Schrift: Inter mit Systemfallback, Basis14px. Große Karte:17px Radius; geprüfter Button:9px Radius. Layout: obere Icon-Navigation, Kontokacheln, großer Chart links, Regeln rechts, darunter Positionen/Ergebnis/Margin. Die Entwicklung bewahrt diese Identität; exakte Responsive-/Kontrastabnahme ist S03/S21.

## Produktions- und Quellbeobachtung

Projekt extremelab-desk; Produktionsdeployment dpl_6AuCdiuxGSFKnF7svRpykB7XRAmp; Domain extremelab-bt.vercel.app. Aktuelle Konfiguration Node22.x und maxDuration60s. package.json meldet1.3.1; die UI-Version1.3.3 wird durch einen vorhandenen Patchpfad zumindest erklärt. Vollständige Releaseidentität bleibt S01.

Der Dateibaum zeigt echte lib/{projection,service,http,security,storage,relay}.mjs, api/revolution.js, view20-public/ und Buildwrapper. 41 Dateien wurden ausgelesen;18 vollständig,23 als Toolpräfixe. Weitere gepackte Assets/Overlays sind für einen reproduzierbaren Build erforderlich. Das Quellenmanifest unterscheidet COMPLETE von PREFIX_ONLY_TOOL_TRUNCATED; beobachtete Präfixhashes belegen keine ganzen Dateien.

Keine Browser-Screenshots sind als Nutzerdeliverables in diesem Paket enthalten. Sicht- und Zustandsbeobachtung ist hier textuell dokumentiert.
