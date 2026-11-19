import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, PageHeader } from '@/components/ui/misc';
import { Segmented } from '@/components/ui/inputs';
import { formatINR } from '@/lib/finance/format';
import { useStore } from '@/store/useStore';
import { sortGoals, useDerived } from '@/store/useDerived';
import type { GoalStatus } from '@/lib/types';
import { GoalCard } from './GoalCard';
import { CapacityWarning } from './CapacityWarning';

export function GoalsPage() {
  const goals = useStore((s) => s.goals);
  const d = useDerived();
  const [filter, setFilter] = useState<GoalStatus>('active');
  const list = sortGoals(goals.filter((g) => g.status === filter));
  const counts = (s: GoalStatus) => goals.filter((g) => g.status === s).length;

  return (
    <div>
      <PageHeader
        title="Goals"
        subtitle={goals.length ? `${counts('active')} active · together need ${formatINR(d.totalRequired)}/month` : undefined}
        action={<Link to="/goals/new"><Button><Plus className="h-4 w-4" /> New goal</Button></Link>}
      />
      {goals.length > 0 && (
        <div className="mb-5 overflow-x-auto scrollbar-none">
          <Segmented value={filter} onChange={setFilter} options={(['active', 'paused', 'completed', 'archived'] as GoalStatus[]).map((s) => ({ value: s, label: `${s[0].toUpperCase()}${s.slice(1)} (${counts(s)})` }))} />
        </div>
      )}
      {filter === 'active' && <CapacityWarning />}
      {list.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((g, i) => <GoalCard key={g.id} goal={g} m={d.metrics[g.id]} index={i} />)}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border">
          <EmptyState
            icon={<Target className="h-6 w-6" />}
            title={goals.length ? `No ${filter} goals` : 'No goals yet'}
            description={goals.length ? 'Goals you move here will show up in this list.' : 'A goal turns "someday" into a plan with a monthly number. Start with one.'}
            action={!goals.length && <Link to="/goals/new"><Button><Plus className="h-4 w-4" /> Create your first goal</Button></Link>}
          />
        </div>
      )}
    </div>
  );
}
