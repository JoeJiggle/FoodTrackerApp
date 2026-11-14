// Zahlen- und Datumsformatierung im deutschen Format.

const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nfAmount = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export const fmtKcal = (v) => (isNum(v) ? nf0.format(Math.round(v)) : '–');
export const fmtMacro = (v) => (isNum(v) ? nf1.format(v) : '–');
export const fmtAmount = (v) => (isNum(v) ? nfAmount.format(v) : '');
/** Für Formularfelder: Zahl mit Komma, ohne Tausenderpunkt. */
export const fmtInput = (v, digits = 1) => (isNum(v) ? String(Math.round(v * 10 ** digits) / 10 ** digits).replace('.', ',') : '');

export function todayISO(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return todayISO(d);
}

export function fmtDateLong(iso) {
  const today = todayISO();
  if (iso === today) return 'Heute';
  if (iso === addDays(today, -1)) return 'Gestern';
  if (iso === addDays(today, 1)) return 'Morgen';
  return parseISO(iso).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', year: parseISO(iso).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}

export const fmtDateShort = (iso) => parseISO(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' });
