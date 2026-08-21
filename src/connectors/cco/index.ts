import * as cheerio from 'cheerio';
import type { Connector, ConnectorContext, SourcePage } from '../../core/types.ts';
import type { SourceDef } from '../../db/repository.ts';
import { countrySlugFromUrl, parseCcoCountryPage } from './parse.ts';

const BASE_URL = 'http://www.cropcirclesonline.com';
const ARCHIVE_INDEX_URL = `${BASE_URL}/crop-circles-archive.htm`;

// Per-country archive pages, e.g. /archive/crop-circles-archive-russia.htm.
// Excludes the year-suffixed duplicates (crop-circles-archive-czech-2013.htm)
// since the digits fall outside the [a-z-] slug class.
const COUNTRY_PAGE_RE = /\/archive\/crop-circles-archive-[a-z-]+\.htm$/i;

function resolveHref(href: string | undefined, base: string): URL | null {
  if (!href) return null;
  try {
    return new URL(href, base);
  } catch {
    return null;
  }
}

async function* discoverPages(ctx: ConnectorContext): AsyncGenerator<SourcePage> {
  const index = await ctx.http.fetchPage(ARCHIVE_INDEX_URL, 'live-then-wayback');

  const $index = cheerio.load(index.html);
  const countryUrls: string[] = [];
  $index('a[href]').each((_, el) => {
    const abs = resolveHref($index(el).attr('href'), index.url);
    if (abs && COUNTRY_PAGE_RE.test(abs.pathname) && !countryUrls.includes(abs.toString())) {
      countryUrls.push(abs.toString());
    }
  });

  if (countryUrls.length === 0) {
    ctx.logger.warn('Crop Circles Online archive index yielded no country pages — site structure may have changed');
  }

  for (const url of countryUrls) {
    yield { url, pageType: 'detail' };
  }
}

export const connector: Connector = {
  id: 'cco',
  displayName: 'Crop Circles Online',
  baseUrl: BASE_URL,
  defaultFetchMode: 'live-then-wayback',
  parserVersion: '1.0.0',
  discoverPages,
  parsePage: (fetchResult) => parseCcoCountryPage(fetchResult),
};

export const sourceDef: SourceDef = {
  key: 'cco',
  name: 'Crop Circles Online (cropcirclesonline.com)',
  baseUrl: BASE_URL,
  status: 'abandoned_live',
  recoveryPriority: 6,
  notes:
    'Independent multi-country archive (29 countries) run by a Czech enthusiast; static since ' +
    'roughly 2014-2020 but still resolves live. Every country shares one table template: date, ' +
    '"Crop circle at <place>", crop type, optional photo. The site\'s own commentary attributes ' +
    'every formation to lightning discharge and carries unrelated fringe content elsewhere on the ' +
    'domain (COVID-19 "predictions") — only the raw date/location/crop/photo fields are harvested, ' +
    'never its editorializing. Adds meaningful depth for Germany, Italy, Belgium, Poland, and Czech ' +
    'Republic, plus first-ever coverage for Australia, Austria, Bosnia and Herzegovina, Croatia, ' +
    'Cyprus, Indonesia, South Korea, Mexico, and New Zealand. Country/place text kept as one ' +
    'locationName field rather than split into an admin region, since the "first comma segment is a ' +
    'region" pattern doesn\'t hold reliably across all 29 countries.',
};

export { countrySlugFromUrl };
