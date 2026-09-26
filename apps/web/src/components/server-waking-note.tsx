'use client';

import { useEffect, useState } from 'react';

import { useBozukkart, useTranslate } from '@/components/bozukkart-provider';

/**
 * How long a connect may take before it is worth explaining. A warm API answers
 * well inside this, so the note only ever shows up for a genuinely slow start.
 */
const WAKING_NOTE_DELAY_MS = 1_500;

/**
 * The buttons stay disabled until the socket is up, and a cold API can take a
 * few seconds to answer its first handshake. Past a short grace this says why,
 * so a disabled form does not read as a broken one. Gone as soon as the socket
 * connects.
 */
export function ServerWakingNote() {
  const { connected } = useBozukkart();
  const t = useTranslate();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (connected) {
      setSlow(false);
      return;
    }

    const timer = setTimeout(() => {
      setSlow(true);
    }, WAKING_NOTE_DELAY_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [connected]);

  if (connected || !slow) {
    return null;
  }

  return (
    <p role="status" className="text-xs text-ash">
      {t('connection.waking')}
    </p>
  );
}
