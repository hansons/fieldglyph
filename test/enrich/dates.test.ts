import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isYearSane, repairDate } from '../../src/enrich/dates.ts';

test('isYearSane: window 1500-2030', () => {
  assert.equal(isYearSane('1590'), true); // Assen legend — genuine
  assert.equal(isYearSane('2026-07-12'), true);
  assert.equal(isYearSane('0808'), false);
  assert.equal(isYearSane('2077'), false);
  assert.equal(isYearSane(null), true); // absent is unknown, not insane
});

test('repairDate: recovers 0808 as 8 August under the URL year (the known cca record)', () => {
  const fix = repairDate('0808', 'https://www.cropcirclearchives.co.uk/archives/2008/080808/080808.html');
  assert.equal(fix.date, '2008-08-08');
  assert.equal(fix.precision, 'day');
});

test('repairDate: falls back to URL year when digits are not a plausible day/month', () => {
  const fix = repairDate('9999', 'https://www.cropcirclearchives.co.uk/archives/1999/something.html');
  assert.equal(fix.date, '1999');
  assert.equal(fix.precision, 'year');
});

test('repairDate: clears the date when no year is recoverable', () => {
  const fix = repairDate('0808', 'https://example.test/no-year-here.html');
  assert.equal(fix.date, null);
  assert.equal(fix.precision, 'unknown');
});
