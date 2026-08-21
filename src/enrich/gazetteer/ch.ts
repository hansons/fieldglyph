import type { GazetteerEntry } from './index.ts';

/**
 * Swiss cantons plus one informal-but-real sub-region (Zürcher Oberland,
 * "Zurich Highlands" — distinct enough from Zürich canton proper to warrant
 * its own centroid rather than an alias). radius ≈ √(area/π). "Lüstlingen"
 * stays unmatched — not a recognizable/verifiable Swiss place name.
 */
export const chRegions: GazetteerEntry[] = [
  { name: 'Bern', aliases: [], lat: 46.85, lon: 7.5, radiusKm: 44 },
  { name: 'Zürich', aliases: ['Zurich'], lat: 47.35, lon: 8.65, radiusKm: 23 },
  { name: 'Fribourg', aliases: ['Canton Fribourg'], lat: 46.8, lon: 7.15, radiusKm: 23 },
  { name: 'Zürcher Oberland', aliases: ['Zurcher Oberland'], lat: 47.3, lon: 8.8, radiusKm: 25 },
];
