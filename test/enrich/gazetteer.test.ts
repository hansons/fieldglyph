import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchRegion, normalizeRegionText } from '../../src/enrich/gazetteer/index.ts';

test('matchRegion: exact county match', () => {
  const m = matchRegion('United Kingdom', 'Wiltshire');
  assert.equal(m?.name, 'Wiltshire');
  assert.ok(Math.abs(m!.lat - 51.32) < 0.1);
});

test('matchRegion: rescues messy values via whole-word substring', () => {
  assert.equal(matchRegion('United Kingdom', 'nr Alton Barnes. Wiltshire')?.name, 'Wiltshire');
  assert.equal(matchRegion('United Kingdom', 'Wiltshire. United Kingdom')?.name, 'Wiltshire');
  assert.equal(matchRegion('United Kingdom', 'Wilshire')?.name, 'Wiltshire'); // observed typo
});

test('matchRegion: longest alias wins — West Sussex beats bare Sussex', () => {
  assert.equal(matchRegion('United Kingdom', 'West Sussex')?.name, 'West Sussex');
  assert.equal(matchRegion('United Kingdom', 'Sussex')?.name, 'Sussex (unspecified)');
});

test('matchRegion: Dutch province variants', () => {
  assert.equal(matchRegion('Netherlands', 'Noord Brabant')?.name, 'Noord-Brabant');
  assert.equal(matchRegion('Netherlands', 'Noord brabant')?.name, 'Noord-Brabant');
  assert.equal(matchRegion('Netherlands', 'Overijsel')?.name, 'Overijssel');
  assert.equal(matchRegion('Netherlands', 'Zuid Holland')?.name, 'Zuid-Holland');
});

test('matchRegion: US states incl. USPS abbreviations', () => {
  assert.equal(matchRegion('United States', 'California')?.name, 'California');
  assert.equal(matchRegion('United States', 'SC')?.name, 'South Carolina');
});

test('matchRegion: country guard prevents cross-table collisions', () => {
  // Georgia (US state) must not match for a record whose country is Georgia-the-country.
  assert.equal(matchRegion('Georgia', 'Georgia'), null);
  // A German region never matches any table — deliberately unlocated.
  assert.equal(matchRegion('Germany', 'Bavaria'), null);
  // Short USPS codes never substring-match inside longer text.
  assert.equal(matchRegion('United States', 'normal text'), null);
});

test('matchRegion: null/empty inputs return null', () => {
  assert.equal(matchRegion(null, 'Wiltshire'), null);
  assert.equal(matchRegion('United Kingdom', null), null);
  assert.equal(matchRegion('United Kingdom', '  '), null);
});

test('normalizeRegionText strips punctuation and diacritics', () => {
  assert.equal(normalizeRegionText('Fryslân'), 'fryslan');
  assert.equal(normalizeRegionText('  Wiltshire.  '), 'wiltshire');
});
