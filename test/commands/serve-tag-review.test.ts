import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { runServe } from '../../src/commands/serve.ts';
import { openDb, runMigrations } from '../../src/db/client.ts';
import { Repository } from '../../src/db/repository.ts';

// Same pattern as serve-api.test.ts: exercises the live serve process against the
// real project DB, read-mostly, cleaning up the rows this file creates.

const PORT = 8978;
const BASE = `http://127.0.0.1:${PORT}`;
let formationId: number;
let formationUid: string;
let server: ReturnType<typeof runServe>;

before(() => {
  const db = openDb();
  runMigrations(db);
  const row = db
    .prepare('SELECT id, uid FROM formation_reports ORDER BY id LIMIT 1')
    .get() as { id: number; uid: string } | undefined;
  if (!row) throw new Error('test requires a populated archive DB');
  formationId = row.id;
  formationUid = row.uid;
  db.close();
  server = runServe({ port: PORT });
});

after(() => {
  const db = openDb();
  new Repository(db).deleteTagProposalsForFormation(formationId);
  db.close();
  server.close();
  server.closeAllConnections();
});

test('POST /api/tag-propose validates and inserts', async () => {
  const missingFields = await fetch(`${BASE}/api/tag-propose`, {
    method: 'POST',
    body: JSON.stringify({ tags: ['circle'] }),
  });
  assert.equal(missingFields.status, 400);

  const badTag = await fetch(`${BASE}/api/tag-propose`, {
    method: 'POST',
    body: JSON.stringify({
      formationUid: formationUid.slice(0, 12),
      tags: ['not-a-real-tag'],
      reviewerName: 'alice',
    }),
  });
  assert.equal(badTag.status, 400);

  const notFound = await fetch(`${BASE}/api/tag-propose`, {
    method: 'POST',
    body: JSON.stringify({ formationUid: 'ffffffffffff', tags: ['circle'], reviewerName: 'alice' }),
  });
  assert.equal(notFound.status, 404);

  const emptyTags = await fetch(`${BASE}/api/tag-propose`, {
    method: 'POST',
    body: JSON.stringify({
      formationUid: formationUid.slice(0, 12),
      tags: [],
      reviewerName: 'alice',
      rationale: 'the auto-deriver was wrong, this formation has no discernible shape',
    }),
  });
  assert.equal(emptyTags.status, 200);
  const { proposalId } = (await emptyTags.json()) as { proposalId: number };
  assert.ok(proposalId);

  const listed = await fetch(`${BASE}/api/tag-proposals?formationUid=${formationUid.slice(0, 12)}`);
  const listedBody = (await listed.json()) as { proposals: Array<{ proposalId: number; submittedBy: string }> };
  const mine = listedBody.proposals.find((p) => p.proposalId === proposalId);
  assert.ok(mine);
  assert.equal(mine?.submittedBy, 'alice');
});

test('GET /api/tag-proposals?formationUid=<unknown> 404s', async () => {
  const res = await fetch(`${BASE}/api/tag-proposals?formationUid=ffffffffffff`);
  assert.equal(res.status, 404);
});

test('POST /api/tag-review: submitter cannot self-validate, a different reviewer can', async () => {
  const proposeRes = await fetch(`${BASE}/api/tag-propose`, {
    method: 'POST',
    body: JSON.stringify({
      formationUid: formationUid.slice(0, 12),
      tags: ['circle', 'ring'],
      reviewerName: 'carol',
    }),
  });
  const { proposalId } = (await proposeRes.json()) as { proposalId: number };

  const selfValidate = await fetch(`${BASE}/api/tag-review`, {
    method: 'POST',
    body: JSON.stringify({ proposalId, verdict: 'acceptable', reviewerName: 'carol' }),
  });
  assert.equal(selfValidate.status, 403);

  const missingNotes = await fetch(`${BASE}/api/tag-review`, {
    method: 'POST',
    body: JSON.stringify({ proposalId, verdict: 'enhancement_proposed', reviewerName: 'dave' }),
  });
  assert.equal(missingNotes.status, 400);

  const otherValidate = await fetch(`${BASE}/api/tag-review`, {
    method: 'POST',
    body: JSON.stringify({ proposalId, verdict: 'acceptable', reviewerName: 'dave' }),
  });
  assert.equal(otherValidate.status, 200);

  const notFound = await fetch(`${BASE}/api/tag-review`, {
    method: 'POST',
    body: JSON.stringify({ proposalId: 99999999, verdict: 'acceptable', reviewerName: 'dave' }),
  });
  assert.equal(notFound.status, 404);
});

test('POST /api/tag-replace: chains a rejected proposal to a new one, enforcing submitter != validator at each hop', async () => {
  const proposeRes = await fetch(`${BASE}/api/tag-propose`, {
    method: 'POST',
    body: JSON.stringify({
      formationUid: formationUid.slice(0, 12),
      tags: ['circle'],
      reviewerName: 'A',
    }),
  });
  const { proposalId: proposalA } = (await proposeRes.json()) as { proposalId: number };

  const rejectRes = await fetch(`${BASE}/api/tag-review`, {
    method: 'POST',
    body: JSON.stringify({ proposalId: proposalA, verdict: 'unacceptable', reviewerName: 'B', notes: 'wrong shape' }),
  });
  assert.equal(rejectRes.status, 200);

  const badReplace = await fetch(`${BASE}/api/tag-replace`, {
    method: 'POST',
    body: JSON.stringify({ proposalId: proposalA, reviewerName: 'B', tags: ['not-a-real-tag'] }),
  });
  assert.equal(badReplace.status, 400);

  const replaceRes = await fetch(`${BASE}/api/tag-replace`, {
    method: 'POST',
    body: JSON.stringify({ proposalId: proposalA, reviewerName: 'B', tags: ['ring'], rationale: 'looked closer, it is a ring' }),
  });
  assert.equal(replaceRes.status, 200);
  const { newProposalId } = (await replaceRes.json()) as { newProposalId: number };

  // B submitted the replacement — B cannot validate it either.
  const bSelfValidate = await fetch(`${BASE}/api/tag-review`, {
    method: 'POST',
    body: JSON.stringify({ proposalId: newProposalId, verdict: 'acceptable', reviewerName: 'B' }),
  });
  assert.equal(bSelfValidate.status, 403);

  const cValidate = await fetch(`${BASE}/api/tag-review`, {
    method: 'POST',
    body: JSON.stringify({ proposalId: newProposalId, verdict: 'acceptable', reviewerName: 'C' }),
  });
  assert.equal(cValidate.status, 200);

  const listed = await fetch(`${BASE}/api/tag-proposals?formationUid=${formationUid.slice(0, 12)}`);
  const listedBody = (await listed.json()) as {
    proposals: Array<{ proposalId: number; replacesProposalId: number | null; status: string }>;
  };
  const replacement = listedBody.proposals.find((p) => p.proposalId === newProposalId);
  assert.equal(replacement?.replacesProposalId, proposalA);
  assert.equal(replacement?.status, 'acceptable');
});
