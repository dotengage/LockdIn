import { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Input, MoneyInput, NumberInput, Segmented } from '@/components/ui/inputs';
import { Picker, type PickerOption } from '@/components/ui/picker';
import { DatePicker } from '@/components/ui/datepicker';
import { toast } from '@/components/ui/toast';
import { useStore } from '@/store/useStore';
import { useDerived } from '@/store/useDerived';
import { useCategories } from '@/store/useCategories';
import type { Holding, HoldingTypeId, Transaction } from '@/lib/types';
import { reasonFromLabel, txReasonLabel } from '@/lib/categories';
import { formatINR } from '@/lib/finance/format';
import { todayISO } from '@/lib/finance/dates';
import { newId, nowStamp } from '@/lib/ids';
import { UNASSIGNED } from '@/lib/finance/ledger';

export type TxMode = 'contribution' | 'withdrawal' | 'transfer' | 'reassign';

const TITLES: Record<TxMode, string> = {
  contribution: 'Add money', withdrawal: 'Take money out', transfer: 'Move between holdings', reassign: 'Move to another goal',
};

const GENERAL = '__general';
const toGoal = (v: string) => (v === GENERAL ? null : v);
const fromGoal = (v: string | null | undefined) => v ?? GENERAL;

export function TransactionDialog({ open, onOpenChange, mode: initialMode, goalId, holdingId, edit }: {
  open: boolean; onOpenChange: (v: boolean) => void; mode: TxMode; goalId?: string | null; holdingId?: string; edit?: Transaction;
}) {
  const goals = useStore((s) => s.goals);
  const holdings = useStore((s) => s.holdings);
  const profile = useStore((s) => s.profile);
  const commit = useStore((s) => s.commit);
  const d = useDerived();
  const cats = useCategories();
  const live = holdings.filter((h) => !h.archived || h.id === holdingId || h.id === edit?.holdingId);

  const [mode, setMode] = useState<TxMode>(initialMode);
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState(0);
  const [grams, setGrams] = useState<number | undefined>();
  const [hId, setHId] = useState<string>('');
  const [toHId, setToHId] = useState<string>('');
  const [gId, setGId] = useState<string>(GENERAL);
  const [toGId, setToGId] = useState<string>(GENERAL);
  const [reason, setReason] = useState<string>(cats.cats.withdrawReasons[0] ?? 'Spent on the goal');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    const firstLive = live.find((h) => !h.archived)?.id;
    setMode(edit ? edit.kind : initialMode);
    setDate(edit?.date ?? todayISO());
    setAmount(edit?.amount ?? 0);
    setGrams(edit?.quantityGrams);
    setHId(edit?.holdingId ?? holdingId ?? firstLive ?? 'new:bank');
    setToHId(live.find((h) => !h.archived && h.id !== (holdingId ?? firstLive))?.id ?? 'new:mutual_fund');
    setGId(fromGoal(edit ? edit.goalId : goalId === undefined ? goals.find((g) => g.status === 'active')?.id : goalId));
    setToGId(GENERAL);
    setReason(edit && edit.kind === 'withdrawal' ? txReasonLabel(edit) : cats.cats.withdrawReasons[0] ?? 'Spent on the goal');
    setNote(edit?.note ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const holding = holdings.find((h) => h.id === hId);
  const newType = hId.startsWith('new:') ? (hId.slice(4) as HoldingTypeId) : null;
  const isQty = (holding?.valuation ?? (newType ? cats.info(newType).valuation : 'market')) === 'quantity';
  const available = holding ? d.snap.holdings[holding.id]?.owners[gId === GENERAL ? UNASSIGNED : gId]?.value ?? 0 : 0;

  const goalOptions: PickerOption[] = [
    ...goals.filter((g) => g.status !== 'archived' || g.id === goalId).map((g) => ({ value: g.id, label: g.name, icon: <span>{g.icon}</span> })),
    { value: GENERAL, label: 'General savings', hint: 'Not for any goal', icon: <span>🪙</span> },
  ];

  async function save() {
    if (amount <= 0) { toast('Enter an amount above zero.', { tone: 'error' }); return; }
    const newHoldings: Holding[] = [];
    const resolve = (v: string): string => {
      if (!v.startsWith('new:')) return v;
      const t = v.slice(4) as HoldingTypeId;
      const info = cats.info(t);
      const h: Holding = { id: newId(), name: info.label, type: t, valuation: info.valuation, interestRate: info.valuation === 'interest' ? (profile?.defaultReturns as Record<string, number> | undefined)?.[t] ?? info.defaultReturn : undefined, archived: false, createdAt: nowStamp() };
      newHoldings.push(h);
      return h.id;
    };
    const base = { date, note: note || undefined, createdAt: edit?.createdAt ?? nowStamp() };
    const txs: Transaction[] = [];
    if (mode === 'contribution' || mode === 'withdrawal') {
      const r = mode === 'withdrawal' ? reasonFromLabel(reason) : { reason: (edit?.reason === 'opening' ? 'opening' : 'saving') as Transaction['reason'] };
      txs.push({ ...base, id: edit?.id ?? newId(), kind: mode, holdingId: resolve(hId), goalId: toGoal(gId), amount, quantityGrams: isQty && grams ? grams : undefined, ...r, checkInId: edit?.checkInId });
    } else if (mode === 'transfer') {
      if (hId === toHId) { toast('Pick two different holdings.', { tone: 'error' }); return; }
      const transferId = newId();
      txs.push(
        { ...base, id: newId(), kind: 'withdrawal', holdingId: hId, goalId: toGoal(gId), amount, reason: 'transfer', transferId },
        { ...base, id: newId(), kind: 'contribution', holdingId: resolve(toHId), goalId: toGoal(gId), amount, reason: 'transfer', transferId },
      );
    } else {
      if (gId === toGId) { toast('Pick two different goals.', { tone: 'error' }); return; }
      const transferId = newId();
      txs.push(
        { ...base, id: newId(), kind: 'withdrawal', holdingId: hId, goalId: toGoal(gId), amount, reason: 'reassign', transferId },
        { ...base, id: newId(), kind: 'contribution', holdingId: hId, goalId: toGoal(toGId), amount, reason: 'reassign', transferId },
      );
    }
    const undo = await commit({ put: { holdings: newHoldings, transactions: txs } });
    toast(edit ? 'Updated' : `${formatINR(amount)} saved`, { undo });
    onOpenChange(false);
  }

  const existingOnly = cats.holdingOptions(live.filter((h) => !h.archived || h.id === hId));
  const withNew = cats.holdingOptions(live.filter((h) => !h.archived || h.id === hId), { allowNew: true });

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={edit ? 'Edit entry' : TITLES[mode]}
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => void save()}>Save</Button></>}
    >
      <div className="space-y-4">
        {!edit && (
          <div className="overflow-x-auto scrollbar-none">
            <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: 'contribution', label: 'Add' }, { value: 'withdrawal', label: 'Take out' }, { value: 'transfer', label: 'Move' }, { value: 'reassign', label: 'Switch goal' }]} />
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount"><MoneyInput value={amount} onChange={setAmount} autoFocus /></Field>
          <Field label="Date"><DatePicker value={date} onChange={setDate} max={todayISO()} ariaLabel="Date" /></Field>
        </div>

        {(mode === 'contribution' || mode === 'withdrawal') && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={mode === 'contribution' ? 'Put into' : 'Taken from'}><Picker value={hId} onChange={setHId} options={mode === 'contribution' ? withNew : existingOnly} ariaLabel="Holding" /></Field>
              <Field label="For"><Picker value={gId} onChange={setGId} options={goalOptions} ariaLabel="Goal" /></Field>
            </div>
            {isQty && <Field label="Grams" hint="Optional"><NumberInput value={grams} onChange={setGrams} suffix="g" min={0} step={0.01} ariaLabel="Grams" /></Field>}
            {mode === 'withdrawal' && (
              <>
                <Field label="Why">
                  <Picker value={reason} onChange={setReason} options={cats.reasonOptions(reason)} ariaLabel="Reason"
                    onCreate={cats.addReason} createLabel="Add a reason" createPlaceholder="e.g. Car repair" onRemove={cats.removeReason} />
                </Field>
                {holding && amount > available + 1 && <p className="text-xs text-warn">This goal has about {formatINR(available)} in {holding.name}. We'll only take what's there.</p>}
              </>
            )}
          </>
        )}

        {mode === 'transfer' && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From"><Picker value={hId} onChange={setHId} options={existingOnly} ariaLabel="From holding" /></Field>
              <Field label="To"><Picker value={toHId} onChange={setToHId} options={withNew} ariaLabel="To holding" /></Field>
            </div>
            <Field label="Whose money"><Picker value={gId} onChange={setGId} options={goalOptions} ariaLabel="Goal" /></Field>
          </>
        )}

        {mode === 'reassign' && (
          <>
            <Field label="Money in"><Picker value={hId} onChange={setHId} options={existingOnly} ariaLabel="Holding" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From goal"><Picker value={gId} onChange={setGId} options={goalOptions} ariaLabel="From goal" /></Field>
              <Field label="To goal"><Picker value={toGId} onChange={setToGId} options={goalOptions} ariaLabel="To goal" /></Field>
            </div>
            {holding && <p className="text-xs text-muted">Available: {formatINR(available)}</p>}
          </>
        )}

        <Field label="Note" hint="Optional"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Diwali bonus" /></Field>
      </div>
    </Dialog>
  );
}
