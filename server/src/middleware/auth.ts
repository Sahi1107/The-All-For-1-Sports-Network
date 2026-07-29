import { Request, Response, NextFunction } from 'express';
import admin from '../config/firebaseAdmin';
import prisma from '../config/db';
import { isSessionRevoked } from '../services/account/sessions';

export interface AuthRequest extends Request {
  user?: {
    userId:        string; // Prisma user UUID (from the Firebase `userId` custom claim)
    email:         string;
    role:          string; // LIVE from the DB row — never the token claim (see decideAuth)
    emailVerified: boolean;
    suspended:     boolean;
  };
}

/** The DB fields the auth decision needs — role is the source of truth for authz. */
export interface AuthAccount {
  id:               string;
  role:             string;
  sessionsRevokedAt: Date | null;
  suspended:        boolean;
  suspensionReason: string | null;
  suspendedAt:      Date | null;
}
/** The token facts the auth decision needs. */
export interface AuthClaims {
  userId?:         string;
  email?:          string;
  email_verified?: boolean;
  auth_time?:      number;
}
export type AuthDecision =
  | { ok: true; user: NonNullable<AuthRequest['user']> }
  | { ok: false; status: 401 | 403; error: string; code?: string; reason?: string | null; suspendedAt?: Date | null };

/**
 * Pure authorization decision (no I/O), so it unit-tests directly and there's ONE
 * place the rules live. Key property: `role` comes from the DB `account`, NEVER
 * from the token — so a role change takes effect on the very next request with no
 * re-login. And it FAILS CLOSED: a valid token with no matching DB row is a 401,
 * never a default role.
 */
export function decideAuth(claims: AuthClaims, account: AuthAccount | null, allowSuspended: boolean): AuthDecision {
  // The `userId` claim is the account identifier (immutable) — required to find the
  // row. The `role` claim is intentionally NOT consulted; role is read from the DB.
  if (!claims.userId) {
    return { ok: false, status: 401, code: 'CLAIMS_MISSING', error: 'Account setup incomplete. Call /api/auth/sync first.' };
  }
  if (!account) {
    // Fail closed: a valid token whose account row doesn't exist (deleted, or a
    // dangling userId claim) gets NO role — a distinct, terminal 401. Distinct so
    // it's not confused with the other 401s; terminal (own code) so the client
    // doesn't waste a token-refresh retry that could never conjure a DB row.
    return { ok: false, status: 401, code: 'ACCOUNT_NOT_FOUND', error: 'Account no longer exists' };
  }
  if (isSessionRevoked(claims.auth_time, account.sessionsRevokedAt)) {
    return { ok: false, status: 401, code: 'SESSION_REVOKED', error: 'Session ended. Please sign in again.' };
  }
  if (account.suspended && !allowSuspended) {
    return { ok: false, status: 403, code: 'ACCOUNT_SUSPENDED', error: 'Your account is suspended.', reason: account.suspensionReason, suspendedAt: account.suspendedAt };
  }
  return {
    ok: true,
    user: {
      userId: account.id,
      email: claims.email ?? '',
      role: account.role,                       // ← LIVE DB role, not the token claim
      emailVerified: claims.email_verified ?? false,
      suspended: account.suspended,
    },
  };
}

/**
 * Core: verify the Firebase ID token, load the account (one indexed PK lookup),
 * and apply decideAuth. Role, suspension, and revocation are all read LIVE from
 * that row so authz never lags a stale token. Suspended users can authenticate but
 * are confined to the appeal routes unless the route opts in via allowSuspended.
 */
async function runAuth(req: AuthRequest, res: Response, next: NextFunction, allowSuspended: boolean): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }
  const token = authHeader.split(' ')[1];

  let decoded: admin.auth.DecodedIdToken;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const userId = decoded['userId'] as string | undefined;
  if (!userId) {
    // No account identifier on the token — nothing to look up. Fail closed.
    res.status(401).json({ error: 'Account setup incomplete. Call /api/auth/sync first.', code: 'CLAIMS_MISSING' });
    return;
  }

  try {
    const account = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, sessionsRevokedAt: true, suspended: true, suspensionReason: true, suspendedAt: true },
    });

    const decision = decideAuth(
      { userId, email: decoded.email, email_verified: decoded.email_verified, auth_time: decoded.auth_time },
      account,
      allowSuspended,
    );
    if (!decision.ok) {
      const body: Record<string, unknown> = { error: decision.error };
      if (decision.code) body.code = decision.code;
      if (decision.code === 'ACCOUNT_SUSPENDED') { body.reason = decision.reason ?? null; body.suspendedAt = decision.suspendedAt ?? null; }
      res.status(decision.status).json(body);
      return;
    }
    req.user = decision.user;
  } catch {
    res.status(500).json({ error: 'Auth check failed' });
    return;
  }

  next();
}

/** Standard gate: rejects suspended accounts (403 ACCOUNT_SUSPENDED). */
export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  void runAuth(req, res, next, false);
}

/** For the appeal routes only: authenticated, but a suspended user is allowed
 *  through so they can see what happened and contest it. */
export function authenticateAllowSuspended(req: AuthRequest, res: Response, next: NextFunction): void {
  void runAuth(req, res, next, true);
}
