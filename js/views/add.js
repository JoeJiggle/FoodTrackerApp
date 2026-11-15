// Lebensmittel auswählen (Suche, Favoriten, Zuletzt) und Menge eintragen.
import { h, icon, openScreen, closeAllScreens, toast, decimalInput, confirmAction } from '../ui.js';
import { refreshView } from '../state.js';
import { settings } from '../settings.js';
import { fmtKcal, fmtMacro, fmtAmount, fmtInput, fmtDateLong } from '../format.js';
import { NUTRIENT_LABELS, scaleNutrients, parseDecimal, kcalToKj, safeImageUrl } from '../nutrition.js';
import { MEALS, addEntry, updateEntry, deleteEntry } from '../log.js';
import { SOURCE_LABEL, getMeta, setFavorite, saveServings, allServings, listFavorites, listRecent, fetchAndStoreProduct } from '../foods.js';
import { buildSearchIndex } from '../search.js';
import { DATASETS } from '../datasets.js';
import { openManualForm } from './manual.js';

// ---------- Listenzeile für ein Lebensmittel ----------

export function foodRow(food, onClick, extra) {
  return h('button', { class: 'list-item', onclick: () => onClick(food) },
    h('span', { class: `badge ${food.source}` }, SOURCE_LABEL[food.source] ?? food.source),
    h('span', { class: 'main' },
      h('span', { class: 'title' }, food.name),
      h('span', { class: 'sub' }, [food.original, food.brand, food.sub].filter(Boolean).join(' · ') || ' '),
    ),
    h('span', { class: 'value' }, food.per100?.kcal != null ? `${fmtKcal(food.per100.kcal)}` : '–', h('small', null, `kcal/100 ${food.unit === 'ml' ? 'ml' : 'g'}`)),
    extra,
  );
}

// ---------- Suche ----------

/** Suchbildschirm über alle lokalen Quellen. onPick(food) wird bei Auswahl aufgerufen. */
export function openFoodPicker({ title = 'Suchen', onPick }) {
  return openScreen({
    title,
    render(body) {
      const input = h('input', { type: 'search', placeholder: 'Lebensmittel suchen …', autocomplete: 'off', autocorrect: 'off', spellcheck: false, enterkeyhint: 'search', 'aria-label': 'Suchbegriff' });
      const status = h('p', { class: 'muted small' }, 'Datenbanken werden geladen …');
      const results = h('div', { class: 'list' });
      body.append(h('div', { class: 'searchbar', style: { position: 'sticky' } }, h('div', { style: { position: 'relative' } }, icon('search'), input)), status, h('div', { class: 'card' }, results));
      let index = null;
      let timer;
      const showDefault = async () => {
        const [favs, recent] = await Promise.all([listFavorites(), listRecent(15)]);
        if (input.value.trim()) return; // inzwischen wurde getippt
        results.replaceChildren(
          favs.length ? h('p', { class: 'muted small', style: { margin: '4px 0' } }, 'Favoriten') : null,
          ...favs.map((f) => foodRow(f, onPick)),
          recent.length ? h('p', { class: 'muted small', style: { margin: '12px 0 4px' } }, 'Zuletzt verwendet') : null,
          ...recent.map((f) => foodRow(f, onPick)),
        );
        if (!favs.length && !recent.length) results.replaceChildren(h('p', { class: 'empty' }, 'Tippe einen Namen ein, z. B. „Apfel“, „Haferflocken“ oder „ruisleipä“.'));
      };
      const run = () => {
        const q = input.value.trim();
        if (!q) return showDefault();
        if (!index) return;
        const found = index.search(q, 80);
        results.replaceChildren(...(found.length ? found.map((f) => foodRow(f, onPick)) : [h('p', { class: 'empty' }, 'Nichts gefunden. Probiere einen anderen Begriff oder erfasse das Lebensmittel manuell.')]));
      };
      let lastQuery = null;
      const schedule = () => {
        if (input.value === lastQuery) return;
        lastQuery = input.value;
        clearTimeout(timer);
        timer = setTimeout(run, 120);
      };
      input.addEventListener('input', schedule);
      input.addEventListener('keyup', schedule);
      buildSearchIndex().then((idx) => {
        index = idx;
        const s = settings().datasets;
        const off = Object.entries(DATASETS).filter(([id]) => !s[id]).map(([, d]) => d.short);
        status.textContent = off.length ? `Ausgeblendet: ${off.join(', ')} (in den Einstellungen änderbar)` : '';
        run();
      });
      showDefault();
      setTimeout(() => input.focus(), 250);
    },
  });
}

