// Gewicht: Eintragen, Verlauf als Linie (mit 7-Tage-Durchschnitt), Kennzahlen, letzte Werte.
import { h, icon, toast, decimalInput, confirmAction, pageHeader } from '../ui.js';
import { fmtKcal, fmtInput, todayISO, addDays, parseISO } from '../format.js';
import { parseDecimal } from '../nutrition.js';
import { entriesInRange, totalsOf } from '../log.js';
import { getWeight, saveWeight, deleteWeight, weightsInRange, allWeights, movingAverage, daysBetween } from '../weight.js';

const RANGES = [['30', '30 Tage'], ['90', '90 Tage'], ['365', '1 Jahr'], ['all', 'Alle']];
const view = { range: '90', date: null };

const fmtKg = (v) => (v == null ? '–' : v.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const fmtDiff = (v) => (v == null ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmtKg(Math.abs(v))}`);

export async function renderWeight(root) {
  const today = todayISO();
  view.date ??= today;
  const all = (await allWeights()).sort((a, b) => a.date.localeCompare(b.date));
  const from = view.range === 'all' ? (all[0]?.date ?? today) : addDays(today, -(Number(view.range) - 1));
  const points = all.filter((p) => p.date >= from && p.date <= today);
  const rerender = async () => { const f = h('div'); await renderWeight(f); root.replaceChildren(...f.childNodes); };

  root.append(pageHeader('Gewicht'), await entryCard(rerender, all));
  root.append(
    h('div', { class: 'seg', style: { marginBottom: '12px' } },
      RANGES.map(([id, label]) => h('button', { class: view.range === id ? 'on' : '', onclick: () => { view.range = id; rerender(); } }, label))),
    h('section', { class: 'card chart' }, points.length ? chart(points, from, today) : h('p', { class: 'empty' }, 'Noch keine Werte in diesem Zeitraum.')),
    await statsCard(points, from, today),
    listCard(all, rerender),
  );
}

async function entryCard(rerender, all) {
  const existing = await getWeight(view.date);
  const last = all.at(-1);
  const kg = decimalInput({ value: fmtInput(existing?.kg), placeholder: last ? fmtKg(last.kg) : 'z. B. 72,5', 'aria-label': 'Gewicht in kg' });
  const date = h('input', { type: 'date', value: view.date, max: todayISO(), 'aria-label': 'Tag' });
  date.addEventListener('change', () => { view.date = date.value || todayISO(); rerender(); });
  const save = async () => {
    const v = parseDecimal(kg.value);
    if (!(v > 20 && v < 400)) return toast('Bitte ein Gewicht in kg eingeben, z. B. 72,5.');
    await saveWeight(view.date, Math.round(v * 10) / 10);
    toast('Gewicht gespeichert');
    rerender();
  };
  kg.addEventListener('keydown', (e) => e.key === 'Enter' && save());
  return h('section', { class: 'card' },
    h('div', { class: 'weight-entry' },
      h('label', { class: 'field' }, h('span', null, 'Tag'), date),
      h('label', { class: 'field' }, h('span', null, 'Gewicht (kg)'), kg),
    ),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary grow', onclick: save }, existing ? 'Aktualisieren' : 'Speichern'),
      existing && h('button', { class: 'btn danger', 'aria-label': 'Wert löschen', onclick: async () => {
        if (!(await confirmAction('Diesen Wert löschen?', 'Löschen', true))) return;
        await deleteWeight(view.date);
        rerender();
      } }, icon('trash')),
    ),
  );
}

async function statsCard(points, from, today) {
  const first = points[0], last = points.at(-1);
  // Ø Kalorien an erfassten Tagen im selben Zeitraum – zeigt den Zusammenhang Essen ↔ Gewicht
  const entries = await entriesInRange(from, today);
  const byDate = {};
  for (const e of entries) (byDate[e.date] ??= []).push(e);
  const dayTotals = Object.values(byDate).map((l) => totalsOf(l).kcal ?? 0);
  const avgKcal = dayTotals.length ? dayTotals.reduce((a, b) => a + b, 0) / dayTotals.length : null;
  const span = first && last ? daysBetween(first.date, last.date) : 0;
  const perWeek = span >= 7 ? ((last.kg - first.kg) / span) * 7 : null;
  const stat = (value, label) => h('div', { class: 'stat' }, h('b', null, value), h('span', null, label));
  return h('section', { class: 'card' },
    h('div', { class: 'stat-grid' },
      stat(last ? `${fmtKg(last.kg)} kg` : '–', 'aktuell'),
      stat(first && last && first !== last ? `${fmtDiff(last.kg - first.kg)} kg` : '–', 'Veränderung im Zeitraum'),
      stat(perWeek == null ? '–' : `${fmtDiff(perWeek)} kg`, 'pro Woche (Ø)'),
      stat(avgKcal == null ? '–' : fmtKcal(avgKcal), 'kcal pro Tag (Ø, erfasste Tage)'),
    ),
  );
}

function listCard(all, rerender) {
  const recent = all.slice(-14).reverse();
  if (!recent.length) return null;
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', null, 'Letzte Werte')),
    h('div', { class: 'list' }, recent.map((p) => {
      const prev = all[all.indexOf(p) - 1];
      return h('button', { class: 'list-item', onclick: () => { view.date = p.date; rerender(); window.scrollTo(0, 0); } },
        h('span', { class: 'main' }, h('span', { class: 'title' }, parseISO(p.date).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))),
        h('span', { class: 'value' }, `${fmtKg(p.kg)} kg`, prev && h('small', null, `${fmtDiff(p.kg - prev.kg)} kg`)),
      );
    })),
  );
}

/** Linie der Einzelwerte (Punkte) und 7-Tage-Durchschnitt, selbst als SVG gezeichnet. */
function chart(points, from, to) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 340, H = 190, top = 14, bottom = 22, left = 34, right = 8;
  const span = Math.max(1, daysBetween(from, to));
  const kgs = points.map((p) => p.kg);
  let min = Math.min(...kgs), max = Math.max(...kgs);
  if (max - min < 2) { const mid = (max + min) / 2; min = mid - 1; max = mid + 1; }
  const pad = (max - min) * 0.1;
  min -= pad; max += pad;
  const x = (d) => left + ((W - left - right) * daysBetween(from, d)) / span;
  const y = (kg) => top + (H - top - bottom) * (1 - (kg - min) / (max - min));
  const el = (tag, attrs, text) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text != null) e.textContent = text;
    return e;
  };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Gewichtsverlauf' });
  // Hilfslinien mit Beschriftung
  for (const v of [max - pad, (max + min) / 2, min + pad]) {
    svg.append(el('line', { x1: left, x2: W - right, y1: y(v), y2: y(v), class: 'grid-line' }));
    svg.append(el('text', { x: left - 4, y: y(v) + 3, 'text-anchor': 'end' }, fmtKg(v)));
  }
  const fmtD = (d) => parseISO(d).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' });
  svg.append(el('text', { x: left, y: H - 6, 'text-anchor': 'start' }, fmtD(from)));
  svg.append(el('text', { x: W - right, y: H - 6, 'text-anchor': 'end' }, fmtD(to)));
  if (points.length >= 3) {
    const avg = movingAverage(points);
    svg.append(el('polyline', { points: avg.map((p) => `${x(p.date)},${y(p.kg)}`).join(' '), class: 'avg-line' }));
  }
  if (points.length >= 2) svg.append(el('polyline', { points: points.map((p) => `${x(p.date)},${y(p.kg)}`).join(' '), class: 'weight-line' }));
  for (const p of points) {
    const c = el('circle', { cx: x(p.date), cy: y(p.kg), r: points.length > 60 ? 1.8 : 3, class: 'weight-dot' });
    c.append(el('title', {}, `${fmtD(p.date)}: ${fmtKg(p.kg)} kg`));
    svg.append(c);
  }
  return h('div', null, svg, points.length >= 3 && h('div', { class: 'cal-legend' },
    h('span', null, h('i', { class: 'dot met' }), 'Messwerte'), h('span', null, h('i', { class: 'line-key' }), '7-Tage-Durchschnitt')));
}
