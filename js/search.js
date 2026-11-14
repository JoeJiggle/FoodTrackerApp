// Lokale Suche über alle Quellen. Funktioniert vollständig offline.
import * as db from './db.js';
import { normalize, searchEntries } from './text.js';
import { loadDataset } from './datasets.js';
import { foodFromProduct, foodFromCustom, foodFromRecipe, usageCounts } from './foods.js';
import { settings } from './settings.js';

const toEntry = (food) => ({
  key: food.key,
  name: food.name,
  food,
  text: normalize([food.name, food.original, food.brand, food.barcode, ...Object.values(food.names ?? {})].filter(Boolean).join(' ')),
});

const datasetEntries = {};

async function datasetIndex(id) {
  if (!datasetEntries[id]) {
    const { foods } = await loadDataset(id);
    datasetEntries[id] = foods.map(toEntry);
  }
  return datasetEntries[id];
}

/** Baut den Suchindex. Lokale Daten werden jedes Mal frisch gelesen (klein), Datenbanken nur einmal. */
export async function buildSearchIndex() {
  const enabled = settings().datasets;
  const [products, customs, recipes, usage, ch, fi] = await Promise.all([
    db.getAll('products'),
    db.getAll('customFoods'),
    db.getAll('recipes'),
    usageCounts(),
    enabled.ch ? datasetIndex('ch') : [],
    enabled.fi ? datasetIndex('fi') : [],
  ]);
  const entries = [
    ...customs.map((c) => toEntry(foodFromCustom(c))),
    ...recipes.map((r) => toEntry(foodFromRecipe(r))),
    ...products.map((p) => toEntry(foodFromProduct(p))),
    ...ch,
    ...fi,
  ];
  return { search: (q, limit) => searchEntries(entries, q, { usage, limit }).map((e) => e.food) };
}
