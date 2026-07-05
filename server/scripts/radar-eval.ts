/**
 * Radar parsing-accuracy eval.
 *
 * Confirms the faster extraction model (Haiku 4.5) parses scouting queries at
 * least as well as the previous model, by running a golden set of queries through
 * parseScoutingQuery and scoring the extracted filters against expectations.
 *
 * Requires ANTHROPIC_API_KEY (it calls the real API — costs a few cents per run).
 *
 *   cd server
 *   # the new (default) model:
 *   npx ts-node --project tsconfig.json scripts/radar-eval.ts
 *   # A/B against the old model:
 *   npx ts-node --project tsconfig.json scripts/radar-eval.ts --model claude-opus-4-6
 *   npx ts-node --project tsconfig.json scripts/radar-eval.ts --model claude-sonnet-5
 */

import dotenv from 'dotenv';
dotenv.config();
import { parseScoutingQuery, RADAR_MODEL } from '../src/data/radarParse';
import type { RadarFilters } from '../src/data/radarSearch';

interface Case { query: string; expect: Partial<RadarFilters>; }

// Golden set — expectations are LENIENT on purpose (location can be city or state;
// position is matched loosely, since downstream alias-matching normalizes it).
const GOLDEN: Case[] = [
  { query: 'Show me left-footed strikers under 19 in Maharashtra with 10+ goals',
    expect: { sport: 'FOOTBALL', position: 'striker', maxAge: 18, state: 'Maharashtra', minGoals: 10 } },
  { query: 'Find basketball point guards in Delhi between ages 20-25',
    expect: { sport: 'BASKETBALL', position: 'guard', minAge: 20, maxAge: 25, state: 'Delhi' } },
  { query: 'Cricket fast bowlers in Tamil Nadu with 20+ wickets',
    expect: { sport: 'CRICKET', position: 'bowler', state: 'Tamil Nadu', minWickets: 20 } },
  { query: 'Football goalkeepers under 22 in Goa',
    expect: { sport: 'FOOTBALL', position: 'goalkeeper', maxAge: 21, state: 'Goa' } },
  { query: 'Basketball forwards in Karnataka with 15+ points',
    expect: { sport: 'BASKETBALL', position: 'forward', state: 'Karnataka', minPoints: 15 } },
  { query: 'cricket coaches in Mumbai',
    expect: { sport: 'CRICKET', role: 'COACH', city: 'Mumbai' } },
  { query: 'point guards with 300+ points and 80+ assists in Pune',
    expect: { sport: 'BASKETBALL', position: 'guard', minPoints: 300, minAssists: 80, city: 'Pune' } },
  { query: 'swimmers in Bengaluru',
    expect: { sport: 'SWIMMING', city: 'Bengaluru' } },
  { query: 'show me the top 20 basketball players in Chennai',
    expect: { sport: 'BASKETBALL', city: 'Chennai', limit: 20 } },
  { query: 'strikers under 18',
    expect: { sport: 'FOOTBALL', position: 'striker', maxAge: 17 } },
];

function checkCase(expect: Partial<RadarFilters>, actual: any): { matched: string[]; missed: string[] } {
  const matched: string[] = [];
  const missed: string[] = [];
  for (const [key, val] of Object.entries(expect)) {
    let ok = false;
    if (key === 'state' || key === 'city') {
      const v = String(val).toLowerCase();
      ok = [actual?.city, actual?.state].some((x) => typeof x === 'string' && x.toLowerCase() === v);
    } else if (key === 'position') {
      const a = actual?.position;
      ok = typeof a === 'string' &&
        (a.toLowerCase().includes(String(val).toLowerCase()) || String(val).toLowerCase().includes(a.toLowerCase()));
    } else if (typeof val === 'number') {
      ok = actual?.[key] === val;
    } else {
      ok = typeof actual?.[key] === 'string' && (actual[key] as string).toLowerCase() === String(val).toLowerCase();
    }
    (ok ? matched : missed).push(key);
  }
  return { matched, missed };
}

async function main() {
  const args = process.argv.slice(2);
  const modelIdx = args.indexOf('--model');
  const model = modelIdx !== -1 ? args[modelIdx + 1] : RADAR_MODEL;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('\nANTHROPIC_API_KEY is not set. Export it (or add to server/.env) and re-run.\n');
    process.exit(1);
  }

  console.log(`\n── Radar parsing eval · model: ${model} ──\n`);
  let fullMatches = 0, fields = 0, hits = 0;

  for (const c of GOLDEN) {
    let actual: RadarFilters | null = null;
    try {
      actual = await parseScoutingQuery(c.query, { model });
    } catch (err: any) {
      console.log(`✖ ${c.query}\n   ERROR: ${err?.message ?? err}`);
      continue;
    }
    const { matched, missed } = checkCase(c.expect, actual);
    fields += matched.length + missed.length;
    hits += matched.length;
    const full = missed.length === 0;
    if (full) fullMatches++;
    console.log(`${full ? '✔' : '•'} ${c.query}`);
    console.log(`   → ${JSON.stringify(actual)}`);
    if (!full) console.log(`   missed: ${missed.join(', ')}`);
  }

  console.log(`\n── ${model} ──`);
  console.log(`   exact-query matches: ${fullMatches}/${GOLDEN.length}`);
  console.log(`   field accuracy:      ${hits}/${fields} (${((hits / fields) * 100).toFixed(0)}%)`);
  console.log('\nRun with --model claude-opus-4-6 to compare against the previous model.\n');
}

main().catch((e) => { console.error('eval failed:', e); process.exit(1); });
