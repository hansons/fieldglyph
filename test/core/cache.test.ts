import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { RawCache } from '../../src/core/cache.ts';
import { paths } from '../../src/config.ts';

const TEST_CONNECTOR = '__test_cache__';

test('RawCache: miss returns null', async () => {
  const cache = new RawCache(TEST_CONNECTOR);
  const result = await cache.get('https://example.test/never-cached');
  assert.equal(result, null);
});

test('RawCache: put then get round-trips html and metadata', async (t) => {
  const cache = new RawCache(TEST_CONNECTOR);
  const url = 'https://example.test/some/page.html';

  await cache.put(url, '<html>hi</html>', {
    fetchedAt: '2026-01-01T00:00:00.000Z',
    httpStatus: 200,
    fetchMode: 'live',
  });

  const entry = await cache.get(url);
  assert.ok(entry);
  assert.equal(entry?.html, '<html>hi</html>');
  assert.equal(entry?.meta.url, url);
  assert.equal(entry?.meta.httpStatus, 200);
  assert.equal(entry?.meta.fetchMode, 'live');

  t.after(async () => {
    await rm(path.join(paths.rawDir, TEST_CONNECTOR), { recursive: true, force: true });
  });
});

test('RawCache: distinct URLs do not collide', async (t) => {
  const cache = new RawCache(TEST_CONNECTOR);
  await cache.put('https://example.test/a', 'A', {
    fetchedAt: 'x',
    httpStatus: 200,
    fetchMode: 'live',
  });
  await cache.put('https://example.test/b', 'B', {
    fetchedAt: 'x',
    httpStatus: 200,
    fetchMode: 'live',
  });

  const a = await cache.get('https://example.test/a');
  const b = await cache.get('https://example.test/b');
  assert.equal(a?.html, 'A');
  assert.equal(b?.html, 'B');

  t.after(async () => {
    await rm(path.join(paths.rawDir, TEST_CONNECTOR), { recursive: true, force: true });
  });
});
