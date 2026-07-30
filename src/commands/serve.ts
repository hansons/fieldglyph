import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../core/logger.ts';
import { openDb, runMigrations } from '../db/client.ts';
import { Repository } from '../db/repository.ts';

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

async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/api/symbols') {
    const status = url.searchParams.get('status') ?? 'pending';
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      sendJson(res, 400, { error: 'invalid status' });
      return;
    }
    const rows = getRepo()
      .listSymbols(status)
      .map((r) => ({
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
      }));
    sendJson(res, 200, { symbols: rows });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/review') {
    let body: { symbolId?: number; action?: string; notes?: string };
    try {
      body = (await readJsonBody(req)) as typeof body;
    } catch {
      sendJson(res, 400, { error: 'invalid JSON body' });
      return;
    }
    if (
      typeof body.symbolId !== 'number' ||
      (body.action !== 'approve' && body.action !== 'reject')
    ) {
      sendJson(res, 400, { error: 'expected {symbolId: number, action: approve|reject, notes?}' });
      return;
    }
    const ok = getRepo().setSymbolStatus(
      body.symbolId,
      body.action === 'approve' ? 'approved' : 'rejected',
      body.notes,
    );
    if (!ok) {
      sendJson(res, 404, { error: 'symbol not found' });
      return;
    }
    sendJson(res, 200, { ok: true });
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
