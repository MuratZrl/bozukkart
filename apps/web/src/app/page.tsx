import { DEFAULT_LOCALE, translate } from '@bozukkart/shared';

import { JsonLd } from '@/components/json-ld';
import { LandingPage } from '@/components/landing-page';
import { SITE_URL } from '@/lib/site';

/**
 * Tells search engines what the homepage is: a free game that runs in the
 * browser. Built from the same strings as the layout's metadata, so the name
 * and description here cannot drift from the ones in the page head.
 */
const WEB_APPLICATION = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: translate(DEFAULT_LOCALE, 'app.name'),
  description: translate(DEFAULT_LOCALE, 'meta.siteDescription'),
  url: SITE_URL.origin,
  applicationCategory: 'GameApplication',
  operatingSystem: 'Web browser',
  inLanguage: DEFAULT_LOCALE,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'TRY',
  },
};

export default function HomePage() {
  return (
    <>
      <JsonLd data={WEB_APPLICATION} />
      <LandingPage />
    </>
  );
}
