// Verlauf: Woche/Monat als Balkendiagramm (eigenes SVG) und Durchschnittswerte.
import { h, icon, pageHeader } from '../ui.js';
import { state } from '../state.js';
import { settings } from '../settings.js';
import { fmtKcal, fmtMacro, todayISO, addDays, parseISO } from '../format.js';
import { entriesInRange, totalsOf } from '../log.js';

const view = { mode: 'week', anchor: todayISO() };

function period() {
  const d = parseISO(view.anchor);
  if (view.mode === 'week') {
    const monday = addDays(view.anchor, -((d.getDay() + 6) % 7));
    return { from: monday, to: addDays(monday, 6) };
  }
  const first = todayISO(new Date(d.getFullYear(), d.getMonth(), 1));
  const last = todayISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  return { from: first, to: last };
}

function shift(dir) {
  const d = parseISO(view.anchor);
  view.anchor = view.mode === 'week' ? addDays(view.anchor, 7 * dir) : todayISO(new Date(d.getFullYear(), d.getMonth() + dir, 1));
}

function title({ from, to }) {
  const f = parseISO(from), t = parseISO(to);
  if (view.mode === 'month') return f.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  return `${f.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} – ${t.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export async function renderHistory(root) {
  const p = period();
  const entries = await entriesInRange(p.from, p.to);
  const days = [];
  for (let d = p.from; d <= p.to; d = addDays(d, 1)) {
    const list = entries.filter((e) => e.date === d);
    days.push({ date: d, count: list.length, totals: totalsOf(list) });
  }
  const logged = days.filter((d) => d.count > 0);
  const avg = (k) => (logged.length ? logged.reduce((s, d) => s + (d.totals[k] ?? 0), 0) / logged.length : null);
  const s = settings();
  const rerender = async () => { const f = h('div'); await renderHistory(f); root.replaceChildren(...f.childNodes); };

  root.append(
    pageHeader('Verlauf'),
    h('div', { class: 'seg', style: { marginBottom: '12px' } },
      [['week', 'Woche'], ['month', 'Monat']].map(([m, l]) => h('button', { class: view.mode === m ? 'on' : '', onclick: () => { view.mode = m; rerender(); } }, l))),
    h('div', { class: 'daynav' },
      h('button', { class: 'btn-icon', 'aria-label': 'Zurück', onclick: () => { shift(-1); rerender(); } }, icon('left')),
      h('strong', null, title(p)),
      p.to >= todayISO()
        ? h('span', { style: { width: '44px' } })
        : h('button', { class: 'btn-icon', 'aria-label': 'Weiter', onclick: () => { shift(1); rerender(); } }, icon('right')),
    ),
    h('section', { class: 'card chart' }, chart(days, s.goals.kcal)),
    h('section', { class: 'card' },
      h('div', { class: 'card-head', style: { marginBottom: '8px' } }, h('h3', null, 'Durchschnitt'), h('span', { class: 'muted small' }, `${logged.length} von ${days.length} Tagen erfasst`)),
      logged.length
        ? h('div', { class: 'stat-grid' },
          h('div', { class: 'stat' }, h('b', null, fmtKcal(avg('kcal'))), h('span', null, 'kcal pro Tag')),
          s.showMacros && [['protein', 'Eiweiß'], ['carbs', 'Kohlenhydrate'], ['fat', 'Fett']].map(([k, l]) =>
            h('div', { class: 'stat' }, h('b', null, fmtMacro(avg(k)), ' g'), h('span', null, l))),
        )
        : h('p', { class: 'empty' }, 'In diesem Zeitraum gibt es keine Einträge.'),
      logged.length > 0 && h('p', { class: 'muted small', style: { marginBottom: 0 } }, 'Nur Tage mit Einträgen zählen zum Durchschnitt.'),
    ),
  );
}

function chart(days, goal) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 340, H = 180, top = 12, bottom = 22, left = 4, right = 4;
  const max = Math.max(goal || 0, ...days.map((d) => d.totals.kcal ?? 0), 500) * 1.1;
  const slot = (W - left - right) / days.length;
  const bw = Math.max(3, slot * 0.66);
  const y = (v) => top + (H - top - bottom) * (1 - v / max);
  const el = (tag, attrs, text) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text != null) e.textContent = text;
    return e;
  };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Kalorien pro Tag' });
  const today = todayISO();
  days.forEach((d, i) => {
    const v = d.totals.kcal ?? 0;
    const x = left + i * slot + (slot - bw) / 2;
    if (v > 0) {
      const r = el('rect', { x, y: y(v), width: bw, height: Math.max(1, y(0) - y(v)), rx: Math.min(4, bw / 2), class: `bar-rect ${goal > 0 && v > goal ? 'over' : ''}` });
      r.append(el('title', {}, `${parseISO(d.date).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })}: ${fmtKcal(v)} kcal`));
      r.style.cursor = 'pointer';
      r.addEventListener('click', () => { state.date = d.date; location.hash = '#heute'; });
      svg.append(r);
    }
    const dt = parseISO(d.date);
    const label = days.length <= 7 ? dt.toLocaleDateString('de-DE', { weekday: 'short' }).slice(0, 2) : (dt.getDate() === 1 || dt.getDate() % 5 === 0 ? String(dt.getDate()) : '');
    if (label) {
      const t = el('text', { x: left + i * slot + slot / 2, y: H - 6, 'text-anchor': 'middle' }, label);
      if (d.date === today) t.setAttribute('font-weight', '700');
      svg.append(t);
    }
  });
  if (goal > 0) {
    svg.append(el('line', { x1: left, x2: W - right, y1: y(goal), y2: y(goal), class: 'goal-line' }));
    svg.append(el('text', { x: W - right, y: y(goal) - 4, 'text-anchor': 'end' }, `Ziel ${fmtKcal(goal)}`));
  }
  svg.append(el('line', { x1: left, x2: W - right, y1: y(0), y2: y(0), stroke: 'currentColor', 'stroke-opacity': '.2' }));
  return svg;
}
