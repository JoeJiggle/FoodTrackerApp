// Startbildschirm: Tagessummen, Monatsübersicht, Mahlzeiten, Tageswechsel.
import { h, icon, actionSheet, toast, confirmAction, promptText, settingsButton } from '../ui.js';
import { state, refreshView } from '../state.js';
import { settings, setSetting } from '../settings.js';
import { fmtKcal, fmtMacro, fmtAmount, fmtDateLong, addDays, todayISO, parseISO } from '../format.js';
import { goalsMet, goalGaps } from '../nutrition.js';
import { MEALS, mealForNow, entriesForDate, entriesInRange, entryNutrients, totalsOf, copyMeal, deleteEntry, mealLabel } from '../log.js';
import { getFood } from '../foods.js';
import { openFoodDetail, openFoodPicker, openStoredList } from './add.js';
import { openScanner } from './scan.js';
import { openManualForm } from './manual.js';
import { exportBackup } from './settings.js';
import { openQuickEntry } from './quick.js';
import { openTemplates } from './templates.js';
import { saveTemplate } from '../templates.js';

const DAY_MS = 86400000;

export async function renderToday(root) {
  const s = settings();
  if (!s.firstUse) await setSetting('firstUse', new Date().toISOString());
  const entries = await entriesForDate(state.date);
  const totals = totalsOf(entries);

  root.append(...[dayNav(), backupReminder(), summaryCard(totals, s)].filter(Boolean));
  for (const meal of MEALS) root.append(mealCard(meal, entries.filter((e) => e.meal === meal.id), s));
  root.append(await monthCard(s)); // unter den Mahlzeiten, damit das Eintragen ohne Scrollen erreichbar bleibt
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
    settingsButton(),
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

// Welche Ziele über „erreicht“ entscheiden: bei „Nur Kalorien“ nur das Kalorienziel.
const goalKeysFor = (s) => (s.showMacros ? ['kcal', 'protein', 'carbs', 'fat'] : ['kcal']);
const GOAL_LABELS = { protein: 'Eiweiß', carbs: 'Kohlenhydrate', fat: 'Fett' };

/** Zeile unter der Tagessumme: Ziel erreicht, oder was noch fehlt. */
function goalStatus(t, s) {
  const gaps = goalGaps(t, s.goals, goalKeysFor(s));
  if (gaps === null) return null;
  if (!gaps.length) return h('p', { class: 'goal-status ok' }, icon('check'), 'Tagesziel erreicht');
  const parts = gaps.map(({ key, missing }) => (key === 'kcal' ? `${fmtKcal(missing)} kcal` : `${GOAL_LABELS[key]} ${fmtMacro(missing)} g`));
  return h('p', { class: 'goal-status' }, `Bis zum Tagesziel fehlen noch: ${parts.join(' · ')}`);
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
    goalStatus(t, s),
  );
}

// ---------- Monatsübersicht ----------

let calMonth = null; // angezeigter Monat 'JJJJ-MM'
let calSyncedFor = null; // Tag, zu dem calMonth zuletzt passend gesetzt wurde

const pad = (n) => String(n).padStart(2, '0');

