import { useEffect } from 'react';
import { useStore } from '@/store/useStore';

const stored = (): 'light' | 'dark' | 'system' => {
  try { const t = localStorage.getItem('lockdin-theme'); return t === 'dark' || t === 'system' ? t : 'light'; } catch { return 'light'; }
};

/** Applies light/dark/system theme to <html> and remembers it for the pre-paint script in index.html. */
export function useTheme() {
  const profileTheme = useStore((s) => s.profile?.theme);
  useEffect(() => {
    const theme = profileTheme ?? stored();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#080809' : '#f5f5f7');
    };
    apply();
    if (profileTheme) { try { localStorage.setItem('lockdin-theme', profileTheme); } catch { /* storage unavailable */ } }
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [profileTheme]);
}
