import { addMonths, addWeeks, endOfMonth, endOfYear, format, startOfMonth, startOfYear } from 'date-fns';
import type { CheckIn, Goal, Holding, Transaction, Valuation } from '../types';
import { fromISO, periodFor, toISO } from './dates';
import { ledgerSnapshot } from './ledger';
import { checkInIncome } from './goals';
import { monthlyRate } from './compound';

export type Timeframe = 'weekly' | 'monthly' | 'yearly' | 'all';

export interface SeriesPoint {
  key: string;
  label: string;
  start: string;
  end: string;
  /** saved per goal id this period */
  saved: Record<string, number>;
  savedTotal: number;
  value: number;
  invested: number;
  required?: number;
  [k: string]: unknown;
}

const NOT_SAVING = new Set(['transfer', 'reassign']);

function buckets(tf: Timeframe, today: Date, firstDate: Date, weekStart: number): { start: Date; end: Date; label: string }[] {
  const out: { start: Date; end: Date; label: string }[] = [];
  if (tf === 'weekly') {
    let p = periodFor(today, 'weekly', weekStart);
    for (let i = 0; i < 12; i++) {
      out.unshift({ start: fromISO(p.start), end: fromISO(p.end), label: format(fromISO(p.start), 'd MMM') });
      p = periodFor(addWeeks(fromISO(p.start), -1), 'weekly', weekStart);
    }
    return out;
  }
  if (tf === 'yearly') {
    for (let y = Math.min(firstDate.getFullYear(), today.getFullYear()); y <= today.getFullYear(); y++) {
      const s = startOfYear(new Date(y, 0, 1));
      out.push({ start: s, end: endOfYear(s), label: String(y) });
    }
    return out;
  }
  const start = tf === 'monthly' ? startOfMonth(addMonths(today, -11)) : startOfMonth(firstDate < today ? firstDate : today);
  let m = start;
  let guard = 0;
  while (m <= today && guard++ < 240) {
    out.push({ start: m, end: endOfMonth(m), label: format(m, tf === 'all' && out.length > 12 ? 'MMM yy' : 'MMM') });
    m = addMonths(m, 1);
  }
  if (tf === 'monthly' && out.length < 12) return out;
  return out;
}

/** Saved per period plus cumulative value/invested at each period end. `goalId` null = all goals. */
export function savingsSeries(args: {
  goals: Goal[]; holdings: Holding[]; txs: Transaction[]; vals: Valuation[]; goalId: string | null; tf: Timeframe; today: Date; weekStart?: number;
}): SeriesPoint[] {
  const { goals, holdings, txs, vals, goalId, tf, today } = args;
  const goalIds = new Set(goals.map((g) => g.id));
  const relevant = txs.filter((t) => (goalId ? t.goalId === goalId : t.goalId != null && goalIds.has(t.goalId)));
  const first = relevant.reduce((m, t) => (t.date < m ? t.date : m), toISO(today));
  const todayISO = toISO(today);
  return buckets(tf, today, fromISO(first), args.weekStart ?? 1).map((b) => {
    const s = toISO(b.start);
    const e = toISO(b.end);
    const saved: Record<string, number> = {};
    for (const t of relevant) {
      if (t.date < s || t.date > e || t.kind !== 'contribution' || NOT_SAVING.has(t.reason) || !t.goalId) continue;
      saved[t.goalId] = (saved[t.goalId] ?? 0) + t.amount;
    }
    const asOf = e > todayISO ? todayISO : e;
    const snap = ledgerSnapshot(holdings, txs, vals, asOf);
    const ids = goalId ? [goalId] : [...goalIds];
    const value = ids.reduce((sum, id) => sum + (snap.goalValue[id] ?? 0), 0);
    const invested = ids.reduce((sum, id) => sum + (snap.goalInvested[id] ?? 0), 0);
    return { key: s, label: b.label, start: s, end: e, saved, savedTotal: Object.values(saved).reduce((a, v) => a + v, 0), value, invested, ...Object.fromEntries(Object.entries(saved).map(([k, v]) => [`g_${k}`, v])) };
  });
}

/** Monthly path for a goal from its first money (or creation) to its deadline: actual, required, projected. */
export function goalPathSeries(args: {
  goal: Goal; holdings: Holding[]; txs: Transaction[]; vals: Valuation[]; today: Date;
  target: number; expectedReturn: number; projectionPace: number;
}) {
  const { goal, holdings, txs, vals, today, target, expectedReturn, projectionPace } = args;
  const own = txs.filter((t) => t.goalId === goal.id);
  const firstISO = own.reduce((m, t) => (t.date < m ? t.date : m), goal.createdAt.slice(0, 10));
  const start = startOfMonth(fromISO(firstISO));
  const end = startOfMonth(fromISO(goal.savingEndDate));
  const total = Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth());
  const step = total > 120 ? Math.ceil(total / 120) : 1;
  const r = monthlyRate(expectedReturn);
  const startValue = ledgerSnapshot(holdings, txs, vals, toISO(endOfMonth(start))).goalValue[goal.id] ?? 0;
  // required flat path from start value to target
  const n = total;
  const gap = target - startValue * Math.pow(1 + r, n);
  const pmt = gap <= 0 ? 0 : r === 0 ? gap / n : (gap * r) / (Math.pow(1 + r, n) - 1);
  const todayISO = toISO(today);
  const points: { label: string; date: string; actual?: number; required: number; projected?: number }[] = [];
  let todayValue = 0;
  for (let i = 0; i <= total; i += step) {
    const d = addMonths(start, i);
    const dEnd = toISO(endOfMonth(d));
    const required = startValue * Math.pow(1 + r, i) + (r === 0 ? pmt * i : (pmt * (Math.pow(1 + r, i) - 1)) / r);
    const p: (typeof points)[number] = { label: format(d, total > 24 ? 'MMM yy' : 'MMM'), date: toISO(d), required: Math.min(required, target * 1.5) };
    if (toISO(d) <= todayISO) {
      const v = ledgerSnapshot(holdings, txs, vals, dEnd < todayISO ? dEnd : todayISO).goalValue[goal.id] ?? 0;
      p.actual = v;
      todayValue = v;
      const nextD = toISO(addMonths(d, step));
      if (nextD > todayISO) p.projected = v;
    } else {
      const k = Math.max(0, (d.getFullYear() - today.getFullYear()) * 12 + d.getMonth() - today.getMonth());
      p.projected = todayValue * Math.pow(1 + r, k) + (r === 0 ? projectionPace * k : (projectionPace * (Math.pow(1 + r, k) - 1)) / r);
    }
    points.push(p);
  }
  return points;
}

/** Income, spending and savings per month for the last `months` months. */
export function incomeSeries(checkIns: CheckIn[], txs: Transaction[], goals: Goal[], today: Date, months = 12) {
  const goalIds = new Set(goals.map((g) => g.id));
  const out: { label: string; income: number; spending: number; saved: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = startOfMonth(addMonths(today, -i));
    const s = toISO(m);
    const e = toISO(endOfMonth(m));
    const cis = checkIns.filter((c) => c.periodStart >= s && c.periodStart <= e);
    const saved = txs.filter((t) => t.kind === 'contribution' && t.reason === 'saving' && t.date >= s && t.date <= e && (t.goalId == null || goalIds.has(t.goalId))).reduce((a, t) => a + t.amount, 0);
    out.push({
      label: format(m, 'MMM'),
      income: cis.reduce((a, c) => a + checkInIncome(c), 0),
      spending: cis.reduce((a, c) => a + (c.spending ?? 0), 0),
      saved,
    });
  }
  return out;
}

