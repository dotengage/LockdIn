import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, animate, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, LineChart, Lock, Target } from 'lucide-react';
import type { EmploymentStatus, HoldingTypeId, Profile } from '@/lib/types';
import { APP_NAME } from '@/config';
import { Button } from '@/components/ui/button';
import { MoneyInput, Slider } from '@/components/ui/inputs';
import { Picker } from '@/components/ui/picker';
import { Logo } from '@/components/layout/Logo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Confetti } from '@/components/ui/Confetti';
import { useStore } from '@/store/useStore';
import { DEFAULT_RETURNS } from '@/lib/finance/constants';
import { avgIncome } from '@/lib/finance/goals';
import { DEFAULT_CATEGORIES, typeInfo, visibleTypes } from '@/lib/categories';
import { newId, nowStamp } from '@/lib/ids';
import { todayISO } from '@/lib/finance/dates';
import { formatINR, formatINRShort } from '@/lib/finance/format';
import { WEEKDAYS } from '@/lib/labels';
import { cn } from '@/lib/cn';
import { BigMoney } from '../goals/NewGoalPage';

const STATUSES: { value: EmploymentStatus; label: string; icon: string }[] = [
  { value: 'salaried', label: 'I have a job', icon: '💼' },
  { value: 'self_employed', label: 'Freelancer', icon: '🧑‍💻' },
  { value: 'business', label: 'Run a business', icon: '🏪' },
  { value: 'student', label: 'Student', icon: '🎓' },
  { value: 'unemployed', label: 'Between jobs', icon: '🌱' },
  { value: 'other', label: 'Something else', icon: '✨' },
];

type Step = 'welcome' | 'name' | 'status' | 'income' | 'spending' | 'reveal' | 'savings' | 'rhythm' | 'done';
const STEPS: Step[] = ['welcome', 'name', 'status', 'income', 'spending', 'reveal', 'savings', 'rhythm', 'done'];

