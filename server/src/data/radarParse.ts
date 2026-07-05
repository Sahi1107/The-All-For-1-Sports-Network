/**
 * Radar's natural-language → structured-filters extraction.
 *
 * Filter extraction is a shallow structured-output task, so a fast model (Haiku
 * 4.5) with extended thinking OFF and strict tool-schema validation replaces the
 * previous Opus 4.6 + adaptive-thinking call — a large latency/cost win with no
 * relevant loss of parsing quality. `strict: true` guarantees the model's tool
 * input matches the schema exactly.
 *
 * Strict-schema rules (verified against the API): every field is OPTIONAL (the
 * model omits the ones the query doesn't mention), which Anthropic strict allows
 * as long as `additionalProperties: false` is set explicitly. Single-primitive
 * types only — a nullable `type: ["string","null"]` on an enum is rejected.
 *
 * Shared by the route and scripts/radar-eval.ts so both exercise the identical
 * extraction; the eval can override the model to A/B parsing accuracy.
 */

import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';
import type { RadarFilters } from './radarSearch';

/** Model used for filter extraction. Swap to 'claude-sonnet-5' if the eval shows a gap. */
export const RADAR_MODEL = 'claude-haiku-4-5';

const SPORT_ENUM = [
  'BASKETBALL', 'FOOTBALL', 'CRICKET', 'FIELD_HOCKEY', 'BADMINTON', 'ATHLETICS',
  'WRESTLING', 'BOXING', 'SHOOTING', 'WEIGHTLIFTING', 'ARCHERY', 'TENNIS',
  'TABLE_TENNIS', 'RUGBY', 'SWIMMING', 'VOLLEYBALL',
];

export const extractFiltersTool: Anthropic.Tool = {
  name: 'search_athletes',
  description:
    'Extract structured search filters from a natural language scouting query about finding athletes or coaches on an Indian sports platform. Omit any field the query does not mention.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false, // required by strict; also forbids invented fields
    properties: {
      sport: { type: 'string', enum: SPORT_ENUM, description: 'Sport to filter by' },
      role: { type: 'string', enum: ['ATHLETE', 'COACH', 'SCOUT', 'AGENT'], description: 'User role — default ATHLETE' },
      position: { type: 'string', description: 'Playing position (e.g. striker, goalkeeper, point guard, wicketkeeper)' },
      minAge: { type: 'number', description: 'Minimum age (inclusive)' },
      maxAge: { type: 'number', description: 'Maximum age (inclusive). "under 19" means maxAge = 18.' },
      state: { type: 'string', description: 'Indian state or union territory (e.g. Maharashtra, Tamil Nadu, Delhi)' },
      city: { type: 'string', description: 'City to search within' },
      minGoals: { type: 'number', description: 'Minimum total goals — football only' },
      minAssists: { type: 'number', description: 'Minimum total assists — football or basketball' },
      minPoints: { type: 'number', description: 'Minimum total points — basketball only' },
      minRebounds: { type: 'number', description: 'Minimum total rebounds — basketball only' },
      minRuns: { type: 'number', description: 'Minimum total runs — cricket only' },
      minWickets: { type: 'number', description: 'Minimum total wickets — cricket only' },
      limit: { type: 'number', description: 'Max results 1–20 (default 10)' },
    },
  },
};

export const RADAR_SYSTEM =
  'You are a sports scouting assistant for an Indian sports platform. ' +
  'Extract precise search filters from the scouting query. OMIT any field the query does not mention — ' +
  'never output 0, empty strings, or placeholder values for stats, ages, or anything not stated. ' +
  'Age is NOT a stat: "under 19" means maxAge=18; "over 21" means minAge=22; ' +
  '"between 20 and 25" or "ages 20-25" means minAge=20 AND maxAge=25 (never map ages to points/goals/etc). ' +
  '"10+ goals" means minGoals=10; map each stat to its own field and no others. ' +
  'Infer the sport from the position when the sport is not named: ' +
  'strikers, goalkeepers, midfielders, defenders, wingers ⇒ FOOTBALL; ' +
  'point guards, shooting guards, forwards, centers ⇒ BASKETBALL; ' +
  'bowlers, batsmen, wicketkeepers, all-rounders ⇒ CRICKET. ' +
  'Role: if the query asks for coaches set role=COACH, scouts set role=SCOUT, agents set role=AGENT; ' +
  'otherwise it is an athlete search — omit role. ' +
  'Left-footed is a position hint, not a filter — leave it out.';

/**
 * Parse a scouting query into structured filters. Returns null when the model
 * declines to call the tool (unparseable query). Throws if no API key.
 * `opts.model` / `opts.apiKey` let the eval A/B models without touching the route.
 */
export async function parseScoutingQuery(
  query: string,
  opts?: { model?: string; apiKey?: string },
): Promise<RadarFilters | null> {
  const apiKey = opts?.apiKey ?? env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not configured');

  const anthropic = new Anthropic({ apiKey });
  const res = await anthropic.messages.create({
    model: opts?.model ?? RADAR_MODEL,
    max_tokens: 1024,
    // Extended thinking OFF — extraction is shallow; the fast path is the point.
    tool_choice: { type: 'tool', name: 'search_athletes' },
    tools: [extractFiltersTool],
    system: RADAR_SYSTEM,
    messages: [{ role: 'user', content: `Scouting query: "${query.trim()}"` }],
  });

  const toolUse = res.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
  );
  if (!toolUse) return null;

  // Defensive: drop any null/undefined so the engine gets a clean, sparse filter set.
  const raw = toolUse.input as Record<string, unknown>;
  const filters: RadarFilters = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v !== null && v !== undefined) (filters as Record<string, unknown>)[k] = v;
  }
  return filters;
}
