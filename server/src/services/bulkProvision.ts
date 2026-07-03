/**
 * Admin bulk-provisioning service — tournament roster import.
 *
 * Takes a list of normalized "long-format" CSV rows (one record per member) and
 * either previews or commits them against a tournament. Committing creates any
 * missing Firebase + Prisma accounts (with a temp password the user must change
 * on first login), links rows whose email already exists, builds the teams, and
 * adds every member with `status = ACCEPTED` — bypassing the invite/accept
 * handshake entirely. The self-serve invite flow is untouched.
 *
 * The pure functions here (reshape/validate/classify) carry no DB or Firebase
 * dependency so they can be unit-tested directly; `commitBulkProvision` performs
 * the side-effecting writes.
 */

import { Role, TeamMemberRole, Gender, Sport } from '@prisma/client';
import {
  provisionAthleteAccount,
  ageFromDob,
  GUARDIAN_AGE_THRESHOLD,
  generateTempPassword,
} from './provisionAthlete';

// NOTE: prisma / firebaseAdmin / email / logger are imported lazily inside
// `commitBulkProvision` (via dynamic import) so that importing this module for
// its pure validation functions — e.g. in unit tests — does not initialize the
// database client or the Firebase Admin SDK as a side effect.

// Account creation (Firebase + Prisma + emails + minor-safety enforcement) is
// delegated to the shared provisionAthleteAccount so bulk goes through the exact
// same enforced path as single-profile creation and self-serve signup.

// ─── Constants ────────────────────────────────────────────────────────────────

// GUARDIAN_AGE_THRESHOLD, ageFromDob, generateTempPassword now live in
// provisionAthlete (single source of truth); re-exported for existing importers.
export { ageFromDob, GUARDIAN_AGE_THRESHOLD, generateTempPassword };

/** Anyone under this is a minor — surfaces a guardian/consent warning. */
export const MINOR_AGE_THRESHOLD = 18;
/** Default roster bounds when the tournament leaves them unset. */
export const DEFAULT_MIN_ROSTER = 5;
export const DEFAULT_MAX_ROSTER = 12;

// ─── Types ────────────────────────────────────────────────────────────────────

/** A raw long-format row as parsed/reshaped by the client. All fields optional. */
export interface RawRow {
  team_name?: string;
  member_role?: string;
  name?: string;
  email?: string;
  dob?: string;
  gender?: string;
  position?: string;
  phone?: string;
  guardian_email?: string;
  [extra: string]: unknown;
}

export type Classification = 'NEW' | 'EXISTING' | 'ERROR';

export interface RowReport {
  index: number;
  teamName: string;
  name: string;
  email: string;
  memberRole: TeamMemberRole | null;
  classification: Classification;
  reasons: string[];
  warnings: string[];
}

export interface TeamReport {
  teamName: string;
  memberCount: number;
  playerCount: number; // CAPTAIN + PLAYER (excludes COACH)
  hasCaptain: boolean;
  hasCoach: boolean;
  errors: string[];
  warnings: string[];
}

export interface PreviewReport {
  rows: RowReport[];
  teams: TeamReport[];
  counts: {
    newAccounts: number;
    linkedAccounts: number;
    teams: number;
    totalMembers: number;
  };
  blockingErrors: string[];
  canCommit: boolean;
}

/** Raw tournament fields loaded from the DB (the tournament-scoped entry point). */
export interface TournamentContext {
  id: string;
  name: string;
  sport: Sport;
  genderCategory: string | null;
  minRosterSize: number | null;
  maxRosterSize: number | null;
}

/**
 * The generalized context the pipeline actually runs on — the same CSV validate/
 * classify/commit logic, abstracted over "with a tournament" vs "standalone".
 * The tournament flow is now just one way to build this (see tournamentToContext).
 */
