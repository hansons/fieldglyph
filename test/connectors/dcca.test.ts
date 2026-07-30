import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDccaFormation } from '../../src/connectors/dcca/parse.ts';
import { connector as dccaConnector } from '../../src/connectors/dcca/index.ts';
import { createLogger } from '../../src/core/logger.ts';
import type { ConnectorContext, FetchResult, HttpClient } from '../../src/core/types.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, '..', 'fixtures', 'dcca');

function loadFixture(name: string): string {
  return readFileSync(path.join(fixturesDir, name), 'utf-8');
}

function fetchResultFor(url: string, htmlFile: string): FetchResult {
  return {
    url,
    html: loadFixture(htmlFile),
    httpStatus: 200,
    fetchMode: 'live',
    fetchedAt: '2026-01-01T00:00:00.000Z',
    cachePath: `/fake/${htmlFile}`,
  };
}

test('parseDccaFormation: extracts title, date, location from a plain report (Noordhoek)', () => {
  const result = fetchResultFor(
    'https://www.dcca.nl/2012/noordhoek/noordhoek-uk.htm',
    'formation-noordhoek.html',
  );
  const [formation] = parseDccaFormation(result);

  assert.equal(formation?.externalId, '2012-15');
  assert.equal(formation?.locationName, 'Noordhoek');
  assert.equal(formation?.adminRegion, 'Noord-Brabant');
  assert.equal(formation?.discoveredDate, '2012-07-26');
  assert.equal(formation?.discoveredDatePrecision, 'day');
  assert.equal(formation?.country, 'Netherlands');
  assert.equal(formation?.verificationStatus, 'reported');
  assert.equal(formation?.locationPrecision, 'place-name-only');

  assert.equal(formation?.media.length, 3);
  assert.deepEqual(
    formation?.media.map((m) => m.kind),
    ['photo', 'photo', 'diagram'],
  );
  assert.equal(
    formation?.media[0]?.url,
    'https://www.dcca.nl/2012/noordhoek/noordhoek1.jpg',
  );
});

test('parseDccaFormation: handles a region without a hyphen and a richer description (Zevenbergen)', () => {
  const result = fetchResultFor(
    'https://www.dcca.nl/2006/zevenbergen/zevenbergen-uk.htm',
    'formation-zevenbergen.html',
  );
  const [formation] = parseDccaFormation(result);

  assert.equal(formation?.externalId, '2006-03');
  assert.equal(formation?.locationName, 'Zevenbergen');
  assert.equal(formation?.adminRegion, 'Noord Brabant');
  assert.equal(formation?.discoveredDate, '2006-07-13');
  assert.ok(formation?.description?.includes('Robbert van den Broeke'));
  assert.equal(formation?.media.length, 3);
  assert.ok(
    formation?.parseWarnings?.some((w) => w.includes('continuation page')),
    'should flag the zevenbergen2-uk.htm continuation link',
  );
});

