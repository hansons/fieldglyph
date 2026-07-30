import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { runServe } from '../../src/commands/serve.ts';
import { openDb, runMigrations } from '../../src/db/client.ts';
import { Repository } from '../../src/db/repository.ts';

// These tests exercise the live serve process against the real project DB —
// read-mostly, and the one write (a review verdict) targets a symbol we insert
// and clean up ourselves.

const PORT = 8977;
const BASE = `http://127.0.0.1:${PORT}`;
let symbolId: number;
let formationId: number;
let server: ReturnType<typeof runServe>;

before(() => {
  const db = openDb();
  runMigrations(db);
  const repo = new Repository(db);
  const row = db
    .prepare('SELECT id FROM formation_reports ORDER BY id LIMIT 1')
    .get() as { id: number } | undefined;
  if (!row) throw new Error('test requires a populated archive DB');
  formationId = row.id;
  symbolId = repo.insertSymbol({
    formationReportId: formationId,
    sourceImageUrl: 'https://example.test/img.jpg',
    model: 'test-model',
    specJson: JSON.stringify({ elements: [], symmetry: { type: 'none', order: 1 }, confidence: 'low', notes: 'test row' }),
    svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
    confidence: 'low',
  });
  db.close();
  server = runServe({ port: PORT });
});

after(() => {
  const db = openDb();
  new Repository(db).deleteSymbolsForFormation(formationId);
  db.close();
  server.close();
  server.closeAllConnections();
});

test('GET /api/symbols?status=pending includes the inserted symbol', async () => {
  const res = await fetch(`${BASE}/api/symbols?status=pending`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { symbols: Array<{ symbolId: number; svg: string }> };
  const mine = body.symbols.find((s) => s.symbolId === symbolId);
  assert.ok(mine, 'inserted symbol listed');
  assert.ok(mine!.svg.includes('<svg'));
});

test('GET /api/symbols rejects bad status', async () => {
  const res = await fetch(`${BASE}/api/symbols?status=nonsense`);
  assert.equal(res.status, 400);
});

test('POST /api/review approves and rejects with validation', async () => {
  const bad = await fetch(`${BASE}/api/review`, {
    method: 'POST',
    body: JSON.stringify({ symbolId: 'x', action: 'maybe' }),
  });
  assert.equal(bad.status, 400);

  const missing = await fetch(`${BASE}/api/review`, {
    method: 'POST',
    body: JSON.stringify({ symbolId: 99999999, action: 'approve' }),
  });
  assert.equal(missing.status, 404);

  const ok = await fetch(`${BASE}/api/review`, {
    method: 'POST',
    body: JSON.stringify({ symbolId, action: 'reject', notes: 'test rejection' }),
  });
  assert.equal(ok.status, 200);

  const rejected = await fetch(`${BASE}/api/symbols?status=rejected`);
  const body = (await rejected.json()) as { symbols: Array<{ symbolId: number; reviewNotes: string }> };
  const mine = body.symbols.find((s) => s.symbolId === symbolId);
  assert.equal(mine?.reviewNotes, 'test rejection');
});
