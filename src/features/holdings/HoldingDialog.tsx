import { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Input, NumberInput, Textarea } from '@/components/ui/inputs';
import { Picker } from '@/components/ui/picker';
import { LabelTip } from '@/components/ui/infotip';
import { toast } from '@/components/ui/toast';
import { useStore } from '@/store/useStore';
import { useCategories } from '@/store/useCategories';
import type { Holding, HoldingTypeId, ValuationMethod } from '@/lib/types';
import { newId, nowStamp } from '@/lib/ids';

const VALUATION_OPTIONS: { value: ValuationMethod; label: string; hint: string }[] = [
  { value: 'interest', label: 'Grows with interest', hint: 'Bank, FD, RD, PPF: updates by itself' },
  { value: 'market', label: 'Price moves', hint: 'Stocks, funds, crypto: you enter today\'s value' },
  { value: 'quantity', label: 'Grams × price', hint: 'Gold, silver' },
  { value: 'cash', label: 'Stays the same', hint: 'Cash at home, wallets' },
];

export function HoldingDialog({ open, onOpenChange, holding, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; holding?: Holding; onSaved?: (h: Holding) => void }) {
  const saveHolding = useStore((s) => s.saveHolding);
  const cats = useCategories();
  const blank = (): Holding => ({ id: newId(), name: '', type: 'bank', valuation: 'interest', interestRate: 3, archived: false, createdAt: nowStamp() });
  const [h, setH] = useState<Holding>(holding ?? blank());
  useEffect(() => { if (open) setH(holding ?? blank()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, holding]);
  const set = (p: Partial<Holding>) => setH((cur) => ({ ...cur, ...p }));
  const info = cats.info(h.type);

  const pickType = (type: HoldingTypeId) => {
    const t = cats.info(type);
    set({ type, valuation: t.valuation, interestRate: t.valuation === 'interest' ? t.defaultReturn : undefined, expectedReturn: undefined });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={holding ? 'Edit holding' : 'Add a holding'} description="Where some of your money sits, like a bank account, a fund or gold."
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={async () => {
        const final = { ...h, name: h.name.trim() || info.label };
        await saveHolding(final);
        toast(holding ? 'Holding updated' : 'Holding added');
        onSaved?.(final);
        onOpenChange(false);
      }}>Save</Button></>}
    >
      <div className="space-y-4">
        <Field label="Type">
          <Picker value={h.type} onChange={(v) => pickType(v as HoldingTypeId)} options={cats.typeOptions(h.type)} ariaLabel="Holding type"
            onCreate={(label) => cats.addType(label)} createLabel="Add a type" createPlaceholder="e.g. Real estate"
            onRemove={(v) => cats.removeType(v as HoldingTypeId)} />
        </Field>
        <Field label="Name"><Input value={h.name} onChange={(e) => set({ name: e.target.value })} placeholder={`e.g. ${h.type === 'bank' ? 'HDFC Savings' : h.type === 'mutual_fund' ? 'Nifty 50 Index Fund' : info.label}`} /></Field>
        <Field label="How its value changes">
          <Picker value={h.valuation} onChange={(v) => set({ valuation: v as ValuationMethod })} ariaLabel="How its value changes" options={VALUATION_OPTIONS} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          {h.valuation === 'interest' && (
            <Field label="Interest rate"><NumberInput value={h.interestRate} onChange={(n) => set({ interestRate: n })} suffix="% / yr" min={0} max={30} ariaLabel="Interest rate" /></Field>
          )}
          <Field label={<LabelTip term="expectedReturn">Expected growth</LabelTip>} hint={h.expectedReturn == null ? 'Leave empty to use the default' : undefined}>
            <NumberInput value={h.expectedReturn} onChange={(n) => set({ expectedReturn: Number.isFinite(n) && n !== 0 ? n : undefined })} suffix="% / yr" min={-50} max={100} ariaLabel="Expected growth" placeholder={String(h.valuation === 'interest' ? h.interestRate ?? info.defaultReturn : info.defaultReturn)} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="App or bank" hint="Optional"><Input value={h.platform ?? ''} onChange={(e) => set({ platform: e.target.value || undefined })} placeholder="e.g. Zerodha" /></Field>
          <Field label="Note" hint="Optional"><Textarea rows={1} className="min-h-[44px]" value={h.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} /></Field>
        </div>
      </div>
    </Dialog>
  );
}
