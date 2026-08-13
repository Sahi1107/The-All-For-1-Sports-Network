// Human-readable preview of what a draw config will produce, for the setup forms.
// Byes now make any team count valid, so this informs (bracket size, byes) and
// warns on degenerate configs rather than blocking (except <2 teams).
import type { TrackerFormat } from './types';

export interface DrawPreview {
  summary: string;
  warnings: string[];
  blocked: boolean; // true only when the draw genuinely cannot be generated
}

const nextPow2 = (n: number) => { let p = 1; while (p < n) p *= 2; return Math.max(p, 1); };

export function describeDraw(
  format: TrackerFormat,
  teamCount: number,
  cfg: { groupsCount: number; advancePerGroup: number },
): DrawPreview {
  const warnings: string[] = [];
  if (teamCount < 2) {
    return { summary: `${teamCount} team${teamCount === 1 ? '' : 's'} registered — at least 2 are needed to generate a draw.`, warnings, blocked: true };
  }

  if (format === 'LEAGUE') {
    const matches = (teamCount * (teamCount - 1)) / 2;
    return { summary: `${teamCount} teams · round-robin · ${matches} matches`, warnings, blocked: false };
  }

  if (format === 'KNOCKOUT') {
    if (teamCount > 32) {
      return { summary: `${teamCount} teams — knockout brackets support up to 32 teams.`, warnings, blocked: true };
    }
    const bracket = nextPow2(teamCount);
    const byes = bracket - teamCount;
    return { summary: `${teamCount} teams → ${bracket}-team knockout${byes ? `, ${byes} bye${byes > 1 ? 's' : ''}` : ''}`, warnings, blocked: false };
  }

  // MIXED
  const groups = Math.max(1, cfg.groupsCount);
  const adv = Math.max(1, cfg.advancePerGroup);
  const smallest = Math.floor(teamCount / groups);
  const largest = Math.ceil(teamCount / groups);
  if (groups > teamCount) warnings.push(`${groups} groups but only ${teamCount} teams — some groups will be empty.`);
  if (adv > smallest) warnings.push(`Advancing ${adv} per group, but the smallest group has ${smallest} team${smallest === 1 ? '' : 's'} — some knockout spots will be byes.`);
  const advancing = Math.min(groups * adv, teamCount);
  if (advancing > 32) {
    return { summary: `${advancing} teams would advance — the knockout stage supports up to 32.`, warnings, blocked: true };
  }
  const bracket = nextPow2(advancing);
  const byes = bracket - advancing;
  const sizes = smallest === largest ? `${smallest}` : `${smallest}–${largest}`;
  return {
    summary: `${teamCount} teams → ${groups} group${groups > 1 ? 's' : ''} of ${sizes} → top ${adv} advance (${advancing}) → ${bracket}-team knockout${byes ? `, ${byes} bye${byes > 1 ? 's' : ''}` : ''}`,
    warnings,
    blocked: false,
  };
}
