import { describe, expect, it } from 'vitest';
import { fvAnnuity, fvLump, monthsToReach, pmtForFV, requiredFlat, requiredStepUp, stepUpSchedule } from './compound';
import { inflationFactor, spreadInflationFactor, summarizePlanner } from './planner';
import { worldTourPlanner } from './worldTour.fixture';
import { formatINR, formatINRShort, groupIndian, parseMoneyInput } from './format';
import { monthsBetween, periodFor } from './dates';

describe('compound maths', () => {
  it('fv of lump and annuity', () => {
    expect(fvLump(100000, 12, 12)).toBeCloseTo(112682.5, 0);
    expect(fvAnnuity(1000, 12, 12)).toBeCloseTo(12682.5, 0);
    expect(fvAnnuity(1000, 0, 12)).toBe(12000);
  });

  it('pmt inverts fv annuity, including r = 0', () => {
    const p = pmtForFV(1_000_000, 10, 60);
    expect(fvAnnuity(p, 10, 60)).toBeCloseTo(1_000_000, 2);
    expect(pmtForFV(120000, 0, 12)).toBe(10000);
  });

  it('required flat is 0 when already covered and accounts for current value', () => {
    expect(requiredFlat(100000, 200000, 8, 12)).toBe(0);
    const req = requiredFlat(500000, 100000, 8, 24);
    expect(fvLump(100000, 8, 24) + fvAnnuity(req, 8, 24)).toBeCloseTo(500000, 2);
    expect(requiredFlat(12000, 0, 0, 0)).toBe(12000); // months min 1
  });

  it('step-up solver hits the target and steps every January', () => {
    // start Nov (index 10) 2026, 62 months
    const { firstMonthly, schedule } = requiredStepUp(5_000_000, 200000, 10, 62, 10, 2026, 10);
    const last = schedule[schedule.length - 1];
    expect(last.endBalance).toBeCloseTo(5_000_000, 0);
    expect(schedule[0]).toMatchObject({ year: 2026, months: 2 });
    expect(schedule[1].monthly).toBeCloseTo(firstMonthly * 1.1, 6);
    expect(schedule.reduce((s, y) => s + y.months, 0)).toBe(62);
    // flat equivalence when step-up = 0
    const flat = requiredStepUp(5_000_000, 200000, 10, 62, 0, 2026, 10).firstMonthly;
    expect(flat).toBeCloseTo(requiredFlat(5_000_000, 200000, 10, 62), 6);
    // r = 0
    const z = requiredStepUp(120000, 0, 0, 12, 0, 2026, 0);
    expect(z.firstMonthly).toBeCloseTo(10000, 6);
  });

  it('stepUpSchedule end balance equals projectValue for flat', () => {
    const rows = stepUpSchedule(10000, 0, 0, 24, 0, 2026, 0);
    expect(rows).toHaveLength(2);
    expect(rows[1].endBalance).toBe(240000);
  });

  it('months to reach', () => {
    expect(monthsToReach(120000, 0, 10000, 0)).toBe(12);
    expect(monthsToReach(100, 200, 0, 0)).toBe(0);
    expect(monthsToReach(100000, 0, 0, 10)).toBeNull();
  });
});

describe('inflation', () => {
  it('one-time and spread multipliers', () => {
    expect(inflationFactor(6, 12)).toBeCloseTo(1.06, 10);
    expect(spreadInflationFactor(6, 60, 24)).toBeCloseTo(1.3784, 4);
    // partial last chunk: 18 months = 12/18 at year0 + 6/18 at year1
    expect(spreadInflationFactor(6, 0, 18)).toBeCloseTo((12 / 18) * 1 + (6 / 18) * 1.06, 10);
  });
});

describe('world tour template', () => {
  const p = worldTourPlanner('2032-02-01');
  const s = summarizePlanner(p, 60);

  it('totals match the spec within ₹1,000', () => {
    expect(Math.abs(s.totalToday - 23301520)).toBeLessThan(1000);
    expect(Math.abs(s.totalAtGoal - 32118171)).toBeLessThan(1000);
    expect(Math.abs(s.finalTarget - 34523979)).toBeLessThan(1000);
    expect(s.rateDays).toBe(730);
  });

  it('flat required over 62 months at 10% ≈ ₹4,27,587', () => {
    expect(Math.abs(requiredFlat(s.finalTarget, 0, 10, 62) - 427587)).toBeLessThan(100);
  });

  it('toggling an item off reduces the total', () => {
    const p2 = worldTourPlanner();
    const adv = p2.sections[1].items[0];
    adv.enabled = false;
    expect(summarizePlanner(p2, 60).totalToday).toBeCloseTo(23301520 - 1000000 * 1.1 - 1000000 * 0.02 * 1.1, 0);
  });
});

describe('formatting', () => {
  it('indian grouping', () => {
    expect(groupIndian(12345678)).toBe('1,23,45,678');
    expect(formatINR(12345678)).toBe('₹1,23,45,678');
    expect(formatINR(999)).toBe('₹999');
    expect(formatINR(-150000)).toBe('-₹1,50,000');
    expect(formatINR(0)).toBe('₹0');
  });
  it('short forms', () => {
    expect(formatINRShort(12345678)).toBe('₹1.23 Cr');
    expect(formatINRShort(450000)).toBe('₹4.5 L');
    expect(formatINRShort(45000)).toBe('₹45k');
    expect(formatINRShort(1500)).toBe('₹1.5k');
    expect(formatINRShort(800)).toBe('₹800');
    expect(formatINRShort(-250000)).toBe('-₹2.5 L');
  });
  it('parses input', () => {
    expect(parseMoneyInput('1,23,456')).toBe(123456);
    expect(parseMoneyInput('')).toBe(0);
  });
});

describe('dates', () => {
  it('months between, min 1', () => {
    expect(monthsBetween(new Date(2026, 10, 20), '2032-02-01')).toBe(63);
    expect(monthsBetween(new Date(2026, 10, 20), '2026-11-01')).toBe(1);
    expect(monthsBetween(new Date(2026, 10, 20), '2020-01-01')).toBe(1);
  });
  it('periods handle leap years and month ends', () => {
    expect(periodFor(new Date(2028, 1, 29), 'monthly')).toMatchObject({ start: '2028-02-01', end: '2028-02-29' });
    expect(periodFor(new Date(2026, 10, 20), 'weekly', 1)).toMatchObject({ start: '2026-11-16', end: '2026-11-22' });
  });
});
