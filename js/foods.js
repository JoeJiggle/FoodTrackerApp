// Einheitliche Sicht auf alle Lebensmittelquellen.
// Ein "food" hat immer: key, source (ch|fi|off|custom|recipe), name, per100, unit, servings.
import * as db from './db.js';
import { pickDisplayName, recipePer100, recipeRawWeight } from './nutrition.js';
import { loadDataset } from './datasets.js';
import { fetchProduct } from './off-api.js';

export const SOURCE_LABEL = { de: 'DE', ch: 'CH', fi: 'FI', off: 'OFF', custom: 'Eigen', recipe: 'Rezept' };

// ---------- Umwandlung in das einheitliche Format ----------

export function foodFromProduct(p) {
  const u = p.user ?? {};
  const { name, original } = pickDisplayName(p.names);
  const servings = [];
  const sq = u.servingQuantity ?? p.servingQuantity;
  if (sq > 0) servings.push({ label: `1 Portion${p.servingSize && !u.servingQuantity ? ` (${p.servingSize})` : ''}`, grams: sq });
  return {
    key: `off:${p.code}`,
    source: 'off',
    id: p.code,
    barcode: p.code,
    name: u.name || name || `Produkt ${p.code}`,
    original: u.name ? (p.names?.orig ?? '') : original,
    brand: u.brand ?? p.brand ?? '',
    names: { ...p.names, user: u.name || '' },
    per100: u.per100 ?? p.per100,
    unit: u.unit ?? p.unit ?? 'g',
    servings,
    image: p.image || '',
    nutriscore: p.nutriscore || '',
    edited: !!p.user,
  };
}

export function foodFromCustom(c) {
  return {
    key: `custom:${c.id}`,
    source: 'custom',
    id: c.id,
    barcode: c.barcode || '',
    name: c.name,
    brand: c.brand || '',
    names: { user: c.name },
    per100: c.per100,
    unit: c.unit || 'g',
    servings: c.servings ?? [],
  };
}

export function foodFromRecipe(r) {
  const weight = r.totalWeight > 0 ? r.totalWeight : recipeRawWeight(r.ingredients);
  return {
    key: `recipe:${r.id}`,
    source: 'recipe',
    id: r.id,
    name: r.name,
    names: { user: r.name },
    per100: recipePer100(r.ingredients, r.totalWeight),
    unit: 'g',
    servings: r.portions > 0 && weight > 0 ? [{ label: '1 Portion', grams: weight / r.portions }] : [],
    sub: `${r.ingredients.length} Zutaten`,
  };
}

/** Kurzform für foodMeta (Favoriten / Zuletzt verwendet ohne Laden der Datenbanken). */
const snapshot = (f) => ({
  key: f.key, source: f.source, id: f.id, name: f.name, original: f.original || '', brand: f.brand || '',
  sub: f.sub || '', category: f.category || '', per100: f.per100, unit: f.unit, servings: f.servings ?? [],
  names: f.names, barcode: f.barcode || '', image: f.image || '', nutriscore: f.nutriscore || '',
});

// ---------- Laden ----------

export async function getFood(key) {
  const [source, ...rest] = key.split(':');
  const id = rest.join(':');
  if (source === 'off') {
    const p = await db.get('products', id);
    if (p) return foodFromProduct(p);
  } else if (source === 'custom') {
    const c = await db.get('customFoods', id);
    if (c) return foodFromCustom(c);
  } else if (source === 'recipe') {
    const r = await db.get('recipes', id);
    if (r) return foodFromRecipe(r);
  } else if (source === 'de' || source === 'ch' || source === 'fi') {
    const meta = await db.get('foodMeta', key);
    if (meta?.snapshot) return meta.snapshot;
    const { foods } = await loadDataset(source);
    const f = foods.find((x) => x.key === key);
    if (f) return f;
  }
  return (await db.get('foodMeta', key))?.snapshot ?? null;
}

