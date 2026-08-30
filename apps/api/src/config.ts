const DEFAULT_PORT = 3001;
const DEFAULT_WEB_ORIGIN = 'http://localhost:3000';
const MAX_PORT = 65_535;

function readPort(): number {
  const raw = process.env.PORT?.trim();
  if (raw === undefined || raw === '') {
    return DEFAULT_PORT;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_PORT) {
    throw new Error(`PORT must be an integer between 1 and ${MAX_PORT}, got "${raw}".`);
  }

  return parsed;
}

function readWebOrigins(): string[] {
  const raw = process.env.WEB_ORIGIN?.trim();
  const value = raw === undefined || raw === '' ? DEFAULT_WEB_ORIGIN : raw;

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function readRedisUrl(): string | null {
  const raw = process.env.REDIS_URL?.trim();

  return raw === undefined || raw === '' ? null : raw;
}

/** Port the HTTP + socket.io server binds to. */
export const API_PORT = readPort();

/** Allowed browser origins, comma separated in `WEB_ORIGIN`. */
export const WEB_ORIGINS = readWebOrigins();

/**
 * Where room state is backed up, e.g. `redis://localhost:6379`. Null when the
 * variable is unset, which turns persistence off entirely: rooms live in
 * memory and a restart loses them. That is the intended local setup, so
 * nothing about development requires a Redis to be running.
 */
export const REDIS_URL = readRedisUrl();
