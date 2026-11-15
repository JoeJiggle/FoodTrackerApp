// Reine Rechenfunktionen ohne DOM – werden auch von den Node-Tests verwendet.

export const NUTRIENTS = ['kcal', 'protein', 'carbs', 'sugar', 'fat', 'satFat', 'fiber', 'salt'];

export const NUTRIENT_LABELS = {
  kcal: 'Energie',
  fat: 'Fett',
  satFat: 'davon gesättigte Fettsäuren',
  carbs: 'Kohlenhydrate',
  sugar: 'davon Zucker',
  fiber: 'Ballaststoffe',
  protein: 'Eiweiß',
  salt: 'Salz',
};

const KJ_PER_KCAL = 4.184;

export const kjToKcal = (kj) => (kj == null ? null : kj / KJ_PER_KCAL);
export const kcalToKj = (kcal) => (kcal == null ? null : kcal * KJ_PER_KCAL);
/** Natrium (g) → Salz (g), Faktor 2,5 wie in der EU-Lebensmittelinformationsverordnung. */
export const sodiumToSalt = (sodium) => (sodium == null ? null : sodium * 2.5);

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Akzeptiert „1,5“, „1.5“, „ 12 “; leer/ungültig → null. */
export function parseDecimal(input) {
  if (isNum(input)) return input;
  if (input == null) return null;
  const s = String(input).trim().replace(/\s/g, '').replace(',', '.');
  if (s === '' || !/^-?\d*\.?\d+$|^-?\d+\.$/.test(s)) return null;
  return Number(s);
}

/** Nährwerte pro 100 g auf eine Menge umrechnen. Unbekannte Werte bleiben null. */
export function scaleNutrients(per100, amount) {
  const out = {};
  for (const k of NUTRIENTS) {
    const v = per100?.[k];
    out[k] = isNum(v) && isNum(amount) ? (v * amount) / 100 : null;
  }
  return out;
}

/** Summiert Nährwertobjekte. Ein Nährstoff ist nur dann null, wenn er bei allen Einträgen fehlt. */
export function sumNutrients(list) {
  const out = {};
  for (const k of NUTRIENTS) {
    let sum = null;
    for (const n of list) if (isNum(n?.[k])) sum = (sum ?? 0) + n[k];
    out[k] = sum;
  }
  return out;
}

/**
 * Rezept: Zutaten [{grams, per100}] → Werte pro 100 g des fertigen Gerichts.
 * totalWeight = Gewicht nach dem Kochen; ohne Angabe die Summe der Zutaten.
 * Fehlt ein Nährstoff bei einer Zutat mit Menge > 0, ist er für das Rezept unbekannt.
 */
export function recipeTotals(ingredients) {
  const out = {};
  for (const k of NUTRIENTS) {
    let sum = 0;
    for (const ing of ingredients) {
      if (!(ing.grams > 0)) continue;
      const v = ing.per100?.[k];
      if (!isNum(v)) { sum = null; break; }
      sum += (v * ing.grams) / 100;
    }
    out[k] = sum;
  }
  return out;
}

export function recipeRawWeight(ingredients) {
  return ingredients.reduce((s, i) => s + (i.grams > 0 ? i.grams : 0), 0);
}

export function recipePer100(ingredients, totalWeight) {
  const weight = totalWeight > 0 ? totalWeight : recipeRawWeight(ingredients);
  const totals = recipeTotals(ingredients);
  const out = {};
  for (const k of NUTRIENTS) out[k] = totals[k] == null || !(weight > 0) ? null : (totals[k] * 100) / weight;
  return out;
}

export function recipePerPortion(ingredients, portions) {
  const totals = recipeTotals(ingredients);
  const out = {};
  for (const k of NUTRIENTS) out[k] = totals[k] == null || !(portions > 0) ? null : totals[k] / portions;
  return out;
}

// Verglichen wird wie angezeigt: kcal ganzzahlig, Makros mit einer Nachkommastelle.
// Sonst stünde „100,0 / 100 g“ da, obwohl intern 99,96 g nicht reichen.
const roundAsShown = (k, v) => (k === 'kcal' ? Math.round(v) : Math.round(v * 10) / 10);

/**
 * Was zum Tagesziel noch fehlt: [{key, missing}] für jedes gesetzte, noch nicht erreichte Ziel.
 * Leeres Array = alles erreicht oder überschritten; null = keines der Ziele (keys) gesetzt.
 */
export function goalGaps(totals, goals, keys = ['kcal', 'protein', 'carbs', 'fat']) {
  const set = keys.filter((k) => goals?.[k] > 0);
  if (!set.length) return null;
  return set
    .map((k) => ({ key: k, missing: goals[k] - roundAsShown(k, totals?.[k] ?? 0) }))
    .filter((g) => g.missing > 1e-9);
}

