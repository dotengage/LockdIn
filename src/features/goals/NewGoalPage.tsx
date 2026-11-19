import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { addMonths, startOfMonth } from 'date-fns';
import { ArrowLeft, ArrowRight, ListChecks, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MoneyInput, NumberInput } from '@/components/ui/inputs';
import { MonthPicker } from '@/components/ui/datepicker';
import { Picker } from '@/components/ui/picker';
import { InfoTip } from '@/components/ui/infotip';
import { toast } from '@/components/ui/toast';
import { useStore } from '@/store/useStore';
import { useDerived } from '@/store/useDerived';
import { useCategories } from '@/store/useCategories';
import { baseGoal, blankPlanner } from '@/lib/templates';
import type { Goal, Holding } from '@/lib/types';
import { DEFAULT_GOAL_RETURN, GOAL_COLORS, GOAL_ICONS } from '@/lib/finance/constants';
import { computeGoalMetrics } from '@/lib/finance/goals';
import { requiredFlat, requiredStepUp } from '@/lib/finance/compound';
import { inflationApplies, inflationFactor } from '@/lib/finance/planner';
import { fmtMonthYearLong, rawMonthsBetween, toISO, todayISO } from '@/lib/finance/dates';
import { formatINR, formatINRShort } from '@/lib/finance/format';
import { newId, nowStamp } from '@/lib/ids';
import { typeInfo } from '@/lib/categories';
import { cn } from '@/lib/cn';
import { MoreGoalOptions } from './GoalForm';

const IDEAS: { name: string; icon: string; key?: 'emergency' }[] = [
  { name: 'Emergency fund', icon: '🛟', key: 'emergency' }, { name: 'New bike', icon: '🏍️' }, { name: 'Car', icon: '🚗' },
  { name: 'Home', icon: '🏠' }, { name: 'Trip', icon: '✈️' }, { name: 'Wedding', icon: '💍' },
  { name: 'New laptop', icon: '💻' }, { name: 'Education', icon: '🎓' },
];

type Step = 'what' | 'amount' | 'when' | 'prices' | 'review';

