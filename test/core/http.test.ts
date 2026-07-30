import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { PageFetcher } from '../../src/core/http.ts';
import { RawCache } from '../../src/core/cache.ts';
import { RobotsGate } from '../../src/core/robots.ts';
import { WaybackClient } from '../../src/core/wayback.ts';
import { createLogger } from '../../src/core/logger.ts';
import { paths } from '../../src/config.ts';

const silentLogger = createLogger('error');
const TEST_CONNECTOR = '__test_http__';

function cleanup(t: import('node:test').TestContext) {
  t.after(async () => {
    await rm(path.join(paths.rawDir, TEST_CONNECTOR), { recursive: true, force: true });
  });
}

function makeFetcher() {
  const cache = new RawCache(TEST_CONNECTOR);
  const robots = new RobotsGate(silentLogger);
  const wayback = new WaybackClient(silentLogger);
  return { fetcher: new PageFetcher(cache, robots, wayback, silentLogger), cache };
}

test('PageFetcher: cache hit never touches the network', async (t) => {
  const { fetcher, cache } = makeFetcher();
  await cache.put('https://livesite.test/cached', 'cached body', {
    fetchedAt: '2026-01-01T00:00:00.000Z',
    httpStatus: 200,
    fetchMode: 'live',
  });

  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('network should not be called on a cache hit');
  });

  const result = await fetcher.fetchPage('https://livesite.test/cached', 'live');
  assert.equal(result.html, 'cached body');
  assert.equal(result.fetchMode, 'live');
  cleanup(t);
});

test('PageFetcher: live fetch succeeds, respects robots, and populates the cache', async (t) => {
  const { fetcher, cache } = makeFetcher();
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
    if (url === 'https://livesite.test/page') return new Response('<html>live</html>', { status: 200 });
    throw new Error(`unexpected fetch: ${url}`);
  });

  const result = await fetcher.fetchPage('https://livesite.test/page', 'live');
  assert.equal(result.fetchMode, 'live');
  assert.equal(result.html, '<html>live</html>');

  const cached = await cache.get('https://livesite.test/page');
  assert.equal(cached?.html, '<html>live</html>');
  cleanup(t);
});

test('PageFetcher: robots.txt disallow blocks a live fetch', async (t) => {
  const { fetcher } = makeFetcher();
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow: /blocked/\n', { status: 200 });
    throw new Error(`unexpected fetch: ${url}`);
  });

  await assert.rejects(() => fetcher.fetchPage('https://livesite.test/blocked/page', 'live'));
  cleanup(t);
});

test('PageFetcher: live-then-wayback falls back to the latest snapshot when live 404s', async (t) => {
  const { fetcher, cache } = makeFetcher();
  const cdxRows = [
    ['urlkey', 'timestamp', 'original', 'mimetype', 'statuscode', 'digest', 'length'],
    [
      'test,livesite)/gone',
      '20150101000000',
      'https://livesite.test/gone',
      'text/html',
      '200',
      'DIGEST',
      '500',
    ],
  ];

  t.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
    if (url === 'https://livesite.test/gone') return new Response('gone', { status: 404 });
    if (url.includes('web.archive.org/cdx/search/cdx')) {
      return new Response(JSON.stringify(cdxRows), { status: 200 });
    }
    if (url.startsWith('https://web.archive.org/web/20150101000000id_/')) {
      return new Response('<html>archived copy</html>', { status: 200 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });

  const result = await fetcher.fetchPage('https://livesite.test/gone', 'live-then-wayback');
  assert.equal(result.fetchMode, 'wayback');
  assert.equal(result.waybackTimestamp, '20150101000000');
  assert.equal(result.html, '<html>archived copy</html>');

  const cached = await cache.get('https://livesite.test/gone');
  assert.equal(cached?.meta.fetchMode, 'wayback');
  cleanup(t);
});

test('PageFetcher: pure "live" policy does not fall back on failure', async (t) => {
  const { fetcher } = makeFetcher();
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
    if (url === 'https://livesite.test/gone-for-good') return new Response('gone', { status: 404 });
    throw new Error(`unexpected fetch (should not reach Wayback): ${url}`);
  });

  await assert.rejects(() => fetcher.fetchPage('https://livesite.test/gone-for-good', 'live'));
  cleanup(t);
});
