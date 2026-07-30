import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCccFormation } from '../../src/connectors/ccc/parse.ts';
import { connector as cccConnector } from '../../src/connectors/ccc/index.ts';
import { createLogger } from '../../src/core/logger.ts';
import type { ConnectorContext, FetchResult, HttpClient } from '../../src/core/types.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, '..', 'fixtures', 'ccc');

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

test('parseCccFormation: extracts location, date, grid ref, and source-provided coordinates', () => {
  const result = fetchResultFor(
    'https://www.cropcircleconnector.com/2026/milkhill/milkhill2026a.html',
    'formation-milkhill-2026.html',
  );
  const [formation] = parseCccFormation(result);

  assert.equal(formation?.externalId, '2026-milkhill');
  assert.equal(formation?.locationName, 'Milk Hill, Nr Alton Barnes');
  assert.equal(formation?.adminRegion, 'Wiltshire');
  assert.equal(formation?.country, 'United Kingdom');
  assert.equal(formation?.discoveredDate, '2026-07-12');
  assert.equal(formation?.discoveredDatePrecision, 'day');

  assert.equal(formation?.osGridRef, 'SU1052564021');
  assert.equal(formation?.coordinateSource, 'source_provided');
  assert.ok(Math.abs((formation?.latitude ?? 0) - 51.37515) < 0.001);
  assert.ok(Math.abs((formation?.longitude ?? 0) - -1.85017) < 0.001);
  assert.equal(formation?.locationPrecision, 'exact');
});

test('parseCccFormation: media carries per-photographer copyright, never image bytes', () => {
  const result = fetchResultFor(
    'https://www.cropcircleconnector.com/2026/milkhill/milkhill2026a.html',
    'formation-milkhill-2026.html',
  );
  const [formation] = parseCccFormation(result);

  // 5 drone shots + 6 Hugh Newman images, all same-directory srcs; chrome excluded.
  assert.equal(formation?.media.length, 11);
  assert.ok(formation?.media.every((m) => m.isAerial === true));
  assert.ok(
    formation?.media[0]?.url.startsWith('https://www.cropcircleconnector.com/2026/milkhill/'),
  );

  const credits = new Set(formation?.media.map((m) => m.copyrightNotice));
  assert.ok(
    [...credits].some((c) => /STONEHENGE DRONESCAPES/i.test(c ?? '')),
    'first image block credit',
  );
  assert.ok([...credits].some((c) => /Hugh Newman/i.test(c ?? '')), 'second image block credit');
});

function syntheticPage(url: string, title: string): FetchResult {
  return {
    url,
    html: `<html><head><title>${title}</title></head><body></body></html>`,
    httpStatus: 200,
    fetchMode: 'live',
    fetchedAt: '2026-01-01T00:00:00.000Z',
    cachePath: '/fake/synthetic.html',
  };
}

test('parseCccFormation: "Crop Circle near ..." titles parse (the "at"-only regex regression)', () => {
  const [f] = parseCccFormation(
    syntheticPage(
      'https://www.cropcircleconnector.com/2021/Wrzesnia/Wrzesnia2021a.html',
      'Crop Circle near Wrzesnia, Poland. Reported 17th July 2021',
    ),
  );
  assert.equal(f?.locationName, 'Wrzesnia');
  assert.equal(f?.country, 'Poland');
  assert.equal(f?.discoveredDate, '2021-07-17');
  assert.equal(f?.discoveredDatePrecision, 'day');
});

test('parseCccFormation: "formationsnear" typo and "end of July. 2021" date degrade to month precision', () => {
  const [f] = parseCccFormation(
    syntheticPage(
      'https://www.cropcircleconnector.com/2021/Szczecinek/Szczecinek2021a.html',
      'Crop Circle formationsnear Szczecinek, Poland. Reported end of July. 2021',
    ),
  );
  assert.equal(f?.locationName, 'Szczecinek');
  assert.equal(f?.discoveredDate, '2021-07');
  assert.equal(f?.discoveredDatePrecision, 'month');
});

test('parseCccFormation: truncated title with no date falls back to URL year', () => {
  const [f] = parseCccFormation(
    syntheticPage(
      'https://www.cropcircleconnector.com/2024/lionsgate/lionsgate2024a.html',
      "Crop Circle at Lion's Gate, Etchilhampton Hill, Nr Devizes, Wiltshire. Reported ",
    ),
  );
  assert.equal(f?.discoveredDate, '2024');
  assert.equal(f?.discoveredDatePrecision, 'year');
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

test('CCC discoverPages: year -> month pages -> one yield per formation directory', async () => {
  const map: Record<string, string> = {
    'https://www.cropcircleconnector.com/2026/2026.html': 'year-2026.html',
    'https://www.cropcircleconnector.com/2026/July2026.html': 'month-july-2026.html',
  };
  const ctx = {
    http: fakeHttpFromFixtures(map),
    logger: createLogger('error'),
  } as unknown as ConnectorContext;

  const urls: string[] = [];
  for await (const page of cccConnector.discoverPages(ctx)) {
    urls.push(page.url);
  }

  // Only July 2026 has a fixture; May/August and all other years fail and are skipped.
  assert.ok(urls.includes('https://www.cropcircleconnector.com/2026/milkhill/milkhill2026a.html'));
  assert.ok(urls.includes('https://www.cropcircleconnector.com/2026/roundway2/roundwayhill2026b.html'));
  // No nav/archive/shop links leak through.
  assert.ok(urls.every((u) => /\/\d{4}\/[^/]+\/[^/]+\.html$/.test(new URL(u).pathname)));
  // July 2026 lists 10 formations.
  assert.equal(urls.length, 10);
});
