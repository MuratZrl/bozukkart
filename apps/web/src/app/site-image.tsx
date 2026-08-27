import { DEFAULT_LOCALE, translate } from '@bozukkart/shared';
import { ImageResponse } from 'next/og';

import {
  OG,
  OG_FONTS,
  OG_SIZE,
  OgCard,
  OgCardLines,
  OgFrame,
  OgWordmark,
} from '@/lib/og';
import { SITE_URL } from '@/lib/site';

/**
 * The drawing behind both `opengraph-image` and `twitter-image` for the site:
 * the name, what it is, and a hand of stock. Neither convention can share a
 * route, so they share this instead.
 */
export const siteImageAlt = translate(DEFAULT_LOCALE, 'meta.imageAlt');

export function renderSiteImage(): ImageResponse {
  return new ImageResponse(
    (
      <OgFrame>
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '100%',
            alignItems: 'center',
            padding: '0 64px',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: 520,
              gap: 30,
            }}
          >
            <OgWordmark text={translate(DEFAULT_LOCALE, 'app.name')} size={104} />
            <div
              style={{
                display: 'flex',
                maxWidth: 500,
                fontSize: 31,
                lineHeight: 1.4,
                color: OG.boneDim,
              }}
            >
              {translate(DEFAULT_LOCALE, 'app.description')}
            </div>
            <div
              style={{
                display: 'flex',
                fontFamily: 'Anton',
                fontSize: 22,
                letterSpacing: '0.24em',
                textTransform: 'uppercase',
                color: OG.ash,
              }}
            >
              {SITE_URL.host}
            </div>
          </div>

          {/*
           * Pinned to the right rather than centred: the fan is wider than the
           * space left over, and a rotated card that runs off the canvas gets
           * sliced by the frame instead of overlapping it.
           */}
          <div
            style={{
              display: 'flex',
              flexGrow: 1,
              alignItems: 'center',
              justifyContent: 'flex-end',
              paddingRight: 34,
            }}
          >
            <OgCard tone="teal" width={200} height={286} rotate={-11}>
              <OgCardLines tone="teal" />
            </OgCard>
            <OgCard
              tone="nicotine"
              width={214}
              height={306}
              rotate={2}
              marginLeft={-33}
            >
              <OgCardLines tone="nicotine" />
            </OgCard>
            <OgCard
              tone="blood"
              width={200}
              height={286}
              rotate={13}
              marginLeft={-33}
            >
              <OgCardLines tone="blood" />
            </OgCard>
          </div>
        </div>
      </OgFrame>
    ),
    { ...OG_SIZE, fonts: OG_FONTS },
  );
}
