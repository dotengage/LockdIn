import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { History, Home, Landmark, MessageCircle, Plus, Settings, Target, Cloud, CloudOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { APP_NAME } from '@/config';
import { useUI } from '@/store/useUI';
import { useStore } from '@/store/useStore';
import { Button } from '../ui/button';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

const NAV = [
  { to: '/', label: 'Dashboard', icon: Home, end: true },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/holdings', label: 'Holdings', icon: Landmark },
  { to: '/history', label: 'History', icon: History },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function SyncBadge() {
  const sync = useStore((s) => s.sync);
  const syncNow = useStore((s) => s.syncNow);
  if (sync.status === 'off') return null;
  const map = {
    idle: { icon: Cloud, text: 'Sync ready', cls: 'text-muted' },
    syncing: { icon: RefreshCw, text: 'Syncing…', cls: 'text-muted' },
    ok: { icon: Cloud, text: 'Synced', cls: 'text-muted' },
    error: { icon: CloudOff, text: 'Sync failed', cls: 'text-loss' },
    conflict: { icon: AlertTriangle, text: 'Sync conflict', cls: 'text-warn' },
  } as const;
  const s = map[sync.status];
  const Icon = s.icon;
  return (
    <button onClick={() => void syncNow()} title={sync.error ?? s.text} className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-xs hover:bg-subtle', s.cls)}>
      <Icon className={cn('h-3.5 w-3.5', sync.status === 'syncing' && 'animate-spin')} />
      {s.text}
    </button>
  );
}

export function AppShell() {
  const openCheckIn = useUI((s) => s.openCheckIn);
  const setChatOpen = useUI((s) => s.setChatOpen);
  const location = useLocation();

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-surface/50 px-4 py-6 backdrop-blur-xl lg:flex">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <Logo className="h-8 w-8 rounded-[9px] shadow-soft" />
          <span className="text-[17px] font-semibold tracking-tight">{APP_NAME}</span>
        </div>
        <Button className="mb-5" onClick={() => openCheckIn()}><Plus className="h-4 w-4" /> Check in</Button>
        <nav className="flex flex-col gap-0.5" aria-label="Main">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => cn(
                'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-subtle text-fg [&>svg]:text-accent' : 'text-muted hover:bg-subtle/60 hover:text-fg',
              )}
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <button onClick={() => setChatOpen(true)} className="mt-5 flex items-center gap-3 rounded-xl bg-subtle/70 px-3 py-2.5 text-left text-sm text-muted transition-colors hover:text-fg">
          <MessageCircle className="h-4 w-4 text-accent" />
          <span>Ask or log anything</span>
          <kbd className="ml-auto rounded-md border border-border px-1.5 text-[10px]">/</kbd>
        </button>
        <div className="mt-auto flex items-center justify-between"><SyncBadge /><ThemeToggle className="ml-auto" /></div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/60 bg-bg/75 px-4 py-2.5 backdrop-blur-xl safe-top lg:hidden">
        <div className="flex items-center gap-2">
          <Logo className="h-7 w-7 rounded-[8px]" />
          <span className="font-semibold tracking-tight">{APP_NAME}</span>
        </div>
        <div className="flex items-center gap-1">
          <SyncBadge />
          <ThemeToggle />
          <button onClick={() => setChatOpen(true)} aria-label="Ask or log anything" className="flex h-9 w-9 items-center justify-center rounded-xl text-accent hover:bg-subtle">
            <MessageCircle className="h-[18px] w-[18px]" />
          </button>
        </div>
      </header>

      <main className="min-w-0 flex-1 pb-[calc(7rem_+_env(safe-area-inset-bottom))] lg:pb-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile FAB (hidden on the planner, which has its own bottom summary) */}
      {!location.search.includes('tab=plan') && <button
        onClick={() => openCheckIn()}
        className="fixed bottom-[calc(84px_+_env(safe-area-inset-bottom))] right-4 z-40 flex h-14 items-center gap-2 rounded-full bg-fg px-5 font-medium text-bg shadow-lift transition-transform active:scale-95 lg:hidden"
        aria-label="Check in"
      >
        <Plus className="h-5 w-5" /> Check in
      </button>}

      {/* Mobile bottom nav */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-surface/80 backdrop-blur-xl safe-bottom lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => cn('flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors', isActive ? 'text-accent' : 'text-muted')}
            >
              <n.icon className="h-5 w-5" />
              {n.label === 'Dashboard' ? 'Home' : n.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
