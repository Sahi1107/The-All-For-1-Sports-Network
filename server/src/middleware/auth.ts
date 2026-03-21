import { Request, Response, NextFunction } from 'express';
import admin from '../config/firebaseAdmin';

export interface AuthRequest extends Request {
  user?: {
    userId: string; // Prisma user UUID (from Firebase custom claim)
    email:  string;
    role:   string;
  };
}

/**
 * Verifies the Firebase ID token from the Authorization header.
 *
 * The token must contain custom claims { userId, role } set by /api/auth/sync.
 * New tokens issued before /sync is called will not have these claims and will
 * receive a 401 prompting the client to complete registration.
 */
export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const token = authHeader.split(' ')[1];

  admin
    .auth()
    .verifyIdToken(token)
    .then((decoded) => {
      const userId = decoded['userId'] as string | undefined;
      const role   = decoded['role']   as string | undefined;

      if (!userId || !role) {
        // Firebase token is valid but custom claims haven't been set yet.
        // This happens if the client calls a protected route before /sync completes.
        res.status(401).json({
          error: 'Account setup incomplete. Call /api/auth/sync first.',
          code: 'CLAIMS_MISSING',
        });
        return;
      }

      req.user = { userId, email: decoded.email ?? '', role };
      next();
    })
    .catch(() => {
      res.status(401).json({ error: 'Invalid or expired token' });
    });
}
