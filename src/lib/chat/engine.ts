import { addMonths, startOfMonth } from 'date-fns';
import type { Goal, Holding, HoldingType, ID, IncomeEntry, ISODate, Priority, Transaction, TxReason, Valuation } from '../types';
import { DEFAULT_VALUATION, GOAL_COLORS, HOLDING_LABEL } from '../finance/constants';
import { fmtDate, fmtMonthYear, toISO } from '../finance/dates';
import { formatINR, formatINRShort, formatPct } from '../finance/format';
import { requiredFlat } from '../finance/compound';
import { goalTarget } from '../finance/goals';
import { HEALTH_LABEL, type GoalHealth } from '../finance/goals';
import { baseGoal } from '../templates';
import { newId, nowStamp } from '../ids';
import {
  findGoals, findHoldings, isNo, isYes, mentionsEqual, mentionsUnassigned, norm, parseAmounts, parseDay,
  parsePercents, parseGrams, parseTargetMonth,
} from './parse';

/* ================================================================== types */

export interface ChatContext {
  today: Date;
  goals: Goal[];
  holdings: Holding[];
  /** holdingId → owner goal ids (null = unassigned) that hold value there */
  owners: Record<ID, (ID | null)[]>;
  grams: Record<ID, number>;
  metrics: Record<ID, { required: number; currentValue: number; target: number; health: GoalHealth; monthsLeft: number }>;
  totalValue: number;
  totalInvested: number;
  monthlyCapacity: number;
  defaultReturns: Record<HoldingType, number>;
}

export type ChatOp =
  | { kind: 'addHolding'; holding: Holding }
  | { kind: 'addTx'; tx: Transaction }
  | { kind: 'addValuation'; valuation: Valuation }
  | { kind: 'addIncome'; date: ISODate; entry: IncomeEntry }
  | { kind: 'setSpending'; date: ISODate; amount: number }
  | { kind: 'addGoal'; goal: Goal }
  | { kind: 'updateGoal'; id: ID; patch: Partial<Goal> };

export interface ChatReply {
  text: string;
  chips?: string[];
  card?: { title: string; lines: [string, string][] };
  link?: { label: string; to: string };
}

type HoldingRef = { id: ID } | { newType: HoldingType; name: string };
interface Split { goalId: ID | null; pct?: number; amount?: number }

type Draft =
  | { intent: 'save'; amount?: number; date: ISODate; holding?: HoldingRef; split?: Split[]; grams?: number; pickType?: HoldingType; awaiting?: string }
  | { intent: 'withdraw'; amount?: number; date: ISODate; holding?: HoldingRef; goalId?: ID | null; reason: TxReason; awaiting?: string }
  | { intent: 'transfer'; amount?: number; date: ISODate; from?: HoldingRef; to?: HoldingRef; goalId?: ID | null; awaiting?: string }
  | { intent: 'valuation'; holding?: HoldingRef; value?: number; pricePerGram?: number; date: ISODate; awaiting?: string }
  | { intent: 'income'; amount?: number; source: string; date: ISODate; awaiting?: string }
  | { intent: 'spending'; amount?: number; date: ISODate; awaiting?: string }
  | {
      intent: 'create_goal'; name?: string; amount?: number; date?: ISODate; inflation?: number | null;
      ret?: { override?: number; mix?: Partial<Record<HoldingType, number>>; label: string }; priority: Priority; awaiting?: string;
    }
  | { intent: 'update_goal'; goalId?: ID; field?: UpdateField; value?: number | string | ISODate; awaiting?: string };

type UpdateField = 'target' | 'date' | 'inflation' | 'return' | 'priority' | 'allocation' | 'status' | 'name' | 'stepup';

export interface ChatState { draft: Draft | null }
export const initialChatState: ChatState = { draft: null };

export interface ChatResult { state: ChatState; replies: ChatReply[]; ops?: ChatOp[]; undoLabel?: string }

/* ================================================================== helpers */

const money = (n: number) => formatINR(n);
const short = (n: number) => formatINRShort(n);
const activeGoals = (ctx: ChatContext) => ctx.goals.filter((g) => g.status === 'active');
const liveHoldings = (ctx: ChatContext) => ctx.holdings.filter((h) => !h.archived);
const goalName = (ctx: ChatContext, id: ID | null | undefined) => (id == null ? 'General savings' : ctx.goals.find((g) => g.id === id)?.name ?? 'a goal');
const holdingName = (ctx: ChatContext, ref: HoldingRef) =>
  'id' in ref ? ctx.holdings.find((h) => h.id === ref.id)?.name ?? 'holding' : `${ref.name} (new)`;

export const HELP_TEXT = [
  'I can log things for you in plain words. Try:',
  '• "Saved 10k in silver, 30% for the bike and 70% for the world tour"',
  '• "Put 25,000 in my HDFC account for the emergency fund yesterday"',
  '• "Withdrew 5k from mutual funds for tax"',
  '• "Moved 20k from bank to Nifty index fund"',
  '• "My gold is worth 1.2 lakh" or "silver price 95 per gram"',
  '• "Earned 80k salary this month" · "Spent 42k this month"',
  '• "I want to save 5 lakh for a bike by Dec 2028"',
  '• "Change bike target to 6 lakh" · "Move world tour to March 2033"',
  '• "How am I doing?" · "How much do I need for the bike?"',
].join('\n');

function resolveHolding(text: string, ctx: ChatContext, near?: { after?: RegExp }): { ref?: HoldingRef; options?: Holding[]; type?: HoldingType } {
  let segment = text;
  if (near?.after) {
    const m = norm(text).match(near.after);
    if (!m) return {};
    segment = norm(text).slice((m.index ?? 0) + m[0].length);
  }
  const { byName, types } = findHoldings(segment, liveHoldings(ctx));
  if (byName.length && (!types.length || byName[0].index <= types[0].index + 2)) return { ref: { id: byName[0].item.id } };
  if (types.length) {
    const type = types[0].type;
    const same = liveHoldings(ctx).filter((h) => h.type === type);
    if (same.length === 1) return { ref: { id: same[0].id }, type };
    if (same.length > 1) return { options: same, type };
    return { ref: { newType: type, name: HOLDING_LABEL[type] }, type };
  }
  if (byName.length) return { ref: { id: byName[0].item.id } };
  return {};
}

