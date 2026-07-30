import { ukRegions } from './uk.ts';
import { nlRegions } from './nl.ts';
import { usRegions } from './us.ts';
import { caRegions } from './ca.ts';

export interface GazetteerEntry {
  name: string;
  aliases: string[];
  lat: number;
  lon: number;
  radiusKm: number;
}

export interface RegionMatch {
  name: string;
  lat: number;
  lon: number;
  radiusKm: number;
}

/** Lowercase, strip diacritics, punctuation to spaces, collapse whitespace. */
export function normalizeRegionText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

interface CompiledEntry {
  entry: GazetteerEntry;
  keys: string[]; // normalized name + aliases, for exact match
}

function compile(entries: GazetteerEntry[]): CompiledEntry[] {
  return entries.map((entry) => ({
    entry,
    keys: [entry.name, ...entry.aliases].map(normalizeRegionText),
  }));
}

const tables: Record<string, CompiledEntry[]> = {
  'united kingdom': compile(ukRegions),
  netherlands: compile(nlRegions),
  'united states': compile(usRegions),
  canada: compile(caRegions),
};

/**
 * Match a source-reported admin region to a gazetteer centroid.
 *
 * Country-guarded: the UK table is only consulted for UK records, etc. — this is
 * what prevents "Georgia" (US state) from colliding with Georgia (country), and
 * keeps foreign one-offs deliberately unmatched rather than wrongly placed.
 *
 * Strategy: exact normalized match first; then longest-alias-first whole-word
 * substring scan, which rescues messy values like "nr Alton Barnes. Wiltshire"
 * or "Wiltshire. United Kingdom".
 */
export function matchRegion(
  country: string | null | undefined,
  adminRegion: string | null | undefined,
): RegionMatch | null {
  if (!country || !adminRegion) return null;
  const table = tables[normalizeRegionText(country)];
  if (!table) return null;

  const text = normalizeRegionText(adminRegion);
  if (!text) return null;

  for (const { entry, keys } of table) {
    if (keys.includes(text)) {
      return { name: entry.name, lat: entry.lat, lon: entry.lon, radiusKm: entry.radiusKm };
    }
  }

  // Substring pass: collect all (entry, key) pairs, longest keys first so
  // "west sussex" wins over the bare "sussex" pseudo-entry.
  const candidates: Array<{ entry: GazetteerEntry; key: string }> = [];
  for (const { entry, keys } of table) {
    for (const key of keys) candidates.push({ entry, key });
  }
  candidates.sort((a, b) => b.key.length - a.key.length);

  const padded = ` ${text} `;
  for (const { entry, key } of candidates) {
    if (key.length < 4) continue; // never substring-match short codes like "AL"
    if (padded.includes(` ${key} `)) {
      return { name: entry.name, lat: entry.lat, lon: entry.lon, radiusKm: entry.radiusKm };
    }
  }

  return null;
}
