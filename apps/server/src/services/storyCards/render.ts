import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'fs';
import path from 'path';

// Story-card renderer: same satori + resvg pipeline as the OG cards, at story
// (1080×1920) and square (1080×1080) sizes, with the full brand type system —
// Archivo display, Saira Semi Condensed numerals, Inter body (static instances;
// satori reads woff/ttf, not woff2).

const FONTS_DIR = path.join(process.cwd(), 'assets/fonts');
export const STORY = { w: 1080, h: 1920 } as const;
export const SQUARE = { w: 1080, h: 1080 } as const;
export type CardFormat = 'story' | 'square';

type FontSpec = { name: string; data: Buffer; weight: 400 | 600 | 700 | 800 | 900; style: 'normal' };
let cachedFonts: FontSpec[] | null = null;
function fonts(): FontSpec[] {
  if (!cachedFonts) {
    cachedFonts = [
      { name: 'Inter', data: readFileSync(path.join(FONTS_DIR, 'Inter-400.woff')), weight: 400, style: 'normal' },
      { name: 'Inter', data: readFileSync(path.join(FONTS_DIR, 'Inter-600.woff')), weight: 600, style: 'normal' },
      { name: 'Archivo', data: readFileSync(path.join(FONTS_DIR, 'Archivo-800.ttf')), weight: 800, style: 'normal' },
      { name: 'Archivo', data: readFileSync(path.join(FONTS_DIR, 'Archivo-900.ttf')), weight: 900, style: 'normal' },
      { name: 'Saira Semi Condensed', data: readFileSync(path.join(FONTS_DIR, 'SairaSemiCondensed-700.ttf')), weight: 700, style: 'normal' },
    ];
  }
  return cachedFonts;
}

/** Hyperscript helper (same shape as the OG renderer's). */
export const h = (type: string, props: Record<string, unknown>, ...children: unknown[]): unknown => ({
  type,
  props: { ...props, children: children.length === 1 ? children[0] : (children.length ? children : undefined) },
});

export async function renderCardPng(element: unknown, format: CardFormat): Promise<Buffer> {
  const { w, h: height } = format === 'square' ? SQUARE : STORY;
  const svg = await satori(element as Parameters<typeof satori>[0], { width: w, height, fonts: fonts() });
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: w } }).render().asPng());
}
