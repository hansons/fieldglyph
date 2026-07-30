import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { FetchResult, ParsedFormation, SourcePage } from '../core/types.ts';

export interface SourceRow {
  id: number;
  key: string;
  name: string;
  base_url: string;
  status: string;
  recovery_priority: number | null;
  notes: string | null;
}

export interface SourceDef {
  key: string;
  name: string;
  baseUrl: string;
  status: 'abandoned_live' | 'dead' | 'active';
  recoveryPriority?: number;
  notes?: string;
}

export class Repository {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  upsertSource(def: SourceDef): number {
    this.db
      .prepare(
        `INSERT INTO sources (key, name, base_url, status, recovery_priority, notes)
         VALUES (@key, @name, @baseUrl, @status, @recoveryPriority, @notes)
         ON CONFLICT(key) DO UPDATE SET
           name=excluded.name, base_url=excluded.base_url, status=excluded.status,
           recovery_priority=excluded.recovery_priority, notes=excluded.notes`,
      )
      .run({
        key: def.key,
        name: def.name,
        baseUrl: def.baseUrl,
        status: def.status,
        recoveryPriority: def.recoveryPriority ?? null,
        notes: def.notes ?? null,
      });
    return this.getSourceId(def.key);
  }

  getSourceId(key: string): number {
    const row = this.db.prepare('SELECT id FROM sources WHERE key = ?').get(key) as
      | { id: number }
      | undefined;
    if (!row) throw new Error(`Unknown source: ${key}`);
    return row.id;
  }

  logFetch(sourceId: number, page: SourcePage, result: FetchResult, error?: string): void {
    this.db
      .prepare(
        `INSERT INTO fetch_log (source_id, url, page_type, fetch_mode, wayback_timestamp, http_status, fetched_at, cache_path, error)
         VALUES (@sourceId, @url, @pageType, @fetchMode, @waybackTimestamp, @httpStatus, @fetchedAt, @cachePath, @error)`,
      )
      .run({
        sourceId,
        url: page.url,
        pageType: page.pageType,
        fetchMode: result.fetchMode,
        waybackTimestamp: result.waybackTimestamp ?? null,
        httpStatus: result.httpStatus,
        fetchedAt: result.fetchedAt,
        cachePath: result.cachePath,
        error: error ?? null,
      });
  }

  /**
   * Remove all formation rows for a source so a reparse can rebuild them from
   * cache. Needed after a parser upgrade changes externalId extraction: the uid
   * incorporates externalId, so improved rows would otherwise be inserted
   * alongside the old ones instead of replacing them.
   */
  deleteSourceFormations(sourceId: number): number {
    this.db
      .prepare(
        `DELETE FROM formation_media WHERE formation_report_id IN
           (SELECT id FROM formation_reports WHERE source_id = ?)`,
      )
      .run(sourceId);
    const info = this.db.prepare('DELETE FROM formation_reports WHERE source_id = ?').run(sourceId);
    return info.changes;
  }

  logFetchError(sourceId: number, page: SourcePage, error: string): void {
    this.db
      .prepare(
        `INSERT INTO fetch_log (source_id, url, page_type, fetch_mode, http_status, fetched_at, error)
         VALUES (?, ?, ?, 'unknown', NULL, ?, ?)`,
      )
      .run(sourceId, page.url, page.pageType, new Date().toISOString(), error);
  }

  computeUid(connectorId: string, sourceUrl: string, externalId?: string): string {
    return createHash('sha1')
      .update(`${connectorId}|${sourceUrl}|${externalId ?? ''}`)
      .digest('hex');
  }

