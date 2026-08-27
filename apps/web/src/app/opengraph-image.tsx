import { OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og';

import { renderSiteImage, siteImageAlt } from './site-image';

export const alt = siteImageAlt;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default renderSiteImage;
