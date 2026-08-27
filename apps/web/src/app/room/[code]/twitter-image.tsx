import { OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og';

import { renderRoomImage, roomImageAlt } from './room-image';

/** Same drawing as the Open Graph one; X wants its own tag pointing at it. */
export const alt = roomImageAlt;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default renderRoomImage;
