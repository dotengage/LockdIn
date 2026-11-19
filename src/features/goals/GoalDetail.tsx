import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Archive, CheckCircle2, Copy, MoreHorizontal, Pause, Pencil, Play, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, Menu, Money, ProgressBar, StatusPill, Tabs, TabsContent, TabsList } from '@/components/ui/misc';
import { Picker } from '@/components/ui/picker';
import { toast } from '@/components/ui/toast';
import { useStore } from '@/store/useStore';
import { useDerived } from '@/store/useDerived';
import { fmtDuration, fmtMonthYear } from '@/lib/finance/dates';
import { newId, nowStamp } from '@/lib/ids';
import type { Goal } from '@/lib/types';
import { GoalForm } from './GoalForm';
import { OverviewTab } from './OverviewTab';
import { WhatIfTab } from './WhatIfTab';
import { MoneyTab } from './MoneyTab';
import { PlannerEditor } from './planner/PlannerEditor';
import { Confetti } from '@/components/ui/Confetti';

export function GoalDetail() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const goal = useStore((s) => s.goals.find((g) => g.id === id));
  const goals = useStore((s) => s.goals);
  const transactions = useStore((s) => s.transactions);
  const saveGoal = useStore((s) => s.saveGoal);
  const commit = useStore((s) => s.commit);
  const d = useDerived();
  const [editing, setEditing] = useState<Goal | null>(null);
  const [deleting, setDeleting] = useState(false);
  const tab = params.get('tab') ?? 'overview';
  const m = goal ? d.metrics[goal.id] : undefined;
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    if (m?.health === 'reached' && goal?.status === 'active') {
      const key = `lockdin-celebrated-${goal.id}`;
      try {
        if (!localStorage.getItem(key)) { setCelebrate(true); localStorage.setItem(key, '1'); }
      } catch { /* ignore */ }
    }
  }, [m?.health, goal?.id, goal?.status]);

  const txCount = useMemo(() => transactions.filter((t) => t.goalId === id).length, [transactions, id]);

  if (!goal || !m) {
    return <EmptyState title="Goal not found" description="It may have been deleted." action={<Link to="/goals"><Button>Back to goals</Button></Link>} />;
  }

  const setStatus = async (status: Goal['status']) => {
    const prev = goal;
    await saveGoal({ ...goal, status });
    toast(`${goal.name} ${status === 'active' ? 'resumed' : status}`, { undo: () => saveGoal(prev) });
  };

  const duplicate = async () => {
    const copy: Goal = {
      ...structuredClone(goal), id: newId(), name: `${goal.name} (copy)`, createdAt: nowStamp(), updatedAt: nowStamp(),
    };
    if (copy.planner) copy.planner.sections = copy.planner.sections.map((s) => ({ ...s, id: newId() }));
    // re-link percent items to the new section ids
    if (copy.planner && goal.planner) {
      const map = new Map(goal.planner.sections.map((s, i) => [s.id, copy.planner!.sections[i].id]));
      copy.planner.sections.forEach((s) => s.items.forEach((it) => { it.id = newId(); if (it.kind === 'percent') it.ofSectionIds = it.ofSectionIds.map((x) => map.get(x) ?? x); }));
    }
    await saveGoal(copy);
    toast('Duplicated. Tweak it to compare scenarios.');
    navigate(`/goals/${copy.id}`);
  };

  return (
    <div>
      {celebrate && <Confetti onDone={() => setCelebrate(false)} />}
      <div className="mb-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/goals')}><ArrowLeft className="h-4 w-4" /> Goals</Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(structuredClone(goal))}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
          <Menu
            trigger={<Button variant="outline" size="sm" aria-label="More actions"><MoreHorizontal className="h-4 w-4" /></Button>}
            items={[
              { label: 'Duplicate', icon: <Copy className="h-4 w-4" />, onSelect: () => void duplicate() },
              goal.status === 'paused'
                ? { label: 'Resume', icon: <Play className="h-4 w-4" />, onSelect: () => void setStatus('active') }
                : { label: 'Pause', icon: <Pause className="h-4 w-4" />, onSelect: () => void setStatus('paused') },
              { label: 'Mark complete', icon: <CheckCircle2 className="h-4 w-4" />, onSelect: () => void setStatus('completed') },
              { label: 'Archive', icon: <Archive className="h-4 w-4" />, onSelect: () => void setStatus('archived') },
              'sep',
              { label: 'Delete', icon: <Trash2 className="h-4 w-4" />, danger: true, onSelect: () => setDeleting(true) },
            ]}
          />
        </div>
      </div>

      {/* Hero */}
      <Card className="mb-6 overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl" style={{ backgroundColor: `${goal.color}22` }}>{goal.icon}</div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{goal.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                <StatusPill health={m.health} />
                <span>{m.dueNow ? 'Due now' : `${fmtDuration(m.monthsLeft)} left`} · {fmtMonthYear(goal.savingEndDate)}</span>
              </div>
            </div>
          </div>
          {m.health === 'reached' && goal.status === 'active' && (
            <Button onClick={() => void setStatus('completed')}><CheckCircle2 className="h-4 w-4" /> Mark complete</Button>
          )}
        </div>
        {goal.description && <p className="mt-4 text-sm text-muted">{goal.description}</p>}
        <div className="mt-6">
          <div className="mb-2 flex items-end justify-between gap-2">
            <p className="text-3xl font-semibold tracking-tight sm:text-4xl"><Money value={m.currentValue} animated /></p>
            <p className="pb-1 text-sm text-muted num">of <Money value={m.target} /> · {(m.progress * 100).toFixed(1)}%</p>
          </div>
          <ProgressBar value={m.progress} color={goal.color} height={10} />
        </div>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList tabs={[{ value: 'overview', label: 'Overview' }, { value: 'plan', label: 'Plan' }, { value: 'money', label: 'Money' }, { value: 'whatif', label: 'What-if' }]} className="mb-6" />
        <TabsContent value="overview"><OverviewTab goal={goal} m={m} /></TabsContent>
        <TabsContent value="plan">
          {goal.mode === 'planner' && goal.planner ? <PlannerEditor goal={goal} /> : <SimplePlan goal={goal} />}
        </TabsContent>
        <TabsContent value="money"><MoneyTab goal={goal} /></TabsContent>
        <TabsContent value="whatif"><WhatIfTab goal={goal} m={m} /></TabsContent>
      </Tabs>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)} title="Edit goal" size="lg"
        footer={<><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={async () => { if (editing) { await saveGoal(editing); toast('Goal updated'); setEditing(null); } }}>Save changes</Button></>}
      >
        {editing && <GoalForm goal={editing} onChange={setEditing} />}
      </Dialog>

      <DeleteGoalDialog open={deleting} onOpenChange={setDeleting} goal={goal} txCount={txCount} others={goals.filter((g) => g.id !== goal.id)}
        onDone={async (reassignTo) => {
          const txs = transactions.filter((t) => t.goalId === goal.id);
          const undo = await commit({
            del: { goals: [goal.id], ...(reassignTo === undefined ? { transactions: [] } : {}) },
            put: reassignTo !== undefined ? { transactions: txs.map((t) => ({ ...t, goalId: reassignTo })) } : undefined,
          });
          setDeleting(false);
          navigate('/goals');
          toast(`${goal.name} deleted`, { undo });
        }}
        onArchive={async () => { setDeleting(false); await setStatus('archived'); }}
      />
    </div>
  );
}

