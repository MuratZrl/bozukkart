import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/lib/site';

/**
 * Served as /robots.txt. The whole site may be crawled. The game's API is a
 * separate service on its own origin, so nothing lives under `/api/` here
 * today; the rule keeps any route handler added there later out of the index.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: '/api/',
    },
    sitemap: new URL('/sitemap.xml', SITE_URL).href,
    host: SITE_URL.origin,
  };
}
