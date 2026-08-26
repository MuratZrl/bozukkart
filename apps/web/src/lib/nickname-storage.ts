const STORAGE_KEY = 'bozukkart:nickname';

/** Never call during render: reading storage on the server would break hydration. */
export function readStoredNickname(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    // Storage can be disabled entirely; a remembered nickname is not worth a crash.
    return '';
  }
}

export function storeNickname(nickname: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, nickname);
  } catch {
    // Ignore.
  }
}
