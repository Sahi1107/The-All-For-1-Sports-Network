// ─── Shared branded email layout ─────────────────────────────────────────────
// ONE template every app email renders through, so they can't drift apart. Dark
// (#080808) surface + lime (#dbff5a) accent, the All For 1 logo mark at the top,
// a #111 content card, and a consistent footer. Built for email clients, not the
// web: table layout, inline styles, web-safe font fallbacks, a hidden preheader,
// and a real <img> logo with alt text so it still reads when images are blocked.

/** Stable, public logo URL (served from Firebase Hosting; verified 200). Lime mark
 *  on transparent — reads on the dark card, and on light if a client force-inverts. */
export const EMAIL_LOGO_URL = 'https://allfor1.pro/logo-square-transparent.png';
const SITE = 'https://allfor1.pro';
const SUPPORT = 'info@allfor1.pro';
const FONT = "'Archivo','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

export const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** A styled body paragraph. `html` is treated as HTML — escape user content first. */
export function emailParagraph(html: string, opts: { muted?: boolean } = {}): string {
  const color = opts.muted ? '#8a8a8a' : '#c9c9c9';
  return `<p style="margin:0 0 16px;font-family:${FONT};font-weight:400;font-size:15px;line-height:1.6;color:${color};">${html}</p>`;
}

/** Lime CTA button. Table-based so Outlook renders the fill (square corners there,
 *  rounded elsewhere) — the action never disappears. */
export function emailButton(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 2px;"><tr>
    <td style="border-radius:10px;background:#dbff5a;">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 30px;font-family:${FONT};font-weight:600;font-size:15px;color:#080808;border-radius:10px;">${escapeHtml(label)}</a>
    </td></tr></table>`;
}

/** A prominent, high-contrast box for credentials / key details — never buried by
 *  the branding. Values are escaped; `mono` renders the value monospaced (passwords). */
export function emailCredBox(rows: Array<{ label: string; value: string; mono?: boolean }>): string {
  const inner = rows.map((r) =>
    `<div style="font-family:${FONT};font-size:14px;line-height:1.95;color:#c9c9c9;">
       <span style="color:#8a8a8a;">${escapeHtml(r.label)}:</span>
       <span style="color:#ffffff;${r.mono ? 'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:15px;letter-spacing:.4px;' : 'font-weight:500;'}">${escapeHtml(r.value)}</span>
     </div>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:2px 0 22px;"><tr>
    <td style="background:#0b0b0b;border:1px solid #242424;border-left:3px solid #dbff5a;border-radius:10px;padding:16px 18px;">${inner}</td>
  </tr></table>`;
}

/** Muted footnote inside the card (e.g. a security note). `html` is HTML. */
export function emailNote(html: string): string {
  return `<p style="margin:22px 0 0;font-family:${FONT};font-size:13px;line-height:1.6;color:#8a8a8a;">${html}</p>`;
}

/** A styled list. Items are HTML — escape user content first. */
export function emailList(items: string[], ordered = false): string {
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag} style="margin:0 0 20px;padding-left:20px;font-family:${FONT};font-size:15px;line-height:1.9;color:#c9c9c9;">${items.map((i) => `<li>${i}</li>`).join('')}</${tag}>`;
}

/**
 * Render a complete branded email. `contentHtml` is the card body AFTER the
 * heading (compose it from the helpers above). `footerLinks` add extra links
 * (e.g. unsubscribe / manage) above the always-present site + contact line.
 */
export function emailShell(opts: {
  preheader: string;
  heading: string;
  contentHtml: string;
  footerNote?: string;                              // muted line above the footer links
  footerLinks?: Array<{ label: string; url: string }>;
}): string {
  const { preheader, heading, contentHtml, footerNote, footerLinks = [] } = opts;
  const footerNoteHtml = footerNote
    ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:12px;line-height:1.7;color:#6b6b6b;">${footerNote}</p>`
    : '';
  const footerLinksHtml = footerLinks.length
    ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:12px;line-height:1.7;color:#6b6b6b;">${footerLinks
        .map((l) => `<a href="${escapeHtml(l.url)}" style="color:#8a8a8a;text-decoration:underline;">${escapeHtml(l.label)}</a>`)
        .join(' · ')}</p>`
    : '';
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light">
<title>All For 1</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@600;700&family=Inter:wght@400;500&display=swap');
  body{margin:0;padding:0;background:#080808;} a{text-decoration:none;}
  @media only screen and (max-width:600px){ .card{padding:24px 22px !important;} }
</style></head>
<body style="margin:0;padding:0;background:#080808;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#080808;font-size:1px;line-height:1px;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#080808;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td style="padding:0 4px 22px;">
          <img src="${EMAIL_LOGO_URL}" width="46" height="46" alt="All For 1" style="display:block;border:0;outline:none;text-decoration:none;width:46px;height:46px;">
        </td></tr>
        <tr><td class="card" style="background:#111111;border:1px solid #1c1c1c;border-radius:16px;padding:32px;">
          <h1 style="margin:0 0 16px;font-family:${FONT};font-weight:700;font-size:22px;line-height:1.25;color:#ffffff;">${escapeHtml(heading)}</h1>
          ${contentHtml}
        </td></tr>
        <tr><td style="padding:22px 4px 0;">
          ${footerNoteHtml}
          ${footerLinksHtml}
          <p style="margin:0;font-family:${FONT};font-size:11px;line-height:1.7;color:#5a5a5a;">
            <a href="${SITE}" style="color:#8a8a8a;text-decoration:underline;">allfor1.pro</a> ·
            <a href="mailto:${SUPPORT}" style="color:#8a8a8a;text-decoration:underline;">${SUPPORT}</a>
          </p>
          <p style="margin:8px 0 0;font-family:${FONT};font-size:11px;color:#4a4a4a;">All For 1 — the network for the sports ecosystem</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
