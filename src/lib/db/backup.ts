import { z } from 'zod';
import type { AppData, AppMeta } from '../types';
import { APP_NAME, SCHEMA_VERSION } from '../../config';
import { DEFAULT_RETURNS, LEGACY_GOAL_COLOR } from '../finance/constants';
import { upgradeProfileV3, withCategoryDefaults } from '../categories';

/** What gets written to backup files and to the Gist. Secrets (GitHub token) are never included. */
export interface BackupFile {
  app: string;
  schemaVersion: number;
  exportedAt: string;
  data: AppData;
}

const anyObj = z.record(z.unknown());
const BackupSchema = z.object({
  app: z.string().optional(),
  schemaVersion: z.number().int().nonnegative(),
  exportedAt: z.string().optional(),
  data: z.object({
    profile: anyObj.nullable(),
    goals: z.array(anyObj.and(z.object({ id: z.string(), name: z.string() }))),
    holdings: z.array(anyObj.and(z.object({ id: z.string(), type: z.string() }))),
    transactions: z.array(anyObj.and(z.object({ id: z.string(), holdingId: z.string(), amount: z.number() }))),
    valuations: z.array(anyObj.and(z.object({ id: z.string(), holdingId: z.string(), value: z.number() }))),
    checkIns: z.array(anyObj.and(z.object({ id: z.string() }))),
    meta: anyObj.optional(),
  }),
});

export function stripSecrets(data: AppData): AppData {
  const meta: AppMeta = { ...data.meta, gist: { autoSync: data.meta.gist.autoSync } };
  return { ...data, meta };
}

export function toBackup(data: AppData): BackupFile {
  return { app: APP_NAME, schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data: stripSecrets(data) };
}

type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * Ordered migrations: MIGRATIONS[n] upgrades data from version n to n+1.
 * Version 0 = files written before schemaVersion existed.
 */
const MIGRATIONS: Record<number, Migration> = {
  0: (d) => {
    const data = d as unknown as AppData;
    for (const t of data.transactions ?? []) {
      (t as { reason?: string }).reason ??= t.transferId ? 'transfer' : 'saving';
      (t as { createdAt?: string }).createdAt ??= `${t.date}T12:00:00.000Z`;
    }
    for (const v of data.valuations ?? []) (v as { createdAt?: string }).createdAt ??= `${v.date}T12:00:00.000Z`;
    if (data.profile) {
      data.profile.defaultReturns = { ...DEFAULT_RETURNS, ...(data.profile.defaultReturns ?? {}) };
      data.profile.shortNumbers ??= true;
      data.profile.onboarded ??= true;
    }
    return d;
  },
  // v1 → v2: user-editable categories
  1: (d) => {
    const data = d as unknown as AppData;
    if (data.profile) data.profile.categories = withCategoryDefaults(data.profile.categories);
    for (const g of data.goals ?? []) g.color = LEGACY_GOAL_COLOR[g.color] ?? g.color;
    return d;
  },
  // v2 → v3: simpler default holding types, ETF, light theme by default
  2: (d) => {
    const data = d as unknown as AppData;
    if (data.profile) data.profile = upgradeProfileV3({ ...data.profile, categories: withCategoryDefaults(data.profile.categories) }, (data.holdings ?? []).map((h) => h.type));
    return d;
  },
};

export function migrate(file: { schemaVersion: number; data: Record<string, unknown> }): AppData {
  let v = file.schemaVersion;
  let data = file.data;
  if (v > SCHEMA_VERSION) throw new Error(`This file was made by a newer version of ${APP_NAME}. Please update the app first.`);
  while (v < SCHEMA_VERSION) {
    const m = MIGRATIONS[v];
    if (m) data = m(data);
    v++;
  }
  const out = data as unknown as AppData;
  const defaults: AppMeta = { id: 'meta', schemaVersion: SCHEMA_VERSION, skippedPeriods: [], gist: { autoSync: true }, modifiedAt: '' };
  out.meta = { ...defaults, ...(out.meta ?? {}), id: 'meta', schemaVersion: SCHEMA_VERSION, modifiedAt: new Date().toISOString() };
  return out;
}

export interface ParsedBackup { data: AppData; counts: Record<string, number>; exportedAt?: string }

/** Parse and validate a backup file's text. Throws a friendly error when invalid. */
export function parseBackup(text: string): ParsedBackup {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('That file isn\'t valid JSON. Make sure you picked a LockdIn backup file.');
  }
  // allow legacy files without a version wrapper
  const candidate = json && typeof json === 'object' && 'data' in (json as object) ? json : { schemaVersion: 0, data: json };
  const res = BackupSchema.safeParse(candidate);
  if (!res.success) throw new Error('This doesn\'t look like a LockdIn backup. Nothing was changed.');
  const data = migrate(res.data as unknown as { schemaVersion: number; data: Record<string, unknown> });
  return {
    data,
    exportedAt: res.data.exportedAt,
    counts: {
      goals: data.goals.length, holdings: data.holdings.length, transactions: data.transactions.length,
      valuations: data.valuations.length, checkIns: data.checkIns.length,
    },
  };
}

/** Stable hash of the user data (excluding volatile meta) for sync change detection. */
export function dataHash(data: AppData): string {
  const { profile, goals, holdings, transactions, valuations, checkIns } = data;
  const s = JSON.stringify({ profile: profile ? { ...profile, lastBackupAt: undefined } : null, goals, holdings, transactions, valuations, checkIns });
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36) + ':' + s.length;
}

export function downloadFile(name: string, content: BlobPart, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
