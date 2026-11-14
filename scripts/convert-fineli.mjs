// Wandelt das Fineli-Open-Data-Paket (CSV) in data/foods-fi.json um.
// Aufruf: node scripts/convert-fineli.mjs [ordner]
// Ohne Angabe wird quelldaten/fineli/Fineli_Rel20 verwendet (bzw. der erste Unterordner mit food.csv).
//
// Dateiformat laut descript.txt: Trennzeichen ";", Dezimalkomma, Kodierung Latin-1 (Windows-1252),
// Werte pro 100 g essbarer Anteil. Energie ENERC in kJ, Salz NACL und Natrium NA in mg.
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = join(root, 'quelldaten', 'fineli');
const dir = process.argv[2] ?? (existsSync(join(base, 'Fineli_Rel20', 'food.csv'))
  ? join(base, 'Fineli_Rel20')
  : join(base, readdirSync(base).find((d) => existsSync(join(base, d, 'food.csv')))));

const decoder = new TextDecoder('windows-1252');

function readCsv(name) {
  const text = decoder.decode(readFileSync(join(dir, name)));
  const lines = text.split(/\r?\n/).filter((l) => l.length);
  const header = lines[0].split(';');
  return lines.slice(1).map((l) => {
    const cells = l.split(';');
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
  });
}

const num = (s) => {
  if (s == null || s.trim() === '') return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const round = (n, d = 2) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);

// "FRUKTOOSI, HEDELMÄSOKERI" → "Fruktoosi, hedelmäsokeri"
const tidy = (s, locale) => {
  const t = s.trim().toLocaleLowerCase(locale);
  return t.charAt(0).toLocaleUpperCase(locale) + t.slice(1);
};

// Version aus descript.txt ("Versio. Version. Release. 20.0")
const descript = decoder.decode(readFileSync(join(dir, 'descript.txt')));
const release = descript.match(/Release\.\s*([\d.]+)/)?.[1] ?? '?';

// Einheiten prüfen statt annehmen
const units = Object.fromEntries(readCsv('component.csv').map((c) => [c.EUFDNAME, c.COMPUNIT]));
const EXPECTED = { ENERC: 'KJ', PROT: 'G', CHOAVL: 'G', SUGAR: 'G', FAT: 'G', FASAT: 'G', FIBC: 'G', NACL: 'MG', NA: 'MG' };
for (const [code, unit] of Object.entries(EXPECTED)) {
  if (units[code] !== unit) throw new Error(`Komponente ${code} hat Einheit ${units[code]}, erwartet ${unit} – Format geändert?`);
}

// Nährwerte einsammeln
const values = new Map();
for (const v of readCsv('component_value.csv')) {
  if (!(v.EUFDNAME in EXPECTED)) continue;
  if (!values.has(v.FOODID)) values.set(v.FOODID, {});
  values.get(v.FOODID)[v.EUFDNAME] = num(v.BESTLOC);
}

const names = {};
for (const lang of ['EN', 'FI', 'SV']) {
  names[lang] = Object.fromEntries(readCsv(`foodname_${lang}.csv`).map((r) => [r.FOODID, r.FOODNAME]));
}
const fuclass = Object.fromEntries(readCsv('fuclass_EN.csv').map((r) => [r.THSCODE, r.DESCRIPT]));

// Portionsgrößen: nur die alltagstauglichen
const SERVING_UNITS = { PORTM: 'mittlere Portion', KPL_M: '1 Stück', KPL_VALM: '1 Stück (Hersteller)', DL: '1 dl' };
const servingLabels = Object.values(SERVING_UNITS);
const servingIdx = Object.fromEntries(Object.keys(SERVING_UNITS).map((k, i) => [k, i]));
const servings = new Map();
for (const r of readCsv('foodaddunit.csv')) {
  if (!(r.FOODUNIT in servingIdx)) continue;
  const g = num(r.MASS);
  if (!(g > 0)) continue;
  if (!servings.has(r.FOODID)) servings.set(r.FOODID, []);
  servings.get(r.FOODID).push([servingIdx[r.FOODUNIT], round(g, 1)]);
}

const categories = [];
const items = [];
for (const f of readCsv('food.csv')) {
  if (f.FOODTYPE === 'SUPPLE') continue; // Nahrungsergänzungsmittel
  const v = values.get(f.FOODID) ?? {};
  const kcal = v.ENERC == null ? null : v.ENERC / 4.184;
  const salt = v.NACL != null ? v.NACL / 1000 : v.NA != null ? (v.NA * 2.5) / 1000 : null;
  const cat = fuclass[f.FUCLASS] ?? '';
  let ci = categories.indexOf(cat);
  if (ci < 0) ci = categories.push(cat) - 1;
  items.push([
    Number(f.FOODID),
    tidy(names.EN[f.FOODID] ?? '', 'en'),
    tidy(names.FI[f.FOODID] ?? f.FOODNAME, 'fi'),
    tidy(names.SV[f.FOODID] ?? '', 'sv'),
    ci,
    round(kcal, 0), round(v.PROT, 1), round(v.CHOAVL, 1), round(v.SUGAR, 1), round(v.FAT, 1), round(v.FASAT, 1), round(v.FIBC, 1), round(salt, 2),
    servings.get(f.FOODID) ?? 0,
  ]);
}

const out = {
  source: 'Fineli',
  version: `Release ${release}`,
  license: 'Fineli, Terveyden ja hyvinvoinnin laitos (THL), CC BY 4.0 – umgewandelt',
  fields: ['id', 'nameEn', 'nameFi', 'nameSv', 'category', 'kcal', 'protein', 'carbs', 'sugar', 'fat', 'satFat', 'fiber', 'salt', 'servings'],
  categories,
  servingLabels,
  items,
};
mkdirSync(join(root, 'data'), { recursive: true });
const target = join(root, 'data', 'foods-fi.json');
writeFileSync(target, JSON.stringify(out));
console.log(`${items.length} Lebensmittel → ${target} (${out.version})`);
