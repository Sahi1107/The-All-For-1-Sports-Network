import { Request, Response, NextFunction } from 'express';
import admin from '../config/firebaseAdmin';
import prisma from '../config/db';
import { isSessionRevoked } from '../services/account/sessions';

export interface AuthRequest extends Request {
  user?: {
    userId:        string; // Prisma user UUID (from Firebase custom claim)
    email:         string;
    role:          string;
    emailVerified: boolean;
    suspended:     boolean;
  };
}

/**
 * Core: verify the Firebase ID token, then enforce the per-account gates a
 * stateless token can't express — one indexed PK lookup funds all of them:
 *   • the account still exists,
 *   • the token wasn't invalidated by "sign out of all devices"
 *     (auth_time predates sessionsRevokedAt → 401 SESSION_REVOKED), and
 *   • the account isn't suspended — unless the route opted in via
 *     `authenticateAllowSuspended` (403 ACCOUNT_SUSPENDED otherwise).
 *
 * Suspended users can still authenticate; they're just confined to the appeal
 * routes so they can contest the suspension without being able to use the app.
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
  const role   = decoded['role']   as string | undefined;
  if (!userId || !role) {
    res.status(401).json({ error: 'Account setup incomplete. Call /api/auth/sync first.', code: 'CLAIMS_MISSING' });
    return;
  }

  try {
    const account = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, sessionsRevokedAt: true, suspended: true, suspensionReason: true, suspendedAt: true },
    });
    if (!account) {
      res.status(401).json({ error: 'Account no longer exists' });
      return;
    }
    if (isSessionRevoked(decoded.auth_time, account.sessionsRevokedAt)) {
      res.status(401).json({ error: 'Session ended. Please sign in again.', code: 'SESSION_REVOKED' });
      return;
    }
    if (account.suspended && !allowSuspended) {
      res.status(403).json({
        error: 'Your account is suspended.',
        code: 'ACCOUNT_SUSPENDED',
        reason: account.suspensionReason ?? null,
        suspendedAt: account.suspendedAt ?? null,
      });
      return;
    }
    req.user = { userId, email: decoded.email ?? '', role, emailVerified: decoded.email_verified ?? false, suspended: account.suspended };
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
