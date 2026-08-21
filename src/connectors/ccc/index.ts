import * as cheerio from 'cheerio';
import type { Connector, ConnectorContext, SourcePage } from '../../core/types.ts';
import type { SourceDef } from '../../db/repository.ts';
import { parseCccFormation } from './parse.ts';

const BASE_URL = 'https://www.cropcircleconnector.com';

// The live site's year indexes only go back to 2014; everything earlier moved to
// cropcirclearchives.co.uk (a future connector). Wayback fallback still applies
// if a year page disappears from the live site between runs.
const START_YEAR = 2014;

const ALL_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTH_NAMES = new RegExp(`^(${ALL_MONTHS.join('|')})\\d{4}\\.html?$`, 'i');

// Formation pages: /YYYY/slug/slugYYYY[letter].html — three segments under a year dir.
const FORMATION_PATH_RE = /^\/(\d{4})\/([^/]+)\/[^/]+\.html?$/i;

function resolveHref(href: string | undefined, base: string): URL | null {
  if (!href) return null;
  try {
    return new URL(href, base);
  } catch {
    return null;
  }
}

async function* discoverPages(ctx: ConnectorContext): AsyncGenerator<SourcePage> {
  const endYear = new Date().getFullYear();
  const seenFormations = new Set<string>();

  // Newest first, so --limit runs exercise the current season.
  for (let year = endYear; year >= START_YEAR; year--) {
    // The current year's index/month pages gain new links all season long, so
    // they must be re-fetched live every run — everything else is a frozen
    // archive page, safe to serve from cache forever.
    const isCurrentYear = year === endYear;
    const yearUrl = `${BASE_URL}/${year}/${year}.html`;
    let yearPage;
    try {
      yearPage = await ctx.http.fetchPage(yearUrl, 'live-then-wayback', {
        forceRefetch: isCurrentYear,
      });
    } catch (err) {
      ctx.logger.warn('Failed to fetch CCC year index, skipping year', {
        yearUrl,
        error: String(err),
      });
      continue;
    }

    const $year = cheerio.load(yearPage.html);
    const monthUrls: string[] = [];
    $year('a[href]').each((_, el) => {
      const abs = resolveHref($year(el).attr('href'), yearPage.url);
      if (!abs || !abs.host.endsWith('cropcircleconnector.com')) return;
      const filename = abs.pathname.split('/').pop() ?? '';
      if (MONTH_NAMES.test(filename) && !monthUrls.includes(abs.toString())) {
        monthUrls.push(abs.toString());
      }
    });

    // Year pages don't reliably link every month (2024's index links only May and
    // August despite June/July formations existing) — probe all twelve. Months
    // that never existed fail fast and are skipped; months that existed but were
    // later dropped from the nav are recovered via the Wayback fallback.
    for (const month of ALL_MONTHS) {
      const probeUrl = `${BASE_URL}/${year}/${month}${year}.html`;
      if (!monthUrls.includes(probeUrl)) monthUrls.push(probeUrl);
    }

    // Some year pages link formations directly as well as via month pages.
    const listingPages = [
      { url: yearPage.url, html: yearPage.html },
    ];
    for (const monthUrl of monthUrls) {
      try {
        const monthPage = await ctx.http.fetchPage(monthUrl, 'live-then-wayback', {
          forceRefetch: isCurrentYear,
        });
        listingPages.push({ url: monthPage.url, html: monthPage.html });
      } catch (err) {
        ctx.logger.warn('Failed to fetch CCC month page, skipping', {
          monthUrl,
          error: String(err),
        });
      }
    }

    for (const listing of listingPages) {
      const $listing = cheerio.load(listing.html);
      const found: string[] = [];
      $listing('a[href]').each((_, el) => {
        const abs = resolveHref($listing(el).attr('href'), listing.url);
        if (!abs || !abs.host.endsWith('cropcircleconnector.com')) return;
        const match = FORMATION_PATH_RE.exec(abs.pathname);
        if (!match) return;
        // One yield per formation directory — month pages link the "a" (aerial)
        // page; any other letters are sub-pages of the same formation.
        const key = `${match[1]}/${match[2]}`;
        if (seenFormations.has(key)) return;
        seenFormations.add(key);
        found.push(abs.toString());
      });
      for (const url of found) {
        yield { url, pageType: 'detail' };
      }
    }
  }
}

export const connector: Connector = {
  id: 'ccc',
  displayName: 'Crop Circle Connector',
  baseUrl: BASE_URL,
  defaultFetchMode: 'live-then-wayback',
  parserVersion: '1.2.0',
  discoverPages,
  parsePage: parseCccFormation,
};

export const sourceDef: SourceDef = {
  key: 'ccc',
  name: 'Crop Circle Connector',
  baseUrl: BASE_URL,
  status: 'active',
  recoveryPriority: 4,
  notes:
    'The largest active crop circle database, running since 1995 (Mark Fussell & Stuart Dike). ' +
    'Live site exposes 2014-present; pre-2014 years moved to cropcirclearchives.co.uk (same ' +
    'organization — future connector). Only aerial-shots pages are harvested so far; per-formation ' +
    'sub-pages (ground shots, diagrams, field reports) are a future enhancement. Images are ' +
    'per-photographer copyright: metadata + link-back only, never bulk-copied.',
};
