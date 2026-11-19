import { addMonths, endOfMonth, startOfMonth } from 'date-fns';
import type { Holding, Transaction, Valuation } from '@/lib/types';
import { holdingState } from '@/lib/finance/ledger';
import { fromISO, toISO } from '@/lib/finance/dates';

/** Monthly value + invested series for a holding from its first transaction to today. */
export function holdingSeries(h: Holding, txs: Transaction[], vals: Valuation[], today: Date, maxPoints = 24) {
  const own = txs.filter((t) => t.holdingId === h.id);
  if (!own.length) return [];
  const first = own.reduce((m, t) => (t.date < m ? t.date : m), own[0].date);
  let m = startOfMonth(fromISO(first));
  const months: Date[] = [];
  while (m <= today) { months.push(m); m = addMonths(m, 1); }
  const pick = months.length > maxPoints ? months.slice(-maxPoints) : months;
  const todayISO = toISO(today);
  return pick.map((d) => {
    const e = toISO(endOfMonth(d));
    const st = holdingState(h, txs, vals, e > todayISO ? todayISO : e);
    return { date: toISO(d), value: st.value, invested: st.invested };
  });
}
