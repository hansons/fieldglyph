import { openDb, runMigrations } from './client.ts';

const db = openDb();
const applied = runMigrations(db);
if (applied.length === 0) {
  console.log('Database up to date, no migrations applied.');
} else {
  console.log(`Applied ${applied.length} migration(s): ${applied.join(', ')}`);
}
db.close();
