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

## Installation auf dem iPhone

Adresse: <https://joejiggle.github.io/FoodTrackerApp/>

1. Die Adresse in **Safari** öffnen (nicht in Chrome o. Ä.).
2. Unten auf **Teilen** (Quadrat mit Pfeil) tippen → **Zum Home-Bildschirm** → **Hinzufügen**.
3. Die App ab jetzt immer über das Symbol „Futter“ auf dem Home-Bildschirm starten.

**Kamera:** Beim ersten Live-Scan fragt iOS nach der Kamera → **Erlauben**. Damit seltener gefragt wird:
Einstellungen → Apps → Safari → Kamera → **Erlauben**. Ohne Freigabe funktionieren „Foto aufnehmen“ und
„Nummer eingeben“ trotzdem.

**Backup:** Mehr → Backup exportieren → im Teilen-Dialog „In Dateien sichern“ (z. B. iCloud Drive).
Wiederherstellen: Mehr → Backup importieren → Datei wählen → Zusammenführen oder Ersetzen.

## Änderungen einspielen

PowerShell öffnen und eingeben:

```
cd $HOME\Projekte\futter-app
claude
```

Gewünschte Änderung beschreiben und am Ende „committen und pushen“ sagen. Nach ein bis zwei Minuten zeigt die App
„Neue Version verfügbar – Neu laden“.

## Datenquellen

| Quelle | Stand | Heruntergeladen | Lizenz / Bedingungen |
|---|---|---|---|
| [Schweizer Nährwertdatenbank](https://naehrwertdaten.ch) (BLV) | Version 7.1 vom 01.07.2026 (Datei `Schweizer_Nahrwertdatenbank.xlsx`, Tabellenblatt „Generische Lebensmittel“, 1216 Lebensmittel) | 14.11.2026 | Freie Nutzung, auch kommerziell; Quellenangabe Pflicht ([opendata.swiss](https://opendata.swiss/de/dataset/naehrwerte_lebensmittel), [Downloadseite](https://naehrwertdaten.ch/de/downloads/)) |
| [Fineli](https://fineli.fi) (THL, Finnland) | Release 20.0 (Basispaket `Fineli_Rel20.zip`, 4238 Lebensmittel; Namen englisch, finnisch, schwedisch) | 14.11.2026 | © THL, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (laut `descript.txt` im Paket und [THL Open Data](https://thl.fi/en/research/open-data)) |
| [Open Food Facts](https://world.openfoodfacts.org) | live per API | – | [ODbL](https://opendatacommons.org/licenses/odbl/1-0/) |

Die Quellenangaben stehen auch in der App unter **Mehr → Über**.

Übernommen werden nur: ID, Name, Kategorie, kcal, Eiweiß, Kohlenhydrate, Zucker, Fett, gesättigte Fettsäuren,
Ballaststoffe, Salz – jeweils pro 100 g. In der Schweizer Datenbank bedeuten „Sp.“ (Spuren) und „<x“ (unter der
Bestimmungsgrenze) 0, „k.A.“ wird als „unbekannt“ angezeigt. Bei Fineli wird Energie von kJ in kcal umgerechnet
(÷ 4,184) und Salz von mg in g; fehlt Salz, wird es aus Natrium berechnet (× 2,5). Zusätzlich übernommen: die
Fineli-Portionsgrößen „mittlere Portion“, „1 Stück“, „1 Stück (Hersteller)“, „1 dl“.

### Datenbanken aktualisieren oder ergänzen

Die Rohdaten liegen in `quelldaten/` (wird nicht veröffentlicht).

1. **Schweiz:** Excel-Datei von <https://naehrwertdaten.ch/de/downloads/> nach `quelldaten/` legen, dann
   `node scripts/convert-naehrwertdaten.mjs` ausführen → erzeugt `data/foods-ch.json`.
2. **Fineli:** Das Basispaket (z. B. `Fineli_Rel20.zip`) von <https://fineli.fi/fineli/en/avoin-data> herunterladen
   (die Seite verlangt eine Bestätigung „Ich bin ein Mensch“, deshalb von Hand), nach `quelldaten/fineli/<Paketname>/`
   entpacken, dann `node scripts/convert-fineli.mjs quelldaten/fineli/<Paketname>` ausführen → erzeugt `data/foods-fi.json`.
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
