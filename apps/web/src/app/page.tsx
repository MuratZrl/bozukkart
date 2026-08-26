'use client';

import {
  LOCALES,
  NICKNAME_MAX_LENGTH,
  ROOM_CODE_LENGTH,
  nicknameSchema,
  roomCodeSchema,
  zodErrorKey,
  type Locale,
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
  const { connected, locale, setLocale, createRoom, joinRoom } = useBozukkart();
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
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-black tracking-tight">
            {t('app.name')}
            <span className="text-violet-400">.</span>
          </h1>
          <ConnectionBadge />
        </div>
        <p className="text-sm text-zinc-400">{t('app.tagline')}</p>
      </header>

      <section className="rounded-2xl border border-edge bg-surface p-5 shadow-xl shadow-black/40">
        <div className="mb-5 flex items-center justify-between gap-3">
          <label
            className="text-xs font-semibold uppercase tracking-wide text-zinc-400"
            htmlFor="locale"
          >
            {t('locale.label')}
          </label>
          <select
            id="locale"
            value={locale}
            onChange={(event) => {
              setLocale(event.target.value as Locale);
            }}
            className="rounded-xl border border-edge bg-surface-raised px-3 py-2 text-sm outline-none focus:border-violet-500"
          >
            {LOCALES.map((option) => (
              <option key={option} value={option}>
                {t(`locale.${option}` as MessageKey)}
              </option>
            ))}
          </select>
        </div>

        <label
          className="block text-xs font-semibold uppercase tracking-wide text-zinc-400"
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
          className="mt-2 w-full rounded-xl border border-edge bg-surface-raised px-4 py-3 text-base outline-none placeholder:text-zinc-600 focus:border-violet-500"
        />

        <form onSubmit={handleCreate} className="mt-5">
          <button
            type="submit"
            disabled={busy || !connected}
            className="w-full rounded-xl bg-violet-600 px-4 py-3 text-base font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending === 'create'
              ? t('landing.creating')
              : t('landing.createRoom')}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-widest text-zinc-600">
          <span className="h-px flex-1 bg-edge" />
          {t('landing.or')}
          <span className="h-px flex-1 bg-edge" />
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
            className="code-display w-full rounded-xl border border-edge bg-surface-raised px-4 py-3 text-center text-base uppercase outline-none placeholder:text-zinc-600 focus:border-violet-500"
          />
          <button
            type="submit"
            disabled={busy || !connected}
            className="shrink-0 rounded-xl border border-edge bg-surface-raised px-5 py-3 text-base font-semibold transition hover:border-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending === 'join' ? t('landing.joining') : t('landing.join')}
          </button>
        </form>

        {errorText === null ? null : (
          <p role="alert" className="mt-4 text-sm text-rose-400">
            {errorText}
          </p>
        )}
      </section>

      <p className="text-center text-xs text-zinc-600">{t('landing.footer')}</p>
    </main>
  );
}
