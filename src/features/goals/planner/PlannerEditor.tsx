import { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ChevronDown, ChevronUp, GripVertical, Plus, Trash2, X } from 'lucide-react';
import type { Goal, Planner, PlannerItem, PlannerSection } from '@/lib/types';
import { cn } from '@/lib/cn';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input, MoneyInput, NumberInput, Switch } from '@/components/ui/inputs';
import { Menu } from '@/components/ui/misc';
import { toast } from '@/components/ui/toast';
import { useStore } from '@/store/useStore';
import { useDerived } from '@/store/useDerived';
import { inflationApplies, itemCost, rateItemPerUnit, summarizePlanner } from '@/lib/finance/planner';
import { MonthPicker } from '@/components/ui/datepicker';
import { LabelTip } from '@/components/ui/infotip';
import { rawMonthsBetween } from '@/lib/finance/dates';
import { formatINR, formatINRShort } from '@/lib/finance/format';
import { newId } from '@/lib/ids';
import { PlannerSummary } from './PlannerSummary';

export function PlannerEditor({ goal }: { goal: Goal }) {
  const saveGoal = useStore((s) => s.saveGoal);
  const d = useDerived();
  const [planner, setPlanner] = useState<Planner>(goal.planner!);
  const [savingEnd, setSavingEnd] = useState(goal.savingEndDate);
  const [advanced, setAdvanced] = useState(false);
  const first = useRef(true);
  const goalRef = useRef(goal);
  goalRef.current = goal;

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => void saveGoal({ ...goalRef.current, planner, savingEndDate: savingEnd }), 400);
    return () => clearTimeout(t);
  }, [planner, savingEnd, saveGoal]);

  const sections = useMemo(() => [...planner.sections].sort((a, b) => a.order - b.order), [planner.sections]);
  const monthsToStart = Math.max(0, rawMonthsBetween(d.today, planner.spendStartDate));
  const summary = useMemo(() => summarizePlanner(planner, monthsToStart), [planner, monthsToStart]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const patch = (p: Partial<Planner>) => setPlanner((cur) => ({ ...cur, ...p }));
  const patchSection = (id: string, p: Partial<PlannerSection>) => setPlanner((cur) => ({ ...cur, sections: cur.sections.map((s) => (s.id === id ? { ...s, ...p } : s)) }));
  const patchItem = (sid: string, iid: string, p: Partial<PlannerItem>) =>
    setPlanner((cur) => ({ ...cur, sections: cur.sections.map((s) => (s.id === sid ? { ...s, items: s.items.map((i) => (i.id === iid ? ({ ...i, ...p } as PlannerItem) : i)) } : s)) }));
  const addItem = (sid: string, kind: PlannerItem['kind']) => {
    const item: PlannerItem = kind === 'fixed'
      ? { id: newId(), kind, name: '', cost: 0, enabled: true }
      : kind === 'rate'
        ? { id: newId(), kind, name: '', quantity: 1, unit: 'days', rates: [{ label: 'Per day', amount: 0 }], enabled: true }
        : { id: newId(), kind, name: '', percent: 2, ofSectionIds: sections.filter((s) => s.id !== sid).map((s) => s.id), enabled: true };
    setPlanner((cur) => ({ ...cur, sections: cur.sections.map((s) => (s.id === sid ? { ...s, collapsed: false, items: [...s.items, item] } : s)) }));
  };
  const removeItem = (sid: string, iid: string) => {
    const before = planner;
    setPlanner((cur) => ({ ...cur, sections: cur.sections.map((s) => (s.id === sid ? { ...s, items: s.items.filter((i) => i.id !== iid) } : s)) }));
    toast('Item removed', { undo: () => setPlanner(before) });
  };
  const removeSection = (sid: string) => {
    const before = planner;
    setPlanner((cur) => ({
      ...cur,
      sections: cur.sections.filter((s) => s.id !== sid).map((s) => ({ ...s, items: s.items.map((i) => (i.kind === 'percent' ? { ...i, ofSectionIds: i.ofSectionIds.filter((x) => x !== sid) } : i)) })),
    }));
    toast('Section removed', { undo: () => setPlanner(before) });
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = sections.map((s) => s.id);
    const next = arrayMove(sections, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    patch({ sections: next.map((s, i) => ({ ...s, order: i })) });
  };

  const longTerm = inflationApplies(monthsToStart + Math.max(0, planner.spendDurationMonths));
  const durationDays = Math.round(planner.spendDurationMonths * (365 / 12));
  const daysMismatch = summary.rateDays > 0 && planner.spendDurationMonths > 0 && Math.abs(summary.rateDays - durationDays) > 3;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-6">
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Need the money by"><MonthPicker value={savingEnd} onChange={(v) => { if (planner.spendStartDate === savingEnd) patch({ spendStartDate: v }); setSavingEnd(v); }} ariaLabel="Need the money by" /></Field>
            <Field label={<LabelTip term="contingency">Safety buffer</LabelTip>}><NumberInput value={planner.contingencyRate} onChange={(n) => patch({ contingencyRate: n })} suffix="%" min={0} max={100} ariaLabel="Safety buffer" /></Field>
          </div>
          <button type="button" onClick={() => setAdvanced((v) => !v)} className="mt-4 flex items-center gap-1 text-sm text-muted hover:text-fg" aria-expanded={advanced}>
            More settings <ChevronDown className={`h-4 w-4 transition-transform ${advanced ? 'rotate-180' : ''}`} />
          </button>
          {advanced && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {longTerm && <Field label={<LabelTip term="inflation">Prices rise per year</LabelTip>}><NumberInput value={planner.inflationRate} onChange={(n) => patch({ inflationRate: n })} suffix="%" min={0} max={30} ariaLabel="Prices rise per year" /></Field>}
              <Field label={<LabelTip term="spread">Spending spread over</LabelTip>}><NumberInput value={planner.spendDurationMonths} onChange={(n) => patch({ spendDurationMonths: Math.round(n) })} suffix="months" min={0} max={240} step={1} ariaLabel="Spending spread over months" /></Field>
              <Field label={<LabelTip term="spendStart">Spending starts</LabelTip>}><MonthPicker value={planner.spendStartDate} onChange={(v) => patch({ spendStartDate: v })} ariaLabel="Spending starts" /></Field>
              <Field label={<LabelTip term="cushion">Money for after</LabelTip>}><MoneyInput value={planner.afterGoalCushion} onChange={(n) => patch({ afterGoalCushion: n })} ariaLabel="Money for after" /></Field>
            </div>
          )}
          {daysMismatch && (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Your day-based items add up to {summary.rateDays} days, but spending is spread over {planner.spendDurationMonths} months (about {durationDays} days).
            </p>
          )}
        </Card>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {sections.map((s) => (
                <SectionCard
                  key={s.id}
                  section={s}
                  all={sections}
                  total={summary.sectionTotals.find((x) => x.id === s.id)?.total ?? 0}
                  onPatch={(p) => patchSection(s.id, p)}
                  onPatchItem={(iid, p) => patchItem(s.id, iid, p)}
                  onAddItem={(k) => addItem(s.id, k)}
                  onRemoveItem={(iid) => removeItem(s.id, iid)}
                  onRemove={() => removeSection(s.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <Button variant="outline" className="w-full border-dashed" onClick={() => patch({ sections: [...planner.sections, { id: newId(), name: 'New section', order: planner.sections.length, collapsed: false, items: [] }] })}>
          <Plus className="h-4 w-4" /> Add section
        </Button>
      </div>

      <PlannerSummary summary={summary} planner={planner} savingEnd={savingEnd} />
    </div>
  );
}

function SectionCard({ section, all, total, onPatch, onPatchItem, onAddItem, onRemoveItem, onRemove }: {
  section: PlannerSection; all: PlannerSection[]; total: number;
  onPatch: (p: Partial<PlannerSection>) => void; onPatchItem: (iid: string, p: Partial<PlannerItem>) => void;
  onAddItem: (k: PlannerItem['kind']) => void; onRemoveItem: (iid: string) => void; onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const enabled = section.items.filter((i) => i.enabled).length;
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn('rounded-2xl border border-border bg-surface shadow-soft', isDragging && 'z-10 shadow-lift')}>
      <div className="flex items-center gap-2 p-3 sm:p-4">
        <button className="cursor-grab touch-none rounded-lg p-1.5 text-muted hover:bg-subtle active:cursor-grabbing" aria-label={`Reorder ${section.name}`} {...attributes} {...listeners}><GripVertical className="h-4 w-4" /></button>
        <input value={section.name} onChange={(e) => onPatch({ name: e.target.value })} className="min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1 font-semibold hover:bg-subtle focus:bg-subtle focus:outline-none" aria-label="Section name" />
        <div className="text-right">
          <p className="num text-sm font-semibold">{formatINRShort(total)}</p>
          <p className="text-[11px] text-muted">{enabled}/{section.items.length} items</p>
        </div>
        <button onClick={() => onPatch({ collapsed: !section.collapsed })} className="rounded-lg p-1.5 text-muted hover:bg-subtle" aria-label={section.collapsed ? 'Expand section' : 'Collapse section'} aria-expanded={!section.collapsed}>
          {section.collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
        <Menu trigger={<button className="rounded-lg p-1.5 text-muted hover:bg-subtle" aria-label="Section actions"><Trash2 className="h-4 w-4" /></button>} items={[{ label: 'Delete section', danger: true, onSelect: onRemove }]} />
      </div>
      <AnimatePresence initial={false}>
        {!section.collapsed && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="space-y-2 border-t border-border p-3 sm:p-4">
              {section.items.map((it) => <ItemRow key={it.id} item={it} all={all} sectionId={section.id} onPatch={(p) => onPatchItem(it.id, p)} onRemove={() => onRemoveItem(it.id)} />)}
              {!section.items.length && <p className="py-3 text-center text-sm text-muted">No items yet.</p>}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button size="sm" variant="secondary" onClick={() => onAddItem('fixed')}><Plus className="h-3.5 w-3.5" /> A cost</Button>
                <Button size="sm" variant="secondary" onClick={() => onAddItem('rate')}><Plus className="h-3.5 w-3.5" /> Per day / per unit</Button>
                <Button size="sm" variant="secondary" onClick={() => onAddItem('percent')}><Plus className="h-3.5 w-3.5" /> A % of other costs</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ItemRow({ item, all, sectionId, onPatch, onRemove }: { item: PlannerItem; all: PlannerSection[]; sectionId: string; onPatch: (p: Partial<PlannerItem>) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const cost = itemCost({ ...item, enabled: true } as PlannerItem, all);
  return (
    <div className={cn('rounded-xl border border-border transition-opacity', !item.enabled && 'opacity-50')}>
      <div className="flex items-center gap-2 px-3 py-2">
        <Switch label={`Include ${item.name || 'item'}`} checked={item.enabled} onCheckedChange={(v) => onPatch({ enabled: v })} />
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <p className={cn('truncate text-sm font-medium', !item.name && 'text-muted')}>{item.name || 'Untitled item'}</p>
          <p className="truncate text-xs text-muted">
            {item.kind === 'rate' && `${item.quantity} ${item.unit} × ${formatINR(rateItemPerUnit(item))}`}
            {item.kind === 'percent' && `${item.percent}% of ${all.filter((s) => item.ofSectionIds.includes(s.id)).map((s) => s.name).join(' + ') || 'nothing'}`}
            {item.kind === 'fixed' && (item.note || 'Fixed cost')}
          </p>
        </button>
        {item.kind === 'fixed' ? (
          <MoneyInput className="w-32 sm:w-36" value={item.cost} onChange={(n) => onPatch({ cost: n })} ariaLabel={`${item.name} cost`} />
        ) : (
          <span className="num w-24 text-right text-sm font-semibold sm:w-28">{formatINRShort(cost)}</span>
        )}
        <button onClick={() => setOpen((o) => !o)} className="rounded-lg p-1 text-muted hover:bg-subtle" aria-label="Edit details">{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
      </div>
      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><Input value={item.name} onChange={(e) => onPatch({ name: e.target.value })} autoFocus={!item.name} /></Field>
            <Field label="Note"><Input value={item.note ?? ''} onChange={(e) => onPatch({ note: e.target.value || undefined })} placeholder="Optional" /></Field>
          </div>
          {item.kind === 'rate' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Quantity"><NumberInput value={item.quantity} onChange={(n) => onPatch({ quantity: n })} min={0} step={1} ariaLabel="Quantity" /></Field>
                <Field label="Unit"><Input value={item.unit} onChange={(e) => onPatch({ unit: e.target.value })} placeholder="days" /></Field>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Rates per {item.unit.replace(/s$/, '') || 'unit'}</p>
                {item.rates.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input className="flex-1" value={r.label} aria-label="Rate label" onChange={(e) => onPatch({ rates: item.rates.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                    <MoneyInput className="w-32" value={r.amount} ariaLabel={`${r.label} amount`} onChange={(n) => onPatch({ rates: item.rates.map((x, j) => (j === i ? { ...x, amount: n } : x)) })} />
                    <button className="rounded-lg p-2 text-muted hover:bg-subtle" aria-label="Remove rate" onClick={() => onPatch({ rates: item.rates.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></button>
                  </div>
                ))}
                <Button size="sm" variant="ghost" onClick={() => onPatch({ rates: [...item.rates, { label: 'New rate', amount: 0 }] })}><Plus className="h-3.5 w-3.5" /> Add rate</Button>
                <p className="text-xs text-muted num">Line total: {item.quantity} × {formatINR(rateItemPerUnit(item))} = {formatINR(cost)}</p>
              </div>
            </>
          )}
          {item.kind === 'percent' && (
            <div className="space-y-2">
              <Field label="Percent"><NumberInput className="w-32" value={item.percent} onChange={(n) => onPatch({ percent: n })} suffix="%" min={0} max={100} ariaLabel="Percent" /></Field>
              <p className="text-sm font-medium">Of these sections</p>
              <div className="flex flex-wrap gap-2">
                {all.filter((s) => s.id !== sectionId).map((s) => {
                  const on = item.ofSectionIds.includes(s.id);
                  return (
                    <button key={s.id} type="button" onClick={() => onPatch({ ofSectionIds: on ? item.ofSectionIds.filter((x) => x !== s.id) : [...item.ofSectionIds, s.id] })} className={cn('rounded-full border px-3 py-1 text-xs font-medium', on ? 'border-accent bg-accent-soft text-accent' : 'border-border')}>
                      {s.name}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted">Uses the fixed and rate items of those sections, so percentages never count each other.</p>
            </div>
          )}
          <div className="flex justify-end"><Button size="sm" variant="ghost" className="text-loss" onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /> Delete item</Button></div>
        </div>
      )}
    </div>
  );
}

