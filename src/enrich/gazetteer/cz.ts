import type { GazetteerEntry } from './index.ts';

/**
 * Czech regions (kraje) plus the pre-2000 historical regions still used
 * colloquially (Moravia, North Moravia, West Bohemia — Czech lands split
 * into Bohemia/Moravia/Silesia long before the kraj system). radius ≈
 * √(area/π). Town/district names (Popelka, Krinec, Sušice, Děčín district,
 * Rokycany, Jeníšovice) stay unmatched by design.
 */
export const czRegions: GazetteerEntry[] = [
  { name: 'Vysočina', aliases: ['Vysocina'], lat: 49.4, lon: 15.6, radiusKm: 47 },
  {
    name: 'South Moravian',
    aliases: ['Jihomoravsky', 'Jihomoravský', 'South Moravia'],
    lat: 49.1,
    lon: 16.7,
    radiusKm: 48,
  },
  {
    name: 'Pilsen Region',
    aliases: ['Plzensky', 'Plzeňský', 'Plzen Region'],
    lat: 49.6,
    lon: 13.2,
    radiusKm: 49,
  },
  { name: 'Liberecký', aliases: ['Liberecky', 'Liberec Region', 'Liberec'], lat: 50.7, lon: 15.1, radiusKm: 32 },
  {
    name: 'Moravia',
    aliases: ['Morave'], // "Moravě" (locative case) with the diacritic stripped
    lat: 49.3,
    lon: 17.0,
    radiusKm: 120,
  },
  {
    name: 'North Moravia',
    aliases: [], // pre-2000 region, roughly today's Moravian-Silesian + Olomouc kraje
    lat: 49.8,
    lon: 17.6,
    radiusKm: 80,
  },
  {
    name: 'West Bohemia',
    aliases: ['West country'], // colloquial — pre-2000 region, roughly Plzeň + Karlovy Vary kraje
    lat: 49.8,
    lon: 13.0,
    radiusKm: 70,
  },
];
