import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ReactNode } from 'react';

/**
 * Link-preview images, in the game's own visual language.
 *
 * These are rendered by satori from a bare React tree: there is no document, no
 * stylesheet and no custom properties, so the palette below is the one place in
 * the app allowed to repeat the hex values from `globals.css`. Keep it in step
 * with the `@theme` block by hand; nothing else may copy from either.
 */
export const OG = {
  ink: '#161311',
  inkDeep: '#0f0d0b',
  felt: '#1e1a17',
  bone: '#e7e0d1',
  boneBright: '#f6f1e6',
  boneDim: '#a89e8d',
  ash: '#6b6357',
  blood: '#8c3b34',
  nicotine: '#b99a3e',
  teal: '#37605a',
  fillLight: '#f0dca2',
  fillDark: '#45201c',
} as const;

/** The size every crawler wants, and the one these layouts are drawn for. */
export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = 'image/png';

/**
 * The same two faces the app loads through `next/font`, as raw TrueType.
 * `next/font` only ever emits woff2, which satori cannot read, so the files are
 * vendored under `apps/web/assets` instead.
 *
 * Read once at module scope: the bytes do not depend on the request, and the
 * room image is rendered once per room code.
 */
const ASSETS_DIR = join(process.cwd(), 'assets');

const [antonData, interData] = await Promise.all([
  readFile(join(ASSETS_DIR, 'Anton-Regular.ttf')),
  readFile(join(ASSETS_DIR, 'Inter-Regular.ttf')),
]);

export const OG_FONTS = [
  {
    name: 'Anton',
    data: antonData,
    style: 'normal' as const,
    weight: 400 as const,
  },
  {
    name: 'Inter',
    data: interData,
    style: 'normal' as const,
    weight: 400 as const,
  },
];

/** Which stock a card is printed on. Straight out of `.card-block--*`. */
type Tone = 'blood' | 'nicotine' | 'teal';

const TONES: Record<Tone, { bg: string; ink: string; fill: string }> = {
  blood: { bg: OG.blood, ink: OG.boneBright, fill: OG.fillLight },
  nicotine: { bg: OG.nicotine, ink: OG.inkDeep, fill: OG.fillDark },
  teal: { bg: OG.teal, ink: OG.boneBright, fill: OG.fillLight },
};

/**
 * Cards scattered face-down in the dark, the trick `--texture-cards` plays on
 * the real page. Fixed positions rather than random ones, so the image is
 * identical on every render and stays cacheable.
 */
const SCATTER = [
  { left: -60, top: 96, rotate: -13 },
  { left: 132, top: 430, rotate: 7 },
  { left: 470, top: -78, rotate: 17 },
  { left: 742, top: 392, rotate: -6 },
  { left: 1006, top: 30, rotate: 11 },
  { left: 1094, top: 452, rotate: -16 },
] as const;

/** The felt everything sits on: ground, two glows, scattered stock. */
export function OgFrame({ children }: { readonly children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        position: 'relative',
        width: '100%',
        height: '100%',
        backgroundColor: OG.ink,
        fontFamily: 'Inter',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundImage:
            'radial-gradient(circle at 50% 0%, rgba(140, 59, 52, 0.34) 0%, rgba(140, 59, 52, 0) 62%)',
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundImage:
            'radial-gradient(circle at 92% 108%, rgba(55, 96, 90, 0.32) 0%, rgba(55, 96, 90, 0) 55%)',
        }}
      />

      {SCATTER.map((card) => (
        <div
          key={`${card.left}:${card.top}`}
          style={{
            position: 'absolute',
            left: card.left,
            top: card.top,
            width: 168,
            height: 244,
            borderRadius: 20,
            border: '3px solid rgba(231, 224, 209, 0.06)',
            transform: `rotate(${card.rotate}deg)`,
          }}
        />
      ))}

      <div
        style={{
          display: 'flex',
          position: 'relative',
          width: '100%',
          height: '100%',
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * A card: thick bone stock, a solid colour block inside it, a diamond pip in
 * two opposite corners. The object the player holds, at poster size.
 */
export function OgCard({
  tone,
  width,
  height,
  rotate = 0,
  marginLeft = 0,
  children,
}: {
  readonly tone: Tone;
  readonly width: number;
  readonly height: number;
  readonly rotate?: number;
  readonly marginLeft?: number;
  readonly children: ReactNode;
}) {
  const { bg, ink } = TONES[tone];

  return (
    <div
      style={{
        display: 'flex',
        width,
        height,
        marginLeft,
        padding: 11,
        borderRadius: 28,
        backgroundColor: OG.bone,
        border: `5px solid ${OG.boneBright}`,
        boxShadow:
          '0 6px 0 rgba(0, 0, 0, 0.45), 0 34px 60px -22px rgba(0, 0, 0, 0.88)',
        transform: `rotate(${rotate}deg)`,
      }}
    >
      <div
        style={{
          display: 'flex',
          position: 'relative',
          flexGrow: 1,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 19,
          padding: '20px 24px',
          backgroundColor: bg,
          color: ink,
          boxShadow: 'inset 0 0 30px rgba(0, 0, 0, 0.34)',
        }}
      >
        <Pip ink={ink} corner="top" />
        <Pip ink={ink} corner="bottom" />
        {children}
      </div>
    </div>
  );
}

function Pip({
  ink,
  corner,
}: {
  readonly ink: string;
  readonly corner: 'top' | 'bottom';
}) {
  const placement =
    corner === 'top' ? { top: 14, left: 14 } : { bottom: 14, right: 14 };

  return (
    <div
      style={{
        position: 'absolute',
        ...placement,
        width: 13,
        height: 13,
        border: `3px solid ${ink}`,
        opacity: 0.55,
        transform: 'rotate(45deg)',
      }}
    />
  );
}

/**
 * What a card looks like from across the table: a couple of lines of something,
 * then the blank you are meant to ruin.
 */
export function OgCardLines({ tone }: { readonly tone: Tone }) {
  const { ink, fill } = TONES[tone];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        width: '100%',
        gap: 16,
      }}
    >
      <div
        style={{
          width: '92%',
          height: 11,
          borderRadius: 999,
          backgroundColor: ink,
          opacity: 0.4,
        }}
      />
      <div
        style={{
          width: '66%',
          height: 11,
          borderRadius: 999,
          backgroundColor: ink,
          opacity: 0.4,
        }}
      />
      <div
        style={{
          width: '80%',
          height: 8,
          borderRadius: 999,
          backgroundColor: fill,
        }}
      />
    </div>
  );
}

/** The logotype, with the full stop it always carries. */
export function OgWordmark({
  text,
  size,
}: {
  readonly text: string;
  readonly size: number;
}) {
  return (
    <div
      style={{
        display: 'flex',
        fontFamily: 'Anton',
        fontSize: size,
        lineHeight: 1,
        letterSpacing: '-0.015em',
        textTransform: 'uppercase',
        color: OG.boneBright,
      }}
    >
      <span>{text}</span>
      <span style={{ color: OG.blood }}>.</span>
    </div>
  );
}
