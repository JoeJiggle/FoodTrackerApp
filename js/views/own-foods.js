// Eigene Lebensmittel, Rezepte und gescannte Produkte.
import { h, icon, openScreen, actionSheet, toast, decimalInput, confirmAction } from '../ui.js';
import { state, refreshView } from '../state.js';
import * as db from '../db.js';
import { fmtKcal, fmtMacro, fmtAmount, fmtInput } from '../format.js';
import { parseDecimal, recipePer100, recipePerPortion, recipeRawWeight, scaleNutrients } from '../nutrition.js';
import { mealForNow } from '../log.js';
import { foodFromCustom, foodFromRecipe, foodFromProduct, refreshSnapshot } from '../foods.js';
import { foodRow, openFoodDetail, openFoodPicker, openStoredList } from './add.js';
import { openManualForm } from './manual.js';
import { openScanner } from './scan.js';

export async function renderOwnFoods(root) {
  const [customs, recipes, products] = await Promise.all([db.getAll('customFoods'), db.getAll('recipes'), db.getAll('products')]);
  const byName = (a, b) => a.name.localeCompare(b.name, 'de');
  const logCtx = () => ({ date: state.date, meal: mealForNow() });

  root.append(
    h('h1', { class: 'page-title' }, 'Eigene'),
    h('div', { class: 'row', style: { marginBottom: '14px' } },
      h('button', { class: 'btn primary grow', onclick: () => openManualForm({}) }, icon('plus'), 'Lebensmittel'),
      h('button', { class: 'btn primary grow', onclick: () => openRecipeEditor() }, icon('pot'), 'Rezept'),
    ),
    section('Rezepte', recipes.map(foodFromRecipe).sort(byName), (f) => openRecipeEditor(recipes.find((r) => r.id === f.id)),
      'Noch keine Rezepte. Ein Rezept fasst mehrere Zutaten zusammen und berechnet die Werte pro 100 g oder pro Portion.'),
    section('Eigene Lebensmittel', customs.map(foodFromCustom).sort(byName), (f) => openFoodDetail(f, logCtx()),
      'Noch keine eigenen Lebensmittel. Manuell erfasste Produkte landen hier.'),
    section(`Gescannte Produkte (${products.length})`, products.map(foodFromProduct).sort(byName), (f) => openFoodDetail(f, logCtx()),
      'Gescannte Produkte werden hier gespeichert und funktionieren danach auch offline.'),
  );
}

function section(title, foods, onClick, emptyText) {
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', null, title)),
    foods.length ? h('div', { class: 'list' }, foods.map((f) => foodRow(f, onClick))) : h('p', { class: 'empty' }, emptyText),
  );
}

// ---------- Rezept-Editor ----------

