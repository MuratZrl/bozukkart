'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';

import type { Translate } from '@/components/bozukkart-provider';

/** How often the fuse is redrawn. The value itself always comes from the deadline. */
const TICK_MS = 250;

/**
 * A fuse burning down, not a progress bar. The remaining time is recomputed
 * from the server's deadline on every tick rather than decremented locally, so
 * it cannot drift, and a player who reconnects mid-phase picks up the true
 * remaining time from the next snapshot.
 */
export function PhaseClock({
  endsAt,
  durationMs,
  serverTime,
  t,
}: {
  readonly endsAt: number | null;
  readonly durationMs: number | null;
  readonly serverTime: number;
  readonly t: Translate;
}) {
  const [now, setNow] = useState(() => Date.now());

  /**
   * A phone with a wrong clock would otherwise render a nonsense countdown, so
   * every snapshot re-anchors us to the server's idea of the time.
   */
  const skewRef = useRef(0);
  useEffect(() => {
    skewRef.current = serverTime - Date.now();
  }, [serverTime]);

  useEffect(() => {
    if (endsAt === null) {
      return;
    }

    const id = setInterval(() => {
      setNow(Date.now());
    }, TICK_MS);

    return () => {
      clearInterval(id);
    };
  }, [endsAt]);

  if (endsAt === null || durationMs === null || durationMs <= 0) {
    return null;
  }

  const remaining = Math.max(0, endsAt - (now + skewRef.current));
  const seconds = Math.ceil(remaining / 1000);
  const progress = Math.min(1, remaining / durationMs);
  const urgency = progress > 0.5 ? 'calm' : progress > 0.2 ? 'warn' : 'urgent';

  return (
    <div
      className="phase-clock"
      data-urgency={urgency}
      style={{ '--progress': String(progress) } as CSSProperties}
      role="timer"
      aria-label={
        seconds > 0 ? t('game.timeLeft', { seconds }) : t('game.timeUp')
      }
    >
      <span className="phase-clock__fuse" aria-hidden />
      <span className="phase-clock__value">{seconds}</span>
    </div>
  );
}
