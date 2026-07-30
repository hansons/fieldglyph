import * as cheerio from 'cheerio';
import type { Connector, ConnectorContext, SourcePage } from '../../core/types.ts';
import type { SourceDef } from '../../db/repository.ts';
import { isOldDetailUrl, parseDccaFormation } from './parse.ts';

const BASE_URL = 'https://www.dcca.nl';
const MASTER_INDEX_URL = `${BASE_URL}/dcca.htm`;

// Year index pages resolve to /YYYY/whatever.htm (2 path segments); formation detail
// pages resolve to /YYYY/slug/slug-uk.htm (3 segments, one level deeper). Classify on
// the RESOLVED absolute URL, not the raw href text — across DCCA's ~20-year history the
// same logical link is written differently by page ("slug/slug-uk.htm" on newer pages,
// "../YYYY/slug/slug-uk.htm" on older ones), and both resolve to the same place.
const YEAR_INDEX_PATH_RE = /^\/\d{4}\/[^/]+\.html?$/i;
const DETAIL_PATH_RE = /^\/\d{4}\/[^/]+\/[^/]+-uk\.html?$/i;

function resolveHref(href: string | undefined, baseUrl: string): URL | null {
  if (!href) return null;
  try {
    return new URL(href, baseUrl);
  } catch {
    return null;
  }
}

async function* discoverPages(ctx: ConnectorContext): AsyncGenerator<SourcePage> {
  const masterIndex = await ctx.http.fetchPage(MASTER_INDEX_URL, 'live-then-wayback');

  const $master = cheerio.load(masterIndex.html);
  const yearUrls: string[] = [];
  $master('a[href]').each((_, el) => {
    const abs = resolveHref($master(el).attr('href'), masterIndex.url);
    if (abs && YEAR_INDEX_PATH_RE.test(abs.pathname) && !yearUrls.includes(abs.toString())) {
      yearUrls.push(abs.toString());
    }
  });

  if (yearUrls.length === 0) {
    ctx.logger.warn('DCCA master index yielded no year pages — site structure may have changed');
  }

  for (const yearUrl of yearUrls) {
    let yearPage;
    try {
      yearPage = await ctx.http.fetchPage(yearUrl, 'live-then-wayback');
    } catch (err) {
      ctx.logger.warn('Failed to fetch DCCA year index, skipping', { yearUrl, error: String(err) });
      continue;
    }

    const $year = cheerio.load(yearPage.html);
    const detailUrls: string[] = [];
    $year('a[href]').each((_, el) => {
      const abs = resolveHref($year(el).attr('href'), yearPage.url);
      if (abs && DETAIL_PATH_RE.test(abs.pathname) && !detailUrls.includes(abs.toString())) {
        detailUrls.push(abs.toString());
      }
    });

    if (detailUrls.length > 0) {
      // 2001+ template: every formation has its own /YYYY/slug/slug-uk.htm page.
      for (const url of detailUrls) {
        yield { url, pageType: 'detail' };
      }
      continue;
    }

    // Pre-2001 template: formations are listed inline on the year page itself,
    // a minority of them linking to a flat /YYYY/name.htm detail page. Yield the
    // linked detail pages, then the year page itself — its parser handles the
    // inline entries and skips the linked ones to avoid double-counting.
    const oldDetailUrls: string[] = [];
    $year('a[href]').each((_, el) => {
      const abs = resolveHref($year(el).attr('href'), yearPage.url);
      if (!abs) return;
      const url = abs.toString();
      if (isOldDetailUrl(abs) && !yearUrls.includes(url) && !oldDetailUrls.includes(url)) {
        oldDetailUrls.push(url);
      }
    });

    for (const url of oldDetailUrls) {
      yield { url, pageType: 'detail' };
    }
    yield { url: yearUrl, pageType: 'detail' };
  }
}

export const connector: Connector = {
  id: 'dcca',
  displayName: 'Dutch Crop Circle Archive',
  baseUrl: BASE_URL,
  defaultFetchMode: 'live-then-wayback',
  parserVersion: '1.2.0',
  discoverPages,
  parsePage: parseDccaFormation,
};

export const sourceDef: SourceDef = {
  key: 'dcca',
  name: 'Dutch Crop Circle Archive',
  baseUrl: BASE_URL,
  status: 'abandoned_live',
  recoveryPriority: 1,
  notes:
    'Founded 2000 by Robert Boerman. No new formations added since 2012 per the archive itself. ' +
    'As of the site\'s own "last update" footer (26-06-2025), Boerman has posted a notice offering ' +
    'the site for takeover, confirming ongoing abandonment.',
};
