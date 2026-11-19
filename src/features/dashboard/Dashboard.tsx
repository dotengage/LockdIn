import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { ArrowUpRight, CloudUpload, Plus, RefreshCw, Target, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, Money } from '@/components/ui/misc';
import { Sparkline } from '@/components/charts/Sparkline';
import { useThemeColors } from '@/components/charts/chartUtils';
import { useStore } from '@/store/useStore';
import { useDerived } from '@/store/useDerived';
import { useUI } from '@/store/useUI';
import { savingsSeries } from '@/lib/finance/series';
import { formatINRShort, formatPct } from '@/lib/finance/format';
import { GoalCard } from '../goals/GoalCard';
import { SavingsChart } from './SavingsChart';
import { MoneySplit } from './MoneySplit';
import { cn } from '@/lib/cn';

const TAGLINE = 'Locked in. Stacking quietly.';

export function Dashboard() {
  const profile = useStore((s) => s.profile)!;
  const goals = useStore((s) => s.goals);
  const holdings = useStore((s) => s.holdings);
  const txs = useStore((s) => s.transactions);
  const vals = useStore((s) => s.valuations);
  const d = useDerived();
  const c = useThemeColors();
  const openCheckIn = useUI((s) => s.openCheckIn);
  const setValuationOpen = useUI((s) => s.setValuationOpen);
  const now = new Date();

  const monthly = useMemo(() => savingsSeries({ goals, holdings, txs, vals, goalId: null, tf: 'monthly', today: d.today }), [goals, holdings, txs, vals, d.today]);
  const thisMonth = monthly[monthly.length - 1];
  const savedThis = txs.filter((t) => t.kind === 'contribution' && t.reason === 'saving' && thisMonth && t.date >= thisMonth.start && t.date <= thisMonth.end).reduce((s, t) => s + t.amount, 0);
  const total = d.snap.totalValue;
  const gain = total - d.snap.totalInvested;
  const gainPct = d.snap.totalInvested > 0 ? (gain / d.snap.totalInvested) * 100 : 0;
  const hasData = txs.length > 0;

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">{format(now, 'EEEE, d MMMM')}</p>
          <h1 className="mt-2 text-[28px] font-semibold tracking-tight sm:text-4xl">Welcome back{profile.name ? `, ${profile.name}` : ''}.</h1>
          <p className="mt-1 text-[15px] text-muted">{TAGLINE}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!d.checkInDone && <Pill onClick={() => openCheckIn()} accent>Check-in due</Pill>}
          {d.valuationDue && <Pill onClick={() => setValuationOpen(true)}><RefreshCw className="h-3 w-3" /> Update values</Pill>}
        </div>
      </motion.div>

      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.05 }}>
        <Card className="relative overflow-hidden p-6 sm:p-8 dark:glow-accent">
          <div className="pointer-events-none absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-accent/20 blur-3xl dark:bg-accent/25" aria-hidden />
          <div className="relative grid gap-6 sm:grid-cols-[1fr_minmax(0,320px)] sm:items-end">
            <div>
              <p className="text-sm text-muted">Total saved</p>
              <p className="mt-1 text-[42px] font-semibold leading-none tracking-tight sm:text-6xl"><Money value={total} animated /></p>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-subtle px-3 py-1 num">+{formatINRShort(savedThis)} this month</span>
                {d.snap.totalInvested > 0 && Math.abs(gain) >= 1 && (
                  <span className={cn('inline-flex items-center gap-1 rounded-full px-3 py-1 num', gain >= 0 ? 'bg-gain/10 text-gain' : 'bg-loss/10 text-loss')}>
                    <ArrowUpRight className={cn('h-3.5 w-3.5', gain < 0 && 'rotate-90')} />{formatPct(Math.abs(gainPct), 1)} {gain >= 0 ? 'up' : 'down'}
                  </span>
                )}
              </div>
            </div>
            {monthly.some((p) => p.value > 0) && <div className="hidden sm:block"><Sparkline data={monthly.map((p) => p.value)} color={c.accent} height={80} /></div>}
          </div>
        </Card>
      </motion.div>

      {/* Goals */}
      <section>
        <SectionTitle title="Goals" link={{ to: '/goals', label: 'See all' }} />
        {d.activeGoals.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {d.activeGoals.map((g, i) => <GoalCard key={g.id} goal={g} m={d.metrics[g.id]} index={i} />)}
            <Link to="/goals/new" className="flex min-h-[140px] items-center justify-center gap-2 rounded-3xl border border-dashed border-border text-sm font-medium text-muted transition-colors hover:border-muted hover:text-fg">
              <Plus className="h-4 w-4" /> New goal
            </Link>
          </div>
        ) : (
          <Card><EmptyState icon={<Target className="h-6 w-6" />} title="What are you saving for?" description="Add a goal and we'll tell you exactly how much to put aside each month." action={<Link to="/goals/new"><Button><Plus className="h-4 w-4" /> Create a goal</Button></Link>} /></Card>
        )}
      </section>

      {hasData ? (
        <>
          <SavingsChart />
          <MoneySplit />
        </>
      ) : (
        <Card><EmptyState icon={<Wallet className="h-6 w-6" />} title="Your progress will show up here" description="Log what you saved with a quick check-in, or just tell the assistant." action={<Button onClick={() => openCheckIn()}><Plus className="h-4 w-4" /> Check in</Button>} /></Card>
      )}

      {d.backupDue && (
        <Link to="/settings#data" className="flex items-center justify-center gap-2 py-2 text-xs text-muted hover:text-fg">
          <CloudUpload className="h-3.5 w-3.5" /> Your data lives on this device. Back it up →
        </Link>
      )}
    </div>
  );
}

function SectionTitle({ title, link }: { title: string; link?: { to: string; label: string } }) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {link && <Link to={link.to} className="text-sm text-muted hover:text-fg">{link.label}</Link>}
    </div>
  );
}

function Pill({ children, onClick, accent }: { children: React.ReactNode; onClick: () => void; accent?: boolean }) {
  return (
    <button onClick={onClick} className={cn('inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors', accent ? 'bg-accent text-accent-fg hover:opacity-90' : 'bg-subtle text-fg hover:bg-border/70')}>
      {children}
    </button>
  );
}
