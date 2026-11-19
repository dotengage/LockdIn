import type { Planner, PlannerItem, PlannerSection } from '../types';

/** Inflation is only asked for and applied when the goal is more than 12 months away. */
export const inflationApplies = (months: number) => months > 12;

/** Inflation multiplier for one-time spending `months` from now. */
export function inflationFactor(inflationPct: number, months: number): number {
  return Math.pow(1 + inflationPct / 100, Math.max(0, months) / 12);
}

/**
 * Multiplier for spending spread over `durationMonths` starting `startMonths` from now.
 * The duration is split into yearly chunks (the last may be partial); each chunk is inflated to
 * its own start and weighted by its share of the total duration.
 * e.g. 60 months + 24 months at 6% → ((1.06)^5 + (1.06)^6) / 2 ≈ 1.3784
 */
export function spreadInflationFactor(inflationPct: number, startMonths: number, durationMonths: number): number {
  if (durationMonths <= 0) return inflationFactor(inflationPct, startMonths);
  let total = 0;
  for (let offset = 0; offset < durationMonths; offset += 12) {
    const len = Math.min(12, durationMonths - offset);
    total += (len / durationMonths) * inflationFactor(inflationPct, startMonths + offset);
  }
  return total;
}

export const rateItemPerUnit = (item: Extract<PlannerItem, { kind: 'rate' }>) =>
  item.rates.reduce((s, r) => s + (r.amount || 0), 0);

/** Cost of a non-percent item (0 when disabled). */
function baseItemCost(item: PlannerItem): number {
  if (!item.enabled) return 0;
  if (item.kind === 'fixed') return item.cost || 0;
  if (item.kind === 'rate') return (item.quantity || 0) * rateItemPerUnit(item);
  return 0;
}

/** Sum of fixed + rate items of a section (percent items excluded, to avoid circular references). */
export const sectionBaseTotal = (s: PlannerSection) => s.items.reduce((sum, i) => sum + baseItemCost(i), 0);

/** Cost of any item, resolving percent items against base totals of referenced sections. */
export function itemCost(item: PlannerItem, sections: PlannerSection[]): number {
  if (item.kind !== 'percent') return baseItemCost(item);
  if (!item.enabled) return 0;
  const base = sections
    .filter((s) => item.ofSectionIds.includes(s.id))
    .reduce((sum, s) => sum + sectionBaseTotal(s), 0);
  return (base * (item.percent || 0)) / 100;
}

export const sectionTotal = (s: PlannerSection, all: PlannerSection[]) =>
  s.items.reduce((sum, i) => sum + itemCost(i, all), 0);

export interface PlannerSummary {
  sectionTotals: { id: string; name: string; total: number }[];
  subtotal: number;
  contingency: number;
  totalToday: number;
  multiplier: number;
  totalAtGoal: number;
  cushionToday: number;
  cushionAtGoal: number;
  finalTarget: number;
  perMonth: number | null;
  perDay: number | null;
  /** days of rate items with unit "day(s)" vs duration, for validation hints */
  rateDays: number;
}

/**
 * Full planner calculation.
 * `monthsToStart` = whole months from today until spending starts.
 */
export function summarizePlanner(p: Planner, monthsToStart: number): PlannerSummary {
  const sections = [...p.sections].sort((a, b) => a.order - b.order);
  const sectionTotals = sections.map((s) => ({ id: s.id, name: s.name, total: sectionTotal(s, sections) }));
  const subtotal = sectionTotals.reduce((s, x) => s + x.total, 0);
  const contingency = (subtotal * (p.contingencyRate || 0)) / 100;
  const totalToday = subtotal + contingency;
  // inflation only matters for goals more than a year away
  const inflation = inflationApplies(monthsToStart + Math.max(0, p.spendDurationMonths)) ? p.inflationRate : 0;
  const multiplier = spreadInflationFactor(inflation, monthsToStart, p.spendDurationMonths);
  const totalAtGoal = totalToday * multiplier;
  const cushionToday = p.afterGoalCushion || 0;
  const cushionAtGoal = cushionToday * inflationFactor(inflation, monthsToStart + Math.max(0, p.spendDurationMonths));
  const finalTarget = totalAtGoal + cushionAtGoal;
  const d = p.spendDurationMonths;
  const rateDays = sections
    .flatMap((s) => s.items)
    .filter((i): i is Extract<PlannerItem, { kind: 'rate' }> => i.kind === 'rate' && i.enabled && /^day/i.test(i.unit.trim()))
    .reduce((s, i) => s + i.quantity, 0);
  return {
    sectionTotals, subtotal, contingency, totalToday, multiplier, totalAtGoal,
    cushionToday, cushionAtGoal, finalTarget,
    perMonth: d > 0 ? totalAtGoal / d : null,
    perDay: d > 0 ? totalAtGoal / (d * (365.25 / 12)) : null,
    rateDays,
  };
}

/** Biggest enabled items (today's cost, inflated by `multiplier`), for "switch off items like…" suggestions. */
export function biggestItems(p: Planner, multiplier: number, limit = 3) {
  const sections = p.sections;
  return sections
    .flatMap((s) => s.items.map((i) => ({ section: s.name, name: i.name, cost: itemCost(i, sections) * (1 + p.contingencyRate / 100) * multiplier })))
    .filter((x) => x.cost > 0)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, limit);
}
