import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { Goal } from '@/lib/types';
import type { GoalMetrics } from '@/lib/finance/goals';
import { fmtDuration } from '@/lib/finance/dates';
import { formatINRShort } from '@/lib/finance/format';
import { Money, ProgressBar, StatusPill } from '@/components/ui/misc';

/** Compact goal card: what it is, how far along, and the one number that matters. */
export function GoalCard({ goal, m, index = 0 }: { goal: Goal; m: GoalMetrics; index?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: index * 0.04 }}>
      <Link to={`/goals/${goal.id}`} className="group block h-full rounded-3xl border border-border bg-surface p-5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl" style={{ backgroundColor: `${goal.color}1f` }}>{goal.icon}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold tracking-tight">{goal.name}</p>
            <p className="text-xs text-muted">{m.dueNow ? 'Due now' : `${fmtDuration(m.monthsLeft)} left`}</p>
          </div>
          <StatusPill health={m.health} />
        </div>
        <div className="mt-5 flex items-baseline justify-between gap-2">
          <p className="text-2xl font-semibold tracking-tight"><Money value={m.currentValue} /></p>
          <p className="text-sm text-muted num">of {formatINRShort(m.target)}</p>
        </div>
        <ProgressBar value={m.progress} color={goal.color} className="mt-2.5" height={6} />
        <p className="mt-3 text-xs text-muted">
          {m.health === 'reached' ? 'Target reached 🎉' : m.required > 0 ? <>Save <span className="font-medium text-fg num">{formatINRShort(m.required)}</span> a month</> : 'On course with what you have'}
        </p>
      </Link>
    </motion.div>
  );
}
