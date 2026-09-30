import { OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og';

import { renderSiteImage, siteImageAlt } from '../site-image';

/**
 * The site card again. This page sets its own `openGraph`, and the layout's
 * image files go with the layout's `openGraph` when it is replaced, so the page
 * has to name one itself or its link previews come out bare.
 */
export const alt = siteImageAlt;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default renderSiteImage;
