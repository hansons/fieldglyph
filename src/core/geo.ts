/**
 * UK Ordnance Survey grid reference -> WGS84 lat/long.
 *
 * Pure math, no dependencies: parse the two-letter 100km square + digits into
 * OSGB36 easting/northing, invert the OS Transverse Mercator projection onto
 * the Airy 1830 ellipsoid, then Helmert-transform OSGB36 -> WGS84. Constants
 * and series are the Ordnance Survey's published ones (the widely-ported
 * Chris Veness formulation). Accuracy ~5m, ample for field locations.
 */

const deg2rad = (d: number): number => (d * Math.PI) / 180;
const rad2deg = (r: number): number => (r * 180) / Math.PI;

export interface EastingNorthing {
  easting: number;
  northing: number;
}

export interface LatLon {
  latitude: number;
  longitude: number;
}

/** "SU1052564021" or "SU 116 621" -> OSGB36 easting/northing (SW corner). */
export function parseOsGridRef(ref: string): EastingNorthing | null {
  const compact = ref.trim().toUpperCase().replace(/\s+/g, '');
  const match = /^([A-HJ-Z]{2})(\d{2,10})$/.exec(compact);
  if (!match || match[2]!.length % 2 !== 0) return null;

  const letterIndex = (ch: string): number => {
    let idx = ch.charCodeAt(0) - 65;
    if (idx > 7) idx -= 1; // the grid letters skip 'I'
    return idx;
  };

  const l1 = letterIndex(match[1]![0]!);
  const l2 = letterIndex(match[1]![1]!);
  const e100k = (((l1 - 2) % 5) + 5) % 5 * 5 + (l2 % 5);
  const n100k = 19 - Math.floor(l1 / 5) * 5 - Math.floor(l2 / 5);
  if (e100k < 0 || e100k > 6 || n100k < 0 || n100k > 12) return null;

  const digits = match[2]!;
  const half = digits.length / 2;
  const easting = e100k * 100000 + Number(digits.slice(0, half).padEnd(5, '0'));
  const northing = n100k * 100000 + Number(digits.slice(half).padEnd(5, '0'));
  return { easting, northing };
}

/** OSGB36 easting/northing -> OSGB36 lat/lon on the Airy 1830 ellipsoid. */
function osgb36FromEastingNorthing(E: number, N: number): { phi: number; lambda: number } {
  const a = 6377563.396;
  const b = 6356256.909;
  const F0 = 0.9996012717;
  const phi0 = deg2rad(49);
  const lambda0 = deg2rad(-2);
  const N0 = -100000;
  const E0 = 400000;
  const e2 = 1 - (b * b) / (a * a);
  const n = (a - b) / (a + b);

  let phi = phi0;
  let M = 0;
  do {
    phi = (N - N0 - M) / (a * F0) + phi;
    const dPhi = phi - phi0;
    const sPhi = phi + phi0;
    M =
      b *
      F0 *
      ((1 + n + 1.25 * n ** 2 + 1.25 * n ** 3) * dPhi -
        (3 * n + 3 * n ** 2 + 2.625 * n ** 3) * Math.sin(dPhi) * Math.cos(sPhi) +
        (1.875 * n ** 2 + 1.875 * n ** 3) * Math.sin(2 * dPhi) * Math.cos(2 * sPhi) -
        (35 / 24) * n ** 3 * Math.sin(3 * dPhi) * Math.cos(3 * sPhi));
  } while (N - N0 - M >= 0.00001);

  const sinPhi = Math.sin(phi);
  const nu = (a * F0) / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const rho = (a * F0 * (1 - e2)) / (1 - e2 * sinPhi * sinPhi) ** 1.5;
  const eta2 = nu / rho - 1;

  const tanPhi = Math.tan(phi);
  const tan2 = tanPhi * tanPhi;
  const secPhi = 1 / Math.cos(phi);

  const VII = tanPhi / (2 * rho * nu);
  const VIII = (tanPhi / (24 * rho * nu ** 3)) * (5 + 3 * tan2 + eta2 - 9 * tan2 * eta2);
  const IX = (tanPhi / (720 * rho * nu ** 5)) * (61 + 90 * tan2 + 45 * tan2 * tan2);
  const X = secPhi / nu;
  const XI = (secPhi / (6 * nu ** 3)) * (nu / rho + 2 * tan2);
  const XII = (secPhi / (120 * nu ** 5)) * (5 + 28 * tan2 + 24 * tan2 * tan2);
  const XIIA = (secPhi / (5040 * nu ** 7)) * (61 + 662 * tan2 + 1320 * tan2 * tan2 + 720 * tan2 ** 3);

  const dE = E - E0;
  return {
    phi: phi - VII * dE ** 2 + VIII * dE ** 4 - IX * dE ** 6,
    lambda: lambda0 + X * dE - XI * dE ** 3 + XII * dE ** 5 - XIIA * dE ** 7,
  };
}

/** OSGB36 lat/lon (Airy 1830) -> WGS84 via the OS's published Helmert parameters. */
function wgs84FromOsgb36(phi: number, lambda: number): LatLon {
  // Airy 1830 -> cartesian
  const a1 = 6377563.396;
  const b1 = 6356256.909;
  const e21 = 1 - (b1 * b1) / (a1 * a1);
  const nu1 = a1 / Math.sqrt(1 - e21 * Math.sin(phi) ** 2);
  let x = nu1 * Math.cos(phi) * Math.cos(lambda);
  let y = nu1 * Math.cos(phi) * Math.sin(lambda);
  let z = (1 - e21) * nu1 * Math.sin(phi);

  // Helmert OSGB36 -> WGS84
  const tx = 446.448;
  const ty = -125.157;
  const tz = 542.06;
  const s = -20.4894e-6;
  const rx = deg2rad(0.1502 / 3600);
  const ry = deg2rad(0.247 / 3600);
  const rz = deg2rad(0.8421 / 3600);

  const x2 = tx + (1 + s) * x - rz * y + ry * z;
  const y2 = ty + rz * x + (1 + s) * y - rx * z;
  const z2 = tz - ry * x + rx * y + (1 + s) * z;
  x = x2;
  y = y2;
  z = z2;

  // cartesian -> WGS84 (GRS80/WGS84 ellipsoid) lat/lon
  const a2 = 6378137;
  const b2 = 6356752.314245;
  const e22 = 1 - (b2 * b2) / (a2 * a2);
  const p = Math.sqrt(x * x + y * y);
  let phi2 = Math.atan2(z, p * (1 - e22));
  for (let i = 0; i < 8; i++) {
    const nu2 = a2 / Math.sqrt(1 - e22 * Math.sin(phi2) ** 2);
    phi2 = Math.atan2(z + e22 * nu2 * Math.sin(phi2), p);
  }
  return { latitude: rad2deg(phi2), longitude: rad2deg(Math.atan2(y, x)) };
}

/** Full pipeline: OS grid reference string -> WGS84 lat/long, or null if unparseable. */
export function osGridToLatLon(ref: string): LatLon | null {
  const en = parseOsGridRef(ref);
  if (!en) return null;
  const osgb = osgb36FromEastingNorthing(en.easting, en.northing);
  return wgs84FromOsgb36(osgb.phi, osgb.lambda);
}
