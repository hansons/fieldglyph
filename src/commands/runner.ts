import { createLogger } from '../core/logger.ts';
import { RawCache } from '../core/cache.ts';
import { RobotsGate } from '../core/robots.ts';
import { WaybackClient } from '../core/wayback.ts';
import { PageFetcher } from '../core/http.ts';
import type { Connector, ConnectorContext, FetchResult, HttpClient } from '../core/types.ts';
import type { Repository } from '../db/repository.ts';

export interface RunStats {
  pagesFetched: number;
  formationsUpserted: number;
  errors: number;
}

class CacheOnlyHttpClient implements HttpClient {
  private readonly cache: RawCache;

  constructor(cache: RawCache) {
    this.cache = cache;
  }

  async fetchPage(url: string): Promise<FetchResult> {
    const cached = await this.cache.get(url);
    if (!cached) {
      throw new Error(`No cached page for ${url} — run a live scrape before reparsing.`);
    }
    return {
      url,
      html: cached.html,
      httpStatus: cached.meta.httpStatus,
      fetchMode: cached.meta.fetchMode,
      waybackTimestamp: cached.meta.waybackTimestamp,
      fetchedAt: cached.meta.fetchedAt,
      cachePath: cached.htmlPath,
    };
  }
}

export function buildContext(connectorId: string, mode: 'live' | 'cache-only'): ConnectorContext {
  const logger = createLogger();
  const cache = new RawCache(connectorId);
  const robots = new RobotsGate(logger);
  const wayback = new WaybackClient(logger);
  const http: HttpClient =
    mode === 'live' ? new PageFetcher(cache, robots, wayback, logger) : new CacheOnlyHttpClient(cache);

  return { http, wayback, cache, robots, logger };
}

export async function runPipeline(
  connector: Connector,
  ctx: ConnectorContext,
  repo: Repository,
  sourceId: number,
  opts: { limit?: number; forceRefetch?: boolean } = {},
): Promise<RunStats> {
  const stats: RunStats = { pagesFetched: 0, formationsUpserted: 0, errors: 0 };

  for await (const page of connector.discoverPages(ctx)) {
    if (page.pageType !== 'detail') continue;
    if (opts.limit !== undefined && stats.pagesFetched >= opts.limit) break;

    try {
      const result = await ctx.http.fetchPage(page.url, connector.defaultFetchMode, {
        forceRefetch: opts.forceRefetch,
      });
      repo.logFetch(sourceId, page, result);
      stats.pagesFetched++;

      const formations = connector.parsePage(result, page);
      for (const formation of formations) {
        repo.upsertFormation(connector.id, sourceId, result, connector.parserVersion, formation);
        stats.formationsUpserted++;
      }
    } catch (err) {
      stats.errors++;
      repo.logFetchError(sourceId, page, String(err));
      ctx.logger.error(`Failed processing ${page.url}`, { error: String(err) });
    }
  }

  return stats;
}
