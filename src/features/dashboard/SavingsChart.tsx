import { useMemo, useState } from 'react';
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardHeader } from '@/components/ui/card';
import { Segmented, Switch } from '@/components/ui/inputs';
import { Picker } from '@/components/ui/picker';
import { ChartTooltip, axisMoney, useThemeColors } from '@/components/charts/chartUtils';
import { useStore } from '@/store/useStore';
import { useDerived } from '@/store/useDerived';
import { goalPathSeries, savingsSeries, type Timeframe } from '@/lib/finance/series';
import { formatINR } from '@/lib/finance/format';

export function SavingsChart({ fixedGoalId }: { fixedGoalId?: string }) {
  const goals = useStore((s) => s.goals);
  const holdings = useStore((s) => s.holdings);
  const txs = useStore((s) => s.transactions);
  const vals = useStore((s) => s.valuations);
  const profile = useStore((s) => s.profile);
  const d = useDerived();
  const c = useThemeColors();
  const [tf, setTf] = useState<Timeframe>('monthly');
  const [goalId, setGoalId] = useState<string>(fixedGoalId ?? 'all');
  const [showInvested, setShowInvested] = useState(false);
  const selected = goalId === 'all' ? null : goalId;
  const goal = goals.find((g) => g.id === selected);

  const data = useMemo(() => {
    const pts = savingsSeries({ goals, holdings, txs, vals, goalId: selected, tf, today: d.today, weekStart: profile?.checkInFrequency === 'weekly' ? profile.checkInDay : 1 });
    if (goal) {
      const m = d.metrics[goal.id];
      const path = goalPathSeries({ goal, holdings, txs, vals, today: d.today, target: m.target, expectedReturn: m.expectedReturn, projectionPace: m.projectionPace });
      const byMonth = new Map(path.map((p) => [p.date.slice(0, 7), p.required]));
      for (const p of pts) {
        const r = byMonth.get(p.end.slice(0, 7)) ?? byMonth.get(p.start.slice(0, 7));
        if (r != null) p.required = r;
      }
    }
    return pts.map((p) => ({ ...p, band: [p.invested, p.value] as [number, number] }));
  }, [goals, holdings, txs, vals, selected, tf, d, goal, profile]);

  const goalsInData = goals.filter((g) => data.some((p) => (p.saved[g.id] ?? 0) > 0));
  const last = data[data.length - 1];
  const totalSaved = data.reduce((s, p) => s + p.savedTotal, 0);
  const gainUp = (last?.value ?? 0) >= (last?.invested ?? 0);

  return (
    <Card>
      <CardHeader
        title="Savings over time"
        subtitle={`${formatINR(totalSaved)} saved in this period`}
        action={!fixedGoalId && (
          <Picker size="sm" className="w-44" value={goalId} onChange={setGoalId} ariaLabel="Filter by goal" align="end"
            options={[{ value: 'all', label: 'All goals' }, ...goals.filter((g) => g.status !== 'archived').map((g) => ({ value: g.id, label: g.name, icon: <span>{g.icon}</span> }))]} />
        )}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented size="sm" value={tf} onChange={setTf} ariaLabel="Timeframe" options={[{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }, { value: 'all', label: 'All time' }]} />
        <label className="flex items-center gap-2 text-xs text-muted">
          <Switch checked={showInvested} onCheckedChange={setShowInvested} label="Compare with what you put in" /> Compare with what you put in
        </label>
      </div>
      <div className="h-72 sm:h-80" role="img" aria-label={`Savings chart, ${tf}. ${data.length} periods. Latest value ${formatINR(last?.value ?? 0)}, invested ${formatINR(last?.invested ?? 0)}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={c.border} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={12} />
            <YAxis yAxisId="bars" hide />
            <YAxis yAxisId="line" orientation="right" tickFormatter={axisMoney} tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
            <Tooltip
              cursor={{ fill: c.subtle }}
              content={<ChartTooltip rows={(p) => {
                const pt = p as (typeof data)[number];
                const rows = goalsInData.filter((g) => (pt.saved[g.id] ?? 0) > 0).map((g) => ({ name: `Saved · ${g.name}`, value: pt.saved[g.id], color: g.color }));
                rows.push({ name: 'Value', value: pt.value, color: c.accent });
                if (showInvested) rows.push({ name: 'Invested', value: pt.invested, color: c.muted });
                if (pt.required != null) rows.push({ name: 'Required path', value: pt.required, color: c.muted });
                return rows;
              }} />}
            />
            {showInvested && <Area yAxisId="line" dataKey="band" stroke="none" fill={gainUp ? c.gain : c.loss} fillOpacity={0.12} isAnimationActive animationDuration={300} />}
            {(selected ? [goal!].filter(Boolean) : goalsInData).map((g, i, arr) => (
              <Bar key={g.id} yAxisId="bars" dataKey={`g_${g.id}`} name={g.name} stackId="s" fill={g.color} radius={i === arr.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]} maxBarSize={36} animationDuration={300} />
            ))}
            <Line yAxisId="line" type="monotone" dataKey="value" name="Value" stroke={c.accent} strokeWidth={2.5} dot={false} animationDuration={300} />
            {showInvested && <Line yAxisId="line" type="monotone" dataKey="invested" name="Invested" stroke={c.muted} strokeWidth={1.5} dot={false} animationDuration={300} />}
            {selected && <Line yAxisId="line" type="monotone" dataKey="required" name="Required path" stroke={c.muted} strokeDasharray="6 4" strokeWidth={1.5} dot={false} connectNulls animationDuration={300} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-muted/50" /> Saved</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 bg-accent" /> Total value</span>
        {selected && <span className="flex items-center gap-1.5"><span className="w-3 border-t border-dashed border-muted" /> Where you should be</span>}
      </div>
    </Card>
  );
}
