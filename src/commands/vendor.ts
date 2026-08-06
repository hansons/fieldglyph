import { cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../core/logger.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const vendorDir = path.join(root, 'web', 'vendor');

/** Copy Leaflet + markercluster dist assets into web/vendor/ (self-contained, no CDN). */
export function runVendor(): void {
  const logger = createLogger();

  const copies: Array<[string, string]> = [
    [path.join(root, 'node_modules', 'leaflet', 'dist'), path.join(vendorDir, 'leaflet')],
    [
      path.join(root, 'node_modules', 'leaflet.markercluster', 'dist'),
      path.join(vendorDir, 'markercluster'),
    ],
    [
      path.join(root, 'node_modules', 'leaflet.heat', 'dist'),
      path.join(vendorDir, 'leaflet-heat'),
    ],
  ];

  mkdirSync(vendorDir, { recursive: true });
  for (const [from, to] of copies) {
    cpSync(from, to, { recursive: true });
    logger.info(`Copied ${path.relative(root, from)} -> ${path.relative(root, to)}`);
  }
}
