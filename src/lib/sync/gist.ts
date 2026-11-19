import type { AppData } from '../types';
import { parseBackup, toBackup, type BackupFile } from '../db/backup';
import { APP_NAME } from '../../config';

/**
 * Optional sync through a private GitHub Gist owned by the user.
 * The token only ever lives in this browser (IndexedDB) and is sent only to api.github.com.
 */

const API = 'https://api.github.com';
export const GIST_FILE = 'lockdin-data.json';
const DESCRIPTION = `${APP_NAME} data (private sync)`;

async function gh<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (res.status === 401) throw new Error('GitHub rejected the token. Check it hasn\'t expired and has the "gist" permission.');
  if (res.status === 404) throw new Error('Sync gist not found. It may have been deleted.');
  if (!res.ok) throw new Error(`GitHub error ${res.status}. Please try again.`);
  return res.json() as Promise<T>;
}

interface GistFile { content?: string; truncated?: boolean; raw_url?: string }
interface Gist { id: string; description: string; updated_at: string; files: Record<string, GistFile> }

export async function verifyToken(token: string): Promise<string> {
  const user = await gh<{ login: string }>(token, '/user');
  return user.login;
}

/** Look for an existing LockdIn gist (so a second device picks up the same data). */
export async function findGist(token: string): Promise<string | null> {
  const list = await gh<Gist[]>(token, '/gists?per_page=100');
  return list.find((g) => GIST_FILE in g.files)?.id ?? null;
}

export async function pullGist(token: string, gistId: string): Promise<{ data: AppData; updatedAt: string } | null> {
  const g = await gh<Gist>(token, `/gists/${gistId}`);
  const f = g.files[GIST_FILE];
  if (!f) return null;
  let text = f.content ?? '';
  if (f.truncated && f.raw_url) text = await (await fetch(f.raw_url)).text();
  if (!text.trim()) return null;
  return { data: parseBackup(text).data, updatedAt: g.updated_at };
}

export async function pushGist(token: string, gistId: string | undefined, data: AppData): Promise<string> {
  const body: BackupFile = toBackup(data);
  const payload = { description: DESCRIPTION, files: { [GIST_FILE]: { content: JSON.stringify(body) } } };
  if (gistId) {
    await gh<Gist>(token, `/gists/${gistId}`, { method: 'PATCH', body: JSON.stringify(payload) });
    return gistId;
  }
  const created = await gh<Gist>(token, '/gists', { method: 'POST', body: JSON.stringify({ ...payload, public: false }) });
  return created.id;
}
