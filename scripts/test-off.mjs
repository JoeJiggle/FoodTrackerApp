// Live-Test gegen Open Food Facts (braucht Internet, nicht Teil von „npm test“).
// Aufruf: node scripts/test-off.mjs [barcode ...]
import { productFromOff, pickDisplayName } from '../js/nutrition.js';

const FIELDS = 'code,product_name,product_name_de,product_name_en,product_name_fi,product_name_sv,generic_name,brands,lang,countries_tags,nutriments,serving_size,serving_quantity,nutriscore_grade,image_front_small_url,quantity';
const codes = process.argv.slice(2);

for (const code of codes) {
  let r, j;
  try {
    r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${FIELDS}`, {
      headers: { 'User-Agent': 'PersonalFoodTracker/1.0 (private app)' },
      signal: AbortSignal.timeout(15000),
    });
    j = await r.json().catch(() => null);
  } catch (e) {
    console.log(`${code}: Netzwerkfehler (${e.name})`);
    continue;
  }
  if (!j || j.status === 0) {
    console.log(`${code}: nicht gefunden (HTTP ${r.status})`);
    continue;
  }
  const p = productFromOff(j.product);
  const d = pickDisplayName(p.names);
  const n = p.per100;
  console.log(`${code}: ${d.name}${d.original ? `  [Original: ${d.original}]` : ''}`);
  console.log(`   Marke: ${p.brand || '–'} · Sprache: ${p.lang} · Länder: ${p.countries.slice(0, 4).join(', ')}`);
  console.log(`   Namen: ${JSON.stringify(p.names)}`);
  console.log(`   pro 100 ${p.unit}: ${n.kcal?.toFixed(0) ?? '?'} kcal, E ${n.protein ?? '?'}, K ${n.carbs ?? '?'}, Z ${n.sugar ?? '?'}, F ${n.fat ?? '?'}, gF ${n.satFat ?? '?'}, B ${n.fiber ?? '?'}, S ${n.salt ?? '?'} · Portion ${p.servingQuantity ?? '–'} · Nutri-Score ${p.nutriscore || '–'}`);
}