/** Work out the goal split for a saving. Returns splits with pct (0-100) or amount. */
export function parseSplit(text: string, ctx: ChatContext, total?: number): { split?: Split[]; total?: number; ambiguous?: string } {
  const t = norm(text);
  const goals = activeGoals(ctx);
  const hits = findGoals(t, goals).sort((a, b) => a.index - b.index);
  const pcts = parsePercents(t);
  const amounts = parseAmounts(t);
  const unassigned = mentionsUnassigned(t);
  const unIdx = unassigned ? t.search(/\b(unassigned|general|no goal|not for any goal|just savings)\b/) : -1;

  type Owner = { goalId: ID | null; index: number };
  const owners: Owner[] = hits.map((h) => ({ goalId: h.item.id, index: h.index }));
  if (unassigned) owners.push({ goalId: null, index: unIdx });
  owners.sort((a, b) => a.index - b.index);

  const remainderWord = /\b(the other|other one|rest|remaining|remainder|balance)\b/.exec(t);

  if (!owners.length && !remainderWord) return { total };

  if (mentionsEqual(t) && owners.length >= 2) {
    return { split: owners.map((o) => ({ goalId: o.goalId, pct: 100 / owners.length })), total };
  }

  // percents → owners: pair closest first (an owner right after the percent is preferred)
  const split: Split[] = owners.map((o) => ({ goalId: o.goalId }));
  const pairs: { p: number; o: number; d: number }[] = [];
  const crosses = (a: number, b: number) => /(,|;|\band\b|\bthen\b|\bwhile\b)/.test(t.slice(Math.min(a, b), Math.max(a, b)));
  pcts.forEach((p, pi) => owners.forEach((o, oi) => {
    const base = o.index >= p.index ? o.index - p.index : (p.index - o.index) * 1.6;
    pairs.push({ p: pi, o: oi, d: base + (crosses(p.index, o.index) ? 50 : 0) });
  }));
  pairs.sort((a, b) => a.d - b.d);
  const usedP = new Set<number>();
  const usedO = new Set<number>();
  for (const pr of pairs) {
    if (usedP.has(pr.p) || usedO.has(pr.o) || pr.d >= 110) continue;
    split[pr.o].pct = pcts[pr.p].value;
    usedP.add(pr.p); usedO.add(pr.o);
  }
  if (remainderWord) pcts.forEach((p, pi) => { if (!usedP.has(pi)) split.push({ goalId: undefined as unknown as null, pct: p.value }); });

  // explicit per-goal amounts ("6k to bike and 4k to tour")
  if (!pcts.length && amounts.length >= owners.length && owners.length >= 1) {
    const pool = amounts.length > owners.length ? amounts.slice(1) : amounts;
    const take = new Set<number>();
    owners.forEach((o, i) => {
      let best = -1; let bestD = Infinity;
      pool.forEach((a, j) => {
        if (take.has(j)) return;
        const d = Math.abs(a.index - o.index);
        if (d < bestD) { bestD = d; best = j; }
      });
      if (best >= 0 && bestD < 40 && (owners.length > 1 || amounts.length > 1)) { split[i].amount = pool[best].value; take.add(best); }
    });
    const allHave = split.every((s) => s.amount != null);
    if (allHave) {
      const sum = split.reduce((s, x) => s + (x.amount ?? 0), 0);
      if (amounts.length > owners.length) total = amounts[0].value;
      else total = sum;
      if (total && Math.abs(sum - total) > 1) {
        const rest = total - sum;
        if (rest > 0 && remainderWord) {
          const others = goals.filter((g) => !owners.some((o) => o.goalId === g.id));
          if (others.length === 1) split.push({ goalId: others[0].id, amount: rest });
          else return { total, ambiguous: 'rest' };
        }
      }
      return { split: split.filter((s) => s.goalId !== undefined), total };
    }
  }

  // resolve "the other / rest"
  const unresolved = split.filter((s) => s.goalId === (undefined as unknown as null));
  const named = split.filter((s) => s.goalId !== (undefined as unknown as null));
  if (unresolved.length || (remainderWord && named.every((s) => s.pct != null))) {
    const others = goals.filter((g) => !named.some((s) => s.goalId === g.id));
    const restPct = 100 - named.reduce((s, x) => s + (x.pct ?? 0), 0);
    if (others.length === 1 && restPct > 0) {
      return { split: [...named, { goalId: others[0].id, pct: restPct }], total };
    }
    if (restPct > 0) return { split: named.length ? named : undefined, total, ambiguous: 'rest' };
  }

  const withPct = named.filter((s) => s.pct != null);
  const without = named.filter((s) => s.pct == null);
  if (!withPct.length) {
    return { split: named.map((s) => ({ goalId: s.goalId, pct: 100 / named.length })), total };
  }
  const restPct = 100 - withPct.reduce((s, x) => s + (x.pct ?? 0), 0);
  if (without.length) without.forEach((s) => (s.pct = Math.max(0, restPct) / without.length));
  else if (restPct > 0.5) return { split: named, total, ambiguous: 'rest' };
  return { split: named, total };
}

function splitLines(ctx: ChatContext, split: Split[], total: number): [string, string][] {
  return split.map((s) => {
    const amt = s.amount ?? (total * (s.pct ?? 0)) / 100;
    return [goalName(ctx, s.goalId), `${money(amt)}${s.pct != null ? ` · ${formatPct(s.pct, 1)}` : ''}`];
  });
}

const goalChips = (ctx: ChatContext, extra: string[] = []) => [...activeGoals(ctx).slice(0, 6).map((g) => g.name), ...extra];
const holdingChips = (ctx: ChatContext, list?: Holding[]) => (list ?? liveHoldings(ctx)).slice(0, 6).map((h) => h.name);

function guessIcon(name: string): string {
  const n = name.toLowerCase();
  const map: [RegExp, string][] = [
    [/bike|motorcycle|scooter|enfield|ktm/, '🏍️'], [/car\b|suv|tesla/, '🚗'], [/house|home|flat|apartment|down ?payment/, '🏠'],
    [/trip|travel|tour|vacation|holiday|europe|japan|world/, '✈️'], [/wedding|marriage|ring/, '💍'], [/laptop|macbook|computer|pc/, '💻'],
    [/phone|iphone/, '📱'], [/college|education|course|mba|masters|study/, '🎓'], [/emergency|safety|rainy/, '🛟'],
    [/baby|kid|child/, '👶'], [/health|medical|surgery/, '🏥'], [/guitar|music/, '🎸'], [/retire|freedom|fire\b/, '🏖️'],
  ];
  return map.find(([re]) => re.test(n))?.[1] ?? '🎯';
}

function extractGoalName(text: string): string | undefined {
  let t = ` ${text.trim()} `;
  const m =
    t.match(/\bgoal\s*(?:called|named|:|-)\s*(.+?)(?=\s+(?:of|worth|for|by|in|before|till|until|with|target|costing|₹|rs\b|\d)|[.,!]|$)/i) ??
    t.match(/\b(?:save|saving|savings)\s+(?:up\s+)?(?:.*?)\bfor\s+(?:a|an|my|the)?\s*(.+?)(?=\s+(?:by|in|before|till|until|within|worth|costing|which|that|of|around|about|₹|rs\b|\d)|[.,!]|$)/i) ??
    t.match(/\b(?:buy|get|afford|plan(?:ning)? for|fund)\s+(?:a|an|my|the)?\s*(.+?)(?=\s+(?:by|in|before|till|until|within|worth|costing|for|which|that|of|around|about|₹|rs\b|\d)|[.,!]|$)/i);
  if (!m) return undefined;
  t = m[1].replace(/\b(new|goal)\b/gi, '').replace(/\s+/g, ' ').trim();
  if (!t || /^\d/.test(t) || t.length > 40) return undefined;
  return t.replace(/\b\w/g, (c) => c.toUpperCase());
}