/** Tagesziel erreicht, wenn jedes gesetzte Ziel erreicht oder überschritten ist. null = kein Ziel gesetzt. */
export function goalsMet(totals, goals, keys) {
  const gaps = goalGaps(totals, goals, keys);
  return gaps === null ? null : gaps.length === 0;
}

/** Zahl für Zielfelder: „2.000“ (Tausenderpunkt) = 2000, sonst wie parseDecimal. */
export function parseGoal(input) {
  const s = String(input ?? '').trim();
  return /^\d{1,3}(\.\d{3})+$/.test(s) ? Number(s.replace(/\./g, '')) : parseDecimal(s);
}

// ---------- Barcodes ----------

/** Prüfziffer nach GTIN-Verfahren (EAN-8, EAN-13, UPC-A, GTIN-14) für alle Ziffern außer der letzten. */
export function gtinCheckDigit(body) {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const d = body.charCodeAt(body.length - 1 - i) - 48;
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10;
}

const validGtin = (code) => gtinCheckDigit(code.slice(0, -1)) === +code.at(-1);

/** UPC-E (8 Ziffern inkl. Zahlensystem und Prüfziffer) → UPC-A (12 Ziffern). */
export function expandUpcE(code) {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const ns = code[0], d = code.slice(1, 7), check = code[7];
  let body;
  switch (d[5]) {
    case '0': case '1': case '2': body = d.slice(0, 2) + d[5] + '0000' + d.slice(2, 5); break;
    case '3': body = d.slice(0, 3) + '00000' + d.slice(3, 5); break;
    case '4': body = d.slice(0, 4) + '00000' + d[4]; break;
    default: body = d.slice(0, 5) + '0000' + d[5];
  }
  return ns + body + check;
}

/** Gültig sind EAN-8, UPC-E, UPC-A, EAN-13 (und GTIN-14) mit korrekter Prüfziffer. */
export function isValidBarcode(input) {
  const code = String(input ?? '').trim();
  if (!/^\d+$/.test(code)) return false;
  if ([8, 12, 13, 14].includes(code.length) && validGtin(code)) return true;
  if (code.length === 8) {
    const upcA = expandUpcE(code);
    return !!upcA && validGtin(upcA);
  }
  return false;
}

// ---------- Open Food Facts ----------

const firstText = (...vals) => vals.map((v) => (typeof v === 'string' ? v.trim() : '')).find(Boolean) || '';

/**
 * Anzeigename nach Priorität Deutsch → Englisch → Originalname → Finnisch → Schwedisch.
 * original wird nur gesetzt, wenn er sich vom Anzeigenamen unterscheidet.
 */
export function pickDisplayName(names = {}) {
  const name = firstText(names.de, names.en, names.orig, names.fi, names.sv, names.generic);
  const orig = firstText(names.orig);
  return { name, original: orig && orig.toLowerCase() !== name.toLowerCase() ? orig : '' };
}

/** Nährwerte pro 100 g/ml aus dem nutriments-Objekt von Open Food Facts. */
export function per100FromOff(n = {}) {
  const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  let kcal = num(n['energy-kcal_100g']);
  if (kcal == null) kcal = kjToKcal(num(n['energy-kj_100g']));
  let salt = num(n['salt_100g']);
  if (salt == null) salt = sodiumToSalt(num(n['sodium_100g']));
  return {
    kcal,
    protein: num(n['proteins_100g']),
    carbs: num(n['carbohydrates_100g']),
    sugar: num(n['sugars_100g']),
    fat: num(n['fat_100g']),
    satFat: num(n['saturated-fat_100g']),
    fiber: num(n['fiber_100g']),
    salt,
  };
}

/** Bild-Adresse nur übernehmen, wenn sie verschlüsselt (https) geladen wird – sonst leer. */
export const safeImageUrl = (url) => (typeof url === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(url) ? url : '');

/** Wandelt ein Produkt aus der OFF-API in das lokale Format um. */
export function productFromOff(p) {
  const orig = p.product_name || '';
  const quantityText = `${p.serving_size || ''} ${p.quantity || ''}`.toLowerCase();
  const servingQuantity = Number(p.serving_quantity) > 0 ? Number(p.serving_quantity) : null;
  return {
    code: String(p.code),
    names: {
      de: p.product_name_de || '',
      en: p.product_name_en || '',
      fi: p.product_name_fi || '',
      sv: p.product_name_sv || '',
      orig,
      generic: p.generic_name || '',
    },
    lang: p.lang || '',
    brand: (p.brands || '').split(',')[0].trim(),
    countries: p.countries_tags || [],
    per100: per100FromOff(p.nutriments),
    unit: /\d\s*(ml|cl|l)\b/.test(quantityText) ? 'ml' : 'g',
    servingSize: p.serving_size || '',
    servingQuantity,
    nutriscore: /^[a-e]$/.test(p.nutriscore_grade || '') ? p.nutriscore_grade : '',
    image: safeImageUrl(p.image_front_small_url),
  };
}
