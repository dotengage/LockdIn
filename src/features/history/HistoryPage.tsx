import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CalendarCheck, Download, LineChart, Pencil, Search, Shuffle, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { Input } from '@/components/ui/inputs';
import { Picker } from '@/components/ui/picker';
import { DatePicker } from '@/components/ui/datepicker';
import { toast } from '@/components/ui/toast';
import { useStore, pick } from '@/store/useStore';
import { useUI } from '@/store/useUI';
import { fmtDate, fromISO } from '@/lib/finance/dates';
import { formatINR } from '@/lib/finance/format';
import { checkInIncome } from '@/lib/finance/goals';
import { txReasonLabel } from '@/lib/categories';
import { historyCSV } from '@/lib/export/csv';
import { downloadFile } from '@/lib/db/backup';
import type { Transaction } from '@/lib/types';
import { TransactionDialog } from '../transactions/TransactionDialog';
import { format } from 'date-fns';
import { cn } from '@/lib/cn';

type Kind = 'all' | 'checkin' | 'contribution' | 'withdrawal' | 'transfer' | 'valuation';

interface Entry {
  id: string; date: string; kind: Exclude<Kind, 'all'>; title: string; subtitle: string; amount?: number; sign?: '+' | '−';
  goalIds: (string | null)[]; holdingIds: string[]; search: string;
  onEdit?: () => void; onDelete: () => Promise<void>;
}

