import { Moon, Sun } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/cn';

/** One-tap light/dark switch (Settings also offers "System"). */
export function ThemeToggle({ className }: { className?: string }) {
  const profile = useStore((s) => s.profile);
  const patchProfile = useStore((s) => s.patchProfile);
  return (
    <button
      type="button"
      onClick={() => {
        const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
        if (profile) { void patchProfile({ theme: next }); return; }
        // before onboarding there is no profile yet: switch directly and remember it
        document.documentElement.classList.toggle('dark', next === 'dark');
        try { localStorage.setItem('lockdin-theme', next); } catch { /* storage unavailable */ }
      }}
      aria-label="Switch between light and dark mode"
      title="Light / dark"
      className={cn('relative flex h-9 w-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-subtle hover:text-fg', className)}
      data-theme={profile?.theme}
    >
      <Sun className="h-[18px] w-[18px] rotate-0 scale-100 transition-all duration-300 dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[18px] w-[18px] rotate-90 scale-0 transition-all duration-300 dark:rotate-0 dark:scale-100" />
    </button>
  );
}
