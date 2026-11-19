import type { Holding, ID, ISODate, Transaction, Valuation } from '../types';
import { fractionalMonths } from './dates';

/**
 * Holding ledger with unit-based ownership.
 *
 * Every contribution "buys" units of the holding at its current value-per-unit (NAV), exactly like a
 * mutual fund. Each goal (or the unassigned bucket) owns units, so money added before a rally gets the
 * gains of that rally, and withdrawals are taken at market value. When no valuation has ever been
 * recorded this reduces to plain proportional-by-contribution ownership.
 */

export const UNASSIGNED = '__unassigned__';
const keyOf = (goalId: ID | null) => goalId ?? UNASSIGNED;

export interface OwnerPosition {
  units: number;
  /** cost basis (reduced proportionally on withdrawals) */
  invested: number;
  value: number;
  grams: number;
}

export interface HoldingState {
  holdingId: ID;
  value: number;
  invested: number;
  totalUnits: number;
  nav: number;
  grams: number;
  owners: Record<string, OwnerPosition>;
  /** sum of contributions − withdrawals at face value */
  netFlows: number;
  lastValuation?: Valuation;
  hasValuation: boolean;
}

interface Flow { date: ISODate; amount: number }

/**
 * Value of a holding at `asOf`, given the most recent valuation strictly anchored at or before a point,
 * plus flows since that anchor. Interest-based holdings grow with monthly compounding (fractional months).
 */
function valueFrom(
  holding: Holding, anchor: Valuation | undefined, flowsAfterAnchor: Flow[], asOf: ISODate,
): number {
  const rate = holding.valuation === 'interest' ? (holding.interestRate ?? 0) : 0;
  const grow = (from: ISODate) => (rate ? Math.pow(1 + rate / 100 / 12, fractionalMonths(from, asOf)) : 1);
  let v = anchor ? anchor.value * grow(anchor.date) : 0;
  for (const f of flowsAfterAnchor) v += f.amount * grow(f.date);
  return v;
}

/**
 * Compute a holding's state as of `asOf` (inclusive).
 * Same-day ordering: transactions are applied before valuations (a valuation is an end-of-day value).
 */
export function holdingState(
  holding: Holding, allTx: Transaction[], allVals: Valuation[], asOf: ISODate,
): HoldingState {
  const txs = allTx
    .filter((t) => t.holdingId === holding.id && t.date <= asOf)
    .sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)));
  const vals = holding.valuation === 'cash'
    ? []
    : allVals
      .filter((v) => v.holdingId === holding.id && v.date <= asOf)
      .sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : a.date.localeCompare(b.date)));

  const owners: Record<string, OwnerPosition> = {};
  let totalUnits = 0;
  let anchor: Valuation | undefined;
  let flows: Flow[] = [];
  let netFlows = 0;
  let grams = 0;
  let vi = 0;

  const advanceValuationsBefore = (date: ISODate, inclusive: boolean) => {
    while (vi < vals.length && (inclusive ? vals[vi].date <= date : vals[vi].date < date)) {
      anchor = vals[vi];
      flows = flows.filter((f) => f.date > anchor!.date);
      vi++;
    }
  };

  for (const t of txs) {
    advanceValuationsBefore(t.date, false);
    const before = valueFrom(holding, anchor, flows, t.date);
    let nav = totalUnits > 0 && before > 0 ? before / totalUnits : 1;
    if (totalUnits > 0 && before <= 0) {
      // existing units are worthless; reset
      for (const k of Object.keys(owners)) owners[k].units = 0;
      totalUnits = 0;
      nav = 1;
    }
    const k = keyOf(t.goalId);
    const pos = (owners[k] ??= { units: 0, invested: 0, value: 0, grams: 0 });
    if (t.kind === 'contribution') {
      const u = t.amount / nav;
      pos.units += u;
      pos.invested += t.amount;
      pos.grams += t.quantityGrams ?? 0;
      totalUnits += u;
      flows.push({ date: t.date, amount: t.amount });
      netFlows += t.amount;
      grams += t.quantityGrams ?? 0;
    } else {
      const want = t.amount / nav;
      const u = Math.min(want, pos.units);
      const frac = pos.units > 0 ? u / pos.units : 0;
      pos.invested -= pos.invested * frac;
      const g = t.quantityGrams ?? pos.grams * frac;
      pos.grams = Math.max(0, pos.grams - g);
      grams = Math.max(0, grams - g);
      pos.units -= u;
      totalUnits -= u;
      flows.push({ date: t.date, amount: -t.amount });
      netFlows -= t.amount;
    }
  }
  advanceValuationsBefore(asOf, true);

  const hasValuation = !!anchor;
  let value = valueFrom(holding, anchor, flows, asOf);
  if (holding.valuation === 'cash') value = netFlows;
  value = Math.max(0, value);
  const nav = totalUnits > 1e-9 ? value / totalUnits : 1;
  let invested = 0;
  for (const p of Object.values(owners)) {
    p.value = p.units * nav;
    invested += p.invested;
  }
  return {
    holdingId: holding.id, value, invested, totalUnits, nav, grams, owners, netFlows, lastValuation: anchor, hasValuation,
  };
}

export interface LedgerSnapshot {
  holdings: Record<ID, HoldingState>;
  goalValue: Record<string, number>;
  goalInvested: Record<string, number>;
  /** goalId → holdingId → position */
  goalByHolding: Record<string, Record<ID, OwnerPosition>>;
  totalValue: number;
  totalInvested: number;
}

export function ledgerSnapshot(
  holdings: Holding[], txs: Transaction[], vals: Valuation[], asOf: ISODate,
): LedgerSnapshot {
  const snap: LedgerSnapshot = { holdings: {}, goalValue: {}, goalInvested: {}, goalByHolding: {}, totalValue: 0, totalInvested: 0 };
  for (const h of holdings) {
    const st = holdingState(h, txs, vals, asOf);
    snap.holdings[h.id] = st;
    snap.totalValue += st.value;
    snap.totalInvested += st.invested;
    for (const [k, pos] of Object.entries(st.owners)) {
      snap.goalValue[k] = (snap.goalValue[k] ?? 0) + pos.value;
      snap.goalInvested[k] = (snap.goalInvested[k] ?? 0) + pos.invested;
      (snap.goalByHolding[k] ??= {})[h.id] = pos;
    }
  }
  return snap;
}
