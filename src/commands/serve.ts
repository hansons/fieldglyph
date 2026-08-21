import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../core/logger.ts';
import { openDb, runMigrations } from '../db/client.ts';
import { Repository } from '../db/repository.ts';
import { TAG_VOCABULARY } from '../enrich/tagVocabulary.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..', '..', 'web');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

/** Resolve a request path inside webRoot, or null if it escapes (traversal). */
export function resolveWebPath(urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const resolved = path.resolve(webRoot, relative);
  if (resolved !== webRoot && !resolved.startsWith(webRoot + path.sep)) return null;
  return resolved;
}

// ---- local curation API ----------------------------------------------------
// Only alive while `serve` runs locally; the static web/ directory stays
// publishable anywhere (the Review view detects the API's absence).

let repo: Repository | null = null;

function getRepo(): Repository {
  if (!repo) {
    const db = openDb();
    runMigrations(db);
    repo = new Repository(db);
  }
  return repo;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 64 * 1024) throw new Error('body too large');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
}

const STATUSES = ['pending', 'acceptable', 'unacceptable', 'enhancement_proposed'] as const;
const VERDICTS = ['acceptable', 'unacceptable', 'enhancement_proposed'] as const;
const VALID_TAG_IDS = new Set(TAG_VOCABULARY.map((t) => t.id));

function conflictsWithSubmitter(submittedBy: string | null | undefined, reviewerName: string): boolean {
  return !!submittedBy && submittedBy.trim().toLowerCase() === reviewerName.trim().toLowerCase();
}

function isValidReviewerName(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isValidVerdict(v: unknown): v is (typeof VERDICTS)[number] {
  return typeof v === 'string' && (VERDICTS as readonly string[]).includes(v);
}

function isValidTagArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((t) => typeof t === 'string' && VALID_TAG_IDS.has(t));
}

function symbolResponseRow(r: Record<string, unknown>) {
  return {
    symbolId: r.id,
    formationId: (r.formation_uid as string).slice(0, 12),
    title: r.title,
    date: r.discovered_date,
    datePrecision: r.discovered_date_precision,
    place: [r.location_name, r.admin_region, r.country].filter(Boolean).join(', '),
    tags: r.formation_type_tags ? JSON.parse(r.formation_type_tags as string) : [],
    photoUrl: r.source_image_url,
    svg: r.svg,
    confidence: r.confidence,
    modelNotes: r.spec_json ? (JSON.parse(r.spec_json as string).notes ?? '') : '',
    reviewNotes: r.review_notes,
    source: r.source,
    submittedBy: r.submitted_by,
    reviewedBy: r.reviewed_by,
    replacesSymbolId: r.replaces_symbol_id,
  };
}

function tagProposalResponseRow(r: Record<string, unknown>) {
  return {
    proposalId: r.id,
    formationId: (r.formation_uid as string).slice(0, 12),
    title: r.title,
    date: r.discovered_date,
    datePrecision: r.discovered_date_precision,
    place: [r.location_name, r.admin_region, r.country].filter(Boolean).join(', '),
    currentTags: r.formation_type_tags ? JSON.parse(r.formation_type_tags as string) : [],
    proposedTags: JSON.parse(r.proposed_tags as string),
    rationale: r.rationale,
    status: r.status,
    submittedBy: r.submitted_by,
    reviewedBy: r.reviewed_by,
    reviewNotes: r.review_notes,
    replacesProposalId: r.replaces_proposal_id,
  };
}

