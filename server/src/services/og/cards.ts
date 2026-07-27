import { h } from './render';

// Brand tokens (mirrors the app: dark surface + lime accent, Inter).
const BG = '#080808', CARD = '#101010', LIME = '#dbff5a', WHITE = '#ffffff';
const GRAY = '#9a9a9a', DGRAY = '#5c5c5c', LINE = '#1e1e1e';

const row = (props: Record<string, unknown>, ...c: unknown[]) => h('div', { ...props, style: { display: 'flex', ...(props.style as object) } }, ...c);
const col = (props: Record<string, unknown>, ...c: unknown[]) => h('div', { ...props, style: { display: 'flex', flexDirection: 'column', ...(props.style as object) } }, ...c);
const txt = (style: Record<string, unknown>, s: string) => h('div', { style: { display: 'flex', ...style } }, s);

function wordmark() {
  return txt({ fontSize: 26, fontWeight: 700, letterSpacing: 6, color: LIME }, 'ALL FOR 1');
}

function monogram(letter: string, size = 150, bg = LIME, fg = BG) {
  return h('div', { style: { display: 'flex', width: size, height: size, borderRadius: size, background: bg, color: fg, fontSize: Math.round(size * 0.46), fontWeight: 700, alignItems: 'center', justifyContent: 'center', flexShrink: 0 } }, letter || '·');
}

function verifiedTick() {
  // Draw the check as a rotated border (the latin font subset has no ✓ glyph).
  return h('div', { style: { display: 'flex', width: 44, height: 44, borderRadius: 44, background: LIME, alignItems: 'center', justifyContent: 'center', marginLeft: 16 } },
    h('div', { style: { display: 'flex', width: 13, height: 22, borderRight: `5px solid ${BG}`, borderBottom: `5px solid ${BG}`, transform: 'rotate(45deg)', marginTop: -4 } }),
  );
}

function shell(...children: unknown[]) {
  return h('div', { style: { display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: BG, padding: '64px 70px', position: 'relative', fontFamily: 'Inter', justifyContent: 'space-between' } },
    h('div', { style: { display: 'flex', position: 'absolute', top: 0, left: 0, right: 0, height: 12, background: LIME } }),
    ...children,
  );
}

function statTile(value: string, label: string) {
  return col({ style: { padding: '0 0', marginRight: 56 } },
    txt({ fontSize: 52, fontWeight: 700, color: WHITE, lineHeight: 1 }, value),
    txt({ fontSize: 24, color: GRAY, marginTop: 8, textTransform: 'uppercase', letterSpacing: 1 }, label),
  );
}

export interface AthleteCard { name: string; initial: string; sport: string; position?: string | null; state?: string | null; verified: boolean; stats: { value: string; label: string }[] }
export function athleteCard(a: AthleteCard) {
  const meta = [a.sport, a.position, a.state].filter(Boolean).join('  ·  ');
  return shell(
    col({ style: { flexGrow: 1, justifyContent: 'center' } },
      row({ style: { alignItems: 'center', gap: 44 } },
        monogram(a.initial),
        col({},
          row({ style: { alignItems: 'center' } },
            txt({ fontSize: 76, fontWeight: 700, color: WHITE, lineHeight: 1.05 }, a.name),
            ...(a.verified ? [verifiedTick()] : []),
          ),
          txt({ fontSize: 34, color: LIME, marginTop: 14, fontWeight: 600 }, meta),
        ),
      ),
      ...(a.stats.length ? [row({ style: { marginTop: 52 } }, ...a.stats.slice(0, 3).map((s) => statTile(s.value, s.label)))] : []),
    ),
    row({ style: { alignItems: 'center', justifyContent: 'space-between' } },
      wordmark(),
      txt({ fontSize: 22, color: DGRAY }, 'allfor1.pro'),
    ),
  );
}

export interface TournamentCard { name: string; sport: string; city?: string | null; dates: string; teamCount: number; status: string }
export function tournamentCard(t: TournamentCard) {
  const meta = [t.sport, t.city].filter(Boolean).join('  ·  ');
  const statusColor = t.status === 'Live' ? '#f5a623' : t.status === 'Completed' ? LIME : GRAY;
  return shell(
    col({ style: { flexGrow: 1, justifyContent: 'center' } },
      row({ style: { alignItems: 'center', marginBottom: 20 } },
        h('div', { style: { display: 'flex', border: `2px solid ${statusColor}`, color: statusColor, borderRadius: 8, padding: '6px 16px', fontSize: 24, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2 } }, t.status),
      ),
      txt({ fontSize: 78, fontWeight: 700, color: WHITE, lineHeight: 1.05 }, t.name),
      txt({ fontSize: 36, color: LIME, marginTop: 18, fontWeight: 600 }, meta),
      row({ style: { marginTop: 44 } },
        statTile(String(t.teamCount), 'Teams'),
        statTile(t.dates, 'Dates'),
      ),
    ),
    row({ style: { alignItems: 'center', justifyContent: 'space-between' } }, wordmark(), txt({ fontSize: 22, color: DGRAY }, 'allfor1.pro')),
  );
}

export interface TeamCard { name: string; initial: string; sport: string; tournament?: string | null }
export function teamCard(t: TeamCard) {
  const meta = [t.sport, t.tournament].filter(Boolean).join('  ·  ');
  return shell(
    col({ style: { flexGrow: 1, justifyContent: 'center' } },
      row({ style: { alignItems: 'center', gap: 44 } },
        monogram(t.initial, 150, CARD, LIME),
        col({},
          txt({ fontSize: 76, fontWeight: 700, color: WHITE, lineHeight: 1.05 }, t.name),
          txt({ fontSize: 34, color: LIME, marginTop: 14, fontWeight: 600 }, meta),
        ),
      ),
    ),
    row({ style: { alignItems: 'center', justifyContent: 'space-between' } }, wordmark(), txt({ fontSize: 22, color: DGRAY }, 'allfor1.pro')),
  );
}

/** Fallback card (ineligible/unknown entity) — brand-only, never leaks data. */
export function fallbackCard() {
  return shell(
    col({ style: { flexGrow: 1, justifyContent: 'center' } },
      txt({ fontSize: 88, fontWeight: 700, color: WHITE }, 'All For 1'),
      txt({ fontSize: 36, color: LIME, marginTop: 16, fontWeight: 600 }, 'The network for the sports ecosystem'),
    ),
    row({ style: { alignItems: 'center', justifyContent: 'space-between' } }, wordmark(), txt({ fontSize: 22, color: DGRAY }, 'allfor1.pro')),
  );
}
