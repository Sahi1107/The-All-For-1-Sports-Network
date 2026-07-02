import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePosition, positionMatchAliases } from './positions';

test('basketball: point guard and PG collapse to Guard', () => {
  assert.equal(normalizePosition('BASKETBALL', 'point guard'), 'Guard');
  assert.equal(normalizePosition('BASKETBALL', 'PG'), 'Guard');
  assert.equal(normalizePosition('BASKETBALL', 'shooting guard'), 'Guard');
  assert.equal(normalizePosition('BASKETBALL', 'Guard'), 'Guard');
  assert.equal(normalizePosition('BASKETBALL', 'power forward'), 'Forward');
  assert.equal(normalizePosition('BASKETBALL', 'centre'), 'Center');
});

test('the reported bug: "point guard" query matches a stored "Guard"', () => {
  const aliases = positionMatchAliases('BASKETBALL', 'point guard');
  assert.ok(aliases, 'aliases should resolve');
  // The DB match is case-insensitive equality against these; a stored "Guard"
  // is covered by the canonical, and legacy "Point Guard" / "PG" rows too.
  assert.ok(aliases!.includes('guard'));
  assert.ok(aliases!.includes('point guard'));
  assert.ok(aliases!.includes('pg'));
});

test('football: striker and its abbreviations resolve to Forward', () => {
  assert.equal(normalizePosition('FOOTBALL', 'striker'), 'Forward');
  assert.equal(normalizePosition('FOOTBALL', 'ST'), 'Forward');
  assert.equal(normalizePosition('FOOTBALL', 'centre forward'), 'Forward');
  assert.equal(normalizePosition('FOOTBALL', 'goalkeeper'), 'Goalkeeper');
  assert.equal(normalizePosition('FOOTBALL', 'GK'), 'Goalkeeper');
});

test('cricket: keeper resolves to Wicketkeeper (sport disambiguates from football)', () => {
  assert.equal(normalizePosition('CRICKET', 'keeper'), 'Wicketkeeper');
  assert.equal(normalizePosition('CRICKET', 'wicket-keeper'), 'Wicketkeeper');
  assert.equal(normalizePosition('CRICKET', 'fast bowler'), 'Bowler');
  assert.equal(normalizePosition('CRICKET', 'spinner'), 'Bowler');
  // Same word, different sport → different canonical.
  assert.equal(normalizePosition('FOOTBALL', 'keeper'), 'Goalkeeper');
});

test('unknown sport or position returns null so the caller falls back to substring', () => {
  assert.equal(normalizePosition('SWIMMING', 'freestyle'), null);
  assert.equal(positionMatchAliases('SWIMMING', 'freestyle'), null);
  assert.equal(normalizePosition('BASKETBALL', 'left-handed'), null);
  assert.equal(normalizePosition('BASKETBALL', ''), null);
  assert.equal(normalizePosition(undefined, 'point guard'), null);
});

test('a longer phrase containing an alias still resolves', () => {
  assert.equal(normalizePosition('FOOTBALL', 'attacking midfielder / playmaker'), 'Midfielder');
});
