// Wandelt die Excel-Datei der Schweizer Nährwertdatenbank in data/foods-ch.json um.
// Aufruf: node scripts/convert-naehrwertdaten.mjs [pfad/zur/datei.xlsx]
// Ohne Pfad wird die erste .xlsx-Datei in quelldaten/ verwendet.
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWorkbook } from './lib/xlsx.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2] ?? join(root, 'quelldaten', readdirSync(join(root, 'quelldaten')).find((f) => f.endsWith('.xlsx')));
const SHEET = 'Generische Lebensmittel';

// Spalten werden über den exakten Kopfzeilen-Text gesucht, nicht über Positionen.
const COLUMNS = {
  id: 'ID',
  name: 'Name',
  synonyms: 'Synonyme',
  category: 'Kategorie',
  unit: 'Bezugseinheit',
  kcal: 'Energie, Kilokalorien (kcal)',
  protein: 'Protein (g)',
  carbs: 'Kohlenhydrate, verfügbar (g)',
  sugar: 'Zucker (g)',
  fat: 'Fett, total (g)',
  satFat: 'Fettsäuren, gesättigt (g)',
  fiber: 'Nahrungsfasern (g)',
  salt: 'Salz (NaCl) (g)',
};
const NUTRIENTS = ['kcal', 'protein', 'carbs', 'sugar', 'fat', 'satFat', 'fiber', 'salt'];

// "Sp." = Spuren, "<0.5" = unter Bestimmungsgrenze → 0; "k.A." = keine Angabe → null (unbekannt)
function parseValue(v) {
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  if (v == null) return null;
  const s = String(v).trim();
  if (s === 'Sp.' || s.startsWith('<')) return 0;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const wb = readWorkbook(input);
const rows = wb.rows(SHEET);
const title = String(rows[0]?.[0] ?? '');
const headerIdx = rows.findIndex((r) => r?.[0] === 'ID' && r.includes('Name'));
if (headerIdx < 0) throw new Error('Kopfzeile nicht gefunden');
const header = rows[headerIdx];
const col = {};
for (const [key, label] of Object.entries(COLUMNS)) {
  col[key] = header.indexOf(label);
  if (col[key] < 0) throw new Error(`Spalte „${label}“ fehlt – hat sich das Dateiformat geändert?`);
}

const categories = [];
const items = [];
for (const r of rows.slice(headerIdx + 1)) {
  if (!r || r[col.id] == null || !r[col.name]) continue;
  if (!/pro 100\s?g/i.test(String(r[col.unit]))) {
    console.warn('Übersprungen (andere Bezugseinheit):', r[col.name], r[col.unit]);
    continue;
  }
  const cat = String(r[col.category] ?? '').split(';')[0];
  let ci = categories.indexOf(cat);
  if (ci < 0) ci = categories.push(cat) - 1;
  items.push([
    r[col.id],
    String(r[col.name]).trim(),
    r[col.synonyms] ? String(r[col.synonyms]).trim() : '',
    ci,
    ...NUTRIENTS.map((k) => parseValue(r[col[k]])),
  ]);
}

const out = {
  source: 'Schweizer Nährwertdatenbank',
  version: title.match(/V\s*[\d.]+\s*\([^)]*\)/)?.[0] ?? title,
  license: 'Quelle: Schweizer Nährwertdatenbank, Bundesamt für Lebensmittelsicherheit und Veterinärwesen BLV, naehrwertdaten.ch',
  fields: ['id', 'name', 'synonyms', 'category', ...NUTRIENTS],
  categories,
  items,
};
mkdirSync(join(root, 'data'), { recursive: true });
const target = join(root, 'data', 'foods-ch.json');
writeFileSync(target, JSON.stringify(out));
console.log(`${items.length} Lebensmittel → ${target} (${out.version})`);
