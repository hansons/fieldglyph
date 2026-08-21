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

test('matchRegion: Russian federal subjects, incl. real messy admin_region values', () => {
  assert.equal(matchRegion('Russia', 'Krasnodar')?.name, 'Krasnodar Krai');
  assert.equal(matchRegion('Russia', 'Krasnodarskiy')?.name, 'Krasnodar Krai'); // observed variant
  assert.equal(matchRegion('Russia', 'in Krasnodar')?.name, 'Krasnodar Krai'); // substring rescue
  assert.equal(matchRegion('Russia', 'Adygea')?.name, 'Adygea');
  assert.equal(matchRegion('Russia', 'Irkutsk Oblast')?.name, 'Irkutsk Oblast');
  // District/city names within Krasnodar Krai stay unlocated by design —
  // aliases are spelling variants of the same entity, not child regions.
  assert.equal(matchRegion('Russia', 'Gulkevichsky'), null);
  assert.equal(matchRegion('Russia', 'Tikhoretsk'), null);
});

test('matchRegion: German states, incl. observed typos and substring rescue', () => {
  assert.equal(matchRegion('Germany', 'Hessen')?.name, 'Hesse');
  assert.equal(matchRegion('Germany', 'nr Hessen')?.name, 'Hesse'); // substring rescue
  assert.equal(matchRegion('Germany', 'Nordrheinwestfalen')?.name, 'North Rhine-Westphalia');
  assert.equal(matchRegion('Germany', 'Nieder Sachses')?.name, 'Lower Saxony'); // observed typo
  assert.equal(matchRegion('Germany', 'nr Berlin')?.name, 'Berlin');
  // Berlin/Hessen town names within these states stay unlocated by design.
  assert.equal(matchRegion('Germany', 'nr Lichtenrede'), null);
  assert.equal(matchRegion('Germany', 'near Kassel'), null);
});

test('matchRegion: Italian regions and provinces', () => {
  assert.equal(matchRegion('Italy', 'Siena')?.name, 'Siena');
  assert.equal(matchRegion('Italy', 'Piedmont')?.name, 'Piedmont');
  assert.equal(matchRegion('Italy', 'Nrr imola Emilie Romagne')?.name, 'Emilia-Romagna');
  assert.equal(matchRegion('Italy', 'near Milan'), null); // city, not a region/province
});

test('matchRegion: Czech kraje and pre-2000 historical regions', () => {
  assert.equal(matchRegion('Czech Republic', 'Vysocina')?.name, 'Vysočina');
  assert.equal(matchRegion('Czech Republic', 'South Moravian')?.name, 'South Moravian');
  assert.equal(matchRegion('Czech Republic', 'Morave')?.name, 'Moravia');
  assert.equal(matchRegion('Czech Republic', '(North Moravia)')?.name, 'North Moravia');
  assert.equal(matchRegion('Czech Republic', '(West country)')?.name, 'West Bohemia');
  assert.equal(matchRegion('Czech Republic', 'nr Popelka'), null); // town
});

test('matchRegion: Swiss cantons', () => {
  assert.equal(matchRegion('Switzerland', 'nr Bern')?.name, 'Bern');
  assert.equal(matchRegion('Switzerland', 'Nr Zurich')?.name, 'Zürich');
  assert.equal(matchRegion('Switzerland', 'Canton Fribourg')?.name, 'Fribourg');
  assert.equal(matchRegion('Switzerland', 'Lüstlingen'), null); // unverifiable place
});

test('matchRegion: Polish voivodeships', () => {
  assert.equal(matchRegion('Poland', 'Kujawsko-Pomorskie')?.name, 'Kujawsko-Pomorskie');
  assert.equal(matchRegion('Poland', 'Nr Wrześni'), null); // town, voivodeship not named
});

test('matchRegion: French departments/regions, incl. hyphen normalization', () => {
  assert.equal(matchRegion('France', 'Pas-de-Calais')?.name, 'Pas-de-Calais');
  assert.equal(matchRegion('France', 'Seine et Marne')?.name, 'Seine-et-Marne'); // no hyphen in source
  assert.equal(matchRegion('France', 'Nr Issoire in Puy-de-Dôme')?.name, 'Puy-de-Dôme');
  assert.equal(matchRegion('France', 'Nr Chauvigny. Vienne')?.name, 'Vienne');
  assert.equal(matchRegion('France', 'Bourgogne')?.name, 'Bourgogne');
  assert.equal(matchRegion('France', 'Nr Saint Hippolyte'), null); // town
});

test('matchRegion: Belgian provinces', () => {
  assert.equal(matchRegion('Belgium', 'nr Antwerp')?.name, 'Antwerp');
  assert.equal(matchRegion('Belgium', 'North East Momalle'), null); // village, no province named
});

test('matchRegion: Brazilian states, incl. southern-hemisphere latitude', () => {
  const sc = matchRegion('Brazil', 'Santa Catarina');
  assert.equal(sc?.name, 'Santa Catarina');
  assert.ok(sc!.lat < 0);
  assert.equal(matchRegion('Brazil', 'SC')?.name, 'Santa Catarina');
  assert.equal(matchRegion('Brazil', 'Nr Paraná')?.name, 'Paraná');
  assert.equal(matchRegion('Brazil', 'Ipuaçu'), null); // city, not the state name
});

test('matchRegion: country guard prevents cross-table collisions', () => {
  // Georgia (US state) must not match for a record whose country is Georgia-the-country.
  assert.equal(matchRegion('Georgia', 'Georgia'), null);
  // A German region must not match under the wrong country.
  assert.equal(matchRegion('France', 'Bavaria'), null);
  // A region for a country with no gazetteer table at all — deliberately unlocated.
  assert.equal(matchRegion('Peru', 'Nazca'), null);
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
