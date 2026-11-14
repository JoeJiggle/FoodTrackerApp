// Einstellungen, Backup und „Über“.
import { h, toast, decimalInput, ask } from '../ui.js';
import { refreshView } from '../state.js';
import { settings, setSetting, loadSettings } from '../settings.js';
import * as db from '../db.js';
import { fmtInput, todayISO } from '../format.js';
import { parseDecimal } from '../nutrition.js';
import { DATASETS, loadDataset } from '../datasets.js';
import { APP_VERSION } from '../version.js';

export async function renderSettings(root) {
  const s = settings();
  root.append(
    h('h1', { class: 'page-title' }, 'Einstellungen'),
    goalsCard(s),
    displayCard(s),
    await datasetsCard(s),
    backupCard(s),
    await aboutCard(),
  );
}

function goalsCard(s) {
  const field = (key, label, unit) => {
    const input = decimalInput({ value: fmtInput(s.goals[key], 0), placeholder: 'kein Ziel' });
    input.addEventListener('change', async () => {
      const v = parseDecimal(input.value);
      await setSetting('goals', { ...settings().goals, [key]: v > 0 ? v : null });
      input.value = fmtInput(settings().goals[key], 0);
      toast('Gespeichert');
    });
    return h('label', { class: 'field' }, h('span', null, `${label} (${unit})`), input);
  };
  return h('section', { class: 'card' },
    h('div', { class: 'card-head', style: { marginBottom: '8px' } }, h('h3', null, 'Tagesziele')),
    h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Alles freiwillig. Leere Felder bedeuten: kein Ziel.'),
    field('kcal', 'Kalorien', 'kcal'),
    h('div', { class: 'macros' }, field('protein', 'Eiweiß', 'g'), field('carbs', 'Kohlenhydr.', 'g'), field('fat', 'Fett', 'g')),
  );
}

function displayCard(s) {
  const cb = h('input', { type: 'checkbox', checked: !s.showMacros });
  cb.addEventListener('change', () => setSetting('showMacros', !cb.checked));
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', null, 'Anzeige')),
    h('label', { class: 'check' }, cb, h('span', null, 'Nur Kalorien anzeigen (Eiweiß, Kohlenhydrate, Fett ausblenden)')),
  );
}

async function datasetsCard(s) {
  const rows = await Promise.all(Object.entries(DATASETS).map(async ([id, d]) => {
    const { info } = await loadDataset(id);
    const cb = h('input', { type: 'checkbox', checked: s.datasets[id], disabled: !info });
    cb.addEventListener('change', () => setSetting('datasets', { ...settings().datasets, [id]: cb.checked }));
    return h('label', { class: 'check' }, cb, h('span', null, d.label,
      h('small', { class: 'muted', style: { display: 'block' } }, info ? `${info.count} Lebensmittel · ${info.version}` : 'nicht installiert')));
  }));
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', null, 'Datenbanken in der Suche')),
    h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Zum Beispiel in Finnland die deutsche und die Schweizer Datenbank ausblenden. Eigene und gescannte Produkte werden immer durchsucht.'),
    rows,
  );
}

// ---------- Backup ----------