/** Favoriten oder zuletzt verwendet als eigene Liste. */
export function openStoredList(kind, { onPick }) {
  return openScreen({
    title: kind === 'favorites' ? 'Favoriten' : 'Zuletzt verwendet',
    async render(body) {
      const list = kind === 'favorites' ? await listFavorites() : await listRecent();
      body.append(h('div', { class: 'card' }, h('div', { class: 'list' },
        list.length ? list.map((f) => foodRow(f, onPick)) : h('p', { class: 'empty' },
          kind === 'favorites' ? 'Noch keine Favoriten. Markiere ein Lebensmittel in der Detailansicht mit dem Stern.' : 'Noch nichts eingetragen.'))));
    },
  });
}

// ---------- Detail und Mengeneingabe ----------

/**
 * Zeigt ein Lebensmittel mit Nährwerten und Mengeneingabe.
 * ctx.entry: vorhandener Protokolleintrag (Bearbeiten). ctx.onAmount(food, grams): Zutatenmodus für Rezepte.
 */
export function openFoodDetail(food, ctx = {}) {
  const ingredientMode = typeof ctx.onAmount === 'function';
  const editing = !!ctx.entry;
  let meal = ctx.entry?.meal ?? ctx.meal ?? 'snack';
  let unit = ctx.entry?.unit ?? food.unit ?? 'g';
  const favBtn = h('button', { class: 'btn-icon', 'aria-label': 'Favorit' });

  return openScreen({
    title: editing ? 'Eintrag bearbeiten' : ingredientMode ? 'Zutat' : 'Hinzufügen',
    actions: [favBtn],
    async render(body, screen) {
      const meta = await getMeta(food.key);
      let fav = !!meta.favorite;
      const drawFav = () => { favBtn.replaceChildren(icon(fav ? 'star-fill' : 'star')); favBtn.setAttribute('aria-pressed', String(fav)); };
      drawFav();
      favBtn.onclick = async () => { fav = !fav; drawFav(); await setFavorite(food, fav); toast(fav ? 'Zu Favoriten hinzugefügt' : 'Aus Favoriten entfernt'); };

      const servings = await allServings(food);
      const startAmount = ctx.entry?.amount ?? ctx.amount ?? servings[0]?.grams ?? 100;
      const amountInput = decimalInput({ value: fmtInput(startAmount), 'aria-label': 'Menge', onfocus: (e) => e.target.select() });
      const calc = h('div', { class: 'calc' });
      const unitSeg = h('div', { class: 'seg' });
      const drawUnit = () => unitSeg.replaceChildren(...['g', 'ml'].map((u) => h('button', { class: unit === u ? 'on' : '', onclick: () => { unit = u; drawUnit(); } }, u)));
      drawUnit();

      const amount = () => parseDecimal(amountInput.value);
      const update = () => {
        const n = scaleNutrients(food.per100, amount());
        const show = settings().showMacros;
        calc.replaceChildren(
          h('div', null, h('b', null, fmtKcal(n.kcal)), h('span', null, 'kcal')),
          ...(show ? [['protein', 'Eiweiß'], ['carbs', 'Kohlenh.'], ['fat', 'Fett']].map(([k, l]) => h('div', null, h('b', null, fmtMacro(n[k])), h('span', null, `${l} g`))) : []),
        );
        calc.style.gridTemplateColumns = show ? '' : '1fr';
        saveBtn.disabled = !(amount() > 0);
      };
      amountInput.addEventListener('input', update);

      const servingChips = h('div', { class: 'chips', style: { margin: '10px 0 0' } });
      const drawServings = (list) => servingChips.replaceChildren(
        ...[...list.map((s) => h('button', { class: 'chip', onclick: () => { amountInput.value = fmtInput(s.grams); update(); } }, `${s.label} = ${fmtAmount(s.grams)} ${unit}`)),
          h('button', { class: 'chip', onclick: () => addServingForm.hidden = !addServingForm.hidden }, '+ Portion')],
      );
      drawServings(servings);
      const servingLabel = h('input', { type: 'text', placeholder: 'z. B. 1 Scheibe', 'aria-label': 'Bezeichnung der Portion' });
      const addServingForm = h('div', { class: 'row', hidden: true, style: { marginTop: '10px' } },
        h('div', { class: 'grow' }, servingLabel),
        h('div', { style: { width: '90px' } }, decimalInput({ placeholder: 'g', 'aria-label': 'Gramm der Portion', id: 'serving-grams' })),
        h('button', { class: 'btn primary', onclick: async () => {
          const grams = parseDecimal(addServingForm.querySelector('#serving-grams').value) ?? amount();
          const label = servingLabel.value.trim();
          if (!label || !(grams > 0)) return toast('Bitte Bezeichnung und Menge angeben.');
          const own = [...(meta.servings ?? []), { label, grams }];
          meta.servings = own;
          await saveServings(food, own);
          drawServings([...(food.servings ?? []), ...own]);
          addServingForm.hidden = true;
          servingLabel.value = '';
          amountInput.value = fmtInput(grams);
          update();
        } }, 'OK'),
      );

      const mealChips = h('div', { class: 'chips' });
      const drawMeals = () => mealChips.replaceChildren(...MEALS.map((m) => h('button', { class: `chip ${m.id === meal ? 'on' : ''}`, onclick: () => { meal = m.id; drawMeals(); } }, m.label)));
      drawMeals();
      // Tag wählbar – damit lassen sich Einträge auch auf einen anderen Tag verschieben
      const dateInput = h('input', { type: 'date', value: ctx.entry?.date ?? ctx.date, 'aria-label': 'Tag' });
      const chosenDate = () => dateInput.value || ctx.entry?.date || ctx.date;

      const saveBtn = h('button', { class: 'btn primary block', onclick: save }, editing ? 'Speichern' : ingredientMode ? 'Übernehmen' : 'Hinzufügen');

      async function save() {
        const a = amount();
        if (!(a > 0)) return;
        if (ingredientMode) {
          ctx.onAmount(food, a);
          screen.close();
          return;
        }
        if (editing) {
          const date = chosenDate();
          await updateEntry({ ...ctx.entry, amount: a, unit, meal, date });
          closeAllScreens();
          refreshView();
          toast(date === ctx.entry.date ? 'Gespeichert' : `Verschoben auf ${fmtDateLong(date)}`);
        } else {
          const entry = await addEntry(food, { date: chosenDate(), meal, amount: a, unit });
          closeAllScreens();
          refreshView();
          toast(`${food.name} eingetragen`, { action: 'Rückgängig', onAction: async () => { await deleteEntry(entry.id); refreshView(); } });
        }
      }

      body.append(
        productHead(food),
        h('div', { class: 'card' },
          h('label', { class: 'field', style: { margin: 0 } }, h('span', null, 'Menge'),
            h('div', { class: 'amount-row' }, amountInput, unitSeg)),
          servingChips,
          addServingForm,
          calc,
        ),
        !ingredientMode && h('div', { class: 'card' },
          h('label', { class: 'field' }, h('span', null, 'Tag'), dateInput),
          h('p', { class: 'muted small', style: { margin: '0 0 8px' } }, 'Mahlzeit'), mealChips),
        nutritionTable(food),
        h('div', { class: 'stack' }, sourceActions(food, screen, ctx)),
        editing && h('button', { class: 'btn danger block', style: { marginTop: '10px' }, onclick: async () => {
          if (!(await confirmAction('Diesen Eintrag löschen?', 'Löschen', true))) return;
          await deleteEntry(ctx.entry.id);
          closeAllScreens();
          refreshView();
        } }, icon('trash'), 'Eintrag löschen'),
        h('div', { class: 'screen-footer' }, saveBtn),
      );
      update();
    },
  });
}

