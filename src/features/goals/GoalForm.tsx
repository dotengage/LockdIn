import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import type { Goal, HoldingType, Priority } from '@/lib/types';
import { cn } from '@/lib/cn';
import { Field, MoneyInput, NumberInput, Segmented, Switch, Textarea } from '@/components/ui/inputs';
import { MonthPicker } from '@/components/ui/datepicker';
import { InfoTip, LabelTip } from '@/components/ui/infotip';
import { GOAL_COLORS } from '@/lib/finance/constants';
import { computeGoalMetrics, goalCapacity } from '@/lib/finance/goals';
import { inflationApplies } from '@/lib/finance/planner';
import { fmtMonthYear, rawMonthsBetween } from '@/lib/finance/dates';
import { formatINR, formatPct } from '@/lib/finance/format';
import { useStore } from '@/store/useStore';
import { useDerived } from '@/store/useDerived';
import { IconButton } from './NewGoalPage';

const MIX_PRESETS: { label: string; hint: string; mix: Partial<Record<HoldingType, number>> }[] = [
  { label: 'Safe', hint: 'Bank & FD', mix: { bank: 30, fd: 70 } },
  { label: 'Balanced', hint: 'FD, funds & gold', mix: { fd: 40, mutual_fund: 40, gold: 20 } },
  { label: 'Growth', hint: 'Funds & stocks', mix: { mutual_fund: 70, stocks: 30 } },
];

