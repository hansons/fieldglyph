import { openDb, runMigrations } from '../db/client.ts';
import { Repository } from '../db/repository.ts';
import { getConnector } from '../connectors/registry.ts';
import { buildContext, runPipeline } from './runner.ts';

export async function runScrape(
  connectorId: string,
  opts: { limit?: number; forceRefetch?: boolean } = {},
): Promise<void> {
  const { connector, sourceDef } = getConnector(connectorId);

  const db = openDb();
  runMigrations(db);
  const repo = new Repository(db);
  const sourceId = repo.upsertSource(sourceDef);

  const ctx = buildContext(connector.id, 'live');
  ctx.logger.info(`Scraping ${connector.displayName}`, { limit: opts.limit });

  const stats = await runPipeline(connector, ctx, repo, sourceId, opts);
  ctx.logger.info(
    `Done: ${stats.pagesFetched} page(s) fetched, ${stats.formationsUpserted} formation(s) upserted, ${stats.errors} error(s)`,
  );

  db.close();
}
