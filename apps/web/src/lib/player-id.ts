import { playerIdSchema } from '@punchline/shared';

const STORAGE_KEY = 'punchline:player-id';

let cached: string | null = null;

function randomUuid(): string {
  const api = globalThis.crypto;

  if (typeof api?.randomUUID === 'function') {
    return api.randomUUID();
  }

  // randomUUID needs a secure context, and the dev server gets opened over a
  // plain-http LAN address from phones all the time. getRandomValues does not.
  const bytes = Array.from(api.getRandomValues(new Uint8Array(16)));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = bytes
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

/**
 * This browser's player identity. Generated once, kept in local storage, and
 * sent on every create and join so the server can hand back the same seat after
 * a refresh or a dropped connection.
 *
 * Client-only: never call it while rendering on the server.
 */
export function getPlayerId(): string {
  if (cached !== null) {
    return cached;
  }

  if (typeof window === 'undefined') {
    throw new Error('getPlayerId is client-only.');
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    // Anyone can edit local storage; a mangled id would just get rejected by
    // the gateway, so replace it rather than send it.
    if (playerIdSchema.safeParse(stored).success && stored !== null) {
      cached = stored;
      return stored;
    }
  } catch {
    // Storage disabled. Fall through to an in-memory id for this page load.
  }

  const created = randomUuid();
  cached = created;

  try {
    window.localStorage.setItem(STORAGE_KEY, created);
  } catch {
    // Ignore.
  }

  return created;
}
