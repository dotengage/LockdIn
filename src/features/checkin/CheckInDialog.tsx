import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Copy, Plus, X } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, MoneyInput, NumberInput, Textarea } from '@/components/ui/inputs';
import { Picker } from '@/components/ui/picker';
import { DatePicker } from '@/components/ui/datepicker';
import { useCategories } from '@/store/useCategories';
import { toast } from '@/components/ui/toast';
import { useStore } from '@/store/useStore';
import { useDerived } from '@/store/useDerived';
import { useUI } from '@/store/useUI';
import { cn } from '@/lib/cn';
import type { CheckIn, Holding, HoldingTypeId, IncomeEntry, Transaction } from '@/lib/types';
import { periodFor, periodsPerMonth, todayISO, type Period } from '@/lib/finance/dates';
import { formatINR, formatPct } from '@/lib/finance/format';
import { avgIncome } from '@/lib/finance/goals';
import { newId, nowStamp } from '@/lib/ids';

const GENERAL = '__general';
interface Split { holdingId: string; newType?: HoldingTypeId; amount: number; grams?: number }

const STEPS = ['Period', 'Income', 'Spending', 'Savings', 'Where it went', 'Summary'];

export function CheckInDialog() {
  const state = useUI((s) => s.checkIn);
  const close = useUI((s) => s.closeCheckIn);
  return state.open ? <CheckInFlow key={`${state.periodStart}-${state.editId}`} editId={state.editId} initialPeriod={state.periodStart} onClose={close} /> : null;
}