const REASONS: [RegExp, TxReason][] = [
  [/\b(tax|taxes|tds|gst|capital gains?)\b/, 'tax'],
  [/\b(fee|fees|charge|charges|commission|penalty|brokerage)\b/, 'fee'],
  [/\b(trip|spent on (?:the )?goal|for the goal|bought|purchase|down ?payment)\b/, 'goal_spend'],
  [/\b(expense|bill|bills|medical|hospital|repair|emergency|rent)\b/, 'expense'],
];
const REASON_LABEL: Record<TxReason, string> = {
  saving: 'Saving', opening: 'Opening balance', transfer: 'Transfer', reassign: 'Reassign', goal_spend: 'Spent on goal',
  tax: 'Tax', fee: 'Fees / charges', expense: 'Expense', other: 'Other',
};

const INCOME_SOURCES: [RegExp, string][] = [
  [/\bsalary|paycheck|pay ?check|got paid\b/, 'Salary'], [/\bfreelanc|client|project|gig\b/, 'Freelance'],
  [/\bfamily|parents|dad|mom|mother|father\b/, 'Family support'], [/\bstipend|scholarship\b/, 'Stipend'],
  [/\binterest|dividend\b/, 'Interest / dividends'], [/\bbonus\b/, 'Bonus'], [/\bpart[- ]?time|tuition\b/, 'Part-time work'],
  [/\brent(al)? income|tenant\b/, 'Rental income'],
];

/* ================================================================== intent detection */

type Intent = Draft['intent'] | 'query_status' | 'query_required' | 'query_total' | 'help' | 'greeting' | 'unknown';

