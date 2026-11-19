import type { AppData } from '../types';
import { checkInIncome } from '../finance/goals';
import { typeInfo, txReasonLabel } from '../categories';

const esc = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(rows: (string | number | undefined | null)[][]): string {
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\n');
}

/** One unified history table. */
export function historyCSV(data: AppData): string {
  const goal = (id: string | null) => (id == null ? 'General savings' : data.goals.find((g) => g.id === id)?.name ?? 'Deleted goal');
  const holding = (id: string) => data.holdings.find((h) => h.id === id)?.name ?? 'Deleted holding';
  const rows: (string | number | undefined)[][] = [['Date', 'Type', 'Goal', 'Holding', 'Holding type', 'Amount (INR)', 'Grams', 'Reason', 'Note']];
  const entries: { date: string; row: (string | number | undefined)[] }[] = [];
  for (const t of data.transactions) {
    const h = data.holdings.find((x) => x.id === t.holdingId);
    entries.push({ date: t.date, row: [t.date, t.kind === 'contribution' ? 'Contribution' : 'Withdrawal', goal(t.goalId), holding(t.holdingId), h ? typeInfo(h.type, data.profile?.categories).label : '', t.kind === 'withdrawal' ? -t.amount : t.amount, t.quantityGrams, txReasonLabel(t), t.note] });
  }
  for (const v of data.valuations) {
    const h = data.holdings.find((x) => x.id === v.holdingId);
    entries.push({ date: v.date, row: [v.date, 'Valuation', '', holding(v.holdingId), h ? typeInfo(h.type, data.profile?.categories).label : '', v.value, undefined, v.pricePerGram ? `₹${v.pricePerGram}/g` : '', ''] });
  }
  for (const c of data.checkIns) {
    entries.push({ date: c.periodStart, row: [c.periodStart, 'Check-in', '', '', '', checkInIncome(c), undefined, `Income ${c.incomes.map((i) => `${i.source}: ${i.amount}`).join('; ')} | Spending ${c.spending ?? ''}`, c.note] });
  }
  entries.sort((a, b) => b.date.localeCompare(a.date));
  return toCSV([...rows, ...entries.map((e) => e.row)]);
}