export interface ProvisionContext {
  /** Sport applied to every account and team created in this batch. */
  sport: Sport;
  /** Tournament to register teams into, or null for a standalone import. */
  tournamentId: string | null;
  /** Gender forced for every member (from a tournament category), or null to use each row's own. */
  genderCategory: string | null;
  /** Roster-size bounds. null = unbounded — standalone imports don't cap team size. */
  minRosterSize: number | null;
  maxRosterSize: number | null;
  /**
   * When true, every row must name a team (tournament rosters). When false,
   * team-less rows are provisioned as standalone profiles (no team membership).
   */
  requireTeam: boolean;
}

/**
 * Build the context for a tournament roster import. Roster-size defaults are a
 * tournament concept, so they're resolved here (not in the generic pipeline).
 * requireTeam is true: a tournament roster row without a team is an error.
 */
export function tournamentToContext(t: TournamentContext): ProvisionContext {
  return {
    sport: t.sport,
    tournamentId: t.id,
    genderCategory: t.genderCategory,
    minRosterSize: t.minRosterSize ?? DEFAULT_MIN_ROSTER,
    maxRosterSize: t.maxRosterSize ?? DEFAULT_MAX_ROSTER,
    requireTeam: true,
  };
}

/**
 * Build the context for a standalone import (no tournament). Sport is chosen for
 * the whole batch; roster size is unbounded; team-less rows become plain profiles.
 */
export function standaloneContext(sport: Sport): ProvisionContext {
  return {
    sport,
    tournamentId: null,
    genderCategory: null,
    minRosterSize: null,
    maxRosterSize: null,
    requireTeam: false,
  };
}

// ─── Pure helpers ───────────────────────────────────────────────────────────────