function detectIntent(t: string, ctx: ChatContext): Intent {
  if (/^(hi|hello|hey|yo|namaste|good (morning|evening|afternoon))\b/.test(t) && t.split(' ').length <= 4) return 'greeting';
  if (/\b(help|what can you do|how do i use|commands|examples)\b/.test(t)) return 'help';
  if (/\b(how much|what).*\b(need|required|have to|should i)\b.*\b(save|put)\b/.test(t) || /\brequired\b.*\bfor\b/.test(t)) return 'query_required';
  if (/\b(how am i doing|how are my goals|status|progress|am i on track|overview|summary)\b/.test(t)) return 'query_status';
  if (/\b(total|net worth|how much (do i have|have i saved)|overall)\b/.test(t) && !/\b(saved|invested)\s+\d/.test(t)) return 'query_total';
  if (/\b(new goal|create (a )?goal|add (a )?goal|i want to save|want to save|plan(ning)? to (buy|save)|start saving for|save up for|set a goal|i want to buy|goal (called|named|for))\b/.test(t)) return 'create_goal';
  if (/\b(change|update|set|move|push|shift|extend|increase|decrease|reduce|raise|lower|rename|pause|resume|unpause|archive|complete|mark|make|allocate)\b/.test(t)
    && findGoals(t, ctx.goals).length
    && /\b(target|amount|deadline|date|to (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|inflation|return|priority|allocat|pause|resume|unpause|archive|complete|done|rename|step ?up|high|low|medium|by \d+ months?|later|earlier)\b/.test(t)) return 'update_goal';
  if (/\b(moved|move|transferred|transfer|shifted|shift|switched)\b/.test(t) && /\bfrom\b/.test(t) && /\b(to|into)\b/.test(t)) return 'transfer';
  if (/\b(worth|valued at|value is|value of|is at|now at|price|rate is|per gram|currently at|went up to|dropped to|fell to|grew to)\b/.test(t)) return 'valuation';
  if (/\b(withdrew|withdraw|withdrawn|took out|take out|taken out|pulled out|pull out|redeemed|redeem|sold|deducted|paid .* from|spent .* from|used .* from)\b/.test(t)) return 'withdraw';
  if (/\b(earned|earn|salary|got paid|income|received|got .* from (my )?(client|family|parents)|stipend)\b/.test(t) && !/\b(saved|invested|put|deposited)\b/.test(t)) return 'income';
  if (/\b(spent|spend|spending|expenses were|expenditure)\b/.test(t) && !/\bfrom\b/.test(t)) return 'spending';
  if (/\b(saved|save|invested|invest|put|deposited|deposit|added|add|contributed|bought|buy|parked|sip of|kept|stashed)\b/.test(t) && parseAmounts(t, ctx.today).length) return 'save';
  return 'unknown';
}

/* ================================================================== draft building */

function buildDraft(intent: Draft['intent'], raw: string, ctx: ChatContext): Draft {
  const t = norm(raw);
  const date = parseDay(t, ctx.today)?.date ?? toISO(ctx.today);
  const amounts = parseAmounts(t, ctx.today);
  switch (intent) {
    case 'save': {
      const { split, total } = parseSplit(t, ctx, amounts[0]?.value);
      const h = resolveHolding(t, ctx);
      const d: Draft = { intent, amount: total ?? amounts[0]?.value, date, split, grams: parseGrams(t)[0]?.value };
      if (h.ref) d.holding = h.ref;
      else if (h.options) { d.awaiting = 'holding_pick'; d.pickType = h.type; }
      if (!split && activeGoals(ctx).length === 1 && !mentionsUnassigned(t)) d.split = [{ goalId: activeGoals(ctx)[0].id, pct: 100 }];
      if (!split && mentionsUnassigned(t)) d.split = [{ goalId: null, pct: 100 }];
      return d;
    }
    case 'withdraw': {
      const h = resolveHolding(t, ctx, { after: /\bfrom\b/ }).ref ? resolveHolding(t, ctx, { after: /\bfrom\b/ }) : resolveHolding(t, ctx);
      const g = findGoals(t, activeGoals(ctx).concat(ctx.goals.filter((x) => x.status !== 'active')));
      const reason = REASONS.find(([re]) => re.test(t))?.[1] ?? 'other';
      const d: Draft = { intent, amount: amounts[0]?.value, date, reason };
      if (h.ref && 'id' in h.ref) d.holding = h.ref;
      if (g.length) d.goalId = g[0].item.id;
      else if (mentionsUnassigned(t)) d.goalId = null;
      return d;
    }
    case 'transfer': {
      const from = resolveHolding(t.replace(/\b(to|into)\b.*$/, ''), ctx, { after: /\bfrom\b/ });
      const to = resolveHolding(t, ctx, { after: /\b(to|into)\b(?!.*\b(to|into)\b)/ });
      const g = findGoals(t, ctx.goals);
      const d: Draft = { intent, amount: amounts[0]?.value, date };
      if (from.ref && 'id' in from.ref) d.from = from.ref;
      if (to.ref) d.to = to.ref;
      if (g.length) d.goalId = g[0].item.id;
      else if (mentionsUnassigned(t)) d.goalId = null;
      return d;
    }
    case 'valuation': {
      const h = resolveHolding(t, ctx);
      const perGram = /\b(per gram|per gm|\/ ?g(ram)?|a gram|per g)\b/.test(t) || /\bprice\b/.test(t) && /\b(gold|silver)\b/.test(t);
      const d: Draft = { intent, date: toISO(ctx.today) };
      if (h.ref && 'id' in h.ref) d.holding = h.ref;
      if (amounts.length) { if (perGram) d.pricePerGram = amounts[0].value; else d.value = amounts[0].value; }
      return d;
    }
    case 'income': {
      const source = INCOME_SOURCES.find(([re]) => re.test(t))?.[1] ?? 'Other';
      return { intent, amount: amounts[0]?.value, source, date: parseDay(t, ctx.today)?.date ?? toISO(ctx.today) };
    }
    case 'spending':
      return { intent, amount: amounts[0]?.value, date: parseDay(t, ctx.today)?.date ?? toISO(ctx.today) };
    case 'create_goal': {
      const name = extractGoalName(raw);
      const target = parseTargetMonth(t, ctx.today);
      const pr: Priority = /\b(urgent|important|high priority|top priority)\b/.test(t) ? 'high' : /\blow priority\b/.test(t) ? 'low' : 'medium';
      return { intent, name, amount: amounts[0]?.value, date: target?.date, priority: pr };
    }
    case 'update_goal': {
      const g = findGoals(t, ctx.goals);
      const d: Draft = { intent, goalId: g[0]?.item.id };
      Object.assign(d, parseUpdate(t, ctx));
      return d;
    }
  }
}

function parseUpdate(t: string, ctx: ChatContext): { field?: UpdateField; value?: number | string } {
  const amounts = parseAmounts(t, ctx.today);
  const pcts = parsePercents(t);
  const month = parseTargetMonth(t, ctx.today);
  if (/\bpause\b/.test(t)) return { field: 'status', value: 'paused' };
  if (/\b(resume|unpause|reactivate)\b/.test(t)) return { field: 'status', value: 'active' };
  if (/\barchive\b/.test(t)) return { field: 'status', value: 'archived' };
  if (/\b(complete|completed|done|achieved)\b/.test(t)) return { field: 'status', value: 'completed' };
  if (/\brename\b/.test(t)) {
    const m = t.match(/\bto\s+(.+)$/);
    return { field: 'name', value: m ? m[1].replace(/\b\w/g, (c) => c.toUpperCase()) : undefined };
  }
  if (/\bpriority\b|\b(high|low|medium)\b/.test(t)) {
    const v = /\bhigh\b/.test(t) ? 'high' : /\blow\b/.test(t) ? 'low' : /\bmedium\b/.test(t) ? 'medium' : undefined;
    return { field: 'priority', value: v };
  }
  if (/\binflation\b/.test(t)) return { field: 'inflation', value: pcts[0]?.value ?? amounts[0]?.value };
  if (/\bstep ?up\b/.test(t)) return { field: 'stepup', value: pcts[0]?.value ?? amounts[0]?.value };
  if (/\b(return|returns|interest|growth)\b/.test(t)) return { field: 'return', value: pcts[0]?.value ?? amounts[0]?.value };
  if (/\ballocat/.test(t)) {
    if (pcts.length) return { field: 'allocation', value: `p:${pcts[0].value}` };
    if (amounts.length) return { field: 'allocation', value: `f:${amounts[0].value}` };
    return { field: 'allocation' };
  }
  const relMonths = t.match(/\bby\s+(\d+)\s+(months?|years?)\b/);
  if (/\b(deadline|date|move|push|shift|extend|later|earlier|postpone|prepone)\b/.test(t) || (month && !amounts.length)) {
    if (month) return { field: 'date', value: month.date };
    if (relMonths) {
      const g = findGoals(t, ctx.goals)[0]?.item;
      if (g) {
        const n = +relMonths[1] * (/^y/.test(relMonths[2]) ? 12 : 1) * (/\b(earlier|prepone|sooner)\b/.test(t) ? -1 : 1);
        return { field: 'date', value: toISO(addMonths(new Date(g.savingEndDate), n)) };
      }
    }
    return { field: 'date' };
  }
  if (/\b(target|amount|cost|budget|price|increase|decrease|reduce|raise|lower)\b/.test(t)) return { field: 'target', value: amounts[0]?.value };
  return {};
}

/* ================================================================== slot filling */

function fillFromReply(d: Draft, raw: string, ctx: ChatContext): boolean {
  const t = norm(raw);
  const amounts = parseAmounts(t, ctx.today);
  let changed = false;
  const day = parseDay(t, ctx.today);
  switch (d.intent) {
    case 'save': {
      if (d.awaiting === 'amount' && amounts.length) { d.amount = amounts[0].value; changed = true; }
      if (d.awaiting === 'holding' || d.awaiting === 'holding_pick' || !d.holding) {
        const h = resolveHolding(t, ctx);
        if (h.ref) { d.holding = h.ref; changed = true; } else if (d.awaiting === 'holding' && /\bnew\b/.test(t)) {
          const name = raw.replace(/\bnew\b/i, '').trim();
          if (name) { d.holding = { newType: 'other', name }; changed = true; }
        }
      }
      if (d.awaiting === 'split' || findGoals(t, activeGoals(ctx)).length || mentionsUnassigned(t)) {
        const s = parseSplit(t, ctx, d.amount);
        if (s.split) { d.split = s.split; changed = true; }
        if (s.total && !d.amount) d.amount = s.total;
      }
      if (d.awaiting === 'confirm') {
        if (amounts.length && !findGoals(t, activeGoals(ctx)).length && /\b(make it|change|actually|amount)\b/.test(t)) { d.amount = amounts[0].value; changed = true; }
      }
      const gr = parseGrams(t)[0]; if (gr) { d.grams = gr.value; changed = true; }
      if (day) { d.date = day.date; changed = true; }
      break;
    }
    case 'withdraw': {
      if ((d.awaiting === 'amount' || /\b(make it|change|actually)\b/.test(t)) && amounts.length) { d.amount = amounts[0].value; changed = true; }
      if (d.awaiting === 'holding' || d.awaiting === 'holding_pick') { const h = resolveHolding(t, ctx); if (h.ref && 'id' in h.ref) { d.holding = h.ref; changed = true; } }
      if (d.awaiting === 'goal') {
        const g = findGoals(t, ctx.goals);
        if (g.length) { d.goalId = g[0].item.id; changed = true; } else if (mentionsUnassigned(t) || /\bgeneral\b/.test(t)) { d.goalId = null; changed = true; }
      }
      const r = REASONS.find(([re]) => re.test(t)); if (r) { d.reason = r[1]; changed = true; }
      if (day) { d.date = day.date; changed = true; }
      break;
    }
    case 'transfer': {
      if (d.awaiting === 'amount' && amounts.length) { d.amount = amounts[0].value; changed = true; }
      if (d.awaiting === 'from') { const h = resolveHolding(t, ctx); if (h.ref && 'id' in h.ref) { d.from = h.ref; changed = true; } }
      if (d.awaiting === 'to') { const h = resolveHolding(t, ctx); if (h.ref) { d.to = h.ref; changed = true; } }
      if (d.awaiting === 'goal') {
        const g = findGoals(t, ctx.goals);
        if (g.length) { d.goalId = g[0].item.id; changed = true; } else if (mentionsUnassigned(t)) { d.goalId = null; changed = true; }
      }
      if (day) { d.date = day.date; changed = true; }
      break;
    }
    case 'valuation': {
      if (d.awaiting === 'holding' || d.awaiting === 'holding_pick') { const h = resolveHolding(t, ctx); if (h.ref && 'id' in h.ref) { d.holding = h.ref; changed = true; } }
      if ((d.awaiting === 'value' || /\b(make it|actually)\b/.test(t)) && amounts.length) {
        if (/\b(per gram|\/ ?g|a gram)\b/.test(t)) d.pricePerGram = amounts[0].value; else d.value = amounts[0].value;
        changed = true;
      }
      break;
    }
    case 'income':
    case 'spending':
      if (amounts.length) { d.amount = amounts[0].value; changed = true; }
      if (day) { d.date = day.date; changed = true; }
      break;
    case 'create_goal': {
      if (d.awaiting === 'name') { const n = raw.trim().replace(/^(call it|name it|it'?s)\s+/i, ''); if (n) { d.name = n.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 40); changed = true; } }
      else if (d.awaiting === 'amount' && amounts.length) { d.amount = amounts[0].value; changed = true; }
      else if (d.awaiting === 'date') { const m = parseTargetMonth(t, ctx.today); if (m) { d.date = m.date; changed = true; } }
      else if (d.awaiting === 'inflation') {
        const p = parsePercents(t)[0]?.value ?? (amounts[0] && amounts[0].value <= 30 ? amounts[0].value : undefined);
        if (p != null) { d.inflation = p; changed = true; } else if (isNo(t) || /\b(fixed|no inflation|dont|don't|exact)\b/.test(t)) { d.inflation = null; changed = true; } else if (isYes(t)) { d.inflation = 6; changed = true; }
      } else if (d.awaiting === 'return') {
        const p = parsePercents(t)[0]?.value ?? (amounts[0] && amounts[0].value <= 40 ? amounts[0].value : undefined);
        if (/\b(bank|fd|fixed|safe)\b/.test(t)) d.ret = { mix: { bank: 30, fd: 70 }, label: 'Bank / FD' };
        else if (/\b(mutual|fund|sip|index|equity|stock)\b/.test(t)) d.ret = { mix: { mutual_fund: 100 }, label: 'Mutual funds' };
        else if (/\b(mix|mixed|both|balanced)\b/.test(t) || isYes(t)) d.ret = { mix: { fd: 40, mutual_fund: 40, gold: 20 }, label: 'Mixed' };
        else if (p != null) d.ret = { override: p, label: `${p}% a year` };
        changed = !!d.ret;
      } else {
        if (amounts.length && /\b(make it|change|amount|target)\b/.test(t)) { d.amount = amounts[0].value; changed = true; }
        const m = parseTargetMonth(t, ctx.today); if (m) { d.date = m.date; changed = true; }
      }
      break;
    }
    case 'update_goal': {
      if (d.awaiting === 'goal') { const g = findGoals(t, ctx.goals); if (g.length) { d.goalId = g[0].item.id; changed = true; } }
      else if (d.awaiting === 'value' || d.awaiting === 'field') {
        const u = parseUpdate(t, ctx);
        if (u.field && d.awaiting === 'field') { d.field = u.field; changed = true; }
        if (u.value != null) { d.value = u.value; changed = true; } else if (d.field) {
          if (d.field === 'date') { const m = parseTargetMonth(t, ctx.today); if (m) { d.value = m.date; changed = true; } }
          else if (d.field === 'name') { d.value = raw.trim(); changed = true; }
          else if (d.field === 'allocation') { const p = parsePercents(t)[0]; if (p) d.value = `p:${p.value}`; else if (amounts[0]) d.value = `f:${amounts[0].value}`; changed = d.value != null; }
          else { const p = parsePercents(t)[0]?.value ?? amounts[0]?.value; if (p != null) { d.value = p; changed = true; } }
        }
      }
      break;
    }
  }
  return changed;
}

/* ================================================================== next question / confirm */

function ask(d: Draft, ctx: ChatContext): ChatReply | null {
  switch (d.intent) {
    case 'save': {
      if (!d.amount) { d.awaiting = 'amount'; return { text: 'How much did you save?', chips: ['5k', '10k', '25k'] }; }
      if (!d.holding) {
        const opts = d.pickType ? liveHoldings(ctx).filter((h) => h.type === d.pickType) : undefined;
        d.awaiting = 'holding';
        const chips = holdingChips(ctx, opts && opts.length ? opts : undefined);
        return { text: `Where did you put the ${short(d.amount)}? Pick a holding, or name a type like "silver" or "FD" and I'll create it.`, chips: chips.length ? chips : ['Bank savings', 'Mutual fund', 'Gold', 'Silver'] };
      }
      if (!d.split || !d.split.length) {
        d.awaiting = 'split';
        return { text: 'Which goal should this count towards? You can split it, like "30% bike, 70% tour".', chips: goalChips(ctx, activeGoals(ctx).length > 1 ? ['Split equally', 'General savings'] : ['General savings']) };
      }
      const sum = d.split.reduce((s, x) => s + (x.amount ?? ((d.amount ?? 0) * (x.pct ?? 0)) / 100), 0);
      if (Math.abs(sum - (d.amount ?? 0)) > 1) {
        d.awaiting = 'split';
        return { text: `That split adds up to ${money(sum)}, but you saved ${money(d.amount)}. Where should the remaining ${money((d.amount ?? 0) - sum)} go?`, chips: goalChips(ctx, ['General savings']) };
      }
      return null;
    }
    case 'withdraw': {
      if (!d.amount) { d.awaiting = 'amount'; return { text: 'How much was taken out?' }; }
      if (!d.holding) { d.awaiting = 'holding'; return { text: 'Which holding did it come out of?', chips: holdingChips(ctx) }; }
      if (d.goalId === undefined) {
        const owners = ctx.owners[(d.holding as { id: ID }).id] ?? [];
        if (owners.length === 1) d.goalId = owners[0];
        else if (owners.length === 0) d.goalId = null;
        else {
          d.awaiting = 'goal';
          return { text: `Whose money was this? ${holdingName(ctx, d.holding)} holds money for more than one goal.`, chips: owners.map((o) => goalName(ctx, o)) };
        }
      }
      return null;
    }
    case 'transfer': {
      if (!d.amount) { d.awaiting = 'amount'; return { text: 'How much did you move?' }; }
      if (!d.from) { d.awaiting = 'from'; return { text: 'Moved from which holding?', chips: holdingChips(ctx) }; }
      if (!d.to) { d.awaiting = 'to'; return { text: 'And into which holding?', chips: holdingChips(ctx) }; }
      if (d.goalId === undefined) {
        const owners = ctx.owners[(d.from as { id: ID }).id] ?? [];
        if (owners.length <= 1) d.goalId = owners[0] ?? null;
        else { d.awaiting = 'goal'; return { text: 'Which goal\'s money was moved?', chips: owners.map((o) => goalName(ctx, o)) }; }
      }
      return null;
    }
    case 'valuation': {
      if (!d.holding) { d.awaiting = 'holding'; return { text: 'Which holding is this value for?', chips: holdingChips(ctx, liveHoldings(ctx).filter((h) => h.valuation !== 'cash')) }; }
      if (d.value == null && d.pricePerGram == null) { d.awaiting = 'value'; return { text: `What's ${holdingName(ctx, d.holding)} worth today?` }; }
      if (d.pricePerGram != null && !(ctx.grams[(d.holding as { id: ID }).id] > 0)) {
        d.awaiting = 'value'; d.pricePerGram = undefined;
        return { text: `I don't have grams recorded for ${holdingName(ctx, d.holding)}, so I can't use a per-gram price. What's its total value today?` };
      }
      return null;
    }
    case 'income':
      if (!d.amount && d.amount !== 0) { d.awaiting = 'amount'; return { text: 'How much came in?' }; }
      return null;
    case 'spending':
      if (!d.amount) { d.awaiting = 'amount'; return { text: 'How much did you spend?' }; }
      return null;
    case 'create_goal': {
      if (!d.name) { d.awaiting = 'name'; return { text: 'Love it. What should I call this goal?', chips: ['New bike', 'House down payment', 'Japan trip', 'Emergency fund'] }; }
      if (!d.amount) { d.awaiting = 'amount'; return { text: `How much will "${d.name}" cost? A rough figure in today's prices is fine.` }; }
      if (!d.date) { d.awaiting = 'date'; return { text: 'By when do you want the money? (e.g. "Dec 2028" or "in 3 years")', chips: ['In 1 year', 'In 3 years', 'In 5 years'] }; }
      const monthsAway = Math.max(0, (new Date(d.date).getFullYear() - ctx.today.getFullYear()) * 12 + new Date(d.date).getMonth() - ctx.today.getMonth());
      if (d.inflation === undefined && monthsAway <= 12) d.inflation = null; // inflation only matters beyond a year
      if (d.inflation === undefined) {
        d.awaiting = 'inflation';
        const months = monthsAway;
        const fut = d.amount * Math.pow(1.06, months / 12);
        return { text: `Is ${short(d.amount)} the price today? Prices usually rise. At 6% inflation a year it would cost about ${short(fut)} by ${fmtMonthYear(d.date)}. Should I plan for that?`, chips: ['Yes, use 6%', 'Use 8%', 'No, keep it fixed'] };
      }
      if (!d.ret) {
        d.awaiting = 'return';
        return { text: 'Where will you mostly keep this money? This sets the expected growth (estimates, not guarantees).', chips: ['Bank / FD (~7%)', 'Mutual funds (~11%)', 'Mixed (~8%)', 'Set my own %'] };
      }
      return null;
    }
    case 'update_goal': {
      if (!d.goalId) { d.awaiting = 'goal'; return { text: 'Which goal do you want to change?', chips: goalChips(ctx) }; }
      if (!d.field) { d.awaiting = 'field'; return { text: 'What should I change?', chips: ['Target', 'Deadline', 'Inflation', 'Expected return', 'Priority'] }; }
      if (d.value == null) {
        d.awaiting = 'value';
        const q: Record<UpdateField, string> = {
          target: 'What\'s the new target amount?', date: 'What\'s the new deadline? (e.g. "March 2030")', inflation: 'New inflation rate (% a year)?',
          return: 'New expected return (% a year)?', priority: 'High, medium or low?', allocation: 'How much should go to this goal each month? (₹ amount or % of your capacity)',
          status: 'Pause, resume, complete or archive?', name: 'What\'s the new name?', stepup: 'Yearly step-up % (applied each January)?',
        };
        return { text: q[d.field], chips: d.field === 'priority' ? ['High', 'Medium', 'Low'] : undefined };
      }
      return null;
    }
  }
}

function confirmCard(d: Draft, ctx: ChatContext): ChatReply {
  d.awaiting = 'confirm';
  const chips = ['Confirm', 'Cancel'];
  switch (d.intent) {
    case 'save': {
      const lines: [string, string][] = [['Amount', money(d.amount ?? 0)], ['Into', holdingName(ctx, d.holding!)]];
      if (d.grams) lines.push(['Quantity', `${d.grams} g`]);
      lines.push(...splitLines(ctx, d.split!, d.amount ?? 0), ['Date', fmtDate(d.date)]);
      return { text: 'Here\'s what I\'ll record:', card: { title: 'New saving', lines }, chips };
    }
    case 'withdraw':
      return { text: 'Got it. Here\'s the withdrawal:', chips, card: { title: 'Withdrawal', lines: [
        ['Amount', money(d.amount ?? 0)], ['From', holdingName(ctx, d.holding!)], ['Goal', goalName(ctx, d.goalId)],
        ['Reason', REASON_LABEL[d.reason]], ['Date', fmtDate(d.date)],
      ] } };
    case 'transfer':
      return { text: 'Moving money between holdings (the goal tag stays the same):', chips, card: { title: 'Transfer', lines: [
        ['Amount', money(d.amount ?? 0)], ['From', holdingName(ctx, d.from!)], ['To', holdingName(ctx, d.to!)], ['Goal', goalName(ctx, d.goalId)], ['Date', fmtDate(d.date)],
      ] } };
    case 'valuation': {
      const id = (d.holding as { id: ID }).id;
      const value = d.value ?? (d.pricePerGram ?? 0) * (ctx.grams[id] ?? 0);
      const lines: [string, string][] = [['Holding', holdingName(ctx, d.holding!)]];
      if (d.pricePerGram != null) lines.push(['Price / gram', money(d.pricePerGram)], ['Grams', `${ctx.grams[id]} g`]);
      lines.push(['Value today', money(value)]);
      return { text: 'Updating the value:', chips, card: { title: 'Valuation', lines } };
    }
    case 'income':
      return { text: 'I\'ll add this to the check-in for that period:', chips, card: { title: 'Income', lines: [['Amount', money(d.amount ?? 0)], ['Source', d.source], ['Period of', fmtDate(d.date)]] } };
    case 'spending':
      return { text: 'I\'ll set the spending for that period:', chips, card: { title: 'Spending', lines: [['Amount', money(d.amount ?? 0)], ['Period of', fmtDate(d.date)]] } };
    case 'create_goal': {
      const g = draftGoal(d, ctx);
      const target = goalTarget(g, ctx.today);
      const months = Math.max(1, (new Date(g.savingEndDate).getFullYear() - ctx.today.getFullYear()) * 12 + new Date(g.savingEndDate).getMonth() - ctx.today.getMonth());
      const rate = d.ret?.override ?? mixReturn(d.ret?.mix, ctx);
      const req = requiredFlat(target, 0, rate, months);
      return { text: 'Here\'s your new goal. You can edit any of this later.', chips, card: { title: `${g.icon} ${g.name}`, lines: [
        ['Cost today', money(d.amount ?? 0)],
        ['Inflation', d.inflation == null ? 'Fixed amount' : `${d.inflation}% a year`],
        ['Target', money(target)], ['By', fmtMonthYear(g.savingEndDate)],
        ['Kept in', `${d.ret?.label} (~${rate.toFixed(1)}%)`], ['Save each month', `≈ ${money(req)}`],
      ] } };
    }
    case 'update_goal': {
      const g = ctx.goals.find((x) => x.id === d.goalId)!;
      return { text: 'Update this goal?', chips, card: { title: `${g.icon} ${g.name}`, lines: [[updateLabel(d.field!), updateValueLabel(d.field!, d.value!)]] } };
    }
  }
}

const updateLabel = (f: UpdateField) => ({ target: 'New target', date: 'New deadline', inflation: 'Inflation', return: 'Expected return', priority: 'Priority', allocation: 'Monthly allocation', status: 'Status', name: 'New name', stepup: 'Yearly step-up' }[f]);
function updateValueLabel(f: UpdateField, v: number | string): string {
  if (f === 'target') return money(Number(v));
  if (f === 'date') return fmtMonthYear(String(v));
  if (f === 'inflation' || f === 'return' || f === 'stepup') return `${v}% a year`;
  if (f === 'allocation') { const s = String(v); return s.startsWith('p:') ? `${s.slice(2)}% of capacity` : money(Number(s.slice(2))); }
  return String(v).replace(/^\w/, (c) => c.toUpperCase());
}

function mixReturn(mix: Partial<Record<HoldingType, number>> | undefined, ctx: ChatContext): number {
  if (!mix) return 8;
  const entries = Object.entries(mix) as [HoldingType, number][];
  const sum = entries.reduce((s, [, w]) => s + w, 0);
  return sum ? entries.reduce((s, [t, w]) => s + w * (ctx.defaultReturns[t] ?? 0), 0) / sum : 8;
}

function draftGoal(d: Extract<Draft, { intent: 'create_goal' }>, ctx: ChatContext): Goal {
  const end = d.date ?? toISO(startOfMonth(addMonths(ctx.today, 24)));
  return baseGoal({
    name: d.name ?? 'New goal', icon: guessIcon(d.name ?? ''), color: GOAL_COLORS[ctx.goals.length % GOAL_COLORS.length],
    simpleTarget: d.inflation == null
      ? { amount: d.amount ?? 0, inflationAdjust: false, inflationRate: 6 }
      : { amount: d.amount ?? 0, inflationAdjust: true, todayCost: d.amount ?? 0, inflationRate: d.inflation },
    savingEndDate: end, priority: d.priority,
    expectedReturnOverride: d.ret?.override, plannedMix: d.ret?.mix,
    allocation: { kind: 'percent', value: 0 },
  }, ctx.goals.length);
}

/* ================================================================== execution */

function holdingOps(ref: HoldingRef): { id: ID; ops: ChatOp[] } {
  if ('id' in ref) return { id: ref.id, ops: [] };
  const holding: Holding = {
    id: newId(), name: ref.name, type: ref.newType, valuation: DEFAULT_VALUATION[ref.newType],
    interestRate: ref.newType === 'bank' ? 3 : ref.newType === 'fd' ? 7 : undefined, archived: false, createdAt: nowStamp(),
  };
  return { id: holding.id, ops: [{ kind: 'addHolding', holding }] };
}

const mkTx = (p: Omit<Transaction, 'id' | 'createdAt'>): Transaction => ({ id: newId(), createdAt: nowStamp(), ...p });

function execute(d: Draft, ctx: ChatContext): { ops: ChatOp[]; text: string; link?: ChatReply['link'] } {
  switch (d.intent) {
    case 'save': {
      const { id, ops } = holdingOps(d.holding!);
      const total = d.amount ?? 0;
      const parts = d.split!.map((s) => ({ goalId: s.goalId, amount: s.amount ?? (total * (s.pct ?? 0)) / 100 })).filter((p) => p.amount > 0);
      parts.forEach((p) => ops.push({ kind: 'addTx', tx: mkTx({
        date: d.date, kind: 'contribution', holdingId: id, goalId: p.goalId, amount: Math.round(p.amount * 100) / 100, reason: 'saving',
        quantityGrams: d.grams ? (d.grams * p.amount) / total : undefined, note: 'Added via chat',
      }) }));
      const extra = parts.filter((p) => p.goalId).map((p) => {
        const m = ctx.metrics[p.goalId!];
        if (!m || !m.target) return null;
        const pct = Math.min(100, ((m.currentValue + p.amount) / m.target) * 100);
        return `${goalName(ctx, p.goalId)} is now about ${pct.toFixed(1)}% done.`;
      }).filter(Boolean);
      return { ops, text: `Saved ✓ ${money(total)} recorded. ${extra.join(' ')}`.trim() };
    }
    case 'withdraw': {
      const id = (d.holding as { id: ID }).id;
      return { ops: [{ kind: 'addTx', tx: mkTx({ date: d.date, kind: 'withdrawal', holdingId: id, goalId: d.goalId ?? null, amount: d.amount ?? 0, reason: d.reason, note: 'Added via chat' }) }], text: `Done. ${money(d.amount ?? 0)} taken out of ${holdingName(ctx, d.holding!)}.` };
    }
    case 'transfer': {
      const fromId = (d.from as { id: ID }).id;
      const { id: toId, ops } = holdingOps(d.to!);
      const transferId = newId();
      ops.push(
        { kind: 'addTx', tx: mkTx({ date: d.date, kind: 'withdrawal', holdingId: fromId, goalId: d.goalId ?? null, amount: d.amount ?? 0, reason: 'transfer', transferId }) },
        { kind: 'addTx', tx: mkTx({ date: d.date, kind: 'contribution', holdingId: toId, goalId: d.goalId ?? null, amount: d.amount ?? 0, reason: 'transfer', transferId }) },
      );
      return { ops, text: `Moved ${money(d.amount ?? 0)} from ${holdingName(ctx, d.from!)} to ${holdingName(ctx, d.to!)}.` };
    }
    case 'valuation': {
      const id = (d.holding as { id: ID }).id;
      const value = d.value ?? (d.pricePerGram ?? 0) * (ctx.grams[id] ?? 0);
      return { ops: [{ kind: 'addValuation', valuation: { id: newId(), holdingId: id, date: d.date, value, pricePerGram: d.pricePerGram, createdAt: nowStamp() } }], text: `Updated. ${holdingName(ctx, d.holding!)} is now worth ${money(value)}.` };
    }
    case 'income':
      return { ops: [{ kind: 'addIncome', date: d.date, entry: { source: d.source, amount: d.amount ?? 0 } }], text: `Added ${money(d.amount ?? 0)} of income (${d.source}).` };
    case 'spending':
      return { ops: [{ kind: 'setSpending', date: d.date, amount: d.amount ?? 0 }], text: `Spending set to ${money(d.amount ?? 0)} for that period.` };
    case 'create_goal': {
      const g = draftGoal(d, ctx);
      return { ops: [{ kind: 'addGoal', goal: g }], text: `"${g.name}" is set up 🎉 Tip: give it a share of your monthly saving on the goal page.`, link: { label: 'Open goal', to: `/goals/${g.id}` } };
    }
    case 'update_goal': {
      const g = ctx.goals.find((x) => x.id === d.goalId)!;
      const v = d.value!;
      let patch: Partial<Goal> = {};
      switch (d.field!) {
        case 'target':
          if (g.mode === 'planner') return { ops: [], text: `${g.name} uses the detailed planner, so its target comes from line items. Open the Plan tab to change it.`, link: { label: 'Open plan', to: `/goals/${g.id}?tab=plan` } };
          patch = { simpleTarget: g.simpleTarget?.inflationAdjust ? { ...g.simpleTarget, todayCost: Number(v), amount: Number(v) } : { ...(g.simpleTarget ?? { inflationAdjust: false }), amount: Number(v) } };
          break;
        case 'date': {
          const delta = (new Date(String(v)).getFullYear() - new Date(g.savingEndDate).getFullYear()) * 12 + new Date(String(v)).getMonth() - new Date(g.savingEndDate).getMonth();
          patch = { savingEndDate: String(v) };
          if (g.planner) patch.planner = { ...g.planner, spendStartDate: toISO(addMonths(new Date(g.planner.spendStartDate), delta)) };
          break;
        }
        case 'inflation':
          if (g.planner) patch = { planner: { ...g.planner, inflationRate: Number(v) } };
          else patch = { simpleTarget: { ...(g.simpleTarget ?? { amount: 0 }), inflationAdjust: true, todayCost: g.simpleTarget?.todayCost ?? g.simpleTarget?.amount ?? 0, inflationRate: Number(v) } };
          break;
        case 'return': patch = { expectedReturnOverride: Number(v) }; break;
        case 'stepup': patch = { planType: 'stepup', stepUpRate: Number(v) }; break;
        case 'priority': patch = { priority: String(v) as Priority }; break;
        case 'status': patch = { status: String(v) as Goal['status'] }; break;
        case 'name': patch = { name: String(v) }; break;
        case 'allocation': {
          const s = String(v);
          patch = { allocation: s.startsWith('p:') ? { kind: 'percent', value: Number(s.slice(2)) } : { kind: 'fixed', value: Number(s.slice(2)) } };
          break;
        }
      }
      return { ops: [{ kind: 'updateGoal', id: g.id, patch }], text: `Updated ${g.name}. Everything has been recalculated.` };
    }
  }
}

/* ================================================================== queries */

function answerQuery(intent: Intent, raw: string, ctx: ChatContext): ChatReply {
  const t = norm(raw);
  if (intent === 'help') return { text: HELP_TEXT };
  if (intent === 'greeting') return { text: 'Hey! Tell me what you saved, spent or earned, or ask how your goals are doing.', chips: ['How am I doing?', 'Help'] };
  if (intent === 'query_total') {
    const gain = ctx.totalValue - ctx.totalInvested;
    return { text: `You have ${money(ctx.totalValue)} across all holdings. You put in ${money(ctx.totalInvested)}, so you're ${gain >= 0 ? 'up' : 'down'} ${money(Math.abs(gain))}.` };
  }
  const goals = activeGoals(ctx);
  if (!goals.length) return { text: 'You don\'t have any active goals yet. Want to create one? Try "I want to save 3 lakh for a bike by Dec 2027".' };
  if (intent === 'query_required') {
    const g = findGoals(t, goals)[0]?.item;
    const list = g ? [g] : goals;
    return { text: list.map((x) => {
      const m = ctx.metrics[x.id];
      return m ? `${x.icon} ${x.name}: ${m.required > 0 ? `${money(m.required)}/month for ${m.monthsLeft} months` : 'nothing more needed. You\'re covered!'}` : '';
    }).join('\n') };
  }
  return { text: goals.map((x) => {
    const m = ctx.metrics[x.id];
    if (!m) return '';
    return `${x.icon} ${x.name}: ${short(m.currentValue)} of ${short(m.target)} (${m.target ? ((m.currentValue / m.target) * 100).toFixed(1) : 0}%) · ${HEALTH_LABEL[m.health]}`;
  }).join('\n') };
}

/* ================================================================== main entry */

export function respond(state: ChatState, input: string, ctx: ChatContext): ChatResult {
  const raw = input.trim();
  const t = norm(raw);
  if (!raw) return { state, replies: [] };
  let draft = state.draft ? structuredClone(state.draft) : null;

  if (draft) {
    if (isNo(t) && draft.awaiting === 'confirm') return { state: { draft: null }, replies: [{ text: 'No problem, I didn\'t save anything.' }] };
    if (/^(cancel|stop|nevermind|never mind|forget it)\b/.test(t)) return { state: { draft: null }, replies: [{ text: 'Cancelled.' }] };
    if (draft.awaiting === 'confirm' && isYes(t)) {
      const res = execute(draft, ctx);
      return { state: { draft: null }, replies: [{ text: res.text, link: res.link }], ops: res.ops, undoLabel: res.ops.length ? 'Undo' : undefined };
    }
    // Special chip answers
    if (draft.intent === 'save' && draft.awaiting === 'split' && /^split equally$/i.test(raw)) {
      const g = activeGoals(ctx);
      draft.split = g.map((x) => ({ goalId: x.id, pct: 100 / g.length }));
    } else if (draft.intent === 'save' && draft.awaiting === 'split' && /^general savings$/i.test(raw)) {
      const assigned = (draft.split ?? []).reduce((s, x) => s + (x.amount ?? ((draft as { amount?: number }).amount ?? 0) * (x.pct ?? 0) / 100), 0);
      const rest = (draft.amount ?? 0) - assigned;
      draft.split = [...(draft.split ?? []), { goalId: null, amount: rest > 0 ? rest : draft.amount }];
    } else if (draft.intent === 'create_goal' && draft.awaiting === 'return' && /set my own/i.test(raw)) {
      return { state: { draft }, replies: [{ text: 'What yearly return should I assume? (e.g. "9%")' }] };
    } else {
      const changed = fillFromReply(draft, raw, ctx);
      if (!changed) {
        const intent = detectIntent(t, ctx);
        if (intent !== 'unknown' && intent !== draft.intent) {
          draft = null; // user moved on: handle as a fresh message below
        } else if (draft.awaiting === 'confirm') {
          return { state: { draft }, replies: [{ text: 'Say "confirm" to save, "cancel" to drop it, or tell me what to change (e.g. "make it 12k").', chips: ['Confirm', 'Cancel'] }] };
        } else {
          const q = ask(draft, ctx);
          return { state: { draft }, replies: [{ text: 'Sorry, I didn\'t catch that.' }, ...(q ? [q] : [])] };
        }
      }
    }
    if (draft) {
      const q = ask(draft, ctx);
      return { state: { draft }, replies: [q ?? confirmCard(draft, ctx)] };
    }
  }

  const intent = detectIntent(t, ctx);
  if (intent === 'unknown') {
    return { state: { draft: null }, replies: [{ text: 'I\'m not sure what to do with that yet. Here\'s what I understand:\n' + HELP_TEXT.split('\n').slice(1, 6).join('\n'), chips: ['Help', 'How am I doing?'] }] };
  }
  if (intent === 'help' || intent === 'greeting' || intent.startsWith('query')) return { state: { draft: null }, replies: [answerQuery(intent, raw, ctx)] };

  draft = buildDraft(intent as Draft['intent'], raw, ctx);
  if ((draft.intent === 'save' || draft.intent === 'withdraw' || draft.intent === 'transfer') && !liveHoldings(ctx).length && draft.intent !== 'save') {
    return { state: { draft: null }, replies: [{ text: 'You don\'t have any holdings yet. Log a saving first, like "Saved 10k in my bank account".' }] };
  }
  const q = ask(draft, ctx);
  return { state: { draft }, replies: [q ?? confirmCard(draft, ctx)] };
}
