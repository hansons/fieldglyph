import type { GazetteerEntry } from './index.ts';

/**
 * Italian regions and provinces that actually appear in admin_region values
 * (Italy's data mixes both tiers, so both are entered directly rather than
 * forced into one hierarchy). radius ≈ √(area/π). "near Milan"/"nr Cervia"
 * stay unmatched by design — cities, not administrative divisions.
 */
export const itRegions: GazetteerEntry[] = [
  { name: 'Piedmont', aliases: ['Piemonte'], lat: 45.0, lon: 7.7, radiusKm: 90 },
  {
    name: 'Emilia-Romagna',
    aliases: ['Emilie Romagne'], // observed French-flavored spelling
    lat: 44.5,
    lon: 11.3,
    radiusKm: 85,
  },
  { name: 'Siena', aliases: [], lat: 43.15, lon: 11.35, radiusKm: 35 }, // province
  { name: 'Alessandria', aliases: [], lat: 44.85, lon: 8.6, radiusKm: 34 }, // province
];
