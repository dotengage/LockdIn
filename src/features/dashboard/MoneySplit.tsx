import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardHeader } from '@/components/ui/card';
import { Segmented } from '@/components/ui/inputs';
import { ChartTooltip, axisMoney, useThemeColors } from '@/components/charts/chartUtils';
import { useStore } from '@/store/useStore';
import { useDerived } from '@/store/useDerived';
import { useCategories } from '@/store/useCategories';
import { formatINRShort, formatPct } from '@/lib/finance/format';
import { UNASSIGNED } from '@/lib/finance/ledger';

export function MoneySplit() {
  const holdings = useStore((s) => s.holdings);
  const goals = useStore((s) => s.goals);
  const d = useDerived();
  const c = useThemeColors();
  const { info } = useCategories();
  const [view, setView] = useState<'type' | 'goal'>('type');

  const byType = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of holdings) m.set(h.type, (m.get(h.type) ?? 0) + (d.snap.holdings[h.id]?.value ?? 0));
    return [...m.entries()].filter(([, v]) => v > 0.5).map(([t, v]) => ({ type: t, name: info(t as never).label, value: v, color: info(t as never).color })).sort((a, b) => b.value - a.value);
  }, [holdings, d.snap, info]);
  const total = byType.reduce((s, x) => s + x.value, 0);

  const typeIds = byType.map((x) => x.type);
  const byGoal = useMemo(() => {
    const owners = [...goals.filter((g) => g.status !== 'archived').map((g) => ({ id: g.id, name: g.name })), { id: UNASSIGNED, name: 'General' }];
    return owners.map((o) => {
      const row: Record<string, number | string> = { name: o.name };
      let sum = 0;
      for (const h of holdings) {
        const v = d.snap.goalByHolding[o.id]?.[h.id]?.value ?? 0;
        if (v > 0) { row[h.type] = ((row[h.type] as number) ?? 0) + v; sum += v; }
      }
      row.total = sum;
      return row;
    }).filter((r) => (r.total as number) > 0.5);
  }, [goals, holdings, d.snap]);

  return (
    <Card>
      <CardHeader title="Where your money is" action={<Segmented size="sm" value={view} onChange={setView} options={[{ value: 'type', label: 'By type' }, { value: 'goal', label: 'By goal' }]} />} />
      {view === 'type' ? (
        <div className="grid items-center gap-6 sm:grid-cols-[200px_1fr]">
          <div className="relative mx-auto h-48 w-48" role="img" aria-label={`Donut chart: ${byType.map((x) => `${x.name} ${formatPct((x.value / total) * 100, 0)}`).join(', ')}`}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={byType} dataKey="value" nameKey="name" innerRadius={66} outerRadius={90} paddingAngle={2} cornerRadius={4} strokeWidth={0} animationDuration={500}>
                  {byType.map((x) => <Cell key={x.type} fill={x.color} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xs text-muted">Total</span>
              <span className="num text-lg font-semibold">{formatINRShort(total)}</span>
            </div>
          </div>
          <ul className="space-y-2.5">
            {byType.map((x) => (
              <li key={x.type} className="flex items-center gap-3 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: x.color }} />
                <span className="min-w-0 flex-1 truncate">{x.name}</span>
                <span className="num text-muted">{formatPct((x.value / total) * 100, 0)}</span>
                <span className="num w-20 text-right font-medium">{formatINRShort(x.value)}</span>
              </li>
            ))}
            <li className="pt-1"><Link to="/holdings" className="text-sm text-muted hover:text-fg">See all holdings →</Link></li>
          </ul>
        </div>
      ) : (
        <div style={{ height: Math.max(160, byGoal.length * 48 + 40) }} role="img" aria-label="Each goal's money by type">
          <ResponsiveContainer>
            <BarChart data={byGoal} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
              <XAxis type="number" tickFormatter={axisMoney} tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: c.fg, fontSize: 12 }} tickLine={false} axisLine={false} width={110} />
              <Tooltip cursor={{ fill: c.subtle }} content={<ChartTooltip rows={(p) => typeIds.filter((t) => (p[t] as number) > 0).map((t) => ({ name: info(t as never).label, value: p[t] as number, color: info(t as never).color }))} />} />
              {typeIds.map((t, i) => <Bar key={t} dataKey={t} stackId="a" fill={info(t as never).color} radius={i === typeIds.length - 1 ? [0, 6, 6, 0] : 0} maxBarSize={22} animationDuration={400} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