test('parseDccaFormation: detects hoax mentions via keyword heuristic (Berg en Dal)', () => {
  const result = fetchResultFor(
    'https://www.dcca.nl/2008/bergendal/bergendal-uk.htm',
    'formation-bergendal-hoax.html',
  );
  const [formation] = parseDccaFormation(result);

  assert.equal(formation?.locationName, 'Berg en Dal');
  assert.equal(formation?.adminRegion, 'Gelderland');
  assert.equal(formation?.verificationStatus, 'hoax-suspected');
  assert.ok(formation?.parseWarnings?.some((w) => w.includes('hoax-suspected via keyword heuristic')));
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

test('DCCA discoverPages: walks master index -> year index -> detail pages, tolerating missing years', async () => {
  const ctx = {
    http: fakeHttpFromFixtures({
      'https://www.dcca.nl/dcca.htm': 'master-index.html',
      'https://www.dcca.nl/2012/2012-uk.htm': 'year-index-2012.html',
    }),
    logger: createLogger('error'),
  } as unknown as ConnectorContext;

  const urls: string[] = [];
  for await (const page of dccaConnector.discoverPages(ctx)) {
    assert.equal(page.pageType, 'detail');
    urls.push(page.url);
  }

  // Only 2012 has fixture content; every other linked year (1979-2011) fails to
  // fetch and should be skipped gracefully rather than aborting the whole run.
  assert.equal(urls.length, 15);
  assert.ok(urls.includes('https://www.dcca.nl/2012/schijndel/schijndel-uk.htm'));
  assert.ok(urls.includes('https://www.dcca.nl/2012/seppe4/seppe4-uk.htm'));
});

test('DCCA discoverPages: resolves older year-index templates using "../YYYY/slug/slug-uk.htm" hrefs', async () => {
  // Regression test: pre-~2010 year pages write detail links relative to the site
  // root (e.g. "../2005/hoeven/hoev-uk.htm") instead of relative to their own
  // directory (e.g. "hoeven/hoev-uk.htm" on the 2012 template). A raw-href regex
  // that only recognised the newer style silently discovered zero formations for
  // every older year — classification must happen on the resolved absolute URL.
  const ctx = {
    http: fakeHttpFromFixtures({
      'https://www.dcca.nl/dcca.htm': 'master-index.html',
      'https://www.dcca.nl/2005/2005-uk.htm': 'year-index-2005-old-template.html',
    }),
    logger: createLogger('error'),
  } as unknown as ConnectorContext;

  const urls: string[] = [];
  for await (const page of dccaConnector.discoverPages(ctx)) {
    urls.push(page.url);
  }

  assert.equal(urls.length, 7);
  assert.ok(urls.includes('https://www.dcca.nl/2005/hoeven/hoev-uk.htm'));
  assert.ok(urls.includes('https://www.dcca.nl/2005/diever/diever-uk.htm'));
});

test('DCCA discoverPages: pre-2001 year pages yield flat detail links plus the year page itself', async () => {
  const ctx = {
    http: fakeHttpFromFixtures({
      'https://www.dcca.nl/dcca.htm': 'master-index.html',
      'https://www.dcca.nl/1999/1999-uk.htm': 'year-index-1999-inline.html',
    }),
    logger: createLogger('error'),
  } as unknown as ConnectorContext;

  const urls: string[] = [];
  for await (const page of dccaConnector.discoverPages(ctx)) {
    urls.push(page.url);
  }

  // 1999 has 7 flat detail links (uk57, uk46, uk47, uk69, uk48, uk49, uk50,
  // ruur-99-uk) — that's 8 — plus the year page itself for the inline entries.
  assert.ok(urls.includes('https://www.dcca.nl/1999/uk57.htm'));
  assert.ok(urls.includes('https://www.dcca.nl/1999/ruur-99-uk.htm'));
  assert.ok(urls.includes('https://www.dcca.nl/1999/1999-uk.htm'), 'year page itself must be yielded');
  // Year-nav links must NOT be treated as detail pages.
  assert.ok(!urls.includes('https://www.dcca.nl/2000/2000-uk.htm'));
});

test('parseDccaFormation: old flat detail page with div#kop title and broken markup (Sevenum uk57)', () => {
  const result = fetchResultFor('https://www.dcca.nl/1999/uk57.htm', 'formation-old-uk57-sevenum.html');
  const [formation] = parseDccaFormation(result);

  assert.equal(formation?.externalId, '1999-01');
  assert.equal(formation?.locationName, 'Sevenum');
  assert.equal(formation?.adminRegion, 'Limburg');
  assert.equal(formation?.discoveredDate, '1999-06-30');
  assert.equal(formation?.discoveredDatePrecision, 'day');
  assert.ok(formation?.description?.includes('potatos'));
  assert.equal(formation?.media.length, 2);
  assert.equal(formation?.media[0]?.url, 'https://www.dcca.nl/1999/sevenum01.jpg');
});

test('parseDccaFormation: old detail page with missing comma before date (Ubachsberg)', () => {
  const result = fetchResultFor('https://www.dcca.nl/2000/ub-uk.htm', 'formation-old-ub-ubachsberg.html');
  const [formation] = parseDccaFormation(result);

  assert.equal(formation?.externalId, '2000-03');
  assert.equal(formation?.locationName, 'Ubachsberg');
  assert.equal(formation?.adminRegion, 'Limburg');
  assert.equal(formation?.discoveredDate, '2000-06-03');
  assert.equal(formation?.media.length, 2);
});

test('parseDccaFormation: inline 1999 year page parses unlinked entries and skips linked ones', () => {
  const result = fetchResultFor('https://www.dcca.nl/1999/1999-uk.htm', 'year-index-1999-inline.html');
  const formations = parseDccaFormation(result);

  // Linked entries (Sevenum, Zeddam, Kilder, 's Heerenberg, Nieuwekerk, Zutphen,
  // Ruurlo x2) are skipped here — they're parsed from their own detail pages.
  const locations = formations.map((f) => f.locationName);
  assert.ok(!locations.includes('Sevenum'));
  assert.ok(!locations.includes('Kilder'));

  // Unlinked inline entries are captured.
  assert.ok(locations.includes('2 formations near Hoeven'));
  assert.ok(locations.includes('Elkenrade'));
  assert.ok(locations.includes('Wieringerwerf'));

  const hoeven = formations.find((f) => f.locationName === '2 formations near Hoeven');
  assert.equal(hoeven?.discoveredDate, '1999-07-07');
  assert.equal(hoeven?.discoveredDatePrecision, 'day');
  assert.equal(hoeven?.externalId, '1999-02');

  // Month-only and year-only dates keep honest precision.
  const enschede = formations.find((f) => f.locationName === 'Enschede');
  assert.equal(enschede?.discoveredDate, '1999-07');
  assert.equal(enschede?.discoveredDatePrecision, 'month');

  const elkenrade = formations.find((f) => f.locationName === 'Elkenrade');
  assert.equal(elkenrade?.discoveredDate, '1999');
  assert.equal(elkenrade?.discoveredDatePrecision, 'year');

  // Multi-formation entry "15, 16-" becomes one flagged record.
  const schermerhoorn = formations.find((f) => f.locationName?.includes('Schermerhoorn'));
  assert.equal(schermerhoorn?.externalId, '1999-15-16');
  assert.ok(schermerhoorn?.parseWarnings?.some((w) => w.includes('multiple formations')));
});

test('parseDccaFormation: single-entry 1990 year page', () => {
  const result = fetchResultFor('https://www.dcca.nl/1990/1990-uk.htm', 'year-index-1990-inline.html');
  const formations = parseDccaFormation(result);

  assert.equal(formations.length, 1);
  assert.equal(formations[0]?.locationName, 'Hoofddorp');
  assert.equal(formations[0]?.adminRegion, 'Noord Holland');
  assert.equal(formations[0]?.discoveredDate, '1990');
  assert.equal(formations[0]?.discoveredDatePrecision, 'year');
  assert.equal(formations[0]?.media.length, 1);
  assert.equal(formations[0]?.media[0]?.url, 'https://www.dcca.nl/1990/hoofddorp.gif');
});

test('parseDccaFormation: 2002-era detail page uses div#kop with same-directory images', () => {
  const result = fetchResultFor('https://www.dcca.nl/2002/hoeven1/hoev1-uk.htm', 'formation-2002-kop-hoeven1.html');
  const [formation] = parseDccaFormation(result);

  assert.equal(formation?.externalId, '2002-01');
  assert.equal(formation?.locationName, 'Hoeven (1)');
  assert.equal(formation?.adminRegion, 'Noord Brabant');
  assert.equal(formation?.discoveredDate, '2002-05-25');
  assert.equal(formation?.media.length, 2);
  // The img alt carries a photographer credit — attribution travels with the image.
  assert.equal(formation?.media[0]?.copyrightNotice, 'Copyright Robert Boerman');
});

test('parseDccaFormation: 2012 title with spaces around the index dash falls back to lenient parsing', () => {
  const result = fetchResultFor(
    'https://www.dcca.nl/2012/hoeven2/hoeven2-uk.htm',
    'formation-2012-spaced-dash-hoeven2.html',
  );
  const [formation] = parseDccaFormation(result);

  assert.equal(formation?.externalId, '2012-06');
  assert.equal(formation?.locationName, 'Hoeven (2)');
  assert.equal(formation?.adminRegion, 'Noord-Brabant');
  assert.equal(formation?.discoveredDate, '2012-05-16');
  assert.equal(formation?.discoveredDatePrecision, 'day');
});

test('parseDccaFormation: 1979 historical page handles pre-modern years and date ranges', () => {
  const result = fetchResultFor('https://www.dcca.nl/1979/oud-uk.htm', 'year-index-1979-historical.html');
  const formations = parseDccaFormation(result);

  assert.equal(formations.length, 4);

  const assen = formations.find((f) => f.locationName === 'Assen');
  assert.equal(assen?.discoveredDate, '1590');
  assert.equal(assen?.discoveredDatePrecision, 'year');
  assert.ok(assen?.description?.includes('Robert Plot'));

  // "Noord-Brabant, 1933 - 1965." — a range, stored as start year with a warning.
  const brabant = formations.find((f) => f.locationName === 'Noord-Brabant');
  assert.equal(brabant?.discoveredDate, '1933');
  assert.equal(brabant?.discoveredDatePrecision, 'year');
  assert.ok(brabant?.parseWarnings?.some((w) => w.includes('date range')));

  const sneek = formations.find((f) => f.locationName === 'Sneek');
  assert.equal(sneek?.discoveredDate, '1979');
  assert.equal(sneek?.adminRegion, 'Friesland');
});
