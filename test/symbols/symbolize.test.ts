import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Repository } from '../../src/db/repository.ts';
import { symbolizeCore } from '../../src/commands/symbolize.ts';
import { createLogger } from '../../src/core/logger.ts';
import { buildUserText } from '../../src/symbols/describe.ts';
import type { DescribeFn } from '../../src/symbols/describe.ts';
import type { SymbolSpec } from '../../src/symbols/spec.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, '..', '..', 'src', 'db', 'migrations');
const silentLogger = createLogger('error');

function makeDb(): { db: InstanceType<typeof Database>; repo: Repository } {
  const db = new Database(':memory:');
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(path.join(migrationsDir, file), 'utf-8'));
  }
  const repo = new Repository(db);
  return { db, repo };
}

function seedFormation(
  db: InstanceType<typeof Database>,
  opts: { uid: string; source: string; country?: string; media?: Array<{ url: string; kind: string; aerial?: boolean }> },
): number {
  const src = db
    .prepare(
      `INSERT INTO sources (key, name, base_url, status) VALUES (?, ?, 'https://x', 'active')
       ON CONFLICT(key) DO UPDATE SET name=excluded.name RETURNING id`,
    )
    .get(opts.source, opts.source) as { id: number };
  const f = db
    .prepare(
      `INSERT INTO formation_reports
         (uid, source_id, source_url, fetch_mode, retrieved_at, raw_cache_path, parser_version,
          title, country, verification_status, created_at, updated_at)
       VALUES (?, ?, 'https://x/f', 'live', 'now', '/x', '1', 'Test formation', ?, 'reported', 'now', 'now')
       RETURNING id`,
    )
    .get(opts.uid, src.id, opts.country ?? 'United Kingdom') as { id: number };
  for (const m of opts.media ?? []) {
    db.prepare(
      `INSERT INTO formation_media (formation_report_id, url, kind, is_aerial) VALUES (?, ?, ?, ?)`,
    ).run(f.id, m.url, m.kind, m.aerial ? 1 : 0);
  }
  return f.id;
}

const SPEC: SymbolSpec = {
  elements: [{ type: 'circle', cx: 50, cy: 50, r: 30, fill: 'flattened' }],
  symmetry: { type: 'radial', order: 1 },
  confidence: 'high',
  notes: '',
};

test('getSymbolCandidates: prefers diagrams, skips ircup and already-symbolized formations', () => {
  const { db, repo } = makeDb();
  seedFormation(db, {
    uid: 'a'.repeat(40),
    source: 'ccc',
    media: [
      { url: 'https://x/photo.jpg', kind: 'photo', aerial: true },
      { url: 'https://x/diagram.jpg', kind: 'diagram' },
    ],
  });
  seedFormation(db, { uid: 'b'.repeat(40), source: 'ircup', media: [{ url: 'https://x/p2.jpg', kind: 'photo' }] });
  seedFormation(db, { uid: 'c'.repeat(40), source: 'ccc', media: [] }); // no image

  const candidates = repo.getSymbolCandidates(10);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.image_url, 'https://x/diagram.jpg');
  assert.equal(candidates[0]?.image_kind, 'diagram');

  // Once a symbol exists, the formation drops out (idempotency).
  repo.insertSymbol({
    formationReportId: candidates[0]!.formation_id,
    sourceImageUrl: 'https://x/diagram.jpg',
    model: 'test',
    specJson: JSON.stringify(SPEC),
    svg: '<svg/>',
    confidence: 'high',
  });
  assert.equal(repo.getSymbolCandidates(10).length, 0);
});

test('symbolizeCore: stores pending symbol via injected describeFn, no network to the API', async (t) => {
  const { db, repo } = makeDb();
  seedFormation(db, {
    uid: 'd'.repeat(40),
    source: 'ccc',
    media: [{ url: 'https://images.test/f1.jpg', kind: 'photo', aerial: true }],
  });

  // Fake the image fetch (rateLimitedFetch uses global fetch).
  t.mock.method(globalThis, 'fetch', async () =>
    new Response(Uint8Array.from([255, 216, 255]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    }),
  );

  const calls: string[] = [];
  const fakeDescribe: DescribeFn = async (b64, mediaType, ctx) => {
    calls.push(mediaType);
    assert.ok(b64.length > 0);
    assert.equal(ctx.imageKind, 'photo');
    return { spec: SPEC, refused: false, usage: { inputTokens: 100, outputTokens: 50 } };
  };

  const stats = await symbolizeCore(repo, fakeDescribe, silentLogger, { limit: 10, model: 'test' });
  assert.equal(stats.succeeded, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0], 'image/jpeg');

  const pending = repo.listSymbols('pending');
  assert.equal(pending.length, 1);
  assert.ok((pending[0]!.svg as string).includes('<svg'));
});

test('symbolizeCore: refusals and bad images are counted, not stored', async (t) => {
  const { db, repo } = makeDb();
  seedFormation(db, { uid: 'e'.repeat(40), source: 'ccc', media: [{ url: 'https://images.test/f2.jpg', kind: 'photo' }] });
  seedFormation(db, { uid: 'f'.repeat(40), source: 'ccc', media: [{ url: 'https://images.test/f3.tiff', kind: 'photo' }] });

  t.mock.method(globalThis, 'fetch', async () =>
    new Response(Uint8Array.from([0]), { status: 200, headers: { 'content-type': 'application/octet-stream' } }),
  );

  const fakeDescribe: DescribeFn = async () => ({
    spec: null,
    refused: true,
    usage: { inputTokens: 10, outputTokens: 0 },
  });

  const stats = await symbolizeCore(repo, fakeDescribe, silentLogger, { limit: 10, model: 'test' });
  // f2.jpg: fetched, media type from extension -> describe -> refused.
  // f3.tiff: octet-stream + unknown extension -> skipped.
  assert.equal(stats.refused, 1);
  assert.equal(stats.skippedImage, 1);
  assert.equal(repo.listSymbols('pending').length, 0);
});

test('setSymbolStatus: approve/reject round-trip with notes', () => {
  const { db, repo } = makeDb();
  const fid = seedFormation(db, { uid: 'g'.repeat(40), source: 'ccc', media: [{ url: 'https://x/p.jpg', kind: 'photo' }] });
  const symbolId = repo.insertSymbol({
    formationReportId: fid,
    sourceImageUrl: 'https://x/p.jpg',
    model: 'test',
    specJson: JSON.stringify(SPEC),
    svg: '<svg/>',
    confidence: 'medium',
  });

  assert.equal(repo.setSymbolStatus(symbolId, 'rejected', 'missed the outer ring'), true);
  const rejected = repo.listSymbols('rejected');
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0]!.review_notes, 'missed the outer ring');
  assert.ok(rejected[0]!.reviewed_at);

  assert.equal(repo.setSymbolStatus(99999, 'approved'), false);

  // Approved symbols surface for export keyed by uid.
  repo.setSymbolStatus(symbolId, 'approved');
  const approved = repo.listApprovedSymbolsByUid();
  assert.equal(approved.get('g'.repeat(40))?.svg, '<svg/>');
});

test('buildUserText: includes context and flags diagrams', () => {
  const text = buildUserText({
    title: 'Milk Hill 2001',
    description: 'A 409-circle fractal',
    tags: ['fractal', 'circle'],
    imageKind: 'diagram',
  });
  assert.ok(text.includes('researcher-drawn diagram'));
  assert.ok(text.includes('Milk Hill 2001'));
  assert.ok(text.includes('fractal, circle'));
});
