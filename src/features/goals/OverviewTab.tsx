import { useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import type { Goal } from '@/lib/types';
import type { GoalMetrics } from '@/lib/finance/goals';
import { goalPathSeries } from '@/lib/finance/series';
import { goalInsights } from '@/lib/finance/insights';
import { fmtMonthYear, fmtMonthYearLong } from '@/lib/finance/dates';
import { formatINR, formatINRShort, formatPct } from '@/lib/finance/format';
import { Card, CardHeader } from '@/components/ui/card';
import { Segmented } from '@/components/ui/inputs';
import { InfoTip, LabelTip } from '@/components/ui/infotip';
import { ChartTooltip, axisMoney, useThemeColors } from '@/components/charts/chartUtils';
import { useStore } from '@/store/useStore';
import { useDerived } from '@/store/useDerived';
import { Insights } from '../dashboard/Insights';

export function OverviewTab({ goal, m }: { goal: Goal; m: GoalMetrics }) {
  const profile = useStore((s) => s.profile);
  const holdings = useStore((s) => s.holdings);
  const txs = useStore((s) => s.transactions);
  const vals = useStore((s) => s.valuations);
  const saveGoal = useStore((s) => s.saveGoal);
  const d = useDerived();
  const c = useThemeColors();
  const [showPlan, setShowPlan] = useState(false);

  const path = useMemo(() => goalPathSeries({ goal, holdings, txs, vals, today: d.today, target: m.target, expectedReturn: m.expectedReturn, projectionPace: m.projectionPace }), [goal, holdings, txs, vals, d.today, m]);
  const insights = useMemo(() => goalInsights({ goal, m, holdings, txs, snap: d.snap, profile, today: d.today }), [goal, m, holdings, txs, d.snap, profile, d.today]);
  const schedule = goal.planType === 'stepup' ? m.stepUpSchedule : m.flatSchedule;
  const lastYear = m.stepUpSchedule[m.stepUpSchedule.length - 1];

  return (
    <div className="space-y-5">
      {/* The one number */}
      <Card className="p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted"><LabelTip term="required">Save each month</LabelTip></p>
            <p className="mt-1 text-4xl font-semibold tracking-tight num sm:text-5xl">{m.required > 0 ? formatINR(m.required) : '₹0'}</p>
            <p className="mt-2 text-sm text-muted">
              {m.required > 0 ? <>to have {formatINRShort(m.target)} by {fmtMonthYear(goal.savingEndDate)}</> : 'You already have enough on track. Nice.'}
              {goal.planType === 'stepup' && m.required > 0 && lastYear && <>, rising to {formatINRShort(lastYear.monthly)} by {lastYear.year}</>}
            </p>
          </div>
          {m.required > 0 && (
            <div className="flex items-center gap-2">
              <Segmented size="sm" value={goal.planType} onChange={(v) => void saveGoal({ ...goal, planType: v })} options={[{ value: 'flat', label: 'Same every month' }, { value: 'stepup', label: 'Grow yearly' }]} />
              <InfoTip term="stepUp" />
            </div>
          )}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-5 text-sm">
          <div>
            <p className="text-muted">At your pace</p>
            <p className="mt-0.5 font-medium">{m.health === 'reached' ? 'Done 🎉' : m.projectedCompletion ? `Done by ${fmtMonthYear(m.projectedCompletion)}` : 'Not there yet'}</p>
          </div>
          <div>
            <p className="text-muted"><LabelTip term="expectedReturn">Expected growth</LabelTip></p>
            <p className="mt-0.5 font-medium num">{formatPct(m.expectedReturn)} a year</p>
          </div>
        </div>
      </Card>

      {insights.length > 0 && <Insights items={insights} />}

      {m.fixes.length > 0 && (
        <Card>
          <CardHeader title="Ways to catch up" subtitle="Any one of these gets you there." />
          <ul className="space-y-2 text-sm">
            {m.fixes.map((f) => (
              <li key={f.kind} className="rounded-2xl bg-subtle/60 px-4 py-3">
                {f.kind === 'save_more' && <>Save <b className="num">{formatINR(f.amount ?? 0)}</b> more a month</>}
                {f.kind === 'move_date' && <>Push the date to <b>{fmtMonthYearLong(f.date!)}</b></>}
                {f.kind === 'lower_target' && <>Lower the target by <b className="num">{formatINR(f.amount ?? 0)}</b>{f.items?.length ? <span className="text-muted"> (e.g. skip {f.items.slice(0, 2).map((i) => i.name).join(' or ')})</span> : null}</>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="Progress" />
        <div className="h-64 sm:h-72" role="img" aria-label={`${goal.name}: ${formatINR(m.currentValue)} saved, target ${formatINR(m.target)} by ${fmtMonthYear(goal.savingEndDate)}.`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={path} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gpath" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={goal.color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={goal.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={c.border} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tickFormatter={axisMoney} tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="actual" name="Saved" stroke={goal.color} strokeWidth={2.5} fill="url(#gpath)" connectNulls={false} />
              <Line type="monotone" dataKey="required" name="Where you should be" stroke={c.muted} strokeDasharray="6 4" dot={false} strokeWidth={1.5} />
              <Line type="monotone" dataKey="projected" name="At your pace" stroke={goal.color} strokeOpacity={0.45} strokeDasharray="2 3" dot={false} strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-3" style={{ backgroundColor: goal.color }} /> Saved</span>
          <span className="flex items-center gap-1.5"><span className="w-3 border-t border-dashed border-muted" /> Where you should be</span>
          <span className="flex items-center gap-1.5"><span className="w-3 border-t border-dotted" style={{ borderColor: goal.color }} /> At your pace</span>
        </div>
      </Card>

      <Card className="p-0 sm:p-0">
        <button onClick={() => setShowPlan((v) => !v)} className="flex w-full items-center justify-between px-5 py-4 text-left sm:px-6" aria-expanded={showPlan}>
          <span className="font-semibold tracking-tight">Year-by-year plan</span>
          <ChevronDown className={`h-4 w-4 text-muted transition-transform ${showPlan ? 'rotate-180' : ''}`} />
        </button>
        <AnimatePresence initial={false}>
          {showPlan && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
              <div className="overflow-x-auto border-t border-border">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="px-5 py-2 font-medium sm:px-6">Year</th>
                      <th className="px-3 py-2 text-right font-medium">Each month</th>
                      <th className="px-5 py-2 text-right font-medium sm:px-6">Total by December</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((r) => (
                      <tr key={r.year} className="border-t border-border/60">
                        <td className="px-5 py-2.5 font-medium sm:px-6">{r.year}{r.months < 12 && <span className="ml-1 text-xs text-muted">({r.months} mo)</span>}</td>
                        <td className="px-3 py-2.5 text-right num">{formatINR(r.monthly)}</td>
                        <td className="px-5 py-2.5 text-right num sm:px-6">{formatINR(r.endBalance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-5 pb-4 pt-2 text-xs text-muted sm:px-6">Includes expected growth, which is an estimate, not a guarantee.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </div>
  );
}
