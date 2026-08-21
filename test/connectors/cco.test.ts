import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCcoCountryPage } from '../../src/connectors/cco/parse.ts';
import { connector as ccoConnector } from '../../src/connectors/cco/index.ts';
import { createLogger } from '../../src/core/logger.ts';
import type { ConnectorContext, FetchResult, HttpClient } from '../../src/core/types.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, '..', 'fixtures', 'cco');

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

test('parseCcoCountryPage: extracts date, location, crop type, country, and photo media', () => {
  const result = fetchResultFor(
    'http://www.cropcirclesonline.com/archive/crop-circles-archive-russia.htm',
    'country-russia.html',
  );
  const formations = parseCcoCountryPage(result);

  assert.equal(formations.length, 6);

  const belorechensk = formations[0];
  assert.equal(belorechensk?.discoveredDate, '2010-06-15');
  assert.equal(belorechensk?.discoveredDatePrecision, 'day');
  assert.equal(belorechensk?.locationName, 'Krasnodar, Belorechensk');
  assert.equal(belorechensk?.country, 'Russia');
  assert.equal(belorechensk?.cropType, 'wheat');
  assert.equal(belorechensk?.externalId, 'photo-1332');
  assert.equal(belorechensk?.media.length, 1);
  assert.equal(
    belorechensk?.media[0]?.url,
    'http://www.cropcirclesonline.com/archive/ph/crop-circle-photo-1332.jpg',
  );
  assert.equal(belorechensk?.media[0]?.kind, 'photo');
  assert.equal(belorechensk?.coordinateSource, 'unknown');
  assert.equal(belorechensk?.locationPrecision, 'place-name-only');

  // No photo link -> no media, and a derived externalId instead of a photo id.
  const novokubanskie = formations[1];
  assert.equal(novokubanskie?.locationName, 'Novokubanskie District, Krasnodar');
  assert.equal(novokubanskie?.media.length, 0);
  assert.equal(novokubanskie?.externalId, 'russia-2009-06-22-crop-circle-at-novokubanskie-district-krasnodar');

  // "Crop circle at " prefix stripped even with a comma-heavy location.
  const armavir = formations[2];
  assert.equal(armavir?.locationName, 'Novokubansk, Krasnodar, Armavir');

  // Row with no "Crop circle at" prefix, no crop type, no photo still parses.
  const tenginskaya = formations[5];
  assert.equal(tenginskaya?.locationName, 'Tenginskaya, nr. Kavkazskaya');
  assert.equal(tenginskaya?.cropType, undefined);
  assert.equal(tenginskaya?.media.length, 0);

  for (const f of formations) {
    assert.equal(f.parseWarnings, undefined, 'country slug "russia" should resolve cleanly');
  }
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

test('CCO discoverPages: yields canonical country pages, skips year-suffixed duplicates and the summary table', async () => {
  const ctx = {
    http: fakeHttpFromFixtures({
      'http://www.cropcirclesonline.com/crop-circles-archive.htm': 'archive-index.html',
    }),
    logger: createLogger('error'),
  } as unknown as ConnectorContext;

  const urls: string[] = [];
  for await (const page of ccoConnector.discoverPages(ctx)) {
    urls.push(page.url);
  }

  assert.deepEqual(urls, [
    'http://www.cropcirclesonline.com/archive/crop-circles-archive-russia.htm',
    'http://www.cropcirclesonline.com/archive/crop-circles-archive-germany.htm',
    'http://www.cropcirclesonline.com/archive/crop-circles-archive-czech.htm',
  ]);
});
