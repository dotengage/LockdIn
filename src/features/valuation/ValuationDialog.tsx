import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { addDays } from 'date-fns';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MoneyInput, NumberInput } from '@/components/ui/inputs';
import { toast } from '@/components/ui/toast';
import { useCategories } from '@/store/useCategories';
import { useStore } from '@/store/useStore';
import { useDerived } from '@/store/useDerived';
import { useUI } from '@/store/useUI';
import { fmtDate, todayISO } from '@/lib/finance/dates';
import { formatINR, formatPct } from '@/lib/finance/format';
import { newId, nowStamp } from '@/lib/ids';
import type { Valuation } from '@/lib/types';
import { cn } from '@/lib/cn';

interface Row { value?: number; ppg?: number; same?: boolean }

/** Pluggable price source (none in v1; keeps everything offline). */
export interface PriceProvider { pricePerGram?(type: 'gold' | 'silver'): Promise<number | null> }
export const priceProvider: PriceProvider = {};

export function ValuationDialog() {
  const open = useUI((s) => s.valuationOpen);
  const setOpen = useUI((s) => s.setValuationOpen);
  const d = useDerived();
  const prompted = useRef(false);

  useEffect(() => {
    if (!prompted.current && d.valuationDue) {
      prompted.current = true;
      const t = setTimeout(() => setOpen(true), 900);
      return () => clearTimeout(t);
    }
  }, [d.valuationDue, setOpen]);

  return open ? <ValuationFlow onClose={() => setOpen(false)} /> : null;
}

function ValuationFlow({ onClose }: { onClose: () => void }) {
  const { info } = useCategories();
  const holdings = useStore((s) => s.holdings);
  const commit = useStore((s) => s.commit);
  const patchMeta = useStore((s) => s.patchMeta);
  const profile = useStore((s) => s.profile);
  const d = useDerived();
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [showAuto, setShowAuto] = useState(false);
  const live = holdings.filter((h) => !h.archived && (d.snap.holdings[h.id]?.netFlows ?? 0) > 0);
  const market = live.filter((h) => h.valuation === 'market' || h.valuation === 'quantity');
  const auto = live.filter((h) => h.valuation === 'interest');
  const set = (id: string, r: Row) => setRows((cur) => ({ ...cur, [id]: r }));
  const period = profile?.valuationFrequency === 'monthly' ? 'month' : profile?.valuationFrequency === 'fortnightly' ? 'fortnight' : 'week';

  async function save() {
    const vals: Valuation[] = [];
    for (const h of [...market, ...auto]) {
      const r = rows[h.id];
      if (!r) continue;
      const st = d.snap.holdings[h.id];
      const value = r.same ? st.value : r.ppg && st.grams > 0 ? r.ppg * st.grams : r.value;
      if (value == null || (!r.same && !r.ppg && !r.value)) continue;
      vals.push({ id: newId(), holdingId: h.id, date: todayISO(), value, pricePerGram: r.ppg || undefined, createdAt: nowStamp() });
    }
    const undo = vals.length ? await commit({ put: { valuations: vals } }) : undefined;
    await patchMeta({ lastValuationAt: todayISO(), valuationSnoozedUntil: undefined });
    toast(vals.length ? `Updated ${vals.length} value${vals.length > 1 ? 's' : ''}` : 'All set', { undo });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()} title="Quick update: what are your investments worth today?" description="Type today's value from your app or statement. It only takes a minute." size="lg"
      footer={<>
        <Button variant="ghost" onClick={async () => { await patchMeta({ valuationSnoozedUntil: addDays(new Date(), 1).toISOString() }); onClose(); }}>Remind me tomorrow</Button>
        <Button variant="outline" onClick={async () => { await patchMeta({ lastValuationAt: todayISO() }); toast(`Skipped this ${period}`); onClose(); }}>Skip this {period}</Button>
        <Button onClick={() => void save()}>Save values</Button>
      </>}
    >
      <div className="space-y-3">
        {!market.length && <p className="rounded-2xl bg-subtle p-4 text-sm text-muted">No market-linked holdings with money in them yet.</p>}
        {market.map((h) => {
          const st = d.snap.holdings[h.id];
          const r = rows[h.id] ?? {};
          const qty = h.valuation === 'quantity' && st.grams > 0;
          const newValue = r.same ? st.value : qty && r.ppg ? r.ppg * st.grams : r.value;
          const change = newValue != null && st.value > 0 ? ((newValue - st.value) / st.value) * 100 : null;
          return (
            <div key={h.id} className={cn('rounded-2xl border p-4 transition-colors', r.same || newValue ? 'border-accent/40 bg-accent-soft/40' : 'border-border')}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: info(h.type).color }} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{h.name}</p>
                    <p className="text-xs text-muted">{info(h.type).label} · last {formatINR(st.value)}{st.lastValuation ? ` on ${fmtDate(st.lastValuation.date)}` : ' (invested)'}{qty ? ` · ${st.grams.toFixed(2)} g` : ''}</p>
                  </div>
                </div>
                <button onClick={() => set(h.id, { same: !r.same })} className={cn('shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium', r.same ? 'border-accent bg-accent text-accent-fg' : 'border-border hover:bg-subtle')}>Same as before</button>
              </div>
              {!r.same && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {qty && <NumberInput className="w-40" value={r.ppg} onChange={(n) => set(h.id, { ppg: n, value: undefined })} placeholder="Price per gram" step={1} min={0} ariaLabel={`${h.name} price per gram`} />}
                  {qty && <span className="text-xs text-muted">or</span>}
                  <MoneyInput className="min-w-[140px] flex-1" value={qty && r.ppg ? r.ppg * st.grams : r.value} onChange={(n) => set(h.id, { value: n, ppg: undefined })} ariaLabel={`${h.name} value today`} placeholder="Value today" />
                </div>
              )}
              {change != null && !r.same && newValue ? <p className={cn('mt-2 text-xs num', change >= 0 ? 'text-gain' : 'text-loss')}>{formatINR(newValue)} · {formatPct(change, 1, true)} since last time</p> : null}
            </div>
          );
        })}

        {auto.length > 0 && (
          <div className="rounded-2xl border border-border">
            <button className="flex w-full items-center justify-between px-4 py-3 text-sm" onClick={() => setShowAuto((v) => !v)} aria-expanded={showAuto}>
              <span><span className="font-medium">Auto-updated</span> <span className="text-muted">· bank, FD, RD, PPF ({auto.length})</span></span>
              <ChevronDown className={cn('h-4 w-4 text-muted transition-transform', showAuto && 'rotate-180')} />
            </button>
            {showAuto && (
              <div className="space-y-3 border-t border-border p-4">
                {auto.map((h) => {
                  const st = d.snap.holdings[h.id];
                  return (
                    <div key={h.id} className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0"><p className="truncate text-sm font-medium">{h.name}</p><p className="text-xs text-muted">Calculated {formatINR(st.value)} at {h.interestRate ?? 0}%</p></div>
                      <MoneyInput className="w-40" value={rows[h.id]?.value} onChange={(n) => set(h.id, { value: n })} ariaLabel={`Override ${h.name}`} placeholder="Real balance" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
