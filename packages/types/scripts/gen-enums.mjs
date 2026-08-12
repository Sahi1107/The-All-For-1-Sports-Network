// Generates packages/types/src/enums.ts from the Prisma schema — the DB is the
// single source of truth for enum values. Run: `npm run gen -w @af1/types`.
// The enums.drift.test.ts guard fails if src/enums.ts ever drifts from the schema.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const schemaPath = fileURLToPath(new URL('../../../server/prisma/schema.prisma', import.meta.url));
const outPath = fileURLToPath(new URL('../src/enums.ts', import.meta.url));

const schema = readFileSync(schemaPath, 'utf8');

/** Parse `enum Name { A B // comment ... }` blocks into { Name: [values] }. */
export function parseEnums(src) {
  const out = {};
  const re = /enum\s+(\w+)\s*\{([\s\S]*?)\}/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const name = m[1];
    const values = m[2]
      .split('\n')
      .map((l) => l.replace(/\/\/.*$/, '').trim()) // strip trailing comments
      .filter((l) => l.length > 0);
    out[name] = values;
  }
  return out;
}

const enums = parseEnums(schema);
const names = Object.keys(enums);

const body = names
  .map((name) => {
    const vals = enums[name].map((v) => `'${v}'`).join(', ');
    return `export const ${name}Values = [${vals}] as const;\nexport type ${name} = (typeof ${name}Values)[number];`;
  })
  .join('\n\n');

const registry = `export const ENUMS = {\n${names.map((n) => `  ${n}: ${n}Values,`).join('\n')}\n} as const;`;

const file = `// AUTO-GENERATED from server/prisma/schema.prisma — do not edit by hand.
// Regenerate: npm run gen -w @af1/types   (guarded by enums.drift.test.ts)
/* eslint-disable */

${body}

${registry}
`;

writeFileSync(outPath, file);
console.log(`[gen-enums] wrote ${names.length} enums → src/enums.ts`);
