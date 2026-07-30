import { rateLimitedFetch, HttpError } from './rateLimitedFetch.ts';
import type { Logger } from './logger.ts';
import type { RawCache } from './cache.ts';
import type { RobotsGate } from './robots.ts';
import type { WaybackClient } from './wayback.ts';
import type { FetchPolicy, FetchResult, HttpClient } from './types.ts';

export class PageFetcher implements HttpClient {
  private readonly cache: RawCache;
  private readonly robots: RobotsGate;
  private readonly wayback: WaybackClient;
  private readonly logger: Logger;

  constructor(cache: RawCache, robots: RobotsGate, wayback: WaybackClient, logger: Logger) {
    this.cache = cache;
    this.robots = robots;
    this.wayback = wayback;
    this.logger = logger;
  }

  async fetchPage(
    url: string,
    policy: FetchPolicy,
    opts: { forceRefetch?: boolean } = {},
  ): Promise<FetchResult> {
    if (!opts.forceRefetch) {
      const cached = await this.cache.get(url);
      if (cached) {
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

    if (policy === 'wayback') {
      return this.fetchViaWayback(url);
    }
    return this.fetchLiveWithPolicy(url, policy);
  }

  private async fetchLiveWithPolicy(
    url: string,
    policy: 'live' | 'live-then-wayback',
  ): Promise<FetchResult> {
    try {
      return await this.fetchLive(url);
    } catch (err) {
      if (policy === 'live-then-wayback') {
        this.logger.warn(`Live fetch failed for ${url}, falling back to Wayback`, {
          error: String(err),
        });
        return this.fetchViaWayback(url);
      }
      throw err;
    }
  }

  private async fetchLive(url: string): Promise<FetchResult> {
    const allowed = await this.robots.isAllowed(url);
    if (!allowed) {
      throw new Error(`Blocked by robots.txt: ${url}`);
    }

    const res = await rateLimitedFetch(url, this.logger);
    if (res.status >= 400) {
      throw new HttpError(`HTTP ${res.status} for ${url}`, res.status);
    }

    const fetchedAt = new Date().toISOString();
    const entry = await this.cache.put(url, res.body, {
      fetchedAt,
      httpStatus: res.status,
      fetchMode: 'live',
    });
    return {
      url,
      html: res.body,
      httpStatus: res.status,
      fetchMode: 'live',
      fetchedAt,
      cachePath: entry.htmlPath,
    };
  }

  private async fetchViaWayback(url: string): Promise<FetchResult> {
    const record = await this.wayback.findLatestSnapshot(url);
    if (!record) {
      throw new Error(`No Wayback snapshot found for ${url}`);
    }
    return this.wayback.fetchSnapshot(record, this.cache);
  }
}
