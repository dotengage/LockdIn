import type { Categories, CustomHoldingType, HoldingType, HoldingTypeId, Transaction, TxReason, ValuationMethod } from './types';
import { DEFAULT_RETURNS, DEFAULT_VALUATION, HOLDING_COLOR, HOLDING_LABEL, HOLDING_TYPES } from './finance/constants';

/** Built-in types hidden by default (users can add them back with +). */
export const DEFAULT_HIDDEN_TYPES: HoldingType[] = ['fd', 'rd', 'ppf_epf', 'stocks', 'bonds', 'crypto', 'other'];

export const DEFAULT_CATEGORIES: Categories = {
  incomeSources: ['Salary', 'Freelance', 'Business', 'Family support', 'Stipend', 'Interest & dividends', 'Bonus'],
  withdrawReasons: ['Spent on the goal', 'Tax', 'Fees & charges', 'Emergency expense'],
  holdingTypes: [],
  hiddenHoldingTypes: [...DEFAULT_HIDDEN_TYPES],
};

export const withCategoryDefaults = (c?: Partial<Categories>): Categories => ({
  incomeSources: c?.incomeSources ?? [...DEFAULT_CATEGORIES.incomeSources],
  withdrawReasons: c?.withdrawReasons ?? [...DEFAULT_CATEGORIES.withdrawReasons],
  holdingTypes: c?.holdingTypes ?? [],
  hiddenHoldingTypes: c?.hiddenHoldingTypes ?? [...DEFAULT_HIDDEN_TYPES],
});

/** v2 → v3: trim visible types to the new defaults (keeping any in use), add ETF growth, default to light. */
export function upgradeProfileV3<P extends { categories: Categories; defaultReturns: Record<HoldingType, number>; theme: 'light' | 'dark' | 'system' }>(p: P, usedTypes: string[]): P {
  const used = new Set(usedTypes);
  const cats = p.categories;
  const hidden = cats.hiddenHoldingTypes.length ? cats.hiddenHoldingTypes : DEFAULT_HIDDEN_TYPES.filter((t) => !used.has(t));
  return {
    ...p,
    categories: { ...cats, hiddenHoldingTypes: hidden },
    defaultReturns: { ...DEFAULT_RETURNS, ...p.defaultReturns },
    theme: p.theme === 'system' ? 'light' : p.theme,
  };
}

/** Default growth per type, including the user's own types. */
export const returnsWithCustom = (defaults: Record<HoldingType, number>, cats?: Categories): Record<string, number> =>
  ({ ...defaults, ...Object.fromEntries((cats?.holdingTypes ?? []).map((t) => [t.id, t.expectedReturn])) });

export interface TypeInfo { id: HoldingTypeId; label: string; color: string; valuation: ValuationMethod; defaultReturn: number; custom: boolean }

const isBuiltIn = (t: string): t is HoldingType => (HOLDING_TYPES as string[]).includes(t);

/** Label, colour and valuation for any holding type, built-in or user-created. */
export function typeInfo(type: HoldingTypeId, cats?: Categories, defaults: Record<HoldingType, number> = DEFAULT_RETURNS): TypeInfo {
  if (isBuiltIn(type)) return { id: type, label: HOLDING_LABEL[type], color: HOLDING_COLOR[type], valuation: DEFAULT_VALUATION[type], defaultReturn: defaults[type] ?? 0, custom: false };
  const c = cats?.holdingTypes.find((x) => x.id === type);
  return { id: type, label: c?.label ?? 'Other', color: c?.color ?? HOLDING_COLOR.other, valuation: c?.valuation ?? 'market', defaultReturn: c?.expectedReturn ?? 0, custom: true };
}

/** Types offered in pickers: visible built-ins + custom ones. */
export function visibleTypes(cats?: Categories, defaults?: Record<HoldingType, number>): TypeInfo[] {
  const hidden = new Set(cats?.hiddenHoldingTypes ?? DEFAULT_HIDDEN_TYPES);
  return [
    ...HOLDING_TYPES.filter((t) => !hidden.has(t)).map((t) => typeInfo(t, cats, defaults)),
    ...(cats?.holdingTypes ?? []).map((c) => typeInfo(c.id, cats)),
  ];
}

const CUSTOM_COLORS = ['#5ac8fa', '#ffd60a', '#ff9f0a', '#30d158', '#ff375f', '#64d2ff', '#ac8e68'];
export function newCustomType(label: string, existing: CustomHoldingType[], valuation: ValuationMethod = 'market', expectedReturn = 6): CustomHoldingType {
  const id = `c_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 20)}_${Date.now().toString(36)}` as const;
  return { id, label, valuation, expectedReturn, color: CUSTOM_COLORS[existing.length % CUSTOM_COLORS.length] };
}

/** Map a withdrawal reason name to the built-in reason (used by maths/reports), keeping the user's label. */
export function reasonFromLabel(label: string): { reason: TxReason; reasonLabel?: string } {
  const l = label.toLowerCase();
  if (/goal|trip|purchase|bought/.test(l)) return { reason: 'goal_spend', reasonLabel: label };
  if (/tax|tds|gst/.test(l)) return { reason: 'tax', reasonLabel: label };
  if (/fee|charge|commission/.test(l)) return { reason: 'fee', reasonLabel: label };
  if (/expense|emergency|bill|medical/.test(l)) return { reason: 'expense', reasonLabel: label };
  return { reason: 'other', reasonLabel: label };
}

const BUILTIN_REASON_LABEL: Record<TxReason, string> = {
  saving: 'Saving', opening: 'Already saved', transfer: 'Moved between holdings', reassign: 'Moved between goals',
  goal_spend: 'Spent on the goal', tax: 'Tax', fee: 'Fees & charges', expense: 'Expense', other: 'Other',
};
export const txReasonLabel = (t: Pick<Transaction, 'reason' | 'reasonLabel'>) => t.reasonLabel ?? BUILTIN_REASON_LABEL[t.reason];
