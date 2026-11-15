// Prüfung von Backup-Dateien vor dem Einspielen (reine Logik, ohne DOM – deshalb mit Node testbar).
// Eine Datei wird nur ganz oder gar nicht übernommen: Schon ein fehlerhafter Datensatz lehnt sie ab,
// damit eine falsche oder beschädigte Datei die vorhandenen Daten nicht unbrauchbar macht.
import { safeImageUrl } from './nutrition.js';

export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const MAX_RECORDS = 200_000; // pro Bereich
const MAX_STRING = 5_000; // Zeichen pro Text
const MAX_ARRAY = 2_000; // z. B. Zutaten eines Rezepts
const MAX_DEPTH = 8;
const MEAL_IDS = ['breakfast', 'lunch', 'dinner', 'snack'];

// Schlüsselfeld je Bereich (wie in db.js) und Bezeichnung für Fehlermeldungen
const STORE_INFO = {
  products: ['code', 'Produkte'],
  customFoods: ['id', 'Eigene Lebensmittel'],
  recipes: ['id', 'Rezepte'],
  logEntries: ['id', 'Tagesprotokoll'],
  foodMeta: ['key', 'Favoriten/Zuletzt'],
  settings: ['key', 'Einstellungen'],
  templates: ['id', 'Vorlagen'],
  weights: ['date', 'Gewicht'],
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v, max = MAX_STRING) => typeof v === 'string' && v.length <= max;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const isNutrients = (v) => isObj(v) && Object.values(v).every((x) => x === null || isNum(x));

/** Allgemeine Prüfung jedes Werts: nur JSON-Grundtypen, begrenzte Tiefe, Länge und endliche Zahlen. */
function checkValue(v, depth = 0) {
  if (depth > MAX_DEPTH) return 'ist zu tief verschachtelt';
  if (v === null || typeof v === 'boolean') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? null : 'enthält eine ungültige Zahl';
  if (typeof v === 'string') return v.length <= MAX_STRING ? null : 'enthält einen zu langen Text';
  if (Array.isArray(v)) {
    if (v.length > MAX_ARRAY) return 'enthält eine zu lange Liste';
    for (const x of v) { const e = checkValue(x, depth + 1); if (e) return e; }
    return null;
  }
  if (isObj(v)) {
    for (const [k, x] of Object.entries(v)) {
      if (k === '__proto__' || k.length > 100) return 'enthält ein ungültiges Feld';
      const e = checkValue(x, depth + 1);
      if (e) return e;
    }
    return null;
  }
  return 'enthält einen unbekannten Datentyp';
}

const entryLike = (e) => isStr(e.name) && isNum(e.amount) && e.amount >= 0 && isNutrients(e.per100);

// Was die App beim Anzeigen sicher voraussetzt – je Bereich
const RULES = {
  products: (r) => isObj(r.per100 ?? {}) && (r.names == null || isObj(r.names)),
  customFoods: (r) => isStr(r.name) && isNutrients(r.per100),
  recipes: (r) => isStr(r.name) && Array.isArray(r.ingredients),
  logEntries: (r) => isDate(r.date) && MEAL_IDS.includes(r.meal) && isStr(r.createdAt) && entryLike(r),
  foodMeta: (r) => r.snapshot == null || (isObj(r.snapshot) && isStr(r.snapshot.name)),
  settings: () => true,
  templates: (r) => isStr(r.name) && Array.isArray(r.items) && r.items.every((i) => isObj(i) && entryLike(i)),
  weights: (r) => isDate(r.date) && isNum(r.kg) && r.kg > 20 && r.kg < 400,
};

/** Bild-Adressen bereinigen (nur https), auch in Schnappschüssen. */
function cleanImages(r) {
  if ('image' in r) r.image = safeImageUrl(r.image);
  if (isObj(r.snapshot) && 'image' in r.snapshot) r.snapshot.image = safeImageUrl(r.snapshot.image);
}

/**
 * Prüft den Inhalt einer Backup-Datei (bereits per JSON.parse gelesen).
 * Ergebnis: { ok: true, data, counts } oder { ok: false, error } mit verständlicher Meldung.
 * Unbekannte Bereiche werden ignoriert, fehlende als leer behandelt.
 */
export function validateBackup(payload, { appIds, schemaVersion }) {
  if (!isObj(payload) || !appIds.includes(payload.app) || !isObj(payload.data)) {
    return { ok: false, error: 'Die Datei ist kein PersonalFoodTracker-Backup.' };
  }
  if (payload.schemaVersion != null && !isNum(payload.schemaVersion)) return { ok: false, error: 'Die Datei ist kein gültiges Backup.' };
  if (payload.schemaVersion > schemaVersion) {
    return { ok: false, error: 'Das Backup stammt aus einer neueren App-Version. Bitte zuerst die App aktualisieren.' };
  }
  const data = {};
  const counts = {};
  for (const [store, [keyField, label]] of Object.entries(STORE_INFO)) {
    const list = payload.data[store] ?? [];
    if (!Array.isArray(list)) return { ok: false, error: `Bereich „${label}“ ist beschädigt.` };
    if (list.length > MAX_RECORDS) return { ok: false, error: `Bereich „${label}“ enthält ungewöhnlich viele Einträge.` };
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      const where = `„${label}“, Eintrag ${i + 1}`;
      if (!isObj(r)) return { ok: false, error: `${where} ist beschädigt.` };
      const key = r[keyField];
      if (!(typeof key === 'string' && key.length > 0 && key.length <= 200)) return { ok: false, error: `${where} hat keine gültige Kennung.` };
      const problem = checkValue(r);
      if (problem) return { ok: false, error: `${where} ${problem}.` };
      if (!RULES[store](r)) return { ok: false, error: `${where} ist unvollständig oder hat ungültige Werte.` };
      cleanImages(r);
    }
    data[store] = list;
    counts[store] = list.length;
  }
  return { ok: true, data, counts };
}
