import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface PickerOption {
  value: string;
  label: string;
  icon?: ReactNode;
  hint?: string;
  group?: string;
  /** shows a small × to delete this option */
  removable?: boolean;
}

/**
 * Good-looking dropdown. Searchable when the list is long, optionally lets the user
 * create new options ("+ Add new…") and remove their own ones.
 */
export function Picker({
  value, onChange, options, placeholder = 'Choose…', ariaLabel, className, size = 'md',
  onCreate, createLabel = 'Add new', createPlaceholder = 'Name', onRemove, searchable, renderValue, align = 'start',
}: {
  value: string | undefined; onChange: (v: string) => void; options: PickerOption[]; placeholder?: string; ariaLabel?: string;
  className?: string; size?: 'sm' | 'md'; onCreate?: (label: string) => string | void; createLabel?: string; createPlaceholder?: string;
  onRemove?: (v: string) => void; searchable?: boolean; renderValue?: (o: PickerOption) => ReactNode; align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);
  const canSearch = searchable ?? options.length > 8;

  const filtered = useMemo(() => (q ? options.filter((o) => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(q.toLowerCase())) : options), [options, q]);
  useEffect(() => { if (open) { setQ(''); setCreating(false); setNewName(''); setActive(Math.max(0, options.findIndex((o) => o.value === value))); } }, [open, options, value]);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const pick = (v: string) => { onChange(v); setOpen(false); };
  const create = () => {
    const name = newName.trim();
    if (!name || !onCreate) return;
    const v = onCreate(name);
    if (typeof v === 'string') onChange(v);
    setOpen(false);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (creating) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(filtered.length - 1, a + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    if (e.key === 'Enter' && filtered[active]) { e.preventDefault(); pick(filtered[active].value); }
  };

  let lastGroup: string | undefined;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          className={cn(
            'group flex w-full items-center gap-2 rounded-xl border border-border bg-surface text-left transition-all hover:border-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 data-[state=open]:border-accent data-[state=open]:ring-2 data-[state=open]:ring-accent/20',
            size === 'sm' ? 'h-9 px-3 text-sm' : 'h-11 px-3.5 text-[15px]',
            className,
          )}
        >
          {selected ? (
            <span className="flex min-w-0 flex-1 items-center gap-2">
              {selected.icon && <span className="shrink-0">{selected.icon}</span>}
              <span className="truncate">{renderValue ? renderValue(selected) : selected.label}</span>
            </span>
          ) : <span className="flex-1 truncate text-muted">{placeholder}</span>}
          <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={6}
          collisionPadding={12}
          onKeyDown={onKey}
          className="z-[70] w-[var(--radix-popover-trigger-width)] min-w-[220px] max-w-[min(92vw,420px)] overflow-hidden rounded-2xl border border-border bg-surface/95 p-1.5 shadow-lift backdrop-blur-xl data-[state=open]:animate-[popIn_140ms_ease-out]"
        >
          {canSearch && !creating && (
            <div className="relative mb-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} placeholder="Search…" className="h-9 w-full rounded-xl bg-subtle pl-9 pr-3 text-sm outline-none" aria-label="Search options" />
            </div>
          )}
          <div ref={listRef} role="listbox" className="max-h-64 overflow-y-auto overscroll-contain">
            {filtered.map((o, i) => {
              const header = o.group && o.group !== lastGroup ? o.group : null;
              lastGroup = o.group;
              return (
                <div key={o.value}>
                  {header && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{header}</p>}
                  <div
                    data-idx={i}
                    role="option"
                    aria-selected={o.value === value}
                    tabIndex={-1}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(o.value)}
                    className={cn('group/opt flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors', i === active ? 'bg-subtle' : '')}
                  >
                    {o.icon && <span className="shrink-0">{o.icon}</span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{o.label}</span>
                      {o.hint && <span className="block truncate text-xs text-muted">{o.hint}</span>}
                    </span>
                    {o.value === value && <Check className="h-4 w-4 shrink-0 text-accent" />}
                    {o.removable && onRemove && (
                      <button type="button" aria-label={`Delete ${o.label}`} onClick={(e) => { e.stopPropagation(); onRemove(o.value); }} className="rounded-md p-1 text-muted opacity-0 transition-opacity hover:bg-border/60 hover:text-loss group-hover/opt:opacity-100 focus:opacity-100">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {!filtered.length && <p className="px-3 py-4 text-center text-sm text-muted">Nothing found</p>}
          </div>
          {onCreate && (
            <div className="mt-1 border-t border-border pt-1">
              {creating ? (
                <form className="flex items-center gap-1.5 p-1" onSubmit={(e) => { e.preventDefault(); create(); }}>
                  <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={createPlaceholder} className="h-9 min-w-0 flex-1 rounded-xl bg-subtle px-3 text-sm outline-none focus:ring-2 focus:ring-accent/30" aria-label={createPlaceholder} />
                  <button type="submit" disabled={!newName.trim()} className="h-9 rounded-xl bg-fg px-3 text-sm font-medium text-bg disabled:opacity-40">Add</button>
                </form>
              ) : (
                <button type="button" onClick={() => { setCreating(true); setNewName(q); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-accent hover:bg-subtle">
                  <Plus className="h-4 w-4" /> {q ? `${createLabel} “${q}”` : `${createLabel}…`}
                </button>
              )}
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
