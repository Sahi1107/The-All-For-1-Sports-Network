import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENUMS } from './enums';

// Drift guard: the generated enums must always match the Prisma schema (the DB
// source of truth). If schema.prisma changes an enum and src/enums.ts isn't
// regenerated (`npm run gen -w @af1/types`), these fail.

const schema = readFileSync(
  join(__dirname, '../../../server/prisma/schema.prisma'),
  'utf8',
);

function parseEnums(src: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const re = /enum\s+(\w+)\s*\{([\s\S]*?)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    out[m[1]] = m[2]
      .split('\n')
      .map((l) => l.replace(/\/\/.*$/, '').trim())
      .filter((l) => l.length > 0);
  }
  return out;
}

const fromSchema = parseEnums(schema);
const pkg = ENUMS as Record<string, readonly string[]>;

test('every Prisma enum is mirrored in @af1/types with identical values', () => {
  for (const [name, values] of Object.entries(fromSchema)) {
    assert.ok(pkg[name], `enum ${name} is in schema.prisma but not @af1/types — run npm run gen -w @af1/types`);
    assert.deepEqual([...pkg[name]], values, `enum ${name} drifted from schema.prisma — run npm run gen -w @af1/types`);
  }
});

test('@af1/types declares no enum the schema does not', () => {
  for (const name of Object.keys(pkg)) {
    assert.ok(name in fromSchema, `@af1/types has enum ${name} not present in schema.prisma`);
  }
});
