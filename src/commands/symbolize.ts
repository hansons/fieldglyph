import { openDb, runMigrations } from '../db/client.ts';
import { Repository } from '../db/repository.ts';
import { rateLimitedFetch } from '../core/rateLimitedFetch.ts';
import { createLogger, type Logger } from '../core/logger.ts';
import { renderSymbolSvg } from '../symbols/render.ts';
import { createDescribeFn, type DescribeFn, type ImageMediaType } from '../symbols/describe.ts';

const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024; // API limit is 5MB per image; leave headroom

const MEDIA_TYPES: Record<string, ImageMediaType> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

function mediaTypeFor(url: string, contentType?: string): ImageMediaType | null {
  const fromHeader = /image\/(jpeg|png|gif|webp)/i.exec(contentType ?? '')?.[0]?.toLowerCase();
  if (fromHeader) return fromHeader as ImageMediaType;
  const ext = /\.([a-z0-9]+)(?:\?|$)/i.exec(new URL(url).pathname)?.[1]?.toLowerCase();
  return ext ? (MEDIA_TYPES[ext] ?? null) : null;
}

export interface SymbolizeStats {
  attempted: number;
  succeeded: number;
  refused: number;
  skippedImage: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
}

/** Core loop, injectable describeFn so tests never hit the API. */
export async function symbolizeCore(
  repo: Repository,
  describeFn: DescribeFn,
  logger: Logger,
  opts: { limit: number; model: string },
): Promise<SymbolizeStats> {
  const stats: SymbolizeStats = {
    attempted: 0,
    succeeded: 0,
    refused: 0,
    skippedImage: 0,
    errors: 0,
    inputTokens: 0,
    outputTokens: 0,
  };

  const candidates = repo.getSymbolCandidates(opts.limit);
  logger.info(`Symbolizing ${candidates.length} formation(s) with ${opts.model}`);

  for (const candidate of candidates) {
    stats.attempted++;
    try {
      const image = await rateLimitedFetch(candidate.image_url, logger, {
        binary: true,
        timeoutMs: 30_000,
      });
      if (image.status !== 200) {
        stats.skippedImage++;
        logger.warn(`Image fetch ${image.status}, skipping`, { url: candidate.image_url });
        continue;
      }
      const mediaType = mediaTypeFor(candidate.image_url, image.contentType);
      const byteLength = (image.body.length * 3) / 4;
      if (!mediaType || byteLength > MAX_IMAGE_BYTES) {
        stats.skippedImage++;
        logger.warn('Unusable image (type/size), skipping', {
          url: candidate.image_url,
          mediaType,
          kb: Math.round(byteLength / 1024),
        });
        continue;
      }

      const tags = candidate.formation_type_tags
        ? (JSON.parse(candidate.formation_type_tags) as string[])
        : null;
      const result = await describeFn(image.body, mediaType, {
        title: candidate.title,
        description: candidate.description,
        tags,
        imageKind: candidate.image_kind,
      });
      stats.inputTokens += result.usage.inputTokens;
      stats.outputTokens += result.usage.outputTokens;

      if (result.refused || !result.spec) {
        stats.refused++;
        logger.warn(`Model ${result.refused ? 'refused' : 'returned no spec'} for ${candidate.title ?? candidate.uid}`);
        continue;
      }

      const svg = renderSymbolSvg(result.spec);
      repo.insertSymbol({
        formationReportId: candidate.formation_id,
        sourceImageUrl: candidate.image_url,
        model: opts.model,
        specJson: JSON.stringify(result.spec),
        svg,
        confidence: result.spec.confidence ?? null,
      });
      stats.succeeded++;
      logger.info(
        `[${stats.succeeded}/${candidates.length}] ${candidate.title ?? candidate.uid} — ` +
          `${result.spec.elements.length} element(s), confidence ${result.spec.confidence}`,
      );
    } catch (err) {
      stats.errors++;
      logger.error(`Failed symbolizing ${candidate.title ?? candidate.uid}`, { error: String(err) });
    }
  }

  return stats;
}

export async function runSymbolize(
  opts: { limit?: number; model?: string } = {},
): Promise<void> {
  const logger = createLogger();
  const model = opts.model ?? 'claude-opus-5';
  const limit = opts.limit ?? 50;

  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    logger.warn(
      'No ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN in the environment. The SDK will also try an ' +
        '`ant auth login` profile; if that fails, set an API key from console.anthropic.com and retry.',
    );
  }

  const db = openDb();
  runMigrations(db);
  const repo = new Repository(db);

  const describeFn = createDescribeFn(model);
  const stats = await symbolizeCore(repo, describeFn, logger, { limit, model });

  // Opus 5 pricing: $5/M input, $25/M output.
  const cost = (stats.inputTokens * 5 + stats.outputTokens * 25) / 1_000_000;
  logger.info(
    `Done: ${stats.succeeded} symbol(s) generated, ${stats.refused} refused/empty, ` +
      `${stats.skippedImage} unusable image(s), ${stats.errors} error(s). ` +
      `Tokens ${stats.inputTokens} in / ${stats.outputTokens} out` +
      (model === 'claude-opus-5' ? ` (≈$${cost.toFixed(2)})` : ''),
  );
  const counts = repo.countSymbols();
  logger.info(
    `Symbol totals — pending: ${counts.pending ?? 0}, approved: ${counts.approved ?? 0}, rejected: ${counts.rejected ?? 0}`,
  );
  db.close();
}
