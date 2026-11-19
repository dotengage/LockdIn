import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, Eraser, Sparkles, Undo2, X } from 'lucide-react';
import { useStore, type ChatEntry, type Undo } from '@/store/useStore';
import { useDerived } from '@/store/useDerived';
import { useUI } from '@/store/useUI';
import { respond, type ChatContext } from '@/lib/chat/engine';
import { UNASSIGNED } from '@/lib/finance/ledger';
import { newId, nowStamp } from '@/lib/ids';
import { APP_NAME } from '@/config';
import { cn } from '@/lib/cn';
import { toast } from '@/components/ui/toast';

const SUGGESTIONS = [
  'Saved 10k in silver, 30% for one goal and 70% for another',
  'Earned 80k salary this month',
  'My gold is worth 1.2 lakh',
  'How am I doing?',
];

export default function ChatPanel() {
  const setOpen = useUI((s) => s.setChatOpen);
  const chat = useStore((s) => s.chat);
  const chatState = useStore((s) => s.chatState);
  const pushChat = useStore((s) => s.pushChat);
  const clearChat = useStore((s) => s.clearChat);
  const applyChatOps = useStore((s) => s.applyChatOps);
  const goals = useStore((s) => s.goals);
  const holdings = useStore((s) => s.holdings);
  const profile = useStore((s) => s.profile);
  const d = useDerived();
  const [text, setText] = useState('');
  const [lastUndo, setLastUndo] = useState<{ undo: Undo; id: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const ctx: ChatContext = useMemo(() => {
    const owners: ChatContext['owners'] = {};
    const grams: ChatContext['grams'] = {};
    for (const h of holdings) {
      const st = d.snap.holdings[h.id];
      owners[h.id] = Object.entries(st?.owners ?? {}).filter(([, p]) => p.value > 0.5).map(([k]) => (k === UNASSIGNED ? null : k));
      grams[h.id] = st?.grams ?? 0;
    }
    return {
      today: d.today, goals, holdings, owners, grams,
      metrics: Object.fromEntries(Object.entries(d.metrics).map(([k, m]) => [k, { required: m.required, currentValue: m.currentValue, target: m.target, health: m.health, monthsLeft: m.monthsLeft }])),
      totalValue: d.snap.totalValue, totalInvested: d.snap.totalInvested, monthlyCapacity: profile?.monthlySavingCapacity ?? 0,
      defaultReturns: profile!.defaultReturns,
    };
  }, [d, goals, holdings, profile]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat.length]);

  async function send(raw: string) {
    const msg = raw.trim();
    if (!msg) return;
    setText('');
    const user: ChatEntry = { id: newId(), role: 'user', text: msg, createdAt: nowStamp() };
    const res = respond(chatState, msg, ctx);
    const replies: ChatEntry[] = res.replies.map((r, i) => ({ id: newId(), role: 'assistant', text: r.text, chips: r.chips, card: r.card, link: r.link, createdAt: new Date(Date.now() + i + 1).toISOString() }));
    await pushChat([user, ...replies], res.state);
    if (res.ops?.length) {
      const undo = await applyChatOps(res.ops);
      setLastUndo({ undo, id: replies[replies.length - 1]?.id ?? '' });
    }
    inputRef.current?.focus();
  }

  const lastAssistant = [...chat].reverse().find((m) => m.role === 'assistant');

  return (
    <DialogPrimitive.Root open onOpenChange={(v) => !v && setOpen(false)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 data-[state=open]:animate-[fadeIn_150ms_ease-out] lg:bg-black/10" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col bg-surface shadow-lift focus:outline-none data-[state=open]:animate-[sheetUp_220ms_cubic-bezier(0.2,0.9,0.3,1)] sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[440px] sm:border-l sm:border-border"
        >
          <div className="flex items-center justify-between border-b border-border px-5 pb-3 safe-top">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent-soft text-accent"><Sparkles className="h-4 w-4" /></span>
              <div>
                <DialogPrimitive.Title className="text-sm font-semibold">Tell {APP_NAME}</DialogPrimitive.Title>
                <p className="text-xs text-muted">Type it like you'd say it. Works offline.</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {chat.length > 0 && <button onClick={() => void clearChat()} className="rounded-lg p-2 text-muted hover:bg-subtle hover:text-fg" aria-label="Clear conversation"><Eraser className="h-4 w-4" /></button>}
              <DialogPrimitive.Close className="rounded-lg p-2 text-muted hover:bg-subtle hover:text-fg" aria-label="Close"><X className="h-5 w-5" /></DialogPrimitive.Close>
            </div>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {!chat.length && (
              <div className="space-y-4 py-6">
                <div className="rounded-2xl bg-subtle p-4 text-sm leading-relaxed">
                  Hi{profile?.name ? ` ${profile.name}` : ''}! Tell me what happened with your money and I'll log it. If something's missing, I'll ask. Nothing is saved until you confirm.
                </div>
                <div className="flex flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => void send(s.replace('one goal', goals[0]?.name ?? 'one goal').replace('another', goals[1]?.name ?? 'another'))} className="rounded-xl border border-border px-3 py-2 text-left text-sm text-muted transition-colors hover:border-accent hover:text-fg">
                      “{s.replace('one goal', goals[0]?.name ?? 'one goal').replace('another', goals[1]?.name ?? 'another')}”
                    </button>
                  ))}
                  <button onClick={() => void send('help')} className="self-start text-xs font-medium text-accent hover:underline">See everything I understand →</button>
                </div>
              </div>
            )}
            <AnimatePresence initial={false}>
              {chat.map((m) => (
                <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[88%] space-y-2', m.role === 'user' && 'items-end')}>
                    <div className={cn('whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed', m.role === 'user' ? 'rounded-br-md bg-accent text-accent-fg' : 'rounded-bl-md bg-subtle')}>{m.text}</div>
                    {m.card && (
                      <div className="overflow-hidden rounded-2xl border border-border bg-surface text-sm">
                        <p className="border-b border-border bg-subtle/60 px-3.5 py-2 text-xs font-semibold uppercase tracking-wide text-muted">{m.card.title}</p>
                        <dl className="divide-y divide-border/60">
                          {m.card.lines.map(([k, v], li) => <div key={`${k}-${li}`} className="flex justify-between gap-4 px-3.5 py-2"><dt className="text-muted">{k}</dt><dd className="num text-right font-medium">{v}</dd></div>)}
                        </dl>
                      </div>
                    )}
                    {m.link && <Link to={m.link.to} onClick={() => setOpen(false)} className="inline-block text-sm font-medium text-accent hover:underline">{m.link.label} →</Link>}
                    {lastUndo?.id === m.id && (
                      <button onClick={async () => { await lastUndo.undo(); setLastUndo(null); toast('Undone'); await pushChat([{ id: newId(), role: 'assistant', text: 'Undone. Nothing from that entry remains.', createdAt: nowStamp() }], chatState); }} className="flex items-center gap-1 text-xs font-medium text-muted hover:text-fg"><Undo2 className="h-3.5 w-3.5" /> Undo</button>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {lastAssistant?.chips && lastAssistant.id === chat[chat.length - 1]?.id && (
            <div className="scrollbar-none flex gap-2 overflow-x-auto px-4 pb-2">
              {lastAssistant.chips.map((c, ci) => (
                <button key={`${c}-${ci}`} onClick={() => void send(c)} className={cn('shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors', c === 'Confirm' ? 'border-accent bg-accent text-accent-fg' : 'border-border hover:bg-subtle')}>{c}</button>
              ))}
            </div>
          )}

          <form className="flex items-end gap-2.5 border-t border-border px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
            <textarea
              ref={inputRef}
              autoFocus
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(text); } }}
              placeholder="e.g. Put 15k in my FD for the emergency fund"
              aria-label="Message"
              className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-bg px-3 py-2.5 text-[15px] focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
            />
            <button type="submit" disabled={!text.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg transition-opacity disabled:opacity-40" aria-label="Send"><ArrowUp className="h-5 w-5" /></button>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
