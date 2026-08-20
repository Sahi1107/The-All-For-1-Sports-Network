import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandFor, ageGroup, initialsOf, slugFor, per, pct, type CardIdentity, type MatchCardData } from './data';
import { renderCardPng } from './render';
import {
  matchCardStory, matchCardSquare, tournamentCardStory, careerCardStory,
  rankingCardStory, rankingCardSquare, profileCardStory,
} from './cards';

// ── Age bands: the child-safety gate, enforced server-side ────────────────────
const athlete = (over: Record<string, unknown>) => ({ role: 'ATHLETE', dateOfBirth: null, age: null, guardianManaged: false, ...over });

test('age bands fail closed', () => {
  assert.equal(bandFor(athlete({ age: 12 })), 'BLOCKED', 'under-13 gets no card');
  assert.equal(bandFor(athlete({ age: 15, guardianManaged: true })), 'BLOCKED', 'guardian-managed gets no card');
  assert.equal(bandFor(athlete({ age: 25, role: 'SCOUT' })), 'BLOCKED', 'cards are for athletes');
  assert.equal(bandFor(athlete({ age: null })), 'MINOR', 'unknown age fails closed into the minor band (no photo)');
  assert.equal(bandFor(athlete({ age: 16 })), 'MINOR');
  assert.equal(bandFor(athlete({ age: 18 })), 'ADULT');
});

test('DOB beats the stale stored age column', () => {
  const dob17yearsAgo = new Date();
  dob17yearsAgo.setUTCFullYear(dob17yearsAgo.getUTCFullYear() - 17);
  dob17yearsAgo.setUTCDate(dob17yearsAgo.getUTCDate() - 1);
  assert.equal(bandFor(athlete({ dateOfBirth: dob17yearsAgo, age: 18 })), 'MINOR', 'stored age says 18 but DOB says 17 → minor');
});

test('age groups', () => {
  assert.equal(ageGroup({ dateOfBirth: null, age: 13 }), 'U-14');
  assert.equal(ageGroup({ dateOfBirth: null, age: 15 }), 'U-16');
  assert.equal(ageGroup({ dateOfBirth: null, age: 17 }), 'U-18');
  assert.equal(ageGroup({ dateOfBirth: null, age: 22 }), 'OPEN');
  assert.equal(ageGroup({ dateOfBirth: null, age: null }), 'OPEN');
});

test('identity helpers', () => {
  assert.equal(initialsOf('Arjun Mehta'), 'AM');
  assert.equal(initialsOf('Ronaldinho'), 'RO');
  assert.equal(slugFor('Arjun Mehta', '9f2c41d0-7b3a-4c8b-02e9-1f6d2b9f04c7'), 'arjun-mehta-9f2c41d07b3a');
  assert.equal(per(63, 3), 21);
  assert.equal(pct(36, 100), 36);
  assert.equal(pct(1, 0), 0, 'zero attempts renders 0, never NaN');
});

// ── Render: every template produces a real PNG from fixture data ──────────────
const identity: CardIdentity = {
  name: 'Arjun Mehta', initials: 'AM', gradient: ['#6366f1', '#4338ca'], avatarDataUri: null,
  state: 'Goa', position: 'Guard', verified: true, slug: 'arjun-mehta-9f2c41d07b3a',
  sub: 'GUARD · CORLIM HAWKS · GOA',
};

const matchData: MatchCardData = {
  hero: { value: 27, label: 'POINTS' },
  rail: [{ value: 11, label: 'REBOUNDS' }, { value: 6, label: 'ASSISTS' }, { value: 3, label: 'STEALS' }],
  roundLine: 'SEMI-FINAL WIN', metaLine: 'GOA MONSOON LEAGUE · 18 AUG',
  playerTeam: { name: 'Corlim Hawks', score: 68 }, opponent: { name: 'Panjim Kings', score: 61 }, result: 'W',
};

const isPng = (buf: Buffer) => buf.length > 10_000 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;

test('all card templates render to PNG', async () => {
  const cases: [string, unknown, 'story' | 'square'][] = [
    ['match story', matchCardStory(matchData, identity), 'story'],
    ['match square', matchCardSquare({ ...matchData, metaLine: 'SEMI-FINAL · GOA MONSOON LEAGUE' }, identity), 'square'],
    ['tournament', tournamentCardStory({
      tournamentName: 'Goa Monsoon League', datesLine: 'JUL-AUG 2026', games: 7, record: '5-2',
      tiles: [
        { value: '21.1', label: 'POINTS / GAME', sub: '148 total' },
        { value: '8.0', label: 'REBOUNDS / GAME', sub: '56 total' },
        { value: '4.6', label: 'ASSISTS / GAME', sub: '32 total' },
        { value: '48.2%', label: 'FIELD GOAL', sub: '62 / 129 made' },
      ],
    }, identity), 'story'],
    ['career', careerCardStory({
      sinceYear: 2024, matches: 34,
      heroCells: [
        { value: '34', label: 'MATCHES' }, { value: '18.0', label: 'PTS / GAME' },
        { value: '7.3', label: 'REB / GAME' }, { value: '4.1', label: 'AST / GAME' },
      ],
      receipts: [
        { name: 'Goa Monsoon League', meta: '2026 · 7 matches', right: '21.1 PTS · 8.0 REB' },
        { name: 'Mumbai Open', meta: '2025 · 12 matches', right: '17.4 PTS · 7.1 REB' },
      ],
      splitsLine: 'FG 47.6% · 3P 36.4% · FT 71.9%', totalLine: '612 CAREER PTS',
    }, identity), 'story'],
    ['ranking story', rankingCardStory({ rank: 2, boardLabel: 'GUARD BOARD', tournamentLine: 'GOA MONSOON LEAGUE 2026', boardSize: 38, score: 91.2 }, identity), 'story'],
    ['ranking square', rankingCardSquare({ rank: 2, boardLabel: 'GUARD BOARD', tournamentLine: 'GOA MONSOON LEAGUE 2026', boardSize: 38, score: 91.2 }, identity), 'square'],
    ['profile', profileCardStory({
      firstLine: 'ARJUN', secondLine: 'MEHTA', metaLine: 'GUARD · CORLIM HAWKS · OPEN · GOA',
      chips: [{ value: '34', label: 'MATCHES' }, { value: '18.0', label: 'PTS / GAME' }, { value: '#3', label: 'GUARD BOARD' }],
      dayOne: false, seasonLine: 'SEASON 2026-27', sportLabel: 'BASKETBALL',
    }, identity), 'story'],
    ['profile day-one', profileCardStory({
      firstLine: 'RIYA', secondLine: 'NAIR', metaLine: 'FORWARD · GOA',
      chips: [], dayOne: true, seasonLine: 'SEASON 2026-27', sportLabel: 'FOOTBALL',
    }, { ...identity, name: 'Riya Nair', initials: 'RN', verified: false, sub: 'FORWARD · GOA' }), 'story'],
  ];
  for (const [label, element, format] of cases) {
    const png = await renderCardPng(element, format);
    assert.ok(isPng(png), `${label}: renders a real PNG (got ${png.length} bytes)`);
  }
});

test('a loss renders without the W tag and without volt on the score', async () => {
  const loss: MatchCardData = { ...matchData, roundLine: 'FINAL', result: 'L', playerTeam: { name: 'Corlim Hawks', score: 61 }, opponent: { name: 'Panjim Kings', score: 68 } };
  const png = await renderCardPng(matchCardStory(loss, identity), 'story');
  assert.ok(isPng(png));
});
