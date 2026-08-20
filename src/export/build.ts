import { TAG_VOCABULARY } from '../enrich/tagVocabulary.ts';
import type { Repository } from '../db/repository.ts';

const DATE_PRECISION_CODE: Record<string, string> = { day: 'd', month: 'm', year: 'y', unknown: 'u' };
const COORD_SOURCE_CODE: Record<string, string> = {
  source_provided: 'sp',
  os_grid_converted: 'og',
  region_centroid: 'rc',
  unknown: 'u',
};
const VERIFICATION_CODE: Record<string, string> = {
  reported: 'r',
  'investigated-no-anomaly': 'ina',
  'investigated-bio-anomaly': 'iba',
  'hoax-admitted': 'ha',
  'hoax-suspected': 'hs',
  unresolved: 'u',
};

export interface IndexRecord {
  id: string;
  sy?: 1; // has an approved symbolic representation
  src: string;
  t?: string;
  d?: string;
  dp: string;
  ln?: string;
  co?: string;
  ar?: string;
  lat?: number;
  lon?: number;
  cs: string;
  rk?: number;
  vs: string;
  tg?: string[];
  ct?: string;
  mc: number;
  hi?: string;
  fm: string;
}

export interface DetailRecord {
  desc?: string;
  sym?: { svg: string; cf?: string };
  rb?: string;
  su: string;
  wu?: string;
  wt?: string;
  ra: string;
  og?: string;
  xid?: string;
  warn?: string[];
  media: Array<{
    u: string;
    k: string;
    c?: string;
    ph?: string;
    cp?: string;
    li?: string;
    a?: boolean;
  }>;
}

export interface ExportBundle {
  formations: { generated: string; count: number; records: IndexRecord[] };
  details: Record<string, Record<string, DetailRecord>>; // shard key -> id -> detail
  meta: Record<string, unknown>;
  warnings: string[];
}

interface RegionRadiusLookup {
  (country: string | null, adminRegion: string | null): number | undefined;
}

function round5(n: number): number {
  return Math.round(n * 100000) / 100000;
}

