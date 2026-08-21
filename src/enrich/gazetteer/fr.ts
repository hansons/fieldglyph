import type { GazetteerEntry } from './index.ts';

/**
 * French departments, regions, and one historical province (Touraine) that
 * actually appear in admin_region values — the data freely mixes both the
 * modern department/region tiers and pre-2016 region names still in common
 * use (Alsace, Bourgogne), so all are entered directly. radius ≈ √(area/π).
 * Hyphens normalize to spaces (normalizeRegionText), so "Seine-et-Marne" and
 * the observed "Seine et Marne" already match without a separate alias.
 * "Nr Saint Hippolyte"/"Nr Moisselles" stay unmatched — town names.
 */
export const frRegions: GazetteerEntry[] = [
  { name: 'Pas-de-Calais', aliases: [], lat: 50.5, lon: 2.3, radiusKm: 46 },
  { name: 'Moselle', aliases: [], lat: 49.05, lon: 6.5, radiusKm: 45 },
  { name: 'Ain', aliases: [], lat: 46.1, lon: 5.4, radiusKm: 43 },
  { name: 'Yvelines', aliases: [], lat: 48.8, lon: 1.8, radiusKm: 27 },
  { name: 'Seine-et-Marne', aliases: [], lat: 48.6, lon: 2.95, radiusKm: 43 },
  { name: 'Puy-de-Dôme', aliases: ['Puy de Dome'], lat: 45.7, lon: 3.05, radiusKm: 50 },
  { name: 'Vienne', aliases: [], lat: 46.6, lon: 0.5, radiusKm: 47 },
  { name: 'Meuse', aliases: [], lat: 49.0, lon: 5.4, radiusKm: 44 },
  { name: 'Loir-et-Cher', aliases: [], lat: 47.6, lon: 1.5, radiusKm: 45 },
  { name: 'Indre-et-Loire', aliases: [], lat: 47.35, lon: 0.75, radiusKm: 44 },
  {
    name: 'Touraine',
    aliases: [], // historical province, roughly the modern Indre-et-Loire footprint
    lat: 47.3,
    lon: 0.7,
    radiusKm: 45,
  },
  { name: 'Normandy', aliases: ['Normandie'], lat: 49.1, lon: -0.1, radiusKm: 98 },
  { name: 'Grand Est', aliases: [], lat: 48.7, lon: 5.5, radiusKm: 135 },
  { name: 'Centre-Val de Loire', aliases: ['Centre Val de Loire'], lat: 47.5, lon: 1.7, radiusKm: 112 },
  {
    name: 'Bourgogne',
    aliases: ['Burgundy'], // pre-2016 region, now the western half of Bourgogne-Franche-Comté
    lat: 47.2,
    lon: 4.4,
    radiusKm: 90,
  },
  {
    name: 'Alsace',
    aliases: [], // pre-2016 region, now the eastern part of Grand Est
    lat: 48.3,
    lon: 7.4,
    radiusKm: 60,
  },
];
