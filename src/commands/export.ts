import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, runMigrations } from '../db/client.ts';
import { Repository } from '../db/repository.ts';
import { buildExport } from '../export/build.ts';
import { matchRegion } from '../enrich/gazetteer/index.ts';
import { createLogger } from '../core/logger.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const webDataDir = path.resolve(here, '..', '..', 'web', 'data');

export function runExport(opts: { geojson?: boolean } = {}): void {
  const logger = createLogger();
  const db = openDb();
  runMigrations(db);
  const repo = new Repository(db);

  const bundle = buildExport(repo, (country, region) => matchRegion(country, region)?.radiusKm);

  mkdirSync(webDataDir, { recursive: true });
  writeFileSync(path.join(webDataDir, 'formations.json'), JSON.stringify(bundle.formations));
  for (const [shardKey, shard] of Object.entries(bundle.details)) {
    writeFileSync(path.join(webDataDir, `details-${shardKey}.json`), JSON.stringify(shard));
  }
  writeFileSync(path.join(webDataDir, 'meta.json'), JSON.stringify(bundle.meta, null, 2));

  if (opts.geojson) {
    const features = bundle.formations.records
      .filter((r) => r.lat !== undefined && r.lon !== undefined)
      .map((r) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
        properties: {
          id: r.id,
          title: r.t,
          date: r.d,
          datePrecision: r.dp,
          country: r.co,
          region: r.ar,
          coordSource: r.cs,
          source: r.src,
          tags: r.tg,
        },
      }));
    writeFileSync(
      path.join(webDataDir, 'formations.geojson'),
      JSON.stringify({ type: 'FeatureCollection', features }),
    );
  }

  logger.info(
    `Exported ${bundle.formations.count} formations, ${Object.keys(bundle.details).length} detail shard(s), meta.json` +
      (opts.geojson ? ', formations.geojson' : ''),
  );

  if (bundle.warnings.length > 0) {
    logger.warn(
      `EXPORT FRESHNESS WARNINGS (${bundle.warnings.length}) — did you run 'enrich' after scraping?`,
    );
    for (const w of bundle.warnings.slice(0, 10)) logger.warn(`  ${w}`);
  }

  db.close();
}
