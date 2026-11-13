# S01 – Quellenstand, Versionsgrenzen und Umsetzungsscope

Offiziell `S01=pending`, da `S00` nicht abgenommen ist. Der private Kandidat vervollständigt die Quellenzuordnung ohne Statusmutation.

## Reale Quellräume
1. **GitHub `bentthomma/Trading`, `main=1a5cfe9d3139276f5432c79a8ee0be1938b7066c`**: einziger öffentlicher Blob `README.md`; Branchschutz und verpflichtende Checks aus. Kein Hub-Originalcode.
2. **Trading_Local 0.9.7 (Library-ID `file_00000000377c81f4aff2fc24694aaab0`)**: ZIP vollständig `6530c9…190c6d`, 1.028 Archiveinträge. Diese Quelle ist der aktuelle private, aber nicht produktionsintegrierte Prüfstand. Node24-Tests nur offline.
3. **Vercel-Produktion `extremelab-desk`**: 59 Provider-Eingabedateien (Quelle `vendor-manifests/vercel_prod_source_tree.json`), Build-Metadaten Node22. Das ist kein bestätigter vollständiger Git-Repositorystand und wegen abgeschnittener Antwortdaten kein rekonstruktionsfähiger lokaler Build. Die acht Stufen werden aus `src/build-release20.mjs` abgeleitet, nicht aus einem simulierten Pipelineplan.
4. **Vercel-Vorschau Engine1.9**: drei tatsächliche Deployment-Quelldateien; der Build lädt externes `delivery.json`. Die Remote-Quelle kann das Originalrelease nicht belegen, bis die Archive und `.algo` mit dem historisch genannten Hash vorliegen.
5. **Weitere Archivstände** 0.7, 0.8, 0.9.2, Observer alpha3 und AccountLive Addon bleiben versionsgetrennt. Das Addon ist nicht die vollständige Website.

## Formal offene Gates
- S00-C03/C05: unabhängiges CI-/GitHub-Trust-Root/Review/geschützter Writer fehlt.
- S01: keine Selbstabnahme; unabhängiger Reviewer und ursprüngliche Source-/Build-Evidenz. Native1.9 und vollständige Website lokal nicht nachgewiesen.
- S02 ff.: kein vorgezogener Produktcode, kein Broker-/Handelsbotstart, kein Deployment.

## Safe handoff
Bei weitergehender S01-Arbeit gezielt *unveränderte Originalbytes* der Vercel-Eingabedateien inklusive Assets und der alten Engine 1.9 gesichert beschaffen, Anbietergrenzen/Hash prüfen, vollständigen Website-Build nur in isolierter Umgebung mit gesicherter Toolchain reproduzieren. Fehlende Source-Rights/DPAPI/Windows-Abnahme ausdrücklich offen lassen.
