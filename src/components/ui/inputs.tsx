import { forwardRef, useEffect, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/cn';
import { groupIndian } from '@/lib/finance/format';

const base = 'w-full rounded-xl border border-border bg-surface px-3 text-[15px] text-fg placeholder:text-muted/70 transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-60';

export function Field({ label, hint, error, children, className, htmlFor }: { label?: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && <label htmlFor={htmlFor} className="block text-sm font-medium">{label}</label>}
      {children}
      {error ? <p className="text-xs text-loss">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(base, 'h-11', className)} {...props} />
));
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(base, 'min-h-[80px] py-2.5', className)} {...props} />
));
Textarea.displayName = 'Textarea';

/** Rupee input with live Indian comma formatting. Value is a plain number. */
export function MoneyInput({ value, onChange, id, placeholder = '0', className, autoFocus, ariaLabel, allowDecimals = false, prefix = '₹' }: {
  value: number | undefined; onChange: (n: number) => void; id?: string; placeholder?: string; className?: string; autoFocus?: boolean; ariaLabel?: string; allowDecimals?: boolean; prefix?: string;
}) {
  const fmt = (n: number | undefined) => (n == null || Number.isNaN(n) || n === 0 ? '' : allowDecimals && n % 1 ? `${groupIndian(Math.trunc(n))}.${String(n).split('.')[1]}` : groupIndian(n));
  const [text, setText] = useState(fmt(value));
  useEffect(() => {
    const parsed = parseFloat(text.replace(/,/g, '')) || 0;
    if (parsed !== (value ?? 0)) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className={cn('relative', className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">{prefix}</span>
      <input
        id={id}
        inputMode={allowDecimals ? 'decimal' : 'numeric'}
        autoComplete="off"
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        className={cn(base, 'num h-11 pl-7')}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          const raw = e.target.value.replace(allowDecimals ? /[^0-9.]/g : /[^0-9]/g, '');
          const [int, dec] = raw.split('.');
          const n = parseFloat(raw) || 0;
          setText(int ? groupIndian(parseInt(int, 10)) + (allowDecimals && dec != null ? `.${dec.slice(0, 2)}` : '') : '');
          onChange(n);
        }}
      />
    </div>
  );
}

/** Small numeric input with a suffix such as % or g */
export function NumberInput({ value, onChange, suffix, min, max, step = 0.1, id, className, ariaLabel, placeholder, allowEmpty }: {
  /** with allowEmpty, an empty field reports NaN instead of 0 */
  allowEmpty?: boolean;
  value: number | undefined; onChange: (n: number) => void; suffix?: string; min?: number; max?: number; step?: number; id?: string; className?: string; ariaLabel?: string; placeholder?: string;
}) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => {
    // follow outside changes, but don't force "0" into a field the user just cleared
    const shown = text === '' ? undefined : parseFloat(text);
    const v = value == null || Number.isNaN(value) ? undefined : value;
    if (shown !== v && !(shown === undefined && v === 0)) setText(v == null ? '' : String(v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className={cn('relative', className)}>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        className={cn(base, 'num h-11', suffix && 'pr-9')}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          let n = parseFloat(e.target.value);
          if (Number.isNaN(n)) { onChange(allowEmpty ? NaN : 0); return; }
          if (max != null) n = Math.min(max, n);
          if (min != null) n = Math.max(min, n);
          onChange(n);
        }}
      />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">{suffix}</span>}
    </div>
  );
}

export function Switch({ checked, onCheckedChange, label, id, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; label?: string; id?: string; disabled?: boolean }) {
  const autoId = useId();
  return (
    <SwitchPrimitive.Root
      id={id ?? autoId}
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
      className="relative h-6 w-10 shrink-0 cursor-pointer rounded-full bg-border transition-colors data-[state=checked]:bg-accent disabled:opacity-50"
    >
      <SwitchPrimitive.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform duration-200 data-[state=checked]:translate-x-[18px]" />
    </SwitchPrimitive.Root>
  );
}

export function Slider({ value, onChange, min = 0, max = 100, step = 1, label }: { value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; label?: string }) {
  return (
    <SliderPrimitive.Root className="relative flex h-6 w-full touch-none select-none items-center" value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} aria-label={label}>
      <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-subtle">
        <SliderPrimitive.Range className="absolute h-full bg-accent" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb aria-label={label} className="block h-5 w-5 rounded-full border-2 border-accent bg-surface shadow transition-transform hover:scale-110" />
    </SliderPrimitive.Root>
  );
}

/** Pill-style segmented control */
export function Segmented<T extends string>({ value, onChange, options, className, size = 'md', ariaLabel }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string; size?: 'sm' | 'md'; ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn('inline-flex rounded-xl bg-subtle p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 whitespace-nowrap rounded-lg font-medium transition-all duration-200',
            size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
            value === o.value ? 'bg-surface text-fg shadow-soft' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
