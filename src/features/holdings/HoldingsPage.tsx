import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Landmark, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge, Delta, EmptyState, Money, PageHeader } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/inputs';
import { Sparkline } from '@/components/charts/Sparkline';
import { useCategories } from '@/store/useCategories';
import { useStore } from '@/store/useStore';
import { useDerived } from '@/store/useDerived';
import { useUI } from '@/store/useUI';
import { VALUATION_LABEL } from '@/lib/finance/constants';
import { fmtShortDate } from '@/lib/finance/dates';
import { UNASSIGNED } from '@/lib/finance/ledger';
import { HoldingDialog } from './HoldingDialog';
import { holdingSeries } from './holdingHistory';
import { motion } from 'framer-motion';

export function HoldingsPage() {
  const { info } = useCategories();
  const holdings = useStore((s) => s.holdings);
  const goals = useStore((s) => s.goals);
  const txs = useStore((s) => s.transactions);
  const vals = useStore((s) => s.valuations);
  const d = useDerived();
  const setValuationOpen = useUI((s) => s.setValuationOpen);
  const [open, setOpen] = useState(false);
  const [show, setShow] = useState<'active' | 'archived'>('active');
  const list = holdings.filter((h) => (show === 'active' ? !h.archived : h.archived)).sort((a, b) => (d.snap.holdings[b.id]?.value ?? 0) - (d.snap.holdings[a.id]?.value ?? 0));
  const series = useMemo(() => Object.fromEntries(holdings.map((h) => [h.id, holdingSeries(h, txs, vals, d.today, 12).map((p) => p.value)])), [holdings, txs, vals, d.today]);

  return (
    <div>
      <PageHeader
        title="Holdings"
        subtitle={<>Total <Money value={d.snap.totalValue} /> · invested <Money value={d.snap.totalInvested} /> · <Delta value={d.snap.totalValue - d.snap.totalInvested} /></>}
        action={<>
          {d.hasMarketHoldings && <Button variant="outline" onClick={() => setValuationOpen(true)}><RefreshCw className="h-4 w-4" /> Update values</Button>}
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add holding</Button>
        </>}
      />
      {holdings.some((h) => h.archived) && (
        <Segmented className="mb-5" value={show} onChange={setShow} options={[{ value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }]} />
      )}
      {list.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((h, i) => {
            const st = d.snap.holdings[h.id];
            const gain = (st?.value ?? 0) - (st?.invested ?? 0);
            const owners = Object.entries(st?.owners ?? {}).filter(([, p]) => p.value > 0.5);
            const last = st?.lastValuation?.date;
            return (
              <motion.div key={h.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <Link to={`/holdings/${h.id}`} className="block rounded-2xl border border-border bg-surface p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white" style={{ backgroundColor: info(h.type).color }}>{info(h.type).label.slice(0, 2).toUpperCase()}</span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{h.name}</p>
                        <p className="truncate text-xs text-muted">{info(h.type).label}{h.platform ? ` · ${h.platform}` : ''}</p>
                      </div>
                    </div>
                    <Badge>{h.valuation === 'interest' ? `${h.interestRate ?? 0}% p.a.` : VALUATION_LABEL[h.valuation].split(' (')[0]}</Badge>
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xl font-semibold tracking-tight"><Money value={st?.value ?? 0} /></p>
                      <p className="text-xs text-muted">Invested <Money value={st?.invested ?? 0} /> · <Delta value={gain} className="text-xs" /></p>
                    </div>
                    <div className="w-24"><Sparkline data={series[h.id] ?? []} color={info(h.type).color} /></div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs text-muted">
                    <span className="flex items-center gap-1">
                      {owners.slice(0, 6).map(([gid]) => {
                        const g = goals.find((x) => x.id === gid);
                        return <span key={gid} title={g?.name ?? 'General savings'} className="h-2.5 w-2.5 rounded-full ring-2 ring-surface" style={{ backgroundColor: gid === UNASSIGNED ? 'rgb(var(--muted))' : g?.color }} />;
                      })}
                      {owners.length ? <span className="ml-1">{owners.length} {owners.length === 1 ? 'goal' : 'goals'}</span> : 'Empty'}
                    </span>
                    <span>{h.valuation === 'interest' ? 'Auto-updated' : h.valuation === 'cash' ? 'Cash' : last ? `Updated ${fmtShortDate(last)}` : 'No valuation yet'}</span>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState icon={<Landmark className="h-6 w-6" />} title={show === 'active' ? 'No holdings yet' : 'Nothing archived'} description="Holdings are where your money sits, like a bank account, mutual fund or gold. They're also created automatically when you log savings." action={show === 'active' && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add a holding</Button>} />
        </Card>
      )}
      <HoldingDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
