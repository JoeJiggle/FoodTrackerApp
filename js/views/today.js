// Startbildschirm: Tagessummen, Mahlzeiten, Tageswechsel.
import { h, icon, actionSheet, toast, confirmAction } from '../ui.js';
import { state, refreshView } from '../state.js';
import { settings, setSetting } from '../settings.js';
import { fmtKcal, fmtMacro, fmtAmount, fmtDateLong, addDays, todayISO } from '../format.js';
import { MEALS, mealForNow, entriesForDate, entryNutrients, totalsOf, copyMeal, deleteEntry, mealLabel } from '../log.js';
import { getFood } from '../foods.js';
import { openFoodDetail, openFoodPicker, openStoredList } from './add.js';
import { openScanner } from './scan.js';
import { openManualForm } from './manual.js';
import { exportBackup } from './settings.js';

const DAY_MS = 86400000;

export async function renderToday(root) {
  const s = settings();
  if (!s.firstUse) await setSetting('firstUse', new Date().toISOString());
  const entries = await entriesForDate(state.date);
  const totals = totalsOf(entries);

  root.append(...[dayNav(), backupReminder(), summaryCard(totals, s)].filter(Boolean));
  for (const meal of MEALS) root.append(mealCard(meal, entries.filter((e) => e.meal === meal.id), s));
}

function dayNav() {
  const dateInput = h('input', {
    type: 'date', value: state.date, 'aria-label': 'Datum wählen',
    onchange: (e) => { if (e.target.value) { state.date = e.target.value; refreshView(); } },
  });
  return h('div', { class: 'daynav' },
    h('button', { class: 'btn-icon', 'aria-label': 'Vorheriger Tag', onclick: () => { state.date = addDays(state.date, -1); refreshView(); } }, icon('left')),
    h('button', { class: 'date-btn' }, fmtDateLong(state.date), dateInput),
    state.date === todayISO()
      ? h('span', { style: { width: '44px' } })
      : h('button', { class: 'btn-icon', 'aria-label': 'Nächster Tag', onclick: () => { state.date = addDays(state.date, 1); refreshView(); } }, icon('right')),
  );
}

function backupReminder() {
  const s = settings();
  const now = Date.now();
  const since = Date.parse(s.lastBackup ?? s.firstUse ?? new Date().toISOString());
  if (now - since < 30 * DAY_MS) return null;
  if (s.backupReminderSnoozed && now < Date.parse(s.backupReminderSnoozed)) return null;
  const days = Math.floor((now - since) / DAY_MS);
  return h('div', { class: 'card hint-card warn' },
    h('p', { style: { margin: '0 0 10px' } }, s.lastBackup ? `Dein letztes Backup ist ${days} Tage her.` : 'Du hast noch kein Backup deiner Daten gemacht.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: () => exportBackup() }, 'Jetzt sichern'),
      h('button', { class: 'btn', onclick: async () => {
        await setSetting('backupReminderSnoozed', new Date(now + 7 * DAY_MS).toISOString());
        refreshView();
      } }, 'Später'),
    ),
  );
}

function progress(value, goal) {
  if (!(goal > 0)) return null;
  const pct = Math.min(100, ((value ?? 0) / goal) * 100);
  return h('div', { class: `bar ${(value ?? 0) > goal ? 'over' : ''}` }, h('i', { style: { width: `${pct}%` } }));
}

function summaryCard(t, s) {
  const g = s.goals;
  const kcalLine = g.kcal > 0
    ? h('span', null, `von ${fmtKcal(g.kcal)} kcal · ${(t.kcal ?? 0) <= g.kcal ? `noch ${fmtKcal(g.kcal - (t.kcal ?? 0))}` : `${fmtKcal((t.kcal ?? 0) - g.kcal)} drüber`}`)
    : h('span', null, 'kcal');
  const macro = (cls, label, v, goal) => h('div', { class: `macro ${cls}` },
    h('b', null, fmtMacro(v ?? 0), goal > 0 ? h('small', { class: 'muted' }, ` / ${fmtKcal(goal)}`) : '', ' g'),
    h('span', { class: 'muted' }, label),
    progress(v, goal) ?? h('div', { class: 'bar' }, h('i', { style: { width: '0' } })),
  );
  return h('section', { class: 'card summary', 'aria-label': 'Tagessumme' },
    h('div', { class: 'kcal-big' }, h('strong', null, fmtKcal(t.kcal ?? 0)), kcalLine),
    progress(t.kcal, g.kcal),
    s.showMacros && h('div', { class: 'macros' },
      macro('p', 'Eiweiß', t.protein, g.protein),
      macro('c', 'Kohlenhydr.', t.carbs, g.carbs),
      macro('f', 'Fett', t.fat, g.fat),
    ),
  );
}

