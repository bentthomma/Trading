# ExtremeLab · S01 NegativeAckReceipt · PRIVATE OFFLINE

Fortsetzung von ControlAckBoundary. Ein methodenbegrenzter, nicht installierter Vorschlag bindet negative ACK-Wiederholungen an einen atomar gespeicherten Fingerabdruck.

## Dateien

- `evidence/S01/negative-ack-audit/candidate/core/control.mjs`: kumulativer Kandidat mit bestehendem Fristfix und neuer ACK-Bindung.
- `evidence/S01/negative-ack-audit/negative-ack-receipt.patch`: inkrementell auf den hashgebundenen vorherigen Fristkandidaten.
- `RUN_S01_REPORT.md`: technische Erklärung einschließlich Legacy-/SDK-/Restoregrenzen.
- `UEBERGABE.md`: exakter Fortsetzungspunkt, keine neue Abnahme.
- `baseline/negative_ack_checkpoint/`: unveränderte vorherige Einstiegstexte und Manifest.

## Reproduktion

Linux, unprivilegierter Benutzer, Python 3, libseccomp, GNU patch, Node >=24.10.

```sh
python -B verify_package.py
python -B evidence/S01/negative-ack-audit/run_checks.py --node /absoluter/pfad/zu/node24 --reports-dir /neuer/externer/logordner
```

Der Runner extrahiert das unveränderte Originalarchiv in Wegwerfkopien, prüft die alte Fehlerlage, wendet den inkrementellen Patch an, testet und nimmt die Patches bytegenau zurück. Nur AF_UNIX wird für Testkommunikation zugelassen. Der Test startet ausdrücklich keinen Handelsbot, verbindet kein Konto und setzt keine Produktivdaten voraus.

**Keine Freigabe:** Formaler Status unverändert. Alte negative Quittungen ohne Beleg werden nicht rückwirkend bestätigt. Native SDK-Tests/Windows/Cloud und die produktive Upgradeentscheidung sind offen. Nicht in eine bestehende Installation kopieren, als wäre diese bereits abgenommen.
