export type ID = string;
/** 'YYYY-MM-DD' */
export type ISODate = string;

export type HoldingType =
  | 'bank' | 'fd' | 'rd' | 'cash' | 'stocks' | 'mutual_fund' | 'bonds'
  | 'gold' | 'silver' | 'crypto' | 'ppf_epf' | 'etf' | 'other';

export type ValuationMethod = 'interest' | 'market' | 'quantity' | 'cash';

/** Built-in type or a user-created one ("c_…") */
export type HoldingTypeId = HoldingType | `c_${string}`;

export interface CustomHoldingType {
  id: `c_${string}`;
  label: string;
  valuation: ValuationMethod;
  /** % per year */
  expectedReturn: number;
  color: string;
}

/** User-editable lists. Everything here can be added to or removed by the user. */
export interface Categories {
  incomeSources: string[];
  withdrawReasons: string[];
  holdingTypes: CustomHoldingType[];
  hiddenHoldingTypes: HoldingType[];
}

export type EmploymentStatus = 'salaried' | 'self_employed' | 'business' | 'student' | 'unemployed' | 'other';

export interface Profile {
  name?: string;
  dateOfBirth?: ISODate;
  employmentStatus: EmploymentStatus;
  incomeMin: number;
  incomeMax: number;
  otherIncome: number;
  avgMonthlySpending: number;
  monthlySavingCapacity: number;
  checkInFrequency: 'weekly' | 'monthly';
  valuationFrequency: 'weekly' | 'fortnightly' | 'monthly';
  /** 0-6 weekday (week start) for weekly, 1-28 day of month for monthly */
  checkInDay: number;
  defaultReturns: Record<HoldingType, number>;
  theme: 'light' | 'dark' | 'system';
  shortNumbers: boolean;
  categories: Categories;
  lastBackupAt?: string;
  onboarded: boolean;
  createdAt: string;
}

export interface RateEntry { label: string; amount: number }

export type PlannerItem =
  | { id: ID; kind: 'fixed'; name: string; cost: number; note?: string; enabled: boolean }
  | { id: ID; kind: 'rate'; name: string; quantity: number; unit: string; rates: RateEntry[]; note?: string; enabled: boolean }
  | { id: ID; kind: 'percent'; name: string; percent: number; ofSectionIds: ID[]; note?: string; enabled: boolean };

export interface PlannerSection { id: ID; name: string; order: number; collapsed: boolean; items: PlannerItem[] }

export interface Planner {
  /** % per year, e.g. 6 */
  inflationRate: number;
  spendStartDate: ISODate;
  spendDurationMonths: number;
  /** % e.g. 10 */
  contingencyRate: number;
  afterGoalCushion: number;
  sections: PlannerSection[];
}

export interface SimpleTarget {
  amount: number;
  inflationAdjust: boolean;
  todayCost?: number;
  inflationRate?: number;
}

export type GoalStatus = 'active' | 'paused' | 'completed' | 'archived';
export type Priority = 'high' | 'medium' | 'low';

export interface Goal {
  id: ID;
  name: string;
  icon: string;
  color: string;
  description?: string;
  mode: 'simple' | 'planner';
  simpleTarget?: SimpleTarget;
  planner?: Planner;
  /** month the saving ends, stored as YYYY-MM-01 */
  savingEndDate: ISODate;
  allocation: { kind: 'fixed' | 'percent'; value: number };
  /** % per year */
  expectedReturnOverride?: number;
  plannedMix?: Partial<Record<HoldingType, number>>;
  planType: 'flat' | 'stepup';
  /** % increase applied every January */
  stepUpRate: number;
  priority: Priority;
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Holding {
  id: ID;
  name: string;
  type: HoldingTypeId;
  platform?: string;
  notes?: string;
  valuation: ValuationMethod;
  /** % per year, for interest-based holdings */
  interestRate?: number;
  /** % per year override for projections */
  expectedReturn?: number;
  archived: boolean;
  createdAt: string;
}

export type TxReason = 'saving' | 'opening' | 'transfer' | 'reassign' | 'goal_spend' | 'tax' | 'fee' | 'expense' | 'other';

export interface Transaction {
  id: ID;
  date: ISODate;
  kind: 'contribution' | 'withdrawal';
  holdingId: ID;
  /** null = unassigned */
  goalId: ID | null;
  amount: number;
  quantityGrams?: number;
  reason: TxReason;
  /** user's own reason name (for custom withdrawal reasons) */
  reasonLabel?: string;
  transferId?: ID;
  checkInId?: ID;
  note?: string;
  createdAt: string;
}

export interface Valuation {
  id: ID;
  holdingId: ID;
  date: ISODate;
  value: number;
  pricePerGram?: number;
  createdAt: string;
}

export interface IncomeEntry { source: string; amount: number }

export interface CheckIn {
  id: ID;
  periodStart: ISODate;
  periodEnd: ISODate;
  incomes: IncomeEntry[];
  spending?: number;
  note?: string;
  createdAt: string;
}

export interface GistSettings {
  token?: string;
  gistId?: string;
  autoSync: boolean;
  lastSyncedAt?: string;
  lastSyncedHash?: string;
}

export interface AppMeta {
  id: 'meta';
  schemaVersion: number;
  lastValuationAt?: string;
  valuationSnoozedUntil?: string;
  skippedPeriods: string[];
  gist: GistSettings;
  modifiedAt: string;
  /** ids of records created by "Load demo data", so they can be cleared later */
  demo?: Record<'goals' | 'holdings' | 'transactions' | 'valuations' | 'checkIns', string[]>;
}

export interface AppData {
  profile: Profile | null;
  goals: Goal[];
  holdings: Holding[];
  transactions: Transaction[];
  valuations: Valuation[];
  checkIns: CheckIn[];
  meta: AppMeta;
}
