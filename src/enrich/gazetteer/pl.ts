import type { GazetteerEntry } from './index.ts';

/**
 * Polish voivodeships that actually appear in admin_region values. radius ≈
 * √(area/π). "Nr Wrześni"/"Nr Gmina Orchowo" (towns in Wielkopolskie, a
 * different voivodeship) stay unmatched — the voivodeship name itself never
 * appears in that text, so there's nothing to safely match against.
 */
export const plRegions: GazetteerEntry[] = [
  {
    name: 'Kujawsko-Pomorskie',
    aliases: ['Kujawsko Pomorskie'],
    lat: 53.0,
    lon: 18.5,
    radiusKm: 76,
  },
];