async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/api/symbols') {
    const status = url.searchParams.get('status') ?? 'pending';
    if (!(STATUSES as readonly string[]).includes(status)) {
      sendJson(res, 400, { error: 'invalid status' });
      return;
    }
    const rows = getRepo().listSymbols(status).map(symbolResponseRow);
    sendJson(res, 200, { symbols: rows });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/symbol-review') {
    let body: { symbolId?: number; verdict?: string; reviewerName?: string; notes?: string };
    try {
      body = (await readJsonBody(req)) as typeof body;
    } catch {
      sendJson(res, 400, { error: 'invalid JSON body' });
      return;
    }
    if (
      typeof body.symbolId !== 'number' ||
      !isValidVerdict(body.verdict) ||
      !isValidReviewerName(body.reviewerName)
    ) {
      sendJson(res, 400, {
        error: 'expected {symbolId: number, verdict: acceptable|unacceptable|enhancement_proposed, reviewerName: string, notes?}',
      });
      return;
    }
    if (body.verdict === 'enhancement_proposed' && !body.notes?.trim()) {
      sendJson(res, 400, { error: 'notes are required for an enhancement_proposed verdict' });
      return;
    }
    const symbol = getRepo().getSymbolForReview(body.symbolId);
    if (!symbol) {
      sendJson(res, 404, { error: 'symbol not found' });
      return;
    }
    if (conflictsWithSubmitter(symbol.submitted_by, body.reviewerName)) {
      sendJson(res, 403, {
        error: 'the submitter of this item cannot also validate it',
        submittedBy: symbol.submitted_by,
      });
      return;
    }
    getRepo().setSymbolVerdict(body.symbolId, body.verdict, body.reviewerName, body.notes);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/symbol-replace') {
    let body: { symbolId?: number; reviewerName?: string; svg?: string; notes?: string };
    try {
      body = (await readJsonBody(req)) as typeof body;
    } catch {
      sendJson(res, 400, { error: 'invalid JSON body' });
      return;
    }
    if (
      typeof body.symbolId !== 'number' ||
      !isValidReviewerName(body.reviewerName) ||
      typeof body.svg !== 'string' ||
      !body.svg.includes('<svg') ||
      !body.svg.includes('</svg>')
    ) {
      sendJson(res, 400, {
        error: 'expected {symbolId: number, reviewerName: string, svg: string (a well-formed <svg>...</svg>), notes?}',
      });
      return;
    }
    const original = getRepo().getSymbolForReview(body.symbolId);
    if (!original) {
      sendJson(res, 404, { error: 'symbol not found' });
      return;
    }
    if (conflictsWithSubmitter(original.submitted_by, body.reviewerName)) {
      sendJson(res, 403, {
        error: 'the submitter of this item cannot also validate it',
        submittedBy: original.submitted_by,
      });
      return;
    }
    getRepo().setSymbolVerdict(
      body.symbolId,
      'unacceptable',
      body.reviewerName,
      body.notes ?? 'superseded by replacement',
    );
    const newSymbolId = getRepo().insertSymbol({
      formationReportId: original.formation_report_id,
      sourceImageUrl: original.source_image_url,
      model: 'human',
      specJson: JSON.stringify({
        elements: [],
        symmetry: { type: 'unknown', order: 1 },
        confidence: 'n/a',
        notes: 'human-submitted replacement',
      }),
      svg: body.svg,
      confidence: null,
      source: 'human_replacement',
      submittedBy: body.reviewerName,
      replacesSymbolId: body.symbolId,
    });
    sendJson(res, 200, { ok: true, newSymbolId });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/tag-proposals') {
    const formationUid = url.searchParams.get('formationUid');
    if (formationUid) {
      const formationId = getRepo().getFormationIdByUidPrefix(formationUid);
      if (formationId === undefined) {
        sendJson(res, 404, { error: 'formation not found' });
        return;
      }
      const rows = getRepo().listTagProposalsForFormation(formationId).map(tagProposalResponseRow);
      sendJson(res, 200, { proposals: rows });
      return;
    }
    const status = url.searchParams.get('status') ?? 'pending';
    if (!(STATUSES as readonly string[]).includes(status)) {
      sendJson(res, 400, { error: 'invalid status' });
      return;
    }
    const rows = getRepo().listTagProposals(status).map(tagProposalResponseRow);
    sendJson(res, 200, { proposals: rows });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/tag-propose') {
    let body: { formationUid?: string; tags?: unknown; rationale?: string; reviewerName?: string };
    try {
      body = (await readJsonBody(req)) as typeof body;
    } catch {
      sendJson(res, 400, { error: 'invalid JSON body' });
      return;
    }
    if (
      typeof body.formationUid !== 'string' ||
      !body.formationUid.trim() ||
      !isValidTagArray(body.tags) ||
      !isValidReviewerName(body.reviewerName)
    ) {
      sendJson(res, 400, {
        error: 'expected {formationUid: string, tags: string[] (valid tag ids), reviewerName: string, rationale?}',
      });
      return;
    }
    const formationId = getRepo().getFormationIdByUidPrefix(body.formationUid);
    if (formationId === undefined) {
      sendJson(res, 404, { error: 'formation not found' });
      return;
    }
    const proposalId = getRepo().insertTagProposal({
      formationReportId: formationId,
      proposedTags: body.tags,
      rationale: body.rationale,
      submittedBy: body.reviewerName,
    });
    sendJson(res, 200, { ok: true, proposalId });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/tag-review') {
    let body: { proposalId?: number; verdict?: string; reviewerName?: string; notes?: string };
    try {
      body = (await readJsonBody(req)) as typeof body;
    } catch {
      sendJson(res, 400, { error: 'invalid JSON body' });
      return;
    }
    if (
      typeof body.proposalId !== 'number' ||
      !isValidVerdict(body.verdict) ||
      !isValidReviewerName(body.reviewerName)
    ) {
      sendJson(res, 400, {
        error: 'expected {proposalId: number, verdict: acceptable|unacceptable|enhancement_proposed, reviewerName: string, notes?}',
      });
      return;
    }
    if (body.verdict === 'enhancement_proposed' && !body.notes?.trim()) {
      sendJson(res, 400, { error: 'notes are required for an enhancement_proposed verdict' });
      return;
    }
    const proposal = getRepo().getTagProposal(body.proposalId);
    if (!proposal) {
      sendJson(res, 404, { error: 'proposal not found' });
      return;
    }
    if (conflictsWithSubmitter(proposal.submitted_by as string, body.reviewerName)) {
      sendJson(res, 403, {
        error: 'the submitter of this item cannot also validate it',
        submittedBy: proposal.submitted_by,
      });
      return;
    }
    getRepo().setTagProposalVerdict(body.proposalId, body.verdict, body.reviewerName, body.notes);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/tag-replace') {
    let body: { proposalId?: number; reviewerName?: string; tags?: unknown; rationale?: string; notes?: string };
    try {
      body = (await readJsonBody(req)) as typeof body;
    } catch {
      sendJson(res, 400, { error: 'invalid JSON body' });
      return;
    }
    if (
      typeof body.proposalId !== 'number' ||
      !isValidReviewerName(body.reviewerName) ||
      !isValidTagArray(body.tags)
    ) {
      sendJson(res, 400, {
        error: 'expected {proposalId: number, reviewerName: string, tags: string[] (valid tag ids), rationale?, notes?}',
      });
      return;
    }
    const original = getRepo().getTagProposal(body.proposalId);
    if (!original) {
      sendJson(res, 404, { error: 'proposal not found' });
      return;
    }
    if (conflictsWithSubmitter(original.submitted_by as string, body.reviewerName)) {
      sendJson(res, 403, {
        error: 'the submitter of this item cannot also validate it',
        submittedBy: original.submitted_by,
      });
      return;
    }
    getRepo().setTagProposalVerdict(
      body.proposalId,
      'unacceptable',
      body.reviewerName,
      body.notes ?? 'superseded by replacement',
    );
    const newProposalId = getRepo().insertTagProposal({
      formationReportId: original.formation_report_id as number,
      proposedTags: body.tags,
      rationale: body.rationale,
      submittedBy: body.reviewerName,
      replacesProposalId: body.proposalId,
    });
    sendJson(res, 200, { ok: true, newProposalId });
    return;
  }

  sendJson(res, 404, { error: 'unknown API route' });
}