/** Edit form: the essentials up front, everything else under "More options". */
export function GoalForm({ goal, onChange }: { goal: Goal; onChange: (g: Goal) => void }) {
  const profile = useStore((s) => s.profile);
  const holdings = useStore((s) => s.holdings);
  const transactions = useStore((s) => s.transactions);
  const d = useDerived();
  const set = (patch: Partial<Goal>) => onChange({ ...goal, ...patch });
  const st = goal.simpleTarget ?? { amount: 0, inflationAdjust: false, inflationRate: 6 };
  const months = Math.max(0, rawMonthsBetween(d.today, goal.savingEndDate));
  const preview = useMemo(() => computeGoalMetrics(goal, d.snap, holdings, transactions, profile, d.today), [goal, d.snap, holdings, transactions, profile, d.today]);
  const todayAmount = st.inflationAdjust ? st.todayCost ?? st.amount : st.amount;

  const setEnd = (iso: string) => {
    if (goal.planner && goal.planner.spendStartDate === goal.savingEndDate) set({ savingEndDate: iso, planner: { ...goal.planner, spendStartDate: iso } });
    else set({ savingEndDate: iso });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <IconButton icon={goal.icon} onPick={(icon) => set({ icon })} />
        <input value={goal.name} onChange={(e) => set({ name: e.target.value })} aria-label="Goal name" placeholder="Goal name"
          className="h-14 min-w-0 flex-1 rounded-2xl border border-border bg-surface px-4 text-lg font-medium outline-none focus:border-accent focus:ring-4 focus:ring-accent/15" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {goal.mode === 'simple' ? (
          <Field label="How much you need">
            <MoneyInput value={todayAmount} onChange={(n) => set({ simpleTarget: st.inflationAdjust ? { ...st, todayCost: n, amount: n } : { ...st, amount: n } })} ariaLabel="Target amount" />
          </Field>
        ) : (
          <Field label="How much you need" hint="Added up from your cost list in the Plan tab.">
            <div className="flex h-11 items-center rounded-xl bg-subtle px-3.5 text-[15px] font-medium num">{formatINR(preview.target)}</div>
          </Field>
        )}
        <Field label="By when"><MonthPicker value={goal.savingEndDate} onChange={setEnd} ariaLabel="Target month" /></Field>
      </div>

      {goal.mode === 'simple' && inflationApplies(months) && (
        <div className="rounded-2xl bg-subtle/70 p-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium"><LabelTip term="inflation">Plan for rising prices</LabelTip></p>
            <Switch label="Plan for rising prices" checked={st.inflationAdjust} onCheckedChange={(v) => set({ simpleTarget: { ...st, inflationAdjust: v, todayCost: todayAmount, amount: todayAmount, inflationRate: st.inflationRate ?? 6 } })} />
          </div>
          {st.inflationAdjust && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
              <span>Prices rise</span>
              <NumberInput className="w-24" value={st.inflationRate} onChange={(n) => set({ simpleTarget: { ...st, inflationRate: n } })} suffix="%" min={0} max={20} ariaLabel="Price rise per year" />
              <span>a year, so you'll need <b className="text-fg num">{formatINR(preview.target)}</b> by {fmtMonthYear(goal.savingEndDate)}.</span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between rounded-2xl border border-border px-4 py-3 text-sm">
        <span className="text-muted">Save each month</span>
        <span className="font-semibold num">{formatINR(preview.required)}</span>
      </div>

      <MoreGoalOptions goal={goal} onChange={onChange} suggestedMonthly={preview.required} expectedReturn={preview.expectedReturn} />
    </div>
  );
}

/** Advanced settings, collapsed by default. */
export function MoreGoalOptions({ goal, onChange, suggestedMonthly, expectedReturn }: { goal: Goal; onChange: (g: Goal) => void; suggestedMonthly: number; expectedReturn?: number }) {
  const profile = useStore((s) => s.profile);
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<Goal>) => onChange({ ...goal, ...patch });
  const monthly = goal.allocation.value > 0 ? goalCapacity(goal, profile) : 0;
  const presetActive = (mix: Partial<Record<HoldingType, number>>) => goal.expectedReturnOverride == null && JSON.stringify(goal.plannedMix ?? {}) === JSON.stringify(mix);

  return (
    <div className="rounded-3xl border border-border bg-surface">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-3.5 text-sm font-medium" aria-expanded={open}>
        More options
        <ChevronDown className={cn('h-4 w-4 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="space-y-5 border-t border-border p-4">
              <Field label={<LabelTip term="monthly">Monthly amount for this goal</LabelTip>}>
                <MoneyInput value={monthly} onChange={(n) => set({ allocation: { kind: 'fixed', value: n } })} ariaLabel="Monthly amount" placeholder={Math.ceil(suggestedMonthly).toLocaleString('en-IN')} />
                {suggestedMonthly > 0 && Math.round(monthly) !== Math.ceil(suggestedMonthly / 100) * 100 && (
                  <button type="button" className="mt-1.5 text-xs font-medium text-accent hover:underline" onClick={() => set({ allocation: { kind: 'fixed', value: Math.ceil(suggestedMonthly / 100) * 100 } })}>Use {formatINR(Math.ceil(suggestedMonthly / 100) * 100)}</button>
                )}
              </Field>

              <Field label={<LabelTip term="stepUp">Saving style</LabelTip>}>
                <div className="flex flex-wrap items-center gap-2">
                  <Segmented size="sm" value={goal.planType} onChange={(v) => set({ planType: v })} options={[{ value: 'flat', label: 'Same every month' }, { value: 'stepup', label: 'Grow each January' }]} />
                  {goal.planType === 'stepup' && <NumberInput className="w-24" value={goal.stepUpRate} onChange={(n) => set({ stepUpRate: n })} suffix="%" min={0} max={50} step={1} ariaLabel="Yearly increase" />}
                </div>
              </Field>

              <Field label={<LabelTip term="expectedReturn">Where you'll keep it</LabelTip>}>
                <div className="grid grid-cols-3 gap-2">
                  {MIX_PRESETS.map((p) => (
                    <button key={p.label} type="button" onClick={() => set({ plannedMix: p.mix, expectedReturnOverride: undefined })} className={cn('rounded-2xl border px-3 py-2.5 text-left transition-all', presetActive(p.mix) ? 'border-fg ring-1 ring-fg' : 'border-border hover:border-muted')}>
                      <span className="block text-sm font-medium">{p.label}</span><span className="block text-[11px] text-muted">{p.hint}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted">{goal.expectedReturnOverride != null ? 'My own growth rate' : `Expected growth ≈ ${formatPct(expectedReturn ?? 8)} a year`}</span>
                  <div className="flex items-center gap-2">
                    {goal.expectedReturnOverride != null && <NumberInput className="w-24" value={goal.expectedReturnOverride} onChange={(n) => set({ expectedReturnOverride: n })} suffix="%" min={0} max={30} ariaLabel="Expected growth" />}
                    <Switch label="Set my own growth rate" checked={goal.expectedReturnOverride != null} onCheckedChange={(v) => set({ expectedReturnOverride: v ? Math.round((expectedReturn ?? 8) * 10) / 10 : undefined })} />
                  </div>
                </div>
              </Field>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label={<LabelTip term="priority">Priority</LabelTip>}>
                  <Segmented size="sm" value={goal.priority} onChange={(v: Priority) => set({ priority: v })} options={[{ value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }]} />
                </Field>
                <Field label="Colour">
                  <div className="flex flex-wrap gap-2 pt-1">
                    {GOAL_COLORS.map((c) => <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => set({ color: c })} className={cn('h-6 w-6 rounded-full transition-transform hover:scale-110', goal.color === c && 'ring-2 ring-fg ring-offset-2 ring-offset-surface')} style={{ backgroundColor: c }} />)}
                  </div>
                </Field>
              </div>

              <Field label="Note"><Textarea rows={2} value={goal.description ?? ''} onChange={(e) => set({ description: e.target.value || undefined })} placeholder="Why this matters to you (optional)" /></Field>
              <p className="flex items-center gap-1 text-xs text-muted">Growth rates are estimates, not guarantees. <InfoTip term="expectedReturn" /></p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
