import { describe, expect, it } from 'vitest';
import type { Goal, Holding } from '../types';
import { respond, initialChatState, type ChatContext, type ChatState } from './engine';
import { parseAmounts, parseDay, parseTargetMonth } from './parse';
import { baseGoal } from '../templates';
import { DEFAULT_RETURNS } from '../finance/constants';

const today = new Date(2026, 10, 20);
const bike: Goal = baseGoal({ id: 'bike', name: 'Bike', simpleTarget: { amount: 300000, inflationAdjust: false } });
const tour: Goal = baseGoal({ id: 'tour', name: 'World Tour', simpleTarget: { amount: 30000000, inflationAdjust: false } });
const H = (id: string, name: string, type: Holding['type'], valuation: Holding['valuation'] = 'market'): Holding =>
  ({ id, name, type, valuation, archived: false, createdAt: '' });
const holdings = [H('hdfc', 'HDFC Savings', 'bank', 'interest'), H('nifty', 'Nifty 50 Index Fund', 'mutual_fund'), H('dg', 'Digital Gold', 'gold', 'quantity')];

const ctx = (over: Partial<ChatContext> = {}): ChatContext => ({
  today, goals: [bike, tour], holdings, owners: { hdfc: ['bike', 'tour'], nifty: ['tour'], dg: ['bike'] }, grams: { dg: 10 },
  metrics: {}, totalValue: 0, totalInvested: 0, monthlyCapacity: 50000, defaultReturns: DEFAULT_RETURNS, ...over,
});

function chat(msgs: string[], c = ctx()) {
  let state: ChatState = initialChatState;
  let last;
  for (const m of msgs) { last = respond(state, m, c); state = last.state; }
  return last!;
}

describe('parsers', () => {
  it('amounts with Indian units', () => {
    expect(parseAmounts('saved 10k').map((a) => a.value)).toEqual([10000]);
    expect(parseAmounts('put 1.5 lakh and ₹2,500').map((a) => a.value)).toEqual([150000, 2500]);
    expect(parseAmounts('2 cr target').map((a) => a.value)).toEqual([20000000]);
    expect(parseAmounts('30% of 10k').map((a) => a.value)).toEqual([10000]);
    expect(parseAmounts('bought 5 grams for 38000').map((a) => a.value)).toEqual([38000]);
    expect(parseAmounts('saved 5k on 3rd march').map((a) => a.value)).toEqual([5000]);
  });
  it('dates', () => {
    expect(parseDay('yesterday', today)?.date).toBe('2026-11-19');
    expect(parseDay('on 5 march', today)?.date).toBe('2026-03-05');
    expect(parseDay('on dec 25', today)?.date).toBe('2025-12-25');
    expect(parseTargetMonth('by dec 2028', today)?.date).toBe('2028-12-01');
    expect(parseTargetMonth('in 3 years', today)?.date).toBe('2029-11-01');
    expect(parseTargetMonth('by 2030', today)?.date).toBe('2030-12-01');
  });
});

describe('chat: savings', () => {
  it('handles the "10k in silver, 30% / 70%" example by creating a silver holding', () => {
    let r = chat(['I saved 10k which I\'m investing in silver, 30% of it towards the bike and 70% towards the other']);
    expect(r.replies[0].card?.title).toBe('New saving');
    const lines = Object.fromEntries(r.replies[0].card!.lines);
    expect(lines.Into).toBe('Silver (new)');
    expect(lines.Bike).toContain('₹3,000');
    expect(lines['World Tour']).toContain('₹7,000');
    r = respond(r.state, 'confirm', ctx());
    const ops = r.ops!;
    expect(ops[0].kind).toBe('addHolding');
    const txs = ops.filter((o) => o.kind === 'addTx').map((o) => (o as { tx: { goalId: string; amount: number } }).tx);
    expect(txs.map((t) => [t.goalId, t.amount])).toEqual([['bike', 3000], ['tour', 7000]]);
  });

  it('pairs each percent with its own goal, and matches "bike" through the goal icon', () => {
    const enfield = baseGoal({ id: 're', name: 'Royal Enfield Himalayan', icon: '🏍️' });
    const fund = baseGoal({ id: 'ef', name: 'Emergency fund', icon: '🛟' });
    const c = ctx({ goals: [enfield, fund, tour] });
    const r = chat(['I saved 10k in hdfc, 30% for the bike and 70% for the emergency fund'], c);
    const lines = Object.fromEntries(r.replies[0].card!.lines);
    expect(lines['Royal Enfield Himalayan']).toContain('₹3,000');
    expect(lines['Emergency fund']).toContain('₹7,000');
  });

  it('asks for a missing goal and holding', () => {
    let r = chat(['saved 20k']);
    expect(r.replies[0].text).toMatch(/Where did you put/);
    r = respond(r.state, 'HDFC Savings', ctx());
    expect(r.replies[0].text).toMatch(/Which goal/);
    r = respond(r.state, 'split equally', ctx());
    expect(r.replies[0].card).toBeTruthy();
    r = respond(r.state, 'yes', ctx());
    expect(r.ops!.length).toBe(2);
  });

  it('per-goal amounts', () => {
    const r = chat(['put 6k for bike and 4k for world tour in nifty index fund']);
    const lines = Object.fromEntries(r.replies[0].card!.lines);
    expect(lines.Into).toBe('Nifty 50 Index Fund');
    expect(lines.Bike).toContain('₹6,000');
    expect(lines['World Tour']).toContain('₹4,000');
  });

  it('single goal mention gets 100% and date is parsed', () => {
    const r = chat(['deposited 25,000 in hdfc for the bike yesterday']);
    const lines = Object.fromEntries(r.replies[0].card!.lines);
    expect(lines.Bike).toContain('₹25,000');
    expect(lines.Date).toBe('19 Nov 2026');
  });
});