export function productHead(food) {
  return h('div', { class: 'product-head' },
    safeImageUrl(food.image) && h('img', { src: safeImageUrl(food.image), alt: '', loading: 'lazy', onerror: (e) => e.target.remove() }),
    h('div', { style: { flex: 1, minWidth: 0 } },
      h('h3', null, food.name),
      food.original && h('div', { class: 'orig' }, food.original),
      h('div', { class: 'brand row', style: { gap: '8px', marginTop: '6px' } },
        h('span', { class: `badge ${food.source}` }, SOURCE_LABEL[food.source] ?? food.source),
        [food.brand, food.barcode].filter(Boolean).join(' · '),
      ),
    ),
    food.nutriscore && h('span', { class: `nutriscore ns-${food.nutriscore}`, title: 'Nutri-Score' }, food.nutriscore),
  );
}

/** Nährwerttabelle pro 100 g/ml im Aufbau der EU-Kennzeichnung. Unbekannte Werte werden so benannt. */
export function nutritionTable(food) {
  const p = food.per100 ?? {};
  const per = food.unit === 'ml' ? '100 ml' : '100 g';
  const val = (k) => (p[k] == null ? h('span', { class: 'unknown' }, 'unbekannt') : `${fmtMacro(p[k])} g`);
  const rows = [['fat'], ['satFat', true], ['carbs'], ['sugar', true], ['fiber'], ['protein'], ['salt']];
  return h('div', { class: 'card' },
    h('table', { class: 'nutri-table' },
      h('thead', null, h('tr', null, h('th', null, 'Nährwerte'), h('th', { style: { textAlign: 'right' } }, `pro ${per}`))),
      h('tbody', null,
        h('tr', null, h('td', null, NUTRIENT_LABELS.kcal), h('td', null,
          p.kcal == null ? h('span', { class: 'unknown' }, 'unbekannt') : `${fmtKcal(kcalToKj(p.kcal))} kJ / ${fmtKcal(p.kcal)} kcal`)),
        rows.map(([k, sub]) => h('tr', { class: sub ? 'sub' : '' }, h('td', null, NUTRIENT_LABELS[k]), h('td', null, val(k)))),
      ),
    ),
  );
}

function sourceActions(food, screen, ctx) {
  if (ctx.onAmount) return [];
  const out = [];
  if (food.source === 'off') {
    out.push(h('button', { class: 'btn block', onclick: () => openManualForm({ food, onSaved: (f) => { screen.close(); openFoodDetail(f, ctx); } }) },
      icon('edit'), food.edited ? 'Eigene Korrektur bearbeiten' : 'Nährwerte korrigieren'));
    out.push(h('button', { class: 'btn block', onclick: async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const f = await fetchAndStoreProduct(food.id);
        if (!f) return toast('Das Produkt gibt es bei Open Food Facts nicht mehr.');
        screen.close();
        openFoodDetail(f, ctx);
        toast(f.edited ? 'Aktualisiert – deine Korrekturen bleiben erhalten.' : 'Aktualisiert');
      } catch (err) {
        toast(err.message);
      } finally {
        btn.disabled = false;
      }
    } }, 'Von Open Food Facts neu laden'));
  } else if (food.source === 'custom') {
    out.push(h('button', { class: 'btn block', onclick: () => openManualForm({ food, onSaved: (f) => { screen.close(); openFoodDetail(f, ctx); } }) }, icon('edit'), 'Lebensmittel bearbeiten'));
  }
  return out;
}

