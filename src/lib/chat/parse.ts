import { addDays, addMonths, endOfMonth, startOfMonth, subMonths } from 'date-fns';
import type { Goal, Holding, HoldingType, ISODate } from '../types';
import { toISO } from '../finance/dates';

/* ------------------------------------------------------------------ text helpers */

export const norm = (s: string) =>
  s.toLowerCase().replace(/[’']/g, '').replace(/[^\p{L}\p{N}%₹.,/\-\s]/gu, ' ').replace(/\s+/g, ' ').trim();

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
};
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const monthIdx = (m: string) => MONTHS[m.toLowerCase()] ?? MONTHS[m.toLowerCase().slice(0, 3)];

/** Replace matched ranges with spaces so later passes don't re-read them. */
function mask(text: string, re: RegExp): string {
  return text.replace(re, (m) => ' '.repeat(m.length));
}

/* ------------------------------------------------------------------ dates */

export interface DateHit { date: ISODate; raw: string }

/** A specific day (for transactions). */
export function parseDay(text: string, today: Date): DateHit | null {
  const t = text.toLowerCase();
  let m: RegExpMatchArray | null;
  if ((m = t.match(/\bday before yesterday\b/))) return { date: toISO(addDays(today, -2)), raw: m[0] };
  if ((m = t.match(/\byesterday\b/))) return { date: toISO(addDays(today, -1)), raw: m[0] };
  if ((m = t.match(/\btoday\b|\bjust now\b/))) return { date: toISO(today), raw: m[0] };
  if ((m = t.match(/\blast week\b/))) return { date: toISO(addDays(today, -7)), raw: m[0] };
  if ((m = t.match(/\blast month\b/))) return { date: toISO(endOfMonth(subMonths(today, 1))), raw: m[0] };
  if ((m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) return { date: `${m[1]}-${m[2]}-${m[3]}`, raw: m[0] };
  if ((m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
    const d = +m[1]; const mo = +m[2] - 1;
    let y = m[3] ? +m[3] : today.getFullYear();
    if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && mo >= 0 && mo < 12) return { date: toISO(new Date(y, mo, d)), raw: m[0] };
  }
  const re1 = new RegExp(`\\b(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}(?:\\s+(\\d{4}))?\\b`);
  const re2 = new RegExp(`\\b(?:on\\s+)?${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`);
  if ((m = t.match(re1))) {
    const y = m[3] ? +m[3] : today.getFullYear();
    let d = new Date(y, monthIdx(m[2]), +m[1]);
    if (!m[3] && d > today) d = new Date(y - 1, monthIdx(m[2]), +m[1]);
    return { date: toISO(d), raw: m[0] };
  }
  if ((m = t.match(re2))) {
    const y = m[3] ? +m[3] : today.getFullYear();
    let d = new Date(y, monthIdx(m[1]), +m[2]);
    if (!m[3] && d > today) d = new Date(y - 1, monthIdx(m[1]), +m[2]);
    return { date: toISO(d), raw: m[0] };
  }
  return null;
}

/** A future month (for goal deadlines). Returns YYYY-MM-01. */
export function parseTargetMonth(text: string, today: Date): DateHit | null {
  const t = text.toLowerCase();
  let m: RegExpMatchArray | null;
  const inN = t.match(/\b(?:in|within|after)\s+(\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s*(years?|yrs?|months?|mos?)\b/);
  if (inN) {
    const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    const n = words[inN[1]] ?? parseFloat(inN[1]);
    const months = /^y/.test(inN[2]) ? Math.round(n * 12) : Math.round(n);
    return { date: toISO(startOfMonth(addMonths(today, months))), raw: inN[0] };
  }
  const re = new RegExp(`\\b${MONTH_RE}[\\s,'-]*(\\d{4}|\\d{2})\\b`);
  if ((m = t.match(re))) {
    let y = +m[2];
    if (y < 100) y += 2000;
    return { date: toISO(new Date(y, monthIdx(m[1]), 1)), raw: m[0] };
  }
  if ((m = t.match(/\b(?:by|in|before|till|until|end of|year)\s+(20\d{2})\b/))) {
    // "by 2030" → December 2030 (the year runs Jan–Dec)
    return { date: `${m[1]}-12-01`, raw: m[0] };
  }
  if ((m = t.match(/\bnext year\b/))) return { date: toISO(new Date(today.getFullYear() + 1, 11, 1)), raw: m[0] };
  return null;
}

/* ------------------------------------------------------------------ numbers */

export interface NumHit { value: number; index: number; raw: string }

const UNIT: Record<string, number> = {
  k: 1e3, thousand: 1e3, thousands: 1e3, grand: 1e3, l: 1e5, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, lk: 1e5,
  cr: 1e7, crore: 1e7, crores: 1e7, m: 1e6, mn: 1e6, million: 1e6,
};

export function parsePercents(text: string): NumHit[] {
  const out: NumHit[] = [];
  const re = /(\d+(?:\.\d+)?)\s*(?:%|percent\b|per cent\b|pc\b)/gi;
  for (const m of text.matchAll(re)) out.push({ value: parseFloat(m[1]), index: m.index ?? 0, raw: m[0] });
  return out;
}

export function parseGrams(text: string): NumHit[] {
  const out: NumHit[] = [];
  const re = /(\d+(?:\.\d+)?)\s*(?:g|gm|gms|gram|grams|gr)\b/gi;
  for (const m of text.matchAll(re)) out.push({ value: parseFloat(m[1]), index: m.index ?? 0, raw: m[0] });
  return out;
}

/** Strip dates, percents and grams, then read money amounts. */
export function parseAmounts(text: string, today = new Date()): NumHit[] {
  let t = text.toLowerCase();
  const d1 = parseDay(t, today); if (d1) t = t.replace(d1.raw, ' '.repeat(d1.raw.length));
  const d2 = parseTargetMonth(t, today); if (d2) t = t.replace(d2.raw, ' '.repeat(d2.raw.length));
  t = mask(t, /(\d+(?:\.\d+)?)\s*(?:%|percent\b|per cent\b|pc\b)/gi);
  t = mask(t, /(\d+(?:\.\d+)?)\s*(?:g|gm|gms|gram|grams|gr)\b/gi);
  t = mask(t, /\b(?:per\s+gram|\/\s*g(?:ram)?)\b/gi);
  const out: NumHit[] = [];
  const re = /(?:₹|rs\.?|inr|rupees?)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousands?|grand|lakhs?|lacs?|lac|lk|l|crores?|cr|million|mn|m)?\b/gi;
  for (const m of t.matchAll(re)) {
    const n = parseFloat(m[1].replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    const unit = m[2]?.toLowerCase();
    const value = unit ? n * (UNIT[unit] ?? 1) : n;
    if (value <= 0) continue;
    out.push({ value, index: (m.index ?? 0) + m[0].search(/\d/), raw: m[0].trim() });
  }
  return out;
}

/* ------------------------------------------------------------------ entities */

const ICON_ALIASES: Record<string, string[]> = {
  '🏍️': ['bike', 'motorbike', 'motorcycle', 'scooter'], '🚗': ['car'], '🏠': ['house', 'home', 'flat'], '✈️': ['trip', 'travel', 'vacation', 'holiday'],
  '🌍': ['trip', 'travel', 'tour', 'world'], '🛟': ['emergency', 'rainy day'], '💻': ['laptop', 'computer'], '📱': ['phone'],
  '🎓': ['education', 'college', 'course', 'studies'], '💍': ['wedding', 'marriage'], '👶': ['baby', 'kid'], '🏥': ['medical', 'health'],
};

const STOP = new Set(['the', 'a', 'an', 'my', 'for', 'to', 'of', 'and', 'in', 'goal', 'fund', 'trip', 'new', 'on', 'at']);
const tokens = (s: string) => norm(s).split(' ').filter((w) => w.length > 1 && !STOP.has(w));

export interface EntityHit<T> { item: T; index: number; score: number }

/** Fuzzy goal mentions, with the position of the first matching word. */
export function findGoals(text: string, goals: Goal[]): EntityHit<Goal>[] {
  const t = norm(text);
  const words = t.split(' ');
  const hits: EntityHit<Goal>[] = [];
  for (const g of goals) {
    const gt = tokens(g.name);
    if (!gt.length) continue;
    let score = 0; let index = -1;
    if (t.includes(norm(g.name))) { score = 100; index = t.indexOf(norm(g.name)); } else {
      for (const w of gt) {
        const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
        const wi = words.findIndex((x) => x === w || (w.length >= 4 && x.startsWith(w.slice(0, Math.max(4, w.length - 2)))));
        if (re.test(t) || wi >= 0) {
          score += w.length;
          const pos = t.search(re) >= 0 ? t.search(re) : t.indexOf(words[wi]);
          if (index < 0 || pos < index) index = pos;
        }
      }
    }
    if (score < 3) {
      // category words matched through the goal's icon, e.g. "bike" → 🏍️ Royal Enfield
      for (const w of ICON_ALIASES[g.icon] ?? []) {
        const pos = t.search(new RegExp(`\\b${w}s?\\b`));
        if (pos >= 0) { score = 3; index = pos; break; }
      }
    }
    if (score >= 3) hits.push({ item: g, index, score });
  }
  // keep best hit per position overlap
  return hits.sort((a, b) => b.score - a.score).filter((h, i, arr) => arr.findIndex((x) => x.item.id === h.item.id) === i);
}

export const TYPE_KEYWORDS: [HoldingType, RegExp][] = [
  ['silver', /\bsilver\b/],
  ['gold', /\b(gold|sgb|sovereign gold)\b/],
  ['fd', /\b(fd|fds|fixed deposits?)\b/],
  ['rd', /\b(rd|recurring deposits?)\b/],
  ['ppf_epf', /\b(ppf|epf|provident fund|pf)\b/],
  ['mutual_fund', /\b(mutual funds?|mf|mfs|sip|sips|index funds?|elss|nifty|etf)\b/],
  ['stocks', /\b(stocks?|shares?|equity|equities)\b/],
  ['bonds', /\b(bonds?|debentures?|t-?bills?)\b/],
  ['crypto', /\b(crypto|bitcoin|btc|eth|ethereum)\b/],
  ['cash', /\b(cash|wallet)\b/],
  ['bank', /\b(bank|savings account|saving account|account|hdfc|sbi|icici|axis|kotak)\b/],
];

export function findHoldingType(text: string): { type: HoldingType; index: number } | null {
  const t = norm(text);
  let best: { type: HoldingType; index: number } | null = null;
  for (const [type, re] of TYPE_KEYWORDS) {
    const m = t.match(re);
    if (m && (best == null || (m.index ?? 0) < best.index)) best = { type, index: m.index ?? 0 };
  }
  return best;
}

/** Holdings mentioned by name (preferred) or by type keyword. Ordered by position in text. */
export function findHoldings(text: string, holdings: Holding[]): { byName: EntityHit<Holding>[]; types: { type: HoldingType; index: number }[] } {
  const t = norm(text);
  const byName: EntityHit<Holding>[] = [];
  for (const h of holdings) {
    const name = norm(h.name);
    if (name && t.includes(name)) { byName.push({ item: h, index: t.indexOf(name), score: 100 }); continue; }
    const ht = tokens(h.name).filter((w) => w.length >= 3);
    const matched = ht.filter((w) => new RegExp(`\\b${w}\\b`).test(t));
    if (matched.length && matched.length >= Math.min(2, ht.length)) {
      byName.push({ item: h, index: t.search(new RegExp(`\\b${matched[0]}\\b`)), score: matched.join('').length });
    }
  }
  const types: { type: HoldingType; index: number }[] = [];
  for (const [type, re] of TYPE_KEYWORDS) {
    const g = new RegExp(re.source, 'g');
    for (const m of t.matchAll(g)) types.push({ type, index: m.index ?? 0 });
  }
  types.sort((a, b) => a.index - b.index);
  byName.sort((a, b) => a.index - b.index);
  return { byName, types };
}

export const isYes = (s: string) => /^(y|yes|yeah|yep|yup|ok|okay|sure|confirm|correct|right|do it|go ahead|looks good|perfect|done|save|👍)\b/i.test(s.trim());
export const isNo = (s: string) => /^(n|no|nope|cancel|stop|nevermind|never mind|forget it|abort)\b/i.test(s.trim());
export const mentionsUnassigned = (s: string) => /\b(unassigned|general|no goal|not for any goal|emergency cash|just savings)\b/i.test(s);
export const mentionsEqual = (s: string) => /\b(equally|evenly|half and half|50-50|50\/50|split it|split between|divide)\b/i.test(s);
