import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { MediaCache } from '../../src/core/mediaCache.ts';
import { paths } from '../../src/config.ts';

const TEST_SOURCE = '__test_media_cache__';

// A tiny real image, not a fixture file — sharp needs valid image bytes in,
// even though what we're really testing is the caching/hashing logic.
async function tinyPng(): Promise<Buffer> {
  return sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 200, g: 50, b: 50 } } })
    .png()
    .toBuffer();
}

test('MediaCache: miss returns null', async () => {
  const cache = new MediaCache(TEST_SOURCE);
  const result = await cache.has('https://example.test/never-archived.jpg');
  assert.equal(result, null);
});

test('MediaCache: put then has round-trips as a valid webp file', async (t) => {
  const cache = new MediaCache(TEST_SOURCE);
  const url = 'https://example.test/some/photo.jpg';

  const { relativePath } = await cache.put(url, await tinyPng());
  assert.match(relativePath, /^media\/__test_media_cache__\/[0-9a-f]{16}\.webp$/);

  const found = await cache.has(url);
  assert.equal(found, relativePath);

  const fileBytes = await readFile(path.join(paths.dataDir, relativePath));
  const meta = await sharp(fileBytes).metadata();
  assert.equal(meta.format, 'webp');
  assert.equal(meta.width, 2);
  assert.equal(meta.height, 2);

  t.after(async () => {
    await rm(path.join(paths.mediaDir, TEST_SOURCE), { recursive: true, force: true });
  });
});

test('MediaCache: distinct URLs hash to distinct files', async (t) => {
  const cache = new MediaCache(TEST_SOURCE);
  const a = await cache.put('https://example.test/a.jpg', await tinyPng());
  const b = await cache.put('https://example.test/b.jpg', await tinyPng());
  assert.notEqual(a.relativePath, b.relativePath);

  t.after(async () => {
    await rm(path.join(paths.mediaDir, TEST_SOURCE), { recursive: true, force: true });
  });
});

test('MediaCache: relativePath always uses forward slashes', async (t) => {
  const cache = new MediaCache(TEST_SOURCE);
  const { relativePath } = await cache.put('https://example.test/portable.jpg', await tinyPng());
  assert.ok(!relativePath.includes('\\'));

  t.after(async () => {
    await rm(path.join(paths.mediaDir, TEST_SOURCE), { recursive: true, force: true });
  });
});
