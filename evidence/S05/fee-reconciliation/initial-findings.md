# S05-GAP-01 – Ausgangsnotiz vor der Änderung

Basis `90a8a8b81679ec786832ea6d846d6af2183ae329`; geprüftes Eingangsarchiv
SHA-256 `30ad63852d60954a369bd3763fe3266a426477ad042755ff04d281ae3fd4ded4`.
Original `core/planning/order-lifecycle.mjs` SHA-256
`fc5c5c82f2b6dcdc73dba863a8abde35fd86728ea8261970cb375b934c2650d4`.

Die Originalfälle zeigen: Ein vor dem Deal eingehender Kostenbeleg hinterlässt einen
Vorfall und nur den Eventhash. Ein identischer Retry ist deshalb wirtschaftlich wirkungslos.
Es gibt noch keinen Produktwriter für den hier komponierten Order-/Store-Test.

Korrekturgrenze: nur eine private Kopie des vorhandenen Reducers, keine Datenbank/Tabelle,
kein Sender und keine Produktintegration. Versionierter Orderzustand 2 trägt Kostenbelege
und die ursprüngliche Gebührenbasis eines Deals. Version 1 bleibt lesbar, verlangt vor
neuen Änderungen eine ausdrückliche Migration. Verlorene Altbelege bleiben ungeklärt;
vollständiger Raw-Journal-Replay ist ein getrennter Anschluss, kein erfundener Backfill.

Prüfziel: Vor-/Nachlieferung, Teilfills, Close, dieselbe/andere Callback-ID, Konflikte,
Währung, exakte Dezimalwerte, Limits, beschädigte Zustände, echte SQLite-Persistenz,
zweiter Prozess, Rollback und originale Eventretention. Historische Geldfälle bleiben
unverändert. Kein S02-/S05-Statusabschluss, keine externe Aktion.
