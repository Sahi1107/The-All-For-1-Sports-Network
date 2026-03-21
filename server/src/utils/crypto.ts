import crypto from 'crypto';

/** Generate a cryptographically secure 32-byte random token (64 hex chars). */
export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** SHA-256 hash a token before storing it in the database. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