export async function exportBackup() {
  const data = await db.exportAll();
  const payload = { app: 'futter', appVersion: APP_VERSION, schemaVersion: db.SCHEMA_VERSION, exportedAt: new Date().toISOString(), data };
  const name = `futter-backup-${todayISO()}.json`;
  const file = new File([JSON.stringify(payload)], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Futter-Backup' });
    } else {
      const url = URL.createObjectURL(file);
      const a = h('a', { href: url, download: name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
  } catch (e) {
    if (e.name === 'AbortError') return; // Teilen abgebrochen
    toast(`Backup fehlgeschlagen: ${e.message}`);
    return;
  }
  await setSetting('lastBackup', new Date().toISOString());
  await setSetting('backupReminderSnoozed', null);
  toast('Backup erstellt');
  refreshView();
}

async function importBackup(file) {
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    return toast('Die Datei ist kein gültiges Backup.');
  }
  if (payload?.app !== 'futter' || !payload.data) return toast('Die Datei ist kein Futter-Backup.');
  if (payload.schemaVersion > db.SCHEMA_VERSION) return toast('Das Backup stammt aus einer neueren App-Version. Bitte zuerst die App aktualisieren.');
  const n = payload.data.logEntries?.length ?? 0;
  const mode = await ask({
    title: 'Backup einspielen?',
    text: `Backup vom ${new Date(payload.exportedAt).toLocaleString('de-DE')} mit ${n} Einträgen. „Zusammenführen“ behält deine aktuellen Daten und ergänzt sie, „Ersetzen“ löscht zuerst alle Daten auf diesem Gerät.`,
    buttons: [
      { label: 'Zusammenführen', value: 'merge', primary: true },
      { label: 'Alles ersetzen', value: 'replace', danger: true },
      { label: 'Abbrechen', value: null },
    ],
  });
  if (!mode) return;
  await db.importAll(payload.data, mode);
  await loadSettings();
  toast('Backup eingespielt');
  refreshView();
}

function backupCard(s) {
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileInput.addEventListener('change', () => { const f = fileInput.files?.[0]; fileInput.value = ''; if (f) importBackup(f); });
  const last = s.lastBackup ? new Date(s.lastBackup) : null;
  const days = last ? Math.floor((Date.now() - last) / 86400000) : null;
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', null, 'Backup')),
    h('p', { class: days == null || days > 30 ? '' : 'muted', style: { marginTop: '4px', color: days == null || days > 30 ? 'var(--warn)' : '' } },
      last ? `Letztes Backup: ${last.toLocaleDateString('de-DE')} (vor ${days} ${days === 1 ? 'Tag' : 'Tagen'})` : 'Noch kein Backup erstellt.'),
    h('p', { class: 'muted small' }, 'Deine Daten liegen nur auf diesem Gerät. Speichere das Backup z. B. in „Dateien“ oder iCloud Drive.'),
    h('div', { class: 'stack' },
      h('button', { class: 'btn primary block', onclick: exportBackup }, 'Backup exportieren'),
      h('button', { class: 'btn block', onclick: () => fileInput.click() }, 'Backup importieren'),
    ),
    fileInput,
  );
}

async function aboutCard() {
  const persisted = await navigator.storage?.persisted?.().catch(() => null);
  const link = (url, text) => h('a', { href: url, target: '_blank', rel: 'noopener' }, text ?? url.replace(/^https:\/\//, ''));
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', null, 'Über')),
    h('p', null, `Futter ${APP_VERSION} – private App ohne Konto, ohne Werbung, ohne Tracking. Alle Daten bleiben auf diesem Gerät. Nur beim Scannen wird die Barcode-Nummer an Open Food Facts geschickt.`),
    persisted != null && h('p', { class: 'muted small' }, persisted ? 'Speicher ist als dauerhaft markiert.' : 'Speicher ist nicht als dauerhaft markiert – regelmäßige Backups sind besonders wichtig.'),
    h('h4', { style: { margin: '16px 0 6px' } }, 'Datenquellen'),
    h('p', { class: 'small' }, h('b', null, 'Open Food Facts'), ' – Produktdaten von ', link('https://world.openfoodfacts.org'), ', verfügbar unter der ',
      link('https://opendatacommons.org/licenses/odbl/1-0/', 'Open Database License (ODbL)'), '. Einzelne Inhalte unter der Database Contents License, Bilder unter CC BY-SA.'),
    h('p', { class: 'small' }, h('b', null, 'Bundeslebensmittelschlüssel (BLS) 4.0'), ' – Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS), Version 4.0 – Deutsche Nährstoffdatenbank. Karlsruhe. ',
      link('https://doi.org/10.25826/Data20251217-134202-0', 'DOI 10.25826/Data20251217-134202-0'), '. Lizenz ',
      link('https://creativecommons.org/licenses/by/4.0/deed.de', 'CC BY 4.0'), '. Für die App umgewandelt (Auswahl der Nährstoffe, gerundet).'),
    h('p', { class: 'small' }, h('b', null, 'Schweizer Nährwertdatenbank'), ' – Bundesamt für Lebensmittelsicherheit und Veterinärwesen BLV, ',
      link('https://naehrwertdaten.ch'), '. Freie Nutzung, Quellenangabe Pflicht (', link('https://opendata.swiss/de/dataset/naehrwerte_lebensmittel', 'opendata.swiss'), '). Für die App umgewandelt (Auswahl der Nährstoffe).'),
    h('p', { class: 'small' }, h('b', null, 'Fineli'), ' – ', FINELI_ATTRIBUTION, ' ', link('https://fineli.fi'), ' · ', link('https://creativecommons.org/licenses/by/4.0/deed.de', 'Lizenztext')),
    h('p', { class: 'small muted' }, 'Barcode-Erkennung: zxing-wasm (MIT-Lizenz).'),
  );
}

const FINELI_ATTRIBUTION = 'Finnische Nährwertdatenbank, Terveyden ja hyvinvoinnin laitos (THL), lizenziert unter CC BY 4.0. Für die App umgewandelt (Auswahl der Nährstoffe, Einheiten umgerechnet).';
