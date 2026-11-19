import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { format } from 'date-fns';
import { Archive, ArrowLeft, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Delta, EmptyState, Menu, Money, Stat } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { Field, MoneyInput, NumberInput } from '@/components/ui/inputs';
import { DatePicker } from '@/components/ui/datepicker';
import { toast } from '@/components/ui/toast';
import { ChartTooltip, axisMoney, useThemeColors } from '@/components/charts/chartUtils';
import { useCategories } from '@/store/useCategories';
import { useStore } from '@/store/useStore';
import { useDerived } from '@/store/useDerived';
import { VALUATION_LABEL } from '@/lib/finance/constants';
import { fmtDate, fromISO, todayISO } from '@/lib/finance/dates';
import { formatINR, formatPct } from '@/lib/finance/format';
import { txReasonLabel } from '@/lib/categories';
import { newId, nowStamp } from '@/lib/ids';
import { UNASSIGNED } from '@/lib/finance/ledger';
import { HoldingDialog } from './HoldingDialog';
import { holdingSeries } from './holdingHistory';
import { TransactionDialog } from '../transactions/TransactionDialog';

export function HoldingDetail() {
  const { info } = useCategories();
  const { id } = useParams();
  const navigate = useNavigate();
  const h = useStore((s) => s.holdings.find((x) => x.id === id));
  const goals = useStore((s) => s.goals);
  const txs = useStore((s) => s.transactions);
  const vals = useStore((s) => s.valuations);
  const commit = useStore((s) => s.commit);
  const saveHolding = useStore((s) => s.saveHolding);
  const d = useDerived();
  const c = useThemeColors();
  const [edit, setEdit] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [valOpen, setValOpen] = useState(false);
  const series = useMemo(() => (h ? holdingSeries(h, txs, vals, d.today, 60) : []), [h, txs, vals, d.today]);
  const own = useMemo(() => txs.filter((t) => t.holdingId === id).sort((a, b) => b.date.localeCompare(a.date)), [txs, id]);
  const valuations = useMemo(() => vals.filter((v) => v.holdingId === id).sort((a, b) => b.date.localeCompare(a.date)), [vals, id]);

  if (!h) return <EmptyState title="Holding not found" action={<Link to="/holdings"><Button>Back to holdings</Button></Link>} />;
  const st = d.snap.holdings[h.id];
  const gain = st.value - st.invested;
  const owners = Object.entries(st.owners).filter(([, p]) => p.value > 0.5);

  const remove = async () => {
    if (own.length) {
      await saveHolding({ ...h, archived: true });
      toast('This holding has transactions, so it was archived instead of deleted.');
      return;
    }
    const undo = await commit({ del: { holdings: [h.id], valuations: valuations.map((v) => v.id) } });
    navigate('/holdings');
    toast(`${h.name} deleted`, { undo });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/holdings')}><ArrowLeft className="h-4 w-4" /> Holdings</Button>
        <div className="flex gap-2">
          {h.valuation !== 'cash' && <Button size="sm" variant="outline" onClick={() => setValOpen(true)}><RefreshCw className="h-3.5 w-3.5" /> Update value</Button>}
          <Button size="sm" onClick={() => setTxOpen(true)}><Plus className="h-3.5 w-3.5" /> Transaction</Button>
          <Menu trigger={<Button size="sm" variant="outline" aria-label="More"><MoreHorizontal className="h-4 w-4" /></Button>} items={[
            { label: 'Edit', icon: <Pencil className="h-4 w-4" />, onSelect: () => setEdit(true) },
            { label: h.archived ? 'Unarchive' : 'Archive', icon: <Archive className="h-4 w-4" />, onSelect: () => void saveHolding({ ...h, archived: !h.archived }) },
            'sep',
            { label: 'Delete', icon: <Trash2 className="h-4 w-4" />, danger: true, onSelect: () => void remove() },
          ]} />
        </div>
      </div>

      <Card>
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-bold text-white" style={{ backgroundColor: info(h.type).color }}>{info(h.type).label.slice(0, 2).toUpperCase()}</span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{h.name}</h1>
            <p className="text-sm text-muted">{info(h.type).label}{h.platform ? ` · ${h.platform}` : ''} · {VALUATION_LABEL[h.valuation]}{h.valuation === 'interest' ? ` at ${h.interestRate ?? 0}%` : ''}</p>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Current value" value={<Money value={st.value} animated />} />
          <Stat label="Invested" value={<Money value={st.invested} />} />
          <Stat label="Gain / loss" value={<Delta value={gain} className="text-lg" />} sub={st.invested > 0 ? formatPct((gain / st.invested) * 100, 1, true) : undefined} />
          <Stat label={h.valuation === 'quantity' ? 'Quantity' : 'Last valued'} value={h.valuation === 'quantity' ? `${st.grams.toFixed(2)} g` : st.lastValuation ? fmtDate(st.lastValuation.date) : '–'} sub={!st.hasValuation && h.valuation !== 'interest' && h.valuation !== 'cash' ? 'Using invested amount' : undefined} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Value over time" />
        {series.length > 1 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series.map((p) => ({ ...p, label: format(fromISO(p.date), 'MMM yy') }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs><linearGradient id="hv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={info(h.type).color} stopOpacity={0.25} /><stop offset="100%" stopColor={info(h.type).color} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke={c.border} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} />
                <YAxis tickFormatter={axisMoney} tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="value" name="Value" stroke={info(h.type).color} strokeWidth={2} fill="url(#hv)" />
                <Line type="stepAfter" dataKey="invested" name="Invested" stroke={c.muted} strokeDasharray="4 4" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="py-10 text-center text-sm text-muted">The chart appears after a month of history.</p>}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Goals it funds" />
          {owners.length ? (
            <ul className="space-y-3">
              {owners.sort((a, b) => b[1].value - a[1].value).map(([gid, p]) => {
                const g = goals.find((x) => x.id === gid);
                return (
                  <li key={gid} className="flex items-center gap-3 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: gid === UNASSIGNED ? 'rgb(var(--muted))' : g?.color }} />
                    {g ? <Link to={`/goals/${g.id}`} className="flex-1 truncate hover:underline">{g.icon} {g.name}</Link> : <span className="flex-1">General savings</span>}
                    <span className="text-muted num">{formatPct((p.units / st.totalUnits) * 100)}</span>
                    <span className="w-24 text-right font-medium num">{formatINR(p.value)}</span>
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-sm text-muted">No money here yet.</p>}
        </Card>
        <Card>
          <CardHeader title="Valuation history" />
          {valuations.length ? (
            <ul className="divide-y divide-border text-sm">
              {valuations.slice(0, 12).map((v) => (
                <li key={v.id} className="flex items-center justify-between py-2">
                  <span className="text-muted">{fmtDate(v.date)}{v.pricePerGram ? ` · ${formatINR(v.pricePerGram)}/g` : ''}</span>
                  <span className="flex items-center gap-2">
                    <span className="num font-medium">{formatINR(v.value)}</span>
                    <button className="rounded p-1 text-muted hover:bg-subtle hover:text-loss" aria-label="Delete valuation" onClick={async () => { const undo = await commit({ del: { valuations: [v.id] } }); toast('Valuation removed', { undo }); }}><Trash2 className="h-3.5 w-3.5" /></button>
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">{h.valuation === 'interest' ? 'Value grows automatically. Add a valuation to set the real balance.' : 'No valuations yet.'}</p>}
        </Card>
      </div>

      <Card>
        <CardHeader title="Transactions" subtitle={`${own.length} total`} />
        {own.length ? (
          <ul className="divide-y divide-border text-sm">
            {own.slice(0, 30).map((t) => {
              const g = goals.find((x) => x.id === t.goalId);
              return (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{txReasonLabel(t)} · {g ? `${g.icon} ${g.name}` : 'General savings'}</p>
                    <p className="text-xs text-muted">{fmtDate(t.date)}{t.quantityGrams ? ` · ${t.quantityGrams} g` : ''}</p>
                  </div>
                  <span className={`num font-semibold ${t.kind === 'withdrawal' ? 'text-loss' : ''}`}>{t.kind === 'withdrawal' ? '−' : '+'}{formatINR(t.amount)}</span>
                </li>
              );
            })}
          </ul>
        ) : <p className="text-sm text-muted">No transactions yet.</p>}
      </Card>

      <HoldingDialog open={edit} onOpenChange={setEdit} holding={h} />
      <TransactionDialog open={txOpen} onOpenChange={setTxOpen} mode="contribution" holdingId={h.id} />
      <QuickValuation key={valOpen ? 'open' : 'closed'} open={valOpen} onOpenChange={setValOpen} holdingId={h.id} grams={st.grams} current={st.value} quantity={h.valuation === 'quantity'} onSave={async (value, ppg, date) => {
        const undo = await commit({ put: { valuations: [{ id: newId(), holdingId: h.id, date, value, pricePerGram: ppg, createdAt: nowStamp() }] } });
        toast('Value updated', { undo });
      }} />
    </div>
  );
}

function QuickValuation({ open, onOpenChange, grams, current, quantity, onSave }: { open: boolean; onOpenChange: (v: boolean) => void; holdingId: string; grams: number; current: number; quantity: boolean; onSave: (v: number, ppg: number | undefined, date: string) => Promise<void> }) {
  const [value, setValue] = useState(Math.round(current));
  const [ppg, setPpg] = useState<number | undefined>();
  const [date, setDate] = useState(todayISO());
  const usePpg = quantity && grams > 0;
  const final = usePpg && ppg ? ppg * grams : value;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Update value" size="sm"
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={async () => { await onSave(final, usePpg ? ppg : undefined, date); onOpenChange(false); }}>Save</Button></>}
    >
      <div className="space-y-4">
        {usePpg && <Field label={`Price per gram (${grams.toFixed(2)} g)`} hint="Or enter the total value below"><NumberInput value={ppg} onChange={setPpg} min={0} step={1} ariaLabel="Price per gram" /></Field>}
        <Field label="Current value"><MoneyInput value={usePpg && ppg ? final : value} onChange={(n) => { setValue(n); setPpg(undefined); }} /></Field>
        <Field label="As of"><DatePicker value={date} max={todayISO()} onChange={setDate} ariaLabel="As of" /></Field>
      </div>
    </Dialog>
  );
}
