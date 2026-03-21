import dotenv from 'dotenv';
dotenv.config();

function requireEnv(key: string, minLength = 0): string {
  const val = process.env[key];
  if (!val) throw new Error(`[Startup] Missing required environment variable: ${key}`);
  if (val.length < minLength)
    throw new Error(`[Startup] ${key} must be at least ${minLength} characters long`);
  return val;
}

export const env = {
  // ─── Server ─────────────────────────────────────────────────
  NODE_ENV:    (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test',
  PORT:        parseInt(process.env.PORT || '5000', 10),

  /**
   * Number of reverse-proxy hops to trust for X-Forwarded-* headers.
   * Set to 1 if behind one proxy (Nginx / Cloudflare / AWS ALB).
   */
  TRUST_PROXY: parseInt(process.env.TRUST_PROXY || '0', 10),

  // ─── Database ────────────────────────────────────────────────
  DATABASE_URL: requireEnv('DATABASE_URL'),

  // ─── Firebase Admin SDK ──────────────────────────────────────
  // Download from: Firebase Console → Project Settings → Service Accounts → Generate new private key
  // Store the values from the JSON file in these env vars.
  FIREBASE_PROJECT_ID:    requireEnv('FIREBASE_PROJECT_ID'),
  FIREBASE_CLIENT_EMAIL:  requireEnv('FIREBASE_CLIENT_EMAIL'),
  // The private key in the JSON file has literal \n — store as-is; we replace at runtime.
  FIREBASE_PRIVATE_KEY:   requireEnv('FIREBASE_PRIVATE_KEY'),

  // ─── CORS ────────────────────────────────────────────────────
  // Exact origin of the frontend. Must NOT end with a trailing slash.
  // Required in production — must be set to your real domain.
  CLIENT_URL: process.env.NODE_ENV === 'production'
    ? requireEnv('CLIENT_URL')
    : (process.env.CLIENT_URL || 'http://localhost:5173'),

  // ─── Cloudinary ──────────────────────────────────────────────
  CLOUDINARY_CLOUD_NAME: requireEnv('CLOUDINARY_CLOUD_NAME'),
  CLOUDINARY_API_KEY:    requireEnv('CLOUDINARY_API_KEY'),
  CLOUDINARY_API_SECRET: requireEnv('CLOUDINARY_API_SECRET'),

  // ─── Logging ─────────────────────────────────────────────────
  // Accepted values: error | warn | info | http | verbose | debug
  LOG_LEVEL: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
};
