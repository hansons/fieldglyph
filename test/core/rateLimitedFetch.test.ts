import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimitedFetch, HttpError } from '../../src/core/rateLimitedFetch.ts';
import { createLogger } from '../../src/core/logger.ts';

const silentLogger = createLogger('error');

test('rateLimitedFetch returns body and status on success', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('hello', { status: 200 }));

  const res = await rateLimitedFetch('https://example.test/a', silentLogger);
  assert.equal(res.status, 200);
  assert.equal(res.body, 'hello');
});

test('rateLimitedFetch decodes ISO-8859-1 pages declared via meta tag', async (t) => {
  // "Zürcher" with ü as the single latin-1 byte 0xFC, served with no charset header —
  // the 1990s-vintage pattern that mojibakes to "Z�rcher" under naive UTF-8 decoding.
  const html = '<html><head><meta http-equiv="content-type" content="text/html; charset=iso-8859-1"></head><body>Zürcher</body></html>';
  const bytes = Uint8Array.from([...html].map((ch) => ch.charCodeAt(0)));
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response(bytes, { status: 200, headers: { 'content-type': 'text/html' } }),
  );

  const res = await rateLimitedFetch('https://example.test/latin1', silentLogger);
  assert.ok(res.body.includes('Zürcher'), `expected proper ü, got: ${res.body.slice(-60)}`);
});

test('rateLimitedFetch honors the Content-Type header charset over UTF-8 default', async (t) => {
  const bytes = Uint8Array.from([...'café'].map((ch) => ch.charCodeAt(0)));
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(bytes, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=iso-8859-1' },
      }),
  );

  const res = await rateLimitedFetch('https://example.test/header-charset', silentLogger);
  assert.equal(res.body, 'café');
});

test('rateLimitedFetch falls back to windows-1252 when bytes are not valid UTF-8 and nothing is declared', async (t) => {
  // Crop Circle Connector pages declare no charset anywhere; their ü is a bare
  // 0xFC byte, invalid as UTF-8.
  const html = '<html><head><title>Zürcher Weinland</title></head><body></body></html>';
  const bytes = Uint8Array.from([...html].map((ch) => ch.charCodeAt(0)));
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response(bytes, { status: 200, headers: { 'content-type': 'text/html' } }),
  );

  const res = await rateLimitedFetch('https://example.test/undeclared', silentLogger);
  assert.ok(res.body.includes('Zürcher'), `expected windows-1252 fallback, got: ${res.body.slice(0, 80)}`);
});

test('rateLimitedFetch does not retry a 404', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return new Response('not found', { status: 404 });
  });

  const res = await rateLimitedFetch('https://example.test/missing', silentLogger);
  assert.equal(res.status, 404);
  assert.equal(calls, 1, '404 should not be retried — it is real data, not a transient failure');
});

test('rateLimitedFetch retries a transient 503 and eventually succeeds', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (calls === 1) return new Response('service unavailable', { status: 503 });
    return new Response('ok now', { status: 200 });
  });

  const res = await rateLimitedFetch('https://example.test/flaky', silentLogger);
  assert.equal(res.status, 200);
  assert.equal(res.body, 'ok now');
  assert.equal(calls, 2);
});

test('rateLimitedFetch throws HttpError after exhausting retries on persistent 500', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return new Response('server error', { status: 500 });
  });

  await assert.rejects(
    () => rateLimitedFetch('https://example.test/broken', silentLogger),
    (err: unknown) => err instanceof HttpError && err.status === 500,
  );
  assert.ok(calls >= 4, `expected at least 4 attempts, got ${calls}`);
});
