import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sportsMatching, personSearchOr } from './matchQuery';

test('BUG FIX: "football" maps to the FOOTBALL sport (was matched against name/bio only)', () => {
  assert.deepEqual(sportsMatching('football'), ['FOOTBALL']);
});

test('partial and alias sport terms resolve', () => {
  assert.deepEqual(sportsMatching('foot'), ['FOOTBALL']);
  assert.deepEqual(sportsMatching('soccer'), ['FOOTBALL']);     // alias
  assert.deepEqual(sportsMatching('hockey'), ['FIELD_HOCKEY']); // multi-word enum
  assert.deepEqual(sportsMatching('hoops'), ['BASKETBALL']);    // alias
  assert.ok(sportsMatching('tennis').includes('TENNIS'));
  assert.ok(sportsMatching('tennis').includes('TABLE_TENNIS')); // both, correctly
});

test('non-sport / too-short terms map to no sport (fall back to text fields only)', () => {
  assert.deepEqual(sportsMatching('aarav'), []);
  assert.deepEqual(sportsMatching('go'), []); // < 3 chars, not a confident sport
});

test('personSearchOr matches name, bio, position, location — and sport when it resolves', () => {
  const or = personSearchOr('football')!;
  const fields = or.flatMap((c) => Object.keys(c));
  for (const f of ['name', 'bio', 'position', 'location', 'sport']) {
    assert.ok(fields.includes(f), `search must cover ${f}`);
  }
  assert.deepEqual(or.find((c) => 'sport' in c), { sport: { in: ['FOOTBALL'] } });
});

test('a plain name search covers the text fields but adds no sport clause', () => {
  const or = personSearchOr('Aarav')!;
  assert.equal(or.some((c) => 'sport' in c), false);
  assert.deepEqual(or.find((c) => 'name' in c), { name: { contains: 'Aarav', mode: 'insensitive' } });
});

test('empty / whitespace term → null (caller omits the OR)', () => {
  assert.equal(personSearchOr(''), null);
  assert.equal(personSearchOr('   '), null);
});
