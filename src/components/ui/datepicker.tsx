import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import {
  addDays, addMonths, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths,
} from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { fromISO, toISO } from '@/lib/finance/dates';

const trigger = 'group flex w-full items-center gap-2 rounded-xl border border-border bg-surface text-left transition-all hover:border-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 data-[state=open]:border-accent data-[state=open]:ring-2 data-[state=open]:ring-accent/20';
const panel = 'z-[70] rounded-2xl border border-border bg-surface/95 p-3 shadow-lift backdrop-blur-xl data-[state=open]:animate-[popIn_140ms_ease-out]';
const navBtn = 'flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-subtle hover:text-fg disabled:opacity-30';

/** Day picker with a clean calendar grid. Value is 'YYYY-MM-DD'. */
export function DatePicker({ value, onChange, min, max, ariaLabel, placeholder = 'Pick a date', size = 'md', className }: {
  value: string | undefined; onChange: (v: string) => void; min?: string; max?: string; ariaLabel?: string; placeholder?: string; size?: 'sm' | 'md'; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => startOfMonth(value ? fromISO(value) : new Date()));
  const today = new Date();
  const days: Date[] = [];
  const first = startOfWeek(view, { weekStartsOn: 1 });
  for (let i = 0; i < 42; i++) days.push(addDays(first, i));
  const disabled = (d: Date) => (min && toISO(d) < min) || (max && toISO(d) > max);
  const choose = (d: Date) => { onChange(toISO(d)); setOpen(false); };

  return (
    <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (o) setView(startOfMonth(value ? fromISO(value) : new Date())); }}>
      <Popover.Trigger asChild>
        <button type="button" aria-label={ariaLabel} className={cn(trigger, size === 'sm' ? 'h-9 px-3 text-sm' : 'h-11 px-3.5 text-[15px]', className)}>
          <CalendarDays className="h-4 w-4 shrink-0 text-muted" />
          <span className={cn('flex-1 truncate', !value && 'text-muted')}>{value ? format(fromISO(value), 'd MMM yyyy') : placeholder}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} collisionPadding={12} className={cn(panel, 'w-[300px]')}>
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className={navBtn} onClick={() => setView(subMonths(view, 1))} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
            <p className="text-sm font-semibold">{format(view, 'MMMM yyyy')}</p>
            <button type="button" className={navBtn} disabled={!!max && toISO(addMonths(view, 1)) > max} onClick={() => setView(addMonths(view, 1))} aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="py-1">{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {days.map((d) => {
              const sel = value && isSameDay(d, fromISO(value));
              const off = !isSameMonth(d, view);
              const dis = disabled(d);
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  disabled={!!dis}
                  onClick={() => choose(d)}
                  className={cn(
                    'num mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors',
                    sel ? 'bg-fg font-semibold text-bg' : isSameDay(d, today) ? 'font-semibold text-accent hover:bg-subtle' : 'hover:bg-subtle',
                    off && !sel && 'text-muted/50',
                    dis && 'pointer-events-none opacity-25',
                  )}
                >
                  {format(d, 'd')}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex gap-1.5 border-t border-border pt-2">
            {[['Today', today], ['Yesterday', addDays(today, -1)]].map(([l, d]) => (
              <button key={l as string} type="button" disabled={!!disabled(d as Date)} onClick={() => choose(d as Date)} className="rounded-full bg-subtle px-3 py-1 text-xs font-medium hover:bg-border/70 disabled:opacity-30">{l as string}</button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Month + year picker with quick "in N years" chips. Value is 'YYYY-MM-01'. */
export function MonthPicker({ value, onChange, minMonth, ariaLabel, quick = true, size = 'md', className }: {
  value: string; onChange: (v: string) => void; minMonth?: string; ariaLabel?: string; quick?: boolean; size?: 'sm' | 'md'; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => fromISO(value).getFullYear());
  const now = startOfMonth(new Date());
  const min = minMonth ?? toISO(now);
  const choose = (d: Date) => { onChange(toISO(startOfMonth(d))); setOpen(false); };
  const chips: [string, number][] = [['6 months', 6], ['1 year', 12], ['2 years', 24], ['3 years', 36], ['5 years', 60], ['10 years', 120]];

  return (
    <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (o) setYear(fromISO(value).getFullYear()); }}>
      <Popover.Trigger asChild>
        <button type="button" aria-label={ariaLabel} className={cn(trigger, size === 'sm' ? 'h-9 px-3 text-sm' : 'h-11 px-3.5 text-[15px]', className)}>
          <CalendarDays className="h-4 w-4 shrink-0 text-muted" />
          <span className="flex-1 truncate">{format(fromISO(value), 'MMMM yyyy')}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} collisionPadding={12} className={cn(panel, 'w-[300px]')}>
          <div className="mb-3 flex items-center justify-between">
            <button type="button" className={navBtn} disabled={year <= fromISO(min).getFullYear()} onClick={() => setYear(year - 1)} aria-label="Previous year"><ChevronLeft className="h-4 w-4" /></button>
            <p className="num text-sm font-semibold">{year}</p>
            <button type="button" className={navBtn} onClick={() => setYear(year + 1)} aria-label="Next year"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: 12 }, (_, m) => {
              const d = new Date(year, m, 1);
              const iso = toISO(d);
              const sel = iso.slice(0, 7) === value.slice(0, 7);
              const dis = iso < min;
              return (
                <button key={m} type="button" disabled={dis} onClick={() => choose(d)} className={cn('rounded-xl py-2.5 text-sm transition-colors', sel ? 'bg-fg font-semibold text-bg' : 'hover:bg-subtle', dis && 'pointer-events-none opacity-25')}>
                  {format(d, 'MMM')}
                </button>
              );
            })}
          </div>
          {quick && (
            <div className="mt-3 border-t border-border pt-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">From now</p>
              <div className="flex flex-wrap gap-1.5">
                {chips.map(([l, n]) => <button key={l} type="button" onClick={() => choose(addMonths(now, n))} className="rounded-full bg-subtle px-3 py-1 text-xs font-medium hover:bg-border/70">{l}</button>)}
              </div>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

