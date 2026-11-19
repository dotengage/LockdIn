import { useEffect, useState, type ReactNode } from 'react';
import { formatINRShort, formatINR } from '@/lib/finance/format';

export interface ThemeColors { accent: string; muted: string; border: string; fg: string; gain: string; loss: string; warn: string; surface: string; subtle: string }

function read(): ThemeColors {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => `rgb(${cs.getPropertyValue(n).trim().split(/\s+/).join(',')})`;
  return { accent: v('--accent'), muted: v('--muted'), border: v('--border'), fg: v('--fg'), gain: v('--gain'), loss: v('--loss'), warn: v('--warn'), surface: v('--surface'), subtle: v('--subtle') };
}

/** Resolved theme colours for SVG charts; updates when the theme changes. */
export function useThemeColors(): ThemeColors {
  const [c, setC] = useState(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setC(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return c;
}

export const axisMoney = (v: number) => (v === 0 ? '0' : formatINRShort(v).replace('₹', ''));

export function ChartTooltip({ active, payload, label, rows }: {
  active?: boolean; payload?: { value: number; name: string; color: string; dataKey: string; payload: Record<string, unknown> }[]; label?: string;
  rows?: (p: Record<string, unknown>) => { name: string; value: number; color?: string }[];
}): ReactNode {
  if (!active || !payload?.length) return null;
  const items = rows ? rows(payload[0].payload) : payload.map((p) => ({ name: p.name, value: p.value, color: p.color }));
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lift">
      <p className="mb-1 font-medium">{label}</p>
      {items.filter((i) => i.value != null).map((i) => (
        <div key={i.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted">{i.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: i.color }} />}{i.name}</span>
          <span className="num font-medium">{formatINR(i.value)}</span>
        </div>
      ))}
    </div>
  );
}