export function Onboarding() {
  const navigate = useNavigate();
  const saveProfile = useStore((s) => s.saveProfile);
  const commit = useStore((s) => s.commit);
  const [step, setStep] = useState<Step>('welcome');
  const [dir, setDir] = useState(1);

  const [name, setName] = useState('');
  const [status, setStatus] = useState<EmploymentStatus>('salaried');
  const [incomeMin, setIncomeMin] = useState(0);
  const [incomeMax, setIncomeMax] = useState(0);
  const [other, setOther] = useState(0);
  const [spending, setSpending] = useState(0);
  const [capacity, setCapacity] = useState<number | null>(null);
  const [savings, setSavings] = useState(0);
  const [savingsType, setSavingsType] = useState<HoldingTypeId>('bank');
  const [freq, setFreq] = useState<'weekly' | 'monthly'>('monthly');
  const [day, setDay] = useState(1);

  const range = status === 'self_employed' || status === 'business';
  const lowIncome = status === 'student' || status === 'unemployed';
  const income = range ? avgIncome({ incomeMin, incomeMax }) : incomeMin;
  const surplus = income + other - spending;
  const suggested = Math.max(0, Math.round((surplus * 0.7) / 500) * 500);
  const cap = capacity ?? suggested;
  const idx = STEPS.indexOf(step);
  const first = name.trim().split(' ')[0];

  const go = (s: Step) => { setDir(STEPS.indexOf(s) > idx ? 1 : -1); setStep(s); window.scrollTo({ top: 0 }); };
  const next = () => go(STEPS[Math.min(STEPS.length - 1, idx + 1)]);
  const back = () => go(STEPS[Math.max(0, idx - 1)]);

  async function finish(toGoal: boolean) {
    const now = nowStamp();
    const profile: Profile = {
      name: first || undefined, employmentStatus: status,
      incomeMin, incomeMax: range ? Math.max(incomeMin, incomeMax) : incomeMin, otherIncome: other,
      avgMonthlySpending: spending, monthlySavingCapacity: Math.max(0, cap),
      checkInFrequency: freq, valuationFrequency: 'weekly', checkInDay: day, defaultReturns: { ...DEFAULT_RETURNS },
      categories: { ...DEFAULT_CATEGORIES, incomeSources: [...DEFAULT_CATEGORIES.incomeSources], withdrawReasons: [...DEFAULT_CATEGORIES.withdrawReasons] },
      theme: readTheme(), shortNumbers: true, onboarded: true, createdAt: now,
    };
    if (savings > 0) {
      const t = typeInfo(savingsType);
      const holding = { id: newId(), name: t.label, type: savingsType, valuation: t.valuation, interestRate: t.valuation === 'interest' ? t.defaultReturn : undefined, archived: false, createdAt: now };
      await commit({ put: { holdings: [holding], transactions: [{ id: newId(), date: todayISO(), kind: 'contribution', holdingId: holding.id, goalId: null, amount: savings, reason: 'opening', note: 'Savings at start', createdAt: now }] } });
    }
    await saveProfile(profile);
    navigate(toGoal ? '/goals/new' : '/', { replace: true });
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-bg">
      {/* ambient glow */}
      <motion.div aria-hidden className="pointer-events-none absolute -right-40 -top-40 h-[480px] w-[480px] rounded-full bg-accent/20 blur-[120px]" animate={{ scale: [1, 1.12, 1], opacity: [0.6, 0.9, 0.6] }} transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div aria-hidden className="pointer-events-none absolute -bottom-48 -left-40 h-[420px] w-[420px] rounded-full bg-accent/10 blur-[120px]" animate={{ scale: [1.1, 1, 1.1] }} transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }} />

      <div className="relative mx-auto flex w-full max-w-lg flex-1 flex-col px-6 pb-8 pt-6">
        <div className="flex h-10 items-center justify-between">
          {step !== 'welcome' && step !== 'done' ? <button onClick={back} className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-subtle hover:text-fg" aria-label="Back"><ArrowLeft className="h-5 w-5" /></button> : <span />}
          {step !== 'welcome' && step !== 'done' && (
            <div className="h-1 w-32 overflow-hidden rounded-full bg-border" aria-hidden>
              <motion.div className="h-full rounded-full bg-fg" animate={{ width: `${(idx / (STEPS.length - 2)) * 100}%` }} transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }} />
            </div>
          )}
          <ThemeToggle />
        </div>

        <form className="flex flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); if (step !== 'done') next(); }}>
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div key={step} custom={dir}
              initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -12, filter: 'blur(6px)' }}
              transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
              className="flex flex-1 flex-col justify-center py-8"
            >
              {step === 'welcome' && (
                <div className="text-center">
                  <motion.div initial={{ scale: 0.6, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 180, damping: 16, delay: 0.1 }} className="mx-auto w-fit">
                    <Logo className="h-24 w-24 rounded-[26px] shadow-lift" />
                  </motion.div>
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="mt-6 text-sm font-medium uppercase tracking-[0.2em] text-muted">{APP_NAME}</motion.p>
                  <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} className="mt-3 text-[40px] font-semibold leading-[1.05] tracking-tight sm:text-5xl">
                    Your money,<br /><span className="bg-gradient-to-r from-accent to-fg bg-clip-text text-transparent">with a plan.</span>
                  </motion.h1>
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="mx-auto mt-4 max-w-sm text-[15px] text-muted">Set a goal, get one clear number to save each month, and watch it grow.</motion.p>
                  <div className="mx-auto mt-10 grid max-w-sm gap-3 text-left">
                    {[[Target, 'One clear monthly number', 'for every goal'], [LineChart, 'Real progress', 'including how your investments grow'], [Lock, 'Private by design', 'stays on your device']].map(([Icon, t, d], i) => {
                      const I = Icon as typeof Target;
                      return (
                        <motion.div key={t as string} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.75 + i * 0.12 }} className="flex items-center gap-3 rounded-2xl border border-border bg-surface/70 px-4 py-3 backdrop-blur">
                          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent"><I className="h-[18px] w-[18px]" /></span>
                          <span className="text-sm"><span className="font-medium">{t as string}</span> <span className="text-muted">{d as string}</span></span>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 'name' && (
                <Screen title="First things first." sub="What should we call you?">
                  <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Your first name" aria-label="Your first name"
                    className="w-full border-b-2 border-border bg-transparent pb-2 text-4xl font-semibold tracking-tight outline-none transition-colors placeholder:text-border focus:border-accent" />
                </Screen>
              )}

              {step === 'status' && (
                <Screen title={first ? `Nice to meet you, ${first}.` : 'Nice to meet you.'} sub="What best describes you right now?">
                  <div className="grid grid-cols-2 gap-3">
                    {STATUSES.map((s, i) => (
                      <motion.button key={s.value} type="button" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                        onClick={() => setStatus(s.value)}
                        className={cn('flex flex-col items-start gap-3 rounded-3xl border p-4 text-left transition-all', status === s.value ? 'border-fg bg-surface shadow-soft ring-1 ring-fg' : 'border-border bg-surface/70 hover:border-muted')}>
                        <span className="text-2xl">{s.icon}</span>
                        <span className="text-sm font-medium">{s.label}</span>
                      </motion.button>
                    ))}
                  </div>
                </Screen>
              )}

              {step === 'income' && (
                <Screen title="How much comes in each month?" sub={range ? 'It changes month to month, so give us a range. We\'ll use the middle.' : lowIncome ? 'Zero is completely fine. Count pocket money, stipend or family support below.' : 'Your take-home pay. A rough number is perfect.'}>
                  {range ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div><p className="mb-2 text-sm text-muted">A slow month</p><MoneyInput value={incomeMin} onChange={setIncomeMin} ariaLabel="Low month" /></div>
                      <div><p className="mb-2 text-sm text-muted">A good month</p><MoneyInput value={incomeMax} onChange={setIncomeMax} ariaLabel="Good month" /></div>
                    </div>
                  ) : <BigMoney value={incomeMin} onChange={setIncomeMin} />}
                  <div className="mt-6">
                    <p className="mb-2 text-sm text-muted">Any other money coming in? <span className="opacity-70">(family, stipend, interest)</span></p>
                    <MoneyInput value={other} onChange={setOther} ariaLabel="Other money coming in" />
                  </div>
                </Screen>
              )}

              {step === 'spending' && (
                <Screen title="And how much goes out?" sub="Rent, food, travel, bills, fun. A rough monthly number is okay.">
                  <BigMoney value={spending} onChange={setSpending} />
                </Screen>
              )}

              {step === 'reveal' && (
                surplus > 0 ? (
                  <div className="text-center">
                    <p className="text-[15px] text-muted">You could comfortably put aside</p>
                    <p className="mt-3 text-6xl font-semibold tracking-tight num"><CountUp value={cap} /></p>
                    <p className="mt-2 text-[15px] text-muted">every month. That's <span className="font-medium text-fg">{formatINRShort(cap * 12)}</span> a year.</p>
                    <div className="mx-auto mt-10 max-w-sm text-left">
                      <Slider value={Math.min(cap, surplus)} min={0} max={surplus} step={Math.max(500, Math.round(surplus / 100 / 500) * 500)} onChange={setCapacity} label="Monthly saving" />
                      <div className="mt-2 flex justify-between text-xs text-muted"><span>₹0</span><span>All {formatINRShort(surplus)} left over</span></div>
                      <p className="mt-4 text-center text-xs text-muted">We suggest about 70% of what's left, so there's room for surprises.</p>
                    </div>
                  </div>
                ) : (
                  <Screen title="That's okay." sub="Right now more is going out than coming in, which is normal between jobs or while studying. You can still set goals, and we'll show what to save once income starts.">
                    <p className="mb-2 text-sm text-muted">Anything you can still save each month? (0 is fine)</p>
                    <MoneyInput value={capacity ?? 0} onChange={setCapacity} ariaLabel="Monthly saving" />
                  </Screen>
                )
              )}

              {step === 'savings' && (
                <Screen title="Already have some savings?" sub="Money that isn't for any goal yet. Skip if not.">
                  <BigMoney value={savings} onChange={setSavings} />
                  {savings > 0 && (
                    <div className="mt-4"><p className="mb-2 text-sm text-muted">Where is it kept?</p>
                      <Picker value={savingsType} onChange={(v) => setSavingsType(v as HoldingTypeId)} ariaLabel="Where it's kept" options={visibleTypes().map((t) => ({ value: t.id, label: t.label, icon: <span className="block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} /> }))} />
                    </div>
                  )}
                </Screen>
              )}

              {step === 'rhythm' && (
                <Screen title="How often do you want to check in?" sub="A check-in takes about a minute: what came in, and what you saved.">
                  <div className="grid gap-3">
                    {([['monthly', 'Once a month', 'Calm and simple. Great for salaries.'], ['weekly', 'Every week', 'Tighter control. Great for variable income.']] as const).map(([v, t, d]) => (
                      <button key={v} type="button" onClick={() => { setFreq(v); setDay(v === 'weekly' ? 1 : 1); }} className={cn('rounded-3xl border p-5 text-left transition-all', freq === v ? 'border-fg bg-surface shadow-soft ring-1 ring-fg' : 'border-border bg-surface/70 hover:border-muted')}>
                        <p className="font-medium">{t}</p><p className="mt-0.5 text-sm text-muted">{d}</p>
                      </button>
                    ))}
                  </div>
                  {freq === 'weekly' && (
                    <div className="mt-4"><p className="mb-2 text-sm text-muted">My week starts on</p>
                      <Picker value={String(day)} onChange={(v) => setDay(+v)} ariaLabel="Week starts on" options={WEEKDAYS.map((w, i) => ({ value: String(i), label: w }))} />
                    </div>
                  )}
                </Screen>
              )}

              {step === 'done' && (
                <div className="text-center">
                  <Confetti onDone={() => undefined} />
                  <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 14 }} className="mx-auto w-fit">
                    <Logo className="h-20 w-20 rounded-[22px] shadow-lift" />
                  </motion.div>
                  <h1 className="mt-6 text-4xl font-semibold tracking-tight">You're all set{first ? `, ${first}` : ''}.</h1>
                  <p className="mx-auto mt-3 max-w-sm text-[15px] text-muted">{cap > 0 ? `You can save ${formatINR(cap)} a month. Let's give it something to aim for.` : 'Let\'s set your first goal.'}</p>
                  <div className="mx-auto mt-10 grid max-w-xs gap-2">
                    <Button size="lg" type="button" onClick={() => void finish(true)}>Create my first goal <ArrowRight className="h-4 w-4" /></Button>
                    <Button size="lg" variant="ghost" type="button" onClick={() => void finish(false)}>Look around first</Button>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {step !== 'done' && (
            <div className="space-y-2">
              <Button type="submit" size="lg" className="w-full">{step === 'welcome' ? 'Get started' : step === 'savings' && !savings ? 'Skip' : 'Continue'} <ArrowRight className="h-4 w-4" /></Button>
              {step === 'name' && !name && <button type="button" onClick={next} className="w-full py-2 text-sm text-muted hover:text-fg">Skip</button>}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

function readTheme(): Profile['theme'] {
  try { const t = localStorage.getItem('lockdin-theme'); return t === 'dark' || t === 'system' ? t : 'light'; } catch { return 'light'; }
}

function Screen({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-[32px] font-semibold leading-tight tracking-tight sm:text-4xl">{title}</h1>
      {sub && <p className="mt-3 text-[15px] leading-relaxed text-muted">{sub}</p>}
      <div className="mt-10">{children}</div>
    </div>
  );
}

function CountUp({ value }: { value: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const c = animate(0, value, { duration: 1.1, ease: [0.2, 0.8, 0.2, 1], onUpdate: setV });
    return () => c.stop();
  }, [value]);
  return <>{formatINR(v)}</>;
}

export const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