/** Varianten eines Barcodes (UPC-A ↔ EAN-13 mit führender 0). */
function codeVariants(code) {
  const v = [code];
  if (code.length === 12) v.push('0' + code);
  if (code.length === 13 && code.startsWith('0')) v.push(code.slice(1));
  return v;
}

/** Sucht einen Barcode zuerst lokal (eigene Lebensmittel haben Vorrang, dann gespeicherte Produkte). */
export async function findLocalBarcode(code) {
  for (const c of codeVariants(code)) {
    const custom = await db.getAllByIndex('customFoods', 'barcode', c);
    if (custom.length) return foodFromCustom(custom[0]);
  }
  for (const c of codeVariants(code)) {
    const p = await db.get('products', c);
    if (p) return foodFromProduct(p);
  }
  return null;
}

/**
 * Lädt ein Produkt von Open Food Facts und speichert es lokal.
 * Eigene Korrekturen (Feld "user") bleiben dabei erhalten.
 */
export async function fetchAndStoreProduct(code) {
  const res = await fetchProduct(code);
  if (!res.found) return null;
  const existing = (await db.get('products', res.product.code)) ?? (await db.get('products', code));
  const record = { ...res.product, fetchedAt: new Date().toISOString() };
  if (existing?.user) record.user = existing.user;
  await db.put('products', record);
  return foodFromProduct(record);
}

/** Eigene Korrektur an einem OFF-Produkt speichern. Wird nie von API-Daten überschrieben. */
export async function saveProductCorrection(code, user) {
  const p = await db.get('products', code);
  p.user = user;
  await db.put('products', p);
  const food = foodFromProduct(p);
  await refreshSnapshot(food);
  return food;
}

// ---------- Nutzung, Favoriten, eigene Portionen ----------

export async function getMeta(key) {
  return (await db.get('foodMeta', key)) ?? { key, count: 0, lastUsed: null, favorite: false, servings: [] };
}

export async function recordUse(food) {
  const m = await getMeta(food.key);
  m.count = (m.count ?? 0) + 1;
  m.lastUsed = new Date().toISOString();
  m.snapshot = snapshot(food);
  await db.put('foodMeta', m);
}

/** Aktualisiert den gespeicherten Schnappschuss (Favoriten/Zuletzt) nach einer Änderung. */
export async function refreshSnapshot(food) {
  const m = await db.get('foodMeta', food.key);
  if (m) {
    m.snapshot = snapshot(food);
    await db.put('foodMeta', m);
  }
}

export async function setFavorite(food, favorite) {
  const m = await getMeta(food.key);
  m.favorite = favorite;
  m.snapshot = snapshot(food);
  await db.put('foodMeta', m);
}

export async function saveServings(food, servings) {
  const m = await getMeta(food.key);
  m.servings = servings;
  m.snapshot = snapshot(food);
  await db.put('foodMeta', m);
}

export async function usageCounts() {
  const all = await db.getAll('foodMeta');
  return Object.fromEntries(all.map((m) => [m.key, m.count ?? 0]));
}

export async function listFavorites() {
  const all = await db.getAll('foodMeta');
  const favs = all.filter((m) => m.favorite && m.snapshot);
  return Promise.all(favs.map(async (m) => (await getFood(m.key)) ?? m.snapshot)).then((list) =>
    list.sort((a, b) => a.name.localeCompare(b.name, 'de')));
}

export async function listRecent(limit = 40) {
  const all = await db.getAll('foodMeta');
  const recent = all.filter((m) => m.lastUsed && m.snapshot).sort((a, b) => b.lastUsed.localeCompare(a.lastUsed)).slice(0, limit);
  return Promise.all(recent.map(async (m) => (await getFood(m.key)) ?? m.snapshot));
}

/** Alle Portionsvorschläge eines Lebensmittels: aus der Quelle + eigene. */
export async function allServings(food) {
  const m = await getMeta(food.key);
  return [...(food.servings ?? []), ...(m.servings ?? [])];
}
