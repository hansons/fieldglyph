import { openDb, runMigrations } from '../db/client.ts';
import { Repository } from '../db/repository.ts';
import { normalizeCountry } from '../enrich/countries.ts';
import { isYearSane, repairDate } from '../enrich/dates.ts';
import { matchRegion } from '../enrich/gazetteer/index.ts';
import { deriveTags } from '../enrich/tags.ts';
import { stripSiteChrome } from '../enrich/siteChromeCleanup.ts';
import { osGridToLatLon } from '../core/geo.ts';
import { createLogger } from '../core/logger.ts';

function appendWarning(existing: string | null, note: string): string {
  const warnings: string[] = existing ? (JSON.parse(existing) as string[]) : [];
  if (!warnings.includes(note)) warnings.push(note);
  return JSON.stringify(warnings);
}

export function runEnrich(opts: { dryRun?: boolean } = {}): void {
  const logger = createLogger();
  const db = openDb();
  runMigrations(db);
  const repo = new Repository(db);

  const rows = repo.listFormationsForEnrich();
  const stats = {
    countries: 0,
    dates: 0,
    coords: 0,
    centroids: 0,
    descriptionsCleaned: 0,
    mediaTextCleaned: 0,
    tags: 0,
    unmatchedRegions: new Map<string, number>(),
  };

  for (const row of rows) {
    const patch: Parameters<Repository['applyEnrichment']>[1] = {};
    let warnings = row.parse_warnings;

    // 0. Coordinate sanity: some sources leak OS eastings/northings where WGS84
    // lat/lon belongs. Recover via the preserved grid ref when possible.
    let effectiveLat = row.latitude;
    let effectiveSource = row.coordinate_source;
    if (row.latitude !== null && (Math.abs(row.latitude) > 90 || Math.abs(row.longitude ?? 0) > 180)) {
      const converted = row.os_grid_ref ? osGridToLatLon(row.os_grid_ref) : null;
      if (converted) {
        patch.latitude = converted.latitude;
        patch.longitude = converted.longitude;
        patch.coordinate_source = 'os_grid_converted';
        warnings = appendWarning(
          warnings,
          `enrich: implausible lat/lon (${row.latitude}, ${row.longitude}) replaced by OS grid conversion`,
        );
        effectiveLat = converted.latitude;
        effectiveSource = 'os_grid_converted';
      } else {
        patch.latitude = null;
        patch.longitude = null;
        patch.coordinate_source = 'unknown';
        warnings = appendWarning(
          warnings,
          `enrich: implausible lat/lon (${row.latitude}, ${row.longitude}) cleared — no grid ref to recover from`,
        );
        effectiveLat = null;
        effectiveSource = 'unknown';
      }
      stats.coords++;
    }

    // 1. Country normalization (first — the gazetteer is country-guarded).
    const normalizedCountry = normalizeCountry(row.country);
    const country = normalizedCountry ?? row.country;
    if (normalizedCountry && normalizedCountry !== row.country) {
      patch.country = normalizedCountry;
      warnings = appendWarning(warnings, `enrich: country normalized from "${row.country}"`);
      stats.countries++;
    }

    // 2. Year sanity.
    if (!isYearSane(row.discovered_date)) {
      const fix = repairDate(row.discovered_date!, row.source_url);
      patch.discovered_date = fix.date;
      patch.discovered_date_precision = fix.precision;
      warnings = appendWarning(warnings, fix.note);
      stats.dates++;
    }

    // 3. Region centroids — only rows without real coordinates.
    if (
      (effectiveLat === null || effectiveSource === 'region_centroid') &&
      effectiveSource !== 'source_provided' &&
      effectiveSource !== 'os_grid_converted'
    ) {
      const match = matchRegion(country, row.admin_region);
      if (match) {
        if (
          row.latitude !== match.lat ||
          row.longitude !== match.lon ||
          row.coordinate_source !== 'region_centroid'
        ) {
          patch.latitude = match.lat;
          patch.longitude = match.lon;
          patch.coordinate_source = 'region_centroid';
          stats.centroids++;
        }
      } else if (row.admin_region) {
        const key = `${country ?? '?'} / ${row.admin_region}`;
        stats.unmatchedRegions.set(key, (stats.unmatchedRegions.get(key) ?? 0) + 1);
      }
    }

    // 4. Description cleanup: strip site chrome (donation banners, embedded
    // ad scripts, page-nav tab labels) that leaked into the scraped text.
    let effectiveDescription = row.description;
    if (row.description) {
      const cleaned = stripSiteChrome(row.description);
      if (cleaned !== row.description) {
        patch.description = cleaned;
        effectiveDescription = cleaned;
        stats.descriptionsCleaned++;
      }
    }

    // 5. Auto-tagging from descriptions (post-cleanup, so ad-script text
    // never influences the derived tags).
    const tags = deriveTags(effectiveDescription);
    const tagsJson = tags === null ? null : JSON.stringify(tags);
    if (tagsJson !== row.formation_type_tags) {
      patch.formation_type_tags = tagsJson;
      stats.tags++;
    }

    if (warnings !== row.parse_warnings) {
      patch.parse_warnings = warnings;
    }

    if (Object.keys(patch).length > 0 && !opts.dryRun) {
      repo.applyEnrichment(row.id, patch);
    }
  }

  // 6. Same site-chrome cleanup over photo credits — copyright_notice is
  // often worse than description, since a page's chrome + every photo
  // credit on it gets concatenated identically into each photo's row.
  for (const media of repo.listMediaForEnrich()) {
    const mediaPatch: Parameters<Repository['applyMediaEnrichment']>[1] = {};
    if (media.caption) {
      const cleaned = stripSiteChrome(media.caption);
      if (cleaned !== media.caption) mediaPatch.caption = cleaned;
    }
    if (media.copyright_notice) {
      const cleaned = stripSiteChrome(media.copyright_notice);
      if (cleaned !== media.copyright_notice) mediaPatch.copyright_notice = cleaned;
    }
    if (Object.keys(mediaPatch).length > 0) {
      stats.mediaTextCleaned++;
      if (!opts.dryRun) repo.applyMediaEnrichment(media.id, mediaPatch);
    }
  }

  logger.info(
    `${opts.dryRun ? '[dry-run] ' : ''}Enrichment over ${rows.length} records: ` +
      `${stats.countries} country fix(es), ${stats.dates} date repair(s), ` +
      `${stats.coords} coordinate repair(s), ${stats.centroids} centroid assignment(s), ` +
      `${stats.descriptionsCleaned} description cleanup(s), ${stats.mediaTextCleaned} media caption/credit cleanup(s), ` +
      `${stats.tags} tag update(s)`,
  );

  if (stats.unmatchedRegions.size > 0) {
    const top = [...stats.unmatchedRegions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    logger.info(
      `Unmatched regions (left unlocated by design): ${top.map(([k, n]) => `${k} ×${n}`).join('; ')}`,
    );
  }

  db.close();
}
