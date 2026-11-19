import type { HoldingType, ValuationMethod } from '../types';

export const HOLDING_TYPES: HoldingType[] = [
  'bank', 'mutual_fund', 'etf', 'gold', 'silver', 'cash', 'fd', 'rd', 'ppf_epf', 'stocks', 'bonds', 'crypto', 'other',
];

export const HOLDING_LABEL: Record<HoldingType, string> = {
  bank: 'Bank savings', fd: 'Fixed deposit', rd: 'Recurring deposit', cash: 'Cash', stocks: 'Stocks',
  mutual_fund: 'SIP', bonds: 'Bonds', gold: 'Gold', silver: 'Silver', crypto: 'Crypto',
  ppf_epf: 'PPF / EPF', etf: 'ETF', other: 'Other',
};

export const DEFAULT_VALUATION: Record<HoldingType, ValuationMethod> = {
  bank: 'interest', fd: 'interest', rd: 'interest', ppf_epf: 'interest', cash: 'cash',
  stocks: 'market', mutual_fund: 'market', etf: 'market', bonds: 'market', crypto: 'market', other: 'market',
  gold: 'quantity', silver: 'quantity',
};

export const VALUATION_LABEL: Record<ValuationMethod, string> = {
  interest: 'Grows with interest', market: 'Market value (you update)', quantity: 'Grams × price', cash: 'Fixed (cash)',
};

export const DEFAULT_RETURNS: Record<HoldingType, number> = {
  bank: 3, fd: 7, rd: 6.5, ppf_epf: 7.1, bonds: 7.5, mutual_fund: 11, stocks: 12,
  gold: 8, silver: 7, crypto: 0, cash: 0, etf: 11, other: 6,
};

export const HOLDING_COLOR: Record<HoldingType, string> = {
  bank: '#0a84ff', fd: '#30b0c7', rd: '#64d2ff', ppf_epf: '#00c7be', mutual_fund: '#34c759', stocks: '#a3e635',
  bonds: '#8e8e93', gold: '#ffcc00', silver: '#aeaeb2', crypto: '#ff9f0a', cash: '#ff6482', etf: '#5ac8fa', other: '#a2845e',
};

export const GOAL_COLORS = [
  '#34c759', '#0a84ff', '#ff9f0a', '#30b0c7', '#ff375f',
  '#ffcc00', '#00c7be', '#ff453a', '#a2845e', '#8e8e93',
];

/** Old (v1) palette → new palette, so existing goals lose the purples. */
export const LEGACY_GOAL_COLOR: Record<string, string> = {
  '#6366f1': '#34c759', '#0ea5e9': '#0a84ff', '#14b8a6': '#00c7be', '#22c55e': '#34c759', '#eab308': '#ffcc00',
  '#f97316': '#ff9f0a', '#ef4444': '#ff453a', '#ec4899': '#ff375f', '#a855f7': '#30b0c7', '#64748b': '#8e8e93',
};

export const GOAL_ICONS = ['🎯', '✈️', '🏍️', '🚗', '🏠', '🛟', '🎓', '💍', '💻', '📱', '🏖️', '🌍', '👶', '🏥', '📈', '🎸', '🐶', '🎁'];

export const DEFAULT_GOAL_RETURN = 8;
export const DEFAULT_INFLATION = 6;
