// ── Phase 1a build-time prerender ──
// Runs AFTER `vite build`. Transforms the built dist/index.html into a static,
// crawlable HTML file per public marketing route: per-page <title>/description/
// canonical + OG/Twitter, JSON-LD (Organization site-wide + page-specific), and
// semantic content inside #root (which the SPA cleanly replaces on load via
// createRoot). The SPA bundle/styles are inherited from the built template, so
// every page still boots the full app. No SPA source is modified.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRoutes, organizationLd, SITE, esc, type RouteSEO } from './seo';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const templatePath = path.join(DIST, 'index.html');

if (!fs.existsSync(templatePath)) {
  console.error(`[prerender] dist/index.html not found — run "vite build" first (${templatePath})`);
  process.exit(1);
}
const template = fs.readFileSync(templatePath, 'utf8');

function canonical(routePath: string): string {
  return routePath === '/' ? SITE.url + '/' : SITE.url + routePath;
}

function headTags(route: RouteSEO): string {
  const url = canonical(route.path);
  const t = esc(route.title);
  const d = esc(route.description);
  return [
    `<meta name="description" content="${d}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(SITE.name)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:image" content="${SITE.ogImage}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${SITE.ogImage}" />`,
  ].join('\n    ');
}

function jsonLdTags(route: RouteSEO): string {
  const blocks = [organizationLd(), ...route.jsonLd];
  return blocks
    .map((b) => `<script type="application/ld+json">${JSON.stringify(b)}</script>`)
    .join('\n    ');
}

function render(route: RouteSEO): string {
  let html = template;

  // 1. Title.
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(route.title)}</title>`);

  // 2. Replace the template's static OG/social block with per-page head tags.
  const ogBlock = /<!-- Open Graph \/ social preview -->[\s\S]*?<meta name="twitter:description"[^>]*>/;
  if (!ogBlock.test(html)) {
    throw new Error('[prerender] expected OG block not found in index.html template');
  }
  html = html.replace(ogBlock, headTags(route));

  // 3. JSON-LD before </head>.
  html = html.replace('</head>', `    ${jsonLdTags(route)}\n  </head>`);

  // 4. Semantic content into #root (SPA replaces it on mount).
  if (!html.includes('<div id="root"></div>')) {
    throw new Error('[prerender] <div id="root"></div> not found in index.html template');
  }
  html = html.replace('<div id="root"></div>', `<div id="root">${route.bodyHtml}</div>`);

  return html;
}

let count = 0;
for (const route of getRoutes()) {
  const out = path.join(DIST, route.outFile);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, render(route), 'utf8');
  console.log(`[prerender] ${route.path.padEnd(12)} → dist/${route.outFile}`);
  count++;
}
console.log(`[prerender] wrote ${count} static pages.`);