/** Trim + lowercase. Returns '' when the input is blank/missing. */
export function normalizeEmail(email: string | undefined | null): string {
  return (email ?? '').trim().toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

/**
 * Parse a date of birth from common CSV formats (ISO `YYYY-MM-DD` and
 * `DD/MM/YYYY` / `MM/DD/YYYY` are accepted; ISO is preferred). Returns null when
 * the value is missing or not a real calendar date.
 */
export function parseDob(raw: string | undefined | null): Date | null {
  const s = (raw ?? '').trim();
  if (!s) return null;

  let y: number, m: number, d: number;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (iso) {
    y = +iso[1]; m = +iso[2]; d = +iso[3];
  } else if (slash) {
    // Assume DD/MM/YYYY; fall back to MM/DD/YYYY if day > 12.
    const a = +slash[1], b = +slash[2];
    if (a > 12 && b <= 12) { d = a; m = b; } else { d = a; m = b; }
    y = +slash[3];
  } else {
    return null;
  }

  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > new Date().getFullYear()) {
    return null;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  // Reject overflow (e.g. 2010-02-31 → March).
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date;
}

/** Whole years between a date of birth and now. */

/** Map a CSV member-role string to a TeamMemberRole, or null when unrecognized. */
export function mapMemberRole(raw: string | undefined | null): TeamMemberRole | null {
  switch ((raw ?? '').trim().toLowerCase()) {
    case 'captain': return TeamMemberRole.CAPTAIN;
    case 'player':  return TeamMemberRole.PLAYER;
    case 'coach':   return TeamMemberRole.COACH;
    default:        return null;
  }
}

/** A coach gets the COACH user role; everyone else is an ATHLETE. */
export function userRoleForMember(memberRole: TeamMemberRole): Role {
  return memberRole === TeamMemberRole.COACH ? Role.COACH : Role.ATHLETE;
}

/**
 * Gender implied by the tournament's genderCategory, if any. MEN→MALE,
 * WOMEN→FEMALE; MIXED/OPEN leave it unset so a row's own gender can apply.
 */
export function genderFromCategory(genderCategory: string | null): Gender | null {
  switch ((genderCategory ?? '').trim().toUpperCase()) {
    case 'MEN':
    case 'MALE':   return Gender.MALE;
    case 'WOMEN':
    case 'FEMALE': return Gender.FEMALE;
    default:       return null;
  }
}

/** Parse a free-text gender cell to the enum, or null. */
export function parseGender(raw: string | undefined | null): Gender | null {
  switch ((raw ?? '').trim().toUpperCase()) {
    case 'MALE':
    case 'M':   return Gender.MALE;
    case 'FEMALE':
    case 'F':   return Gender.FEMALE;
    default:    return null;
  }
}

// ─── Resolved per-row shape (after validation) ──────────────────────────────────

export interface ResolvedRow {
  report: RowReport;
  // Present only for non-ERROR rows; used by commit.
  email: string;
  name: string;
  memberRole: TeamMemberRole;
  gender: Gender | null;
  dob: Date | null;
  position: string | null;
  phone: string | null;
  guardianEmail: string | null;
  age: number | null;
}

// ─── Core validation + classification (pure) ────────────────────────────────────

/**
 * Validate and classify every row, group by team, and produce a structured
 * preview report. `existingEmails` is the set of normalized emails that already
 * map to a Prisma user (caller supplies it from the DB) — those rows are
 * classified EXISTING (linked) rather than NEW.
 *
 * Works for both entry points via the ProvisionContext: a tournament import
 * (requireTeam, bounded roster, category gender) or a standalone import
 * (team-less rows allowed, unbounded roster, per-row gender).
 */
export function buildReport(
  rows: RawRow[],
  ctx: ProvisionContext,
  existingEmails: Set<string>,
): { report: PreviewReport; resolved: ResolvedRow[] } {
  const minRoster = ctx.minRosterSize ?? 1;          // a team needs at least its captain
  const maxRoster = ctx.maxRosterSize ?? Infinity;   // standalone imports don't cap size
  const contextGender = genderFromCategory(ctx.genderCategory);

  const resolved: ResolvedRow[] = [];
  // Track emails seen per team to flag duplicates within a single team.
  const seenPerTeam = new Map<string, Set<string>>();

  rows.forEach((raw, index) => {
    const reasons: string[] = [];
    const warnings: string[] = [];

    const teamName = (raw.team_name ?? '').trim();
    const name = (raw.name ?? '').trim();
    const email = normalizeEmail(raw.email);
    const memberRole = mapMemberRole(raw.member_role);
    // Standalone imports allow team-less rows — a plain profile with no team.
    const teamless = teamName === '';

    if (teamless && ctx.requireTeam) reasons.push('Missing team name');
    if (!name) reasons.push('Missing name');
    if (!email) reasons.push('Missing email');
    else if (!isValidEmail(email)) reasons.push(`Invalid email "${email}"`);
    // A team row needs a valid role. A team-less profile row may omit it
    // (defaults to athlete); only a *provided* unrecognized role is an error.
    if (teamless) {
      if ((raw.member_role ?? '').trim() && !memberRole) {
        reasons.push(`Unrecognized role "${raw.member_role}" (expected captain, player, or coach)`);
      }
    } else if (!memberRole) {
      reasons.push(`Unrecognized role "${raw.member_role ?? ''}" (expected captain, player, or coach)`);
    }

    // Duplicate email within the same team (or across team-less profile rows).
    if (email) {
      const key = teamless ? ' teamless' : teamName.toLowerCase();
      const scope = teamless ? 'this import' : `team "${teamName}"`;
      const seen = seenPerTeam.get(key) ?? new Set<string>();
      if (seen.has(email)) reasons.push(`Duplicate email "${email}" within ${scope}`);
      seen.add(email);
      seenPerTeam.set(key, seen);
    }

    // DOB is REQUIRED for athletes (players/captains) — the same rule self-serve
    // signup enforces. Coaches (adults) are exempt.
    const isAthlete = memberRole !== TeamMemberRole.COACH;
    const dob = parseDob(raw.dob);
    let age: number | null = null;
    if (raw.dob && raw.dob.trim() && !dob) {
      reasons.push(`Invalid date of birth "${raw.dob}"`);
    } else if (isAthlete && (memberRole || teamless) && !dob) {
      // Enforced for every provisionable athlete — a known team role, or a
      // team-less profile row (which defaults to athlete). Same rule as signup.
      reasons.push('Date of birth is required for athletes');
    }
    if (dob) age = ageFromDob(dob);

    // Gender: context-implied (tournament category) first, else the row's own.
    const rowGender = parseGender(raw.gender);
    const gender = contextGender ?? rowGender;

    const guardianEmail = normalizeEmail(raw.guardian_email) || null;

    // Minor safety — ENFORCED (blocking), matching provisionAthleteAccount:
    // under-13 athletes MUST have a guardian email (they become private + are
    // activated only after emailed guardian consent). 13–17 is an informational note.
    if (isAthlete && age !== null) {
      if (age < GUARDIAN_AGE_THRESHOLD && !guardianEmail) {
        reasons.push(`Under ${GUARDIAN_AGE_THRESHOLD}: a guardian email is required`);
      } else if (age < MINOR_AGE_THRESHOLD) {
        warnings.push(`Minor (age ${age}): parental awareness recommended`);
      }
    }

    const classification: Classification =
      reasons.length > 0 ? 'ERROR'
        : existingEmails.has(email) ? 'EXISTING'
        : 'NEW';

    const report: RowReport = {
      index,
      teamName,
      name,
      email,
      memberRole,
      classification,
      reasons,
      warnings,
    };

    resolved.push({
      report,
      email,
      name,
      memberRole: memberRole ?? TeamMemberRole.PLAYER,
      gender,
      dob,
      position: (raw.position ?? '').trim() || null,
      phone: (raw.phone ?? '').trim() || null,
      guardianEmail,
      age,
    });
  });

  // ── Per-team validation ──────────────────────────────────────────────────
  const teamReports: TeamReport[] = [];
  const byTeam = new Map<string, ResolvedRow[]>();
  for (const r of resolved) {
    if (!r.report.teamName) continue;
    const key = r.report.teamName;
    const list = byTeam.get(key) ?? [];
    list.push(r);
    byTeam.set(key, list);
  }

  for (const [teamName, members] of byTeam) {
    const errors: string[] = [];
    const warns: string[] = [];
    // Only count rows that aren't already individually broken for role/size checks.
    const valid = members.filter((m) => m.report.classification !== 'ERROR');

    const captains = valid.filter((m) => m.memberRole === TeamMemberRole.CAPTAIN);
    const coaches = valid.filter((m) => m.memberRole === TeamMemberRole.COACH);
    const players = valid.filter((m) => m.memberRole !== TeamMemberRole.COACH); // captain + players

    if (captains.length === 0) errors.push('Team has no captain (exactly one required)');
    if (captains.length > 1) errors.push(`Team has ${captains.length} captains (exactly one allowed)`);
    if (coaches.length > 1) errors.push(`Team has ${coaches.length} coaches (at most one allowed)`);

    if (players.length < minRoster) {
      errors.push(`Roster too small: ${players.length} players (minimum ${minRoster})`);
    }
    if (players.length > maxRoster) {
      errors.push(`Roster too large: ${players.length} players (maximum ${maxRoster})`);
    }

    teamReports.push({
      teamName,
      memberCount: members.length,
      playerCount: players.length,
      hasCaptain: captains.length === 1,
      hasCoach: coaches.length === 1,
      errors,
      warnings: warns,
    });
  }

  // ── Aggregate ──────────────────────────────────────────────────────────────
  const blockingErrors: string[] = [];
  for (const r of resolved) {
    if (r.report.classification === 'ERROR') {
      blockingErrors.push(`Row ${r.report.index + 1} (${r.report.email || r.report.name || '?'}): ${r.report.reasons.join('; ')}`);
    }
  }
  for (const t of teamReports) {
    for (const e of t.errors) blockingErrors.push(`Team "${t.teamName}": ${e}`);
  }

  const nonError = resolved.filter((r) => r.report.classification !== 'ERROR');
  const newAccounts = nonError.filter((r) => r.report.classification === 'NEW').length;
  const linkedAccounts = nonError.filter((r) => r.report.classification === 'EXISTING').length;

  const report: PreviewReport = {
    rows: resolved.map((r) => r.report),
    teams: teamReports,
    counts: {
      newAccounts,
      linkedAccounts,
      teams: teamReports.length,
      totalMembers: nonError.length,
    },
    blockingErrors,
    canCommit: blockingErrors.length === 0,
  };

  return { report, resolved };
}

// ─── Side-effecting helpers ─────────────────────────────────────────────────────

/**
 * Generate a strong random temp password that satisfies the app's complexity
 * policy (upper + lower + digit + symbol, ≥ 8 chars). Never logged or returned.
 */
export interface CommitResult {
  accountsCreated: number;
  accountsLinked: number;
  teamsCreated: number;
  membersAdded: number;
  emailsSent: number;
  skips: string[];
}

/**
 * Re-validate server-side and commit. Refuses if any blocking error exists.
 * Idempotent: re-running the same import creates no duplicates (relies on the
 * User.email and TeamMember[teamId,userId] unique constraints plus existing-team
 * lookup). Tournament imports match teams by (tournamentId, name); standalone
 * imports match by (name, captainId) among team-less teams. Team-less profile
 * rows create/link the account only — they join no team.
 */
export async function commitBulkProvision(
  rows: RawRow[],
  ctx: ProvisionContext,
): Promise<CommitResult> {
  // Lazily pull the side-effecting deps (see import note at top of file).
  // Account creation + welcome/consent emails are handled by provisionAthleteAccount.
  const { default: prisma } = await import('../config/db');
  const { default: logger } = await import('../utils/logger');

  // 1. Look up which emails already map to a Prisma user.
  const allEmails = [...new Set(rows.map((r) => normalizeEmail(r.email)).filter(Boolean))];
  const existing = await prisma.user.findMany({
    where: { email: { in: allEmails } },
    select: { id: true, email: true },
  });
  const existingEmails = new Set(existing.map((u) => u.email));

  // 2. Authoritative validation.
  const { report, resolved } = buildReport(rows, ctx, existingEmails);
  if (!report.canCommit) {
    const err = new Error('Bulk provision blocked: ' + report.blockingErrors.join(' | '));
    (err as any).blocking = report.blockingErrors;
    (err as any).status = 422;
    throw err;
  }

  const result: CommitResult = {
    accountsCreated: 0,
    accountsLinked: 0,
    teamsCreated: 0,
    membersAdded: 0,
    emailsSent: 0,
    skips: [],
  };

  // 3. Resolve every unique email to a Prisma user id, creating Firebase + Prisma
  //    accounts for new ones. Done outside the transaction because Firebase Auth
  //    is an external system that cannot participate in a DB transaction; the
  //    work is idempotent (reuses existing accounts by email).
  const emailToUserId = new Map<string, string>();

  // De-dupe rows by email — one account per person even across teams.
  const byEmail = new Map<string, ResolvedRow>();
  for (const r of resolved) {
    if (!byEmail.has(r.email)) byEmail.set(r.email, r);
  }

  // Provision each account through the shared enforced path. It creates the
  // Firebase + Prisma account, applies minor-safety (DOB/guardian/private), and
  // sends the welcome (13+) or guardian-consent (under-13) email itself. Existing
  // accounts are linked, not recreated.
  for (const r of byEmail.values()) {
    const { userId, created, guardianConsentPending } = await provisionAthleteAccount({
      name: r.name,
      email: r.email,
      role: userRoleForMember(r.memberRole),
      sport: ctx.sport,
      dateOfBirth: r.dob,
      gender: r.gender,
      position: r.position,
      phone: r.phone,
      guardianEmail: r.guardianEmail,
    });
    emailToUserId.set(r.email, userId);
    if (created) {
      result.accountsCreated++;
      // One email per new account: welcome (13+) or guardian consent (under-13).
      result.emailsSent++;
      if (guardianConsentPending) {
        result.skips.push(`${r.email}: under-13 — guardian consent email sent; account activates on consent`);
      }
    } else {
      result.accountsLinked++;
    }
  }

  // 4. Group resolved rows by team for the team/member writes. Team-less profile
  //    rows (standalone imports) are skipped here — their account was already
  //    created/linked in step 3; they join no team.
  const byTeam = new Map<string, ResolvedRow[]>();
  for (const r of resolved) {
    if (!r.report.teamName) continue;
    const list = byTeam.get(r.report.teamName) ?? [];
    list.push(r);
    byTeam.set(r.report.teamName, list);
  }

  // 5. Transactional DB writes for teams, the tournament join row, and members.
  await prisma.$transaction(async (tx) => {
    for (const [teamName, members] of byTeam) {
      const captainRow = members.find((m) => m.memberRole === TeamMemberRole.CAPTAIN)!;
      const coachRow = members.find((m) => m.memberRole === TeamMemberRole.COACH);
      const captainId = emailToUserId.get(captainRow.email)!;
      const coachId = coachRow ? emailToUserId.get(coachRow.email)! : null;

      // Reuse an existing team so re-runs don't duplicate. Tournament imports key
      // on (tournamentId, name); standalone imports key on (name, captainId) among
      // team-less teams so two unrelated "Warriors" don't merge into one.
      let team = await tx.team.findFirst({
        where: ctx.tournamentId
          ? { tournamentId: ctx.tournamentId, name: teamName }
          : { tournamentId: null, name: teamName, captainId },
        select: { id: true },
      });
      if (!team) {
        team = await tx.team.create({
          data: {
            name: teamName,
            sport: ctx.sport,
            ...(ctx.tournamentId && { tournamentId: ctx.tournamentId }),
            captainId,
            ...(coachId && { coachId }),
          },
          select: { id: true },
        });
        result.teamsCreated++;
      } else {
        // Keep captain/coach in sync on re-run.
        await tx.team.update({
          where: { id: team.id },
          data: { captainId, coachId: coachId ?? null },
        });
      }

      // Tournament registration join row — only for a tournament import.
      if (ctx.tournamentId) {
        await tx.tournamentTeam.upsert({
          where: { tournamentId_teamId: { tournamentId: ctx.tournamentId, teamId: team.id } },
          create: { tournamentId: ctx.tournamentId, teamId: team.id },
          update: {},
        });
      }

      // Members — ACCEPTED on create. THE CORE BYPASS: no PENDING, no invite,
      // no notification. Skip members already on the team so a second commit
      // neither duplicates nor re-counts (idempotent).
      const now = new Date();
      for (const m of members) {
        const userId = emailToUserId.get(m.email)!;
        const already = await tx.teamMember.findUnique({
          where: { teamId_userId: { teamId: team.id, userId } },
          select: { id: true },
        });
        if (already) continue;
        await tx.teamMember.create({
          data: {
            teamId: team.id,
            userId,
            role: m.memberRole,
            status: 'ACCEPTED',
            respondedAt: now,
          },
        });
        result.membersAdded++;
      }
    }
  });

  // Welcome / guardian-consent emails were already sent by provisionAthleteAccount
  // as each account was created (age-aware: athlete for 13+, guardian for under-13).

  logger.info('bulkProvision.commit', {
    tournamentId: ctx.tournamentId,
    standalone: ctx.tournamentId === null,
    created: result.accountsCreated,
    linked: result.accountsLinked,
    teams: result.teamsCreated,
    members: result.membersAdded,
    emails: result.emailsSent,
  });

  return result;
}
