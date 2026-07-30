import type { GazetteerEntry } from './index.ts';

/** The 12 Dutch provinces. Centroids ~5km accuracy; radius ≈ √(area/π). */
export const nlRegions: GazetteerEntry[] = [
  { name: 'Drenthe', aliases: [], lat: 52.86, lon: 6.62, radiusKm: 29 },
  { name: 'Flevoland', aliases: [], lat: 52.53, lon: 5.6, radiusKm: 26 },
  { name: 'Friesland', aliases: ['Frisia', 'Fryslân', 'Fryslan'], lat: 53.11, lon: 5.85, radiusKm: 33 },
  { name: 'Gelderland', aliases: [], lat: 52.06, lon: 5.94, radiusKm: 40 },
  { name: 'Groningen', aliases: [], lat: 53.26, lon: 6.74, radiusKm: 27 },
  { name: 'Limburg', aliases: [], lat: 51.21, lon: 5.94, radiusKm: 26 },
  {
    name: 'Noord-Brabant',
    aliases: ['Noord Brabant', 'Noord brabant', 'North Brabant', 'Brabant'],
    lat: 51.56,
    lon: 5.2,
    radiusKm: 40,
  },
  {
    name: 'Noord-Holland',
    aliases: ['Noord Holland', 'North Holland'],
    lat: 52.6,
    lon: 4.87,
    radiusKm: 29,
  },
  {
    name: 'Overijssel',
    aliases: ['Overijsel', 'Overyssel'],
    lat: 52.44,
    lon: 6.44,
    radiusKm: 33,
  },
  { name: 'Utrecht', aliases: [], lat: 52.08, lon: 5.16, radiusKm: 21 },
  { name: 'Zeeland', aliases: [], lat: 51.49, lon: 3.85, radiusKm: 24 },
  {
    name: 'Zuid-Holland',
    aliases: ['Zuid Holland', 'Zuid holland', 'South Holland'],
    lat: 52.0,
    lon: 4.5,
    radiusKm: 30,
  },
];
