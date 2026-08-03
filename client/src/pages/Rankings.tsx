import Avatar from '../components/Avatar';
import BallLoader from '../components/BallLoader';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { TrendingUp, Trophy, ArrowLeft, MapPin, Users } from 'lucide-react';
import { VerifiedTick } from '../components/feed/FeedBits';
import { SPORTS, ATHLETICS_EVENTS } from '../data/sports';
import SportBackdrop from '../components/SportBackdrop';

type Gender = 'MALE' | 'FEMALE';
type Tournament = {
  id: string; name: string; sport?: string; startDate: string; endDate?: string;
  thumbnailUrl?: string | null; city?: string | null; venue?: string | null;
  status?: string; playerCount?: number;
};
type RankingUser = {
  id?: string; name?: string; avatar?: string | null;
  position?: string | null; location?: string | null; verified?: boolean;
};
type RankingRow = { id: string; rank: number; score: number; sport: string; user?: RankingUser };

const SPORT_ICONS: Record<string, string> = Object.fromEntries(
  SPORTS.map(({ value, emoji }) => [value, emoji]),
);
const SPORT_LABELS: Record<string, string> = Object.fromEntries(
  SPORTS.map(({ value, label }) => [value, label]),
);

// Gender-specific weight classes (kg) for the weight-class sports.
const WEIGHT_CLASSES: Record<string, Record<Gender, string[]>> = {
  WRESTLING: {
    MALE:   ['57 kg', '61 kg', '65 kg', '70 kg', '74 kg', '79 kg', '86 kg', '92 kg', '97 kg', '125 kg'],
    FEMALE: ['50 kg', '53 kg', '55 kg', '57 kg', '59 kg', '62 kg', '65 kg', '68 kg', '72 kg', '76 kg'],
  },
  BOXING: {
    MALE:   ['51 kg', '57 kg', '63.5 kg', '71 kg', '80 kg', '92 kg', '+92 kg'],
    FEMALE: ['50 kg', '54 kg', '57 kg', '60 kg', '66 kg', '75 kg'],
  },
  WEIGHTLIFTING: {
    MALE:   ['61 kg', '73 kg', '89 kg', '102 kg', '+102 kg'],
    FEMALE: ['49 kg', '59 kg', '71 kg', '81 kg', '+81 kg'],
  },
};

const SHOOTING_EVENTS = ['10m Air Rifle', '10m Air Pistol', '25m Pistol', '50m Rifle 3P', 'Trap', 'Skeet'];

// Sports whose tabs are positions we can filter client-side against athlete.position.
const POSITION_SPORTS = new Set(['BASKETBALL', 'FOOTBALL']);

// Maps a position category to substrings we match against athlete.position
const POSITION_FILTER: Record<string, string[]> = {
  GUARD:       ['guard', 'pg', 'sg'],
  FORWARD:     ['forward', 'sf', 'pf'],
  CENTER:      ['center', 'centre'],
  FORWARDS:    ['forward', 'striker', 'winger', 'st', 'cf', 'lw', 'rw'],
  MIDFIELDERS: ['mid', 'cm', 'cdm', 'cam', 'lm', 'rm'],
  DEFENDERS:   ['defend', 'back', 'cb', 'lb', 'rb', 'rwb', 'lwb'],
  GOALKEEPERS: ['keeper', 'gk', 'goalie'],
};

/** Category tabs for a sport. OVERALL is dropped for combat/weight and event
 *  sports; weight-class sports get gender-specific divisions. */
function getCategories(sport: string, gender: Gender): string[] {
  switch (sport) {
    case 'BASKETBALL': return ['OVERALL', 'GUARD', 'FORWARD', 'CENTER'];
    case 'FOOTBALL':   return ['OVERALL', 'FORWARDS', 'MIDFIELDERS', 'DEFENDERS', 'GOALKEEPERS'];
    case 'CRICKET':    return ['OVERALL', 'BATTING', 'BOWLING', 'ALL_ROUND'];
    case 'ATHLETICS':  return [...ATHLETICS_EVENTS];
    case 'SHOOTING':   return SHOOTING_EVENTS;
    case 'WRESTLING':
    case 'BOXING':
    case 'WEIGHTLIFTING':
      return WEIGHT_CLASSES[sport][gender];
    default:           return ['OVERALL'];
  }
}

