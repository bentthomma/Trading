# Native C#-Konformitätsprobe

Dieser Probe ist eigenständiger S02-Quellcode, kein cTrader-/Handelsbot und kein
produktiver Risikoprüfer. DTOs erhalten exakte Dezimal- und ID-Strings. Die native
JSON-Verarbeitung, konkrete Record-Typisierung und erneute Serialisierung müssen
mit den Python-/JavaScript-Bytes übereinstimmen.

Aus dem Repository:

```sh
python -B evidence/S02/check_native.py --output /neuer/externer/native-logordner --dotnet /absoluter/pfad/zu/dotnet
```

Benötigt ein tatsächlich installiertes .NET-SDK ab Version 8 mit zugehörigem lokalen
Referenzpaket. Der Runner kopiert ausschließlich diesen Probe in einen temporären
Ordner, nutzt das installierte Target Framework und leere NuGet-Paketquellen. Keine
Pakete werden heruntergeladen, keine Anwendungsquellen installiert oder gestartet.
Der vollständige S02-Runner sperrt zusätzlich Netzwerk-Verbindungsaufrufe.

Exit 0: echter Build und Roundtrip bestanden. Exit 1: ausgeführter Versuch fehlgeschlagen.
Exit 2: SDK fehlt; **kein** nativer Erfolg. Eine statische Quellprüfung ersetzt dieses
Ergebnis nicht. Keine C#-Semantikprüfung des gesamten Risikokerns wird behauptet.