export function NewGoalPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const profile = useStore((s) => s.profile);
  const goals = useStore((s) => s.goals);
  const holdings = useStore((s) => s.holdings);
  const txs = useStore((s) => s.transactions);
  const commit = useStore((s) => s.commit);
  const d = useDerived();
  const cats = useCategories();

  const [goal, setGoal] = useState<Goal>(() => baseGoal({ name: '', color: GOAL_COLORS[goals.length % GOAL_COLORS.length], savingEndDate: toISO(startOfMonth(addMonths(new Date(), 12))) }, goals.length));
  const [amount, setAmount] = useState(0);
  const [planner, setPlanner] = useState(params.get('mode') === 'planner');
  const [rising, setRising] = useState(true);
  const [rate, setRate] = useState(6);
  const [opening, setOpening] = useState(0);
  const [openingHolding, setOpeningHolding] = useState<string>(holdings.find((h) => !h.archived)?.id ?? 'new:bank');
  const [step, setStep] = useState<Step>('what');
  const [dir, setDir] = useState(1);

  const months = Math.max(0, rawMonthsBetween(d.today, goal.savingEndDate));
  const longTerm = inflationApplies(months);
  const steps: Step[] = ['what', planner ? null : 'amount', 'when', longTerm && !planner ? 'prices' : null, 'review'].filter(Boolean) as Step[];
  const idx = steps.indexOf(step);

  // the goal as it will be saved
  const final: Goal = useMemo(() => {
    if (planner) return { ...goal, mode: 'planner', simpleTarget: undefined, planner: goal.planner ?? blankPlanner(goal.savingEndDate) };
    const adjust = longTerm && rising;
    return { ...goal, mode: 'simple', planner: undefined, simpleTarget: adjust ? { amount, inflationAdjust: true, todayCost: amount, inflationRate: rate } : { amount, inflationAdjust: false, inflationRate: rate } };
  }, [goal, planner, amount, longTerm, rising, rate]);
  const preview = useMemo(() => computeGoalMetrics(final, d.snap, holdings, txs, profile, d.today), [final, d.snap, holdings, txs, profile, d.today]);
  const monthlyNeeded = opening > 0
    ? final.planType === 'stepup'
      ? requiredStepUp(preview.target, opening, preview.expectedReturn, preview.monthsLeft, final.stepUpRate, d.today.getFullYear(), d.today.getMonth()).firstMonthly
      : requiredFlat(preview.target, opening, preview.expectedReturn, preview.monthsLeft)
    : preview.required;

  useEffect(() => { if (planner) setGoal((g) => ({ ...g, planner: g.planner ?? blankPlanner(g.savingEndDate) })); }, [planner]);

  const go = (to: Step) => { setDir(steps.indexOf(to) > idx ? 1 : -1); setStep(to); window.scrollTo({ top: 0 }); };
  const next = () => { if (idx < steps.length - 1) go(steps[idx + 1]); };
  const back = () => (idx > 0 ? go(steps[idx - 1]) : navigate(-1));
  const canNext = step === 'what' ? goal.name.trim().length > 0 : step === 'amount' ? amount > 0 : true;

  async function create() {
    const g: Goal = { ...final, name: final.name.trim(), allocation: final.allocation.value > 0 ? final.allocation : { kind: 'fixed', value: Math.ceil(monthlyNeeded / 100) * 100 }, createdAt: nowStamp(), updatedAt: nowStamp() };
    if (g.planner) g.planner = { ...g.planner, spendStartDate: g.savingEndDate };
    const newHoldings: Holding[] = [];
    let holdingId = openingHolding;
    if (opening > 0 && openingHolding.startsWith('new:')) {
      const t = openingHolding.slice(4) as Holding['type'];
      const info = typeInfo(t, cats.cats, profile?.defaultReturns);
      const h: Holding = { id: newId(), name: info.label, type: t, valuation: info.valuation, interestRate: info.valuation === 'interest' ? info.defaultReturn : undefined, archived: false, createdAt: nowStamp() };
      newHoldings.push(h);
      holdingId = h.id;
    }
    await commit({
      put: {
        goals: [g], holdings: newHoldings,
        transactions: opening > 0 ? [{ id: newId(), date: todayISO(), kind: 'contribution', holdingId, goalId: g.id, amount: opening, reason: 'opening', createdAt: nowStamp() }] : [],
      },
    });
    toast(`${g.icon} ${g.name} created`);
    navigate(`/goals/${g.id}${g.mode === 'planner' ? '?tab=plan' : ''}`, { replace: true });
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col">
      <div className="mb-8 flex items-center justify-between">
        <button onClick={back} className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-subtle hover:text-fg" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button>
        <div className="flex gap-1.5" aria-hidden>
          {steps.map((s, i) => <span key={s} className={cn('h-1.5 rounded-full transition-all duration-300', i === idx ? 'w-6 bg-fg' : i < idx ? 'w-1.5 bg-fg/60' : 'w-1.5 bg-border')} />)}
        </div>
        <button onClick={() => navigate('/goals')} className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-subtle hover:text-fg" aria-label="Cancel"><X className="h-5 w-5" /></button>
      </div>

      <form className="flex flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); if (step === 'review') void create(); else if (canNext) next(); }}>
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div key={step} custom={dir} initial={{ opacity: 0, x: dir * 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -28 }} transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }} className="flex-1">
            {step === 'what' && (
              <div className="space-y-6">
                <Q title="What are you saving for?" />
                <div className="flex items-center gap-3">
                  <IconButton icon={goal.icon} onPick={(icon) => setGoal({ ...goal, icon })} />
                  <input autoFocus value={goal.name} onChange={(e) => setGoal({ ...goal, name: e.target.value })} placeholder="e.g. New bike" aria-label="Goal name"
                    className="h-14 min-w-0 flex-1 rounded-2xl border border-border bg-surface px-4 text-lg font-medium outline-none transition-all focus:border-accent focus:ring-4 focus:ring-accent/15" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {IDEAS.map((i) => (
                    <button key={i.name} type="button" onClick={() => {
                      setGoal({ ...goal, name: i.name, icon: i.icon, priority: i.key === 'emergency' ? 'high' : goal.priority, plannedMix: i.key === 'emergency' ? { bank: 40, fd: 60 } : goal.plannedMix });
                      if (i.key === 'emergency' && profile?.avgMonthlySpending) setAmount(Math.round(profile.avgMonthlySpending * 6));
                    }} className={cn('rounded-full border px-3.5 py-2 text-sm transition-all', goal.name === i.name ? 'border-fg bg-fg text-bg' : 'border-border bg-surface hover:border-muted')}>
                      <span className="mr-1.5">{i.icon}</span>{i.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 'amount' && (
              <div className="space-y-6">
                <Q title="How much do you need?" sub="Your best guess in today's prices is perfect." />
                <BigMoney value={amount} onChange={setAmount} />
                {goal.name === 'Emergency fund' && profile?.avgMonthlySpending ? <p className="text-sm text-muted">Tip: 6 months of your spending is {formatINR(profile.avgMonthlySpending * 6)}.</p> : null}
                <button type="button" onClick={() => { setPlanner(true); go('when'); }} className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border p-4 text-left text-sm transition-colors hover:border-muted">
                  <ListChecks className="h-5 w-5 shrink-0 text-accent" />
                  <span><span className="block font-medium">Not sure? Add up the costs instead</span><span className="text-muted">List things like flights, hotels or fees and we'll total them.</span></span>
                </button>
              </div>
            )}

            {step === 'when' && (
              <div className="space-y-6">
                <Q title="When do you need it?" sub={months > 0 ? `That's ${months} month${months === 1 ? '' : 's'} from now.` : 'Pick a month.'} />
                <div className="grid grid-cols-3 gap-2">
                  {[['6 months', 6], ['1 year', 12], ['2 years', 24], ['3 years', 36], ['5 years', 60], ['10 years', 120]].map(([l, n]) => {
                    const v = toISO(startOfMonth(addMonths(new Date(), n as number)));
                    return <button key={l} type="button" onClick={() => setGoal({ ...goal, savingEndDate: v })} className={cn('rounded-2xl border py-3 text-sm font-medium transition-all', goal.savingEndDate === v ? 'border-fg bg-fg text-bg' : 'border-border bg-surface hover:border-muted')}>{l}</button>;
                  })}
                </div>
                <div>
                  <p className="mb-2 text-sm text-muted">Or pick an exact month</p>
                  <MonthPicker value={goal.savingEndDate} onChange={(v) => setGoal({ ...goal, savingEndDate: v })} ariaLabel="Target month" quick={false} />
                </div>
              </div>
            )}

            {step === 'prices' && (
              <div className="space-y-6">
                <Q title="Plan for rising prices?" sub={<span className="inline-flex items-center gap-1.5">Things usually cost more in a few years. <InfoTip term="inflation" /></span>} />
                <div className="space-y-3">
                  <Choice selected={rising} onClick={() => setRising(true)} title="Yes, plan for it" desc={`${formatINRShort(amount)} today ≈ ${formatINRShort(amount * inflationFactor(rate, months))} by ${fmtMonthYearLong(goal.savingEndDate)}`}>
                    {rising && (
                      <div className="mt-3 flex items-center gap-2 text-sm" onClick={(e) => e.stopPropagation()}>
                        <span className="text-muted">Prices rise by</span>
                        <NumberInput className="w-24" value={rate} onChange={setRate} suffix="%" min={0} max={20} ariaLabel="Price rise per year" />
                        <span className="text-muted">a year</span>
                      </div>
                    )}
                  </Choice>
                  <Choice selected={!rising} onClick={() => setRising(false)} title="No, keep it fixed" desc={`Save exactly ${formatINRShort(amount)}`} />
                </div>
              </div>
            )}

            {step === 'review' && (
              <div className="space-y-6">
                <div className="text-center">
                  <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl text-3xl" style={{ backgroundColor: `${goal.color}22` }}>{goal.icon}</span>
                  <p className="mt-3 text-lg font-semibold">{goal.name}</p>
                  {planner ? (
                    <p className="mt-6 text-sm text-muted">Next, you'll add up the costs. We'll work out the monthly amount from there.</p>
                  ) : (
                    <>
                      <p className="mt-6 text-sm text-muted">Save each month</p>
                      <p className="mt-1 text-5xl font-semibold tracking-tight num">{formatINR(monthlyNeeded)}</p>
                      <p className="mt-2 text-sm text-muted">to have {formatINR(preview.target)} by {fmtMonthYearLong(goal.savingEndDate)}</p>
                    </>
                  )}
                </div>
                <div className="rounded-3xl border border-border bg-surface p-4">
                  <p className="text-sm font-medium">Already saved some for this?</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <MoneyInput value={opening} onChange={setOpening} ariaLabel="Already saved" placeholder="0" />
                    <Picker value={openingHolding} onChange={setOpeningHolding} ariaLabel="Where it's kept" options={cats.holdingOptions(holdings.filter((h) => !h.archived), { allowNew: true })} />
                  </div>
                </div>
                <MoreGoalOptions goal={goal} onChange={setGoal} suggestedMonthly={monthlyNeeded} />
                {preview.returnSource === 'default' && <p className="text-center text-xs text-muted">Assumes about {DEFAULT_GOAL_RETURN}% yearly growth. You can change this under More options.</p>}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="sticky bottom-16 -mx-4 mt-10 bg-gradient-to-t from-bg via-bg to-transparent px-4 pb-4 pt-6 lg:bottom-0">
          <Button type="submit" size="lg" className="w-full" disabled={!canNext}>
            {step === 'review' ? (planner ? 'Create & add costs' : 'Create goal') : <>Continue <ArrowRight className="h-4 w-4" /></>}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Q({ title, sub }: { title: string; sub?: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-[34px]">{title}</h1>
      {sub && <p className="mt-2 text-[15px] text-muted">{sub}</p>}
    </div>
  );
}

export function BigMoney({ value, onChange, autoFocus = true }: { value: number; onChange: (n: number) => void; autoFocus?: boolean }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 border-b-2 border-border pb-2 transition-colors focus-within:border-accent">
        <span className="text-4xl font-semibold text-muted">₹</span>
        <input
          autoFocus={autoFocus}
          inputMode="numeric"
          aria-label="Amount"
          value={value ? value.toLocaleString('en-IN') : ''}
          placeholder="0"
          onChange={(e) => onChange(parseInt(e.target.value.replace(/[^0-9]/g, '') || '0', 10))}
          className="num w-full min-w-0 bg-transparent text-5xl font-semibold tracking-tight outline-none placeholder:text-border"
        />
      </div>
      <p className="mt-2 h-5 text-sm text-muted">{value >= 1000 ? `${formatINRShort(value)}` : ''}</p>
    </div>
  );
}

function Choice({ selected, onClick, title, desc, children }: { selected: boolean; onClick: () => void; title: string; desc: string; children?: React.ReactNode }) {
  return (
    <div role="radio" aria-checked={selected} tabIndex={0} onClick={onClick} onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && onClick()}
      className={cn('cursor-pointer rounded-3xl border p-5 transition-all', selected ? 'border-fg bg-surface shadow-soft ring-1 ring-fg' : 'border-border bg-surface hover:border-muted')}>
      <div className="flex items-center gap-3">
        <span className={cn('flex h-5 w-5 items-center justify-center rounded-full border-2', selected ? 'border-fg' : 'border-border')}>{selected && <span className="h-2.5 w-2.5 rounded-full bg-fg" />}</span>
        <span><span className="block font-medium">{title}</span><span className="block text-sm text-muted">{desc}</span></span>
      </div>
      {children}
    </div>
  );
}

export function IconButton({ icon, onPick }: { icon: string; onPick: (i: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface text-2xl transition-transform hover:scale-105" aria-label="Choose icon">{icon}</button>
      {open && (
        <div className="absolute left-0 top-16 z-20 grid w-64 grid-cols-6 gap-1 rounded-2xl border border-border bg-surface p-2 shadow-lift">
          {GOAL_ICONS.map((i) => <button key={i} type="button" onClick={() => { onPick(i); setOpen(false); }} className="flex h-9 w-9 items-center justify-center rounded-xl text-lg hover:bg-subtle">{i}</button>)}
        </div>
      )}
    </div>
  );
}
