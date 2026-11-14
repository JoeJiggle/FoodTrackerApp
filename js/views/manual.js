// Manuelle Erfassung im Aufbau der EU-Nährwerttabelle – auch für Korrekturen an gescannten Produkten.
import { h, openScreen, toast, decimalInput, confirmAction } from '../ui.js';
import { refreshView } from '../state.js';
import * as db from '../db.js';
import { fmtInput } from '../format.js';
import { NUTRIENT_LABELS, parseDecimal, kjToKcal, kcalToKj, isValidBarcode } from '../nutrition.js';
import { foodFromCustom, foodFromProduct, saveProductCorrection, refreshSnapshot } from '../foods.js';

const ROWS = [['fat'], ['satFat', true], ['carbs'], ['sugar', true], ['fiber'], ['protein'], ['salt']];

/**
 * opts.food: vorhandenes Lebensmittel (source 'off' = Korrektur, 'custom' = bearbeiten)
 * opts.barcode: vorausgefüllter Barcode (nach erfolglosem Scan)
 * opts.onSaved(food): nach dem Speichern
 */
export function openManualForm({ food, barcode, onSaved } = {}) {
  const isOff = food?.source === 'off';
  const isCustom = food?.source === 'custom';
  return openScreen({
    title: isOff ? 'Nährwerte korrigieren' : isCustom ? 'Lebensmittel bearbeiten' : 'Manuell erfassen',
    async render(body, screen) {
      // Ausgangswerte
      let init = { name: '', brand: '', barcode: barcode ?? '', unit: 'g', per100: {}, serving: null };
      let product = null;
      let custom = null;
      if (isOff) {
        product = await db.get('products', food.id);
        const u = product.user ?? {};
        init = { name: u.name || food.name, brand: u.brand ?? product.brand, barcode: product.code, unit: u.unit ?? product.unit, per100: u.per100 ?? product.per100, serving: u.servingQuantity ?? product.servingQuantity };
      } else if (isCustom) {
        custom = await db.get('customFoods', food.id);
        init = { name: custom.name, brand: custom.brand ?? '', barcode: custom.barcode ?? '', unit: custom.unit ?? 'g', per100: custom.per100, serving: custom.servings?.[0]?.grams ?? null };
      }

      let unit = init.unit;
      const name = h('input', { type: 'text', value: init.name, autocomplete: 'off', placeholder: 'z. B. Roggenbrot', required: true });
      const brand = h('input', { type: 'text', value: init.brand, autocomplete: 'off', placeholder: 'optional' });
      const code = h('input', { type: 'text', inputmode: 'numeric', value: init.barcode, autocomplete: 'off', placeholder: 'optional', readOnly: isOff });
      const serving = decimalInput({ value: fmtInput(init.serving), placeholder: 'optional' });
      const unitSeg = h('div', { class: 'seg', style: { marginBottom: '12px' } });
      const perLabel = h('th', { colspan: 2, style: { textAlign: 'right' } });
      const drawUnit = () => {
        unitSeg.replaceChildren(...[['g', 'pro 100 g'], ['ml', 'pro 100 ml']].map(([u, l]) => h('button', { type: 'button', class: unit === u ? 'on' : '', onclick: () => { unit = u; drawUnit(); } }, l)));
        perLabel.textContent = unit === 'ml' ? 'pro 100 ml' : 'pro 100 g';
      };
      drawUnit();

      // Energie: kJ und kcal rechnen sich gegenseitig aus, solange der Nutzer das andere Feld nicht selbst ausgefüllt hat.
      const kj = decimalInput({ value: fmtInput(kcalToKj(init.per100.kcal), 0), 'aria-label': 'Energie in kJ' });
      const kcal = decimalInput({ value: fmtInput(init.per100.kcal, 0), 'aria-label': 'Energie in kcal' });
      let auto = null; // welches Feld automatisch befüllt wurde
      kj.addEventListener('input', () => {
        if (auto === 'kj') auto = null;
        if (auto === 'kcal' || !kcal.value) { const v = parseDecimal(kj.value); kcal.value = v == null ? '' : fmtInput(kjToKcal(v), 0); auto = 'kcal'; }
      });
      kcal.addEventListener('input', () => {
        if (auto === 'kcal') auto = null;
        if (auto === 'kj' || !kj.value) { const v = parseDecimal(kcal.value); kj.value = v == null ? '' : fmtInput(kcalToKj(v), 0); auto = 'kj'; }
      });

      const inputs = {};
      for (const [k] of ROWS) inputs[k] = decimalInput({ value: fmtInput(init.per100[k], 2), 'aria-label': NUTRIENT_LABELS[k] });

      const err = h('p', { class: 'small', style: { color: 'var(--danger)', margin: '8px 0 0' }, role: 'alert' });

      async function save() {
        err.textContent = '';
        const n = name.value.trim();
        if (!n) return (err.textContent = 'Bitte einen Namen eingeben.');
        const bc = code.value.trim();
        if (bc && !isValidBarcode(bc)) return (err.textContent = 'Der Barcode ist ungültig (Prüfziffer stimmt nicht).');
        const per100 = { kcal: parseDecimal(kcal.value) ?? kjToKcal(parseDecimal(kj.value)) };
        if (per100.kcal == null) return (err.textContent = 'Bitte mindestens die Energie (kJ oder kcal) angeben.');
        for (const [k] of ROWS) {
          per100[k] = parseDecimal(inputs[k].value);
          if (inputs[k].value.trim() && per100[k] == null) return (err.textContent = `„${NUTRIENT_LABELS[k]}“ ist keine gültige Zahl.`);
        }
        const sq = parseDecimal(serving.value);
        let saved;
        if (isOff) {
          saved = await saveProductCorrection(product.code, { name: n, brand: brand.value.trim(), per100, unit, servingQuantity: sq > 0 ? sq : null });
        } else {
          if (bc && !isCustom) {
            const dup = await db.getAllByIndex('customFoods', 'barcode', bc);
            if (dup.length && !(await confirmAction(`Für diesen Barcode gibt es schon „${dup[0].name}“. Trotzdem ein weiteres Lebensmittel anlegen?`, 'Anlegen'))) return;
          }
          const record = {
            ...(custom ?? { id: db.uid(), createdAt: new Date().toISOString() }),
            name: n, brand: brand.value.trim(), barcode: bc, unit, per100,
            servings: sq > 0 ? [{ label: '1 Portion', grams: sq }] : [],
          };
          await db.put('customFoods', record);
          saved = foodFromCustom(record);
          if (isCustom) await refreshSnapshot(saved);
        }
        screen.close();
        refreshView();
        toast('Gespeichert');
        onSaved?.(saved);
      }

      const tbody = h('tbody', null,
        h('tr', null, h('td', null, 'Energie (kJ)'), h('td', null, kj), h('td', { class: 'unit' }, 'kJ')),
        h('tr', null, h('td', null, 'Energie (kcal)'), h('td', null, kcal), h('td', { class: 'unit' }, 'kcal')),
        ROWS.map(([k, sub]) => h('tr', { class: sub ? 'sub' : '' }, h('td', null, NUTRIENT_LABELS[k]), h('td', null, inputs[k]), h('td', { class: 'unit' }, 'g'))),
      );

      body.append(
        h('div', { class: 'card' },
          h('label', { class: 'field' }, h('span', null, 'Name'), name),
          h('label', { class: 'field' }, h('span', null, 'Marke'), brand),
          h('label', { class: 'field' }, h('span', null, 'Barcode'), code),
          h('label', { class: 'field', style: { marginBottom: 0 } }, h('span', null, `Portionsgröße in ${unit}`), serving),
        ),
        h('div', { class: 'card' },
          h('p', { class: 'muted small', style: { marginTop: 0 } }, 'Wie auf der Verpackung abtippen. Leere Felder gelten als „unbekannt“. Komma oder Punkt sind beide in Ordnung.'),
          unitSeg,
          h('table', { class: 'nutri-table' }, h('thead', null, h('tr', null, h('th', null, 'Nährwerte'), perLabel)), tbody),
          err,
        ),
        isOff && food.edited && h('button', { class: 'btn block', onclick: async () => {
          if (!(await confirmAction('Deine Korrekturen verwerfen und wieder die Werte von Open Food Facts verwenden?', 'Verwerfen', true))) return;
          const p = await db.get('products', product.code);
          delete p.user;
          await db.put('products', p);
          const f = foodFromProduct(p);
          await refreshSnapshot(f);
          screen.close();
          refreshView();
          onSaved?.(f);
        } }, 'Korrektur verwerfen'),
        isCustom && h('button', { class: 'btn danger block', onclick: async () => {
          if (!(await confirmAction(`„${custom.name}“ löschen? Bereits eingetragene Tage bleiben unverändert.`, 'Löschen', true))) return;
          await db.del('customFoods', custom.id);
          await db.del('foodMeta', `custom:${custom.id}`);
          screen.close();
          refreshView();
          toast('Gelöscht');
        } }, 'Lebensmittel löschen'),
        h('div', { class: 'screen-footer' }, h('button', { class: 'btn primary block', onclick: save }, 'Speichern')),
      );
      if (!init.name) setTimeout(() => name.focus(), 250);
    },
  });
}

