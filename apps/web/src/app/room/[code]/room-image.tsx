import { DEFAULT_LOCALE, roomCodeSchema, translate } from '@bozukkart/shared';
import { ImageResponse } from 'next/og';

import { OG, OG_FONTS, OG_SIZE, OgCard, OgFrame, OgWordmark } from '@/lib/og';
import { SITE_URL } from '@/lib/site';

/**
 * The drawing behind both `opengraph-image` and `twitter-image` for a room.
 * Neither convention can share a route, so they share this instead.
 */

/**
 * The file conventions read `alt` at module scope, before any params exist, so
 * it cannot name the code the way the title does.
 */
export const roomImageAlt = translate(DEFAULT_LOCALE, 'meta.roomImageAlt');

interface RoomImageProps {
  readonly params: Promise<{ code: string }>;
}

export async function renderRoomImage({
  params,
}: RoomImageProps): Promise<ImageResponse> {
  const { code } = await params;

  // This route is reachable with anything in the path, and whatever survives
  // gets drawn into a public image. Only a real room code ever does.
  const parsed = roomCodeSchema.safeParse(code);

  return new ImageResponse(
    (
      <OgFrame>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: '100%',
            height: '100%',
            padding: '58px 64px',
          }}
        >
          <OgWordmark text={translate(DEFAULT_LOCALE, 'app.name')} size={46} />

          {parsed.success ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 26,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  fontFamily: 'Anton',
                  fontSize: 27,
                  letterSpacing: '0.3em',
                  textTransform: 'uppercase',
                  color: OG.boneDim,
                }}
              >
                {translate(DEFAULT_LOCALE, 'lobby.roomCode')}
              </div>
              {/*
               * Wide enough for WWWW, the worst four letters the alphabet can
               * throw at it, without the code ever reflowing or clipping.
               */}
              <OgCard tone="nicotine" width={680} height={286}>
                <div
                  style={{
                    display: 'flex',
                    fontFamily: 'Anton',
                    fontSize: 130,
                    lineHeight: 1,
                    // The tracking hangs off the last letter; pad the other
                    // side by the same amount so the code sits centred.
                    letterSpacing: '0.26em',
                    paddingLeft: 38,
                    color: OG.inkDeep,
                  }}
                >
                  {parsed.data}
                </div>
              </OgCard>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignSelf: 'center',
                maxWidth: 780,
                textAlign: 'center',
                fontSize: 36,
                lineHeight: 1.4,
                color: OG.boneDim,
              }}
            >
              {translate(DEFAULT_LOCALE, 'app.description')}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              width: '100%',
            }}
          >
            <div
              style={{
                display: 'flex',
                maxWidth: 720,
                fontSize: 30,
                lineHeight: 1.35,
                color: OG.boneDim,
              }}
            >
              {translate(DEFAULT_LOCALE, 'meta.ogInvite')}
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
        </div>
      </OgFrame>
    ),
    { ...OG_SIZE, fonts: OG_FONTS },
  );
}
