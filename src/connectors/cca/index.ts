import * as cheerio from 'cheerio';
import type { Connector, ConnectorContext, ParsedFormation, SourcePage } from '../../core/types.ts';
import type { SourceDef } from '../../db/repository.ts';
import { parseCccFormation } from '../ccc/parse.ts';

const BASE_URL = 'https://www.cropcirclearchives.co.uk';
const MASTER_INDEX_URL = `${BASE_URL}/archives/ccarchives.htm`;

// Local year indexes (/archives/1990/1990.html). 2014+ years link off to
// cropcircleconnector.com and are covered by the `ccc` connector.
const YEAR_INDEX_RE = /^\/archives\/(\d{4})\/\1\.html?$/i;
// International collections (/archives/inter2000/inter2000.html, /archives/Inter95/...).
const INTER_INDEX_RE = /^\/archives\/inter\d{2,4}\/[^/]+\.html?$/i;

// Listing pages within a year dir: the year page, its continuations (1990a.html),
// and month pages (april2000.html, july2000a.html).
const LISTING_FILENAME_RE =
  /^(?:\d{4}[a-z]?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\d{4}[a-z]?)\.html?$/i;
// Year-dir pages that are chrome, not formations.
const CHROME_FILENAME_RE =
  /^(?:map|rumours|reportacropcircle|credits|imageusepolicy|icca|index|mainframe|inter)/i;

// Formation pages come in two vintages: /archives/YYYY/slug/slugYYYYa.html
// (CCC-style, later years) and flat /archives/YYYY/NameYY.html (early years).
const NESTED_FORMATION_RE = /^\/archives\/(?:inter)?\d{2,4}\/([^/]+)\/[^/]+\.html?$/i;
const FLAT_FORMATION_RE = /^\/archives\/((?:inter)?\d{2,4})\/([^/]+)\.html?$/i;

function resolveHref(href: string | undefined, base: string): URL | null {
  if (!href) return null;
  try {
    return new URL(href, base);
  } catch {
    return null;
  }
}

function isLocal(url: URL): boolean {
  return url.host.endsWith('cropcirclearchives.co.uk');
}

async function* discoverPages(ctx: ConnectorContext): AsyncGenerator<SourcePage> {
  const master = await ctx.http.fetchPage(MASTER_INDEX_URL, 'live-then-wayback');

  const $master = cheerio.load(master.html);
  const indexUrls: string[] = [];
  $master('a[href]').each((_, el) => {
    const abs = resolveHref($master(el).attr('href'), master.url);
    if (!abs || !isLocal(abs)) return;
    if (YEAR_INDEX_RE.test(abs.pathname) || INTER_INDEX_RE.test(abs.pathname)) {
      const url = abs.toString();
      if (!indexUrls.includes(url)) indexUrls.push(url);
    }
  });

  if (indexUrls.length === 0) {
    ctx.logger.warn('cropcirclearchives master index yielded no year pages — structure may have changed');
  }

  const seen = new Set<string>();

  for (const indexUrl of indexUrls) {
    // Walk the year page plus any listing continuations/month pages it links.
    const listingQueue = [indexUrl];
    const visitedListings = new Set<string>();

    while (listingQueue.length > 0) {
      const listingUrl = listingQueue.shift()!;
      if (visitedListings.has(listingUrl)) continue;
      visitedListings.add(listingUrl);

      let listing;
      try {
        listing = await ctx.http.fetchPage(listingUrl, 'live-then-wayback');
      } catch (err) {
        ctx.logger.warn('Failed to fetch archives listing page, skipping', {
          listingUrl,
          error: String(err),
        });
        continue;
      }

      const $listing = cheerio.load(listing.html);
      const formationUrls: string[] = [];
      $listing('a[href]').each((_, el) => {
        const abs = resolveHref($listing(el).attr('href'), listing.url);
        if (!abs || !isLocal(abs)) return;
        const filename = abs.pathname.split('/').pop() ?? '';

        // More listing pages (months, continuations) in the same directory.
        const sameDir =
          abs.pathname.split('/').slice(0, -1).join('/') ===
          new URL(listingUrl).pathname.split('/').slice(0, -1).join('/');
        if (sameDir && LISTING_FILENAME_RE.test(filename)) {
          const url = abs.toString();
          if (!visitedListings.has(url) && !listingQueue.includes(url)) listingQueue.push(url);
          return;
        }

        const nested = NESTED_FORMATION_RE.exec(abs.pathname);
        if (nested) {
          const key = abs.pathname.split('/').slice(0, -1).join('/');
          if (!seen.has(key)) {
            seen.add(key);
            formationUrls.push(abs.toString());
          }
          return;
        }

        const flat = FLAT_FORMATION_RE.exec(abs.pathname);
        if (flat && !LISTING_FILENAME_RE.test(filename) && !CHROME_FILENAME_RE.test(filename)) {
          // "Longwarren90.html" and "Longwarren90a.html" are pages of the same
          // formation — dedupe on the base name up to the trailing digits.
          const base = flat[2]!.replace(/(\d)[a-z]$/i, '$1');
          const key = `${flat[1]}/${base}`.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            formationUrls.push(abs.toString());
          }
        }
      });

      for (const url of formationUrls) {
        yield { url, pageType: 'detail' };
      }
    }
  }
}

/**
 * Same page template family as Crop Circle Connector (same organization), so the
 * ccc parser is reused. Chrome pages that slip past the filename filters produce
 * a record with no matched title, no date beyond the URL year, and no media —
 * drop those rather than pollute the archive.
 */
function parsePage(fetchResult: Parameters<typeof parseCccFormation>[0]): ParsedFormation[] {
  const formations = parseCccFormation(fetchResult);
  return formations.filter((f) => {
    const titleFailed = f.parseWarnings?.some((w) => w.includes('did not match'));
    return !(titleFailed && f.media.length === 0 && f.discoveredDatePrecision === 'year');
  });
}

export const connector: Connector = {
  id: 'cca',
  displayName: 'Crop Circle Archives (pre-2014 CCC)',
  baseUrl: BASE_URL,
  defaultFetchMode: 'live-then-wayback',
  parserVersion: '1.0.0',
  discoverPages,
  parsePage,
};

export const sourceDef: SourceDef = {
  key: 'cca',
  name: 'Crop Circle Archives (cropcirclearchives.co.uk)',
  baseUrl: BASE_URL,
  status: 'active',
  recoveryPriority: 5,
  notes:
    'Crop Circle Connector\'s own archive of its pre-2014 database (same organization, public, ' +
    'no paywall), 1978-2013 plus international collections. Two page vintages: CCC-style ' +
    'slug-directory pages (later years) and flat per-formation pages (early years). ' +
    'MiscellaneousCircles section and direct-linked .jpg-only formations not yet harvested.',
};