/** Horizontal rating bar — width is the athlete's score relative to the leader. */
function RatingBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(6, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="mt-2 h-1.5 w-full max-w-[16rem] overflow-hidden rounded-full bg-elevated">
      <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Option C — Performance Card: rank numeral, athlete, rating bar, faint
 *  sport-specific court watermark, and the rating as the hero number. */
function PerformanceCard({ r, max }: { r: RankingRow; max: number }) {
  const u: RankingUser = r.user ?? {};
  const top3 = r.rank <= 3;
  const [intPart, decPart] = Number(r.score ?? 0).toFixed(1).split('.');

  return (
    <Link
      to={`/profile/${u.id}`}
      className="group relative block overflow-hidden rounded-2xl border border-line bg-card transition-colors hover:border-primary/50"
    >
      {/* Sport-unique line-art watermark, anchored to the right of the card.
          .sport-backdrop lets the light-theme override recolor the strokes. */}
      <div className="sport-backdrop pointer-events-none absolute inset-y-0 right-0 w-2/3 opacity-70">
        <SportBackdrop sport={r.sport} />
      </div>

      <div className="relative flex items-center gap-3 px-4 py-4 sm:gap-4 sm:px-5">
        {/* Rank numeral — top 3 in the brand color, the rest muted with a leading zero */}
        <span
          className={`shrink-0 text-center font-black tabular-nums ${
            top3 ? 'w-9 text-3xl text-primary' : 'w-9 text-xl text-gray-custom'
          }`}
        >
          {String(r.rank).padStart(2, '0')}
        </span>

        {/* Avatar */}
        <Avatar name={u.name} src={u.avatar} size={44} />

        {/* Athlete + rating bar */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate font-semibold text-foreground">{u.name ?? 'Unknown'}</p>
            {u.verified && <VerifiedTick />}
            {u.position && (
              <span className="shrink-0 rounded bg-elevated px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-custom">
                {u.position}
              </span>
            )}
          </div>
          {u.location && <p className="truncate text-xs text-gray-custom">{u.location}</p>}
          <RatingBar value={Number(r.score ?? 0)} max={max} />
        </div>

        {/* Hero rating */}
        <div className="shrink-0 text-right leading-none">
          <span className="text-3xl font-black tabular-nums text-foreground">{intPart}</span>
          <span className="text-base font-bold text-gray-custom">.{decPart}</span>
        </div>
      </div>
    </Link>
  );
}

/** Date range, collapsed when a tournament starts and ends on the same day. */
function dateRange(start?: string, end?: string): string {
  if (!start) return '';
  const f = (d: string) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  if (!end || new Date(start).toDateString() === new Date(end).toDateString()) return f(start);
  return `${new Date(start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${f(end)}`;
}

/** Tournament tile on the picker. The thumbnail is what makes this scannable,
 *  so when one is missing the sport backdrop stands in rather than a grey box. */
function TournamentTile({ t, sport, onOpen }: { t: Tournament; sport: string; onOpen: () => void }) {
  const live = t.status === 'ONGOING' || t.status === 'IN_PROGRESS';
  return (
    <button
      onClick={onOpen}
      className="group overflow-hidden rounded-2xl border border-line bg-card text-left transition-all hover:border-primary hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="relative h-32 overflow-hidden bg-dark-light">
        {t.thumbnailUrl ? (
          <img
            src={t.thumbnailUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="relative flex h-full w-full items-center justify-center">
            <div className="sport-backdrop absolute inset-0 opacity-40">
              <SportBackdrop sport={t.sport ?? sport} />
            </div>
            <span className="relative text-4xl">{SPORT_ICONS[t.sport ?? sport]}</span>
          </div>
        )}
        {live && (
          <span className="absolute left-2 top-2 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            Live
          </span>
        )}
      </div>

      <div className="p-3.5">
        <h3 className="truncate font-bold leading-tight" title={t.name}>{t.name}</h3>
        <p className="mt-1 text-xs text-gray-custom">{dateRange(t.startDate, t.endDate)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-custom">
          {(t.city || t.venue) && (
            <span className="flex min-w-0 items-center gap-1">
              <MapPin size={12} className="shrink-0" />
              <span className="truncate">{t.city || t.venue}</span>
            </span>
          )}
          <span className="flex items-center gap-1 font-semibold text-foreground">
            <Users size={12} className="shrink-0" />
            {t.playerCount ?? 0} ranked
          </span>
        </div>
      </div>
    </button>
  );
}

export default function Rankings() {
  const [sport, setSport] = useState('BASKETBALL');
  const [gender, setGender] = useState<Gender>('MALE');
  const [category, setCategory] = useState('OVERALL');
  const [tournamentId, setTournamentId] = useState<string | null>(null);

  const categories = getCategories(sport, gender);

  // Keep the active category valid when the sport/gender (and so the tab list) changes.
  const selectCategory = (next: string) => setCategory(next);
  const changeSport = (value: string) => {
    setSport(value);
    setCategory(getCategories(value, gender)[0]);
    setTournamentId(null); // pick up the new sport's most recent tournament
  };
  // Gender deliberately KEEPS the open tournament — switching Men/Women inside a
  // tournament should stay in it. If that tournament has no rankings for the new
  // gender it drops out of the list, and the picker comes back on its own.
  const changeGender = (next: Gender) => {
    setGender(next);
    setCategory(getCategories(sport, next)[0]);
  };

  // Rankings are stored per tournament, so a tournament must be chosen before
  // there is a meaningful rank column at all.
  const { data: tData, isLoading: tLoading } = useQuery({
    queryKey: ['ranking-tournaments', sport, gender],
    queryFn: async () => {
      const { data } = await api.get(`/rankings/tournaments?sport=${sport}&gender=${gender}`);
      return data;
    },
  });
  const tournaments: Tournament[] = tData?.tournaments ?? [];
  // No auto-select: the page opens on the picker so the reader always knows
  // WHICH tournament a rank belongs to. A rank of 1 means nothing without it.
  const activeTournament = tournaments.find((t) => t.id === tournamentId) ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ['rankings', sport, gender, activeTournament?.id],
    enabled: !!activeTournament,
    queryFn: async () => {
      const { data } = await api.get(
        `/rankings?sport=${sport}&gender=${gender}&tournamentId=${activeTournament!.id}`,
      );
      return data;
    },
  });

  const allRankings: RankingRow[] = data?.rankings ?? [];
  // Position sports can be filtered client-side; other sports show the full list
  // (their per-category data isn't computed yet).
  const filtered = POSITION_SPORTS.has(sport) && category !== 'OVERALL'
    ? allRankings.filter((r) => {
        const pos = (r.user?.position ?? '').toLowerCase();
        return (POSITION_FILTER[category] ?? []).some(kw => pos.includes(kw));
      })
    : allRankings;

  // Re-number within the category. The stored `rank` is the OVERALL placing, so
  // showing it under a position tab produced gappy lists (3, 4, 6, 10, 13…) and
  // no #1 guard at all. A position ranking has to start at 1 to be a ranking.
  const rankings = [...filtered]
    .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0))
    .map((r, i) => ({ ...r, rank: i + 1 }));

  // The leader's score sets the full width of every rating bar.
  const maxScore = rankings.reduce((m, r) => Math.max(m, Number(r.score ?? 0)), 0);

  const genderSwitch = (
    <div className="inline-flex rounded-full border border-line bg-card p-0.5">
      {([['MALE', 'Men'], ['FEMALE', 'Women']] as const).map(([value, label]) => (
        <button
          key={value}
          onClick={() => changeGender(value)}
          className={`rounded-full px-5 py-1.5 text-sm font-semibold transition-colors ${
            gender === value ? 'bg-primary text-on-primary' : 'text-gray-custom hover:text-foreground'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  // ─── Step 1: pick a tournament ──────────────────────────────
  if (!activeTournament) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {SPORTS.map(({ value }) => (
            <button
              key={value}
              onClick={() => changeSport(value)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                sport === value
                  ? 'bg-primary font-semibold text-on-primary'
                  : 'border border-line bg-card text-gray-custom hover:text-foreground'
              }`}
            >
              {SPORT_ICONS[value]} {SPORT_LABELS[value]}
            </button>
          ))}
        </div>

        <div className="mb-4">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-gray-custom">
            <span>{SPORT_ICONS[sport]}</span>
            {SPORT_LABELS[sport]} · {gender === 'MALE' ? "Men's" : "Women's"}
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight">Player Rankings</h1>
          <p className="mt-1 text-sm text-gray-custom">
            Rankings are published per tournament. Pick one to see its leaderboard.
          </p>
          <div className="mt-3">{genderSwitch}</div>
        </div>

        {tLoading ? (
          <div className="flex justify-center py-16"><BallLoader /></div>
        ) : tournaments.length === 0 ? (
          <div className="rounded-2xl border border-line bg-card p-16 text-center">
            <Trophy size={32} className="mx-auto mb-3 text-gray-custom" />
            <p className="text-gray-custom">
              No ranked {SPORT_LABELS[sport]?.toLowerCase()} tournaments yet. Rankings appear here once a
              tournament's matches are published.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {tournaments.map((t) => (
              <TournamentTile key={t.id} t={t} sport={sport} onOpen={() => setTournamentId(t.id)} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── Step 2: that tournament's rankings ─────────────────────
  return (
    <div className="mx-auto max-w-3xl">
      <button
        onClick={() => setTournamentId(null)}
        className="mb-4 flex items-center gap-1.5 text-sm text-gray-custom transition-colors hover:text-foreground"
      >
        <ArrowLeft size={15} /> All tournaments
      </button>

      {/* Header */}
      <div className="mb-4">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-gray-custom">
          <span>{SPORT_ICONS[sport]}</span>
          {SPORT_LABELS[sport]} · {gender === 'MALE' ? "Men's" : "Women's"}
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight">{activeTournament.name}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-custom">
          <span>{dateRange(activeTournament.startDate, activeTournament.endDate)}</span>
          {(activeTournament.city || activeTournament.venue) && (
            <span className="flex items-center gap-1">
              <MapPin size={13} /> {activeTournament.city || activeTournament.venue}
            </span>
          )}
        </p>
        <div className="mt-3">{genderSwitch}</div>
      </div>

      {/* Category pills */}
      <div className="mb-5 flex flex-wrap gap-2">
        {categories.map(c => (
          <button
            key={c}
            onClick={() => selectCategory(c)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              category === c
                ? 'bg-primary text-on-primary'
                : 'border border-line bg-card text-gray-custom hover:text-foreground'
            }`}
          >
            {c.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Leaderboard */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <BallLoader />
        </div>
      ) : rankings.length === 0 ? (
        <div className="rounded-2xl border border-line bg-card p-16 text-center">
          <TrendingUp size={32} className="mx-auto mb-3 text-gray-custom" />
          <p className="text-gray-custom">
            No {category === 'OVERALL' ? '' : `${category.replace('_', ' ').toLowerCase()} `}rankings for{' '}
            {activeTournament.name}.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {rankings.map((r) => (
            <PerformanceCard key={r.id} r={r} max={maxScore} />
          ))}
        </div>
      )}
    </div>
  );
}
