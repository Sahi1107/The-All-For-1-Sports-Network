import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getOrCompute, bustTournament, bustAllTournaments } from './tournamentCache';

test('computes once, then serves from cache', async () => {
  bustAllTournaments();
  let calls = 0;
  const compute = async () => { calls++; return { n: calls }; };
  assert.deepEqual(await getOrCompute('t1', 'fixtures', compute), { n: 1 });
  assert.deepEqual(await getOrCompute('t1', 'fixtures', compute), { n: 1 }); // cached
  assert.equal(calls, 1);
});

test('KEY: single-flight — concurrent misses share ONE computation (no stampede)', async () => {
  bustAllTournaments();
  let calls = 0;
  const compute = async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return calls; };
  const [a, b, c] = await Promise.all([
    getOrCompute('t2', 'leaders', compute),
    getOrCompute('t2', 'leaders', compute),
    getOrCompute('t2', 'leaders', compute),
  ]);
  assert.equal(calls, 1);                 // 3 concurrent misses → 1 DB computation
  assert.deepEqual([a, b, c], [1, 1, 1]);
});

test('views + tournaments are isolated; bustTournament hits one tournament only', async () => {
  bustAllTournaments();
  let t2 = 0, t3 = 0;
  await getOrCompute('t2', 'fixtures', async () => ++t2);
  await getOrCompute('t3', 'fixtures', async () => ++t3);
  bustTournament('t2');
  await getOrCompute('t2', 'fixtures', async () => ++t2); // recomputes
  await getOrCompute('t3', 'fixtures', async () => ++t3); // still cached
  assert.equal(t2, 2);
  assert.equal(t3, 1);
});

test('bustAllTournaments forces recompute everywhere', async () => {
  bustAllTournaments();
  let n = 0;
  await getOrCompute('tX', 'teams', async () => ++n);
  bustAllTournaments();
  await getOrCompute('tX', 'teams', async () => ++n);
  assert.equal(n, 2);
});

test('KEY: a write DURING an in-flight compute is not cached (results appear immediately)', async () => {
  bustAllTournaments();
  let calls = 0;
  const slow = async () => { calls++; await new Promise((r) => setTimeout(r, 30)); return calls; };
  const p = getOrCompute('t4', 'fixtures', slow); // start a slow compute
  await new Promise((r) => setTimeout(r, 5));
  bustTournament('t4');                            // a write lands mid-compute
  await p;                                         // finishes, but must NOT be cached (generation changed)
  await getOrCompute('t4', 'fixtures', slow);      // must recompute with fresh data
  assert.equal(calls, 2);                          // stale in-flight result was never served from cache
});

test('prefix separator prevents cross-tournament busting (id "t" vs "t2")', async () => {
  bustAllTournaments();
  let a = 0, b = 0;
  await getOrCompute('t', 'fixtures', async () => ++a);
  await getOrCompute('t2', 'fixtures', async () => ++b);
  bustTournament('t');
  await getOrCompute('t', 'fixtures', async () => ++a);  // recomputes
  await getOrCompute('t2', 'fixtures', async () => ++b); // untouched
  assert.equal(a, 2);
  assert.equal(b, 1);
});
