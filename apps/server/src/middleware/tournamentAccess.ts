import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import prisma from '../config/db';

// ─── Tournament-scoped access control ────────────────────────────────────────
// The SINGLE server-side gate for tournament management. Allows either a
// platform ADMIN (unscoped) or a user assigned as an organiser for THAT specific
// tournament (TournamentOrganizer row). Assume the UI is bypassed — this is the
// only thing standing between an organiser and another tournament's data.
//
// Organiser status is looked up live on every request (not baked into the auth
// token), so a revoked organiser loses access on their very next call.

/** Pure decision: platform ADMIN (unscoped), else must be an assigned organiser. */
export function authorizeTournament(role: string | undefined, isAssignedOrganizer: boolean): boolean {
  if (role === 'ADMIN') return true;
  return isAssignedOrganizer;
}

export type AccessDecision =
  | { ok: true }
  | { ok: false; status: 401 | 403 | 404; error: string };

/**
 * The full access decision as a pure function (status + reason), so every scoping
 * boundary is unit-testable without a DB. The middleware supplies the two facts it
 * has to look up (the resolved tournament id, and whether this user is an assigned
 * organiser); everything else is deterministic.
 *
 * ADMIN is unscoped. Any other role — including ORGANIZER, which is only an
 * identity label — is allowed ONLY when assigned to THIS tournament. A revoked
 * organiser fails here because the assignment fact is fetched live per request.
 */
export function decideTournamentAccess(input: {
  authenticated: boolean;
  role: string | undefined;
  tournamentId: string | null;
  isAssignedOrganizer: boolean;
}): AccessDecision {
  if (!input.authenticated) return { ok: false, status: 401, error: 'Not authenticated' };
  // Don't leak existence: a missing/unknown tournament is a 404 for everyone.
  if (!input.tournamentId) return { ok: false, status: 404, error: 'Tournament not found' };
  if (input.role === 'ADMIN') return { ok: true };
  if (input.isAssignedOrganizer) return { ok: true };
  return { ok: false, status: 403, error: 'You do not have organiser access to this tournament.' };
}

type Resolver = (req: AuthRequest) => Promise<string | null> | string | null;

/** :id is the tournament id (tournament.routes /:id/…). */
export const fromParamId: Resolver = (req) => (req.params.id as string) || null;
/** :tournamentId path param (tracker /sessions/:tournamentId/…). */
export const fromParamTournamentId: Resolver = (req) => (req.params.tournamentId as string) || null;
/** body.tournamentId (POST /tracker/sessions). */
export const fromBodyTournamentId: Resolver = (req) => (req.body?.tournamentId as string) || null;
/** :matchId is a platform Match id (tournament.routes /matches/:matchId/result). */
export const fromMatchId: Resolver = async (req) => {
  const m = await prisma.match.findUnique({
    where: { id: req.params.matchId as string },
    select: { tournamentId: true },
  });
  return m?.tournamentId ?? null;
};
/** :id is a TrackerMatch id (tracker /matches/:id/…) → session → tournamentId. */
export const fromTrackerMatchId: Resolver = async (req) => {
  const m = await prisma.trackerMatch.findUnique({
    where: { id: req.params.id as string },
    select: { session: { select: { tournamentId: true } } },
  });
  return m?.session?.tournamentId ?? null;
};

/** Gate a tournament-scoped action: ADMIN or the assigned organiser for the
 *  resolved tournament. Attaches the resolved id to req for handlers. */
export function requireTournamentAccess(resolve: Resolver) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    let tournamentId: string | null = null;
    if (req.user) {
      try {
        tournamentId = await resolve(req);
      } catch {
        res.status(400).json({ error: 'Invalid request' });
        return;
      }
    }

    // Only look up the assignment when we actually need it — ADMIN short-circuits,
    // and there's nothing to look up for an unauthenticated / unresolved request.
    const needsLookup = Boolean(req.user) && req.user!.role !== 'ADMIN' && Boolean(tournamentId);
    const isAssignedOrganizer = needsLookup
      ? Boolean(await prisma.tournamentOrganizer.findUnique({
          where: { tournamentId_userId: { tournamentId: tournamentId!, userId: req.user!.userId } },
          select: { id: true },
        }))
      : false;

    const decision = decideTournamentAccess({
      authenticated: Boolean(req.user),
      role: req.user?.role,
      tournamentId,
      isAssignedOrganizer,
    });
    if (!decision.ok) { res.status(decision.status).json({ error: decision.error }); return; }

    (req as AuthRequest & { tournamentId?: string }).tournamentId = tournamentId!;
    next();
  };
}
