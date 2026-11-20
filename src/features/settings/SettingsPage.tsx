import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Eye, EyeOff, Cloud, Database, Download, FileSpreadsheet, FileText, KeyRound, Moon, Palette, RefreshCw, Sparkles, Sun, Trash2, Upload, User, Wallet, CalendarClock, Info, Monitor } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, MoneyInput, Segmented, Slider, Switch } from '@/components/ui/inputs';
import { Picker } from '@/components/ui/picker';
import { DatePicker } from '@/components/ui/datepicker';
import { LabelTip } from '@/components/ui/infotip';
import { CategoriesCard } from './CategoriesCard';
import { TypesCard } from './TypesCard';
import { Money, PageHeader } from '@/components/ui/misc';
import { toast } from '@/components/ui/toast';
import { useStore, pick } from '@/store/useStore';
import { useDerived } from '@/store/useDerived';
import type { EmploymentStatus, Profile } from '@/lib/types';
import { EMPLOYMENT_LABEL, WEEKDAYS } from '@/lib/labels';
import { avgIncome, monthlySurplus } from '@/lib/finance/goals';
import { formatINR } from '@/lib/finance/format';
import { fmtDate, todayISO } from '@/lib/finance/dates';
import { downloadFile, parseBackup, toBackup, type ParsedBackup } from '@/lib/db/backup';
import { verifyToken } from '@/lib/sync/gist';
import { buildDemo } from '@/lib/demo';
import { historyCSV } from '@/lib/export/csv';
import { APP_NAME, SCHEMA_VERSION } from '@/config';
import { ordinal } from '../onboarding/Onboarding';
import { cn } from '@/lib/cn';

