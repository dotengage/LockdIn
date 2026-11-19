import Dexie, { type Table } from 'dexie';
import type { AppMeta, CheckIn, Goal, Holding, Profile, Transaction, Valuation } from '../types';
import { SCHEMA_VERSION } from '../../config';

export interface ProfileRow extends Profile { id: 'me' }
export interface ChatRow { id: string; role: 'user' | 'assistant'; text: string; createdAt: string; card?: unknown; link?: unknown }

class LockdInDB extends Dexie {
  profile!: Table<ProfileRow, string>;
  goals!: Table<Goal, string>;
  holdings!: Table<Holding, string>;
  transactions!: Table<Transaction, string>;
  valuations!: Table<Valuation, string>;
  checkIns!: Table<CheckIn, string>;
  meta!: Table<AppMeta, string>;
  chat!: Table<ChatRow, string>;

  constructor() {
    super('lockdin');
    this.version(1).stores({
      profile: 'id',
      goals: 'id, status',
      holdings: 'id, type',
      transactions: 'id, date, holdingId, goalId, checkInId, transferId',
      valuations: 'id, holdingId, date',
      checkIns: 'id, periodStart',
      meta: 'id',
      chat: 'id, createdAt',
    });
  }
}

export const db = new LockdInDB();

export const defaultMeta = (): AppMeta => ({
  id: 'meta', schemaVersion: SCHEMA_VERSION, skippedPeriods: [], gist: { autoSync: true }, modifiedAt: new Date().toISOString(),
});
