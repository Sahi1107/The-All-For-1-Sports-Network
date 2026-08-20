import { readFileSync } from 'fs';
import path from 'path';
import { h } from './render';
import type { CardIdentity, MatchCardData, TournamentCardData, CareerCardData, RankingCardData, ProfileCardData } from './data';

// Story-card templates — the approved design canvas ported 1:1 into satori
// element trees (match card carries the 1.5 type treatment). Flexbox + absolute
// only; every color/face comes from the brand tokens. No em dashes anywhere,
// including dash-shaped rule elements (user preference).

const VOLT = '#dbff5a';
const VOLT_LIGHT = '#e8ff8a';
const VOLT_DARK = '#b8d940';
const INK = '#080808';
const CARD = '#111111';
const ELEV = '#1c1c1c';

const ARCHIVO = 'Archivo';
const SAIRA = 'Saira Semi Condensed';
const INTER = 'Inter';

const svgUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

// The real brand mark (assets/brand/logo.svg, volt paths) recolored per ground.
let logoRaw: string | null = null;
function logoUri(fill: string): string {
  if (!logoRaw) logoRaw = readFileSync(path.join(process.cwd(), 'assets/brand/logo.svg'), 'utf8');
  return svgUri(logoRaw.replace(/#dbff5a/gi, fill));
}
const LOGO_RATIO = 519.1 / 697.64;

// lucide BadgeCheck — the app's verified mark, drawn (the font subsets carry no ✓).
const tickUri = (color: string) => svgUri(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m9 12 2 2 4-4"/></svg>`,
);

const text = (family: string, weight: number, size: number, color: string, content: string, extra: Record<string, unknown> = {}) =>
  h('span', { style: { fontFamily: family, fontWeight: weight, fontSize: size, color, ...extra } }, content);

const tick = (size: number, color = VOLT) => h('img', { src: tickUri(color), width: size, height: size });
const logo = (height: number, fill = VOLT) => h('img', { src: logoUri(fill), width: Math.round(LOGO_RATIO * height), height });

const flex = (style: Record<string, unknown>, ...children: unknown[]) => h('div', { style: { display: 'flex', ...style } }, ...children);

function avatarNode(identity: CardIdentity, size: number, ringColor = 'rgba(255,255,255,0.15)') {
  if (identity.avatarDataUri) {
    return flex(
      { width: size, height: size, borderRadius: 9999, overflow: 'hidden', border: `3px solid ${ringColor}` },
      h('img', { src: identity.avatarDataUri, width: size - 6, height: size - 6, style: { objectFit: 'cover', borderRadius: 9999 } }),
    );
  }
  const [from, to] = identity.gradient;
  return flex(
    {
      width: size, height: size, borderRadius: 9999, alignItems: 'center', justifyContent: 'center',
      backgroundImage: `linear-gradient(135deg, ${from}, ${to})`, border: `3px solid ${ringColor}`,
    },
    text(ARCHIVO, 800, Math.round(size * 0.34), '#ffffff', identity.initials),
  );
}

function header(chipText: string) {
  return flex(
    { alignItems: 'center', justifyContent: 'space-between', width: '100%' },
    flex({ alignItems: 'center', gap: 22 },
      logo(56),
      text(ARCHIVO, 800, 30, '#ffffff', 'ALL FOR 1', { letterSpacing: 7 })),
    flex({ border: '2px solid rgba(255,255,255,0.22)', borderRadius: 9999, padding: '14px 28px' },
      text(INTER, 600, 24, 'rgba(255,255,255,0.78)', chipText, { letterSpacing: 5 })),
  );
}

function footer(identity: CardIdentity) {
  return flex(
    { alignItems: 'center', justifyContent: 'space-between', width: '100%', borderTop: '2px solid rgba(255,255,255,0.12)', paddingTop: 40 },
    flex({ alignItems: 'center', gap: 14 },
      tick(30),
      text(INTER, 600, 22, 'rgba(255,255,255,0.8)', 'RECORDED LIVE BY ALL FOR 1', { letterSpacing: 2 })),
    text(INTER, 400, 20, 'rgba(255,255,255,0.42)', `allfor1.pro/athletes/${identity.slug}`),
  );
}

function identityRow(identity: CardIdentity, opts: { center?: boolean; avatar?: number } = {}) {
  const size = opts.avatar ?? 124;
  const inner = flex(
    { flexDirection: 'column', gap: 8, ...(opts.center ? { alignItems: 'center' } : {}) },
    flex({ alignItems: 'center', gap: 16 },
      text(ARCHIVO, 800, 52, '#ffffff', identity.name),
      ...(identity.verified ? [tick(42)] : [])),
    text(INTER, 600, 26, 'rgba(255,255,255,0.58)', identity.sub, { letterSpacing: 3 }),
  );
  return opts.center
    ? flex({ flexDirection: 'column', alignItems: 'center', gap: 22 }, avatarNode(identity, size), inner)
    : flex({ alignItems: 'center', gap: 30 }, avatarNode(identity, size), inner);
}

const page = (ground: string, bar: string, ...children: unknown[]) =>
  flex({ width: '100%', height: '100%', backgroundColor: ground, flexDirection: 'column', position: 'relative' },
    h('div', { style: { display: 'flex', height: 14, width: '100%', backgroundColor: bar } }),
    ...children);

const body = (...children: unknown[]) =>
  flex({ flexDirection: 'column', flexGrow: 1, padding: '96px 96px 104px 96px', justifyContent: 'space-between', position: 'relative' }, ...children);

// ── Match card (1.5 type treatment) ───────────────────────────────────────────
export function matchCardStory(d: MatchCardData, identity: CardIdentity) {
  return page(INK, VOLT,
    h('span', {
      style: {
        position: 'absolute', right: -70, top: 300, fontFamily: SAIRA, fontWeight: 700,
        fontSize: 1000, lineHeight: 1, color: '#ffffff', opacity: 0.04,
      },
    }, String(d.hero.value)),
    body(
      header('MATCH REPORT'),
      flex({ flexDirection: 'column', gap: 8 },
        flex({ alignItems: 'baseline', gap: 18 },
          text(ARCHIVO, 900, 42, VOLT, d.roundLine),
          text(INTER, 600, 27, 'rgba(255,255,255,0.55)', d.metaLine, { letterSpacing: 2 })),
        text(SAIRA, 700, 560, '#ffffff', String(d.hero.value), { lineHeight: 0.82, marginLeft: -18 }),
        text(ARCHIVO, 900, 56, VOLT, d.hero.label, { letterSpacing: 2, marginTop: 8 })),
      flex({ justifyContent: 'space-between', borderTop: '2px solid rgba(255,255,255,0.1)', borderBottom: '2px solid rgba(255,255,255,0.1)', padding: '40px 0' },
        ...d.rail.map((s) => flex({ flexDirection: 'column', gap: 6 },
          text(SAIRA, 700, 104, '#ffffff', String(s.value), { lineHeight: 1 }),
          text(INTER, 600, 25, 'rgba(255,255,255,0.5)', s.label, { letterSpacing: 1.5 })))),
      flex({ flexDirection: 'column', backgroundColor: CARD, borderRadius: 24, padding: '44px 48px', gap: 26 },
        flex({ alignItems: 'center', justifyContent: 'space-between' },
          text(ARCHIVO, 800, 38, '#ffffff', d.playerTeam.name.toUpperCase()),
          flex({ alignItems: 'center', gap: 20 },
            text(SAIRA, 700, 58, d.result === 'L' ? 'rgba(255,255,255,0.85)' : VOLT, String(d.playerTeam.score), { lineHeight: 1 }),
            ...(d.result === 'W'
              ? [flex({ backgroundColor: VOLT, borderRadius: 10, padding: '6px 16px' }, text(ARCHIVO, 800, 26, INK, 'W'))]
              : d.result === 'D'
                ? [flex({ border: `2px solid rgba(255,255,255,0.3)`, borderRadius: 10, padding: '6px 16px' }, text(ARCHIVO, 800, 26, 'rgba(255,255,255,0.7)', 'D'))]
                : []))),
        flex({ alignItems: 'center', justifyContent: 'space-between' },
          text(ARCHIVO, 800, 38, 'rgba(255,255,255,0.45)', d.opponent.name.toUpperCase()),
          text(SAIRA, 700, 58, 'rgba(255,255,255,0.45)', String(d.opponent.score), { lineHeight: 1 }))),
      identityRow(identity),
      footer(identity),
    ),
  );
}

export function matchCardSquare(d: MatchCardData, identity: CardIdentity) {
  return page(INK, VOLT,
    flex({ flexDirection: 'column', flexGrow: 1, padding: '72px 84px 76px 84px', justifyContent: 'space-between' },
      header('MATCH REPORT'),
      flex({ alignItems: 'center', justifyContent: 'space-between' },
        flex({ flexDirection: 'column' },
          text(SAIRA, 700, 300, '#ffffff', String(d.hero.value), { lineHeight: 0.85, marginLeft: -10 }),
          text(ARCHIVO, 900, 38, VOLT, d.hero.label, { letterSpacing: 6, marginTop: 14 })),
        flex({ flexDirection: 'column', gap: 26, borderLeft: '2px solid rgba(255,255,255,0.1)', paddingLeft: 44 },
          ...d.rail.map((s) => flex({ flexDirection: 'column', gap: 4 },
            text(SAIRA, 700, 64, '#ffffff', String(s.value), { lineHeight: 1 }),
            text(INTER, 600, 22, 'rgba(255,255,255,0.5)', s.label.slice(0, 3), { letterSpacing: 2 }))))),
      flex({ alignItems: 'center', justifyContent: 'space-between', backgroundColor: CARD, borderRadius: 20, padding: '28px 36px' },
        text(ARCHIVO, 800, 29, '#ffffff', `${d.playerTeam.name.toUpperCase()} ${d.playerTeam.score} · ${d.opponent.name.toUpperCase()} ${d.opponent.score}`),
        ...(d.result === 'W' ? [flex({ backgroundColor: VOLT, borderRadius: 8, padding: '4px 14px' }, text(ARCHIVO, 800, 24, INK, 'W'))] : [])),
      flex({ alignItems: 'center', justifyContent: 'space-between' },
        flex({ alignItems: 'center', gap: 24 },
          avatarNode(identity, 96),
          flex({ flexDirection: 'column', gap: 6 },
            flex({ alignItems: 'center', gap: 12 },
              text(ARCHIVO, 800, 44, '#ffffff', identity.name),
              ...(identity.verified ? [tick(34)] : [])),
            text(INTER, 600, 23, 'rgba(255,255,255,0.55)', d.metaLine, { letterSpacing: 2 }))),
        text(INTER, 400, 22, 'rgba(255,255,255,0.42)', 'allfor1.pro')),
    ),
  );
}

// ── Tournament summary: the tournament as the frame ───────────────────────────
export function tournamentCardStory(d: TournamentCardData, identity: CardIdentity) {
  return page(INK, VOLT,
    flex({ flexDirection: 'column', flexGrow: 1, padding: '96px 96px 104px 96px', justifyContent: 'space-between', alignItems: 'center' },
      header('TOURNAMENT REPORT'),
      flex({ flexDirection: 'column', alignItems: 'center', border: `3px solid ${VOLT}`, padding: '64px 56px', gap: 20, width: '100%' },
        text(INTER, 600, 26, 'rgba(255,255,255,0.55)', d.datesLine, { letterSpacing: 6 }),
        text(ARCHIVO, 900, d.tournamentName.length > 18 ? 64 : 84, '#ffffff', d.tournamentName.toUpperCase(), { lineHeight: 1.02, textAlign: 'center' }),
        flex({ alignItems: 'center', gap: 28, marginTop: 10 },
          text(SAIRA, 700, 64, VOLT, `${d.games} GAME${d.games === 1 ? '' : 'S'}`, { lineHeight: 1 }),
          ...(d.record
            ? [h('div', { style: { display: 'flex', width: 12, height: 12, borderRadius: 9999, backgroundColor: 'rgba(255,255,255,0.25)' } }),
               text(SAIRA, 700, 64, '#ffffff', d.record, { lineHeight: 1 })]
            : []))),
      flex({ flexWrap: 'wrap', gap: 28, justifyContent: 'center' },
        ...d.tiles.map((tile) => flex(
          { flexDirection: 'column', alignItems: 'center', backgroundColor: CARD, borderRadius: 20, padding: '40px 20px 34px 20px', gap: 8, width: 404 },
          text(SAIRA, 700, 104, '#ffffff', tile.value, { lineHeight: 0.95 }),
          text(ARCHIVO, 800, 25, VOLT, tile.label, { letterSpacing: 5 }),
          text(INTER, 400, 23, 'rgba(255,255,255,0.45)', tile.sub)))),
      identityRow(identity, { center: true, avatar: 116 }),
      footer(identity),
    ),
  );
}

// ── Career (Performance Card): the résumé ─────────────────────────────────────
export function careerCardStory(d: CareerCardData, identity: CardIdentity) {
  return page(INK, VOLT,
    body(
      header('CAREER RECORD'),
      flex({ flexDirection: 'column', gap: 10 },
        text(ARCHIVO, 900, 66, '#ffffff', 'PERFORMANCE CARD'),
        flex({ alignItems: 'center', gap: 14 },
          tick(30),
          text(ARCHIVO, 800, 24, VOLT, `RECORDED BY ALL FOR 1${d.sinceYear ? ` · SINCE ${d.sinceYear}` : ''}`, { letterSpacing: 6 }))),
      identityRow(identity, { avatar: 104 }),
      flex({ justifyContent: 'space-between', borderTop: '2px solid rgba(255,255,255,0.1)', borderBottom: '2px solid rgba(255,255,255,0.1)', padding: '36px 0' },
        ...d.heroCells.map((c) => flex({ flexDirection: 'column', gap: 6 },
          text(SAIRA, 700, 68, '#ffffff', c.value, { lineHeight: 1 }),
          text(INTER, 600, 22, 'rgba(255,255,255,0.5)', c.label, { letterSpacing: 2 })))),
      flex({ flexDirection: 'column' },
        text(INTER, 600, 25, 'rgba(255,255,255,0.5)', 'COMPETITION RECORD', { letterSpacing: 6, marginBottom: 8 }),
        ...d.receipts.map((r) => flex(
          { alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid rgba(255,255,255,0.08)', padding: '30px 0' },
          flex({ flexDirection: 'column', gap: 6 },
            text(ARCHIVO, 800, 33, '#ffffff', r.name),
            text(INTER, 400, 24, 'rgba(255,255,255,0.45)', r.meta)),
          text(SAIRA, 700, 36, 'rgba(255,255,255,0.85)', r.right)))),
      flex({ justifyContent: 'space-between', alignItems: 'center' },
        ...(d.splitsLine ? [text(INTER, 600, 26, 'rgba(255,255,255,0.6)', d.splitsLine, { letterSpacing: 2 })] : [h('div', { style: { display: 'flex' } })]),
        text(SAIRA, 700, 34, VOLT, d.totalLine)),
      footer(identity),
    ),
  );
}

// ── Ranking: colossal position, center axis ───────────────────────────────────
export function rankingCardStory(d: RankingCardData, identity: CardIdentity) {
  return page(INK, VOLT,
    flex({ flexDirection: 'column', flexGrow: 1, padding: '96px 96px 104px 96px', justifyContent: 'space-between', alignItems: 'center' },
      header('RANKING'),
      flex({ flexDirection: 'column', alignItems: 'center', gap: 6 },
        text(INTER, 600, 27, 'rgba(255,255,255,0.55)', d.tournamentLine, { letterSpacing: 6 }),
        flex({ alignItems: 'flex-start' },
          text(SAIRA, 700, 200, '#ffffff', '#', { lineHeight: 1.4 }),
          text(SAIRA, 700, d.rank > 99 ? 400 : 560, VOLT, String(d.rank), { lineHeight: 0.85 })),
        text(ARCHIVO, 900, 58, '#ffffff', d.boardLabel, { letterSpacing: 6 }),
        text(INTER, 600, 26, 'rgba(255,255,255,0.5)', `${d.boardSize} RANKED${identity.state ? ` · ${identity.state.toUpperCase()}` : ''}`, { letterSpacing: 4 })),
      flex({ flexDirection: 'column', width: '100%', gap: 18 },
        flex({ width: '100%', height: 18, backgroundColor: ELEV, borderRadius: 9999 },
          h('div', { style: { display: 'flex', width: `${Math.max(2, Math.min(100, d.score))}%`, backgroundColor: VOLT, borderRadius: 9999 } })),
        flex({ justifyContent: 'space-between', alignItems: 'center' },
          text(SAIRA, 700, 42, VOLT, `SCORE ${d.score}`),
          text(INTER, 600, 26, 'rgba(255,255,255,0.45)', 'OUT OF 100'))),
      identityRow(identity, { center: true, avatar: 116 }),
      footer(identity),
    ),
  );
}

export function rankingCardSquare(d: RankingCardData, identity: CardIdentity) {
  return page(INK, VOLT,
    flex({ flexDirection: 'column', flexGrow: 1, padding: '72px 84px 76px 84px', justifyContent: 'space-between', alignItems: 'center' },
      header('RANKING'),
      flex({ flexDirection: 'column', alignItems: 'center' },
        flex({ alignItems: 'flex-start' },
          text(SAIRA, 700, 120, '#ffffff', '#', { lineHeight: 1.5 }),
          text(SAIRA, 700, d.rank > 99 ? 280 : 380, VOLT, String(d.rank), { lineHeight: 0.85 })),
        text(ARCHIVO, 900, 44, '#ffffff', d.boardLabel, { letterSpacing: 5, marginTop: 10 }),
        text(INTER, 600, 24, 'rgba(255,255,255,0.5)', `${d.tournamentLine} · ${d.boardSize} RANKED`, { letterSpacing: 4, marginTop: 8 })),
      flex({ alignItems: 'center', justifyContent: 'space-between', width: '100%' },
        flex({ alignItems: 'center', gap: 24 },
          avatarNode(identity, 96),
          flex({ flexDirection: 'column', gap: 6 },
            flex({ alignItems: 'center', gap: 12 },
              text(ARCHIVO, 800, 44, '#ffffff', identity.name),
              ...(identity.verified ? [tick(34)] : [])),
            text(INTER, 600, 23, 'rgba(255,255,255,0.55)', identity.sub, { letterSpacing: 2 }))),
        text(INTER, 400, 22, 'rgba(255,255,255,0.42)', 'allfor1.pro')),
    ),
  );
}

// ── Profile: name as the hero (day-one variant before any verified stats) ─────
export function profileCardStory(d: ProfileCardData, identity: CardIdentity) {
  if (d.dayOne) {
    return page(INK, VOLT,
      body(
        header(d.seasonLine),
        flex({ flexDirection: 'column', gap: 6 },
          text(ARCHIVO, 900, 116, '#ffffff', 'THE RECORD', { lineHeight: 0.98 }),
          text(ARCHIVO, 900, 116, VOLT, 'STARTS HERE', { lineHeight: 0.98 }),
          text(INTER, 400, 32, 'rgba(255,255,255,0.65)', 'Every point from here is recorded live at All For 1 partnered tournaments, and it counts.', { lineHeight: 1.5, marginTop: 34, maxWidth: 780 })),
        flex({ gap: 20 },
          ...(d.sportLabel
            ? [flex({ border: `2px solid ${VOLT}`, borderRadius: 9999, padding: '16px 30px' }, text(INTER, 600, 25, VOLT, d.sportLabel, { letterSpacing: 4 }))]
            : []),
          flex({ border: '2px solid rgba(255,255,255,0.2)', borderRadius: 9999, padding: '16px 30px' }, text(INTER, 600, 25, 'rgba(255,255,255,0.7)', 'FIRST MATCH PENDING', { letterSpacing: 4 }))),
        identityRow(identity),
        footer(identity),
      ),
    );
  }
  const nameSize = Math.max(d.firstLine.length, d.secondLine.length) > 10 ? 96 : 132;
  return page(INK, VOLT,
    flex({ flexDirection: 'column', flexGrow: 1, padding: '96px 96px 104px 96px', justifyContent: 'space-between', alignItems: 'center' },
      header('PLAYER PROFILE'),
      avatarNode(identity, 280),
      flex({ flexDirection: 'column', alignItems: 'center', gap: 4 },
        text(ARCHIVO, 900, nameSize, '#ffffff', d.firstLine, { lineHeight: 0.95 }),
        ...(d.secondLine ? [text(ARCHIVO, 900, nameSize, VOLT, d.secondLine, { lineHeight: 0.95 })] : []),
        ...(identity.verified
          ? [flex({ alignItems: 'center', gap: 12, marginTop: 26 },
              tick(34),
              text(INTER, 600, 24, 'rgba(255,255,255,0.7)', 'VERIFIED PROFILE', { letterSpacing: 5 }))]
          : []),
        text(INTER, 600, 27, 'rgba(255,255,255,0.55)', d.metaLine, { letterSpacing: 3, marginTop: 14 })),
      flex({ gap: 24 },
        ...d.chips.map((c) => flex(
          { flexDirection: 'column', alignItems: 'center', gap: 6, border: '2px solid rgba(255,255,255,0.14)', borderRadius: 18, padding: '30px 36px' },
          text(SAIRA, 700, 56, '#ffffff', c.value, { lineHeight: 1 }),
          text(INTER, 600, 22, 'rgba(255,255,255,0.5)', c.label, { letterSpacing: 2 })))),
      footer(identity),
    ),
  );
}

export { VOLT, VOLT_LIGHT, VOLT_DARK, INK, CARD, ELEV };
