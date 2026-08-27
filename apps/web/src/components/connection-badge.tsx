'use client';

import { useBozukkart, useTranslate } from '@/components/bozukkart-provider';

export function ConnectionBadge() {
  const { connected } = useBozukkart();
  const t = useTranslate();

  return (
    <span
      className={`chip shrink-0 ${connected ? '' : 'chip--away'}`}
      data-connected={connected}
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-chip ${connected ? 'bg-teal' : 'bg-nicotine'}`}
      />
      {connected ? t('connection.connected') : t('connection.connecting')}
    </span>
  );
}
