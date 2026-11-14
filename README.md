# Futter

Private Kalorien- und Lebensmittel-App für das iPhone (Progressive Web App).
Ohne Konto, ohne Werbung, ohne Tracking. Alle Daten bleiben auf dem Gerät.
Einzige Netzwerkverbindung: die Barcode-Abfrage bei Open Food Facts.

## Funktionen

- Tagesprotokoll mit Frühstück, Mittagessen, Abendessen, Snacks; Tagessummen und optionale Ziele
- Barcode: Live-Kamera, Foto (System-Kamera, ohne Berechtigungsabfrage) oder Nummer eintippen (mit Prüfziffer)
- Produkte von Open Food Facts werden lokal gespeichert; eigene Korrekturen haben immer Vorrang
- Manuelle Erfassung im Aufbau der EU-Nährwerttabelle (kJ ↔ kcal automatisch)
- Offline-Suche über Schweizer Nährwertdatenbank, Fineli, gescannte und eigene Lebensmittel, Rezepte
- Rezepte mit Gewicht nach dem Kochen und Portionen
- Verlauf (Woche/Monat) als Balkendiagramm
- Backup als JSON-Datei (Export über den Teilen-Dialog, Import mit Zusammenführen oder Ersetzen)

## Datenquellen

| Quelle | Stand | Heruntergeladen | Lizenz / Bedingungen |
|---|---|---|---|
| [Schweizer Nährwertdatenbank](https://naehrwertdaten.ch) (BLV) | Version 7.1 vom 01.07.2026 (Datei `Schweizer_Nahrwertdatenbank.xlsx`, Tabellenblatt „Generische Lebensmittel“, 1216 Lebensmittel) | 14.11.2026 | Freie Nutzung, auch kommerziell; Quellenangabe Pflicht ([opendata.swiss](https://opendata.swiss/de/dataset/naehrwerte_lebensmittel), [Downloadseite](https://naehrwertdaten.ch/de/downloads/)) |
| [Fineli](https://fineli.fi) (THL, Finnland) | noch nicht enthalten – siehe unten | – | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) laut [THL Open Data](https://thl.fi/en/research/open-data) |
| [Open Food Facts](https://world.openfoodfacts.org) | live per API | – | [ODbL](https://opendatacommons.org/licenses/odbl/1-0/) |

Die Quellenangaben stehen auch in der App unter **Mehr → Über**.

Übernommen werden nur: ID, Name, Kategorie, kcal, Eiweiß, Kohlenhydrate, Zucker, Fett, gesättigte Fettsäuren,
Ballaststoffe, Salz – jeweils pro 100 g. In der Schweizer Datenbank bedeuten „Sp.“ (Spuren) und „<x“ (unter der
Bestimmungsgrenze) 0, „k.A.“ wird als „unbekannt“ angezeigt.

### Datenbanken aktualisieren oder ergänzen

Die Rohdaten liegen in `quelldaten/` (wird nicht veröffentlicht).

1. **Schweiz:** Excel-Datei von <https://naehrwertdaten.ch/de/downloads/> nach `quelldaten/` legen, dann
   `node scripts/convert-naehrwertdaten.mjs` ausführen → erzeugt `data/foods-ch.json`.
2. **Fineli:** ZIP von <https://fineli.fi/fineli/en/avoin-data> herunterladen, nach `quelldaten/fineli/` entpacken, dann
   `node scripts/convert-fineli.mjs` ausführen → erzeugt `data/foods-fi.json`.
3. Datum und Version oben in der Tabelle eintragen, Versionsnummer erhöhen (siehe „Updates“), committen, pushen.

Fehlt eine der beiden JSON-Dateien, funktioniert die App trotzdem; die Datenbank erscheint dann in den
Einstellungen als „nicht installiert“.

## Technik

- Reines HTML, CSS, JavaScript (ES-Module). Kein Framework, kein Build-Schritt – die Dateien im Repository sind die App.
- Speicher: IndexedDB (`js/db.js`), Stores `products`, `customFoods`, `recipes`, `logEntries` (Index nach Datum),
  `foodMeta` (Nutzung, Favoriten, eigene Portionen), `settings`. `schemaVersion` mit Migrationslogik.
- Offline: Service Worker (`sw.js`), Cache-first für App-Dateien, Network-only für Open Food Facts.
- Barcode-Erkennung: **zxing-wasm 3.1.6** (MIT, <https://github.com/Sec-ant/zxing-wasm>), nur der Reader-Teil,
  lokal in `vendor/zxing-wasm/`. npm wird nur benutzt, um diese Datei einmalig zu beziehen.

```
index.html, manifest.webmanifest, sw.js
css/app.css
js/            App-Module (db, nutrition, text, foods, log, search, off-api, scanner, views/…)
vendor/        zxing-wasm
data/          foods-ch.json, foods-fi.json
icons/         App-Icons (erzeugt mit scripts/make-icons.mjs)
scripts/       Konvertierung, Icons, lokaler Webserver, Live-Test Open Food Facts
tests/         automatische Tests (Node)
quelldaten/    Rohdaten, nur lokal
```

## Lokal testen

```
node scripts/serve.mjs
```
Dann <http://localhost:8080/> öffnen.

```
node --test tests/
```
testet Portionsumrechnung, kJ/kcal, Natrium/Salz, Rezepte, Prüfziffern, Namenspriorität und die umlauttolerante Suche.

```
node scripts/test-off.mjs 4001686301265 7610097111072 6408430000258
```
fragt echte Barcodes bei Open Food Facts ab.

## Updates

Bei jeder Änderung an App-Dateien **beide** Versionsnummern erhöhen, sonst bekommen installierte Apps das Update nicht:
`CACHE` in `sw.js` und `APP_VERSION` in `js/version.js`. Neue Dateien zusätzlich in die Liste in `sw.js` eintragen.
Die App zeigt dann beim nächsten Öffnen „Neue Version verfügbar – Neu laden“.
