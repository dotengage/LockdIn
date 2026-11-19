import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronUp } from 'lucide-react';
import type { Planner } from '@/lib/types';
import type { PlannerSummary as Summary } from '@/lib/finance/planner';
import { fmtMonthYear } from '@/lib/finance/dates';
import { formatINR, formatINRShort } from '@/lib/finance/format';
import { useDerived } from '@/store/useDerived';
import { useParams } from 'react-router-dom';

function Rows({ summary, planner }: { summary: Summary; planner: Planner }) {
  return (
    <dl className="space-y-2 text-sm">
      {summary.sectionTotals.map((s) => (
        <div key={s.id} className="flex justify-between gap-3"><dt className="truncate text-muted">{s.name}</dt><dd className="num">{formatINR(s.total)}</dd></div>
      ))}
      <div className="flex justify-between gap-3"><dt className="text-muted">Safety buffer ({planner.contingencyRate}%)</dt><dd className="num">{formatINR(summary.contingency)}</dd></div>
      <div className="flex justify-between gap-3 border-t border-border pt-2 font-medium"><dt>Total today</dt><dd className="num">{formatINR(summary.totalToday)}</dd></div>
      <div className="flex justify-between gap-3"><dt className="text-muted">{summary.multiplier > 1.0001 ? `With rising prices, by ${fmtMonthYear(planner.spendStartDate)}` : `By ${fmtMonthYear(planner.spendStartDate)}`}</dt><dd className="num">{formatINR(summary.totalAtGoal)}</dd></div>
      {summary.cushionToday > 0 && <div className="flex justify-between gap-3"><dt className="text-muted">Money for after</dt><dd className="num">{formatINR(summary.cushionAtGoal)}</dd></div>}
      {summary.perMonth != null && (
        <div className="flex justify-between gap-3 border-t border-border pt-2 text-xs text-muted">
          <dt>Average spend</dt>
          <dd className="num text-right">{formatINRShort(summary.perMonth)}/mo · {formatINRShort(summary.perDay ?? 0)}/day</dd>
        </div>
      )}
    </dl>
  );
}

export function PlannerSummary({ summary, planner, savingEnd }: { summary: Summary; planner: Planner; savingEnd: string }) {
  const [open, setOpen] = useState(false);
  const { id } = useParams();
  const d = useDerived();
  const m = id ? d.metrics[id] : undefined;
  const final = (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">You'll need</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight num">{formatINR(summary.finalTarget)}</p>
      <p className="mt-0.5 text-sm text-muted num">{formatINRShort(summary.finalTarget)} by {fmtMonthYear(savingEnd)}</p>
      {m && m.required > 0 && <p className="mt-2 text-sm">Save <b className="num">{formatINR(m.required)}</b>/month</p>}
    </div>
  );
  return (
    <>
      {/* Desktop: sticky panel */}
      <aside className="hidden lg:block">
        <div className="sticky top-6 space-y-5 rounded-2xl border border-border bg-surface p-6 shadow-soft">
          {final}
          <Rows summary={summary} planner={planner} />
        </div>
      </aside>
      {/* Mobile: bottom sheet */}
      <div className="fixed inset-x-0 bottom-[64px] z-30 px-3 pb-2 lg:hidden">
        <div className="rounded-2xl border border-border bg-surface shadow-lift">
          <button className="flex w-full items-center justify-between px-4 py-3" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <span className="text-left">
              <span className="block text-[11px] uppercase tracking-wide text-muted">You'll need</span>
              <span className="num text-lg font-semibold">{formatINRShort(summary.finalTarget)}</span>
              {m && m.required > 0 && <span className="ml-2 text-xs text-muted num">· {formatINRShort(m.required)}/mo</span>}
            </span>
            <ChevronUp className={`h-5 w-5 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                <div className="max-h-[50dvh] overflow-y-auto border-t border-border px-4 py-3"><Rows summary={summary} planner={planner} /></div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className="h-20 lg:hidden" aria-hidden />
    </>
  );
}