function mealCard(meal, entries, s) {
  const total = totalsOf(entries);
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h3', null, meal.label),
      h('div', { class: 'row', style: { gap: '0' } },
        entries.length > 0 && h('span', { class: 'meal-total' }, `${fmtKcal(total.kcal)} kcal`),
        h('button', { class: 'btn-icon', 'aria-label': `Optionen ${meal.label}`, onclick: () => mealMenu(meal) }, icon('more')),
        h('button', { class: 'btn-icon', 'aria-label': `Zu ${meal.label} hinzufügen`, onclick: () => openAddMenu(meal.id) }, icon('plus')),
      ),
    ),
    entries.length
      ? h('div', { class: 'list' }, entries.map((e) => entryRow(e, s)))
      : null,
  );
}

function entryRow(e, s) {
  const n = entryNutrients(e);
  return h('button', { class: 'list-item', onclick: () => editEntry(e) },
    h('span', { class: 'main' },
      h('span', { class: 'title' }, e.name),
      h('span', { class: 'sub' }, `${fmtAmount(e.amount)} ${e.unit}`, e.brand ? ` · ${e.brand}` : ''),
    ),
    h('span', { class: 'value' }, `${fmtKcal(n.kcal)} kcal`,
      s.showMacros && h('small', null, `E ${fmtMacro(n.protein)} · K ${fmtMacro(n.carbs)} · F ${fmtMacro(n.fat)}`)),
  );
}

async function editEntry(entry) {
  // Lebensmittel aus der Quelle holen (für Portionen/Bild); Nährwerte bleiben die gespeicherte Kopie.
  const food = (await getFood(entry.foodKey)) ?? { key: entry.foodKey, source: entry.source, name: entry.name, brand: entry.brand, unit: entry.unit, servings: [] };
  openFoodDetail({ ...food, name: entry.name, per100: entry.per100 }, { date: entry.date, meal: entry.meal, entry });
}

function mealMenu(meal) {
  const yesterday = addDays(state.date, -1);
  actionSheet({
    title: meal.label,
    items: [
      { label: `${meal.label} von gestern kopieren`, icon: 'copy', onClick: async () => {
        const n = await copyMeal(yesterday, state.date, meal.id);
        toast(n ? `${n} ${n === 1 ? 'Eintrag' : 'Einträge'} kopiert` : `Gestern gab es keine Einträge bei ${meal.label}.`);
        refreshView();
      } },
      { label: `${meal.label} leeren`, icon: 'trash', danger: true, onClick: async () => {
        const list = (await entriesForDate(state.date)).filter((e) => e.meal === meal.id);
        if (!list.length) return;
        if (!(await confirmAction(`Alle ${list.length} Einträge bei ${meal.label} löschen?`, 'Löschen', true))) return;
        for (const e of list) await deleteEntry(e.id);
        refreshView();
      } },
    ],
  });
}

/** Das „+“-Menü. Die Mahlzeit lässt sich oben umschalten. */
export function openAddMenu(mealId) {
  if (location.hash && location.hash !== '#heute') location.hash = '#heute';
  const ctx = { date: state.date, meal: mealId ?? (state.date === todayISO() ? mealForNow() : 'snack') };
  const chips = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Mahlzeit' });
  const drawChips = () => chips.replaceChildren(...MEALS.map((m) => h('button', {
    class: `chip ${m.id === ctx.meal ? 'on' : ''}`, role: 'radio', 'aria-checked': String(m.id === ctx.meal),
    onclick: () => { ctx.meal = m.id; drawChips(); },
  }, m.label)));
  drawChips();
  const log = (food) => openFoodDetail(food, ctx);
  actionSheet({
    title: `Hinzufügen · ${fmtDateLong(ctx.date)}`,
    top: chips,
    items: [
      { label: 'Barcode scannen', icon: 'scan', onClick: () => openScanner(ctx) },
      { label: 'Suchen', icon: 'search', onClick: () => openFoodPicker({ title: `Suchen · ${mealLabel(ctx.meal)}`, onPick: log }) },
      { label: 'Favoriten', icon: 'star', onClick: () => openStoredList('favorites', { onPick: log }) },
      { label: 'Zuletzt verwendet', icon: 'clock', onClick: () => openStoredList('recent', { onPick: log }) },
      { label: 'Manuell erfassen', icon: 'keyboard', onClick: () => openManualForm({ onSaved: log }) },
    ],
  });
}
