import { openDb, runMigrations } from '../db/client.ts';
import { Repository } from '../db/repository.ts';
import { RobotsGate } from '../core/robots.ts';
import { rateLimitedFetch } from '../core/rateLimitedFetch.ts';
import { MediaCache } from '../core/mediaCache.ts';
import { createLogger } from '../core/logger.ts';

export async function runArchiveMedia(opts: { limit?: number } = {}): Promise<void> {
  const logger = createLogger();
  const db = openDb();
  runMigrations(db);
  const repo = new Repository(db);
  const robots = new RobotsGate(logger);

  const rows = repo.listMediaForArchive(opts.limit);
  logger.info(`Archiving up to ${rows.length} not-yet-archived media file(s)`);

  const caches = new Map<string, MediaCache>();
  const stats = { archived: 0, alreadyCached: 0, robotsDisallowed: 0, failed: 0 };

  for (const row of rows) {
    let cache = caches.get(row.sourceKey);
    if (!cache) {
      cache = new MediaCache(row.sourceKey);
      caches.set(row.sourceKey, cache);
    }

    // A prior run may have written the file but died before recording it
    // (crash, Ctrl-C) — recover instead of re-downloading.
    const existing = await cache.has(row.url);
    if (existing) {
      repo.applyMediaArchive(row.id, existing);
      stats.alreadyCached++;
      continue;
    }

    let allowed: boolean;
    try {
      allowed = await robots.isAllowed(row.url);
    } catch {
      allowed = true; // matches RobotsGate's own "unreachable robots.txt -> allow" default
    }
    if (!allowed) {
      stats.robotsDisallowed++;
      logger.warn(`robots.txt disallows ${row.url}, skipping`);
      continue;
    }

    try {
      const res = await rateLimitedFetch(row.url, logger, { binary: true, timeoutMs: 30_000 });
      if (res.status !== 200) {
        stats.failed++;
        logger.warn(`Non-200 fetching ${row.url}`, { status: res.status });
        continue;
      }
      const bytes = Buffer.from(res.body, 'base64');
      const { relativePath } = await cache.put(row.url, bytes);
      repo.applyMediaArchive(row.id, relativePath);
      stats.archived++;
    } catch (err) {
      stats.failed++;
      logger.warn(`Failed to archive ${row.url}`, { error: String(err) });
    }
  }

  logger.info(
    `Done: ${stats.archived} archived, ${stats.alreadyCached} recovered from an existing file, ` +
      `${stats.robotsDisallowed} robots-disallowed, ${stats.failed} failed`,
  );
  db.close();
}
