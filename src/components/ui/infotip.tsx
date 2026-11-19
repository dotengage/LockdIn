import { useRef, useState, type ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Info } from 'lucide-react';
import { cn } from '@/lib/cn';
import { GLOSSARY, type GlossaryKey } from '@/lib/glossary';

/** Small (i) icon. Opens on hover (desktop) or tap (mobile) with a plain-language explanation. */
export function InfoTip({ term, children, className }: { term?: GlossaryKey; children?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const show = () => { clearTimeout(timer.current); setOpen(true); };
  const hide = () => { timer.current = setTimeout(() => setOpen(false), 120); };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" aria-label="What does this mean?" onMouseEnter={show} onMouseLeave={hide}
          className={cn('inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full align-middle text-muted transition-colors hover:text-fg', className)}>
          <Info className="h-3.5 w-3.5" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="top" sideOffset={6} collisionPadding={12} onMouseEnter={show} onMouseLeave={hide} onOpenAutoFocus={(e) => e.preventDefault()}
          className="z-[80] max-w-[280px] rounded-xl bg-fg px-3.5 py-2.5 text-[13px] leading-relaxed text-bg shadow-lift data-[state=open]:animate-[popIn_120ms_ease-out]">
          {children ?? (term ? GLOSSARY[term] : null)}
          <Popover.Arrow className="fill-fg" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Label with an optional (i) tip. */
export function LabelTip({ children, term }: { children: ReactNode; term?: GlossaryKey }) {
  return <span className="inline-flex items-center gap-1.5">{children}{term && <InfoTip term={term} />}</span>;
}
