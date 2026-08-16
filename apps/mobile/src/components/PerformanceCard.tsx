import { useState } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, UIManager, View, type TextStyle } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Award, BadgeCheck, ChevronDown } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeProvider';
import { withAlpha } from '../theme/tokens';
import { Card } from './Card';
import { Text } from './Text';
import { fetchPerformanceCard, type MatchLine, type PerformanceCardData } from '../api/profile';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Hero-band metrics + per-tournament receipt summaries per stat sport (verbatim
// from the web card — one source of truth for what a scout reads).
const HERO: Record<string, { key: string; label: string }[]> = {
  FOOTBALL: [{ key: 'goals', label: 'Goals' }, { key: 'assists', label: 'Assists' }],
  BASKETBALL: [{ key: 'points', label: 'Points' }, { key: 'rebounds', label: 'Rebounds' }, { key: 'assists', label: 'Assists' }],
  CRICKET: [{ key: 'runs', label: 'Runs' }, { key: 'wickets', label: 'Wickets' }],
};
const RECEIPT: Record<string, (a: Record<string, number>) => string> = {
  FOOTBALL: (a) => `${a.goals} G · ${a.assists} A per match`,
  BASKETBALL: (a) => `${a.points} PTS · ${a.rebounds} REB per match`,
  CRICKET: (a) => `${a.runs} runs · ${a.wickets} wkts per match`,
};
const METRIC_LABEL: Record<string, string> = {
  goals: 'Goals', assists: 'Assists', shots: 'Shots', passes: 'Passes', tackles: 'Tackles', saves: 'Saves',
  points: 'Points', rebounds: 'Rebounds', steals: 'Steals', blocks: 'Blocks',
  runs: 'Runs', wickets: 'Wickets', fours: 'Fours', sixes: 'Sixes', catches: 'Catches', minutesPlayed: 'Minutes',
};
const HIDDEN_METRICS = new Set(['minutesPlayed', 'fieldGoalAttempts', 'threePointAttempts', 'freeThrowAttempts']);
const MATCH_COLS: Record<string, { key: string; label: string }[]> = {
  BASKETBALL: [
    { key: 'points', label: 'PTS' }, { key: 'rebounds', label: 'REB' }, { key: 'assists', label: 'AST' },
    { key: 'steals', label: 'STL' }, { key: 'blocks', label: 'BLK' }, { key: 'turnovers', label: 'TO' },
  ],
  FOOTBALL: [
    { key: 'minutesPlayed', label: 'MIN' }, { key: 'goals', label: 'G' }, { key: 'assists', label: 'A' },
    { key: 'shots', label: 'SH' }, { key: 'tackles', label: 'TKL' }, { key: 'saves', label: 'SV' },
  ],
  CRICKET: [
    { key: 'runs', label: 'R' }, { key: 'ballsFaced', label: 'B' }, { key: 'fours', label: '4s' },
    { key: 'sixes', label: '6s' }, { key: 'wickets', label: 'W' }, { key: 'catches', label: 'C' },
  ],
};

const yr = (d: string) => (d ? String(new Date(d).getFullYear()) : '');
const shortDate = (d: string) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');
const num = (v: number) => (Number.isInteger(v) ? v : Math.round(v * 10) / 10);
const rankLabel = (c: string | null) =>
  c ? `${c.toLowerCase().replace(/^men$/i, "men's").replace(/^women$/i, "women's")} rank` : 'Rank';

function shootingPct(made: number, attempts: number): string {
  if (!attempts || attempts <= 0) return '—';
  return `${Math.round((made / attempts) * 1000) / 10}%`;
}
function shootingTiles(totals: Record<string, number>) {
  const fgm = (totals.twoPointers ?? 0) + (totals.threePointers ?? 0);
  const fga = totals.fieldGoalAttempts ?? 0;
  const tpm = totals.threePointers ?? 0;
  const tpa = totals.threePointAttempts ?? 0;
  return [
    { key: 'fgPct', label: 'FG%', value: shootingPct(fgm, fga), detail: `${fgm} / ${fga}` },
    { key: 'tpPct', label: '3PT%', value: shootingPct(tpm, tpa), detail: `${tpm} / ${tpa}` },
  ];
}

// ── Per-match box-score for one expanded tournament ──────────────────────────
function MatchLineTable({ sport, lines, totals, averages, matches }: {
  sport: string; lines: MatchLine[]; totals: Record<string, number>; averages?: Record<string, number>; matches: number;
}) {
  const t = useTheme();
  const cols = MATCH_COLS[sport] ?? [];
  if (!cols.length) return null;
  const cell: TextStyle = { fontFamily: t.font.numeric.semibold, fontVariant: ['tabular-nums'], fontSize: 12, color: t.color.foreground };
  const head: TextStyle = { fontFamily: t.font.sans.medium, fontSize: 11, color: t.color['gray-custom'] };

  return (
    <View style={{ marginTop: 8 }}>
      <View style={[styles.row, { paddingBottom: 4 }]}>
        <Text style={[head, styles.matchCol]}>Match</Text>
        {cols.map((c) => <Text key={c.key} style={[head, styles.statCol]}>{c.label}</Text>)}
      </View>
      {lines.map((l) => (
        <View key={l.matchId} style={[styles.row, styles.rowBorder, { borderTopColor: withAlpha(t.color.line, 0.6) }]}>
          <View style={styles.matchCol}>
            <Text style={{ fontFamily: t.font.sans.regular, fontSize: 12, color: withAlpha(t.color.foreground, 0.9) }}>{l.homeTeam} v {l.awayTeam}</Text>
            <Text style={{ fontFamily: t.font.sans.regular, fontSize: 10, color: t.color['gray-custom'] }}>
              {[l.round, shortDate(l.matchDate)].filter(Boolean).join(' · ')}
              {l.homeScore !== null && l.awayScore !== null ? ` · ${l.homeScore}–${l.awayScore}` : ''}
            </Text>
          </View>
          {cols.map((c) => <Text key={c.key} style={[cell, styles.statCol]}>{num(l.stats[c.key] ?? 0)}</Text>)}
        </View>
      ))}
      <View style={[styles.row, styles.rowBorder, { borderTopColor: t.color.line }]}>
        <Text style={[styles.matchCol, { fontFamily: t.font.sans.semibold, fontSize: 12, color: t.color.foreground }]}>
          Total · {matches} match{matches === 1 ? '' : 'es'}
        </Text>
        {cols.map((c) => <Text key={c.key} style={[cell, styles.statCol, { fontFamily: t.font.numeric.bold }]}>{num(totals[c.key] ?? 0)}</Text>)}
      </View>
      {averages && matches > 1 ? (
        <View style={[styles.row, { paddingTop: 2 }]}>
          <Text style={[styles.matchCol, head]}>Per game</Text>
          {cols.map((c) => <Text key={c.key} style={[styles.statCol, { ...cell, color: t.color['gray-custom'] }]}>{num(averages[c.key] ?? 0)}</Text>)}
        </View>
      ) : null}
    </View>
  );
}

// ── Pure card — takes the /performance-card payload ──────────────────────────
export function PerformanceCardView({ data }: { data: PerformanceCardData }) {
  const t = useTheme();
  const [openFull, setOpenFull] = useState(false);
  const [openTournament, setOpenTournament] = useState<string | null>(null);
  const { sport, career, tournaments = [], matchLines = [], competition = [], rankings = [], endorsementCount = 0, achievements = [], athleticsEvents = [] } = data;
  const hasVerified = !!career || tournaments.length > 0 || competition.length > 0 || rankings.length > 0;
  const hero = (sport && HERO[sport]) || [];
  const topRank = rankings[0];

  const toggle = (fn: () => void) => { LayoutAnimation.configureNext(LayoutAnimation.create(150, 'easeInEaseOut', 'opacity')); fn(); };

  const label: TextStyle = { fontFamily: t.font.sans.semibold, fontSize: 12, letterSpacing: 0.3, color: t.color['gray-custom'] };

  return (
    <Card padded={false} style={{ padding: 20 }}>
      <View style={[styles.row, { alignItems: 'center', gap: 8, marginBottom: 16 }]}>
        <BadgeCheck size={16} color={t.color['primary-light']} strokeWidth={2.25} />
        <Text variant="title" style={{ fontSize: 16, fontFamily: t.font.sans.bold }}>Performance Card</Text>
      </View>

      {!hasVerified ? (
        <View style={[styles.empty, { backgroundColor: t.color.surface, borderColor: t.color.line, borderRadius: t.radius.md }]}>
          <Text variant="body" color={withAlpha(t.color.foreground, 0.75)} style={{ fontSize: 14, textAlign: 'center' }}>No recorded competition data yet.</Text>
          <Text variant="body" color={t.color['gray-custom']} style={{ fontSize: 12, textAlign: 'center', marginTop: 4 }}>Performances are recorded at All For 1 partnered tournaments.</Text>
        </View>
      ) : null}

      {/* Hero band — recorded (verified) per-match headline metrics */}
      {career ? (
        <View style={[styles.heroBand, { borderColor: withAlpha(t.color.primary, 0.25), backgroundColor: withAlpha(t.color.primary, 0.06), borderRadius: t.radius.lg }]}>
          <View style={[styles.row, { alignItems: 'center', gap: 6, marginBottom: 12 }]}>
            <BadgeCheck size={12} color={withAlpha(t.color.primary, 0.9)} strokeWidth={2.5} />
            <Text style={{ fontFamily: t.font.display.bold, fontSize: 10, letterSpacing: 1, color: withAlpha(t.color.primary, 0.9) }}>RECORDED BY ALL FOR 1</Text>
          </View>
          <View style={styles.heroStats}>
            {hero.map((m) => (
              <View key={m.key}>
                <Text style={heroValueStyle(t)}>{career.averages[m.key] ?? 0}</Text>
                <Text style={heroLabelStyle(t)}>{m.label} / match</Text>
              </View>
            ))}
            <View>
              <Text style={heroValueStyle(t)}>{career.matches}</Text>
              <Text style={heroLabelStyle(t)}>Matches</Text>
            </View>
            {topRank ? (
              <View>
                <Text style={[heroValueStyle(t), { color: t.color['primary-light'] }]}>#{topRank.rank}</Text>
                <Text style={heroLabelStyle(t)}>{rankLabel(topRank.category)}</Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Competition record — per-tournament receipts, expandable to match lines */}
      {tournaments.length > 0 ? (
        <View style={{ marginTop: 16 }}>
          <Text style={[label, { marginBottom: 8 }]}>COMPETITION RECORD</Text>
          <View style={{ gap: 8 }}>
            {tournaments.map((tt) => {
              const lines = (matchLines ?? []).filter((l) => l.tournamentId === tt.id);
              const expanded = openTournament === tt.id;
              return (
                <View key={tt.id} style={[styles.receipt, { backgroundColor: t.color.surface, borderRadius: t.radius.md }]}>
                  <Pressable
                    disabled={!lines.length}
                    onPress={() => toggle(() => setOpenTournament(expanded ? null : tt.id))}
                    style={[styles.row, { alignItems: 'flex-start', gap: 8 }]}
                  >
                    <BadgeCheck size={14} color={t.color.primary} strokeWidth={2.25} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ fontFamily: t.font.sans.medium, fontSize: 14, color: withAlpha(t.color.foreground, 0.9) }}>
                        {tt.name}<Text style={{ color: t.color['gray-custom'], fontFamily: t.font.sans.regular }}> · {yr(tt.startDate)}</Text>
                      </Text>
                      <Text style={{ fontFamily: t.font.sans.regular, fontSize: 12, color: t.color['gray-custom'], marginTop: 1 }}>
                        {tt.matches} match{tt.matches === 1 ? '' : 'es'}{sport && RECEIPT[sport] && tt.averages ? ` · ${RECEIPT[sport](tt.averages)}` : ''}
                      </Text>
                    </View>
                    {lines.length > 0 ? (
                      <ChevronDown size={14} color={t.color['gray-custom']} style={{ marginTop: 2, transform: [{ rotate: expanded ? '180deg' : '0deg' }] }} />
                    ) : null}
                  </Pressable>
                  {expanded && sport ? <MatchLineTable sport={sport} lines={lines} totals={tt.totals} averages={tt.averages} matches={tt.matches} /> : null}
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Competition record for non-stat sports */}
      {tournaments.length === 0 && competition.length > 0 ? (
        <View style={{ marginTop: 16 }}>
          <Text style={[label, { marginBottom: 8 }]}>COMPETITION RECORD</Text>
          <View style={{ gap: 8 }}>
            {competition.map((c, i) => (
              <View key={i} style={[styles.receipt, styles.row, { backgroundColor: t.color.surface, borderRadius: t.radius.md, alignItems: 'flex-start', gap: 8 }]}>
                <BadgeCheck size={14} color={t.color.primary} strokeWidth={2.25} style={{ marginTop: 2 }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: t.font.sans.medium, fontSize: 14, color: withAlpha(t.color.foreground, 0.9) }}>
                    {c.tournament.name}<Text style={{ color: t.color['gray-custom'], fontFamily: t.font.sans.regular }}> · {yr(c.tournament.startDate)}</Text>
                  </Text>
                  <Text style={{ fontFamily: t.font.sans.regular, fontSize: 12, color: t.color['gray-custom'] }}>{c.team.name} · {c.teamMatches} match{c.teamMatches === 1 ? '' : 'es'}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Full record */}
      {career ? (
        <View style={{ marginTop: 12 }}>
          <Pressable onPress={() => toggle(() => setOpenFull((o) => !o))} style={[styles.row, { alignItems: 'center', gap: 4 }]}>
            <ChevronDown size={14} color={t.color['primary-light']} style={{ transform: [{ rotate: openFull ? '180deg' : '0deg' }] }} />
            <Text style={{ fontFamily: t.font.sans.medium, fontSize: 12, color: t.color['primary-light'] }}>Full record</Text>
          </Pressable>
          {openFull ? (
            <View style={styles.fullGrid}>
              {Object.entries(career.totals).filter(([k]) => !HIDDEN_METRICS.has(k)).map(([k, v]) => (
                <View key={k} style={[styles.fullTile, { backgroundColor: t.color.surface, borderRadius: t.radius.md }]}>
                  <Text style={{ fontFamily: t.font.numeric.bold, fontVariant: ['tabular-nums'], fontSize: 18, color: t.color.foreground }}>{career.averages[k] ?? 0}</Text>
                  <Text style={{ fontFamily: t.font.sans.regular, fontSize: 10, letterSpacing: 0.3, color: t.color['gray-custom'], marginTop: 2 }}>{(METRIC_LABEL[k] ?? k).toUpperCase()} / MATCH</Text>
                  <Text style={{ fontFamily: t.font.sans.regular, fontSize: 10, color: withAlpha(t.color['gray-custom'], 0.7) }}>{v} total</Text>
                </View>
              ))}
              {sport === 'BASKETBALL' ? shootingTiles(career.totals).map((tile) => (
                <View key={tile.key} style={[styles.fullTile, { backgroundColor: t.color.surface, borderRadius: t.radius.md }]}>
                  <Text style={{ fontFamily: t.font.numeric.bold, fontVariant: ['tabular-nums'], fontSize: 18, color: t.color.foreground }}>{tile.value}</Text>
                  <Text style={{ fontFamily: t.font.sans.regular, fontSize: 10, letterSpacing: 0.3, color: t.color['gray-custom'], marginTop: 2 }}>{tile.label}</Text>
                  <Text style={{ fontFamily: t.font.sans.regular, fontSize: 10, color: withAlpha(t.color['gray-custom'], 0.7) }}>{tile.detail}</Text>
                </View>
              )) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Athletics events */}
      {athleticsEvents.length > 0 ? (
        <View style={{ marginTop: 16 }}>
          <Text style={[label, { marginBottom: 8 }]}>EVENTS</Text>
          <View style={styles.chipWrap}>
            {athleticsEvents.map((e) => (
              <View key={e} style={[styles.eventChip, { backgroundColor: t.color.elevated, borderRadius: t.radius.pill }]}>
                <Text style={{ fontFamily: t.font.sans.medium, fontSize: 12, color: withAlpha(t.color.foreground, 0.8) }}>{e}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Trust-graded footer */}
      {achievements.length > 0 ? (
        <View style={{ marginTop: 16 }}>
          <View style={[styles.row, { alignItems: 'center', gap: 8, marginBottom: 8 }]}>
            <Text style={label}>ACHIEVEMENTS</Text>
            <View style={[styles.selfReported, { backgroundColor: t.color.elevated, borderRadius: t.radius.sm }]}>
              <Text style={{ fontFamily: t.font.sans.regular, fontSize: 10, color: t.color['gray-custom'] }}>Self-reported</Text>
            </View>
          </View>
          <View style={{ gap: 6 }}>
            {achievements.map((a, i) => (
              <View key={i} style={[styles.row, { gap: 8, alignItems: 'flex-start' }]}>
                <Award size={14} color={t.color.secondary} strokeWidth={2.25} style={{ marginTop: 2 }} />
                <Text style={{ flex: 1, fontFamily: t.font.sans.regular, fontSize: 14, color: withAlpha(t.color.foreground, 0.85) }}>{a}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {endorsementCount > 0 ? (
        <View style={[styles.row, { alignItems: 'center', gap: 6, marginTop: 16 }]}>
          <BadgeCheck size={13} color={t.color.primary} strokeWidth={2.25} />
          <Text style={{ fontFamily: t.font.sans.regular, fontSize: 12, color: t.color['gray-custom'] }}>Endorsed by {endorsementCount} coach{endorsementCount === 1 ? '' : 'es'}</Text>
        </View>
      ) : null}
    </Card>
  );
}

// ── Connected wrapper ────────────────────────────────────────────────────────
export function PerformanceCard({ id }: { id: string }) {
  const { data } = useQuery({
    queryKey: ['performance-card', id],
    queryFn: () => fetchPerformanceCard(id),
    enabled: !!id,
  });
  if (!data) return null;
  return <PerformanceCardView data={data} />;
}

const heroValueStyle = (t: ReturnType<typeof useTheme>): TextStyle => ({ fontFamily: t.font.numeric.bold, fontVariant: ['tabular-nums'], fontSize: 30, lineHeight: 30, color: t.color.foreground });
const heroLabelStyle = (t: ReturnType<typeof useTheme>): TextStyle => ({ fontFamily: t.font.sans.regular, fontSize: 11, letterSpacing: 0.3, color: t.color['gray-custom'], marginTop: 4, textTransform: 'uppercase' });

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  empty: { borderWidth: StyleSheet.hairlineWidth, paddingVertical: 24, paddingHorizontal: 16 },
  heroBand: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 16 },
  heroStats: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 24, rowGap: 12 },
  receipt: { paddingHorizontal: 12, paddingVertical: 8 },
  fullGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  fullTile: { width: '31.5%', paddingHorizontal: 12, paddingVertical: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  eventChip: { paddingHorizontal: 10, paddingVertical: 5 },
  selfReported: { paddingHorizontal: 6, paddingVertical: 2 },
  matchCol: { flex: 1, paddingRight: 8 },
  statCol: { width: 34, textAlign: 'right' },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
});
