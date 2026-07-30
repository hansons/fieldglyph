import { openDb, runMigrations } from '../db/client.ts';
import { Repository } from '../db/repository.ts';
import { getConnector } from '../connectors/registry.ts';
import { buildContext, runPipeline } from './runner.ts';

export async function runReparse(
  connectorId: string,
  opts: { clean?: boolean } = {},
): Promise<void> {
  const { connector, sourceDef } = getConnector(connectorId);

  const db = openDb();
  runMigrations(db);
  const repo = new Repository(db);
  const sourceId = repo.upsertSource(sourceDef);

  const ctx = buildContext(connector.id, 'cache-only');
  if (opts.clean) {
    const removed = repo.deleteSourceFormations(sourceId);
    ctx.logger.info(`Removed ${removed} existing row(s) for ${connector.id} before reparsing`);
  }
  ctx.logger.info(`Reparsing ${connector.displayName} from cache (zero network calls)`);

  const stats = await runPipeline(connector, ctx, repo, sourceId);
  ctx.logger.info(
    `Done: ${stats.pagesFetched} page(s) reparsed, ${stats.formationsUpserted} formation(s) upserted, ${stats.errors} error(s)`,
  );

  db.close();
}