describe('chat: other intents', () => {
  it('withdrawal for tax asks whose money when shared', () => {
    let r = chat(['withdrew 5k from hdfc for taxes']);
    expect(r.replies[0].text).toMatch(/Whose money/);
    r = respond(r.state, 'bike', ctx());
    const lines = Object.fromEntries(r.replies[0].card!.lines);
    expect(lines.Reason).toBe('Tax');
    expect(lines.Goal).toBe('Bike');
  });

  it('transfer keeps goal tag', () => {
    const r = chat(['moved 20k from nifty fund to hdfc', 'confirm']);
    const txs = r.ops!.map((o) => (o as { tx: { kind: string; goalId: string; holdingId: string } }).tx);
    expect(txs.map((t) => [t.kind, t.holdingId, t.goalId])).toEqual([['withdrawal', 'nifty', 'tour'], ['contribution', 'hdfc', 'tour']]);
  });

  it('valuation by price per gram', () => {
    const r = chat(['gold price is 7500 per gram', 'yes']);
    const v = (r.ops![0] as { valuation: { value: number; pricePerGram: number } }).valuation;
    expect(v.value).toBe(75000);
    expect(v.pricePerGram).toBe(7500);
  });

  it('income and spending', () => {
    expect(chat(['earned 80k salary this month', 'ok']).ops![0]).toMatchObject({ kind: 'addIncome', entry: { source: 'Salary', amount: 80000 } });
    expect(chat(['spent 42k this month', 'ok']).ops![0]).toMatchObject({ kind: 'setSpending', amount: 42000 });
  });

  it('creates a goal with inflation and return questions', () => {
    let r = chat(['I want to save 5 lakh for a new car by dec 2028']);
    expect(r.replies[0].text).toMatch(/price today/);
    r = respond(r.state, 'Yes, use 6%', ctx());
    expect(r.replies[0].text).toMatch(/Where will you mostly keep/);
    r = respond(r.state, 'Mutual funds (~11%)', ctx());
    expect(r.replies[0].card?.title).toBe('🚗 Car');
    r = respond(r.state, 'confirm', ctx());
    const g = (r.ops![0] as { goal: Goal }).goal;
    expect(g.simpleTarget).toMatchObject({ inflationAdjust: true, todayCost: 500000, inflationRate: 6 });
    expect(g.savingEndDate).toBe('2028-12-01');
  });

  it('does not ask about inflation for goals within a year', () => {
    const r = chat(['I want to save 80k for a new phone in 8 months']);
    expect(r.replies[0].text).toMatch(/Where will you mostly keep/);
  });

  it('updates a goal target and deadline', () => {
    expect(chat(['change bike target to 6 lakh', 'yes']).ops![0]).toMatchObject({ kind: 'updateGoal', id: 'bike', patch: { simpleTarget: { amount: 600000 } } });
    expect(chat(['move world tour deadline to march 2033', 'yes']).ops![0]).toMatchObject({ kind: 'updateGoal', id: 'tour', patch: { savingEndDate: '2033-03-01' } });
  });

  it('cancel drops the draft', () => {
    const r = chat(['saved 5k in hdfc for bike', 'cancel']);
    expect(r.state.draft).toBeNull();
    expect(r.ops).toBeUndefined();
  });
});
