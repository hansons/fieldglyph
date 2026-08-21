import type { GazetteerEntry } from './index.ts';

/**
 * German states (Bundesländer) that actually appear in admin_region values.
 * radius ≈ √(area/π). "nr X"/"near X" town-name values (Kassel, Lichtenrade,
 * Gropiusstadt, Großziethen) stay unmatched by design — see ca.ts/uk.ts:
 * aliases are spelling variants of the same entity, not child places.
 */
export const deRegions: GazetteerEntry[] = [
  { name: 'Hesse', aliases: ['Hessen'], lat: 50.6, lon: 9.0, radiusKm: 82 },
  { name: 'Bavaria', aliases: ['Bayern'], lat: 49.0, lon: 11.5, radiusKm: 150 },
  {
    name: 'North Rhine-Westphalia',
    aliases: ['Nordrhein-Westfalen', 'Nordrheinwestfalen', 'NRW'],
    lat: 51.4,
    lon: 7.6,
    radiusKm: 104,
  },
  {
    name: 'Lower Saxony',
    aliases: ['Niedersachsen', 'Nieder Sachses'], // "Nieder Sachses" observed typo
    lat: 52.9,
    lon: 9.3,
    radiusKm: 123,
  },
  { name: 'Berlin', aliases: [], lat: 52.52, lon: 13.4, radiusKm: 17 },
  { name: 'Brandenburg', aliases: [], lat: 52.4, lon: 13.1, radiusKm: 97 },
  { name: 'Schleswig-Holstein', aliases: [], lat: 54.3, lon: 9.7, radiusKm: 71 },
  {
    name: 'Mecklenburg-Vorpommern',
    aliases: ['Mecklenburg Vorpommern'],
    lat: 53.6,
    lon: 12.4,
    radiusKm: 86,
  },
];
