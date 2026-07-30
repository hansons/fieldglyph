import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIccraPage, parseUsDate } from '../../src/connectors/iccra/parse.ts';
import { connector as iccraConnector } from '../../src/connectors/iccra/index.ts';
import { createLogger } from '../../src/core/logger.ts';
import type { ConnectorContext, FetchResult, HttpClient } from '../../src/core/types.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, '..', 'fixtures', 'iccra');

function fetchResultFor(url: string, htmlFile: string): FetchResult {
  return {
    url,
    html: readFileSync(path.join(fixturesDir, htmlFile), 'utf-8'),
    httpStatus: 200,
    fetchMode: 'live',
    fetchedAt: '2026-01-01T00:00:00.000Z',
    cachePath: `/fake/${htmlFile}`,
  };
}

test('parseUsDate: handles the full range of US date formats', () => {
  assert.deepEqual(parseUsDate('November 16, 1973'), { date: '1973-11-16', precision: 'day' });
  assert.deepEqual(parseUsDate('April 1995'), { date: '1995-04', precision: 'month' });
  assert.equal(parseUsDate('July, 1993').date, '1993-07');
  assert.deepEqual(parseUsDate('1975'), { date: '1975', precision: 'year' });

  const summer = parseUsDate('Summer 1955');
  assert.equal(summer.date, '1955');
  assert.equal(summer.precision, 'year');
  assert.ok(summer.warning?.includes('season'));
});

test('parseIccraPage: state page keeps only entries without their own detail page', () => {
  const result = fetchResultFor('https://iccra.org/bystate/California/ICCRA_CA.htm', 'state-california.html');
  const formations = parseIccraPage(result);

  // California's list has exactly one unlinked entry: Red Bluff (May 11, 2007).
  assert.equal(formations.length, 1);
  const redBluff = formations[0];
  assert.ok(redBluff?.locationName?.includes('Red Bluff'));
  assert.equal(redBluff?.discoveredDate, '2007-05-11');
  assert.equal(redBluff?.discoveredDatePrecision, 'day');
  assert.equal(redBluff?.adminRegion, 'California');
  assert.equal(redBluff?.country, 'United States');
  assert.ok(redBluff?.parseWarnings?.some((w) => w.includes('state index listing')));
});

test('parseIccraPage: detail page extracts title, date, crop type, and description', () => {
  const result = fetchResultFor(
    'https://iccra.org/bystate/California/ICCRA%20-%20CA%20-%20Lemon%20Grove,%20San%20Diego%20County%20(November%2016,%201973).htm',
    'detail-lemon-grove.html',
  );
  const [formation] = parseIccraPage(result);

  assert.equal(formation?.locationName, 'Lemon Grove, San Diego County');
  assert.equal(formation?.adminRegion, 'California');
  assert.equal(formation?.discoveredDate, '1973-11-16');
  assert.equal(formation?.discoveredDatePrecision, 'day');
  assert.equal(formation?.cropType, 'Grass');
  assert.ok(formation?.description?.includes('glowing red'));
  assert.equal(
    formation?.externalId,
    'ICCRA - CA - Lemon Grove, San Diego County (November 16, 1973)',
  );
  // The nav copy of the state list on the right column must not leak into media.
  assert.equal(formation?.media.length, 0);
});

test('parseIccraPage: recovers location/date from the filename when the page has no title heading', () => {
  const result: FetchResult = {
    url: 'https://iccra.org/bystate/Minnesota/ICCRA%20-%20MN%20-%20Litchfield,%20Meeker%20County%20(July%204,%202004).html',
    html: '<html><head><title>ICCRA</title></head><body><table><tr><td width="631"><p>Some report text without the standard heading.</p></td></tr></table></body></html>',
    httpStatus: 200,
    fetchMode: 'live',
    fetchedAt: '2026-01-01T00:00:00.000Z',
    cachePath: '/fake/mn-litchfield.html',
  };
  const [formation] = parseIccraPage(result);

  assert.equal(formation?.locationName, 'Litchfield, Meeker County');
  assert.equal(formation?.discoveredDate, '2004-07-04');
  assert.equal(formation?.discoveredDatePrecision, 'day');
  assert.equal(formation?.adminRegion, 'Minnesota');
  assert.ok(formation?.parseWarnings?.some((w) => w.includes('recovered from the page filename')));
});

function fakeHttpFromFixtures(map: Record<string, string>): HttpClient {
  return {
    async fetchPage(url: string): Promise<FetchResult> {
      const htmlFile = map[url];
      if (!htmlFile) throw new Error(`no fixture mapped for ${url}`);
      return fetchResultFor(url, htmlFile);
    },
  };
}

test('ICCRA discoverPages: walks index -> state pages -> detail pages + the state page itself', async () => {
  const ctx = {
    http: fakeHttpFromFixtures({
      'https://iccra.org/bystate/usaformations-bystate.htm': 'bystate-index.html',
      'https://iccra.org/bystate/California/ICCRA_CA.htm': 'state-california.html',
    }),
    logger: createLogger('error'),
  } as unknown as ConnectorContext;

  const urls: string[] = [];
  for await (const page of iccraConnector.discoverPages(ctx)) {
    urls.push(page.url);
  }

  // Only California has a fixture; the other 48 state pages fail and are skipped.
  assert.ok(urls.includes('https://iccra.org/bystate/California/ICCRA_CA.htm'));
  assert.ok(
    urls.some((u) => decodeURIComponent(u).includes('Lemon Grove, San Diego County')),
    'detail pages with space-laden filenames must be yielded percent-encoded',
  );
  // 26 linked detail entries + the state page itself. (The page's own header
  // claims "25 Reports" — the site's count is off by two; the list is what's real.)
  assert.equal(urls.length, 27);
});
