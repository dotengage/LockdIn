import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Plus, Shuffle, Wallet } from 'lucide-react';
import type { Goal } from '@/lib/types';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Delta, EmptyState, Money } from '@/components/ui/misc';
import { useCategories } from '@/store/useCategories';
import { useStore } from '@/store/useStore';
import { useDerived } from '@/store/useDerived';
import { fmtDate } from '@/lib/finance/dates';
import { formatINR, formatPct } from '@/lib/finance/format';
import { txReasonLabel } from '@/lib/categories';
import { TransactionDialog, type TxMode } from '../transactions/TransactionDialog';

export function MoneyTab({ goal }: { goal: Goal }) {
  const { info } = useCategories();
  const holdings = useStore((s) => s.holdings);
  const transactions = useStore((s) => s.transactions);
  const d = useDerived();
  const [dialog, setDialog] = useState<TxMode | null>(null);
  const positions = d.snap.goalByHolding[goal.id] ?? {};
  const rows = holdings
    .map((h) => ({ h, p: positions[h.id], st: d.snap.holdings[h.id] }))
    .filter((r) => r.p && (r.p.value > 0.5 || r.p.invested > 0.5))
    .sort((a, b) => b.p.value - a.p.value);
  const txs = useMemo(() => transactions.filter((t) => t.goalId === goal.id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)), [transactions, goal.id]);
  const m = d.metrics[goal.id];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setDialog('contribution')}><Plus className="h-4 w-4" /> Add money</Button>
        <Button variant="outline" onClick={() => setDialog('withdrawal')}><ArrowUpRight className="h-4 w-4" /> Withdraw</Button>
        <Button variant="outline" onClick={() => setDialog('transfer')}><ArrowLeftRight className="h-4 w-4" /> Move holding</Button>
        <Button variant="outline" onClick={() => setDialog('reassign')}><Shuffle className="h-4 w-4" /> Move to goal</Button>
      </div>

      <Card>
        <CardHeader title="Where this goal's money is" subtitle={<>Value <Money value={m.currentValue} /> · invested <Money value={m.invested} /> · <Delta value={m.gain} pct={m.invested > 0 ? (m.gain / m.invested) * 100 : 0} /></>} />
        {rows.length ? (
          <div className="-mx-5 overflow-x-auto sm:-mx-6">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-5 py-2 font-medium sm:px-6">Holding</th><th className="px-3 py-2 text-right font-medium">Value</th>
                <th className="px-3 py-2 text-right font-medium">Share of holding</th><th className="px-3 py-2 text-right font-medium">Of this goal</th><th className="px-5 py-2 text-right font-medium sm:px-6">Gain</th>
              </tr></thead>
              <tbody>
                {rows.map(({ h, p, st }) => (
                  <tr key={h.id} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-3 sm:px-6"><Link to={`/holdings/${h.id}`} className="flex items-center gap-2 font-medium hover:underline"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: info(h.type).color }} />{h.name}</Link><span className="text-xs text-muted">{info(h.type).label}</span></td>
                    <td className="px-3 py-3 text-right num">{formatINR(p.value)}</td>
                    <td className="px-3 py-3 text-right num">{st && st.totalUnits > 0 ? formatPct((p.units / st.totalUnits) * 100) : '–'}</td>
                    <td className="px-3 py-3 text-right num">{m.currentValue > 0 ? formatPct((p.value / m.currentValue) * 100) : '–'}</td>
                    <td className="px-5 py-3 text-right sm:px-6"><Delta value={p.value - p.invested} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState icon={<Wallet className="h-6 w-6" />} title="No money in this goal yet" description="Add money here, or log it in a check-in or through the assistant." action={<Button onClick={() => setDialog('contribution')}><Plus className="h-4 w-4" /> Add money</Button>} />}
      </Card>

      <Card>
        <CardHeader title="Transactions" subtitle={`${txs.length} total`} action={<Link to={`/history?goal=${goal.id}`} className="text-sm font-medium text-accent hover:underline">Open in History</Link>} />
        {txs.length ? (
          <ul className="divide-y divide-border">
            {txs.slice(0, 25).map((t) => {
              const h = holdings.find((x) => x.id === t.holdingId);
              const inbound = t.kind === 'contribution';
              return (
                <li key={t.id} className="flex items-center gap-3 py-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${inbound ? 'bg-gain/10 text-gain' : 'bg-loss/10 text-loss'}`}>{inbound ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{txReasonLabel(t)} · {h?.name ?? 'Deleted holding'}</p>
                    <p className="truncate text-xs text-muted">{fmtDate(t.date)}{t.note ? ` · ${t.note}` : ''}</p>
                  </div>
                  <span className={`num text-sm font-semibold ${inbound ? '' : 'text-loss'}`}>{inbound ? '+' : '−'}{formatINR(t.amount)}</span>
                </li>
              );
            })}
          </ul>
        ) : <p className="py-6 text-center text-sm text-muted">Nothing yet.</p>}
      </Card>

      <TransactionDialog open={!!dialog} onOpenChange={(v) => !v && setDialog(null)} mode={dialog ?? 'contribution'} goalId={goal.id} />
    </div>
  );
}
