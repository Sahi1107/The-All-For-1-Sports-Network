// Production styling for the public SSR pages (allfor1-web). Inlined into every
// page <head> — no render-blocking request, no FOUC (these are Google-landing
// pages). Typography/structure/spacing are matched 1:1 to the ACTUAL app
// components (client/src/pages/Profile.tsx, Explore.tsx): Inter on the same
// elements at the same Tailwind sizes/weights, rounded-xl (12px) cards,
// space-y-6 (24px), lucide icons — so these read as the same product.

// Self-contained (no import from render.ts) to avoid a circular import.
const SITE_NAME = 'All For 1';
const LOGO = 'https://allfor1.pro/logo-square-transparent.png';

export const HEAD_STYLES = `
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Saira+Semi+Condensed:wght@600;700&display=swap" rel="stylesheet" />
    <style>
      :root{
        --surface:#080808; --card:#111111; --elevated:#1c1c1c; --line:#1c1c1c;
        --fg:#ffffff; --muted:#6b7280;
        --primary:#dbff5a; --primary-light:#e8ff8a; --primary-dark:#b8d940; --on-primary:#080808;
        --accent:#10b981; --secondary:#f97316;
        --font-sans:'Inter',system-ui,-apple-system,sans-serif;
        --font-numeric:'Saira Semi Condensed','Inter',sans-serif;
      }
      *{box-sizing:border-box}
      html,body{overflow-x:hidden}
      body{margin:0;background:var(--surface);color:var(--fg);font-family:var(--font-sans);
        font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
      a{color:inherit;text-decoration:none}
      h1,h2,h3{font-family:var(--font-sans);margin:0;line-height:1.25}
      img,svg{display:block}

      /* ── Header (public marketing top-bar) ── */
      .af-header{position:sticky;top:0;z-index:50;background:rgba(8,8,8,.82);
        backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
      .af-header__in{max-width:64rem;margin:0 auto;padding:0 16px;height:56px;
        display:flex;align-items:center;justify-content:space-between;gap:12px}
      .af-brand{display:inline-flex;align-items:center;gap:9px;font-weight:700;font-size:17px}
      .af-brand img{width:26px;height:26px}
      .af-header__actions{display:flex;align-items:center;gap:8px}

      /* ── Buttons (match app: rounded-lg, font-semibold, text-sm) ── */
      .af-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;
        font-weight:600;font-size:14px;line-height:1;padding:8px 14px;border-radius:8px;
        border:1px solid transparent;cursor:pointer;white-space:nowrap;
        transition:background .15s ease,border-color .15s ease}
      .af-btn--primary{background:var(--primary);color:var(--on-primary);font-weight:700}
      .af-btn--primary:hover{background:var(--primary-dark)}
      .af-btn--ghost{background:var(--elevated);color:var(--fg);border-color:var(--line)}
      .af-btn--ghost:hover{background:#242424}
      .af-btn--lg{padding:10px 18px;font-size:15px}

      /* ── Layout ── */
      .af-main{max-width:64rem;margin:0 auto;padding:24px 16px 56px}
      .af-main--profile{max-width:56rem}
      .af-crumb,.af-main nav[aria-label="Breadcrumb"]{font-size:13px;color:var(--muted);margin-bottom:20px}
      .af-crumb a,.af-main nav[aria-label="Breadcrumb"] a{color:var(--muted)}
      .af-crumb a:hover,.af-main nav[aria-label="Breadcrumb"] a:hover{color:var(--fg)}

      /* ── Cards (bg-card, border-line, rounded-xl=12px) ── */
      .af-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px}
      .af-section{margin-top:24px}

      /* ── Profile header card (p-6, avatar 96px, name text-2xl/700) ── */
      .af-hero{padding:24px;position:relative;overflow:hidden}
      .af-hero__bg{position:absolute;inset:0;opacity:.12;pointer-events:none}
      .af-hero__bg svg{width:100%;height:100%;object-fit:cover}
      .af-hero__row{position:relative;display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap}
      .af-avatar{width:96px;height:96px;border-radius:50%;background:var(--elevated);border:2px solid var(--line);
        display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:700;color:var(--fg);flex:none}
      .af-hero__info{min-width:0;flex:1}
      .af-name-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .af-name{font-size:24px;font-weight:700}
      .af-tags{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px}
      .af-role-chip{font-size:12px;font-weight:500;padding:2px 8px;border-radius:999px;
        background:rgba(219,255,90,.2);color:var(--primary-light)}
      .af-tag{font-size:14px;color:rgba(255,255,255,.8)}
      .af-tag--pos{color:rgba(255,255,255,.7)}
      .af-meta{display:flex;flex-wrap:wrap;gap:16px;margin-top:12px;font-size:14px;color:rgba(255,255,255,.7)}
      .af-meta span{display:inline-flex;align-items:center;gap:5px}
      .af-bio{margin-top:16px;font-size:14px;line-height:1.65;color:rgba(255,255,255,.75)}

      /* ── Section title (Inter 16px/600 + colored icon) ── */
      .af-sec{display:flex;align-items:center;gap:8px;font-size:16px;font-weight:600;margin:0 0 16px}
      .af-sec svg{width:16px;height:16px;flex:none}
      .af-rows{display:flex;flex-direction:column;gap:8px}
      .af-row{background:var(--surface);border-radius:8px;padding:8px 12px;font-size:15px;color:#e5e7eb}

      /* ── Verified tick (exact lucide BadgeCheck, stroke, lime) ── */
      .af-tick{color:var(--primary);flex:none;display:inline-block;vertical-align:-3px}

      /* ── Chips (state sub-hubs, sport index) ── */
      .af-chips{display:flex;flex-wrap:wrap;gap:8px}
      .af-chip{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:500;
        padding:6px 12px;border-radius:999px;background:var(--elevated);color:#cfd3da;border:1px solid var(--line)}
      a.af-chip:hover{border-color:rgba(219,255,90,.4);color:var(--fg)}

      /* ── Athlete card grid — matches Explore (rounded-xl p-4, 56px lime avatar) ── */
      .af-grid{display:grid;grid-template-columns:1fr;gap:16px;margin-top:4px}
      @media(min-width:768px){.af-grid{grid-template-columns:1fr 1fr}}
      .af-acard{display:flex;align-items:center;gap:16px;background:var(--card);border:1px solid var(--line);
        border-radius:12px;padding:16px;transition:border-color .15s ease}
      .af-acard:hover{border-color:rgba(219,255,90,.5)}
      .af-acard__av{width:56px;height:56px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;
        font-size:18px;font-weight:700;color:var(--primary-light);background:rgba(219,255,90,.2)}
      .af-acard__name{display:flex;align-items:center;gap:6px;font-weight:600;font-size:16px}
      .af-acard__meta{font-size:14px;color:var(--muted);margin-top:2px;text-transform:capitalize}
      .af-acard__go{margin-left:auto;color:var(--muted);flex:none}

      /* page title (hub/root) */
      .af-ptitle{font-size:24px;font-weight:700;margin:0 0 4px}
      .af-lead{color:var(--muted);font-size:15px;margin:0 0 20px}
      .af-h2{font-size:16px;font-weight:600;margin:0 0 12px}
      .af-note{color:var(--muted);font-size:15px}
      .af-joinrow{margin-top:28px;display:flex;flex-wrap:wrap;align-items:center;gap:10px}

      /* ── Prose (content pages: FAQ/About/Safety/CG/Learn) — Inter scale ── */
      .af-prose{max-width:44rem}
      .af-prose h1{font-size:30px;font-weight:700;margin-bottom:8px}
      .af-prose > p:first-of-type{color:#b8bcc4;font-size:17px;line-height:1.6}
      .af-prose h2{font-size:20px;font-weight:600;margin:32px 0 10px}
      .af-prose h3{font-size:16px;font-weight:600;margin:22px 0 6px}
      .af-prose p{margin:0 0 14px;color:#d7dae0;font-size:16px;line-height:1.7}
      .af-prose ul,.af-prose ol{margin:0 0 16px;padding-left:0;list-style:none}
      .af-prose ul li{position:relative;padding-left:20px;margin:8px 0;color:#d7dae0;line-height:1.7}
      .af-prose ul li::before{content:"";position:absolute;left:2px;top:12px;width:6px;height:6px;border-radius:50%;background:var(--primary)}
      .af-prose ol{counter-reset:n}
      .af-prose ol li{counter-increment:n;position:relative;padding-left:28px;margin:8px 0;color:#d7dae0;line-height:1.7}
      .af-prose ol li::before{content:counter(n);position:absolute;left:0;top:0;font-family:var(--font-numeric);font-weight:700;color:var(--primary);font-size:15px}
      .af-prose a{color:var(--primary);text-decoration:underline;text-underline-offset:2px;text-decoration-color:rgba(219,255,90,.4)}
      .af-prose a:hover{text-decoration-color:var(--primary)}
      .af-prose section{margin-top:4px}
      .af-prose nav[aria-label]:not([aria-label="Breadcrumb"]) h2{font-size:16px;margin:28px 0 10px}
      .af-prose nav[aria-label]:not([aria-label="Breadcrumb"]) ul{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0}
      .af-prose nav[aria-label]:not([aria-label="Breadcrumb"]) li{padding:0;margin:0}
      .af-prose nav[aria-label]:not([aria-label="Breadcrumb"]) li::before{display:none}
      .af-prose nav[aria-label]:not([aria-label="Breadcrumb"]) a{display:inline-block;padding:6px 12px;border-radius:999px;
        background:var(--elevated);border:1px solid var(--line);color:#cfd3da;text-decoration:none;font-size:13px;font-weight:500}
      .af-prose nav[aria-label]:not([aria-label="Breadcrumb"]) a:hover{border-color:rgba(219,255,90,.4);color:var(--fg)}
      .af-cta{margin-top:24px;font-size:15px;color:var(--muted)}
      .af-qa{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin:12px 0}
      .af-qa h2{font-size:16px;font-weight:600;margin:0 0 8px}
      .af-qa p{margin:0;color:#c9cdd4;font-size:15px;line-height:1.65}

      /* ── Footer ── */
      footer{border-top:1px solid var(--line);margin-top:40px}
      footer nav{max-width:64rem;margin:0 auto;padding:24px 16px 6px;display:flex;flex-wrap:wrap;gap:8px 16px;justify-content:center}
      footer nav a{color:var(--muted);font-size:13px}
      footer nav a:hover{color:var(--primary)}
      footer p{max-width:64rem;margin:0 auto;padding:0 16px 28px;text-align:center;color:var(--muted);font-size:12px}

      @media(max-width:520px){
        .af-avatar{width:80px;height:80px;font-size:26px}
        .af-name{font-size:22px}
        .af-hero{padding:20px}
      }
    </style>`;

// ── Inline lucide icons (exact paths from lucide-react, the app's icon set).
//    Stroke-based (fill none, currentColor, width 2) to match the app 1:1. ──
const ICON: Record<string, string> = {
  'map-pin': '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  ruler: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/>',
  award: '<path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/><circle cx="12" cy="8" r="6"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
};

/** Inline lucide-style icon (stroke, currentColor). */
export function icon(name: keyof typeof ICON | string, size = 16): string {
  const p = ICON[name] || '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

/** Exact lucide BadgeCheck (stroke, lime) — same as the app's VerifiedTick. */
export function verifiedTick(size = 16): string {
  return `<svg class="af-tick" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Verified" role="img"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/></svg>`;
}

/** Branded sticky header: logo lockup + Sign in / Join (hard-nav into the app). */
export function pageHeader(): string {
  return `<header class="af-header">
      <div class="af-header__in">
        <a class="af-brand" href="/"><img src="${LOGO}" alt="" width="26" height="26" />${SITE_NAME}</a>
        <nav class="af-header__actions" aria-label="Account">
          <a class="af-btn af-btn--ghost" href="/login">Sign in</a>
          <a class="af-btn af-btn--primary" href="/register">Join</a>
        </nav>
      </div>
    </header>`;
}
