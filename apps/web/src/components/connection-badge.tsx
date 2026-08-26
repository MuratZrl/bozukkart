'use client';

import { useBozukkart } from '@/components/bozukkart-provider';

export function ConnectionBadge() {
  const { connected } = useBozukkart();

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-edge bg-surface px-3 py-1 text-xs font-medium text-zinc-400">
      <span
        aria-hidden
        className={`size-2 rounded-full ${
          connected ? 'bg-emerald-400' : 'bg-amber-400'
        }`}
      />
      {connected ? 'Connected' : 'Connecting...'}
    </span>
  );
}
