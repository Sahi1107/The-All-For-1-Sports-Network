import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derivePlayerStats } from './trackerStats';

// Publish-time derivation is where a tracked match becomes the athlete's verified
// record. These pin the newly-tracked basketball metrics (off/def rebounds,
// distinct 2-pointers, fouls, turnovers) and that a CORRECTION re-derives cleanly.

const bbState = (players: Record<string, Record<string, number>>) => ({ players });
const only = (rows: ReturnType<typeof derivePlayerStats>, id: string): Record<string, number> =>
  (rows.find((r) => r.userId === id)!.stats ?? {}) as Record<string, number>;

test('rebounds are split into offensive/defensive and a total is published', () => {
  const rows = derivePlayerStats('BASKETBALL', bbState({ p1: { oreb: 3, dreb: 5, reb: 8 } }));
  const s = only(rows, 'p1');
  assert.equal(s.offRebounds, 3);
  assert.equal(s.defRebounds, 5);
  assert.equal(s.rebounds, 8);
});

test('total rebounds fall back to off+def when an older blob lacks reb', () => {
  const rows = derivePlayerStats('BASKETBALL', bbState({ p1: { oreb: 2, dreb: 4 } }));
  assert.equal(only(rows, 'p1').rebounds, 6);
});

test('2-pointers are published distinctly from 3-pointers (fg total minus 3pt)', () => {
  // 7 field goals made, 2 of them threes → 5 twos, 2 threes.
  const rows = derivePlayerStats('BASKETBALL', bbState({ p1: { fg: 7, tp: 2, pts: 16 } }));
  const s = only(rows, 'p1');
  assert.equal(s.twoPointers, 5);
  assert.equal(s.threePointers, 2);
  assert.equal(s.points, 16);
});

test('twoPointers never goes negative if tp somehow exceeds fg', () => {
  const rows = derivePlayerStats('BASKETBALL', bbState({ p1: { fg: 1, tp: 3 } }));
  assert.equal(only(rows, 'p1').twoPointers, 0);
});

test('personal fouls and turnovers flow through to the published record', () => {
  const rows = derivePlayerStats('BASKETBALL', bbState({ p1: { pf: 4, to: 3 } }));
  const s = only(rows, 'p1');
  assert.equal(s.personalFouls, 4);
  assert.equal(s.turnovers, 3);
});

test('multiple players each derive their own line', () => {
  const rows = derivePlayerStats('BASKETBALL', bbState({
    a: { pts: 10, oreb: 1, dreb: 2, reb: 3, pf: 2 },
    b: { pts: 4, fg: 2, tp: 0, pf: 5 },
  }));
  assert.equal(rows.length, 2);
  assert.equal(only(rows, 'a').offRebounds, 1);
  assert.equal(only(rows, 'b').twoPointers, 2);
  assert.equal(only(rows, 'b').personalFouls, 5);
});

test('CORRECTION: re-deriving from a corrected state yields the corrected record', () => {
  // Scorer mis-assigned a foul + a rebound; correcting the state re-derives cleanly
  // (publish upserts the row, so the athlete's record reflects the fix).
  const before = only(derivePlayerStats('BASKETBALL', bbState({ p1: { pf: 5, oreb: 3, dreb: 4, reb: 7 } })), 'p1');
  assert.equal(before.personalFouls, 5);
  assert.equal(before.offRebounds, 3);

  const after = only(derivePlayerStats('BASKETBALL', bbState({ p1: { pf: 3, oreb: 1, dreb: 4, reb: 5 } })), 'p1');
  assert.equal(after.personalFouls, 3); // no longer fouled out
  assert.equal(after.offRebounds, 1);
  assert.equal(after.rebounds, 5);
});

test('an empty / missing state derives nothing (nothing to publish)', () => {
  assert.deepEqual(derivePlayerStats('BASKETBALL', { players: {} }), []);
  assert.deepEqual(derivePlayerStats('BASKETBALL', null), []);
});
