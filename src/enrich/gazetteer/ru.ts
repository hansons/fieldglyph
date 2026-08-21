import type { GazetteerEntry } from './index.ts';

/**
 * Russian federal subjects that actually appear in admin_region values —
 * not an exhaustive list of all ~85. Krasnodar Krai dominates (reports skew
 * heavily to the Kuban region). radius ≈ √(area/π).
 *
 * Several observed admin_region values stay unmatched by design: district/
 * city names ("Gulkevichsky", "Tikhoretsk" — both within Krasnodar Krai)
 * aren't aliased to their parent krai, matching this gazetteer's existing
 * convention elsewhere (aliases are spelling variants of the same entity,
 * not child regions — see uk.ts). A Cyrillic admin_region ("Самарская
 * область") also can't match: normalizeRegionText's [^a-z0-9]+ filter strips
 * non-Latin script entirely, so it normalizes to empty. The Samara entry
 * below is still worth having for any future Latin-script record.
 */
export const ruRegions: GazetteerEntry[] = [
  {
    name: 'Krasnodar Krai',
    aliases: ['Krasnodar', 'Krasnodarskiy', 'Krasnodarsky', 'Krasnodar Region'],
    lat: 45.5,
    lon: 39.0,
    radiusKm: 155,
  },
  {
    name: 'Adygea',
    aliases: ['Republic of Adygea', 'Adygea Republic'],
    lat: 44.75,
    lon: 40.0,
    radiusKm: 50,
  },
  {
    name: 'Samara Oblast',
    aliases: ['Samarskaya Oblast', 'Samara'],
    lat: 53.3,
    lon: 50.3,
    radiusKm: 130,
  },
  {
    name: 'Irkutsk Oblast',
    aliases: ['Irkutsk', 'Irkutskaya Oblast'],
    lat: 55.0,
    lon: 104.5,
    radiusKm: 497,
  },
];
