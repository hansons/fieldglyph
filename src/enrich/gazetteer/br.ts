import type { GazetteerEntry } from './index.ts';

/**
 * Brazilian states that actually appear in admin_region values (southern
 * hemisphere — negative latitude). radius ≈ √(area/π). "Nr Prudentópolis"
 * and "Ipuaçu" stay unmatched by design — city names within these states,
 * not the state name itself.
 */
export const brRegions: GazetteerEntry[] = [
  { name: 'Santa Catarina', aliases: ['SC'], lat: -27.2, lon: -50.5, radiusKm: 174 },
  { name: 'Paraná', aliases: ['Parana'], lat: -24.7, lon: -51.6, radiusKm: 252 },
];
