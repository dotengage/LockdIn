import { motion } from 'framer-motion';
import { Info, Sparkles, TriangleAlert } from 'lucide-react';
import type { Insight } from '@/lib/finance/insights';
import { cn } from '@/lib/cn';

const ICON = { good: Sparkles, info: Info, warn: TriangleAlert };
const STYLE = { good: 'text-gain bg-gain/10', info: 'text-muted bg-subtle', warn: 'text-warn bg-warn/10' };

export function Insights({ items }: { items: Insight[] }) {
  return (
    <ul className="space-y-2">
      {items.map((it, i) => {
        const Icon = ICON[it.tone];
        return (
          <motion.li key={it.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="flex items-start gap-3 rounded-2xl bg-subtle/60 px-4 py-3 text-sm">
            <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full', STYLE[it.tone])}><Icon className="h-3.5 w-3.5" /></span>
            <p className="leading-relaxed">{it.text}</p>
          </motion.li>
        );
      })}
    </ul>
  );
}
