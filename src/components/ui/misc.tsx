import { useEffect, useRef, useState, type ReactNode } from 'react';
import { animate, motion, useReducedMotion } from 'framer-motion';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/cn';
import { useStore } from '@/store/useStore';
import { formatMoney, formatPct } from '@/lib/finance/format';
import { HEALTH_LABEL, type GoalHealth } from '@/lib/finance/goals';

/* ---------------- Money ---------------- */

export function useShort() {
  return useStore((s) => s.profile?.shortNumbers ?? true);
}

export function Money({ value, short, sign, className, animated }: { value: number; short?: boolean; sign?: boolean; className?: string; animated?: boolean }) {
  const pref = useShort();
  const s = short ?? pref;
  if (animated) return <AnimatedMoney value={value} short={s} sign={sign} className={className} />;
  return <span className={cn('num', className)}>{formatMoney(value, s, { sign })}</span>;
}

function AnimatedMoney({ value, short, sign, className }: { value: number; short: boolean; sign?: boolean; className?: string }) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : 0);
  const prev = useRef(reduce ? value : 0);
  useEffect(() => {
    if (reduce) { setDisplay(value); return; }
    const controls = animate(prev.current, value, { duration: 0.7, ease: [0.2, 0.8, 0.2, 1], onUpdate: setDisplay });
    prev.current = value;
    return () => controls.stop();
  }, [value, reduce]);
  return <span className={cn('num', className)}>{formatMoney(display, short, { sign })}</span>;
}

export function Delta({ value, pct, className }: { value?: number; pct?: number; className?: string }) {
  const v = value ?? pct ?? 0;
  const color = v > 0.5 ? 'text-gain' : v < -0.5 ? 'text-loss' : 'text-muted';
  return (
    <span className={cn('num text-sm font-medium', color, className)}>
      {value != null && <Money value={value} sign />}
      {pct != null && <span className={value != null ? 'ml-1 opacity-80' : ''}>{value != null ? '(' : ''}{formatPct(pct, 1, true)}{value != null ? ')' : ''}</span>}
    </span>
  );
}

/* ---------------- Status ---------------- */

const HEALTH_STYLE: Record<GoalHealth, string> = {
  new: 'bg-subtle text-muted',
  on_track: 'bg-gain/10 text-gain',
  ahead: 'bg-gain/15 text-gain',
  reached: 'bg-gain/15 text-gain',
  completed: 'bg-accent-soft text-accent',
  slightly_behind: 'bg-warn/10 text-warn',
  behind: 'bg-loss/10 text-loss',
  paused: 'bg-subtle text-muted',
};

export function StatusPill({ health, className }: { health: GoalHealth; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', HEALTH_STYLE[health], className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {HEALTH_LABEL[health]}
    </span>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-full bg-subtle px-2 py-0.5 text-xs font-medium text-muted', className)}>{children}</span>;
}

/* ---------------- Progress ---------------- */

export function ProgressBar({ value, color = 'rgb(var(--accent))', className, height = 8 }: { value: number; color?: string; className?: string; height?: number }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={cn('w-full overflow-hidden rounded-full bg-subtle', className)} style={{ height }} role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100}>
      <motion.div className="h-full rounded-full" style={{ backgroundColor: color }} initial={{ width: 0 }} animate={{ width: `${v * 100}%` }} transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }} />
    </div>
  );
}

/* ---------------- Skeleton & empty ---------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('relative overflow-hidden rounded-xl bg-subtle before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent', className)} />;
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
      {icon && <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">{icon}</div>}
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ---------------- Tabs ---------------- */

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;
export function TabsList({ tabs, className }: { tabs: { value: string; label: ReactNode }[]; className?: string }) {
  return (
    <TabsPrimitive.List className={cn('scrollbar-none -mx-1 flex gap-1 overflow-x-auto border-b border-border px-1', className)}>
      {tabs.map((t) => (
        <TabsPrimitive.Trigger
          key={t.value}
          value={t.value}
          className="relative whitespace-nowrap px-3 pb-3 pt-1 text-sm font-medium text-muted transition-colors hover:text-fg data-[state=active]:text-fg data-[state=active]:after:absolute data-[state=active]:after:inset-x-2 data-[state=active]:after:-bottom-px data-[state=active]:after:h-0.5 data-[state=active]:after:rounded-full data-[state=active]:after:bg-accent"
        >
          {t.label}
        </TabsPrimitive.Trigger>
      ))}
    </TabsPrimitive.List>
  );
}

/* ---------------- Dropdown ---------------- */

export function Menu({ trigger, items, align = 'end' }: { trigger: ReactNode; items: ({ label: ReactNode; onSelect: () => void; danger?: boolean; icon?: ReactNode } | 'sep')[]; align?: 'start' | 'end' }) {
  return (
    <DropdownPrimitive.Root>
      <DropdownPrimitive.Trigger asChild>{trigger}</DropdownPrimitive.Trigger>
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content align={align} sideOffset={6} className="z-50 min-w-[180px] rounded-xl border border-border bg-surface p-1 shadow-lift data-[state=open]:animate-[popIn_120ms_ease-out]">
          {items.map((it, i) =>
            it === 'sep' ? <DropdownPrimitive.Separator key={i} className="my-1 h-px bg-border" /> : (
              <DropdownPrimitive.Item
                key={i}
                onSelect={it.onSelect}
                className={cn('flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-subtle', it.danger && 'text-loss')}
              >
                {it.icon}
                {it.label}
              </DropdownPrimitive.Item>
            ),
          )}
        </DropdownPrimitive.Content>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  );
}

export function AssumptionNote({ className }: { className?: string }) {
  return <p className={cn('text-xs text-muted', className)}>Returns are assumptions, not guarantees.</p>;
}

/* ---------------- Page header & stat ---------------- */

export function PageHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold tracking-tight num">{value}</p>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] },
};
