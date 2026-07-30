import * as cheerio from 'cheerio';
import type { Connector, ConnectorContext, SourcePage } from '../../core/types.ts';
import type { SourceDef } from '../../db/repository.ts';
import { isDetailUrl, parseIccraPage } from './parse.ts';

const BASE_URL = 'https://iccra.org';
const BYSTATE_INDEX_URL = `${BASE_URL}/bystate/usaformations-bystate.htm`;

// State listing pages: <State>/ICCRA_XX.htm (Ohio is ICCRA_Ohio.htm, a few use .html).
const STATE_PAGE_RE = /\/bystate\/[^/]+\/ICCRA_[A-Za-z]+\.html?$/i;

function resolveHref(href: string | undefined, base: string): URL | null {
  if (!href) return null;
  try {
    return new URL(href, base);
  } catch {
    return null;
  }
}

async function* discoverPages(ctx: ConnectorContext): AsyncGenerator<SourcePage> {
  const index = await ctx.http.fetchPage(BYSTATE_INDEX_URL, 'live-then-wayback');

  const $index = cheerio.load(index.html);
  const stateUrls: string[] = [];
  $index('a[href]').each((_, el) => {
    const abs = resolveHref($index(el).attr('href'), index.url);
    if (abs && STATE_PAGE_RE.test(abs.pathname) && !stateUrls.includes(abs.toString())) {
      stateUrls.push(abs.toString());
    }
  });

  if (stateUrls.length === 0) {
    ctx.logger.warn('ICCRA by-state index yielded no state pages — site structure may have changed');
  }

  for (const stateUrl of stateUrls) {
    let statePage;
    try {
      statePage = await ctx.http.fetchPage(stateUrl, 'live-then-wayback');
    } catch (err) {
      ctx.logger.warn('Failed to fetch ICCRA state page, skipping', {
        stateUrl,
        error: String(err),
      });
      continue;
    }

    const $state = cheerio.load(statePage.html);
    const detailUrls: string[] = [];
    $state('ul li a[href]').each((_, el) => {
      const abs = resolveHref($state(el).attr('href'), statePage.url);
      if (!abs) return;
      const url = abs.toString();
      if (isDetailUrl(abs) && !detailUrls.includes(url)) {
        detailUrls.push(url);
      }
    });

    for (const url of detailUrls) {
      yield { url, pageType: 'detail' };
    }
    // The state page itself carries the entries that never got a detail page.
    yield { url: stateUrl, pageType: 'detail' };
  }
}

export const connector: Connector = {
  id: 'iccra',
  displayName: 'ICCRA (USA Crop Circle Formations)',
  baseUrl: BASE_URL,
  defaultFetchMode: 'live-then-wayback',
  parserVersion: '1.1.0',
  discoverPages,
  parsePage: parseIccraPage,
};

export const sourceDef: SourceDef = {
  key: 'iccra',
  name: 'ICCRA (Independent Crop Circle Researchers Association)',
  baseUrl: BASE_URL,
  status: 'abandoned_live',
  recoveryPriority: 3,
  notes:
    'US formation reports organized by state, run by Jeffrey & Delsey Wilson. The site\'s own ' +
    'pages report last updates around 2008-2015 and it has been static since; still resolves ' +
    'live (http://www.iccra.org redirects to https://iccra.org). Detail-page filenames embed ' +
    'the city/county/date and are preserved as external IDs.',
};
