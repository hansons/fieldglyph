import type { GazetteerEntry } from './index.ts';

/**
 * Belgian provinces that actually appear in admin_region values. radius ≈
 * √(area/π). "North East Momalle" stays unmatched — a village name plus a
 * compass qualifier, no province name present in the text.
 */
export const beRegions: GazetteerEntry[] = [
  { name: 'Antwerp', aliases: ['Antwerpen', 'Anvers'], lat: 51.2, lon: 4.65, radiusKm: 30 },
];
