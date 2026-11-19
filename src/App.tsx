import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { useStore } from './store/useStore';
import { useUI } from './store/useUI';
import { AppShell } from './components/layout/AppShell';
import { Toaster } from './components/ui/toast';
import { Skeleton } from './components/ui/misc';
import { useTheme } from './lib/useTheme';
import { Dashboard } from './features/dashboard/Dashboard';
import { Onboarding } from './features/onboarding/Onboarding';
import { GoalsPage } from './features/goals/GoalsPage';
import { GoalDetail } from './features/goals/GoalDetail';
import { NewGoalPage } from './features/goals/NewGoalPage';
import { HoldingsPage } from './features/holdings/HoldingsPage';
import { HoldingDetail } from './features/holdings/HoldingDetail';
import { HistoryPage } from './features/history/HistoryPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { CheckInDialog } from './features/checkin/CheckInDialog';
import { ValuationDialog } from './features/valuation/ValuationDialog';
import { SyncConflictDialog } from './features/settings/SyncConflictDialog';

const ChatPanel = lazy(() => import('./features/chat/ChatPanel'));

function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-10 sm:px-6 lg:px-10">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="h-80" />
    </div>
  );
}

export function App() {
  const loaded = useStore((s) => s.loaded);
  const onboarded = useStore((s) => !!s.profile?.onboarded);
  const init = useStore((s) => s.init);
  const chatOpen = useUI((s) => s.chatOpen);
  useTheme();

  useEffect(() => { void init(); }, [init]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        useUI.getState().setChatOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!loaded) return <Loading />;

  return (
    <MotionConfig reducedMotion="user">
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        {!onboarded ? (
          <Routes><Route path="*" element={<Onboarding />} /></Routes>
        ) : (
          <>
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<Dashboard />} />
                <Route path="goals" element={<GoalsPage />} />
                <Route path="goals/new" element={<NewGoalPage />} />
                <Route path="goals/:id" element={<GoalDetail />} />
                <Route path="holdings" element={<HoldingsPage />} />
                <Route path="holdings/:id" element={<HoldingDetail />} />
                <Route path="history" element={<HistoryPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
            <CheckInDialog />
            <ValuationDialog />
            <SyncConflictDialog />
            {chatOpen && <Suspense fallback={null}><ChatPanel /></Suspense>}
          </>
        )}
        <Toaster />
      </HashRouter>
    </MotionConfig>
  );
}
