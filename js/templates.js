// Mahlzeit-Vorlagen: mehrere Einträge (z. B. „Mein Frühstück“) mit einem Tipp eintragen.
// Die Nährwerte werden wie bei Protokolleinträgen als Kopie gespeichert.
import * as db from './db.js';

export async function listTemplates() {
  return (await db.getAll('templates')).sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

export async function saveTemplate(name, entries) {
  const template = {
    id: db.uid(),
    name,
    items: entries.map((e) => ({
      foodKey: e.foodKey, source: e.source, quick: !!e.quick, name: e.name, brand: e.brand || '',
      amount: e.amount, unit: e.unit, per100: { ...e.per100 },
    })),
    createdAt: new Date().toISOString(),
  };
  await db.put('templates', template);
  return template;
}

export const deleteTemplate = (id) => db.del('templates', id);

/** Trägt alle Einträge der Vorlage ein und gibt die neuen Einträge zurück (für „Rückgängig“). */
export async function applyTemplate(template, { date, meal }) {
  const now = Date.now();
  const entries = template.items.map((item, i) => ({
    ...item, id: db.uid(), date, meal, createdAt: new Date(now + i).toISOString(),
  }));
  await db.putMany('logEntries', entries);
  return entries;
}
