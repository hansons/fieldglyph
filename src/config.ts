import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');

export const paths = {
  dataDir: path.join(projectRoot, 'data'),
  rawDir: path.join(projectRoot, 'data', 'raw'),
  dbPath: path.join(projectRoot, 'data', 'db', 'archive.sqlite3'),
  migrationsDir: path.join(here, 'db', 'migrations'),
};

export const userAgent =
  'CropCircleArchiveBot/0.1 (+recovery archive project; contact via repository)';

export const hostRateLimits: Record<string, number> = {
  'web.archive.org': 2500,
  default: 1500,
};

export function rateLimitMsForHost(host: string): number {
  return hostRateLimits[host] ?? hostRateLimits.default ?? 1500;
}

export const retryConfig = {
  maxAttempts: 4,
  baseDelayMs: 500,
  maxDelayMs: 8000,
};

export const mediaPolicy = {
  cacheThumbnails: false,
};
