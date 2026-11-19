import { useMemo } from 'react';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { useStore } from './useStore';
import { ledgerSnapshot, UNASSIGNED, type LedgerSnapshot } from '@/lib/finance/ledger';
import { computeGoalMetrics, runwayMonths, totalAllocationPct, type GoalMetrics } from '@/lib/finance/goals';
import { periodFor, previousPeriod, toISO, type Period } from '@/lib/finance/dates';
import type { Goal } from '@/lib/types';
import { BACKUP_REMINDER_DAYS } from '@/config';

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

export function sortGoals(goals: Goal[]): Goal[] {
  return [...goals].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.savingEndDate.localeCompare(b.savingEndDate));
}

export interface Derived {
  today: Date;
  todayISO: string;
  snap: LedgerSnapshot;
  metrics: Record<string, GoalMetrics>;
  activeGoals: Goal[];
  unassignedValue: number;
  goalsValue: number;
  runway: number | null;
  allocationPct: number;
  totalRequired: number;
  currentPeriod: Period;
  checkInDone: boolean;
  missedPeriods: Period[];
  valuationDue: boolean;
  backupDue: boolean;
  hasMarketHoldings: boolean;
}

/** All derived numbers, recomputed whenever any underlying data changes. */
export function useDerived(): Derived {
  const profile = useStore((s) => s.profile);
  const goals = useStore((s) => s.goals);
  const holdings = useStore((s) => s.holdings);
  const transactions = useStore((s) => s.transactions);
  const valuations = useStore((s) => s.valuations);
  const checkIns = useStore((s) => s.checkIns);
  const meta = useStore((s) => s.meta);

  const todayISO = toISO(new Date());

  return useMemo(() => {
    const today = parseISO(todayISO);
    const snap = ledgerSnapshot(holdings, transactions, valuations, todayISO);
    const metrics: Record<string, GoalMetrics> = {};
    for (const g of goals) metrics[g.id] = computeGoalMetrics(g, snap, holdings, transactions, profile, today);
    const activeGoals = sortGoals(goals.filter((g) => g.status === 'active'));
    const unassignedValue = snap.goalValue[UNASSIGNED] ?? 0;
    const goalsValue = goals.reduce((s, g) => s + (snap.goalValue[g.id] ?? 0), 0);

    const freq = profile?.checkInFrequency ?? 'monthly';
    const weekStart = freq === 'weekly' ? profile?.checkInDay ?? 1 : 1;
    const currentPeriod = periodFor(today, freq, weekStart);
    const done = new Set(checkIns.map((c) => c.periodStart));
    const skipped = new Set(meta.skippedPeriods);
    const checkInDone = done.has(currentPeriod.start);
    const missedPeriods: Period[] = [];
    if (profile) {
      const since = profile.createdAt.slice(0, 10);
      let p = previousPeriod(currentPeriod, freq, weekStart);
      for (let i = 0; i < 12 && p.end >= since; i++) {
        if (!done.has(p.start) && !skipped.has(p.start)) missedPeriods.unshift(p);
        p = previousPeriod(p, freq, weekStart);
      }
    }

    const priceHoldings = holdings.filter((h) => !h.archived && (h.valuation === 'market' || h.valuation === 'quantity'));
    const hasMarketHoldings = priceHoldings.some((h) => (snap.holdings[h.id]?.netFlows ?? 0) > 0);
    const intervalDays = profile?.valuationFrequency === 'monthly' ? 30 : profile?.valuationFrequency === 'fortnightly' ? 14 : 7;
    const lastVal = meta.lastValuationAt ? parseISO(meta.lastValuationAt) : null;
    const snoozed = meta.valuationSnoozedUntil && meta.valuationSnoozedUntil > new Date().toISOString();
    const valuationDue = hasMarketHoldings && !snoozed && (!lastVal || differenceInCalendarDays(today, lastVal) >= intervalDays);

    const hasData = goals.length > 0 || transactions.length > 0;
    const backupDue = hasData && (!profile?.lastBackupAt || differenceInCalendarDays(today, parseISO(profile.lastBackupAt)) > BACKUP_REMINDER_DAYS)
      && (!profile?.createdAt || differenceInCalendarDays(today, parseISO(profile.createdAt)) > 7);

    return {
      today, todayISO, snap, metrics, activeGoals, unassignedValue, goalsValue,
      runway: runwayMonths(unassignedValue, profile?.avgMonthlySpending ?? 0),
      allocationPct: totalAllocationPct(goals, profile),
      totalRequired: activeGoals.reduce((s, g) => s + metrics[g.id].required, 0),
      currentPeriod, checkInDone, missedPeriods, valuationDue, backupDue, hasMarketHoldings,
    };
  }, [profile, goals, holdings, transactions, valuations, checkIns, meta, todayISO]);
}
