import { describe, expect, it } from 'vitest';
import type { Goal, Holding, Profile, Transaction, Valuation } from '../types';
import { holdingState, ledgerSnapshot, UNASSIGNED } from './ledger';
import { computeGoalMetrics, goalPace, monthlySurplus, runwayMonths } from './goals';
import { DEFAULT_RETURNS } from './constants';
import { DEFAULT_CATEGORIES } from '../categories';
import { baseGoal } from '../templates';

let seq = 0;
const tx = (p: Partial<Transaction>): Transaction => ({
  id: `t${++seq}`, date: '2026-01-01', kind: 'contribution', holdingId: 'h1', goalId: 'A', amount: 0,
  reason: 'saving', createdAt: `2026-01-01T00:00:${String(seq).padStart(2, '0')}`, ...p,
});
const val = (p: Partial<Valuation>): Valuation => ({ id: `v${++seq}`, holdingId: 'h1', date: '2026-01-01', value: 0, createdAt: `x${seq}`, ...p });
const H = (p: Partial<Holding> = {}): Holding => ({ id: 'h1', name: 'Fund', type: 'mutual_fund', valuation: 'market', archived: false, createdAt: '', ...p });

describe('unit-based ownership', () => {
  it('equals proportional split when there are no valuations', () => {
    const st = holdingState(H(), [tx({ amount: 30000 }), tx({ goalId: 'B', amount: 70000 })], [], '2026-12-31');
    expect(st.value).toBe(100000);
    expect(st.owners.A.value).toBeCloseTo(30000, 6);
    expect(st.owners.B.value).toBeCloseTo(70000, 6);
  });

  it('gives earlier money the gains made before later money arrived', () => {
    const txs = [tx({ amount: 100000, date: '2026-01-01' }), tx({ goalId: 'B', amount: 100000, date: '2026-03-01' })];
    const vals = [val({ value: 200000, date: '2026-02-01' })];
    const st = holdingState(H(), txs, vals, '2026-12-31');
    expect(st.value).toBe(300000);
    expect(st.owners.A.value).toBeCloseTo(200000, 4);
    expect(st.owners.B.value).toBeCloseTo(100000, 4);
    expect(st.invested).toBeCloseTo(200000, 6);
  });

  it('withdrawals reduce only that goal and are taken at market value', () => {
    const txs = [
      tx({ amount: 100000, date: '2026-01-01' }),
      tx({ goalId: 'B', amount: 100000, date: '2026-01-01' }),
      tx({ kind: 'withdrawal', amount: 60000, date: '2026-03-01', reason: 'goal_spend' }),
    ];
    const vals = [val({ value: 300000, date: '2026-02-01' })];
    const st = holdingState(H(), txs, vals, '2026-12-31');
    expect(st.value).toBeCloseTo(240000, 6);
    expect(st.owners.A.value).toBeCloseTo(90000, 4);
    expect(st.owners.B.value).toBeCloseTo(150000, 4);
    // A's cost basis reduced by 40% (60k of 150k value)
    expect(st.owners.A.invested).toBeCloseTo(60000, 4);
  });

  it('a market crash shows a loss calmly', () => {
    const st = holdingState(H(), [tx({ amount: 100000 })], [val({ value: 70000, date: '2026-02-01' })], '2026-03-01');
    expect(st.value).toBe(70000);
    expect(st.owners.A.value - st.owners.A.invested).toBeCloseTo(-30000, 6);
  });

  it('transfers between holdings keep the goal tag', () => {
    const bank = H({ id: 'bank', type: 'bank', valuation: 'cash' });
    const fund = H({ id: 'fund' });
    const txs = [
      tx({ holdingId: 'bank', amount: 50000 }),
      tx({ holdingId: 'bank', goalId: null, amount: 10000 }),
      tx({ holdingId: 'bank', kind: 'withdrawal', amount: 20000, date: '2026-02-01', reason: 'transfer', transferId: 'x' }),
      tx({ holdingId: 'fund', amount: 20000, date: '2026-02-01', reason: 'transfer', transferId: 'x' }),
    ];
    const snap = ledgerSnapshot([bank, fund], txs, [], '2026-12-31');
    expect(snap.goalValue.A).toBeCloseTo(50000, 6);
    expect(snap.goalByHolding.A.bank.value).toBeCloseTo(30000, 6);
    expect(snap.goalByHolding.A.fund.value).toBeCloseTo(20000, 6);
    expect(snap.goalValue[UNASSIGNED]).toBeCloseTo(10000, 6);
  });

  it('interest-based holdings grow monthly; valuations override', () => {
    const bank = H({ type: 'fd', valuation: 'interest', interestRate: 12 });
    const st = holdingState(bank, [tx({ amount: 100000, date: '2026-01-01' })], [], '2027-01-01');
    expect(Math.abs(st.value - 112682.5)).toBeLessThan(20); // 365 days ≈ 11.99 months
    const st2 = holdingState(bank, [tx({ amount: 100000, date: '2026-01-01' })], [val({ value: 105000, date: '2027-01-01' })], '2027-01-01');
    expect(st2.value).toBe(105000);
  });

  it('gold uses quantity valuations', () => {
    const gold = H({ type: 'gold', valuation: 'quantity' });
    const st = holdingState(gold, [tx({ amount: 70000, quantityGrams: 10 })], [val({ value: 80000, pricePerGram: 8000, date: '2026-02-01' })], '2026-03-01');
    expect(st.grams).toBe(10);
    expect(st.value).toBe(80000);
  });

  it('holding with no valuation uses invested amount', () => {
    const st = holdingState(H(), [tx({ amount: 5000 })], [], '2026-02-01');
    expect(st.value).toBe(5000);
    expect(st.hasValuation).toBe(false);
  });
});

