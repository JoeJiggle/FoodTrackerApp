// Automatische Tests der Rechenfunktionen. Ausführen mit: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scaleNutrients, kjToKcal, kcalToKj, sodiumToSalt, recipePer100, recipePerPortion,
  isValidBarcode, gtinCheckDigit, expandUpcE, pickDisplayName, per100FromOff, parseDecimal, productFromOff,
} from '../js/nutrition.js';
import { normalize, searchEntries } from '../js/text.js';

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('Portionsumrechnung', () => {
  const n = scaleNutrients({ kcal: 68, protein: 3.2, carbs: 4.6, sugar: 4.6, fat: 4.1, satFat: 2.5, fiber: 0, salt: 0.1 }, 250);
  near(n.kcal, 170);
  near(n.protein, 8);
  near(n.fat, 10.25);
  assert.equal(n.fiber, 0);
});

test('Portionsumrechnung: unbekannte Werte bleiben unbekannt (nicht 0)', () => {
  const n = scaleNutrients({ kcal: 100, sugar: null }, 50);
  near(n.kcal, 50);
  assert.equal(n.sugar, null);
  assert.equal(n.fiber, null);
});

test('kJ ↔ kcal', () => {
  near(kjToKcal(4184), 1000);
  near(kjToKcal(1046), 250);
  near(kcalToKj(100), 418.4);
  assert.equal(kjToKcal(null), null);
});

test('Natrium → Salz', () => {
  near(sodiumToSalt(0.4), 1.0);
  assert.equal(sodiumToSalt(null), null);
});

test('OFF: kcal fehlt → aus kJ berechnen, Salz aus Natrium', () => {
  const p = per100FromOff({ 'energy-kj_100g': 1046, sodium_100g: 0.2, fat_100g: 3, proteins_100g: '' });
  near(p.kcal, 250);
  near(p.salt, 0.5);
  assert.equal(p.fat, 3);
  assert.equal(p.protein, null, 'leerer Wert ist unbekannt, nicht 0');
  assert.equal(p.fiber, null);
});

test('OFF: Getränk wird als ml erkannt', () => {
  const p = productFromOff({ code: '1', product_name: 'Saft', quantity: '1 l', nutriments: {} });
  assert.equal(p.unit, 'ml');
});

test('Rezeptberechnung pro 100 g und pro Portion', () => {
  const ingredients = [
    { grams: 200, per100: { kcal: 350, protein: 10, carbs: 70, sugar: 1, fat: 2, satFat: 0.5, fiber: 3, salt: 0 } }, // Reis roh
    { grams: 100, per100: { kcal: 100, protein: 20, carbs: 0, sugar: 0, fat: 2, satFat: 1, fiber: 0, salt: 0.2 } },
  ];
  // Rohgewicht 300 g, Gesamt 800 kcal
  near(recipePer100(ingredients).kcal, 800 / 3);
  // nach dem Kochen 600 g
  near(recipePer100(ingredients, 600).kcal, 800 / 6);
  near(recipePer100(ingredients, 600).protein, 40 / 6);
  near(recipePerPortion(ingredients, 4).kcal, 200);
});

test('Rezept: fehlender Nährstoff einer Zutat macht ihn unbekannt', () => {
  const r = recipePer100([{ grams: 100, per100: { kcal: 100, sugar: 5 } }, { grams: 100, per100: { kcal: 50, sugar: null } }]);
  near(r.kcal, 75);
  assert.equal(r.sugar, null);
});

test('Prüfziffer EAN-13, EAN-8, UPC-A, UPC-E', () => {
  assert.equal(gtinCheckDigit('400041702500'), 5);
  assert.ok(isValidBarcode('4000417025005')); // EAN-13
  assert.ok(!isValidBarcode('4000417025006'));
  assert.ok(isValidBarcode('96385074')); // EAN-8
  assert.ok(!isValidBarcode('96385075'));
  assert.ok(isValidBarcode('036000291452')); // UPC-A
  assert.ok(!isValidBarcode('036000291453'));
  assert.equal(expandUpcE('04252614'), '042100005264');
  assert.ok(isValidBarcode('04252614')); // UPC-E
  assert.ok(!isValidBarcode('12345'));
  assert.ok(!isValidBarcode('40004170250a5'));
  assert.ok(!isValidBarcode(''));
});

test('Namenspriorität Deutsch → Englisch → Original → Finnisch → Schwedisch', () => {
  assert.deepEqual(pickDisplayName({ de: 'Milchschokolade', en: 'Milk chocolate', orig: 'Maitosuklaa', fi: 'Maitosuklaa' }),
    { name: 'Milchschokolade', original: 'Maitosuklaa' });
  assert.deepEqual(pickDisplayName({ en: 'Rye bread', orig: 'Ruisleipä', fi: 'Ruisleipä' }), { name: 'Rye bread', original: 'Ruisleipä' });
  assert.deepEqual(pickDisplayName({ orig: 'Ruisleipä', fi: 'Ruisleipä', sv: 'Rågbröd' }), { name: 'Ruisleipä', original: '' });
  assert.deepEqual(pickDisplayName({ fi: 'Ruisleipä', sv: 'Rågbröd' }), { name: 'Ruisleipä', original: '' });
  assert.deepEqual(pickDisplayName({ sv: 'Rågbröd' }), { name: 'Rågbröd', original: '' });
  assert.deepEqual(pickDisplayName({ de: 'Nutella', orig: 'Nutella' }), { name: 'Nutella', original: '' });
});

test('Dezimalzahlen mit Komma oder Punkt', () => {
  assert.equal(parseDecimal('1,5'), 1.5);
  assert.equal(parseDecimal('1.5'), 1.5);
  assert.equal(parseDecimal(' 12 '), 12);
  assert.equal(parseDecimal(''), null);
  assert.equal(parseDecimal('abc'), null);
});

test('Umlauttolerante Normalisierung', () => {
  assert.equal(normalize('Müesli'), normalize('Muesli'));
  assert.equal(normalize('Müsli'), normalize('Musli'));
  assert.equal(normalize('Käse'), normalize('Kaese'));
  assert.equal(normalize('Käse'), normalize('kase'));
  assert.equal(normalize('Öl'), normalize('Oel'));
  assert.equal(normalize('Ruisleipä'), normalize('ruisleipa'));
  assert.equal(normalize('Åkerbär'), normalize('akerbar'));
  assert.equal(normalize('Grießbrei'), normalize('Griessbrei'));
  assert.equal(normalize('CRÈME fraîche!'), 'creme fraiche');
});

test('Suche: Teilwort, Umlaute, Relevanz und Nutzung', () => {
  const mk = (key, name) => ({ key, name, text: normalize(name) });
  const entries = [mk('a', 'Apfelsaft'), mk('b', 'Apfel, roh'), mk('c', 'Bratapfel'), mk('d', 'Käse, Emmentaler'), mk('e', 'Ruisleipä')];
  assert.deepEqual(searchEntries(entries, 'apfel').map((e) => e.key).slice(0, 2), ['b', 'a']);
  assert.ok(searchEntries(entries, 'apfel').some((e) => e.key === 'c'), 'Teilwort im Inneren');
  assert.deepEqual(searchEntries(entries, 'kaese emmen').map((e) => e.key), ['d']);
  assert.deepEqual(searchEntries(entries, 'RUISLEIPA').map((e) => e.key), ['e']);
  // Häufig genutzt rückt nach vorne
  assert.equal(searchEntries(entries, 'apfel', { usage: { c: 20 } })[0].key, 'c');
  assert.deepEqual(searchEntries(entries, '   '), []);
});
