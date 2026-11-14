// Gewichtsprotokoll: ein Wert (kg) pro Tag.
import * as db from './db.js';
import { addDays, parseISO } from './format.js';

export const getWeight = (date) => db.get('weights', date);
export const weightsInRange = (from, to) => db.getAllInRange('weights', from, to);
export const allWeights = () => db.getAll('weights');
export const deleteWeight = (date) => db.del('weights', date);

export async function saveWeight(date, kg) {
  const existing = await getWeight(date);
  await db.put('weights', { date, kg, createdAt: existing?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() });
}

/** Gleitender Durchschnitt über die letzten `days` Kalendertage (glättet Wassereinlagerungen & Co.). */
export function movingAverage(points, days = 7) {
  return points.map((p) => {
    const from = addDays(p.date, -(days - 1));
    const win = points.filter((q) => q.date >= from && q.date <= p.date);
    return { date: p.date, kg: win.reduce((s, q) => s + q.kg, 0) / win.length };
  });
}

/** Tage zwischen zwei ISO-Daten. */
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
