import { useMemo, useState } from 'react';
import { addMonths, startOfMonth } from 'date-fns';
import type { Goal } from '@/lib/types';
import { computeGoalMetrics, type GoalMetrics } from '@/lib/finance/goals';
import { monthsToReach } from '@/lib/finance/compound';
import { fmtMonthYearLong, rawMonthsBetween, toISO } from '@/lib/finance/dates';
import { formatINR, formatPct } from '@/lib/finance/format';
import { Card, CardHeader } from '@/components/ui/card';
import { Slider } from '@/components/ui/inputs';
import { AssumptionNote } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { useStore } from '@/store/useStore';
import { useDerived } from '@/store/useDerived';

export function WhatIfTab({ goal, m }: { goal: Goal; m: GoalMetrics }) {
  const profile = useStore((s) => s.profile);
  const holdings = useStore((s) => s.holdings);
  const txs = useStore((s) => s.transactions);
  const saveGoal = useStore((s) => s.saveGoal);
  const d = useDerived();
  const baseInflation = goal.planner?.inflationRate ?? goal.simpleTarget?.inflationRate ?? 6;
  const inflationApplies = goal.mode === 'planner' || !!goal.simpleTarget?.inflationAdjust;
  const baseMonths = Math.max(1, rawMonthsBetween(d.today, goal.savingEndDate));

  const [monthly, setMonthly] = useState(Math.round(m.projectionPace || m.required));
  const initialRet = Math.round(m.expectedReturn * 10) / 10;
  const [ret, setRet] = useState(initialRet);
  // keep the exact return until the slider is actually moved
  const effRet = ret === initialRet ? m.expectedReturn : ret;
  const [months, setMonths] = useState(baseMonths);
  const [inflation, setInflation] = useState(baseInflation);

  const scenario = useMemo(() => {
    const end = toISO(startOfMonth(addMonths(d.today, months)));
    const delta = months - baseMonths;
    const g: Goal = structuredClone(goal);
    g.savingEndDate = end;
    g.expectedReturnOverride = effRet;
    if (g.planner) { g.planner.inflationRate = inflation; g.planner.spendStartDate = toISO(addMonths(new Date(g.planner.spendStartDate), delta)); }
    if (g.simpleTarget?.inflationAdjust) g.simpleTarget.inflationRate = inflation;
    const sm = computeGoalMetrics(g, d.snap, holdings, txs, profile, d.today);
    const reach = monthsToReach(sm.target, sm.currentValue, monthly, effRet);
    return { g, sm, reach };
  }, [goal, months, baseMonths, effRet, inflation, monthly, d, holdings, txs, profile]);

  const changed = months !== baseMonths || ret !== initialRet || inflation !== baseInflation;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Card className="space-y-7">
        <CardHeader title="Play with the numbers" subtitle="Nothing changes until you press Apply." className="mb-0" />
        <Row label="Monthly saving" value={formatINR(monthly)}>
          <Slider value={monthly} min={0} max={Math.max(10000, Math.ceil((m.required * 2.5) / 1000) * 1000, monthly)} step={500} onChange={setMonthly} label="Monthly saving" />
        </Row>
        <Row label="Expected return" value={formatPct(ret)}>
          <Slider value={ret} min={0} max={18} step={0.5} onChange={setRet} label="Expected return" />
        </Row>
        <Row label="Target date" value={fmtMonthYearLong(scenario.g.savingEndDate)}>
          <Slider value={months} min={1} max={Math.max(baseMonths * 2, baseMonths + 60)} step={1} onChange={setMonths} label="Months until target date" />
        </Row>
        {inflationApplies && (
          <Row label="Inflation" value={formatPct(inflation)}>
            <Slider value={inflation} min={0} max={15} step={0.5} onChange={setInflation} label="Inflation" />
          </Row>
        )}
        <AssumptionNote />
      </Card>

      <div className="space-y-4">
        <Card className="bg-accent-soft/60">
          <p className="text-xs font-medium uppercase tracking-wide text-accent">Scenario</p>
          <dl className="mt-4 space-y-3 text-sm">
            <Item k="Target" v={formatINR(scenario.sm.target)} was={formatINR(m.target)} />
            <Item k="Needed each month" v={formatINR(scenario.sm.requiredFlat)} was={formatINR(m.requiredFlat)} />
            <Item k={`Done at ${formatINR(monthly)}/mo`} v={scenario.reach == null ? 'Not reachable' : scenario.reach === 0 ? 'Already there' : fmtMonthYearLong(toISO(addMonths(d.today, scenario.reach)))} />
            <Item k="Gap per month" v={monthly >= scenario.sm.requiredFlat ? 'None 🎉' : formatINR(scenario.sm.requiredFlat - monthly)} />
          </dl>
        </Card>
        <div className="flex flex-col gap-2">
          <Button disabled={!changed} onClick={async () => {
            const g = { ...scenario.g };
            if (ret === initialRet) g.expectedReturnOverride = goal.expectedReturnOverride;
            await saveGoal(g);
            toast('Applied to goal');
          }}>Apply to goal</Button>
          <Button variant="outline" disabled={Math.round(m.capacity) === monthly} onClick={async () => { await saveGoal({ ...goal, allocation: { kind: 'fixed', value: monthly } }); toast('Monthly allocation updated'); }}>
            Set {formatINR(monthly)} as this goal's monthly amount
          </Button>
          <Button variant="ghost" onClick={() => { setMonthly(Math.round(m.projectionPace || m.required)); setRet(initialRet); setMonths(baseMonths); setInflation(baseInflation); }}>Reset</Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="num font-semibold">{value}</span>
      </div>
      {children}
    </div>
  );
}

function Item({ k, v, was }: { k: string; v: string; was?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right font-semibold num">{v}{was && was !== v && <span className="ml-1.5 text-xs font-normal text-muted line-through">{was}</span>}</dd>
    </div>
  );
}
