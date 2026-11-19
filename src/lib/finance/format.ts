/** Rupee formatting: Indian grouping (₹1,23,45,678) and short forms (₹1.23 Cr, ₹4.5 L, ₹45k). */

export function groupIndian(n: number): string {
  const neg = n < 0;
  const s = Math.round(Math.abs(n)).toString();
  if (s.length <= 3) return (neg && s !== '0' ? '-' : '') + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return (neg ? '-' : '') + rest + ',' + last3;
}

const trim = (x: number, digits: number) => {
  const f = x.toFixed(digits);
  return f.includes('.') ? f.replace(/\.?0+$/, '') : f;
};

/** ₹1,23,45,678 */
export function formatINR(n: number, opts: { sign?: boolean } = {}): string {
  if (!Number.isFinite(n)) return '₹0';
  const r = Math.round(n);
  const pre = r < 0 ? '-' : opts.sign && r > 0 ? '+' : '';
  return `${pre}₹${groupIndian(Math.abs(r))}`;
}

/** ₹1.23 Cr · ₹4.5 L · ₹45k · ₹950 */
export function formatINRShort(n: number, opts: { sign?: boolean } = {}): string {
  if (!Number.isFinite(n)) return '₹0';
  const a = Math.abs(n);
  const pre = Math.round(n) < 0 ? '-' : opts.sign && Math.round(n) > 0 ? '+' : '';
  let body: string;
  if (a >= 1e7) body = `${trim(a / 1e7, a >= 1e9 ? 0 : 2)} Cr`;
  else if (a >= 1e5) body = `${trim(a / 1e5, 2)} L`;
  else if (a >= 1e3) body = `${trim(a / 1e3, a >= 1e4 ? 0 : 1)}k`;
  else body = `${Math.round(a)}`;
  return `${pre}₹${body}`;
}

export function formatMoney(n: number, short: boolean, opts: { sign?: boolean } = {}): string {
  return short ? formatINRShort(n, opts) : formatINR(n, opts);
}

export function formatPct(n: number, digits = 1, sign = false): string {
  if (!Number.isFinite(n)) return '0%';
  const s = sign && n > 0 ? '+' : '';
  return `${s}${trim(n, digits)}%`;
}

/** Parse "1,23,456" → 123456 */
export function parseMoneyInput(s: string): number {
  const cleaned = s.replace(/[^0-9.]/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}
