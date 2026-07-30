import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { WaybackClient } from '../../src/core/wayback.ts';
import { RawCache } from '../../src/core/cache.ts';
import { createLogger } from '../../src/core/logger.ts';
import { paths } from '../../src/config.ts';

const silentLogger = createLogger('error');
const TEST_CONNECTOR = '__test_wayback__';

const CDX_ROWS = [
  ['urlkey', 'timestamp', 'original', 'mimetype', 'statuscode', 'digest', 'length'],
  [
    'test,example)/page',
    '20100101000000',
    'https://example.test/page',
    'text/html',
    '200',
    'ABC123',
    '1000',
  ],
  [
    'test,example)/page',
    '20200601000000',
    'https://example.test/page',
    'text/html',
    '200',
    'XYZ789',
    '1200',
  ],
];

test('WaybackClient.queryCdx parses header row and maps fields', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    assert.ok(url.includes('web.archive.org/cdx/search/cdx'));
    return new Response(JSON.stringify(CDX_ROWS), { status: 200 });
  });

  const client = new WaybackClient(silentLogger);
  const records = await client.queryCdx({ url: 'example.test/page' });

  assert.equal(records.length, 2);
  assert.equal(records[0]?.timestamp, '20100101000000');
  assert.equal(records[1]?.timestamp, '20200601000000');
  assert.equal(records[0]?.original, 'https://example.test/page');
});

test('WaybackClient.queryCdx returns empty array when only header row (no snapshots)', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response(JSON.stringify([CDX_ROWS[0]]), { status: 200 }),
  );

  const client = new WaybackClient(silentLogger);
  const records = await client.queryCdx({ url: 'example.test/nothing' });
  assert.deepEqual(records, []);
});

test('WaybackClient.queryCdx returns empty array on 404', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }));
  const client = new WaybackClient(silentLogger);
  const records = await client.queryCdx({ url: 'example.test/gone' });
  assert.deepEqual(records, []);
});

test('WaybackClient.findLatestSnapshot returns the single collapsed record', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response(JSON.stringify([CDX_ROWS[0], CDX_ROWS[2]]), { status: 200 }),
  );

  const client = new WaybackClient(silentLogger);
  const record = await client.findLatestSnapshot('https://example.test/page');
  assert.equal(record?.timestamp, '20200601000000');
});

test('WaybackClient.buildSnapshotUrl defaults to id_ suffix to suppress banner/rewriting', () => {
  const client = new WaybackClient(silentLogger);
  const record = {
    urlkey: '',
    timestamp: '20200601000000',
    original: 'https://example.test/page',
    mimetype: '',
    statuscode: '200',
    digest: '',
    length: '',
  };
  assert.equal(
    client.buildSnapshotUrl(record),
    'https://web.archive.org/web/20200601000000id_/https://example.test/page',
  );
  assert.equal(
    client.buildSnapshotUrl(record, { raw: false }),
    'https://web.archive.org/web/20200601000000/https://example.test/page',
  );
});

test('WaybackClient.fetchSnapshot fetches, caches, and returns a wayback FetchResult', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    assert.ok(url.startsWith('https://web.archive.org/web/20200601000000id_/'));
    return new Response('<html>archived</html>', { status: 200 });
  });

  const client = new WaybackClient(silentLogger);
  const cache = new RawCache(TEST_CONNECTOR);
  const record = {
    urlkey: '',
    timestamp: '20200601000000',
    original: 'https://example.test/page',
    mimetype: '',
    statuscode: '200',
    digest: '',
    length: '',
  };

  const result = await client.fetchSnapshot(record, cache);
  assert.equal(result.fetchMode, 'wayback');
  assert.equal(result.waybackTimestamp, '20200601000000');
  assert.equal(result.html, '<html>archived</html>');
  assert.equal(result.url, 'https://example.test/page');

  const cached = await cache.get('https://example.test/page');
  assert.equal(cached?.html, '<html>archived</html>');

  t.after(async () => {
    await rm(path.join(paths.rawDir, TEST_CONNECTOR), { recursive: true, force: true });
  });
});
