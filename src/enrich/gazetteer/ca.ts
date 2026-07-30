import type { GazetteerEntry } from './index.ts';

/** Canadian provinces + territories (Saskatchewan alone has 13+ reports). */
export const caRegions: GazetteerEntry[] = [
  { name: 'Alberta', aliases: ['AB'], lat: 55.0, lon: -115.0, radiusKm: 459 },
  { name: 'British Columbia', aliases: ['BC'], lat: 54.5, lon: -125.5, radiusKm: 549 },
  { name: 'Manitoba', aliases: ['MB'], lat: 55.0, lon: -97.5, radiusKm: 455 },
  { name: 'New Brunswick', aliases: ['NB'], lat: 46.5, lon: -66.0, radiusKm: 152 },
  { name: 'Newfoundland and Labrador', aliases: ['NL', 'Newfoundland'], lat: 53.0, lon: -60.0, radiusKm: 359 },
  { name: 'Nova Scotia', aliases: ['NS'], lat: 45.0, lon: -63.0, radiusKm: 133 },
  { name: 'Ontario', aliases: ['ON'], lat: 50.0, lon: -85.0, radiusKm: 585 },
  { name: 'Prince Edward Island', aliases: ['PEI', 'PE'], lat: 46.25, lon: -63.13, radiusKm: 43 },
  { name: 'Quebec', aliases: ['QC', 'Québec'], lat: 53.0, lon: -70.0, radiusKm: 700 },
  { name: 'Saskatchewan', aliases: ['SK'], lat: 54.0, lon: -106.0, radiusKm: 455 },
  { name: 'Northwest Territories', aliases: ['NT', 'NWT'], lat: 64.5, lon: -119.0, radiusKm: 655 },
  { name: 'Yukon', aliases: ['YT'], lat: 63.5, lon: -135.5, radiusKm: 392 },
];
