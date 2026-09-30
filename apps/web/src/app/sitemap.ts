import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/lib/site';

/** Public, permanent pages, and nothing else. */
const PAGES = ['/', '/nasil-oynanir'] as const;

/**
 * Served as /sitemap.xml. `/room/[code]` is left out on purpose: a room exists
 * only while somebody is sitting in it, so its URL is dead as soon as the table
 * empties.
 *
 * No `lastModified`: the only date available here is the build's, and a lastmod
 * that moves on every deploy whether or not the page changed teaches crawlers
 * to ignore it.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((path) => ({ url: new URL(path, SITE_URL).href }));
}