export function HistoryPage() {
  const store = useStore();
  const { goals, holdings, transactions, valuations, checkIns, commit, deleteCheckIn } = store;
  const openCheckIn = useUI((s) => s.openCheckIn);
  const [params] = useSearchParams();
  const [kind, setKind] = useState<Kind>('all');
  const [goalF, setGoalF] = useState(params.get('goal') ?? 'all');
  const [holdingF, setHoldingF] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [editTx, setEditTx] = useState<Transaction | undefined>();
  const [showFilters, setShowFilters] = useState(false);

  const gName = (id: string | null) => (id == null ? 'General savings' : goals.find((g) => g.id === id)?.name ?? 'Deleted goal');
  const hName = (id: string) => holdings.find((h) => h.id === id)?.name ?? 'Deleted holding';

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    for (const c of checkIns) {
      const inc = checkInIncome(c);
      const saved = transactions.filter((t) => t.checkInId === c.id && t.kind === 'contribution').reduce((s, t) => s + t.amount, 0);
      out.push({
        id: `c-${c.id}`, date: c.periodEnd, kind: 'checkin', title: `Check-in · ${c.periodStart.slice(8) === '01' && c.periodEnd.slice(5, 7) === c.periodStart.slice(5, 7) && +c.periodEnd.slice(8) > 27 ? format(fromISO(c.periodStart), 'MMMM yyyy') : `${fmtDate(c.periodStart)} – ${fmtDate(c.periodEnd)}`}`,
        subtitle: `Income ${formatINR(inc)} · spent ${formatINR(c.spending ?? 0)} · saved ${formatINR(saved)}${c.note ? ` · ${c.note}` : ''}`,
        goalIds: [], holdingIds: [], search: `check-in ${c.note ?? ''} ${c.incomes.map((i) => i.source).join(' ')}`,
        onEdit: () => openCheckIn({ editId: c.id }),
        onDelete: async () => { const undo = await deleteCheckIn(c.id); toast('Check-in deleted', { undo }); },
      });
    }
    const seenTransfer = new Set<string>();
    for (const t of transactions) {
      if (t.transferId) {
        if (seenTransfer.has(t.transferId)) continue;
        seenTransfer.add(t.transferId);
        const pair = transactions.filter((x) => x.transferId === t.transferId);
        const out1 = pair.find((x) => x.kind === 'withdrawal') ?? t;
        const in1 = pair.find((x) => x.kind === 'contribution') ?? t;
        const reassign = t.reason === 'reassign';
        out.push({
          id: `t-${t.transferId}`, date: t.date, kind: 'transfer', amount: t.amount,
          title: reassign ? `Moved between goals · ${hName(t.holdingId)}` : `Moved ${hName(out1.holdingId)} → ${hName(in1.holdingId)}`,
          subtitle: reassign ? `${gName(out1.goalId)} → ${gName(in1.goalId)}` : gName(t.goalId),
          goalIds: pair.map((x) => x.goalId), holdingIds: pair.map((x) => x.holdingId), search: `${t.note ?? ''} transfer`,
          onDelete: async () => { const undo = await commit({ del: { transactions: pair.map((x) => x.id) } }); toast('Transfer deleted', { undo }); },
        });
        continue;
      }
      const inbound = t.kind === 'contribution';
      out.push({
        id: `t-${t.id}`, date: t.date, kind: t.kind, amount: t.amount, sign: inbound ? '+' : '−',
        title: `${txReasonLabel(t)} · ${gName(t.goalId)}`,
        subtitle: `${hName(t.holdingId)}${t.quantityGrams ? ` · ${t.quantityGrams} g` : ''}${t.checkInId ? ' · from check-in' : ''}${t.note ? ` · ${t.note}` : ''}`,
        goalIds: [t.goalId], holdingIds: [t.holdingId], search: `${t.note ?? ''} ${txReasonLabel(t)}`,
        onEdit: () => setEditTx(t),
        onDelete: async () => { const undo = await commit({ del: { transactions: [t.id] } }); toast('Transaction deleted', { undo }); },
      });
    }
    for (const v of valuations) {
      out.push({
        id: `v-${v.id}`, date: v.date, kind: 'valuation', amount: v.value, title: `Valuation · ${hName(v.holdingId)}`,
        subtitle: v.pricePerGram ? `${formatINR(v.pricePerGram)} per gram` : 'Market value update', goalIds: [], holdingIds: [v.holdingId], search: 'valuation',
        onDelete: async () => { const undo = await commit({ del: { valuations: [v.id] } }); toast('Valuation deleted', { undo }); },
      });
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkIns, transactions, valuations, goals, holdings]);

  const filtered = entries.filter((e) => {
    if (kind !== 'all' && e.kind !== kind) return false;
    if (goalF !== 'all' && !e.goalIds.includes(goalF === '__general' ? null : goalF)) return false;
    if (holdingF !== 'all' && !e.holdingIds.includes(holdingF)) return false;
    if (from && e.date < from) return false;
    if (to && e.date > to) return false;
    if (q) {
      const s = `${e.title} ${e.subtitle} ${e.search}`.toLowerCase();
      if (!s.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const groups = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of filtered) {
      const k = e.date.slice(0, 7);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    return [...m.entries()];
  }, [filtered]);

  const ICON = { checkin: CalendarCheck, contribution: ArrowDownLeft, withdrawal: ArrowUpRight, transfer: ArrowLeftRight, valuation: LineChart };

  return (
    <div>
      <PageHeader title="History" subtitle={`${entries.length} entries`} action={<Button variant="outline" onClick={() => { downloadFile(`lockdin-history-${new Date().toISOString().slice(0, 10)}.csv`, historyCSV(pick(store)), 'text/csv;charset=utf-8'); toast('CSV downloaded'); }}><Download className="h-4 w-4" /> Export CSV</Button>} />

      <div className="mb-6 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input className="h-11 rounded-2xl pl-10" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search history" />
          </div>
          <Button variant={showFilters || (kind !== 'all' || goalF !== 'all' || holdingF !== 'all' || from || to) ? 'primary' : 'outline'} className="h-11 rounded-2xl" onClick={() => setShowFilters((v) => !v)}><SlidersHorizontal className="h-4 w-4" /> Filters</Button>
        </div>
        <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1">
          {([['all', 'All'], ['checkin', 'Check-ins'], ['contribution', 'Money in'], ['withdrawal', 'Money out'], ['transfer', 'Moves'], ['valuation', 'Value updates']] as [Kind, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setKind(k)} className={cn('shrink-0 rounded-full px-3.5 py-1.5 text-sm transition-colors', kind === k ? 'bg-fg text-bg' : 'bg-surface text-muted hover:text-fg border border-border')}>{l}</button>
          ))}
        </div>
        {showFilters && (
          <Card className="grid gap-3 p-4 sm:grid-cols-2 sm:p-4">
            <Picker value={goalF} onChange={setGoalF} ariaLabel="Goal" options={[{ value: 'all', label: 'All goals' }, ...goals.map((g) => ({ value: g.id, label: g.name, icon: <span>{g.icon}</span> })), { value: '__general', label: 'General savings', icon: <span>🪙</span> }]} />
            <Picker value={holdingF} onChange={setHoldingF} ariaLabel="Holding" options={[{ value: 'all', label: 'All holdings' }, ...holdings.map((h) => ({ value: h.id, label: h.name }))]} />
            <DatePicker value={from || undefined} onChange={setFrom} placeholder="From date" ariaLabel="From date" />
            <DatePicker value={to || undefined} onChange={setTo} placeholder="To date" ariaLabel="To date" />
            {(kind !== 'all' || goalF !== 'all' || holdingF !== 'all' || from || to) && <Button size="sm" variant="ghost" className="sm:col-span-2" onClick={() => { setKind('all'); setGoalF('all'); setHoldingF('all'); setFrom(''); setTo(''); }}>Clear filters</Button>}
          </Card>
        )}
      </div>

      {groups.length ? (
        <div className="space-y-6">
          {groups.map(([month, list]) => (
            <section key={month}>
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">{format(fromISO(`${month}-01`), 'MMMM yyyy')}</h2>
              <Card className="p-0 sm:p-0">
                <ul className="divide-y divide-border">
                  {list.map((e) => {
                    const Icon = e.kind === 'transfer' && e.title.startsWith('Moved between') ? Shuffle : ICON[e.kind];
                    return (
                      <li key={e.id} className="group flex items-center gap-3 px-4 py-3 sm:px-5">
                        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', e.kind === 'contribution' ? 'bg-gain/10 text-gain' : e.kind === 'withdrawal' ? 'bg-loss/10 text-loss' : 'bg-subtle text-muted')}><Icon className="h-4 w-4" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{e.title}</p>
                          <p className="truncate text-xs text-muted">{fmtDate(e.date)} · {e.subtitle}</p>
                        </div>
                        {e.amount != null && <span className={cn('num whitespace-nowrap text-sm font-semibold', e.sign === '−' && 'text-loss')}>{e.sign ?? ''}{formatINR(e.amount)}</span>}
                        <div className="flex shrink-0 gap-0.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                          {e.onEdit && <button onClick={e.onEdit} className="rounded-lg p-1.5 text-muted hover:bg-subtle hover:text-fg" aria-label="Edit"><Pencil className="h-3.5 w-3.5" /></button>}
                          <button onClick={() => void e.onDelete()} className="rounded-lg p-1.5 text-muted hover:bg-subtle hover:text-loss" aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      ) : (
        <Card><EmptyState icon={<CalendarCheck className="h-6 w-6" />} title={entries.length ? 'Nothing matches these filters' : 'No history yet'} description={entries.length ? 'Try clearing a filter.' : 'Your check-ins, savings, withdrawals and valuations will appear here.'} action={!entries.length && <Button onClick={() => openCheckIn()}>Do a check-in</Button>} /></Card>
      )}
      <TransactionDialog open={!!editTx} onOpenChange={(v) => !v && setEditTx(undefined)} mode="contribution" edit={editTx} />
    </div>
  );
}
