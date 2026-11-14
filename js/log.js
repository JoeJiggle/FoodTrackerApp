// Tagesprotokoll. Jeder Eintrag enthält eine Kopie der Nährwerte pro 100 g,
// damit spätere Änderungen an einem Lebensmittel alte Tage nicht verändern.
import * as db from './db.js';
import { scaleNutrients, sumNutrients } from './nutrition.js';
import { recordUse } from './foods.js';

export const MEALS = [
  { id: 'breakfast', label: 'Frühstück' },
  { id: 'lunch', label: 'Mittagessen' },
  { id: 'dinner', label: 'Abendessen' },
  { id: 'snack', label: 'Snacks' },
];
export const mealLabel = (id) => MEALS.find((m) => m.id === id)?.label ?? id;

/** Sinnvolle Mahlzeit nach Uhrzeit. */
export function mealForNow(d = new Date()) {
  const h = d.getHours();
  if (h < 10) return 'breakfast';
  if (h < 14) return 'lunch';
  if (h >= 17 && h < 21) return 'dinner';
  return 'snack';
}

export const entryNutrients = (e) => scaleNutrients(e.per100, e.amount);

export async function entriesForDate(date) {
  const list = await db.getAllByIndex('logEntries', 'date', date);
  return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function entriesInRange(from, to) {
  return db.getAllByIndex('logEntries', 'date', IDBKeyRange.bound(from, to));
}

export async function addEntry(food, { date, meal, amount, unit }) {
  const entry = {
    id: db.uid(),
    date,
    meal,
    foodKey: food.key,
    source: food.source,
    name: food.name,
    brand: food.brand || '',
    amount,
    unit: unit || food.unit || 'g',
    per100: { ...food.per100 },
    createdAt: new Date().toISOString(),
  };
  await db.put('logEntries', entry);
  await recordUse(food);
  return entry;
}

/**
 * Schnelleintrag ohne Lebensmittel, z. B. „Mittagessen Kantine, 650 kcal“.
 * Gespeichert wie ein normaler Eintrag mit den Werten als „pro 100“ und Menge 100.
 */
export async function addQuickEntry({ date, meal, name, kcal, protein = null, carbs = null, fat = null }) {
  const entry = {
    id: db.uid(),
    date,
    meal,
    foodKey: 'quick',
    source: 'quick',
    quick: true,
    name: name || 'Schnelleintrag',
    brand: '',
    amount: 100,
    unit: 'g',
    per100: { kcal, protein, carbs, fat, sugar: null, satFat: null, fiber: null, salt: null },
    createdAt: new Date().toISOString(),
  };
  await db.put('logEntries', entry);
  return entry;
}

export const updateEntry = (entry) => db.put('logEntries', entry);
export const deleteEntry = (id) => db.del('logEntries', id);

/** Kopiert alle Einträge einer Mahlzeit von einem Tag auf einen anderen. */
export async function copyMeal(fromDate, toDate, meal) {
  const src = (await entriesForDate(fromDate)).filter((e) => e.meal === meal);
  const now = Date.now();
  const copies = src.map((e, i) => ({ ...e, id: db.uid(), date: toDate, createdAt: new Date(now + i).toISOString() }));
  await db.putMany('logEntries', copies);
  return copies.length;
}

export const totalsOf = (entries) => sumNutrients(entries.map(entryNutrients));
