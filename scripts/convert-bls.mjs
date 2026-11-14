// Wandelt den Bundeslebensmittelschlüssel (BLS 4.0, Max Rubner-Institut) in data/foods-de.json um.
// Aufruf: node scripts/convert-bls.mjs [pfad/zur/BLS_..._Daten_....xlsx]
// Ohne Angabe wird die erste passende Datei unter quelldaten/bls/ gesucht.
//
// Dateiformat laut BLS-Dokumentation: Spalten „BLS Code“, „Lebensmittelbezeichnung“, „Food name“, danach je
// Nährstoff drei Spalten (Wert, Datenherkunft, Referenz); Kopfzeilen wie „FAT Fett [g/100g]“.
// Alle Werte pro 100 g essbarer Anteil.
import { readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWorkbook } from './lib/xlsx.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function findFile(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { const f = findFile(p); if (f) return f; }
    else if (/^BLS_.*_Daten_.*\.xlsx$/i.test(name)) return p;
  }
  return null;
}
const input = process.argv[2] ?? findFile(join(root, 'quelldaten', 'bls'));
if (!input) throw new Error('Keine BLS-Datendatei (BLS_..._Daten_....xlsx) unter quelldaten/bls/ gefunden');

// Nährstoffcode → erwartete Einheit (wird gegen die Kopfzeile geprüft)
const COMPONENTS = {
  kcal: ['ENERCC', 'kcal/100g'],
  protein: ['PROT625', 'g/100g'],
  carbs: ['CHO', 'g/100g'],
  sugar: ['SUGAR', 'g/100g'],
  fat: ['FAT', 'g/100g'],
  satFat: ['FASAT', 'g/100g'],
  fiber: ['FIBT', 'g/100g'],
  salt: ['NACL', 'g/100g'],
};
const NUTRIENTS = Object.keys(COMPONENTS);

// Hauptgruppen nach dem ersten Buchstaben des BLS-Codes. Die Dokumentation nennt nur das Beispiel C = Getreide;
// die übrigen Bezeichnungen sind aus den enthaltenen Lebensmitteln abgeleitet.
const GROUPS = {
  B: 'Brot und Brötchen', C: 'Getreide und Getreideprodukte', D: 'Backwaren und Gebäck', E: 'Teigwaren, Eier, Knödel',
  F: 'Obst', G: 'Gemüse', H: 'Hülsenfrüchte, Nüsse, Samen', K: 'Kartoffeln und Pilze', M: 'Milch und Milchprodukte',
  N: 'Alkoholfreie Getränke', P: 'Alkoholische Getränke', Q: 'Fette und Öle', R: 'Gewürze, Zutaten, Soßen', S: 'Süßwaren',
  T: 'Fisch und Meeresfrüchte', U: 'Fleisch', V: 'Geflügel, Wild, Innereien', W: 'Wurst und Fleischwaren',
  X: 'Gerichte und Suppen', Y: 'Gerichte',
};

// „TR“ = Spuren, „<LOD“/„<LOQ“ = unter Nachweis-/Bestimmungsgrenze → 0; „-“ = kein Wert → null (unbekannt)
function parseValue(v) {
  if (typeof v === 'number') return Math.round(v * 10) / 10;
  if (v == null) return null;
  const s = String(v).trim();
  if (s === 'TR' || s.startsWith('<')) return 0;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

const wb = readWorkbook(input);
const rows = wb.rows(wb.sheetNames[0]);
const header = rows[0];
const col = {
  code: header.indexOf('BLS Code'),
  de: header.indexOf('Lebensmittelbezeichnung'),
  en: header.indexOf('Food name'),
};
for (const [k, i] of Object.entries(col)) if (i < 0) throw new Error(`Spalte für ${k} fehlt – hat sich das Dateiformat geändert?`);
for (const [key, [code, unit]] of Object.entries(COMPONENTS)) {
  col[key] = header.findIndex((h) => typeof h === 'string' && h.startsWith(code + ' ') && h.includes('['));
  if (col[key] < 0) throw new Error(`Nährstoff ${code} fehlt`);
  if (!header[col[key]].includes(`[${unit}]`)) throw new Error(`${code} hat nicht die Einheit ${unit}: „${header[col[key]]}“`);
}

const categories = [];
const items = [];
for (const r of rows.slice(1)) {
  if (!r?.[col.code] || !r[col.de]) continue;
  const code = String(r[col.code]).trim();
  const cat = GROUPS[code[0]] ?? '';
  let ci = categories.indexOf(cat);
  if (ci < 0) ci = categories.push(cat) - 1;
  const n = NUTRIENTS.map((k) => parseValue(r[col[k]]));
  n[0] = n[0] == null ? null : Math.round(n[0]); // kcal ganzzahlig
  items.push([code, String(r[col.de]).trim(), String(r[col.en] ?? '').trim(), ci, ...n]);
}

const out = {
  source: 'Bundeslebensmittelschlüssel',
  version: 'BLS 4.0 (2025)',
  license: 'Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0, DOI 10.25826/Data20251217-134202-0, CC BY 4.0 – umgewandelt',
  fields: ['id', 'name', 'nameEn', 'category', ...NUTRIENTS],
  categories,
  items,
};
mkdirSync(join(root, 'data'), { recursive: true });
const target = join(root, 'data', 'foods-de.json');
writeFileSync(target, JSON.stringify(out));
console.log(`${items.length} Lebensmittel → ${target} (${out.version})`);