export function runServe(
  opts: { port?: number; host?: string } = {},
): ReturnType<typeof createServer> {
  const logger = createLogger();
  const port = opts.port ?? 8787;
  const host = opts.host ?? '127.0.0.1';

  const server = createServer((req, res) => {
    if ((req.url ?? '').startsWith('/api/')) {
      handleApi(req, res).catch((err) => {
        logger.error('API error', { error: String(err) });
        sendJson(res, 500, { error: 'internal error' });
      });
      return;
    }

    const target = resolveWebPath(req.url ?? '/');
    if (!target) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    let stat;
    try {
      stat = statSync(target);
      if (stat.isDirectory()) {
        stat = statSync(path.join(target, 'index.html'));
      }
    } catch {
      res.writeHead(404).end('Not found');
      return;
    }

    const file = stat.isDirectory() ? path.join(target, 'index.html') : target;
    const lastModified = stat.mtime.toUTCString();
    if (req.headers['if-modified-since'] === lastModified) {
      res.writeHead(304).end();
      return;
    }

    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Content-Length': stat.size,
      'Last-Modified': lastModified,
      'Cache-Control': 'no-cache',
    });
    createReadStream(file).pipe(res);
    logger.debug(`${req.method} ${req.url}`);
  });

  server.listen(port, host, () => {
    logger.info(`Formation explorer at http://${host}:${port}`);
  });
  return server;
}
