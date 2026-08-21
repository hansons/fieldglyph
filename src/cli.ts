import { Command } from 'commander';
import { runScrape } from './commands/scrape.ts';
import { runReparse } from './commands/reparse.ts';
import { runSources } from './commands/sources.ts';
import { runStats } from './commands/stats.ts';
import { runEnrich } from './commands/enrich.ts';
import { runExport } from './commands/export.ts';
import { runVendor } from './commands/vendor.ts';
import { runServe } from './commands/serve.ts';
import { runSymbolize } from './commands/symbolize.ts';
import { runArchiveMedia } from './commands/archiveMedia.ts';

const program = new Command();
program.name('crop-circle-archive').description('Web scrape recovery platform for crop circle formations');

program
  .command('scrape <connector>')
  .description('Discover, fetch (cache-first), parse, and upsert formations for a connector')
  .option('--limit <n>', 'only process the first N detail pages', (v) => Number(v))
  .option('--force-refetch', 'bypass the raw HTML cache and re-fetch everything', false)
  .action(async (connectorId: string, options: { limit?: number; forceRefetch?: boolean }) => {
    await runScrape(connectorId, { limit: options.limit, forceRefetch: options.forceRefetch });
  });

program
  .command('reparse <connector>')
  .description('Re-run discovery and parsing entirely from the raw HTML cache, zero network calls')
  .option('--clean', 'delete all existing rows for this source first (use after a parser upgrade)', false)
  .action(async (connectorId: string, options: { clean?: boolean }) => {
    await runReparse(connectorId, { clean: options.clean });
  });

program
  .command('sources')
  .description('List registered connectors and their formation counts')
  .action(() => {
    runSources();
  });

program
  .command('stats <connector>')
  .description('Show coverage summary for one connector')
  .action((connectorId: string) => {
    runStats(connectorId);
  });

program
  .command('enrich')
  .description('Run QA + enrichment passes: country normalization, date repair, region centroids, auto-tags')
  .option('--dry-run', 'report what would change without writing', false)
  .action((options: { dryRun?: boolean }) => {
    runEnrich({ dryRun: options.dryRun });
  });

program
  .command('export')
  .description('Export the archive to static JSON under web/data/ for the formation explorer')
  .option('--geojson', 'also write formations.geojson for GIS interop', false)
  .action((options: { geojson?: boolean }) => {
    runExport({ geojson: options.geojson });
  });

program
  .command('vendor')
  .description('Copy Leaflet assets from node_modules into web/vendor/')
  .action(() => {
    runVendor();
  });

program
  .command('symbolize')
  .description('Generate symbolic representations of formations from their imagery (vision model)')
  .option('--limit <n>', 'formations to process this run', (v) => Number(v), 50)
  .option('--model <id>', 'Claude model id', 'claude-opus-5')
  .action(async (options: { limit?: number; model?: string }) => {
    await runSymbolize(options);
  });

program
  .command('archive-media')
  .description(
    'Download formation photos into a private, local-only preservation cache (data/media/) as WebP — ' +
      'never exported or served, purely disaster recovery if a source site disappears',
  )
  .option('--limit <n>', 'media files to archive this run', (v) => Number(v))
  .action(async (options: { limit?: number }) => {
    await runArchiveMedia({ limit: options.limit });
  });

program
  .command('serve')
  .description('Serve the formation explorer at http://127.0.0.1:8787')
  .option('--port <n>', 'port', (v) => Number(v), 8787)
  .option('--host <host>', 'bind address', '127.0.0.1')
  .action((options: { port?: number; host?: string }) => {
    runServe(options);
  });

program.parseAsync(process.argv);