export function SettingsPage() {
  const profile = useStore((s) => s.profile)!;
  const saveProfile = useStore((s) => s.saveProfile);
  const [p, setP] = useState<Profile>(profile);
  const prev = useRef(profile);
  useEffect(() => {
    // take changes saved elsewhere, but keep fields the user is still editing here.
    // `before` is captured now: the updater runs later, after prev.current has moved on.
    const before = prev.current;
    prev.current = profile;
    setP((cur) => {
      const next = { ...profile } as Record<string, unknown>;
      for (const k of Object.keys(cur) as (keyof Profile)[]) {
        if (JSON.stringify(cur[k]) !== JSON.stringify(before[k])) next[k] = cur[k];
      }
      return next as unknown as Profile;
    });
  }, [profile]);
  const dirty = JSON.stringify(p) !== JSON.stringify(profile);
  const set = (patch: Partial<Profile>) => setP((cur) => ({ ...cur, ...patch }));
  const range = p.employmentStatus === 'self_employed' || p.employmentStatus === 'business';
  const surplus = monthlySurplus(p);

  useEffect(() => {
    if (window.location.hash.includes('#data')) document.getElementById('data')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Settings" />

      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><User className="h-4 w-4 text-muted" /> Profile & income</span>} subtitle="Change it whenever life changes." />
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><Input value={p.name ?? ''} onChange={(e) => set({ name: e.target.value || undefined })} /></Field>
            <Field label="Birthday" hint="Optional"><DatePicker value={p.dateOfBirth} onChange={(v) => set({ dateOfBirth: v })} max={todayISO()} placeholder="Add birthday" ariaLabel="Birthday" /></Field>
          </div>
          <Field label="Employment">
            <Picker value={p.employmentStatus} onChange={(v) => set({ employmentStatus: v as EmploymentStatus })} ariaLabel="Employment" options={Object.entries(EMPLOYMENT_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
          </Field>
          {range ? (
            <Field label="Monthly income range" hint={`We use the average: ${formatINR(avgIncome(p))}`}>
              <div className="grid grid-cols-2 gap-3">
                <MoneyInput value={p.incomeMin} onChange={(n) => set({ incomeMin: n })} ariaLabel="Low month" />
                <MoneyInput value={p.incomeMax} onChange={(n) => set({ incomeMax: n })} ariaLabel="Good month" />
              </div>
            </Field>
          ) : (
            <Field label="Monthly take-home income"><MoneyInput value={p.incomeMin} onChange={(n) => set({ incomeMin: n, incomeMax: n })} /></Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Other money coming in / month"><MoneyInput value={p.otherIncome} onChange={(n) => set({ otherIncome: n })} /></Field>
            <Field label="Average monthly spending"><MoneyInput value={p.avgMonthlySpending} onChange={(n) => set({ avgMonthlySpending: n })} /></Field>
          </div>
          <div className="rounded-2xl bg-subtle p-4">
            <div className="flex items-center justify-between text-sm"><span className="text-muted">Monthly surplus</span><span className={cn('font-semibold num', surplus < 0 && 'text-loss')}>{formatINR(surplus)}</span></div>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-sm"><span className="font-medium"><LabelTip term="capacity">You can save each month</LabelTip></span><span className="font-semibold num">{formatINR(p.monthlySavingCapacity)}</span></div>
              {surplus > 0 && <Slider value={Math.min(p.monthlySavingCapacity, surplus)} max={surplus} step={500} onChange={(n) => set({ monthlySavingCapacity: n })} label="Saving capacity" />}
              <div className="flex flex-wrap items-center gap-2">
                <MoneyInput className="w-40" value={p.monthlySavingCapacity} onChange={(n) => set({ monthlySavingCapacity: Math.max(0, n) })} ariaLabel="Saving capacity" />
                {surplus > 0 && <Button size="sm" variant="ghost" onClick={() => set({ monthlySavingCapacity: Math.round((surplus * 0.7) / 500) * 500 })}>Use 70% of surplus</Button>}
              </div>
              {surplus <= 0 && <p className="text-xs text-muted">You're spending more than you earn right now. That's normal between jobs, and capacity can stay at 0. Goals will show what you'd need once income starts.</p>}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-muted" /> Check-ins & valuations</span>} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Check-in frequency"><Segmented className="w-full" value={p.checkInFrequency} onChange={(v) => set({ checkInFrequency: v, checkInDay: v === 'weekly' ? 0 : 1 })} options={[{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} /></Field>
          <Field label={p.checkInFrequency === 'weekly' ? 'Week starts on' : 'Check-in day'}>
            <Picker value={String(p.checkInDay)} onChange={(v) => set({ checkInDay: +v })} ariaLabel="Check-in day"
              options={p.checkInFrequency === 'weekly' ? WEEKDAYS.map((d, i) => ({ value: String(i), label: d })) : Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: `${ordinal(i + 1)} of the month` }))} />
          </Field>
          <Field label={<LabelTip term="valuation">Ask for investment values</LabelTip>} className="sm:col-span-2"><Segmented className="w-full" value={p.valuationFrequency} onChange={(v) => set({ valuationFrequency: v })} options={[{ value: 'weekly', label: 'Weekly' }, { value: 'fortnightly', label: 'Fortnightly' }, { value: 'monthly', label: 'Monthly' }]} /></Field>
        </div>
      </Card>

      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><Palette className="h-4 w-4 text-muted" /> Display</span>} />
        <div className="space-y-4">
          <Field label="Theme">
            <Segmented className="w-full" value={p.theme} onChange={(v) => { set({ theme: v }); void saveProfile({ ...profile, theme: v }); }} options={[{ value: 'light', label: <span className="flex items-center justify-center gap-1.5"><Sun className="h-3.5 w-3.5" />Light</span> }, { value: 'dark', label: <span className="flex items-center justify-center gap-1.5"><Moon className="h-3.5 w-3.5" />Dark</span> }, { value: 'system', label: <span className="flex items-center justify-center gap-1.5"><Monitor className="h-3.5 w-3.5" />System</span> }]} />
          </Field>
          <div className="flex items-center justify-between gap-4">
            <div><p className="text-sm font-medium">Short numbers</p><p className="text-xs text-muted">Show ₹1.23 Cr and ₹4.5 L instead of ₹1,23,45,678</p></div>
            <Switch label="Short numbers" checked={p.shortNumbers} onCheckedChange={(v) => { set({ shortNumbers: v }); void saveProfile({ ...profile, shortNumbers: v }); }} />
          </div>
        </div>
      </Card>

      <TypesCard />

      {dirty && (
        <div className="sticky bottom-[calc(6rem_+_env(safe-area-inset-bottom))] z-20 flex items-center justify-between gap-3 rounded-3xl border border-border bg-surface py-3.5 pl-6 pr-3.5 shadow-lift lg:bottom-6">
          <span className="pl-2 text-sm">You have unsaved changes</span>
          <div className="flex gap-2"><Button variant="ghost" onClick={() => setP(profile)}>Discard</Button><Button onClick={async () => { await saveProfile(p); toast('Settings saved'); }}>Save</Button></div>
        </div>
      )}

      <CategoriesCard />
      <SyncCard />
      <DataCard />

      <Card>
        <CardHeader title={<span className="flex items-center gap-2"><Info className="h-4 w-4 text-muted" /> About</span>} />
        <div className="space-y-2 text-sm text-muted">
          <p><b className="text-fg">{APP_NAME}</b> helps you plan, save and track money goals. It runs fully in your browser and works offline. Your data never leaves this device unless you turn on GitHub sync or export it yourself.</p>
          <p>Data format version {SCHEMA_VERSION}. Projections use expected returns, which are assumptions, not guarantees. This isn't financial advice.</p>
        </div>
      </Card>
    </div>
  );
}

/** Lets the user copy their sync key to set up another device. */
function SyncKey({ token }: { token: string }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const masked = `${token.slice(0, 4)}${'•'.repeat(12)}${token.slice(-4)}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token);
    } catch {
      // fallback for browsers without clipboard permission
      const el = document.createElement('textarea');
      el.value = token; document.body.appendChild(el); el.select(); document.execCommand('copy'); el.remove();
    }
    setCopied(true);
    toast('Sync key copied. Paste it in LockdIn on your other device.');
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="rounded-2xl border border-border p-4">
      <p className="text-sm font-medium">Use on your other device</p>
      <p className="mt-0.5 text-xs text-muted">Copy this key, open LockdIn on the other device, go to Settings → Sync across devices and paste it. Keep it private, like a password.</p>
      <div className="mt-3 flex items-center gap-2">
        <code className="num min-w-0 flex-1 truncate rounded-xl bg-subtle px-3 py-2.5 text-sm">{show ? token : masked}</code>
        <Button size="sm" variant="ghost" className="h-10" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide sync key' : 'Show sync key'}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
        <Button size="sm" className="h-10" onClick={() => void copy()}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy'}</Button>
      </div>
    </div>
  );
}

function SyncCard() {
  const meta = useStore((s) => s.meta);
  const sync = useStore((s) => s.sync);
  const patchMeta = useStore((s) => s.patchMeta);
  const syncNow = useStore((s) => s.syncNow);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const connected = !!meta.gist.token;

  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><Cloud className="h-4 w-4 text-muted" /> Sync across devices</span>} subtitle="Keep your phone and laptop in step through a private GitHub Gist that only you can see." />
      {connected ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-subtle p-4 text-sm">
            <div>
              <p className="font-medium">Connected{meta.gist.gistId ? ' · private gist' : ''}</p>
              <p className="text-xs text-muted">{sync.status === 'error' ? <span className="text-loss">{sync.error}</span> : meta.gist.lastSyncedAt ? `Last synced ${fmtDate(meta.gist.lastSyncedAt.slice(0, 10))} at ${new Date(meta.gist.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Not synced yet'}</p>
            </div>
            <Button size="sm" variant="outline" disabled={sync.status === 'syncing'} onClick={() => void syncNow()}><RefreshCw className={cn('h-3.5 w-3.5', sync.status === 'syncing' && 'animate-spin')} /> Sync now</Button>
          </div>
          <SyncKey token={meta.gist.token!} />
          <div className="flex items-center justify-between gap-4">
            <div><p className="text-sm font-medium">Sync automatically</p><p className="text-xs text-muted">When the app opens and a few seconds after each change</p></div>
            <Switch label="Auto sync" checked={meta.gist.autoSync} onCheckedChange={(v) => void patchMeta({ gist: { ...meta.gist, autoSync: v } })} />
          </div>
          <Button variant="ghost" className="text-loss" onClick={async () => { await patchMeta({ gist: { autoSync: true } }); useStore.setState({ sync: { status: 'off' } }); toast('Disconnected. Your gist on GitHub was not deleted.'); }}>Disconnect</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>On GitHub, open <b className="text-fg">Settings → Developer settings → Personal access tokens</b>.</li>
            <li>Create a token with only the <b className="text-fg">gist</b> permission (fine-grained: Account permissions → Gists → Read and write).</li>
            <li>Paste it below.</li>
          </ol>
          <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm">Already set up on another device? Copy the sync key there (Settings → Sync across devices → Copy) and paste it here.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input type="password" autoComplete="off" placeholder="Paste your GitHub token or sync key" value={token} onChange={(e) => setToken(e.target.value.trim())} aria-label="GitHub token" />
            <Button disabled={!token || busy} onClick={async () => {
              setBusy(true);
              try {
                const login = await verifyToken(token);
                await patchMeta({ gist: { token, autoSync: true } });
                await syncNow();
                toast(`Connected as ${login}`);
                setToken('');
              } catch (e) {
                toast(e instanceof Error ? e.message : 'Could not connect', { tone: 'error' });
              } finally { setBusy(false); }
            }}><KeyRound className="h-4 w-4" /> {busy ? 'Connecting…' : 'Connect'}</Button>
          </div>
          <p className="text-xs text-muted">The token is stored only in this browser and is never included in backups. Data is sent only to api.github.com.</p>
        </div>
      )}
    </Card>
  );
}

