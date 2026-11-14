// Lädt die Nährwertdatenbanken (CH, FI) erst bei Bedarf.
// Fehlt eine Datei, wird sie einfach übersprungen – die App funktioniert ohne sie.
import { NUTRIENTS } from './nutrition.js';

export const DATASETS = {
  ch: { label: 'Schweizer Nährwertdatenbank', short: 'CH', file: 'data/foods-ch.json' },
  fi: { label: 'Fineli (Finnland)', short: 'FI', file: 'data/foods-fi.json' },
};

const loaded = {};

export function loadDataset(id) {
  loaded[id] ??= fetch(DATASETS[id].file)
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => (json ? toFoods(id, json) : { foods: [], info: null }))
    .catch(() => {
      delete loaded[id]; // später erneut versuchen
      return { foods: [], info: null };
    });
  return loaded[id];
}

function toFoods(id, json) {
  const idx = Object.fromEntries(json.fields.map((f, i) => [f, i]));
  const foods = json.items.map((row) => {
    const per100 = {};
    for (const k of NUTRIENTS) per100[k] = row[idx[k]] ?? null;
    const category = json.categories?.[row[idx.category]] ?? '';
    const food = { key: `${id}:${row[idx.id]}`, source: id, id: row[idx.id], per100, unit: 'g', servings: [], category };
    if (id === 'ch') {
      food.name = row[idx.name];
      food.names = { de: row[idx.name], synonyms: row[idx.synonyms] || '' };
      food.sub = category.includes('/') ? category.slice(category.indexOf('/') + 1) : category;
    } else {
      const en = row[idx.nameEn], fi = row[idx.nameFi], sv = row[idx.nameSv];
      food.name = en || fi;
      food.original = fi && fi !== food.name ? fi : '';
      food.names = { en, fi, sv };
      food.sub = category;
      const sv100 = row[idx.servings];
      if (Array.isArray(sv100)) food.servings = sv100.map(([l, grams]) => ({ label: json.servingLabels[l], grams }));
    }
    return food;
  });
  return { foods, info: { source: json.source, version: json.version, license: json.license, count: foods.length } };
}

export const isDatasetLoaded = (id) => id in loaded;
