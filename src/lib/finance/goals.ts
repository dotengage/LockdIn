import { addMonths } from 'date-fns';
import type { CheckIn, Goal, Holding, HoldingType, ISODate, Profile, Transaction } from '../types';
import { DEFAULT_GOAL_RETURN } from './constants';
import { returnsWithCustom } from '../categories';
import { monthsToReach, projectValue, requiredFlat, requiredStepUp, type StepUpYear } from './compound';
import { addMonthsISO, lastPeriods, periodFor, periodsPerMonth, rawMonthsBetween, toISO } from './dates';
import type { LedgerSnapshot } from './ledger';
import { biggestItems, inflationApplies, inflationFactor, summarizePlanner } from './planner';

export type GoalHealth = 'new' | 'on_track' | 'slightly_behind' | 'behind' | 'ahead' | 'reached' | 'completed' | 'paused';

export const HEALTH_LABEL: Record<GoalHealth, string> = {
  new: 'Getting started', on_track: 'On track', slightly_behind: 'Slightly behind', behind: 'Behind',
  ahead: 'Ahead', reached: 'Target reached', completed: 'Completed', paused: 'Paused',
};

/** Target at the goal date, assuming the saving end moves by `shiftMonths` (planner spend start moves with it). */
export function goalTarget(goal: Goal, today: Date, shiftMonths = 0): number {
  if (goal.mode === 'planner' && goal.planner) {
    const start = addMonthsISO(goal.planner.spendStartDate, shiftMonths);
    return summarizePlanner(goal.planner, Math.max(0, rawMonthsBetween(today, start))).finalTarget;
  }
  const t = goal.simpleTarget;
  if (!t) return 0;
  if (t.inflationAdjust && t.todayCost != null) {
    const end = addMonthsISO(goal.savingEndDate, shiftMonths);
    const months = Math.max(0, rawMonthsBetween(today, end));
    return inflationApplies(months) ? t.todayCost * inflationFactor(t.inflationRate ?? 0, months) : t.todayCost;
  }
  return t.amount;
}

/** Target in today's money (before inflation). */
export function goalTargetToday(goal: Goal, today: Date): number {
  if (goal.mode === 'planner' && goal.planner) {
    const s = summarizePlanner(goal.planner, Math.max(0, rawMonthsBetween(today, goal.planner.spendStartDate)));
    return s.totalToday + s.cushionToday;
  }
  const t = goal.simpleTarget;
  if (!t) return 0;
  return t.inflationAdjust && t.todayCost != null ? t.todayCost : t.amount;
}

export const holdingExpectedReturn = (h: Holding, defaults: Record<HoldingType, number>) =>
  h.expectedReturn ?? (h.valuation === 'interest' && h.interestRate != null ? h.interestRate : defaults[h.type as HoldingType] ?? 0);

/** Expected annual return (%) for a goal: override → value-weighted holdings → planned mix → 8%. */
export function goalExpectedReturn(
  goal: Goal, snap: LedgerSnapshot, holdings: Holding[], defaults: Record<HoldingType, number>,
): { rate: number; source: 'override' | 'holdings' | 'planned' | 'default' } {
  if (goal.expectedReturnOverride != null) return { rate: goal.expectedReturnOverride, source: 'override' };
  const positions = snap.goalByHolding[goal.id] ?? {};
  let total = 0;
  let weighted = 0;
  for (const h of holdings) {
    const v = positions[h.id]?.value ?? 0;
    if (v <= 0) continue;
    total += v;
    weighted += v * holdingExpectedReturn(h, defaults);
  }
  if (total > 0) return { rate: weighted / total, source: 'holdings' };
  const mix = goal.plannedMix;
  if (mix) {
    const entries = Object.entries(mix).filter(([, w]) => (w ?? 0) > 0) as [HoldingType, number][];
    const sum = entries.reduce((s, [, w]) => s + w, 0);
    if (sum > 0) return { rate: entries.reduce((s, [t, w]) => s + w * (defaults[t] ?? 0), 0) / sum, source: 'planned' };
  }
  return { rate: DEFAULT_GOAL_RETURN, source: 'default' };
}

/** Monthly saving capacity assigned to a goal. */
export function goalCapacity(goal: Goal, profile: Profile | null): number {
  if (goal.allocation.kind === 'fixed') return Math.max(0, goal.allocation.value);
  return Math.max(0, ((profile?.monthlySavingCapacity ?? 0) * goal.allocation.value) / 100);
}

const PACE_EXCLUDED = new Set(['opening', 'transfer', 'reassign']);

