import { Eye, TrendingUp, TrendingDown, Share2 } from 'lucide-react';

export interface ProfileViewsSummary {
  total7: number;
  prev7: number;
  deltaPct: number | null;
  notable7: number;
  byRole: { scout: number; coach: number; agent: number; team: number };
  daily: number[];
}

/** Human "3 scouts and 2 coaches" line from the anonymised role counts. */
function whoLine(b: ProfileViewsSummary['byRole']): string | null {
  const parts: string[] = [];
  if (b.scout) parts.push(`${b.scout} scout${b.scout > 1 ? 's' : ''}`);
  if (b.coach) parts.push(`${b.coach} coach${b.coach > 1 ? 'es' : ''}`);
  if (b.agent) parts.push(`${b.agent} agent${b.agent > 1 ? 's' : ''}`);
  if (b.team) parts.push(`${b.team} club${b.team > 1 ? 's' : ''}`);
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function Sparkline({ daily }: { daily: number[] }) {
  const max = Math.max(1, ...daily);
  return (
    <div className="flex items-end gap-1 h-8" aria-hidden>
      {daily.map((v, i) => {
        const today = i === daily.length - 1;
        return (
          <div
            key={i}
            className={`flex-1 rounded-sm ${today ? 'bg-primary' : 'bg-primary/25'}`}
            style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
            title={`${v} view${v === 1 ? '' : 's'}`}
          />
        );
      })}
    </div>
  );
}

/** The "someone is watching" moment — owner-only, anonymised (counts + roles,
 *  never who). Renders on the athlete's own profile. */
export default function ProfileViewsCard({
  summary, onShare,
}: { summary: ProfileViewsSummary; onShare?: () => void }) {
  const { total7, deltaPct, notable7, byRole, daily } = summary;
  const who = whoLine(byRole);
  const up = deltaPct != null && deltaPct > 0;
  const down = deltaPct != null && deltaPct < 0;

  return (
    <div className="bg-card rounded-xl border border-line p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-foreground/45">
          <Eye size={13} className="text-primary" /> Who’s watching
        </span>
        {deltaPct != null && total7 > 0 && (
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
              up ? 'bg-primary/12 text-primary-light' : down ? 'bg-ink/10 text-foreground/50' : 'text-foreground/40'
            }`}
          >
            {up ? <TrendingUp size={12} /> : down ? <TrendingDown size={12} /> : null}
            {up ? '+' : ''}{deltaPct}% vs last week
          </span>
        )}
      </div>

      {total7 > 0 ? (
        <>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="font-display font-extrabold text-4xl leading-none tabular-nums">{total7}</p>
              <p className="text-sm text-foreground/60 mt-1">profile view{total7 === 1 ? '' : 's'} this week</p>
            </div>
            <div className="w-28 shrink-0">
              <Sparkline daily={daily} />
            </div>
          </div>
          {notable7 > 0 && who && (
            <p className="mt-3 text-sm">
              <span className="text-primary-light font-semibold">{who}</span>
              <span className="text-foreground/60"> looked at you this week.</span>
            </p>
          )}
          {notable7 === 0 && (
            <p className="mt-3 text-sm text-foreground/55">People are checking out your profile. Keep posting to get on scouts’ radar.</p>
          )}
        </>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-display font-bold text-lg leading-snug">No views yet this week</p>
            <p className="text-sm text-foreground/55 mt-1">Share your profile so scouts and coaches can find you.</p>
          </div>
          {onShare && (
            <button
              onClick={onShare}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary/12 text-primary-light border border-primary/25 hover:bg-primary/20 text-sm font-semibold transition-colors"
            >
              <Share2 size={14} /> Share
            </button>
          )}
        </div>
      )}
    </div>
  );
}
