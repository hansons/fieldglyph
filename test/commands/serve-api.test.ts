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

test('POST /api/symbol-review validates, and accepts/rejects with notes', async () => {
  const bad = await fetch(`${BASE}/api/symbol-review`, {
    method: 'POST',
    body: JSON.stringify({ symbolId: 'x', verdict: 'maybe', reviewerName: 'alice' }),
  });
  assert.equal(bad.status, 400);

  const missingReviewer = await fetch(`${BASE}/api/symbol-review`, {
    method: 'POST',
    body: JSON.stringify({ symbolId, verdict: 'acceptable' }),
  });
  assert.equal(missingReviewer.status, 400);

  const missing = await fetch(`${BASE}/api/symbol-review`, {
    method: 'POST',
    body: JSON.stringify({ symbolId: 99999999, verdict: 'acceptable', reviewerName: 'alice' }),
  });
  assert.equal(missing.status, 404);

  const enhanceWithoutNotes = await fetch(`${BASE}/api/symbol-review`, {
    method: 'POST',
    body: JSON.stringify({ symbolId, verdict: 'enhancement_proposed', reviewerName: 'alice' }),
  });
  assert.equal(enhanceWithoutNotes.status, 400);

  const ok = await fetch(`${BASE}/api/symbol-review`, {
    method: 'POST',
    body: JSON.stringify({ symbolId, verdict: 'unacceptable', reviewerName: 'alice', notes: 'test rejection' }),
  });
  assert.equal(ok.status, 200);

  const unacceptable = await fetch(`${BASE}/api/symbols?status=unacceptable`);
  const body = (await unacceptable.json()) as {
    symbols: Array<{ symbolId: number; reviewNotes: string; reviewedBy: string }>;
  };
  const mine = body.symbols.find((s) => s.symbolId === symbolId);
  assert.equal(mine?.reviewNotes, 'test rejection');
  assert.equal(mine?.reviewedBy, 'alice');
});

test('POST /api/symbol-replace: submitter cannot validate their own replacement, a different reviewer can', async () => {
  const replace = await fetch(`${BASE}/api/symbol-replace`, {
    method: 'POST',
    body: JSON.stringify({
      symbolId,
      reviewerName: 'alice',
      svg: '<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>',
    }),
  });
  assert.equal(replace.status, 200);
  const { newSymbolId } = (await replace.json()) as { newSymbolId: number };
  assert.ok(newSymbolId);

  const original = await fetch(`${BASE}/api/symbols?status=unacceptable`);
  const originalBody = (await original.json()) as { symbols: Array<{ symbolId: number }> };
  assert.ok(originalBody.symbols.some((s) => s.symbolId === symbolId), 'original superseded, now unacceptable');

  const pending = await fetch(`${BASE}/api/symbols?status=pending`);
  const pendingBody = (await pending.json()) as {
    symbols: Array<{ symbolId: number; source: string; submittedBy: string; replacesSymbolId: number }>;
  };
  const replacement = pendingBody.symbols.find((s) => s.symbolId === newSymbolId);
  assert.ok(replacement, 'replacement is pending');
  assert.equal(replacement?.source, 'human_replacement');
  assert.equal(replacement?.submittedBy, 'alice');
  assert.equal(replacement?.replacesSymbolId, symbolId);

  const selfValidate = await fetch(`${BASE}/api/symbol-review`, {
    method: 'POST',
    body: JSON.stringify({ symbolId: newSymbolId, verdict: 'acceptable', reviewerName: 'alice' }),
  });
  assert.equal(selfValidate.status, 403);

  const selfValidateCaseVariant = await fetch(`${BASE}/api/symbol-review`, {
    method: 'POST',
    body: JSON.stringify({ symbolId: newSymbolId, verdict: 'acceptable', reviewerName: 'ALICE' }),
  });
  assert.equal(selfValidateCaseVariant.status, 403);

  const otherValidate = await fetch(`${BASE}/api/symbol-review`, {
    method: 'POST',
    body: JSON.stringify({ symbolId: newSymbolId, verdict: 'acceptable', reviewerName: 'bob' }),
  });
  assert.equal(otherValidate.status, 200);

  const acceptable = await fetch(`${BASE}/api/symbols?status=acceptable`);
  const acceptableBody = (await acceptable.json()) as { symbols: Array<{ symbolId: number }> };
  assert.ok(acceptableBody.symbols.some((s) => s.symbolId === newSymbolId));
});