const profile = (p: Partial<Profile> = {}): Profile => ({
  employmentStatus: 'salaried', incomeMin: 100000, incomeMax: 100000, otherIncome: 0, avgMonthlySpending: 50000,
  monthlySavingCapacity: 30000, checkInFrequency: 'monthly', valuationFrequency: 'weekly', checkInDay: 1,
  defaultReturns: DEFAULT_RETURNS, theme: 'system', shortNumbers: true, categories: DEFAULT_CATEGORIES, onboarded: true, createdAt: '', ...p,
});

describe('goal status and projections', () => {
  const today = new Date(2026, 10, 20);
  const goal: Goal = baseGoal({
    id: 'A', name: 'Bike', simpleTarget: { amount: 240000, inflationAdjust: false },
    savingEndDate: '2027-11-01', allocation: { kind: 'fixed', value: 20000 }, expectedReturnOverride: 0,
  });
  const H1 = H({ id: 'h1', type: 'bank', valuation: 'cash' });
  const run = (monthly: number, months = 3) => {
    const txs: Transaction[] = [];
    for (let i = 1; i <= months; i++) txs.push(tx({ amount: monthly, date: `2026-${String(10 - months + i).padStart(2, '0')}-15` }));
    const snap = ledgerSnapshot([H1], txs, [], '2026-11-20');
    return computeGoalMetrics(goal, snap, [H1], txs, profile(), today);
  };

  it('required accounts for money already saved', () => {
    // 3 × 20k saved, 12 months left, 0% → (240000 − 60000) / 12
    expect(run(20000).required).toBeCloseTo(15000, 6);
  });

  it('health classification', () => {
    const m1 = run(17000); // req = (240000-51000)/12 = 15750 → pace 17000 ≥ req; projected = 51k+204k=255k < 264k
    expect(m1.health).toBe('on_track');
    const m2 = run(14000); // req = 16500; ratio .848
    expect(m2.health).toBe('slightly_behind');
    const m3 = run(8000); // req = 18000; ratio .44
    expect(m3.health).toBe('behind');
    const m4 = run(30000); // projected = 90k + 360k ≥ 264k
    expect(m4.health).toBe('ahead');
    expect(run(0, 0).health).toBe('new');
  });

  it('projected completion date and fixes', () => {
    const m = run(8000);
    expect(m.projectionBasis).toBe('pace');
    // 24000 saved, 8000/month → 27 months to 240000
    expect(m.projectedCompletion).toBe('2029-02-20');
    // capacity 20000 ≥ required 18000 → no fixes
    expect(m.fixes).toHaveLength(0);
  });

  it('shows three fixes when required exceeds capacity', () => {
    const g = { ...goal, allocation: { kind: 'fixed' as const, value: 10000 } };
    const snap = ledgerSnapshot([H1], [], [], '2026-11-20');
    const m = computeGoalMetrics(g, snap, [H1], [], profile(), today);
    expect(m.required).toBeCloseTo(20000, 6);
    expect(m.fixes.map((f) => f.kind)).toEqual(['save_more', 'move_date', 'lower_target']);
    expect(m.fixes[0].amount).toBeCloseTo(10000, 6);
    expect(m.fixes[1].date).toBe('2028-11-20'); // 24 months × 10k
    expect(m.fixes[2].amount).toBeCloseTo(120000, 6);
  });

  it('pace ignores opening balances and transfers', () => {
    const txs = [tx({ amount: 100000, reason: 'opening', date: '2026-09-01' }), tx({ amount: 9000, date: '2026-10-05' })];
    expect(goalPace('A', txs, today, 'monthly').monthly).toBe(9000);
  });
});

describe('zero income and negative surplus', () => {
  it('surplus and runway', () => {
    expect(monthlySurplus({ incomeMin: 0, incomeMax: 0, otherIncome: 5000, avgMonthlySpending: 20000 })).toBe(-15000);
    expect(monthlySurplus({ incomeMin: 60000, incomeMax: 100000, otherIncome: 0, avgMonthlySpending: 50000 })).toBe(30000);
    expect(runwayMonths(120000, 20000)).toBe(6);
    expect(runwayMonths(-5, 20000)).toBe(0);
    expect(runwayMonths(1000, 0)).toBeNull();
  });

  it('capacity 0 still yields a required amount and a wait cost', () => {
    const g = baseGoal({ id: 'Z', simpleTarget: { amount: 120000, inflationAdjust: false }, savingEndDate: '2027-11-01', allocation: { kind: 'percent', value: 100 }, expectedReturnOverride: 0 });
    const m = computeGoalMetrics(g, ledgerSnapshot([], [], [], '2026-11-20'), [], [], profile({ incomeMin: 0, incomeMax: 0, monthlySavingCapacity: 0 }), new Date(2026, 10, 20));
    expect(m.capacity).toBe(0);
    expect(m.required).toBeCloseTo(10000, 6);
    expect(m.waitCostPerMonth).toBeCloseTo(120000 / 11 - 10000, 6);
    expect(m.fixes.map((f) => f.kind)).toEqual(['save_more', 'lower_target']);
  });
});
