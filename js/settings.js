// Einstellungen mit Standardwerten. Werden einzeln im Store "settings" abgelegt.
import * as db from './db.js';

const DEFAULTS = {
  goals: { kcal: null, protein: null, carbs: null, fat: null },
  showMacros: true,
  datasets: { ch: true, fi: true },
  lastBackup: null, // ISO-Zeitstempel
  backupReminderSnoozed: null,
  persistRequested: false,
  firstUse: null, // ISO-Zeitstempel des ersten Starts (für die Backup-Erinnerung)
};

let cache = null;

export async function loadSettings() {
  const rows = await db.getAll('settings');
  cache = structuredClone(DEFAULTS);
  for (const { key, value } of rows) if (key in DEFAULTS) cache[key] = value;
  return cache;
}

export const settings = () => cache;

export async function setSetting(key, value) {
  cache[key] = value;
  await db.put('settings', { key, value });
}
