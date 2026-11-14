// Schnelleintrag: nur Kalorien (und optional Makros), ohne Lebensmittel anzulegen.
import { h, openScreen, closeAllScreens, toast, decimalInput, confirmAction, icon } from '../ui.js';
import { refreshView } from '../state.js';
import { settings } from '../settings.js';
import { fmtInput } from '../format.js';
import { parseDecimal } from '../nutrition.js';
import { MEALS, addQuickEntry, updateEntry, deleteEntry } from '../log.js';

/** ctx: {date, meal}; entry: vorhandener Schnelleintrag zum Bearbeiten. */
export function openQuickEntry(ctx, entry) {
  const editing = !!entry;
  let meal = entry?.meal ?? ctx.meal ?? 'snack';
  return openScreen({
    title: editing ? 'Schnelleintrag bearbeiten' : 'Schnelleintrag',
    render(body) {
      const v = entry?.per100 ?? {};
      const name = h('input', { type: 'text', value: entry?.name === 'Schnelleintrag' ? '' : entry?.name ?? '', placeholder: 'z. B. Mittagessen Kantine', autocomplete: 'off' });
      const kcal = decimalInput({ value: fmtInput(v.kcal, 0), placeholder: 'kcal', 'aria-label': 'Kalorien' });
      const macro = (k) => decimalInput({ value: fmtInput(v[k]), placeholder: 'optional', 'aria-label': k });
      const protein = macro('protein'), carbs = macro('carbs'), fat = macro('fat');
      const date = h('input', { type: 'date', value: entry?.date ?? ctx.date, 'aria-label': 'Datum' });
      const mealChips = h('div', { class: 'chips' });
      const drawMeals = () => mealChips.replaceChildren(...MEALS.map((m) => h('button', { class: `chip ${m.id === meal ? 'on' : ''}`, onclick: () => { meal = m.id; drawMeals(); } }, m.label)));
      drawMeals();
      const err = h('p', { class: 'small', style: { color: 'var(--danger)', margin: '8px 0 0' }, role: 'alert' });

      async function save() {
        const k = parseDecimal(kcal.value);
        if (!(k >= 0) || kcal.value.trim() === '') return (err.textContent = 'Bitte die Kalorien eingeben.');
        const values = { kcal: k, protein: parseDecimal(protein.value), carbs: parseDecimal(carbs.value), fat: parseDecimal(fat.value) };
        const label = name.value.trim() || 'Schnelleintrag';
        const d = date.value || ctx.date;
        if (editing) {
          await updateEntry({ ...entry, name: label, date: d, meal, per100: { ...entry.per100, ...values } });
          toast('Gespeichert');
        } else {
          const e = await addQuickEntry({ date: d, meal, name: label, ...values });
          toast(`${label} eingetragen`, { action: 'Rückgängig', onAction: async () => { await deleteEntry(e.id); refreshView(); } });
        }
        closeAllScreens();
        refreshView();
      }

      body.append(
        h('div', { class: 'card' },
          h('label', { class: 'field' }, h('span', null, 'Bezeichnung'), name),
          h('label', { class: 'field', style: { marginBottom: settings().showMacros ? '12px' : '0' } }, h('span', null, 'Kalorien (kcal)'), kcal),
          settings().showMacros && h('div', { class: 'macros' },
            h('label', { class: 'field' }, h('span', null, 'Eiweiß (g)'), protein),
            h('label', { class: 'field' }, h('span', null, 'Kohlenhydr. (g)'), carbs),
            h('label', { class: 'field' }, h('span', null, 'Fett (g)'), fat),
          ),
          err,
        ),
        h('div', { class: 'card' },
          h('label', { class: 'field' }, h('span', null, 'Tag'), date),
          h('p', { class: 'muted small', style: { margin: '0 0 8px' } }, 'Mahlzeit'),
          mealChips,
        ),
        editing && h('button', { class: 'btn danger block', onclick: async () => {
          if (!(await confirmAction('Diesen Eintrag löschen?', 'Löschen', true))) return;
          await deleteEntry(entry.id);
          closeAllScreens();
          refreshView();
        } }, icon('trash'), 'Eintrag löschen'),
        h('div', { class: 'screen-footer' }, h('button', { class: 'btn primary block', onclick: save }, editing ? 'Speichern' : 'Eintragen')),
      );
      if (!editing) setTimeout(() => kcal.focus(), 250);
    },
  });
}
