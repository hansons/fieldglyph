import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseIrcupFeed } from '../../src/connectors/ircup/parse.ts';
import { connector as ircupConnector } from '../../src/connectors/ircup/index.ts';
import type { FetchResult } from '../../src/core/types.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(here, '..', 'fixtures', 'ircup');

function loadFixture(name: string): string {
  return readFileSync(path.join(fixturesDir, name), 'utf-8');
}

test('parseIrcupFeed: extracts all 7 items from the one surviving RSS snapshot', () => {
  const result: FetchResult = {
    url: 'http://ccdb.cropcircleresearch.com/index.rss',
    html: loadFixture('index-rss-2014-08-13.xml'),
    httpStatus: 200,
    fetchMode: 'wayback',
    waybackTimestamp: '20140813183558',
    fetchedAt: '2026-01-01T00:00:00.000Z',
    cachePath: '/fake/index.rss',
  };

  const formations = parseIrcupFeed(result);
  assert.equal(formations.length, 7);
});

test('parseIrcupFeed: parses location, region, country, and date out of the title', () => {
  const result: FetchResult = {
    url: 'http://ccdb.cropcircleresearch.com/index.rss',
    html: loadFixture('index-rss-2014-08-13.xml'),
    httpStatus: 200,
    fetchMode: 'wayback',
    waybackTimestamp: '20140813183558',
    fetchedAt: '2026-01-01T00:00:00.000Z',
    cachePath: '/fake/index.rss',
  };

  const [first] = parseIrcupFeed(result);
  assert.equal(first?.locationName, 'Etchilhampton (2)');
  assert.equal(first?.adminRegion, 'Wiltshire');
  assert.equal(first?.country, 'United Kingdom');
  assert.equal(first?.discoveredDate, '2008-07-15');
  assert.equal(first?.discoveredDatePrecision, 'day');
  assert.equal(first?.externalId, 'uk2008cf');
  assert.ok(first?.description?.includes('dumbbell'));
  assert.equal(first?.verificationStatus, 'reported');
  assert.equal(first?.locationPrecision, 'place-name-only');
});

test('parseIrcupFeed: every item in the fixture has a stable externalId and a parseable date', () => {
  const result: FetchResult = {
    url: 'http://ccdb.cropcircleresearch.com/index.rss',
    html: loadFixture('index-rss-2014-08-13.xml'),
    httpStatus: 200,
    fetchMode: 'wayback',
    waybackTimestamp: '20140813183558',
    fetchedAt: '2026-01-01T00:00:00.000Z',
    cachePath: '/fake/index.rss',
  };

  const formations = parseIrcupFeed(result);
  for (const formation of formations) {
    assert.ok(formation.externalId?.startsWith('uk2008'), `unexpected externalId: ${formation.externalId}`);
    assert.ok(formation.discoveredDate, `missing discoveredDate for "${formation.title}"`);
    assert.equal(formation.parseWarnings, undefined);
  }
});

test('IRCUP connector.discoverPages yields exactly the RSS feed URL', async () => {
  const pages: string[] = [];
  for await (const page of ircupConnector.discoverPages({} as never)) {
    pages.push(page.url);
    assert.equal(page.pageType, 'detail');
  }
  assert.deepEqual(pages, ['http://ccdb.cropcircleresearch.com/index.rss']);
});

test('IRCUP connector is configured wayback-only (the domain no longer resolves at all)', () => {
  assert.equal(ircupConnector.defaultFetchMode, 'wayback');
});
