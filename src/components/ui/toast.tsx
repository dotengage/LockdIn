import { create } from 'zustand';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';
import { useEffect } from 'react';

interface Toast { id: number; message: string; tone: 'success' | 'error' | 'info'; undo?: () => void | Promise<void>; duration: number }

interface ToastState {
  toasts: Toast[];
  push(t: Omit<Toast, 'id' | 'duration' | 'tone'> & { tone?: Toast['tone']; duration?: number }): void;
  dismiss(id: number): void;
}

let counter = 0;
export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => set((s) => ({ toasts: [...s.toasts.slice(-2), { id: ++counter, tone: 'success', duration: t.undo ? 5000 : 3000, ...t }] })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = (message: string, opts: { undo?: () => void | Promise<void>; tone?: Toast['tone'] } = {}) => useToasts.getState().push({ message, ...opts });

function ToastItem({ t }: { t: Toast }) {
  const dismiss = useToasts((s) => s.dismiss);
  useEffect(() => {
    const id = setTimeout(() => dismiss(t.id), t.duration);
    return () => clearTimeout(id);
  }, [t, dismiss]);
  const Icon = t.tone === 'error' ? AlertCircle : CheckCircle2;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ duration: 0.18 }}
      role="status"
      className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-border bg-fg px-4 py-3 text-sm text-bg shadow-lift"
    >
      <Icon className={t.tone === 'error' ? 'h-4 w-4 shrink-0 text-red-400' : 'h-4 w-4 shrink-0 text-emerald-400'} />
      <span className="min-w-0 flex-1">{t.message}</span>
      {t.undo && (
        <button className="rounded-lg px-2 py-1 font-semibold text-accent hover:bg-white/10 dark:hover:bg-black/10" onClick={() => { void t.undo?.(); dismiss(t.id); }}>
          Undo
        </button>
      )}
      <button aria-label="Dismiss" className="opacity-60 hover:opacity-100" onClick={() => dismiss(t.id)}><X className="h-4 w-4" /></button>
    </motion.div>
  );
}

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(6rem_+_env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:pr-6">
      <AnimatePresence>{toasts.map((t) => <ToastItem key={t.id} t={t} />)}</AnimatePresence>
    </div>
  );
}
