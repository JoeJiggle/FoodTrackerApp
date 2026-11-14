// Kleiner IndexedDB-Wrapper mit Versions- und Migrationslogik.
//
// Zwei Ebenen von Versionen:
//  - DB_VERSION: Struktur (Stores/Indizes) – Änderungen in upgradeStructure().
//  - SCHEMA_VERSION: Datenformat innerhalb der Stores – Umwandlungen in MIGRATIONS.
// Beide nur erhöhen, nie verringern. Alte Daten werden schrittweise migriert.

const DB_NAME = 'futter';
const DB_VERSION = 1;
export const SCHEMA_VERSION = 1;

export const STORES = ['products', 'customFoods', 'recipes', 'logEntries', 'foodMeta', 'settings'];

function upgradeStructure(db, oldVersion) {
  if (oldVersion < 1) {
    // Von Open Food Facts geladene Produkte, Schlüssel = Barcode
    db.createObjectStore('products', { keyPath: 'code' });
    // Eigene Lebensmittel (auch manuell erfasste Barcode-Produkte)
    db.createObjectStore('customFoods', { keyPath: 'id' }).createIndex('barcode', 'barcode');
    db.createObjectStore('recipes', { keyPath: 'id' });
    // Protokolleinträge, Nährwerte als Kopie
    db.createObjectStore('logEntries', { keyPath: 'id' }).createIndex('date', 'date');
    // Pro Lebensmittel (Schlüssel z.B. "ch:123", "off:4001234"): Nutzung, Favorit, eigene Portionen, Schnappschuss
    db.createObjectStore('foodMeta', { keyPath: 'key' });
    db.createObjectStore('settings', { keyPath: 'key' });
  }
}

// Datenmigrationen: MIGRATIONS[n] wandelt Daten von Version n-1 nach n um.
const MIGRATIONS = {
  // 2: async (tx) => { ... }
};

let dbPromise;

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaktion abgebrochen'));
  });
}

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = (e) => upgradeStructure(r.result, e.oldVersion);
    r.onsuccess = () => {
      const db = r.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('Datenbank ist blockiert – bitte andere Tabs der App schließen.'));
  }).then(async (db) => {
    await migrate(db);
    return db;
  });
  return dbPromise;
}

async function migrate(db) {
  const tx = db.transaction(STORES, 'readwrite');
  const settings = tx.objectStore('settings');
  const current = (await req(settings.get('schemaVersion')))?.value ?? 0;
  if (current < SCHEMA_VERSION) {
    for (let v = current + 1; v <= SCHEMA_VERSION; v++) if (MIGRATIONS[v]) await MIGRATIONS[v](tx);
    settings.put({ key: 'schemaVersion', value: SCHEMA_VERSION });
  }
  await done(tx);
}

export async function get(store, key) {
  const db = await openDB();
  return req(db.transaction(store).objectStore(store).get(key));
}

export async function getAll(store) {
  const db = await openDB();
  return req(db.transaction(store).objectStore(store).getAll());
}

export async function getAllByIndex(store, index, query) {
  const db = await openDB();
  return req(db.transaction(store).objectStore(store).index(index).getAll(query));
}

export async function put(store, value) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  await done(tx);
  return value;
}

export async function putMany(store, values) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const v of values) os.put(v);
  await done(tx);
}

export async function del(store, key) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await done(tx);
}

/** Alle Daten als einfaches Objekt (für das Backup). */
export async function exportAll() {
  const db = await openDB();
  const tx = db.transaction(STORES);
  const data = {};
  for (const s of STORES) data[s] = await req(tx.objectStore(s).getAll());
  return data;
}

/** Backup einspielen. mode: 'replace' (alles ersetzen) oder 'merge' (gleiche Schlüssel überschreiben, Rest behalten). */
export async function importAll(data, mode) {
  const db = await openDB();
  const tx = db.transaction(STORES, 'readwrite');
  for (const s of STORES) {
    const os = tx.objectStore(s);
    if (mode === 'replace') os.clear();
    for (const v of data[s] ?? []) {
      if (s === 'settings' && v.key === 'schemaVersion') continue;
      os.put(v);
    }
  }
  // Backup aus älterer Version: Datenstand zurücksetzen, damit die Migrationen erneut laufen
  // (Migrationen müssen deshalb mehrfach anwendbar sein).
  const backupVersion = data.settings?.find((v) => v.key === 'schemaVersion')?.value ?? 1;
  if (backupVersion < SCHEMA_VERSION) tx.objectStore('settings').put({ key: 'schemaVersion', value: backupVersion });
  await done(tx);
  await migrate(db);
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
