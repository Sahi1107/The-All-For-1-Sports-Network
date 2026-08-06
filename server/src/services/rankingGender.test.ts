import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  boardGenderFromQuery, tournamentBoardGender, tournamentOnBoard, shouldFilterByPlayerGender,
} from './rankingGender';
import { genderFromCategory } from './bulkProvision';

// The bug these pin: a women's tournament appeared in full under the MEN'S tab,
// because the board was chosen from each player's `User.gender` (usually unset,
// and unset was included on whichever board you were viewing) and the
// tournament's own category was never consulted.

// ─── Category parsing ────────────────────────────────────────────────────────

test('the fixed admin-form categories parse', () => {
  assert.equal(genderFromCategory('MEN'), 'MALE');
  assert.equal(genderFromCategory('WOMEN'), 'FEMALE');
  assert.equal(genderFromCategory('MIXED'), null);
  assert.equal(genderFromCategory('OPEN'), null);
});

test("free-text spellings parse — the organiser's editor is not a fixed list", () => {
  // Every one of these previously returned null, which is what let a real
  // women's tournament read as uncategorised.
  for (const s of ["Men's", 'Mens', 'MEN’S', 'male', 'Males', 'Boys', 'M', ' men ']) {
    assert.equal(genderFromCategory(s), 'MALE', `${JSON.stringify(s)} should be MALE`);
  }
  for (const s of ["Women's", 'Womens', 'WOMEN’S', 'female', 'Females', 'Girls', 'Ladies', 'W', ' women ']) {
    assert.equal(genderFromCategory(s), 'FEMALE', `${JSON.stringify(s)} should be FEMALE`);
  }
});

test('"WOMEN" is never mistaken for "MEN"', () => {
  // Substring matching here would put every women's tournament on the men's board
  // — the exact bug, reintroduced.
  assert.equal(genderFromCategory('WOMEN'), 'FEMALE');
  assert.equal(genderFromCategory("Women's"), 'FEMALE');
  assert.notEqual(genderFromCategory('WOMEN'), 'MALE');
});

test('unrecognised categories make no claim rather than guessing', () => {
  for (const s of ['', '   ', 'U19', 'Corporate', 'Division A', null]) {
    assert.equal(genderFromCategory(s as string | null), null);
  }
});

// ─── Board selection ─────────────────────────────────────────────────────────

test('the requested board is normalised from the query', () => {
  assert.equal(boardGenderFromQuery('MALE'), 'MALE');
  assert.equal(boardGenderFromQuery('FEMALE'), 'FEMALE');
  assert.equal(boardGenderFromQuery(undefined), null);
  assert.equal(boardGenderFromQuery('anything'), null);
});

test('a tournament claims the board its category names', () => {
  assert.equal(tournamentBoardGender('WOMEN'), 'FEMALE');
  assert.equal(tournamentBoardGender('MEN'), 'MALE');
  assert.equal(tournamentBoardGender('MIXED'), null);
});

test("THE BUG: a women's tournament does NOT appear on the men's board", () => {
  assert.equal(tournamentOnBoard('WOMEN', 'MALE'), false);
  assert.equal(tournamentOnBoard("Women's", 'MALE'), false);
  assert.equal(tournamentOnBoard('WOMEN', 'FEMALE'), true);
});

test("a men's tournament does NOT appear on the women's board", () => {
  assert.equal(tournamentOnBoard('MEN', 'FEMALE'), false);
  assert.equal(tournamentOnBoard("Men's", 'FEMALE'), false);
  assert.equal(tournamentOnBoard('MEN', 'MALE'), true);
});

test('an uncategorised tournament appears on both boards', () => {
  // Losing these outright would hide real results from every organiser who left
  // the field blank; their players are separated by profile gender instead.
  for (const cat of ['MIXED', 'OPEN', '', null]) {
    assert.equal(tournamentOnBoard(cat, 'MALE'), true);
    assert.equal(tournamentOnBoard(cat, 'FEMALE'), true);
  }
});

test('with no board requested every tournament is included', () => {
  for (const cat of ['MEN', 'WOMEN', 'MIXED', null]) {
    assert.equal(tournamentOnBoard(cat, null), true);
  }
});

// ─── Which filter applies ────────────────────────────────────────────────────

test('a categorised tournament does NOT re-filter by player gender', () => {
  // The category already settled the board. Re-applying the player filter would
  // drop players whose profile gender contradicts the event they actually played.
  assert.equal(shouldFilterByPlayerGender('WOMEN'), false);
  assert.equal(shouldFilterByPlayerGender('MEN'), false);
});

test('an uncategorised tournament DOES filter by player gender', () => {
  for (const cat of ['MIXED', 'OPEN', '', null]) {
    assert.equal(shouldFilterByPlayerGender(cat), true);
  }
});

// ─── The two rules together ──────────────────────────────────────────────────

test('every category × board combination resolves consistently', () => {
  const cases: Array<[string | null, 'MALE' | 'FEMALE', boolean, boolean]> = [
    // category, board, appears?, filters by player gender?
    ['MEN',    'MALE',   true,  false],
    ['MEN',    'FEMALE', false, false],
    ['WOMEN',  'FEMALE', true,  false],
    ['WOMEN',  'MALE',   false, false],
    ['MIXED',  'MALE',   true,  true],
    ['MIXED',  'FEMALE', true,  true],
    [null,     'MALE',   true,  true],
    [null,     'FEMALE', true,  true],
  ];
  for (const [cat, board, appears, filters] of cases) {
    assert.equal(tournamentOnBoard(cat, board), appears, `${cat} on ${board} board`);
    assert.equal(shouldFilterByPlayerGender(cat), filters, `${cat} player filter`);
  }
});