function CheckInFlow({ editId, initialPeriod, onClose }: { editId?: string; initialPeriod?: string; onClose: () => void }) {
  const profile = useStore((s) => s.profile)!;
  const goals = useStore((s) => s.goals);
  const holdings = useStore((s) => s.holdings);
  const checkIns = useStore((s) => s.checkIns);
  const transactions = useStore((s) => s.transactions);
  const saveCheckIn = useStore((s) => s.saveCheckIn);
  const patchMeta = useStore((s) => s.patchMeta);
  const meta = useStore((s) => s.meta);
  const d = useDerived();
  const cats = useCategories();
  const freq = profile.checkInFrequency;
  const weekStart = freq === 'weekly' ? profile.checkInDay : 1;
  const editing = checkIns.find((c) => c.id === editId);
  const activeGoals = d.activeGoals;
  const liveHoldings = holdings.filter((h) => !h.archived);

  const [step, setStep] = useState(editing ? 1 : 0);
  const [period, setPeriod] = useState<Period>(() =>
    editing ? periodFor(editing.periodStart, freq, weekStart) : initialPeriod ? periodFor(initialPeriod, freq, weekStart) : d.missedPeriods.length && d.checkInDone ? d.missedPeriods[d.missedPeriods.length - 1] : d.currentPeriod);
  const existing = editing ?? checkIns.find((c) => c.periodStart === period.start);
  const factor = freq === 'weekly' ? 12 / 52 : 1;

  const defaultIncome = (): IncomeEntry[] => {
    const inc = Math.round(avgIncome(profile) * factor);
    const list: IncomeEntry[] = [];
    if (inc > 0) list.push({ source: profile.employmentStatus === 'salaried' ? 'Salary' : profile.employmentStatus === 'self_employed' ? 'Freelance' : 'Business', amount: inc });
    if (profile.otherIncome > 0) list.push({ source: 'Family support', amount: Math.round(profile.otherIncome * factor) });
    return list.length ? list : [{ source: 'Salary', amount: 0 }];
  };

  const [incomes, setIncomes] = useState<IncomeEntry[]>([]);
  const [spending, setSpending] = useState<number>(0);
  const [note, setNote] = useState('');
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [splits, setSplits] = useState<Record<string, Split[]>>({});
  const [loadedFor, setLoadedFor] = useState<string>('');

  // Load data for the chosen period (existing check-in or defaults)
  useEffect(() => {
    if (loadedFor === period.start) return;
    setLoadedFor(period.start);
    const ci = editing ?? checkIns.find((c) => c.periodStart === period.start);
    setIncomes(ci ? ci.incomes.map((i) => ({ ...i })) : defaultIncome());
    setSpending(ci?.spending ?? Math.round(profile.avgMonthlySpending * factor));
    setNote(ci?.note ?? '');
    const linked = ci ? transactions.filter((t) => t.checkInId === ci.id && t.kind === 'contribution') : [];
    const a: Record<string, number> = {};
    const s: Record<string, Split[]> = {};
    for (const t of linked) {
      const k = t.goalId ?? GENERAL;
      a[k] = (a[k] ?? 0) + t.amount;
      (s[k] ??= []).push({ holdingId: t.holdingId, amount: t.amount, grams: t.quantityGrams });
    }
    setAmounts(a);
    setSplits(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.start]);

  const income = incomes.reduce((s, i) => s + (i.amount || 0), 0);
  const saved = Object.values(amounts).reduce((s, v) => s + (v || 0), 0);
  const ppm = periodsPerMonth(freq);
  const owners = [...activeGoals.map((g) => g.id), GENERAL];

  const lastSplitTemplate = useMemo(() => {
    // most recent check-in (other than this one) with contributions → per-goal holding shares
    const others = [...checkIns].filter((c) => c.id !== existing?.id).sort((a, b) => b.periodStart.localeCompare(a.periodStart));
    for (const c of others) {
      const linked = transactions.filter((t) => t.checkInId === c.id && t.kind === 'contribution');
      if (!linked.length) continue;
      const byGoal: Record<string, { holdingId: string; share: number }[]> = {};
      const totals: Record<string, number> = {};
      for (const t of linked) totals[t.goalId ?? GENERAL] = (totals[t.goalId ?? GENERAL] ?? 0) + t.amount;
      for (const t of linked) {
        const k = t.goalId ?? GENERAL;
        (byGoal[k] ??= []).push({ holdingId: t.holdingId, share: t.amount / totals[k] });
      }
      return { byGoal, amounts: totals };
    }
    return null;
  }, [checkIns, transactions, existing?.id]);

  const defaultHolding = lastSplitTemplate ? Object.values(lastSplitTemplate.byGoal)[0]?.[0]?.holdingId : liveHoldings[0]?.id;

  const goToWhere = () => {
    // ensure each goal with an amount has splits that add up
    const next: Record<string, Split[]> = {};
    for (const k of owners) {
      const amt = amounts[k] || 0;
      if (amt <= 0) continue;
      const cur = splits[k] ?? [];
      const sum = cur.reduce((s, x) => s + x.amount, 0);
      if (cur.length && Math.abs(sum - amt) < 1) next[k] = cur;
      else if (cur.length === 1) next[k] = [{ ...cur[0], amount: amt }];
      else if (!cur.length) {
        const tpl = lastSplitTemplate?.byGoal[k];
        next[k] = tpl ? tpl.map((t) => ({ holdingId: t.holdingId, amount: Math.round(amt * t.share) })) : [{ holdingId: defaultHolding ?? 'new', newType: 'bank', amount: amt }];
        const diff = amt - next[k].reduce((s, x) => s + x.amount, 0);
        next[k][0].amount += diff;
      } else next[k] = cur;
    }
    setSplits(next);
    setStep(4);
  };

  const splitProblems = owners.filter((k) => (amounts[k] || 0) > 0 && Math.abs((splits[k] ?? []).reduce((s, x) => s + x.amount, 0) - amounts[k]) > 1);

  async function save() {
    const ci: CheckIn = {
      id: existing?.id ?? newId(), periodStart: period.start, periodEnd: period.end,
      incomes: incomes.filter((i) => i.amount > 0 || incomes.length === 1), spending, note: note || undefined, createdAt: existing?.createdAt ?? nowStamp(),
    };
    const date = period.end < todayISO() ? period.end : todayISO();
    const newHoldings: Holding[] = [];
    const newByType: Partial<Record<string, string>> = {};
    const resolve = (sp: Split) => {
      if (sp.holdingId !== 'new') return sp.holdingId;
      const t = sp.newType ?? 'bank';
      if (!newByType[t]) {
        const ti = cats.info(t);
        const h: Holding = { id: newId(), name: ti.label, type: t, valuation: ti.valuation, interestRate: ti.valuation === 'interest' ? ti.defaultReturn : undefined, archived: false, createdAt: nowStamp() };
        newHoldings.push(h);
        newByType[t] = h.id;
      }
      return newByType[t]!;
    };
    const txs: Transaction[] = [];
    for (const k of owners) {
      if ((amounts[k] || 0) <= 0) continue;
      for (const sp of splits[k] ?? []) {
        if (sp.amount <= 0) continue;
        txs.push({ id: newId(), date, kind: 'contribution', holdingId: resolve(sp), goalId: k === GENERAL ? null : k, amount: sp.amount, quantityGrams: sp.grams || undefined, reason: 'saving', checkInId: ci.id, createdAt: nowStamp() });
      }
    }
    await saveCheckIn(ci, txs, newHoldings);
    if (meta.skippedPeriods.includes(period.start)) await patchMeta({ skippedPeriods: meta.skippedPeriods.filter((p) => p !== period.start) });
    toast(existing ? 'Check-in updated' : 'Check-in saved. Nice work!');
    onClose();
  }

  const canNext = step !== 4 || splitProblems.length === 0;
  const next = () => { if (step === 3) { saved > 0 ? goToWhere() : setStep(5); } else setStep(step + 1); };
  const back = () => { if (step === 5 && saved <= 0) setStep(3); else setStep(step - 1); };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title={existing ? `Check-in · ${period.label}` : 'Check in'} description={step > 0 ? `${period.label} · step ${step} of ${STEPS.length - 1}` : 'Log what came in and what you saved.'} size="lg"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          {step > (editing ? 1 : 0) ? <Button variant="ghost" onClick={back}><ArrowLeft className="h-4 w-4" /> Back</Button> : <span />}
          {step < 5 ? <Button onClick={next} disabled={!canNext}>Next <ArrowRight className="h-4 w-4" /></Button> : <Button onClick={() => void save()}>Save check-in</Button>}
        </div>
      }
    >
      <div className="mb-5 flex gap-1" aria-hidden>
        {STEPS.map((s, i) => <div key={s} className={cn('h-1 flex-1 rounded-full transition-colors', i <= step ? 'bg-accent' : 'bg-subtle')} />)}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }} className="space-y-4">
          {step === 0 && (
            <PeriodStep period={period} setPeriod={setPeriod} freq={freq} weekStart={weekStart} />
          )}

          {step === 1 && (
            <>
              <p className="text-sm text-muted">What did you earn this period? 0 is completely fine.</p>
              {incomes.map((inc, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Picker className="w-44" ariaLabel="Source" value={inc.source} options={cats.incomeOptions(inc.source)}
                    onChange={(v) => setIncomes(incomes.map((x, j) => (j === i ? { ...x, source: v } : x)))}
                    onCreate={cats.addIncomeSource} createLabel="Add a source" createPlaceholder="e.g. YouTube" onRemove={cats.removeIncomeSource} />
                  <MoneyInput className="flex-1" value={inc.amount} onChange={(n) => setIncomes(incomes.map((x, j) => (j === i ? { ...x, amount: n } : x)))} ariaLabel={`${inc.source} amount`} />
                  {incomes.length > 1 && <button className="rounded-lg p-2 text-muted hover:bg-subtle" aria-label="Remove source" onClick={() => setIncomes(incomes.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button>}
                </div>
              ))}
              <Button size="sm" variant="ghost" onClick={() => setIncomes([...incomes, { source: 'Freelance', amount: 0 }])}><Plus className="h-3.5 w-3.5" /> Add source</Button>
              <p className="text-sm">Total: <b className="num">{formatINR(income)}</b></p>
            </>
          )}

          {step === 2 && (
            <>
              <Field label="How much did you spend this period?" hint={`Optional. Pre-filled from your usual ${formatINR(profile.avgMonthlySpending)}/month${freq === 'weekly' ? ', scaled to a week' : ''}.`}>
                <MoneyInput value={spending} onChange={setSpending} />
              </Field>
              <Field label="Note" hint="Optional"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything worth remembering" /></Field>
            </>
          )}

          {step === 3 && (
            <>
              <p className="text-sm text-muted">How much did you save towards each goal? The hint shows what's needed per {freq === 'weekly' ? 'week' : 'month'}.</p>
              {lastSplitTemplate && !saved && (
                <Button size="sm" variant="secondary" onClick={() => setAmounts(Object.fromEntries(Object.entries(lastSplitTemplate.amounts).filter(([k]) => owners.includes(k))))}><Copy className="h-3.5 w-3.5" /> Same as last time</Button>
              )}
              {activeGoals.map((g) => {
                const need = d.metrics[g.id].required / ppm;
                const v = amounts[g.id] || 0;
                const ratio = need > 0 ? v / need : 1;
                const dot = v === 0 && need > 0 ? 'bg-border' : ratio >= 1 ? 'bg-gain' : ratio >= 0.8 ? 'bg-warn' : 'bg-loss';
                return (
                  <div key={g.id} className="flex items-center gap-3 rounded-2xl border border-border p-3">
                    <span className="text-xl">{g.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{g.name}</p>
                      <p className="flex items-center gap-1.5 text-xs text-muted num"><span className={cn('h-2 w-2 rounded-full', dot)} />Needed {formatINR(need)}</p>
                    </div>
                    <MoneyInput className="w-36" value={amounts[g.id]} onChange={(n) => setAmounts({ ...amounts, [g.id]: n })} ariaLabel={`Saved for ${g.name}`} />
                  </div>
                );
              })}
              <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border p-3">
                <span className="text-xl">🪙</span>
                <div className="min-w-0 flex-1"><p className="text-sm font-medium">General savings</p><p className="text-xs text-muted">Not for any goal yet</p></div>
                <MoneyInput className="w-36" value={amounts[GENERAL]} onChange={(n) => setAmounts({ ...amounts, [GENERAL]: n })} ariaLabel="General savings" />
              </div>
              {!activeGoals.length && <p className="text-xs text-muted">No active goals yet. You can still log general savings.</p>}
            </>
          )}

          {step === 4 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted">Where did the money go? Pick a holding, or create one.</p>
                {liveHoldings.length > 0 && (
                  <Picker size="sm" className="w-48" ariaLabel="Put everything in one holding" value={undefined} placeholder="Put all in…" align="end"
                    options={cats.holdingOptions(liveHoldings)}
                    onChange={(id) => setSplits(Object.fromEntries(owners.filter((k) => (amounts[k] || 0) > 0).map((k) => [k, [{ holdingId: id, amount: amounts[k] }]])))} />
                )}
              </div>
              {owners.filter((k) => (amounts[k] || 0) > 0).map((k) => {
                const g = goals.find((x) => x.id === k);
                const list = splits[k] ?? [];
                const sum = list.reduce((s, x) => s + x.amount, 0);
                const diff = amounts[k] - sum;
                return (
                  <div key={k} className="space-y-2 rounded-2xl border border-border p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{g ? `${g.icon} ${g.name}` : '🪙 General savings'}</span>
                      <span className="num text-muted">{formatINR(amounts[k])}</span>
                    </div>
                    {list.map((sp, i) => {
                      const h = holdings.find((x) => x.id === sp.holdingId);
                      const qty = (h?.valuation ?? cats.info(sp.newType ?? 'bank').valuation) === 'quantity';
                      const upd = (p: Partial<Split>) => setSplits({ ...splits, [k]: list.map((x, j) => (j === i ? { ...x, ...p } : x)) });
                      return (
                        <div key={i} className="flex flex-wrap items-center gap-2">
                          <div className="min-w-[160px] flex-1">
                            <Picker ariaLabel="Holding" value={sp.holdingId === 'new' ? `new:${sp.newType}` : sp.holdingId} options={cats.holdingOptions(liveHoldings, { allowNew: true })}
                              onChange={(v) => upd(v.startsWith('new:') ? { holdingId: 'new', newType: v.slice(4) as HoldingTypeId } : { holdingId: v, newType: undefined })} />
                          </div>
                          <MoneyInput className="w-32" value={sp.amount} onChange={(n) => upd({ amount: n })} ariaLabel="Amount" />
                          {qty && <NumberInput className="w-24" value={sp.grams} onChange={(n) => upd({ grams: n })} suffix="g" step={0.01} ariaLabel="Grams" placeholder="grams" />}
                          {list.length > 1 && <button className="rounded-lg p-2 text-muted hover:bg-subtle" aria-label="Remove" onClick={() => setSplits({ ...splits, [k]: list.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></button>}
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between">
                      <Button size="sm" variant="ghost" onClick={() => setSplits({ ...splits, [k]: [...list, { holdingId: liveHoldings[0]?.id ?? 'new', newType: 'bank', amount: Math.max(0, diff) }] })}><Plus className="h-3.5 w-3.5" /> Split across another holding</Button>
                      {Math.abs(diff) > 1 && <span className="text-xs text-warn num">{diff > 0 ? `${formatINR(diff)} left to place` : `${formatINR(-diff)} too much`}</span>}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {step === 5 && (
            <Summary income={income} spending={spending} saved={saved} amounts={amounts} />
          )}
        </motion.div>
      </AnimatePresence>
    </Dialog>
  );
}

function PeriodStep({ period, setPeriod, freq, weekStart }: { period: Period; setPeriod: (p: Period) => void; freq: 'weekly' | 'monthly'; weekStart: number }) {
  const d = useDerived();
  const checkIns = useStore((s) => s.checkIns);
  const meta = useStore((s) => s.meta);
  const patchMeta = useStore((s) => s.patchMeta);
  const done = new Set(checkIns.map((c) => c.periodStart));
  const options = [d.currentPeriod, ...[...d.missedPeriods].reverse()];
  // the custom date picked below (kept so the field shows it); cleared when a listed period is chosen
  const [picked, setPicked] = useState<string | undefined>(() => (options.some((o) => o.start === period.start) ? undefined : period.start));
  return (
    <>
      {d.missedPeriods.length > 0 && (
        <div className="rounded-2xl bg-accent-soft p-4 text-sm">
          You missed {d.missedPeriods.length} check-in{d.missedPeriods.length > 1 ? 's' : ''}. Fill them now, or skip them. Both are fine.
          <div className="mt-2"><Button size="sm" variant="ghost" onClick={async () => { await patchMeta({ skippedPeriods: [...new Set([...meta.skippedPeriods, ...d.missedPeriods.map((p) => p.start)])] }); toast('Skipped. Only the current period is left.'); setPeriod(d.currentPeriod); }}>Skip missed ones</Button></div>
        </div>
      )}
      <div className="space-y-2">
        {options.map((p) => (
          <button key={p.start} onClick={() => { setPicked(undefined); setPeriod(p); }} className={cn('flex w-full items-center justify-between rounded-2xl border p-4 text-left transition-all', period.start === p.start ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-border hover:bg-subtle')}>
            <span><span className="block text-sm font-medium">{p.label}</span><span className="text-xs text-muted">{p.start === d.currentPeriod.start ? 'Current period' : 'Missed'}</span></span>
            {done.has(p.start) && <span className="text-xs font-medium text-gain">Done · edit</span>}
          </button>
        ))}
      </div>
      <Field label="Or pick another date" hint="We'll use the period that contains it.">
        <DatePicker value={picked} placeholder="Pick a date" max={todayISO()} onChange={(v) => { setPicked(v); setPeriod(periodFor(v, freq, weekStart)); }} ariaLabel="Pick another date" />
        {picked && <p className="mt-1.5 text-xs text-muted">Logging for {periodFor(picked, freq, weekStart).label}</p>}
      </Field>
    </>
  );
}

function Summary({ income, spending, saved, amounts }: { income: number; spending: number; saved: number; amounts: Record<string, number> }) {
  const d = useDerived();
  const goals = useStore((s) => s.goals);
  const rate = income > 0 ? (saved / income) * 100 : null;
  const best = Object.entries(amounts).filter(([k, v]) => v > 0 && k !== GENERAL).sort((a, b) => b[1] - a[1])[0];
  const g = best ? goals.find((x) => x.id === best[0]) : undefined;
  const m = g ? d.metrics[g.id] : undefined;
  const pct = m && m.target ? Math.min(100, ((m.currentValue + best![1]) / m.target) * 100) : null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Income', formatINR(income)], ['Spending', formatINR(spending)], ['Saved', formatINR(saved)], ['Savings rate', rate == null ? '–' : formatPct(rate, 0)]].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-subtle p-4"><p className="text-xs text-muted">{k}</p><p className="mt-1 font-semibold num">{v}</p></div>
        ))}
      </div>
      <p className="rounded-2xl bg-accent-soft p-4 text-sm leading-relaxed">
        {saved <= 0 ? 'No savings this period, and that\'s okay. Logging it still keeps your picture accurate.' : (
          <>{rate != null ? <>You saved <b>{formatPct(rate, 0)}</b> of your income this period. </> : <>You saved <b>{formatINR(saved)}</b> this period. </>}
            {g && pct != null && <>Your {g.name} goal will be <b>{pct.toFixed(1)}%</b> complete.</>}</>
        )}
      </p>
    </div>
  );
}