  upsertFormation(
    connectorId: string,
    sourceId: number,
    fetchResult: FetchResult,
    parserVersion: string,
    formation: ParsedFormation,
  ): number {
    const uid = this.computeUid(connectorId, fetchResult.url, formation.externalId);
    const now = new Date().toISOString();

    const existing = this.db.prepare('SELECT id FROM formation_reports WHERE uid = ?').get(uid) as
      | { id: number }
      | undefined;

    const params = {
      uid,
      sourceId,
      sourceUrl: fetchResult.url,
      externalId: formation.externalId ?? null,
      fetchMode: fetchResult.fetchMode,
      waybackTimestamp: fetchResult.waybackTimestamp ?? null,
      waybackUrl: fetchResult.waybackUrl ?? null,
      retrievedAt: fetchResult.fetchedAt,
      rawCachePath: fetchResult.cachePath,
      parserVersion,
      harvestConfidence: null,
      title: formation.title ?? null,
      description: formation.description ?? null,
      reportedBy: formation.reportedBy ?? null,
      discoveredDate: formation.discoveredDate ?? null,
      discoveredDatePrecision: formation.discoveredDatePrecision ?? 'unknown',
      timeObserved: formation.timeObserved ?? null,
      discoveryVsWitnessed: formation.discoveryVsWitnessed ?? 'unknown',
      locationName: formation.locationName ?? null,
      country: formation.country ?? null,
      adminRegion: formation.adminRegion ?? null,
      latitude: formation.latitude ?? null,
      longitude: formation.longitude ?? null,
      coordinateSource: formation.coordinateSource ?? 'unknown',
      locationPrecision: formation.locationPrecision ?? null,
      osGridRef: formation.osGridRef ?? null,
      cropType: formation.cropType ?? null,
      formationType: formation.formationType ?? null,
      formationTypeTags: formation.formationTypeTags
        ? JSON.stringify(formation.formationTypeTags)
        : null,
      diameterMeters: formation.diameterMeters ?? null,
      verificationStatus: formation.verificationStatus ?? 'reported',
      anomalyNotes: formation.anomalyNotes ?? null,
      parseWarnings: formation.parseWarnings ? JSON.stringify(formation.parseWarnings) : null,
      createdAt: now,
      updatedAt: now,
    };

    let formationId: number;
    if (existing) {
      formationId = existing.id;
      this.db
        .prepare(
          `UPDATE formation_reports SET
             source_id=@sourceId, source_url=@sourceUrl, external_id=@externalId,
             fetch_mode=@fetchMode, wayback_timestamp=@waybackTimestamp, wayback_url=@waybackUrl,
             retrieved_at=@retrievedAt, raw_cache_path=@rawCachePath, parser_version=@parserVersion,
             title=@title, description=@description, reported_by=@reportedBy,
             discovered_date=@discoveredDate, discovered_date_precision=@discoveredDatePrecision,
             time_observed=@timeObserved, discovery_vs_witnessed=@discoveryVsWitnessed,
             location_name=@locationName, country=@country, admin_region=@adminRegion,
             latitude=@latitude, longitude=@longitude, coordinate_source=@coordinateSource,
             location_precision=@locationPrecision, os_grid_ref=@osGridRef,
             crop_type=@cropType, formation_type=@formationType, formation_type_tags=@formationTypeTags,
             diameter_meters=@diameterMeters, verification_status=@verificationStatus, anomaly_notes=@anomalyNotes,
             parse_warnings=@parseWarnings, updated_at=@updatedAt
           WHERE id=@id`,
        )
        .run({ ...params, id: formationId });
      this.db.prepare('DELETE FROM formation_media WHERE formation_report_id = ?').run(formationId);
    } else {
      const info = this.db
        .prepare(
          `INSERT INTO formation_reports (
             uid, source_id, source_url, external_id, fetch_mode, wayback_timestamp, wayback_url,
             retrieved_at, raw_cache_path, parser_version, harvest_confidence,
             title, description, reported_by,
             discovered_date, discovered_date_precision, time_observed, discovery_vs_witnessed,
             location_name, country, admin_region, latitude, longitude, coordinate_source,
             location_precision, os_grid_ref,
             crop_type, formation_type, formation_type_tags, diameter_meters,
             verification_status, anomaly_notes, parse_warnings, created_at, updated_at
           ) VALUES (
             @uid, @sourceId, @sourceUrl, @externalId, @fetchMode, @waybackTimestamp, @waybackUrl,
             @retrievedAt, @rawCachePath, @parserVersion, @harvestConfidence,
             @title, @description, @reportedBy,
             @discoveredDate, @discoveredDatePrecision, @timeObserved, @discoveryVsWitnessed,
             @locationName, @country, @adminRegion, @latitude, @longitude, @coordinateSource,
             @locationPrecision, @osGridRef,
             @cropType, @formationType, @formationTypeTags, @diameterMeters,
             @verificationStatus, @anomalyNotes, @parseWarnings, @createdAt, @updatedAt
           )`,
        )
        .run(params);
      formationId = Number(info.lastInsertRowid);
    }

    const insertMedia = this.db.prepare(
      `INSERT INTO formation_media (formation_report_id, url, kind, caption, copyright_notice, photographer, license, is_aerial)
       VALUES (@formationId, @url, @kind, @caption, @copyrightNotice, @photographer, @license, @isAerial)`,
    );
    for (const media of formation.media) {
      insertMedia.run({
        formationId,
        url: media.url,
        kind: media.kind,
        caption: media.caption ?? null,
        copyrightNotice: media.copyrightNotice ?? null,
        photographer: media.photographer ?? null,
        license: media.license ?? null,
        isAerial: media.isAerial === undefined ? null : media.isAerial ? 1 : 0,
      });
    }

    return formationId;
  }

