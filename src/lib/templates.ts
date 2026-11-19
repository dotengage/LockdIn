import { addMonths, startOfMonth } from 'date-fns';
import type { Goal, Planner, PlannerItem } from './types';
import { newId, nowStamp } from './ids';
import { toISO } from './finance/dates';
import { GOAL_COLORS } from './finance/constants';

export const fixedItem = (name: string, cost: number, note?: string): PlannerItem => ({ id: newId(), kind: 'fixed', name, cost, note, enabled: true });

export function blankPlanner(spendStartDate: string): Planner {
  return {
    inflationRate: 6, spendStartDate, spendDurationMonths: 0, contingencyRate: 10, afterGoalCushion: 0,
    sections: [{ id: newId(), name: 'Costs', order: 0, collapsed: false, items: [] }],
  };
}

export function baseGoal(partial: Partial<Goal> = {}, index = 0): Goal {
  const end = toISO(startOfMonth(addMonths(new Date(), 24)));
  const now = nowStamp();
  return {
    id: newId(), name: '', icon: '🎯', color: GOAL_COLORS[index % GOAL_COLORS.length],
    mode: 'simple', simpleTarget: { amount: 0, inflationAdjust: false, inflationRate: 6 },
    savingEndDate: end, allocation: { kind: 'percent', value: 0 }, planType: 'flat', stepUpRate: 10,
    priority: 'medium', status: 'active', createdAt: now, updatedAt: now, ...partial,
  };
}
