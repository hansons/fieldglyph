import { userAgent, rateLimitMsForHost, retryConfig } from '../config.ts';
import type { Logger } from './logger.ts';

export interface RawFetchResult {
  status: number;
  body: string;
  finalUrl: string;
  contentType?: string;
}

export class HttpError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

class HostQueue {
  private tail: Promise<void> = Promise.resolve();
  private readonly minIntervalMs: number;

  constructor(minIntervalMs: number) {
    this.minIntervalMs = minIntervalMs;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    let release: () => void = () => {};
    const prev = this.tail;
    this.tail = new Promise((resolve) => {
      release = resolve;
    });
    await prev;
    try {
      return await fn();
    } finally {
      setTimeout(release, this.minIntervalMs);
    }
  }
}

const queues = new Map<string, HostQueue>();

function queueForHost(host: string): HostQueue {
  let q = queues.get(host);
  if (!q) {
    q = new HostQueue(rateLimitMsForHost(host));
    queues.set(host, q);
  }
  return q;
}

function isTransient(status: number | undefined): boolean {
  if (status === undefined) return true; // network error / timeout
  if (status === 429) return true;
  if (status >= 500 && status < 600) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Decode a response body honoring its declared charset. Many of the archive's
 * target sites are 1990s/2000s vintage and serve ISO-8859-1 — decoding those as
 * UTF-8 permanently mangles accented characters into the cached copies.
 */
function decodeBody(buf: Uint8Array, contentType: string): string {
  let charset = /charset=([^;]+)/i.exec(contentType)?.[1]?.trim().toLowerCase();
  if (!charset) {
    const head = new TextDecoder('latin1').decode(buf.slice(0, 2048));
    charset = /charset=["']?\s*([\w-]+)/i.exec(head)?.[1]?.toLowerCase();
  }
  if (charset) {
    try {
      return new TextDecoder(charset).decode(buf);
    } catch {
      /* unknown label — fall through to sniffing */
    }
  }
  // No usable declaration: decode as strict UTF-8, and on any invalid sequence
  // fall back to windows-1252 — the HTML5 legacy default, and what the many
  // FrontPage-era pages in this archive actually are.
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

async function doFetch(url: string, timeoutMs: number, binary: boolean): Promise<RawFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': userAgent },
      redirect: 'follow',
      signal: controller.signal,
    });
    const contentType = res.headers.get('content-type') ?? '';
    const buf = new Uint8Array(await res.arrayBuffer());
    // binary: body is base64 (for images etc.); otherwise charset-aware text.
    const body = binary ? Buffer.from(buf).toString('base64') : decodeBody(buf, contentType);
    return { status: res.status, body, finalUrl: res.url || url, contentType };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Single low-level network primitive: per-host rate limiting + retry/backoff
 * on transient failures only. A 404 is real data (page is gone), never retried.
 */
export async function rateLimitedFetch(
  url: string,
  logger: Logger,
  opts: { timeoutMs?: number; binary?: boolean } = {},
): Promise<RawFetchResult> {
  const host = new URL(url).host;
  const queue = queueForHost(host);
  const timeoutMs = opts.timeoutMs ?? 20_000;

  return queue.run(async () => {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      try {
        const result = await doFetch(url, timeoutMs, opts.binary === true);
        if (result.status === 404 || !isTransient(result.status) || result.status < 400) {
          return result;
        }
        lastErr = new HttpError(`HTTP ${result.status} for ${url}`, result.status);
      } catch (err) {
        lastErr = err;
      }

      if (attempt < retryConfig.maxAttempts) {
        const backoff = Math.min(
          retryConfig.baseDelayMs * 2 ** (attempt - 1),
          retryConfig.maxDelayMs,
        );
        const jitter = Math.random() * backoff * 0.3;
        logger.warn(`Transient failure fetching ${url}, retrying`, { attempt, backoff });
        await sleep(backoff + jitter);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  });
}
