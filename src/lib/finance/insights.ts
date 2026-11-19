import { addMonths, endOfMonth, startOfMonth } from 'date-fns';
import type { Goal, Holding, Profile, Transaction } from '../types';
import type { GoalMetrics } from './goals';
import type { LedgerSnapshot } from './ledger';
import { requiredFlat } from './compound';
import { avgIncome, holdingExpectedReturn } from './goals';
import { toISO } from './dates';
import { formatINRShort, formatPct } from './format';

export interface Insight { id: string; tone: 'good' | 'info' | 'warn'; text: string }

/** Short, plain-English observations about one goal. At most three, most important first. */
export function goalInsights(args: {
  goal: Goal; m: GoalMetrics; holdings: Holding[]; txs: Transaction[]; snap: LedgerSnapshot; profile: Profile | null; today: Date;
}): Insight[] {
  const { goal, m, holdings, txs, snap, profile, today } = args;
  const out: Insight[] = [];
  const noIncome = profile ? avgIncome(profile) + profile.otherIncome <= 0 : false;

  if (m.health === 'reached') out.push({ id: 'reached', tone: 'good', text: 'You\'ve hit the target 🎉 Mark it complete whenever you\'re ready.' });
  if (m.health === 'ahead') out.push({ id: 'ahead', tone: 'good', text: 'You\'re ahead of schedule. You could save a little less here and give the rest to another goal.' });

  if (m.dueNow && m.currentValue < m.target) {
    out.push({ id: 'due', tone: 'warn', text: `This is due now and you're ${formatINRShort(m.target - m.currentValue)} short. Move the date or adjust the target.` });
  } else if (noIncome && m.required > 0) {
    out.push({ id: 'noincome', tone: 'info', text: `Once you start earning, about ${formatINRShort(m.required)} a month gets you there. Each month of waiting adds roughly ${formatINRShort(m.waitCostPerMonth)}.` });
  } else if (m.capacity <= 0 && m.required > 0) {
    out.push({ id: 'unset', tone: 'info', text: `No monthly amount is set for this goal yet. It needs about ${formatINRShort(m.required)} a month.` });
  } else if (m.required > m.capacity + 1 && m.health !== 'reached') {
    out.push({ id: 'short', tone: 'warn', text: `You need ${formatINRShort(m.required)} a month, but ${formatINRShort(m.capacity)} is set aside. See the ways to catch up below.` });
  }

  // saved on target streak
  if (m.required > 0) {
    let streak = 0;
    for (let i = 1; i <= 24; i++) {
      const mo = startOfMonth(addMonths(today, -i));
      const s = toISO(mo); const e = toISO(endOfMonth(mo));
      const saved = txs.filter((t) => t.goalId === goal.id && t.kind === 'contribution' && t.reason === 'saving' && t.date >= s && t.date <= e).reduce((a, t) => a + t.amount, 0);
      if (saved >= m.required * 0.98) streak++; else break;
    }
    if (streak >= 2) out.push({ id: 'streak', tone: 'good', text: `On target ${streak} months in a row. Keep it going.` });
  }

  // investments down
  if (m.gain < -1 && m.invested > 0) out.push({ id: 'loss', tone: 'info', text: `Your investments here are down ${formatINRShort(-m.gain)}. That's normal. Markets move, and it usually recovers with time.` });

  // too much sitting in a low-interest account
  const defaults = profile?.defaultReturns;
  const pos = snap.goalByHolding[goal.id] ?? {};
  if (defaults && m.currentValue > 50000 && goal.expectedReturnOverride == null && m.monthsLeft > 36) {
    let low = 0; let total = 0; let weighted = 0;
    for (const h of holdings) {
      const v = pos[h.id]?.value ?? 0;
      if (v <= 0) continue;
      const isLow = h.type === 'bank' || h.type === 'cash';
      const r = holdingExpectedReturn(h, defaults);
      total += v;
      if (isLow) low += v;
      weighted += isLow ? v * (0.5 * r + 0.5 * defaults.mutual_fund) : v * r;
    }
    if (total && low / total >= 0.5) {
      const saving = m.requiredFlat - requiredFlat(m.target, m.currentValue, weighted / total, m.monthsLeft);
      if (saving > 100) out.push({ id: 'bank', tone: 'info', text: `${formatPct((low / total) * 100, 0)} of this goal sits in a savings account. Moving half to an index fund could lower your monthly amount by about ${formatINRShort(saving)}.` });
    }
  }

  // gold / silver performance
  for (const h of holdings) {
    if ((h.type !== 'gold' && h.type !== 'silver') || !(pos[h.id]?.value > 0)) continue;
    const st = snap.holdings[h.id];
    if (!st?.hasValuation || st.invested <= 0) continue;
    const pct = ((st.value - st.invested) / st.invested) * 100;
    if (pct >= 3) { out.push({ id: `metal-${h.id}`, tone: 'good', text: `${h.name} is up ${formatPct(pct)} since you bought it.` }); break; }
  }

  const order = { warn: 0, good: 1, info: 2 } as const;
  return out.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 3);
}
