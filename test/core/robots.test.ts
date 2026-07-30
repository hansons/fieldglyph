import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RobotsGate } from '../../src/core/robots.ts';
import { createLogger } from '../../src/core/logger.ts';

const silentLogger = createLogger('error');

test('RobotsGate disallows paths blocked in robots.txt', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('User-agent: *\nDisallow: /forum/\n', { status: 200 }),
  );

  const gate = new RobotsGate(silentLogger);
  assert.equal(await gate.isAllowed('https://example.test/forum/thread1'), false);
  assert.equal(await gate.isAllowed('https://example.test/formations/2020a.html'), true);
});

test('RobotsGate allows everything when robots.txt fetch fails', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('network unreachable');
  });

  const gate = new RobotsGate(silentLogger);
  assert.equal(await gate.isAllowed('https://example.test/anything'), true);
});

test('RobotsGate allows everything when robots.txt is a 404', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }));

  const gate = new RobotsGate(silentLogger);
  assert.equal(await gate.isAllowed('https://example.test/anything'), true);
});

test('RobotsGate caches robots.txt per origin (fetched once)', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return new Response('User-agent: *\nDisallow: /private/\n', { status: 200 });
  });

  const gate = new RobotsGate(silentLogger);
  await gate.isAllowed('https://example.test/a');
  await gate.isAllowed('https://example.test/b');
  await gate.isAllowed('https://example.test/private/c');
  assert.equal(calls, 1);
});
