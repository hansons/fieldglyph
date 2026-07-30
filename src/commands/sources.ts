import { openDb, runMigrations } from '../db/client.ts';
import { Repository } from '../db/repository.ts';
import { connectors } from '../connectors/registry.ts';

export function runSources(): void {
  const db = openDb();
  runMigrations(db);
  const repo = new Repository(db);

  const registered = Object.values(connectors);
  if (registered.length === 0) {
    console.log('No connectors registered.');
    db.close();
    return;
  }

  for (const { connector, sourceDef } of registered) {
    let count = 0;
    try {
      const sourceId = repo.getSourceId(sourceDef.key);
      count = repo.countFormations(sourceId);
    } catch {
      count = 0;
    }
    console.log(
      `${connector.id.padEnd(12)} ${connector.displayName.padEnd(35)} ${sourceDef.status.padEnd(15)} ${count} formation(s)`,
    );
  }

  db.close();
}
