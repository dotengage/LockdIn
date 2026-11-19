import { useState } from 'react';
import { Plus, Tags, X } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card';
import { useCategories } from '@/store/useCategories';

/** Everything the user can rename, add or remove: income sources, withdrawal reasons, holding types. */
export function CategoriesCard() {
  const c = useCategories();
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><Tags className="h-4 w-4 text-muted" /> Your categories</span>} subtitle="Add your own or remove ones you don't use." />
      <div className="space-y-6">
        <ChipGroup title="Where money comes from" items={c.cats.incomeSources} onAdd={c.addIncomeSource} onRemove={c.removeIncomeSource} placeholder="e.g. YouTube" />
        <ChipGroup title="Reasons for taking money out" items={c.cats.withdrawReasons} onAdd={c.addReason} onRemove={c.removeReason} placeholder="e.g. Car repair" />
      </div>
    </Card>
  );
}

function ChipGroup({ title, items, onAdd, onRemove, placeholder }: { title: string; items: string[]; onAdd: (v: string) => void; onRemove: (v: string) => void; placeholder: string }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((i) => (
          <span key={i} className="group inline-flex items-center gap-1 rounded-full border border-border bg-surface py-1 pl-3 pr-1.5 text-sm">
            {i}
            <button type="button" onClick={() => onRemove(i)} aria-label={`Remove ${i}`} className="rounded-full p-0.5 text-muted hover:bg-subtle hover:text-loss"><X className="h-3.5 w-3.5" /></button>
          </span>
        ))}
        {adding ? (
          <form className="inline-flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); if (text.trim()) onAdd(text.trim()); setText(''); setAdding(false); }}>
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)} onBlur={() => !text && setAdding(false)} placeholder={placeholder} className="h-8 w-36 rounded-full border border-accent bg-surface px-3 text-sm outline-none" aria-label={`New ${title}`} />
            <button type="submit" className="h-8 rounded-full bg-fg px-3 text-sm font-medium text-bg">Add</button>
          </form>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-sm text-muted hover:border-muted hover:text-fg"><Plus className="h-3.5 w-3.5" /> Add</button>
        )}
      </div>
    </div>
  );
}
