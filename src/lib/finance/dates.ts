import {
  addDays, addMonths, differenceInCalendarDays, differenceInCalendarMonths, endOfMonth, format,
  parseISO, startOfMonth, startOfWeek,
} from 'date-fns';
import type { ISODate } from '../types';

export const toISO = (d: Date): ISODate => format(d, 'yyyy-MM-dd');
export const fromISO = (s: ISODate): Date => parseISO(s);
export const todayISO = (): ISODate => toISO(new Date());
const asDate = (d: Date | ISODate) => (typeof d === 'string' ? fromISO(d) : d);

/** First of the month as ISO */
export const monthKey = (d: Date | ISODate): ISODate => toISO(startOfMonth(asDate(d)));

/** Whole calendar months from `from` month to `to` month (Nov→Feb = 3), at least `min`. */
export function monthsBetween(from: Date | ISODate, to: Date | ISODate, min = 1): number {
  return Math.max(min, differenceInCalendarMonths(asDate(to), asDate(from)));
}

export const rawMonthsBetween = (from: Date | ISODate, to: Date | ISODate): number =>
  differenceInCalendarMonths(asDate(to), asDate(from));

/** Fractional months between two dates (for interest accrual). */
export function fractionalMonths(from: Date | ISODate, to: Date | ISODate): number {
  return Math.max(0, differenceInCalendarDays(asDate(to), asDate(from)) / (365.25 / 12));
}

export const fmtMonthYear = (d: Date | ISODate) => format(asDate(d), 'MMM yyyy');
export const fmtMonthYearLong = (d: Date | ISODate) => format(asDate(d), 'MMMM yyyy');
export const fmtDate = (d: Date | ISODate) => format(asDate(d), 'd MMM yyyy');
export const fmtShortDate = (d: Date | ISODate) => format(asDate(d), 'd MMM');

/** "2 yrs 3 mo" */
export function fmtDuration(months: number): string {
  if (months <= 0) return 'Due now';
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts: string[] = [];
  if (y) parts.push(`${y} yr${y > 1 ? 's' : ''}`);
  if (m) parts.push(`${m} mo`);
  return parts.join(' ');
}

export const addMonthsISO = (d: Date | ISODate, n: number): ISODate => toISO(addMonths(asDate(d), n));

export interface Period { start: ISODate; end: ISODate; key: string; label: string }
export type Frequency = 'weekly' | 'monthly';

/** Period containing date d. Weekly periods start on `weekStartsOn` (0=Sun). */
export function periodFor(d: Date | ISODate, freq: Frequency, weekStartsOn = 1): Period {
  const date = asDate(d);
  if (freq === 'monthly') {
    const s = startOfMonth(date);
    return { start: toISO(s), end: toISO(endOfMonth(date)), key: toISO(s), label: format(s, 'MMMM yyyy') };
  }
  const s = startOfWeek(date, { weekStartsOn: (((weekStartsOn % 7) + 7) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6 });
  const e = addDays(s, 6);
  return { start: toISO(s), end: toISO(e), key: toISO(s), label: `${format(s, 'd MMM')} – ${format(e, 'd MMM yyyy')}` };
}

export function previousPeriod(p: Period, freq: Frequency, weekStartsOn = 1): Period {
  return periodFor(addDays(fromISO(p.start), -1), freq, weekStartsOn);
}

/** `count` periods ending with the one containing `until`. Oldest first. */
export function lastPeriods(until: Date | ISODate, freq: Frequency, count: number, weekStartsOn = 1): Period[] {
  const out: Period[] = [];
  let p = periodFor(until, freq, weekStartsOn);
  for (let i = 0; i < count; i++) {
    out.unshift(p);
    p = previousPeriod(p, freq, weekStartsOn);
  }
  return out;
}

/** Periods per month, for converting monthly amounts. */
export const periodsPerMonth = (freq: Frequency) => (freq === 'weekly' ? 52 / 12 : 1);

export function ageAt(dob: ISODate | undefined, at: Date | ISODate): number | null {
  if (!dob) return null;
  const a = asDate(at);
  const b = fromISO(dob);
  let age = a.getFullYear() - b.getFullYear();
  if (a.getMonth() < b.getMonth() || (a.getMonth() === b.getMonth() && a.getDate() < b.getDate())) age--;
  return age;
}
