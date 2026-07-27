import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relevanceScore, rankByRelevance, sanitizeTerm } from './rank';

// ─── relevanceScore ──────────────────────────────────────────────────────────
test('relevanceScore: exact < name-prefix < word-prefix < substring', () => {
  assert.equal(relevanceScore('Aarush', 'aarush'), 0);       // exact (case-insensitive)
  assert.equal(relevanceScore('Aarush Kashyap', 'aar'), 1);  // name prefix
  assert.equal(relevanceScore('Aarush Kashyap', 'kash'), 2); // last-name / word prefix
  assert.equal(relevanceScore('Shreyas Kumar', 'yas'), 3);   // substring elsewhere
});
test('relevanceScore: empty term is least relevant, never throws on null name', () => {
  assert.equal(relevanceScore('Anything', ''), 3);
  assert.equal(relevanceScore(null as any, 'x'), 3);
});

// ─── rankByRelevance ─────────────────────────────────────────────────────────
const mk = (name: string) => ({ name });

test('rankByRelevance floats prefix matches above substring matches', () => {
  const items = [mk('Manish'), mk('Aman'), mk('Amar')]; // for "am": Aman/Amar prefix, Manish substring
  const out = rankByRelevance(items, 'am', (x) => x.name, 5).map((x) => x.name);
  assert.deepEqual(out, ['Aman', 'Amar', 'Manish']);
});
test('rankByRelevance is stable — equal scores keep original (DB) order', () => {
  const items = [mk('Bravo'), mk('Bravado'), mk('Brave')]; // all "bra" prefix → same score
  const out = rankByRelevance(items, 'bra', (x) => x.name, 5).map((x) => x.name);
  assert.deepEqual(out, ['Bravo', 'Bravado', 'Brave']);
});
test('rankByRelevance caps to the limit', () => {
  const items = Array.from({ length: 12 }, (_, i) => mk(`Team ${i}`));
  assert.equal(rankByRelevance(items, 'team', (x) => x.name, 5).length, 5);
});
test('rankByRelevance handles empty input / zero limit', () => {
  assert.deepEqual(rankByRelevance([], 'x', (x: any) => x.name, 5), []);
  assert.deepEqual(rankByRelevance([mk('A')], 'a', (x) => x.name, 0), []);
});

// ─── sanitizeTerm ────────────────────────────────────────────────────────────
test('sanitizeTerm strips SQL-LIKE wildcards and trims', () => {
  assert.equal(sanitizeTerm('  aar%_\\ '), 'aar');
  assert.equal(sanitizeTerm('%%%'), '');      // wildcard-only → empty (route returns no results)
  assert.equal(sanitizeTerm('Kashyap'), 'Kashyap');
});