export function buildExport(repo: Repository, regionRadius: RegionRadiusLookup): ExportBundle {
  const rows = repo.listFormationsForExport();
  const mediaRows = repo.listAllMedia();
  const approvedSymbols = repo.listApprovedSymbolsByUid();
  const symbolCounts = repo.countSymbols();
  const generated = new Date().toISOString();
  const warnings: string[] = [];

  const mediaByFormation = new Map<string, Array<Record<string, unknown>>>();
  for (const m of mediaRows) {
    const uid = m.formation_uid as string;
    let list = mediaByFormation.get(uid);
    if (!list) {
      list = [];
      mediaByFormation.set(uid, list);
    }
    list.push(m);
  }

  const records: IndexRecord[] = [];
  const details: Record<string, Record<string, DetailRecord>> = {};
  const ids = new Set<string>();
  const yearHistogram: Record<string, number> = {};
  const tagCounts: Record<string, number> = {};
  const perSource = new Map<string, Record<string, number>>();

  for (const row of rows) {
    const uid = row.uid as string;
    const id = uid.slice(0, 12);
    if (ids.has(id)) {
      throw new Error(`Export id collision on ${id} (uid ${uid}) — widen the id prefix.`);
    }
    ids.add(id);

    const country = (row.country as string | null) ?? undefined;
    const date = (row.discovered_date as string | null) ?? undefined;
    const coordSource = (row.coordinate_source as string | null) ?? 'unknown';
    const media = mediaByFormation.get(uid) ?? [];

    // Freshness guards.
    if (country === 'Holland') warnings.push(`Un-enriched country "Holland" on ${id}`);
    if (
      row.latitude !== null &&
      (Math.abs(row.latitude as number) > 90 || Math.abs(row.longitude as number) > 180)
    ) {
      warnings.push(`Implausible coordinates (${row.latitude}, ${row.longitude}) on ${id}`);
    }
    if (date) {
      const year = Number(date.slice(0, 4));
      if (year < 1500 || year > 2030) warnings.push(`Out-of-window date ${date} on ${id}`);
      yearHistogram[String(year)] = (yearHistogram[String(year)] ?? 0) + 1;
    }

    const tagsRaw = row.formation_type_tags as string | null;
    const tags = tagsRaw ? (JSON.parse(tagsRaw) as string[]) : undefined;
    for (const tag of tags ?? []) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;

    const srcKey = row.source_key as string;
    let sourceStats = perSource.get(srcKey);
    if (!sourceStats) {
      sourceStats = { records: 0, geocoded: 0, described: 0, wayback: 0, media: 0 };
      perSource.set(srcKey, sourceStats);
    }
    sourceStats.records = (sourceStats.records ?? 0) + 1;
    if (row.latitude !== null) sourceStats.geocoded = (sourceStats.geocoded ?? 0) + 1;
    if (row.description) sourceStats.described = (sourceStats.described ?? 0) + 1;
    if (row.fetch_mode === 'wayback') sourceStats.wayback = (sourceStats.wayback ?? 0) + 1;
    sourceStats.media = (sourceStats.media ?? 0) + media.length;

    // Hero image: first aerial photo, else first photo, else first diagram.
    const photos = media.filter((m) => m.kind === 'photo');
    const hero =
      (photos.find((m) => m.is_aerial === 1) ?? photos[0] ?? media.find((m) => m.kind === 'diagram'))
        ?.url as string | undefined;

    const rk =
      coordSource === 'region_centroid'
        ? regionRadius((row.country as string | null) ?? null, (row.admin_region as string | null) ?? null)
        : undefined;

    const symbol = approvedSymbols.get(uid);

    const record: IndexRecord = {
      id,
      sy: symbol ? 1 : undefined,
      src: srcKey,
      t: (row.title as string | null) ?? undefined,
      d: date,
      dp: DATE_PRECISION_CODE[(row.discovered_date_precision as string | null) ?? 'unknown'] ?? 'u',
      ln: (row.location_name as string | null) ?? undefined,
      co: country,
      ar: (row.admin_region as string | null) ?? undefined,
      lat: row.latitude !== null ? round5(row.latitude as number) : undefined,
      lon: row.longitude !== null ? round5(row.longitude as number) : undefined,
      cs: COORD_SOURCE_CODE[coordSource] ?? 'u',
      rk,
      vs: VERIFICATION_CODE[(row.verification_status as string | null) ?? 'reported'] ?? 'r',
      tg: tags,
      ct: (row.crop_type as string | null) ?? undefined,
      mc: media.length,
      hi: hero,
      fm: row.fetch_mode === 'wayback' ? 'w' : 'l',
    };
    records.push(record);

    const shardKey = id[0]!;
    let shard = details[shardKey];
    if (!shard) {
      shard = {};
      details[shardKey] = shard;
    }
    shard[id] = {
      desc: (row.description as string | null) ?? undefined,
      sym: symbol ? { svg: symbol.svg, cf: symbol.confidence ?? undefined } : undefined,
      rb: (row.reported_by as string | null) ?? undefined,
      su: row.source_url as string,
      wu: (row.wayback_url as string | null) ?? undefined,
      wt: (row.wayback_timestamp as string | null) ?? undefined,
      ra: row.retrieved_at as string,
      og: (row.os_grid_ref as string | null) ?? undefined,
      xid: (row.external_id as string | null) ?? undefined,
      warn: row.parse_warnings ? (JSON.parse(row.parse_warnings as string) as string[]) : undefined,
      media: media.map((m) => ({
        u: m.url as string,
        k: m.kind as string,
        c: (m.caption as string | null) ?? undefined,
        ph: (m.photographer as string | null) ?? undefined,
        cp: (m.copyright_notice as string | null) ?? undefined,
        li: (m.license as string | null) ?? undefined,
        a: m.is_aerial === 1 ? true : undefined,
      })),
    };
  }

  const sources = repo.listSources().map((s) => ({
    key: s.key,
    name: s.name,
    status: s.status,
    baseUrl: s.base_url,
    notes: s.notes,
    ...(perSource.get(s.key) ?? { records: 0, geocoded: 0, described: 0, wayback: 0, media: 0 }),
  }));

  const meta = {
    generated,
    totals: {
      records: records.length,
      media: mediaRows.length,
      geocoded: records.filter((r) => r.lat !== undefined).length,
      tagged: records.filter((r) => r.tg && r.tg.length > 0).length,
      withText: records.filter((r) => r.tg !== undefined).length,
      symbolizable: records.filter((r) => r.hi && r.src !== 'ircup' && r.sy !== 1).length,
      symbols: symbolCounts,
    },
    sources,
    tags: TAG_VOCABULARY.map((t) => ({ id: t.id, label: t.label, count: tagCounts[t.id] ?? 0 })),
    yearHistogram,
  };

  return {
    formations: { generated, count: records.length, records },
    details,
    meta,
    warnings,
  };
}
