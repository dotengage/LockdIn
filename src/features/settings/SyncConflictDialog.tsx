import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useStore } from '@/store/useStore';

export function SyncConflictDialog() {
  const sync = useStore((s) => s.sync);
  const syncNow = useStore((s) => s.syncNow);
  const local = { goals: useStore((s) => s.goals.length), tx: useStore((s) => s.transactions.length) };
  if (sync.status !== 'conflict' || !sync.remote) return null;
  const r = sync.remote;
  return (
    <Dialog open onOpenChange={() => useStore.setState({ sync: { status: 'idle' } })} title="Changes on two devices" size="sm"
      description="This device and your cloud copy both changed since the last sync. Which one should we keep? The other will be replaced."
      footer={<>
        <Button variant="outline" onClick={() => void syncNow({ resolve: 'remote' })}>Use cloud copy</Button>
        <Button onClick={() => void syncNow({ resolve: 'local' })}>Keep this device</Button>
      </>}
    >
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-subtle p-4"><p className="font-medium">This device</p><p className="mt-1 text-muted">{local.goals} goals · {local.tx} transactions</p></div>
        <div className="rounded-2xl bg-subtle p-4"><p className="font-medium">Cloud</p><p className="mt-1 text-muted">{r.goals.length} goals · {r.transactions.length} transactions</p></div>
      </div>
    </Dialog>
  );
}
