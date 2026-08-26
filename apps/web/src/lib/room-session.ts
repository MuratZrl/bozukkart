import { nicknameSchema, roomCodeSchema } from '@bozukkart/shared';

/**
 * Which room this tab believes it is in. Kept in session storage rather than
 * local storage on purpose: it is per tab, so opening a second tab does not make
 * it auto-rejoin the first tab's room and steal the seat out from under it.
 */
export interface RoomSession {
  readonly code: string;
  readonly nickname: string;
}

const STORAGE_KEY = 'bozukkart:room-session';

export function readRoomSession(): RoomSession | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    const { code, nickname } = parsed as Record<string, unknown>;
    const parsedCode = roomCodeSchema.safeParse(code);
    const parsedNickname = nicknameSchema.safeParse(nickname);

    // Anything hand-edited or left over from an older build is not worth a
    // rejoin attempt that the gateway would only reject.
    if (!parsedCode.success || !parsedNickname.success) {
      return null;
    }

    return { code: parsedCode.data, nickname: parsedNickname.data };
  } catch {
    return null;
  }
}

export function storeRoomSession(session: RoomSession): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage disabled. Auto-rejoin simply will not happen.
  }
}

export function clearRoomSession(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