function SimplePlan({ goal }: { goal: Goal }) {
  const saveGoal = useStore((s) => s.saveGoal);
  const [draft, setDraft] = useState(goal);
  useEffect(() => setDraft(goal), [goal]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(goal);
  return (
    <Card>
      <GoalForm goal={draft} onChange={setDraft} />
      {dirty && (
        <div className="sticky bottom-20 mt-6 flex justify-end gap-2 lg:bottom-4">
          <Button variant="outline" onClick={() => setDraft(goal)}>Discard</Button>
          <Button onClick={async () => { await saveGoal(draft); toast('Plan saved'); }}>Save plan</Button>
        </div>
      )}
    </Card>
  );
}

function DeleteGoalDialog({ open, onOpenChange, goal, txCount, others, onDone, onArchive }: {
  open: boolean; onOpenChange: (v: boolean) => void; goal: Goal; txCount: number; others: Goal[];
  onDone: (reassignTo: string | null | undefined) => void; onArchive: () => void;
}) {
  const [target, setTarget] = useState<string>('__unassigned');
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Delete ${goal.name}?`} size="sm"
      description={txCount ? `This goal has ${txCount} transaction${txCount > 1 ? 's' : ''}. The money still exists in your holdings, so choose where it should go.` : 'This can be undone for a few seconds.'}
      footer={<>
        {txCount > 0 && <Button variant="outline" onClick={onArchive}>Archive instead</Button>}
        <Button variant="danger" onClick={() => onDone(txCount ? (target === '__unassigned' ? null : target) : undefined)}>Delete</Button>
      </>}
    >
      {txCount > 0 && (
        <Picker value={target} onChange={setTarget} ariaLabel="Move the money to"
          options={[{ value: '__unassigned', label: 'General savings', icon: <span>🪙</span> }, ...others.map((g) => ({ value: g.id, label: g.name, icon: <span>{g.icon}</span> }))]} />
      )}
    </Dialog>
  );
}
