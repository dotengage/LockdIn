import { useState } from 'react';
import { Plus, Wallet, X } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/inputs';
import { Picker } from '@/components/ui/picker';
import { InfoTip } from '@/components/ui/infotip';
import { useCategories } from '@/store/useCategories';
import type { HoldingType, HoldingTypeId, ValuationMethod } from '@/lib/types';

const VALUATIONS: { value: ValuationMethod; label: string; hint: string }[] = [
  { value: 'market', label: 'Price moves', hint: 'You update its value now and then' },
  { value: 'interest', label: 'Grows with interest', hint: 'Updates by itself' },
  { value: 'quantity', label: 'Grams × price', hint: 'Like gold or silver' },
  { value: 'cash', label: 'Stays the same', hint: 'Like cash' },
];

/** Where money is kept, with the growth rate used for each. Add, edit or remove any of them. */
export function TypesCard() {
  const c = useCategories();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [valuation, setValuation] = useState<ValuationMethod>('market');
  const [ret, setRet] = useState(8);
  const types = c.visible();
  const hidden = c.hidden();

  const add = () => {
    if (!label.trim()) return;
    c.addType(label.trim(), valuation, ret);
    setLabel(''); setRet(8); setValuation('market'); setAdding(false);
  };

  return (
    <Card>
      <CardHeader
        title={<span className="flex items-center gap-2"><Wallet className="h-4 w-4 text-muted" /> Where you keep money <InfoTip term="expectedReturn" /></span>}
        subtitle="The yearly growth we assume for each. Estimates, not guarantees."
      />
      <ul className="divide-y divide-border">
        {types.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-2.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.label}</span>
            <NumberInput className="w-28" value={t.defaultReturn} onChange={(n) => c.setTypeReturn(t.id, n)} suffix="% / yr" min={-20} max={50} ariaLabel={`${t.label} yearly growth`} />
            <button type="button" onClick={() => c.removeType(t.id as HoldingTypeId)} aria-label={`Remove ${t.label}`} className="rounded-lg p-1.5 text-muted hover:bg-subtle hover:text-loss"><X className="h-4 w-4" /></button>
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="mt-3 space-y-3 rounded-2xl bg-subtle/60 p-3">
          {hidden.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted">Quick add</p>
              <div className="flex flex-wrap gap-1.5">
                {hidden.map((t) => (
                  <button key={t.id} type="button" onClick={() => c.restoreType(t.id as HoldingType)} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-sm hover:border-muted">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />{t.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <form className="grid gap-2 sm:grid-cols-[1fr_1fr_120px]" onSubmit={(e) => { e.preventDefault(); add(); }}>
            <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Or your own, e.g. Real estate" aria-label="New type name" className="h-11 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-accent" />
            <Picker value={valuation} onChange={(v) => setValuation(v as ValuationMethod)} options={VALUATIONS} ariaLabel="How its value changes" />
            <NumberInput value={ret} onChange={setRet} suffix="% / yr" min={-20} max={50} ariaLabel="Yearly growth" />
            <div className="flex justify-end gap-2 sm:col-span-3">
              <Button type="button" variant="ghost" onClick={() => setAdding(false)}>Done</Button>
              <Button type="submit" disabled={!label.trim()}>Add</Button>
            </div>
          </form>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border py-2.5 text-sm font-medium text-muted transition-colors hover:border-muted hover:text-fg">
          <Plus className="h-4 w-4" /> Add
        </button>
      )}
    </Card>
  );
}