  listFormationsForEnrich(): Array<{
    id: number;
    uid: string;
    source_url: string;
    country: string | null;
    admin_region: string | null;
    latitude: number | null;
    longitude: number | null;
    coordinate_source: string | null;
    os_grid_ref: string | null;
    discovered_date: string | null;
    discovered_date_precision: string | null;
    description: string | null;
    formation_type_tags: string | null;
    parse_warnings: string | null;
  }> {
    return this.db
      .prepare(
        `SELECT id, uid, source_url, country, admin_region, latitude, longitude,
                coordinate_source, os_grid_ref, discovered_date, discovered_date_precision,
                description, formation_type_tags, parse_warnings
         FROM formation_reports`,
      )
      .all() as ReturnType<Repository['listFormationsForEnrich']>;
  }

  applyEnrichment(
    id: number,
    patch: Partial<{
      country: string;
      latitude: number | null;
      longitude: number | null;
      coordinate_source: string;
      discovered_date: string | null;
      discovered_date_precision: string;
      formation_type_tags: string | null;
      parse_warnings: string | null;
    }>,
  ): void {
    const keys = Object.keys(patch);
    if (keys.length === 0) return;
    const sets = keys.map((k) => `${k}=@${k}`).join(', ');
    this.db
      .prepare(`UPDATE formation_reports SET ${sets}, updated_at=@updatedAt WHERE id=@id`)
      .run({ ...patch, id, updatedAt: new Date().toISOString() });
  }

  listFormationsForExport(): Array<Record<string, unknown>> {
    return this.db
      .prepare(
        `SELECT f.*, s.key AS source_key, s.name AS source_name, s.status AS source_status,
                s.base_url AS source_base_url, s.notes AS source_notes
         FROM formation_reports f JOIN sources s ON s.id = f.source_id
         ORDER BY f.discovered_date IS NULL, f.discovered_date`,
      )
      .all() as Array<Record<string, unknown>>;
  }

  listAllMedia(): Array<Record<string, unknown>> {
    return this.db
      .prepare(
        `SELECT m.*, f.uid AS formation_uid FROM formation_media m
         JOIN formation_reports f ON f.id = m.formation_report_id
         ORDER BY m.formation_report_id, m.id`,
      )
      .all() as Array<Record<string, unknown>>;
  }

