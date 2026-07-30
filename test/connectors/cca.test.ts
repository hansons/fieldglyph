import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connector as ccaConnector } from '../../src/connectors/cca/index.ts';
import { createLogger } from '../../src/core/logger.ts';
import type { ConnectorContext, FetchResult, HttpClient } from '../../src/core/types.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, '..', 'fixtures', 'cca');

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

test('cca parsePage: 2000-era nested page — no year in title, year from URL', () => {
  const result = fetchResultFor(
    'https://www.cropcirclearchives.co.uk/archives/2000/aveburytrusloe/aveburytrusloe2000a.html',
    'formation-avebury-2000.html',
  );
  const [formation] = ccaConnector.parsePage(result, { url: result.url, pageType: 'detail' });

  assert.equal(formation?.externalId, '2000-aveburytrusloe');
  assert.equal(formation?.locationName, 'Avebury Trusloe, nr Avebury');
  assert.equal(formation?.adminRegion, 'Wiltshire');
  assert.equal(formation?.discoveredDate, '2000-07-22');
  assert.equal(formation?.discoveredDatePrecision, 'day');
  assert.equal(formation?.country, 'United Kingdom');
});

test('cca parsePage: 1990 flat page — bare "Location. Reported ..." title, no grid ref', () => {
  const result = fetchResultFor(
    'https://www.cropcirclearchives.co.uk/archives/1990/Blackland90.html',
    'formation-blackland-1990-flat.html',
  );
  const [formation] = ccaConnector.parsePage(result, { url: result.url, pageType: 'detail' });

  assert.equal(formation?.externalId, '1990-Blackland90');
  assert.equal(formation?.locationName, 'Stone Pitt Hill, nr Blackland');
  assert.equal(formation?.adminRegion, 'Wiltshire');
  assert.equal(formation?.discoveredDate, '1990-06-02');
  assert.equal(formation?.coordinateSource, 'unknown');
  // Flat pages mix aerial and ground shots — the aerial flag must not be asserted.
  assert.ok(formation?.media.every((m) => m.isAerial === undefined));
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

test('cca discoverPages: local years only, both page vintages, offsite 2014+ excluded', async () => {
  const ctx = {
    http: fakeHttpFromFixtures({
      'https://www.cropcirclearchives.co.uk/archives/ccarchives.htm': 'master-index.html',
      'https://www.cropcirclearchives.co.uk/archives/2000/2000.html': 'year-2000.html',
      'https://www.cropcirclearchives.co.uk/archives/1990/1990.html': 'year-1990-flat.html',
    }),
    logger: createLogger('error'),
  } as unknown as ConnectorContext;

  const urls: string[] = [];
  for await (const page of ccaConnector.discoverPages(ctx)) {
    urls.push(page.url);
  }

  // Nested vintage (2000) and flat vintage (1990) both discovered.
  assert.ok(
    urls.includes(
      'https://www.cropcirclearchives.co.uk/archives/2000/aveburytrusloe/aveburytrusloe2000a.html',
    ),
  );
  assert.ok(urls.includes('https://www.cropcirclearchives.co.uk/archives/1990/Blackland90.html'));

  // Continuation-page formations dedupe to one entry (Longwarren90 + Longwarren90a).
  const longwarren = urls.filter((u) => u.includes('Longwarren'));
  assert.equal(longwarren.length, 1);

  // Chrome and offsite links never surface.
  assert.ok(!urls.some((u) => u.includes('cropcircleconnector.com')));
  assert.ok(!urls.some((u) => /rumours|reportacropcircle|credits|ImageUsePolicy|map2000/i.test(u)));
  // Listing pages themselves are not yielded as formations.
  assert.ok(!urls.some((u) => /\/(19|20)\d{2}\/(19|20)\d{2}[a-z]?\.html$/i.test(u)));
});