/** New money saved into a goal within [start, end]. */
export function goalSavedBetween(goalId: string | null, txs: Transaction[], start: ISODate, end: ISODate): number {
  return txs
    .filter((t) => t.goalId === goalId && t.kind === 'contribution' && !PACE_EXCLUDED.has(t.reason) && t.date >= start && t.date <= end)
    .reduce((s, t) => s + t.amount, 0);
}

/**
 * Average monthly saving over the last (up to) 3 periods. Includes the current period only if
 * something was already saved in it. Only counts periods since the goal's first saving.
 */
export function goalPace(goalId: string, txs: Transaction[], today: Date, freq: 'weekly' | 'monthly', weekStart = 1): { monthly: number; periods: number } {
  const saving = txs.filter((t) => t.goalId === goalId && t.kind === 'contribution' && !PACE_EXCLUDED.has(t.reason));
  if (!saving.length) return { monthly: 0, periods: 0 };
  const first = saving.reduce((m, t) => (t.date < m ? t.date : m), saving[0].date);
  const cur = periodFor(today, freq, weekStart);
  const curSaved = goalSavedBetween(goalId, txs, cur.start, cur.end);
  const periods = lastPeriods(today, freq, 4, weekStart);
  const avg = (list: typeof periods) => {
    const w = list.filter((p) => p.end >= first);
    if (!w.length) return null;
    return { monthly: (w.reduce((s, p) => s + goalSavedBetween(goalId, txs, p.start, p.end), 0) / w.length) * periodsPerMonth(freq), periods: w.length };
  };
  // Last 3 completed periods; the unfinished current period only counts when it helps,
  // so logging a saving never makes the status look worse.
  const completed = avg(periods.slice(0, 3));
  const withCurrent = curSaved > 0 ? avg(periods.slice(1)) : null;
  const best = [completed, withCurrent].filter((x): x is { monthly: number; periods: number } => !!x).sort((a, b) => b.monthly - a.monthly)[0];
  return best ?? { monthly: 0, periods: 0 };
}

export interface GoalFix { kind: 'save_more' | 'move_date' | 'lower_target'; amount?: number; date?: ISODate; items?: { name: string; cost: number }[] }

export interface GoalMetrics {
  goalId: string;
  target: number;
  targetToday: number;
  currentValue: number;
  invested: number;
  gain: number;
  progress: number;
  monthsLeft: number;
  dueNow: boolean;
  expectedReturn: number;
  returnSource: 'override' | 'holdings' | 'planned' | 'default';
  requiredFlat: number;
  requiredStepUp: number;
  stepUpSchedule: StepUpYear[];
  flatSchedule: StepUpYear[];
  /** required for the goal's chosen plan type */
  required: number;
  capacity: number;
  pace: number;
  pacePeriods: number;
  health: GoalHealth;
  /** pace used for projections: actual pace, or capacity when there's no history yet */
  projectionPace: number;
  projectionBasis: 'pace' | 'capacity';
  projectedAtDeadline: number;
  projectedCompletion: ISODate | null;
  shortfallAtDeadline: number;
  fixes: GoalFix[];
  /** extra required per month for each month of delay (zero-income messaging) */
  waitCostPerMonth: number;
}