  /**
   * Formations eligible for symbolization: have at least one usable image,
   * no existing symbol row, and a reachable source (ircup's origins are dead).
   * Ordered media-rich UK records first — the best aerials live there.
   */
  getSymbolCandidates(limit: number): Array<{
    formation_id: number;
    uid: string;
    title: string | null;
    description: string | null;
    formation_type_tags: string | null;
    image_url: string;
    image_kind: string;
  }> {
    return this.db
      .prepare(
        `SELECT f.id AS formation_id, f.uid, f.title, f.description, f.formation_type_tags,
           (SELECT m.url FROM formation_media m
             WHERE m.formation_report_id = f.id AND m.kind IN ('diagram','photo')
             ORDER BY CASE WHEN m.kind='diagram' THEN 0 WHEN m.is_aerial=1 THEN 1 ELSE 2 END, m.id
             LIMIT 1) AS image_url,
           (SELECT m.kind FROM formation_media m
             WHERE m.formation_report_id = f.id AND m.kind IN ('diagram','photo')
             ORDER BY CASE WHEN m.kind='diagram' THEN 0 WHEN m.is_aerial=1 THEN 1 ELSE 2 END, m.id
             LIMIT 1) AS image_kind
         FROM formation_reports f
         JOIN sources s ON s.id = f.source_id
         WHERE s.key != 'ircup'
           AND NOT EXISTS (SELECT 1 FROM formation_symbols fs WHERE fs.formation_report_id = f.id)
           AND EXISTS (SELECT 1 FROM formation_media m
                       WHERE m.formation_report_id = f.id AND m.kind IN ('diagram','photo'))
         ORDER BY (f.country = 'United Kingdom') DESC,
                  (SELECT COUNT(*) FROM formation_media m WHERE m.formation_report_id = f.id) DESC,
                  f.discovered_date DESC
         LIMIT ?`,
      )
      .all(limit) as ReturnType<Repository['getSymbolCandidates']>;
  }

  insertSymbol(row: {
    formationReportId: number;
    sourceImageUrl: string;
    model: string;
    specJson: string;
    svg: string;
    confidence: string | null;
  }): number {
    const info = this.db
      .prepare(
        `INSERT INTO formation_symbols
           (formation_report_id, source_image_url, model, spec_json, svg, confidence, status, generated_at)
         VALUES (@formationReportId, @sourceImageUrl, @model, @specJson, @svg, @confidence, 'pending', @generatedAt)`,
      )
      .run({ ...row, generatedAt: new Date().toISOString() });
    return Number(info.lastInsertRowid);
  }

  listSymbols(status: string): Array<Record<string, unknown>> {
    return this.db
      .prepare(
        `SELECT fs.*, f.uid AS formation_uid, f.title, f.discovered_date, f.discovered_date_precision,
                f.location_name, f.admin_region, f.country, f.formation_type_tags
         FROM formation_symbols fs
         JOIN formation_reports f ON f.id = fs.formation_report_id
         WHERE fs.status = ?
         ORDER BY fs.id`,
      )
      .all(status) as Array<Record<string, unknown>>;
  }

  listApprovedSymbolsByUid(): Map<string, { svg: string; confidence: string | null }> {
    const rows = this.db
      .prepare(
        `SELECT f.uid, fs.svg, fs.confidence FROM formation_symbols fs
         JOIN formation_reports f ON f.id = fs.formation_report_id
         WHERE fs.status = 'approved'`,
      )
      .all() as Array<{ uid: string; svg: string; confidence: string | null }>;
    const map = new Map<string, { svg: string; confidence: string | null }>();
    for (const r of rows) map.set(r.uid, { svg: r.svg, confidence: r.confidence });
    return map;
  }

  setSymbolStatus(symbolId: number, status: 'approved' | 'rejected', notes?: string): boolean {
    const info = this.db
      .prepare(
        `UPDATE formation_symbols
         SET status=@status, review_notes=@notes, reviewed_at=@reviewedAt
         WHERE id=@symbolId`,
      )
      .run({ symbolId, status, notes: notes ?? null, reviewedAt: new Date().toISOString() });
    return info.changes > 0;
  }

  deleteSymbolsForFormation(formationReportId: number): void {
    this.db
      .prepare('DELETE FROM formation_symbols WHERE formation_report_id = ?')
      .run(formationReportId);
  }

  countSymbols(): Record<string, number> {
    const rows = this.db
      .prepare('SELECT status, COUNT(*) n FROM formation_symbols GROUP BY status')
      .all() as Array<{ status: string; n: number }>;
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.status] = r.n;
    return counts;
  }

  countFormations(sourceId: number): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as c FROM formation_reports WHERE source_id = ?')
      .get(sourceId) as { c: number };
    return row.c;
  }

  countMedia(sourceId: number): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as c FROM formation_media m
         JOIN formation_reports f ON f.id = m.formation_report_id
         WHERE f.source_id = ?`,
      )
      .get(sourceId) as { c: number };
    return row.c;
  }

  listSources(): SourceRow[] {
    return this.db.prepare('SELECT * FROM sources ORDER BY key').all() as SourceRow[];
  }
}
