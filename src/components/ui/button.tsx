import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-fg text-bg hover:opacity-90 shadow-soft',
  accent: 'bg-accent text-accent-fg hover:opacity-90 shadow-soft',
  secondary: 'bg-subtle text-fg hover:bg-border/70',
  outline: 'border border-border bg-surface text-fg hover:bg-subtle',
  ghost: 'text-fg hover:bg-subtle',
  danger: 'bg-loss text-white hover:opacity-90',
};
const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2 rounded-2xl',
  icon: 'h-10 w-10 rounded-xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; size?: Size }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = 'primary', size = 'md', type = 'button', ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    className={cn(
      'inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition-[opacity,background-color,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
      VARIANT[variant], SIZE[size], className,
    )}
    {...props}
  />
));
Button.displayName = 'Button';