export function openRecipeEditor(recipe) {
  const r = recipe ? structuredClone(recipe) : { id: db.uid(), name: '', ingredients: [], totalWeight: null, portions: null, createdAt: new Date().toISOString() };
  const isNew = !recipe;

  openScreen({
    title: isNew ? 'Neues Rezept' : 'Rezept bearbeiten',
    render(body, screen) {
      const name = h('input', { type: 'text', value: r.name, placeholder: 'z. B. Linsencurry', autocomplete: 'off' });
      const list = h('div', { class: 'list' });
      const result = h('div');
      const weight = decimalInput({ value: fmtInput(r.totalWeight, 0), placeholder: 'optional' });
      const portions = decimalInput({ value: fmtInput(r.portions, 1), placeholder: 'optional' });

      const addIngredient = (food, grams) => {
        r.ingredients.push({ key: food.key, name: food.name, grams, unit: food.unit || 'g', per100: { ...food.per100 } });
        draw();
      };
      const ingCtx = { onAmount: addIngredient };

      function draw() {
        list.replaceChildren(...(r.ingredients.length ? r.ingredients.map((ing, i) => {
          const g = decimalInput({ value: fmtInput(ing.grams), style: { width: '80px', textAlign: 'right' }, 'aria-label': `Menge ${ing.name}` });
          g.addEventListener('change', () => { const v = parseDecimal(g.value); if (v > 0) { ing.grams = v; draw(); } });
          return h('div', { class: 'list-item' },
            h('span', { class: 'main' }, h('span', { class: 'title' }, ing.name), h('span', { class: 'sub' }, `${fmtKcal(scaleNutrients(ing.per100, ing.grams).kcal)} kcal`)),
            g, h('span', { class: 'muted small' }, ing.unit),
            h('button', { class: 'btn-icon', 'aria-label': `${ing.name} entfernen`, onclick: () => { r.ingredients.splice(i, 1); draw(); } }, icon('trash')),
          );
        }) : [h('p', { class: 'empty' }, 'Noch keine Zutaten.')]));
        drawResult();
      }

      function drawResult() {
        r.totalWeight = parseDecimal(weight.value);
        r.portions = parseDecimal(portions.value);
        const raw = recipeRawWeight(r.ingredients);
        const p100 = recipePer100(r.ingredients, r.totalWeight);
        const pp = r.portions > 0 ? recipePerPortion(r.ingredients, r.portions) : null;
        const line = (label, n) => h('div', { class: 'list-item' },
          h('span', { class: 'main' }, h('span', { class: 'title' }, label)),
          h('span', { class: 'value' }, `${fmtKcal(n.kcal)} kcal`, h('small', null, `E ${fmtMacro(n.protein)} · K ${fmtMacro(n.carbs)} · F ${fmtMacro(n.fat)}`)));
        result.replaceChildren(
          h('p', { class: 'muted small', style: { margin: '0 0 6px' } }, `Zutaten zusammen: ${fmtAmount(raw)} g${r.totalWeight > 0 ? ` · fertig: ${fmtAmount(r.totalWeight)} g` : ''}`),
          h('div', { class: 'list' }, line('pro 100 g', p100), pp && line(`pro Portion (${fmtAmount((r.totalWeight > 0 ? r.totalWeight : raw) / r.portions)} g)`, pp)),
        );
      }
      weight.addEventListener('input', drawResult);
      portions.addEventListener('input', drawResult);

      const addMenu = () => actionSheet({
        title: 'Zutat hinzufügen',
        items: [
          { label: 'Suchen', icon: 'search', onClick: () => openFoodPicker({ title: 'Zutat suchen', onPick: (f) => openFoodDetail(f, ingCtx) }) },
          { label: 'Barcode scannen', icon: 'scan', onClick: () => openScanner(ingCtx) },
          { label: 'Favoriten', icon: 'star', onClick: () => openStoredList('favorites', { onPick: (f) => openFoodDetail(f, ingCtx) }) },
          { label: 'Zuletzt verwendet', icon: 'clock', onClick: () => openStoredList('recent', { onPick: (f) => openFoodDetail(f, ingCtx) }) },
        ],
      });

      async function save() {
        r.name = name.value.trim();
        if (!r.name) return toast('Bitte einen Namen eingeben.');
        if (!r.ingredients.length) return toast('Bitte mindestens eine Zutat hinzufügen.');
        drawResult();
        await db.put('recipes', r);
        await refreshSnapshot(foodFromRecipe(r));
        screen.close();
        refreshView();
        toast('Rezept gespeichert');
      }

      body.append(
        h('div', { class: 'card' }, h('label', { class: 'field', style: { margin: 0 } }, h('span', null, 'Name'), name)),
        h('section', { class: 'card' },
          h('div', { class: 'card-head' }, h('h3', null, 'Zutaten'), h('button', { class: 'btn-text', onclick: addMenu }, '+ Zutat')),
          list),
        h('div', { class: 'card' },
          h('label', { class: 'field' }, h('span', null, 'Gewicht nach dem Kochen (g)'), weight),
          h('label', { class: 'field', style: { margin: 0 } }, h('span', null, 'Anzahl Portionen'), portions),
          h('p', { class: 'muted small', style: { marginBottom: 0 } }, 'Ohne Gewicht wird die Summe der Zutaten verwendet. Wasser verdampft beim Kochen – dann lohnt sich Wiegen.'),
        ),
        h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h3', null, 'Ergebnis')), result),
        !isNew && h('div', { class: 'stack' },
          h('button', { class: 'btn block', onclick: () => openFoodDetail(foodFromRecipe(r), { date: state.date, meal: mealForNow() }) }, 'Eintragen'),
          h('button', { class: 'btn danger block', onclick: async () => {
            if (!(await confirmAction(`Rezept „${r.name}“ löschen? Bereits eingetragene Tage bleiben unverändert.`, 'Löschen', true))) return;
            await db.del('recipes', r.id);
            await db.del('foodMeta', `recipe:${r.id}`);
            screen.close();
            refreshView();
          } }, 'Rezept löschen'),
        ),
        h('div', { class: 'screen-footer' }, h('button', { class: 'btn primary block', onclick: save }, 'Rezept speichern')),
      );
      draw();
    },
  });
}
