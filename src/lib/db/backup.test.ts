import { describe, expect, it } from 'vitest';
import { dataHash, parseBackup, toBackup } from './backup';
import type { AppData } from '../types';
import { SCHEMA_VERSION } from '../../config';

const sample = (): AppData => ({
  profile: null,
  goals: [{ id: 'g1', name: 'Bike' } as AppData['goals'][number]],
  holdings: [{ id: 'h1', type: 'bank' } as AppData['holdings'][number]],
  transactions: [{ id: 't1', holdingId: 'h1', amount: 100, date: '2026-01-01', kind: 'contribution', goalId: 'g1', reason: 'saving', createdAt: 'x' }],
  valuations: [],
  checkIns: [],
  meta: { id: 'meta', schemaVersion: SCHEMA_VERSION, skippedPeriods: [], gist: { autoSync: true, token: 'secret' }, modifiedAt: '' },
});

describe('backup files', () => {
  it('never includes the sync token', () => {
    const file = toBackup(sample());
    expect(JSON.stringify(file)).not.toContain('secret');
  });

  it('round-trips and counts records', () => {
    const parsed = parseBackup(JSON.stringify(toBackup(sample())));
    expect(parsed.counts).toMatchObject({ goals: 1, holdings: 1, transactions: 1 });
  });

  it('migrates an old (version 0) file', () => {
    const old = { schemaVersion: 0, data: { ...sample(), transactions: [{ id: 't1', holdingId: 'h1', amount: 5, date: '2025-05-01', kind: 'contribution', goalId: null }] } };
    const parsed = parseBackup(JSON.stringify(old));
    expect(parsed.data.transactions[0].reason).toBe('saving');
    expect(parsed.data.transactions[0].createdAt).toBeTruthy();
    expect(parsed.data.meta.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('rejects invalid files with a clear error', () => {
    expect(() => parseBackup('not json')).toThrow(/valid JSON/);
    expect(() => parseBackup('{"hello":1}')).toThrow(/doesn't look like/);
    expect(() => parseBackup(JSON.stringify({ schemaVersion: 999, data: sample() }))).toThrow(/newer version/);
  });

  it('hash changes only when user data changes', () => {
    const a = sample();
    const b = { ...sample(), meta: { ...sample().meta, modifiedAt: 'later' } };
    expect(dataHash(a)).toBe(dataHash(b));
    const c = { ...sample(), goals: [{ ...sample().goals[0], name: 'Car' }] };
    expect(dataHash(a)).not.toBe(dataHash(c));
  });
});