function DataCard() {
  const store = useStore();
  const d = useDerived();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ParsedBackup | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const stamp = new Date().toISOString().slice(0, 10);
  const demo = store.meta.demo;

  const exportJSON = async () => {
    downloadFile(`lockdin-backup-${stamp}.json`, JSON.stringify(toBackup(pick(store)), null, 2), 'application/json');
    await store.patchProfile({ lastBackupAt: new Date().toISOString() });
    toast('Backup downloaded');
  };
  const exportReport = async (kind: 'pdf' | 'xlsx') => {
    setBusy(kind);
    try {
      const mod = await import('@/lib/export/report');
      const input = { data: pick(store), metrics: d.metrics, snap: d.snap, today: d.today };
      if (kind === 'pdf') mod.buildPdf(input).save(`lockdin-report-${stamp}.pdf`);
      else downloadFile(`lockdin-data-${stamp}.xlsx`, await mod.buildExcel(input), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      toast(kind === 'pdf' ? 'PDF report downloaded' : 'Excel file downloaded');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Export failed', { tone: 'error' });
    } finally { setBusy(null); }
  };

  const loadDemo = async () => {
    const demoData = buildDemo();
    await store.commit({ put: demoData });
    await store.patchMeta({
      demo: {
        goals: demoData.goals.map((x) => x.id), holdings: demoData.holdings.map((x) => x.id), transactions: demoData.transactions.map((x) => x.id),
        valuations: demoData.valuations.map((x) => x.id), checkIns: demoData.checkIns.map((x) => x.id),
      },
      lastValuationAt: new Date().toISOString().slice(0, 10),
    });
    toast('Demo data loaded: 3 goals, 5 holdings, 12 months of check-ins');
  };
  const clearDemo = async () => {
    if (!demo) return;
    await store.commit({ del: demo });
    await store.patchMeta({ demo: undefined });
    toast('Demo data cleared');
  };

  return (
    <Card id="data">
      <CardHeader title={<span className="flex items-center gap-2"><Database className="h-4 w-4 text-muted" /> Your data</span>} subtitle={`Everything is stored in this browser.${store.profile?.lastBackupAt ? ` Last backup ${fmtDate(store.profile.lastBackupAt.slice(0, 10))}.` : ' No backup yet.'}`} />
      <div className="grid gap-3 sm:grid-cols-2">
        <ActionTile icon={<Download className="h-4 w-4" />} title="Download backup" desc="One JSON file with everything" onClick={() => void exportJSON()} />
        <ActionTile icon={<Upload className="h-4 w-4" />} title="Import backup" desc="Restore from a backup file" onClick={() => fileRef.current?.click()} />
        <ActionTile icon={<FileText className="h-4 w-4" />} title={busy === 'pdf' ? 'Building PDF…' : 'PDF report'} desc="Charts, goals and every entry so far" onClick={() => void exportReport('pdf')} />
        <ActionTile icon={<FileSpreadsheet className="h-4 w-4" />} title={busy === 'xlsx' ? 'Building Excel…' : 'Excel workbook'} desc="Goals, holdings, transactions, check-ins" onClick={() => void exportReport('xlsx')} />
        <ActionTile icon={<Wallet className="h-4 w-4" />} title="History as CSV" desc="A single table of all entries" onClick={() => downloadFile(`lockdin-history-${stamp}.csv`, historyCSV(pick(store)), 'text/csv;charset=utf-8')} />
        {demo ? <ActionTile icon={<Sparkles className="h-4 w-4" />} title="Clear demo data" desc="Removes only the demo records" onClick={() => void clearDemo()} />
          : <ActionTile icon={<Sparkles className="h-4 w-4" />} title="Load demo data" desc="See every screen filled in. Clear it any time." onClick={() => void loadDemo()} />}
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        try { setPreview(parseBackup(await f.text())); } catch (err) { toast(err instanceof Error ? err.message : 'Invalid file', { tone: 'error' }); }
      }} />
      <div className="mt-6 border-t border-border pt-4">
        <Button variant="ghost" className="text-loss" onClick={() => setResetOpen(true)}><Trash2 className="h-4 w-4" /> Reset all data</Button>
      </div>

      <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)} title="Replace your data with this backup?" size="sm"
        description={preview?.exportedAt ? `Backup from ${fmtDate(preview.exportedAt.slice(0, 10))}.` : undefined}
        footer={<><Button variant="outline" onClick={() => setPreview(null)}>Cancel</Button><Button variant="danger" onClick={async () => { if (!preview) return; await store.replaceAll(preview.data); setPreview(null); toast('Backup restored'); }}>Replace my data</Button></>}
      >
        {preview && (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="py-1 font-medium" /><th className="py-1 text-right font-medium">Now</th><th className="py-1 text-right font-medium">From file</th></tr></thead>
            <tbody>
              {([['Goals', store.goals.length, preview.counts.goals], ['Holdings', store.holdings.length, preview.counts.holdings], ['Transactions', store.transactions.length, preview.counts.transactions], ['Valuations', store.valuations.length, preview.counts.valuations], ['Check-ins', store.checkIns.length, preview.counts.checkIns]] as const).map(([k, a, b]) => (
                <tr key={k} className="border-t border-border/60"><td className="py-2">{k}</td><td className="py-2 text-right num text-muted">{a}</td><td className="py-2 text-right num font-medium">{b}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-muted">Everything currently on this device will be replaced. Download a backup first if you're unsure.</p>
      </Dialog>

      <Dialog open={resetOpen} onOpenChange={(v) => { setResetOpen(v); setConfirmText(''); }} title="Reset all data?" size="sm"
        description="This permanently deletes all goals, holdings, check-ins and settings on this device. It can't be undone."
        footer={<><Button variant="outline" onClick={() => setResetOpen(false)}>Cancel</Button><Button variant="danger" disabled={confirmText !== 'DELETE'} onClick={async () => { await store.resetAll(); toast('All data deleted'); }}>Delete everything</Button></>}
      >
        <Field label='Type "DELETE" to confirm'><Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoFocus /></Field>
        <p className="mt-3 text-xs text-muted">Current value on this device: <Money value={d.snap.totalValue} short={false} /></p>
      </Dialog>
    </Card>
  );
}

function ActionTile({ icon, title, desc, onClick }: { icon: React.ReactNode; title: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-start gap-3 rounded-2xl border border-border p-4 text-left transition-colors hover:bg-subtle">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">{icon}</span>
      <span><span className="block text-sm font-medium">{title}</span><span className="block text-xs text-muted">{desc}</span></span>
    </button>
  );
}
