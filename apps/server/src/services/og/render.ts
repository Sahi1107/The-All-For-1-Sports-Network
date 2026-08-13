import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'fs';
import path from 'path';

// Open Graph card renderer: satori (HTML/CSS → SVG) + resvg (SVG → PNG). Chosen
// over @vercel/og because that targets the Vercel Edge runtime; satori + resvg
// run on plain Node/Cloud Run with full control over fonts and output.

const FONTS_DIR = path.join(process.cwd(), 'assets/fonts');
export const OG_W = 1200;
export const OG_H = 630;

let cachedFonts: { name: string; data: Buffer; weight: 400 | 600 | 700; style: 'normal' }[] | null = null;
function fonts() {
  if (!cachedFonts) {
    cachedFonts = [
      { name: 'Inter', data: readFileSync(path.join(FONTS_DIR, 'Inter-400.woff')), weight: 400, style: 'normal' },
      { name: 'Inter', data: readFileSync(path.join(FONTS_DIR, 'Inter-600.woff')), weight: 600, style: 'normal' },
      { name: 'Inter', data: readFileSync(path.join(FONTS_DIR, 'Inter-700.woff')), weight: 700, style: 'normal' },
    ];
  }
  return cachedFonts;
}

/** Hyperscript helper for satori elements (avoids needing a JSX transform on the server). */
export const h = (type: string, props: Record<string, unknown>, ...children: unknown[]): unknown => ({
  type,
  props: { ...props, children: children.length === 1 ? children[0] : (children.length ? children : undefined) },
});

/** Render a satori element tree to a 1200×630 PNG buffer. */
export async function renderCard(element: unknown): Promise<Buffer> {
  const svg = await satori(element as Parameters<typeof satori>[0], { width: OG_W, height: OG_H, fonts: fonts() });
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: OG_W } }).render().asPng());
}
