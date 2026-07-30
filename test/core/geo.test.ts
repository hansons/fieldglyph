import { test } from 'node:test';
import assert from 'node:assert/strict';
import { osGridToLatLon, parseOsGridRef } from '../../src/core/geo.ts';

test('parseOsGridRef: 10-figure compact reference (Milk Hill 2026)', () => {
  // Cross-checked against streetmap.co.uk's own link for this reference:
  // x=410525, y=164021.
  assert.deepEqual(parseOsGridRef('SU1052564021'), { easting: 410525, northing: 164021 });
});

test('parseOsGridRef: spaced 6-figure reference', () => {
  assert.deepEqual(parseOsGridRef('SU 116 621'), { easting: 411600, northing: 162100 });
});

test('parseOsGridRef: rejects garbage', () => {
  assert.equal(parseOsGridRef('not a ref'), null);
  assert.equal(parseOsGridRef('SU123'), null); // odd digit count
  assert.equal(parseOsGridRef(''), null);
});

test('osGridToLatLon: matches streetmap.co.uk conversion for Milk Hill within ~50m', () => {
  // streetmap.co.uk's own sv= parameter for SU1052564021 gives
  // 51.3751522942768, -1.8501667 (WGS84).
  const result = osGridToLatLon('SU1052564021');
  assert.ok(result);
  assert.ok(Math.abs(result!.latitude - 51.37515) < 0.0005, `lat off: ${result!.latitude}`);
  assert.ok(Math.abs(result!.longitude - -1.85017) < 0.0005, `lon off: ${result!.longitude}`);
});

test('osGridToLatLon: TG square (East Anglia) sanity check', () => {
  // Caister-on-Sea area: TG 51409 13177 should land near 52.658N, 1.716E.
  const result = osGridToLatLon('TG 51409 13177');
  assert.ok(result);
  assert.ok(Math.abs(result!.latitude - 52.6577) < 0.005, `lat off: ${result!.latitude}`);
  assert.ok(Math.abs(result!.longitude - 1.7169) < 0.005, `lon off: ${result!.longitude}`);
});
