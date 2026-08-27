'use client';

import {
  NICKNAME_MAX_LENGTH,
  ROOM_CODE_LENGTH,
  nicknameSchema,
  roomCodeSchema,
  zodErrorKey,
  type MessageKey,
  type RoomMembership,
  type SocketError,
  type SocketResult,
} from '@bozukkart/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { useBozukkart, useTranslate } from '@/components/bozukkart-provider';
import { ConnectionBadge } from '@/components/connection-badge';
import { readStoredNickname, storeNickname } from '@/lib/nickname-storage';

type PendingAction = 'create' | 'join' | null;

export default function LandingPage() {
  const router = useRouter();
  const { connected, createRoom, joinRoom } = useBozukkart();
  const t = useTranslate();

  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<SocketError | MessageKey | null>(null);

  useEffect(() => {
    setNickname(readStoredNickname());
  }, []);

  const busy = pending !== null;

  const errorText =
    error === null
      ? null
      : typeof error === 'string'
        ? t(error)
        : t(error.key, error.params);

  function validateNickname(): string | null {
    const parsed = nicknameSchema.safeParse(nickname);
    if (!parsed.success) {
      setError(zodErrorKey(parsed.error));
      return null;
    }

    return parsed.data;
  }

  function handleResult(result: SocketResult<RoomMembership>): void {
    if (result.ok) {
      router.push(`/room/${result.data.room.code}`);
      return;
    }

    setError(result.error);
    setPending(null);
  }

  async function handleCreate(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);

    const validNickname = validateNickname();
    if (validNickname === null) {
      return;
    }

    setPending('create');
    storeNickname(validNickname);
    handleResult(await createRoom(validNickname));
  }

  async function handleJoin(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);

    const validNickname = validateNickname();
    if (validNickname === null) {
      return;
    }

    const parsedCode = roomCodeSchema.safeParse(code);
    if (!parsedCode.success) {
      setError(zodErrorKey(parsedCode.error));
      return;
    }

    setPending('join');
    storeNickname(validNickname);
    handleResult(await joinRoom(parsedCode.data, validNickname));
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <header className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display text-5xl uppercase leading-none tracking-tight">
            {t('app.name')}
            <span className="text-blood">.</span>
          </h1>
          <ConnectionBadge />
        </div>
        <p className="text-sm leading-relaxed text-bone-dim">
          {t('app.tagline')}
        </p>
      </header>

      <section className="panel space-y-4">
        <div>
          <label
            className="font-display text-xs uppercase tracking-widest text-ash"
            htmlFor="nickname"
          >
            {t('landing.nicknameLabel')}
          </label>
          <input
            id="nickname"
            name="nickname"
            autoComplete="nickname"
            maxLength={NICKNAME_MAX_LENGTH}
            value={nickname}
            onChange={(event) => {
              setNickname(event.target.value);
            }}
            placeholder={t('landing.nicknamePlaceholder')}
            className="field mt-2 text-base"
          />
        </div>

        <form onSubmit={handleCreate}>
          <button
            type="submit"
            className="btn btn--primary w-full text-base"
            disabled={busy || !connected}
          >
            {pending === 'create'
              ? t('landing.creating')
              : t('landing.createRoom')}
          </button>
        </form>

        <div className="flex items-center gap-3 font-display text-xs uppercase tracking-widest text-ash">
          <span className="h-px flex-1 bg-felt-raised" />
          {t('landing.or')}
          <span className="h-px flex-1 bg-felt-raised" />
        </div>

        <form onSubmit={handleJoin} className="flex gap-2">
          <input
            id="code"
            name="code"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={ROOM_CODE_LENGTH}
            value={code}
            onChange={(event) => {
              setCode(
                event.target.value
                  .toUpperCase()
                  .replace(/[^A-Z]/g, '')
                  .slice(0, ROOM_CODE_LENGTH),
              );
            }}
            placeholder={t('landing.codePlaceholder')}
            aria-label={t('landing.codeLabel')}
            className="code-display field text-center text-xl uppercase"
          />
          <button
            type="submit"
            className="btn btn--ghost shrink-0"
            disabled={busy || !connected}
          >
            {pending === 'join' ? t('landing.joining') : t('landing.join')}
          </button>
        </form>

        {errorText === null ? null : (
          <p role="alert" className="text-sm text-blood">
            {errorText}
          </p>
        )}
      </section>

      <p className="text-center text-xs text-ash">{t('landing.footer')}</p>
    </main>
  );
}
