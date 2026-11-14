// Abfrage eines Produkts bei Open Food Facts. Einzige Netzwerkverbindung der App.
import { productFromOff } from './nutrition.js';

const FIELDS = [
  'code', 'product_name', 'product_name_de', 'product_name_en', 'product_name_fi', 'product_name_sv',
  'generic_name', 'brands', 'lang', 'countries_tags', 'nutriments', 'serving_size', 'serving_quantity',
  'nutriscore_grade', 'image_front_small_url', 'quantity',
].join(',');

const TIMEOUT_MS = 8000;

export class OffError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind; // 'offline' | 'timeout' | 'server'
  }
}

/** → { found: true, product } oder { found: false }. Wirft OffError bei Netzwerkproblemen. */
export async function fetchProduct(code) {
  if (!navigator.onLine) throw new OffError('offline', 'Keine Internetverbindung.');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
  } catch (e) {
    if (e.name === 'AbortError') throw new OffError('timeout', 'Open Food Facts antwortet gerade nicht.');
    throw new OffError('offline', 'Open Food Facts ist nicht erreichbar.');
  } finally {
    clearTimeout(timer);
  }
  // Nicht gefundene Produkte liefern HTTP 404 mit status 0
  let json = null;
  try { json = await res.json(); } catch { /* leer */ }
  if (json && json.status === 0) return { found: false };
  if (!res.ok || !json?.product) throw new OffError('server', `Open Food Facts meldet einen Fehler (${res.status}).`);
  return { found: true, product: productFromOff({ ...json.product, code: json.product.code || code }) };
}
