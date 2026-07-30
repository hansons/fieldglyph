import { openDb, runMigrations } from '../db/client.ts';
import { Repository } from '../db/repository.ts';
import { getConnector } from '../connectors/registry.ts';

export function runStats(connectorId: string): void {
  const { connector, sourceDef } = getConnector(connectorId);

  const db = openDb();
  runMigrations(db);
  const repo = new Repository(db);

  const sourceId = repo.upsertSource(sourceDef);
  const formations = repo.countFormations(sourceId);
  const media = repo.countMedia(sourceId);

  console.log(`Source:      ${connector.displayName} (${connector.id})`);
  console.log(`Status:      ${sourceDef.status}`);
  console.log(`Formations:  ${formations}`);
  console.log(`Media items: ${media}`);

  db.close();
}