function shiftMonth(ym, dir) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + dir, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** Kalender des Monats: Tage mit erreichtem Tagesziel grün, erfasste Tage mit Punkt. Antippen öffnet den Tag. */
async function monthCard(s) {
  // Wechselt der angezeigte Tag in einen anderen Monat, springt der Kalender mit.
  if (calSyncedFor !== state.date) {
    calMonth = state.date.slice(0, 7);
    calSyncedFor = state.date;
  }
  const [y, m] = calMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const today = todayISO();
  const thisMonth = today.slice(0, 7);
  // „Nur Kalorien“: dann zählt nur das Kalorienziel
  const goalKeys = goalKeysFor(s);
  const hasGoal = goalsMet({}, s.goals, goalKeys) !== null;

  const entries = await entriesInRange(`${calMonth}-01`, `${calMonth}-${pad(daysInMonth)}`);
  const streak = hasGoal ? await currentStreak(s.goals, goalKeys) : null;
  const byDate = {};
  for (const e of entries) (byDate[e.date] ??= []).push(e);

  let met = 0;
  let logged = 0;
  const cells = [];
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Montag zuerst
  for (let i = 0; i < lead; i++) cells.push(h('span'));
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${calMonth}-${pad(d)}`;
    const list = byDate[iso];
    const future = iso > today;
    let status = '';
    let label = 'nichts erfasst';
    if (list?.length) {
      logged++;
      if (goalsMet(totalsOf(list), s.goals, goalKeys)) { status = 'met'; label = 'Tagesziel erreicht'; met++; }
      else { status = 'logged'; label = hasGoal ? 'erfasst, Ziel nicht erreicht' : 'erfasst'; }
    }
    cells.push(h('button', {
      class: `cal-day ${status} ${future ? 'future' : ''} ${iso === today ? 'today' : ''} ${iso === state.date ? 'selected' : ''}`,
      disabled: future,
      'aria-label': `${parseISO(iso).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}: ${label}`,
      'aria-current': iso === state.date ? 'date' : null,
      onclick: () => { state.date = iso; refreshView(); },
    }, d));
  }

  const open = s.showMonth;
  const monthName = new Date(y, m - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  const summary = hasGoal
    ? `${met} ${met === 1 ? 'Tag' : 'Tage'} Ziel erreicht${streak?.days ? ` · Serie ${streak.days}` : ''}`
    : `${logged} ${logged === 1 ? 'Tag' : 'Tage'} erfasst`;

  return h('section', { class: 'card month', 'aria-label': 'Monatsübersicht' },
    h('div', { class: 'card-head' },
      h('button', { class: 'month-toggle', 'aria-expanded': String(open), onclick: async () => { await setSetting('showMonth', !open); refreshView(); } },
        h('h3', null, monthName), icon(open ? 'up' : 'down'), !open && h('span', { class: 'muted small' }, summary)),
      open && h('div', { class: 'row', style: { gap: '0' } },
        h('button', { class: 'btn-icon', 'aria-label': 'Vorheriger Monat', onclick: () => { calMonth = shiftMonth(calMonth, -1); refreshView(); } }, icon('left')),
        h('button', { class: 'btn-icon', 'aria-label': 'Nächster Monat', disabled: calMonth >= thisMonth, onclick: () => { calMonth = shiftMonth(calMonth, 1); refreshView(); } }, icon('right')),
      ),
    ),
    open && h('div', { class: 'cal-grid', role: 'group', 'aria-label': monthName },
      ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => h('span', { class: 'cal-wd', 'aria-hidden': 'true' }, w)),
      cells,
    ),
    open && (hasGoal
      ? h('div', { class: 'cal-legend' },
        h('span', null, h('i', { class: 'dot met' }), `Ziel erreicht: ${met}`),
        h('span', null, h('i', { class: 'dot logged' }), `nicht erreicht: ${logged - met}`))
      : h('p', { class: 'muted small', style: { margin: '8px 0 0' } }, 'Setze unter ', h('a', { href: '#einstellungen' }, 'Einstellungen → Tagesziele'), ' ein Ziel, dann werden Tage mit erreichtem Ziel grün markiert.')),
    open && streak?.days > 0 && h('p', { class: 'streak' },
      `Serie: ${streak.days} ${streak.days === 1 ? 'Tag' : 'Tage'} in Folge Ziel erreicht`,
      streak.todayOpen ? h('span', { class: 'muted' }, ' · heute noch offen') : ''),
  );
}

/**
 * Aktuelle Serie: Tage in Folge mit erreichtem Ziel, rückwärts ab heute.
 * Ist heute (noch) nicht erreicht, zählt die Serie bis gestern – der Tag läuft ja noch.
 */
async function currentStreak(goals, keys) {
  const today = todayISO();
  const entries = await entriesInRange(addDays(today, -400), today);
  const byDate = {};
  for (const e of entries) (byDate[e.date] ??= []).push(e);
  const metOn = (d) => !!byDate[d] && goalsMet(totalsOf(byDate[d]), goals, keys) === true;
  const todayOpen = !metOn(today);
  let d = todayOpen ? addDays(today, -1) : today;
  let days = 0;
  while (metOn(d)) { days++; d = addDays(d, -1); }
  return { days, todayOpen };
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
      h('span', { class: 'sub' }, e.quick ? 'Schnelleintrag' : `${fmtAmount(e.amount)} ${e.unit}`, e.brand ? ` · ${e.brand}` : ''),
    ),
    h('span', { class: 'value' }, `${fmtKcal(n.kcal)} kcal`,
      s.showMacros && h('small', null, `E ${fmtMacro(n.protein)} · K ${fmtMacro(n.carbs)} · F ${fmtMacro(n.fat)}`)),
  );
}

async function editEntry(entry) {
  if (entry.quick) return openQuickEntry({ date: entry.date, meal: entry.meal }, entry);
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
      { label: 'Als Vorlage speichern', icon: 'stack', onClick: async () => {
        const list = (await entriesForDate(state.date)).filter((e) => e.meal === meal.id);
        if (!list.length) return toast(`Bei ${meal.label} gibt es noch keine Einträge.`);
        const name = await promptText({ title: 'Vorlage speichern', text: `${list.length} ${list.length === 1 ? 'Eintrag' : 'Einträge'} als Vorlage, z. B. „Mein Frühstück“.`, value: `Mein ${meal.label}`, okLabel: 'Speichern' });
        if (!name) return;
        await saveTemplate(name, list);
        toast(`Vorlage „${name}“ gespeichert – im +-Menü unter „Vorlagen“`);
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
      { label: 'Schnelleintrag (nur kcal)', icon: 'bolt', onClick: () => openQuickEntry(ctx) },
      { label: 'Vorlagen', icon: 'stack', onClick: () => openTemplates(ctx) },
      { label: 'Favoriten', icon: 'star', onClick: () => openStoredList('favorites', { onPick: log }) },
      { label: 'Zuletzt verwendet', icon: 'clock', onClick: () => openStoredList('recent', { onPick: log }) },
      { label: 'Manuell erfassen', icon: 'keyboard', onClick: () => openManualForm({ onSaved: log }) },
    ],
  });
}
