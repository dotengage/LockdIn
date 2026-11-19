/**
 * Core time-value-of-money helpers. Monthly compounding everywhere: r = annual% / 100 / 12.
 * Contributions are made at the end of each month (ordinary annuity).
 */

export const monthlyRate = (annualPct: number) => annualPct / 100 / 12;

/** Future value of a lump sum after n months. */
export function fvLump(pv: number, annualPct: number, months: number): number {
  return pv * Math.pow(1 + monthlyRate(annualPct), Math.max(0, months));
}

/** Future value of `pmt` paid at the end of each month for n months. */
export function fvAnnuity(pmt: number, annualPct: number, months: number): number {
  const r = monthlyRate(annualPct);
  if (months <= 0) return 0;
  if (r === 0) return pmt * months;
  return pmt * ((Math.pow(1 + r, months) - 1) / r);
}

/** Monthly payment needed so that FV of payments over n months equals `fv`. */
export function pmtForFV(fv: number, annualPct: number, months: number): number {
  const n = Math.max(1, months);
  const r = monthlyRate(annualPct);
  if (fv <= 0) return 0;
  if (r === 0) return fv / n;
  return (fv * r) / (Math.pow(1 + r, n) - 1);
}

/**
 * Required flat monthly saving.
 * gap = target − currentValue grown for monthsLeft. 0 if already covered.
 */
export function requiredFlat(target: number, currentValue: number, annualPct: number, monthsLeft: number): number {
  const n = Math.max(1, monthsLeft);
  const gap = target - fvLump(currentValue, annualPct, n);
  return gap <= 0 ? 0 : pmtForFV(gap, annualPct, n);
}

export interface StepUpYear {
  year: number;
  months: number;
  monthly: number;
  totalSaved: number;
  endBalance: number;
}

/**
 * Step-up plan: the monthly amount rises by `stepUpPct` every January.
 * Month j (0-based) is the j-th month starting from `startMonthIndex` (0=Jan) of `startYear`.
 * The weight of month j = (1+g)^(yearsSinceStart) × (1+r)^(n-1-j); P = gap / Σ weights.
 */
export function requiredStepUp(
  target: number, currentValue: number, annualPct: number, monthsLeft: number,
  stepUpPct: number, startYear: number, startMonthIndex: number,
): { firstMonthly: number; schedule: StepUpYear[] } {
  const n = Math.max(1, monthsLeft);
  const r = monthlyRate(annualPct);
  const g = stepUpPct / 100;
  const gap = target - fvLump(currentValue, annualPct, n);
  const yearOf = (j: number) => Math.floor((startMonthIndex + j) / 12);
  let weight = 0;
  for (let j = 0; j < n; j++) weight += Math.pow(1 + g, yearOf(j)) * Math.pow(1 + r, n - 1 - j);
  const P = gap <= 0 ? 0 : gap / weight;
  return { firstMonthly: P, schedule: stepUpSchedule(P, currentValue, annualPct, n, stepUpPct, startYear, startMonthIndex) };
}

/** Year-by-year schedule for a step-up (or flat when stepUpPct = 0) plan. */
export function stepUpSchedule(
  firstMonthly: number, currentValue: number, annualPct: number, months: number,
  stepUpPct: number, startYear: number, startMonthIndex: number,
): StepUpYear[] {
  const r = monthlyRate(annualPct);
  const g = stepUpPct / 100;
  const rows: StepUpYear[] = [];
  let bal = currentValue;
  for (let j = 0; j < months; j++) {
    const y = Math.floor((startMonthIndex + j) / 12);
    const monthly = firstMonthly * Math.pow(1 + g, y);
    bal = bal * (1 + r) + monthly;
    let row = rows[rows.length - 1];
    if (!row || row.year !== startYear + y) {
      row = { year: startYear + y, months: 0, monthly, totalSaved: 0, endBalance: 0 };
      rows.push(row);
    }
    row.months += 1;
    row.totalSaved += monthly;
    row.endBalance = bal;
  }
  return rows;
}

/**
 * Months needed to reach `target` from `currentValue` saving `pmt` per month.
 * Returns null when not reachable within `maxMonths`.
 */
export function monthsToReach(target: number, currentValue: number, pmt: number, annualPct: number, maxMonths = 1200): number | null {
  if (currentValue >= target) return 0;
  const r = monthlyRate(annualPct);
  if (pmt <= 0 && (r <= 0 || currentValue <= 0)) return null;
  let bal = currentValue;
  for (let m = 1; m <= maxMonths; m++) {
    bal = bal * (1 + r) + pmt;
    if (bal >= target - 0.5) return m;
  }
  return null;
}

/** Projected value after n months saving pmt monthly. */
export function projectValue(currentValue: number, pmt: number, annualPct: number, months: number): number {
  return fvLump(currentValue, annualPct, months) + fvAnnuity(pmt, annualPct, months);
}
