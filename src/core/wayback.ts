import { rateLimitedFetch } from './rateLimitedFetch.ts';
import type { Logger } from './logger.ts';
import type { RawCache } from './cache.ts';
import type { FetchResult } from './types.ts';

export interface CdxRecord {
  urlkey: string;
  timestamp: string;
  original: string;
  mimetype: string;
  statuscode: string;
  digest: string;
  length: string;
}

export interface CdxQueryOptions {
  url: string;
  matchType?: 'exact' | 'prefix' | 'domain' | 'host';
  from?: string;
  to?: string;
  filter?: string[];
  collapse?: string;
  limit?: number;
}

export class WaybackClient {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async queryCdx(opts: CdxQueryOptions): Promise<CdxRecord[]> {
    const params = new URLSearchParams();
    params.set('url', opts.url);
    params.set('output', 'json');
    if (opts.matchType) params.set('matchType', opts.matchType);
    if (opts.from) params.set('from', opts.from);
    if (opts.to) params.set('to', opts.to);
    if (opts.collapse) params.set('collapse', opts.collapse);
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    for (const f of opts.filter ?? []) params.append('filter', f);

    const cdxUrl = `https://web.archive.org/cdx/search/cdx?${params.toString()}`;
    const res = await rateLimitedFetch(cdxUrl, this.logger, { timeoutMs: 30_000 });
    if (res.status === 404) return [];
    if (res.status !== 200) {
      throw new Error(`CDX query failed with status ${res.status} for ${cdxUrl}`);
    }

    const trimmed = res.body.trim();
    if (!trimmed) return [];
    const rows: string[][] = JSON.parse(trimmed);
    if (rows.length < 2) return []; // just the header row, or nothing

    const header = rows[0]!;
    return rows.slice(1).map((row) => {
      const record: Record<string, string> = {};
      header.forEach((key, i) => {
        record[key] = row[i] ?? '';
      });
      return record as unknown as CdxRecord;
    });
  }

  /** Cheap "does this still have good content" check: -1 limit returns only the last match. */
  async findLatestSnapshot(url: string): Promise<CdxRecord | null> {
    const records = await this.queryCdx({
      url,
      filter: ['statuscode:200'],
      collapse: 'urlkey',
      limit: -1,
    });
    return records[0] ?? null;
  }

  /** raw=true (default) appends id_ to suppress Wayback's injected banner/JS/link-rewriting. */
  buildSnapshotUrl(record: CdxRecord, opts: { raw?: boolean } = {}): string {
    const suffix = opts.raw === false ? '' : 'id_';
    return `https://web.archive.org/web/${record.timestamp}${suffix}/${record.original}`;
  }

  async fetchSnapshot(record: CdxRecord, cache: RawCache): Promise<FetchResult> {
    const snapshotUrl = this.buildSnapshotUrl(record);
    const res = await rateLimitedFetch(snapshotUrl, this.logger, { timeoutMs: 30_000 });
    const fetchedAt = new Date().toISOString();
    const entry = await cache.put(record.original, res.body, {
      fetchedAt,
      httpStatus: res.status,
      fetchMode: 'wayback',
      waybackTimestamp: record.timestamp,
    });
    return {
      url: record.original,
      html: res.body,
      httpStatus: res.status,
      fetchMode: 'wayback',
      waybackTimestamp: record.timestamp,
      waybackUrl: snapshotUrl,
      fetchedAt,
      cachePath: entry.htmlPath,
    };
  }
}
