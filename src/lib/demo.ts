import { addMonths, endOfMonth, startOfMonth } from 'date-fns';
import type { CheckIn, Goal, Holding, Transaction, Valuation } from './types';
import { baseGoal, fixedItem } from './templates';
import { newId } from './ids';
import { toISO } from './finance/dates';
import { holdingState } from './finance/ledger';

/** Deterministic pseudo-random numbers so the demo looks the same each time. */
function rng(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

export function buildDemo(today = new Date()) {
  const rand = rng(42);
  const stamp = (d: string, i = 0) => `${d}T10:00:${String(i % 60).padStart(2, '0')}.000Z`;
  const start = startOfMonth(addMonths(today, -12));

  const H = (name: string, type: Holding['type'], valuation: Holding['valuation'], extra: Partial<Holding> = {}): Holding =>
    ({ id: newId(), name, type, valuation, archived: false, createdAt: stamp(toISO(start)), ...extra });
  const bank = H('HDFC Savings', 'bank', 'interest', { interestRate: 3, platform: 'HDFC Bank' });
  const fd = H('SBI Fixed Deposit', 'fd', 'interest', { interestRate: 7.1, platform: 'SBI' });
  const nifty = H('Nifty 50 Index Fund', 'mutual_fund', 'market', { platform: 'Groww' });
  const gold = H('Digital Gold', 'gold', 'quantity', { platform: 'PhonePe' });
  const silver = H('Silver', 'silver', 'quantity', { platform: 'MMTC-PAMP' });
  const holdings = [bank, fd, nifty, gold, silver];

  const tripStart = toISO(startOfMonth(addMonths(today, 30)));
  const tour: Goal = baseGoal({
    name: 'Japan trip', icon: '✈️', color: '#0a84ff', mode: 'planner', simpleTarget: undefined,
    planner: {
      inflationRate: 6, spendStartDate: tripStart, spendDurationMonths: 0, contingencyRate: 10, afterGoalCushion: 0,
      sections: [
        { id: newId(), name: 'Travel', order: 0, collapsed: false, items: [fixedItem('Return flights', 85000), fixedItem('Rail pass (14 days)', 32000), fixedItem('Travel insurance', 6000)] },
        { id: newId(), name: 'Stay & food', order: 1, collapsed: false, items: [
          { id: newId(), kind: 'rate', name: 'Hotels', quantity: 14, unit: 'nights', rates: [{ label: 'Per night', amount: 9000 }], enabled: true },
          { id: newId(), kind: 'rate', name: 'Food', quantity: 15, unit: 'days', rates: [{ label: 'Per day', amount: 3500 }], enabled: true },
        ] },
        { id: newId(), name: 'Fun', order: 2, collapsed: false, items: [fixedItem('Mt. Fuji day tour', 12000), fixedItem('Shopping', 40000)] },
      ],
    },
    savingEndDate: tripStart, allocation: { kind: 'percent', value: 50 }, planType: 'flat', priority: 'medium',
    description: 'Two weeks across Tokyo, Kyoto and Osaka.', plannedMix: { mutual_fund: 70, gold: 30 }, createdAt: stamp(toISO(start)),
  });
  const emergency: Goal = baseGoal({
    name: 'Emergency fund', icon: '🛟', color: '#14b8a6', simpleTarget: { amount: 360000, inflationAdjust: false },
    savingEndDate: toISO(startOfMonth(addMonths(today, 8))), allocation: { kind: 'percent', value: 30 }, priority: 'high',
    plannedMix: { bank: 40, fd: 60 }, createdAt: stamp(toISO(start)),
  });
  const bike: Goal = baseGoal({
    name: 'Royal Enfield Himalayan', icon: '🏍️', color: '#f97316',
    simpleTarget: { amount: 320000, inflationAdjust: true, todayCost: 320000, inflationRate: 5 },
    savingEndDate: toISO(startOfMonth(addMonths(today, 20))), allocation: { kind: 'percent', value: 20 }, priority: 'low',
    plannedMix: { mutual_fund: 50, silver: 50 }, createdAt: stamp(toISO(start)),
  });
  const goals = [emergency, tour, bike];

  const txs: Transaction[] = [];
  const vals: Valuation[] = [];
  const checkIns: CheckIn[] = [];
  let i = 0;
  const add = (date: string, holdingId: string, goalId: string | null, amount: number, extra: Partial<Transaction> = {}) =>
    txs.push({ id: newId(), date, kind: 'contribution', holdingId, goalId, amount: Math.round(amount), reason: 'saving', createdAt: stamp(date, i++), ...extra });

  // opening balances
  const d0 = toISO(start);
  add(d0, bank.id, null, 150000, { reason: 'opening', note: 'Savings at start' });
  add(d0, fd.id, emergency.id, 100000, { reason: 'opening' });
  add(d0, nifty.id, tour.id, 40000, { reason: 'opening' });

  let goldPpg = 6900; let silverPpg = 84;
  for (let m = 0; m < 12; m++) {
    const ms = startOfMonth(addMonths(start, m));
    const me = endOfMonth(ms);
    const date = toISO(me);
    const income = 115000 + Math.round(rand() * 4) * 5000;
    const freelance = rand() > 0.6 ? Math.round(10 + rand() * 30) * 1000 : 0;
    const spending = 52000 + Math.round(rand() * 14) * 1000;
    const ci: CheckIn = {
      id: newId(), periodStart: toISO(ms), periodEnd: date,
      incomes: [{ source: 'Salary', amount: income }, ...(freelance ? [{ source: 'Freelance', amount: freelance }] : [])],
      spending, note: m === 9 ? 'Diwali bonus month' : undefined, createdAt: stamp(date, m),
    };
    checkIns.push(ci);
    const pool = income + freelance - spending;
    const save = Math.round(pool * (0.75 + rand() * 0.2) / 500) * 500 + (m === 9 ? 40000 : 0);
    const em = m < 8 ? Math.round(save * 0.25) : Math.round(save * 0.1);
    const bk = Math.round(save * 0.15);
    const tr = Math.round((save - em - bk) * 0.35);
    goldPpg *= 1 + (rand() - 0.35) * 0.04;
    silverPpg *= 1 + (rand() - 0.4) * 0.06;
    add(date, m % 2 ? bank.id : fd.id, emergency.id, em, { checkInId: ci.id });
    add(date, nifty.id, tour.id, tr * 0.7, { checkInId: ci.id });
    add(date, gold.id, tour.id, tr * 0.3, { checkInId: ci.id, quantityGrams: +((tr * 0.3) / goldPpg).toFixed(3) });
    add(date, silver.id, bike.id, bk * 0.6, { checkInId: ci.id, quantityGrams: +((bk * 0.6) / silverPpg).toFixed(2) });
    add(date, nifty.id, bike.id, bk * 0.4, { checkInId: ci.id });

    // monthly valuations for market-linked holdings (index fund drifts −2%…+5% a month)
    const asOf = date;
    const monthlyReturn = (rand() - 0.3) * 0.07;
    const niftyState = holdingState(nifty, txs, vals, asOf);
    vals.push({ id: newId(), holdingId: nifty.id, date: asOf, value: Math.round(niftyState.value * (1 + monthlyReturn)), createdAt: stamp(asOf, 59) });
    const g = holdingState(gold, txs, vals, asOf);
    vals.push({ id: newId(), holdingId: gold.id, date: asOf, value: Math.round(g.grams * goldPpg), pricePerGram: Math.round(goldPpg), createdAt: stamp(asOf, 58) });
    const s = holdingState(silver, txs, vals, asOf);
    vals.push({ id: newId(), holdingId: silver.id, date: asOf, value: Math.round(s.grams * silverPpg), pricePerGram: Math.round(silverPpg), createdAt: stamp(asOf, 57) });
  }

  // a move between holdings and a tax withdrawal
  const mid = toISO(endOfMonth(addMonths(start, 6)));
  const tid = newId();
  txs.push(
    { id: newId(), date: mid, kind: 'withdrawal', holdingId: bank.id, goalId: null, amount: 50000, reason: 'transfer', transferId: tid, createdAt: stamp(mid, 50) },
    { id: newId(), date: mid, kind: 'contribution', holdingId: nifty.id, goalId: null, amount: 50000, reason: 'transfer', transferId: tid, createdAt: stamp(mid, 51) },
  );
  const taxDate = toISO(endOfMonth(addMonths(start, 10)));
  txs.push({ id: newId(), date: taxDate, kind: 'withdrawal', holdingId: fd.id, goalId: emergency.id, amount: 3200, reason: 'tax', note: 'TDS on FD interest', createdAt: stamp(taxDate, 52) });

  return { goals, holdings, transactions: txs, valuations: vals, checkIns };
}