export function computeGoalMetrics(
  goal: Goal, snap: LedgerSnapshot, holdings: Holding[], txs: Transaction[], profile: Profile | null, today: Date,
): GoalMetrics {
  // user-created holding types carry their own growth rate
  const defaults = returnsWithCustom(profile?.defaultReturns ?? ({} as Record<HoldingType, number>), profile?.categories) as Record<HoldingType, number>;
  const target = goalTarget(goal, today);
  const targetToday = goalTargetToday(goal, today);
  const currentValue = snap.goalValue[goal.id] ?? 0;
  const invested = snap.goalInvested[goal.id] ?? 0;
  const raw = rawMonthsBetween(today, goal.savingEndDate);
  const monthsLeft = Math.max(1, raw);
  const { rate, source } = goalExpectedReturn(goal, snap, holdings, defaults);
  const flat = requiredFlat(target, currentValue, rate, monthsLeft);
  const step = requiredStepUp(target, currentValue, rate, monthsLeft, goal.stepUpRate, today.getFullYear(), today.getMonth());
  const flatSchedule = requiredStepUp(target, currentValue, rate, monthsLeft, 0, today.getFullYear(), today.getMonth()).schedule;
  const required = goal.planType === 'stepup' ? step.firstMonthly : flat;
  const capacity = goalCapacity(goal, profile);
  const { monthly: pace, periods: pacePeriods } = goalPace(goal.id, txs, today, profile?.checkInFrequency ?? 'monthly', profile?.checkInDay ?? 1);

  const projectionBasis = pacePeriods > 0 ? 'pace' : 'capacity';
  const projectionPace = projectionBasis === 'pace' ? pace : capacity;
  const projectedAtDeadline = projectValue(currentValue, projectionPace, rate, monthsLeft);
  const toReach = monthsToReach(target, currentValue, projectionPace, rate);
  const projectedCompletion = toReach == null ? null : toISO(addMonths(today, toReach));

  let health: GoalHealth;
  if (goal.status === 'completed') health = 'completed';
  else if (goal.status === 'paused') health = 'paused';
  else if (target > 0 && currentValue >= target) health = 'reached';
  else if (pacePeriods === 0 && required > 0) health = 'new';
  else if (projectedAtDeadline >= target * 1.1) health = 'ahead';
  else if (required <= 0 || pace >= required) health = 'on_track';
  else if (pace >= required * 0.8) health = 'slightly_behind';
  else health = 'behind';

  const fixes: GoalFix[] = [];
  if (required > capacity + 0.5 && health !== 'reached' && health !== 'completed') {
    fixes.push({ kind: 'save_more', amount: required - capacity });
    if (capacity > 0) {
      // only suggest a later date within 25 years of the current one
      for (let n = monthsLeft + 1; n <= monthsLeft + 300; n++) {
        const t = goalTarget(goal, today, n - monthsLeft);
        if (projectValue(currentValue, capacity, rate, n) >= t) {
          fixes.push({ kind: 'move_date', date: toISO(addMonths(today, n)) });
          break;
        }
      }
    }
    const reachable = projectValue(currentValue, capacity, rate, monthsLeft);
    const items = goal.mode === 'planner' && goal.planner
      ? biggestItems(goal.planner, summarizePlanner(goal.planner, Math.max(0, rawMonthsBetween(today, goal.planner.spendStartDate))).multiplier)
      : undefined;
    fixes.push({ kind: 'lower_target', amount: Math.max(0, target - reachable), items });
  }

  const waitCostPerMonth = monthsLeft > 1
    ? Math.max(0, requiredFlat(target, currentValue, rate, monthsLeft - 1) - requiredFlat(target, currentValue, rate, monthsLeft))
    : 0;

  return {
    goalId: goal.id, target, targetToday, currentValue, invested, gain: currentValue - invested,
    progress: target > 0 ? Math.min(1, currentValue / target) : 0,
    monthsLeft, dueNow: raw <= 0, expectedReturn: rate, returnSource: source,
    requiredFlat: flat, requiredStepUp: step.firstMonthly, stepUpSchedule: step.schedule, flatSchedule,
    required, capacity, pace, pacePeriods, health, projectionPace, projectionBasis, projectedAtDeadline,
    projectedCompletion, shortfallAtDeadline: Math.max(0, target - projectedAtDeadline), fixes, waitCostPerMonth,
  };
}

/** Required-path series: balance needed at each month to stay on plan (for charts). */
export function requiredPath(startValue: number, monthly: number, annualPct: number, months: number, stepUpPct = 0, startMonthIndex = 0): number[] {
  const out: number[] = [startValue];
  let bal = startValue;
  const r = annualPct / 100 / 12;
  for (let j = 0; j < months; j++) {
    const y = Math.floor((startMonthIndex + j) / 12);
    bal = bal * (1 + r) + monthly * Math.pow(1 + stepUpPct / 100, y);
    out.push(bal);
  }
  return out;
}

/** Income profile helpers */
export const avgIncome = (p: Pick<Profile, 'incomeMin' | 'incomeMax'>) => (p.incomeMin + Math.max(p.incomeMin, p.incomeMax)) / 2;
export const monthlySurplus = (p: Pick<Profile, 'incomeMin' | 'incomeMax' | 'otherIncome' | 'avgMonthlySpending'>) =>
  avgIncome(p) + p.otherIncome - p.avgMonthlySpending;

/** Runway in months from unassigned savings. null when spending is 0. */
export function runwayMonths(unassignedValue: number, monthlySpending: number): number | null {
  if (monthlySpending <= 0) return null;
  return Math.max(0, unassignedValue) / monthlySpending;
}

/** Sum of allocations across active goals as a % of capacity. */
export function totalAllocationPct(goals: Goal[], profile: Profile | null): number {
  const cap = profile?.monthlySavingCapacity ?? 0;
  const sum = goals.filter((g) => g.status === 'active').reduce((s, g) => s + goalCapacity(g, profile), 0);
  if (cap <= 0) return sum > 0 ? Infinity : 0;
  return (sum / cap) * 100;
}

/** Check-in income for a period */
export const checkInIncome = (c: CheckIn) => c.incomes.reduce((s, i) => s + (i.amount || 0), 0);
