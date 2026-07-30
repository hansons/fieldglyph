import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveTags } from '../../src/enrich/tags.ts';
import { TAG_VOCABULARY } from '../../src/enrich/tagVocabulary.ts';

test('deriveTags: null for missing text, [] for text with no shape words', () => {
  assert.equal(deriveTags(null), null);
  assert.equal(deriveTags('   '), null);
  assert.deepEqual(deriveTags('The farmer harvested the field quickly.'), []);
});

test('deriveTags: "crop circle" phrase alone does not produce the circle tag', () => {
  assert.deepEqual(deriveTags('A crop circle appeared overnight.'), []);
  // ...but an actual described circle does.
  assert.deepEqual(deriveTags('A crop circle appeared: one large circle with two rings.'), [
    'circle',
    'ring',
  ]);
});

test('deriveTags: multi-tag description', () => {
  const tags = deriveTags(
    'A pictogram consisting of a dumbbell, three grapeshot circles and a spiral lay.',
  );
  assert.deepEqual(tags, ['circle', 'dumbbell', 'grapeshot', 'pictogram', 'spiral']);
});

test('deriveTags: era markers', () => {
  assert.ok(deriveTags('A Julia Set fractal of 151 circles')?.includes('fractal'));
  assert.ok(deriveTags('A flower of life mandala pattern')?.includes('mandala'));
  assert.ok(deriveTags('resembling a celtic cross')?.includes('celtic'));
});

test('tag vocabulary: ids are unique and kebab-case', () => {
  const ids = TAG_VOCABULARY.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.ok(/^[a-z][a-z-]*$/.test(id), id);
});
