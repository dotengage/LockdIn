import { create } from 'zustand';
import type { AppData, AppMeta, CheckIn, Goal, Holding, Profile, Transaction, Valuation } from '@/lib/types';
import { db, defaultMeta, type ChatRow } from '@/lib/db/db';
import { dataHash } from '@/lib/db/backup';
import { findGist, pullGist, pushGist } from '@/lib/sync/gist';
import { initialChatState, type ChatOp, type ChatReply, type ChatState } from '@/lib/chat/engine';
import { newId, nowStamp } from '@/lib/ids';
import { periodFor } from '@/lib/finance/dates';
import { SCHEMA_VERSION } from '@/config';
import { upgradeProfileV3, withCategoryDefaults } from '@/lib/categories';
import { LEGACY_GOAL_COLOR } from '@/lib/finance/constants';

type TableKey = 'goals' | 'holdings' | 'transactions' | 'valuations' | 'checkIns';
const TABLES: TableKey[] = ['goals', 'holdings', 'transactions', 'valuations', 'checkIns'];
type Rows = { goals: Goal; holdings: Holding; transactions: Transaction; valuations: Valuation; checkIns: CheckIn };

export interface Change {
  put?: { [K in TableKey]?: Rows[K][] };
  del?: { [K in TableKey]?: string[] };
}

export type Undo = () => Promise<void>;

export interface ChatEntry extends ChatRow { chips?: string[]; card?: ChatReply['card']; link?: ChatReply['link'] }

type SyncStatus = 'off' | 'idle' | 'syncing' | 'ok' | 'error' | 'conflict';

interface State extends AppData {
  loaded: boolean;
  chat: ChatEntry[];
  chatState: ChatState;
  sync: { status: SyncStatus; error?: string; remote?: AppData };

  init(): Promise<void>;
  saveProfile(p: Profile): Promise<void>;
  patchProfile(p: Partial<Profile>): Promise<void>;
  patchMeta(m: Partial<AppMeta>): Promise<void>;
  commit(c: Change): Promise<Undo>;
  saveGoal(g: Goal): Promise<void>;
  saveHolding(h: Holding): Promise<void>;
  saveCheckIn(c: CheckIn, txs: Transaction[], newHoldings?: Holding[]): Promise<void>;
  deleteCheckIn(id: string): Promise<Undo>;
  applyChatOps(ops: ChatOp[]): Promise<Undo>;
  replaceAll(data: AppData): Promise<void>;
  resetAll(): Promise<void>;
  pushChat(entries: ChatEntry[], state: ChatState): Promise<void>;
  clearChat(): Promise<void>;
  syncNow(opts?: { resolve?: 'local' | 'remote' }): Promise<void>;
}

const emptyData = (): AppData => ({
  profile: null, goals: [], holdings: [], transactions: [], valuations: [], checkIns: [], meta: defaultMeta(),
});

let syncTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<State>((set, get) => {
  const scheduleSync = () => {
    const { meta } = get();
    if (!meta.gist.token || !meta.gist.autoSync) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => void get().syncNow(), 4000);
  };

  const touchMeta = async (patch: Partial<AppMeta> = {}) => {
    const meta = { ...get().meta, ...patch, modifiedAt: nowStamp() };
    set({ meta });
    await db.meta.put(meta);
  };

  return {
    ...emptyData(),
    loaded: false,
    chat: [],
    chatState: initialChatState,
    sync: { status: 'off' },

    async init() {
      const [profileRow, goals, holdings, transactions, valuations, checkIns, metaRow, chat] = await Promise.all([
        db.profile.get('me'), db.goals.toArray(), db.holdings.toArray(), db.transactions.toArray(),
        db.valuations.toArray(), db.checkIns.toArray(), db.meta.get('meta'), db.chat.orderBy('createdAt').toArray(),
      ]);
      let meta = metaRow ?? defaultMeta();
      if (!metaRow) await db.meta.put(meta);
      // move goals off the old (v1) purple-heavy palette; those colours can't be picked any more
      for (const g of goals) {
        const c = LEGACY_GOAL_COLOR[g.color];
        if (c) { g.color = c; await db.goals.put(g); }
      }
      let profile: Profile | null = null;
      if (profileRow) {
        const { id: _id, ...rest } = profileRow;
        void _id;
        profile = rest;
        if (!profile.categories) {
          profile = { ...profile, categories: withCategoryDefaults() };
          await db.profile.put({ ...profile, id: 'me' });
        }
      }
      if (meta.schemaVersion < 3 && profile) {
        profile = upgradeProfileV3(profile, holdings.map((h) => h.type));
        await db.profile.put({ ...profile, id: 'me' });
      }
      if (meta.schemaVersion < SCHEMA_VERSION) {
        meta = { ...meta, schemaVersion: SCHEMA_VERSION };
        await db.meta.put(meta);
      }
      set({
        profile, goals, holdings, transactions, valuations, checkIns, meta, loaded: true,
        chat: chat as ChatEntry[], sync: { status: meta.gist.token ? 'idle' : 'off' },
      });
      if (meta.gist.token && meta.gist.autoSync) void get().syncNow();
    },

    async saveProfile(p) {
      set({ profile: p });
      await db.profile.put({ ...p, id: 'me' });
      await touchMeta();
      scheduleSync();
    },

    async patchProfile(p) {
      const cur = get().profile;
      if (!cur) return;
      await get().saveProfile({ ...cur, ...p });
    },

    async patchMeta(m) {
      await touchMeta(m);
    },

    async commit(c) {
      const before: Partial<AppData> = {};
      const inverse: Change = { put: {}, del: {} };
      const next: Partial<AppData> = {};
      for (const key of TABLES) {
        const puts = (c.put?.[key] ?? []) as { id: string }[];
        const dels = c.del?.[key] ?? [];
        if (!puts.length && !dels.length) continue;
        const cur = get()[key] as { id: string }[];
        before[key] = cur as never;
        const byId = new Map(cur.map((r) => [r.id, r]));
        const invPut: { id: string }[] = [];
        const invDel: string[] = [];
        for (const r of puts) {
          const old = byId.get(r.id);
          if (old) invPut.push(old); else invDel.push(r.id);
          byId.set(r.id, r);
        }
        for (const id of dels) {
          const old = byId.get(id);
          if (old) { invPut.push(old); byId.delete(id); }
        }
        (inverse.put as Record<string, unknown[]>)[key] = invPut;
        (inverse.del as Record<string, string[]>)[key] = invDel;
        next[key] = [...byId.values()] as never;
      }
      set(next as Partial<State>);
      await db.transaction('rw', [db.goals, db.holdings, db.transactions, db.valuations, db.checkIns], async () => {
        for (const key of TABLES) {
          const puts = c.put?.[key];
          const dels = c.del?.[key];
          const table = db[key] as unknown as { bulkPut(r: unknown[]): Promise<unknown>; bulkDelete(k: string[]): Promise<void> };
          if (puts?.length) await table.bulkPut(puts);
          if (dels?.length) await table.bulkDelete(dels);
        }
      });
      await touchMeta();
      scheduleSync();
      return async () => { await get().commit(inverse); };
    },

    async saveGoal(g) {
      await get().commit({ put: { goals: [{ ...g, updatedAt: nowStamp() }] } });
    },

    async saveHolding(h) {
      await get().commit({ put: { holdings: [h] } });
    },

    async saveCheckIn(c, txs, newHoldings = []) {
      const old = get().transactions.filter((t) => t.checkInId === c.id).map((t) => t.id);
      const keep = new Set(txs.map((t) => t.id));
      await get().commit({
        put: { checkIns: [c], transactions: txs.map((t) => ({ ...t, checkInId: c.id })), holdings: newHoldings },
        del: { transactions: old.filter((id) => !keep.has(id)) },
      });
    },

    async deleteCheckIn(id) {
      const txIds = get().transactions.filter((t) => t.checkInId === id).map((t) => t.id);
      return get().commit({ del: { checkIns: [id], transactions: txIds } });
    },

    async applyChatOps(ops) {
      const change: Change = { put: { holdings: [], transactions: [], valuations: [], goals: [], checkIns: [] } };
      const s = get();
      const freq = s.profile?.checkInFrequency ?? 'monthly';
      const weekStart = s.profile?.checkInDay ?? 1;
      const checkIns = new Map(s.checkIns.map((c) => [c.id, c]));
      const findOrCreateCheckIn = (date: string): CheckIn => {
        const p = periodFor(date, freq, weekStart);
        const existing = [...checkIns.values()].find((c) => c.periodStart === p.start);
        if (existing) return existing;
        const c: CheckIn = { id: newId(), periodStart: p.start, periodEnd: p.end, incomes: [], createdAt: nowStamp() };
        checkIns.set(c.id, c);
        return c;
      };
      const touched = new Set<string>();
      for (const op of ops) {
        switch (op.kind) {
          case 'addHolding': change.put!.holdings!.push(op.holding); break;
          case 'addTx': change.put!.transactions!.push(op.tx); break;
          case 'addValuation': change.put!.valuations!.push(op.valuation); break;
          case 'addGoal': change.put!.goals!.push(op.goal); break;
          case 'updateGoal': {
            const g = s.goals.find((x) => x.id === op.id);
            if (g) change.put!.goals!.push({ ...g, ...op.patch, updatedAt: nowStamp() });
            break;
          }
          case 'addIncome': {
            const c = findOrCreateCheckIn(op.date);
            checkIns.set(c.id, { ...c, incomes: [...c.incomes, op.entry] });
            touched.add(c.id);
            break;
          }
          case 'setSpending': {
            const c = findOrCreateCheckIn(op.date);
            checkIns.set(c.id, { ...c, spending: op.amount });
            touched.add(c.id);
            break;
          }
        }
      }
      change.put!.checkIns = [...touched].map((id) => checkIns.get(id)!);
      return get().commit(change);
    },

    async replaceAll(data) {
      const meta: AppMeta = { ...defaultMeta(), ...data.meta, gist: get().meta.gist, modifiedAt: nowStamp() };
      await db.transaction('rw', [db.profile, db.goals, db.holdings, db.transactions, db.valuations, db.checkIns, db.meta], async () => {
        await Promise.all([db.profile.clear(), db.goals.clear(), db.holdings.clear(), db.transactions.clear(), db.valuations.clear(), db.checkIns.clear()]);
        if (data.profile) await db.profile.put({ ...data.profile, id: 'me' });
        await db.goals.bulkPut(data.goals);
        await db.holdings.bulkPut(data.holdings);
        await db.transactions.bulkPut(data.transactions);
        await db.valuations.bulkPut(data.valuations);
        await db.checkIns.bulkPut(data.checkIns);
        await db.meta.put(meta);
      });
      set({ ...data, meta });
    },

    async resetAll() {
      clearTimeout(syncTimer);
      await db.delete();
      await db.open();
      set({ ...emptyData(), chat: [], chatState: initialChatState, sync: { status: 'off' } });
      await db.meta.put(get().meta);
    },

    async pushChat(entries, chatState) {
      set({ chat: [...get().chat, ...entries], chatState });
      await db.chat.bulkPut(entries.map(({ chips: _c, ...rest }) => { void _c; return rest; }));
    },

    async clearChat() {
      set({ chat: [], chatState: initialChatState });
      await db.chat.clear();
    },

    async syncNow(opts) {
      const { meta } = get();
      const token = meta.gist.token;
      if (!token) return;
      set({ sync: { status: 'syncing' } });
      try {
        let gistId = meta.gist.gistId ?? (await findGist(token)) ?? undefined;
        const local: AppData = pick(get());
        const localHash = dataHash(local);
        const remote = gistId ? await pullGist(token, gistId) : null;
        const remoteHash = remote ? dataHash(remote.data) : undefined;
        const last = meta.gist.lastSyncedHash;
        const localChanged = localHash !== last;
        const remoteChanged = !!remote && remoteHash !== last;
        const hasLocalData = !!local.profile || local.goals.length > 0;

        let finalHash = localHash;
        if (opts?.resolve === 'remote' && remote) {
          await get().replaceAll(remote.data);
          finalHash = remoteHash!;
        } else if (opts?.resolve === 'local' || !remote) {
          gistId = await pushGist(token, gistId, local);
        } else if (remoteHash === localHash) {
          // already in sync
        } else if (remoteChanged && (!localChanged || !hasLocalData)) {
          await get().replaceAll(remote.data);
          finalHash = remoteHash!;
        } else if (localChanged && !remoteChanged) {
          gistId = await pushGist(token, gistId, local);
        } else {
          set({ sync: { status: 'conflict', remote: remote.data } });
          return;
        }
        const gist = { ...get().meta.gist, gistId, lastSyncedAt: nowStamp(), lastSyncedHash: finalHash };
        const m = { ...get().meta, gist };
        set({ meta: m, sync: { status: 'ok' } });
        await db.meta.put(m);
      } catch (e) {
        set({ sync: { status: 'error', error: e instanceof Error ? e.message : 'Sync failed' } });
      }
    },
  };
});

export const pick = (s: AppData): AppData => ({
  profile: s.profile, goals: s.goals, holdings: s.holdings, transactions: s.transactions,
  valuations: s.valuations, checkIns: s.checkIns, meta: s.meta,
});
