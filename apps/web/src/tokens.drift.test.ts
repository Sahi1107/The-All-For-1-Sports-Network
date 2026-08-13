import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Drift guard: proves client/src/index.css never diverges from the canonical
// design tokens in packages/tokens/tokens.json. index.css stays the source Vite
// and Tailwind read; this test just fails loudly if a colour or font is changed
// in one place and not the other. Mobile reads the same tokens.json as a theme.

const css = readFileSync(fileURLToPath(new URL('./index.css', import.meta.url)), 'utf8');
const tokens = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../packages/tokens/tokens.json', import.meta.url)), 'utf8'),
) as {
  fonts: Record<string, string>;
  color: Record<string, { dark: string; light?: string }>;
};

const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '');

function declsIn(block: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /--([\w-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) out.set(m[1], m[2].trim());
  return out;
}

const themeMatch = css.match(/@theme\s*\{([\s\S]*?)\n\}/);
if (!themeMatch) throw new Error('index.css: @theme { ... } block not found');
const themeDecls = declsIn(stripComments(themeMatch[1]));

// Merge every :root[data-theme="light"] { ... } block for the light overrides.
const lightDecls = new Map<string, string>();
const lightRe = /:root\[data-theme="light"\]\s*\{([\s\S]*?)\}/g;
let lm: RegExpExecArray | null;
while ((lm = lightRe.exec(css)) !== null) {
  for (const [k, v] of declsIn(stripComments(lm[1]))) lightDecls.set(k, v);
}

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

test('fonts in index.css @theme match @af1/tokens', () => {
  for (const [role, value] of Object.entries(tokens.fonts)) {
    const cssVal = themeDecls.get(`font-${role}`);
    assert.ok(cssVal !== undefined, `--font-${role} is missing from index.css @theme`);
    assert.equal(norm(cssVal), norm(value), `--font-${role} drifted from tokens.json`);
  }
});

test('colours in index.css (dark @theme + light overrides) match @af1/tokens', () => {
  for (const [name, entry] of Object.entries(tokens.color)) {
    const darkVal = themeDecls.get(`color-${name}`);
    assert.ok(darkVal !== undefined, `--color-${name} is missing from index.css @theme`);
    assert.equal(darkVal.toLowerCase(), entry.dark.toLowerCase(), `--color-${name} (dark) drifted from tokens.json`);
    if (entry.light !== undefined) {
      const lightVal = lightDecls.get(`color-${name}`);
      assert.ok(lightVal !== undefined, `--color-${name} light override is missing from index.css`);
      assert.equal(lightVal.toLowerCase(), entry.light.toLowerCase(), `--color-${name} (light) drifted from tokens.json`);
    }
  }
});

test('every --color-* in index.css @theme exists in @af1/tokens', () => {
  for (const key of themeDecls.keys()) {
    if (!key.startsWith('color-')) continue;
    const name = key.slice('color-'.length);
    assert.ok(name in tokens.color, `--${key} is in index.css but not tokens.json — add it to packages/tokens`);
  }
});
