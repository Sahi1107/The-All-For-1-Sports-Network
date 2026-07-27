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
  // Comma-separated list of allowed origins (web + Capacitor mobile).
  // e.g. CLIENT_URL="http://localhost:5173,capacitor://localhost,http://localhost"
  CLIENT_URL: (() => {
    const raw = process.env.NODE_ENV === 'production'
      ? requireEnv('CLIENT_URL')
      : (process.env.CLIENT_URL || 'http://localhost:5173,capacitor://localhost,http://localhost');
    const origins = raw.split(',').map((s) => s.trim()).filter(Boolean);
    return origins.length === 1 ? origins[0] : origins;
  })() as string | string[],

  // ─── Anthropic ───────────────────────────────────────────────
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',

  // ─── Cloudinary (legacy — no longer used for uploads/reads) ──
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
  CLOUDINARY_API_KEY:    process.env.CLOUDINARY_API_KEY || '',
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',

  // ─── Google Cloud Storage ────────────────────────────────────
  // GCS_BUCKET is optional during the migration; once set, the storage
  // service writes new uploads to GCS and serves signed URLs for reads.
  GCP_PROJECT_ID: process.env.GCP_PROJECT_ID || '',
  GCS_BUCKET:     process.env.GCS_BUCKET || '',

  // ─── SMTP (transactional email — e.g. guardian consent form) ──
  // All optional: when unset, the email service logs the message instead of
  // sending, so local/dev startup never breaks.
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || 'All For 1 <no-reply@allfor1.network>',

  // Inbox that receives in-app support/contact requests.
  SUPPORT_EMAIL: process.env.SUPPORT_EMAIL || 'info@allfor1.pro',

  // ─── Sentry (error monitoring — optional) ────────────────────
  // When SENTRY_DSN is unset, Sentry stays disabled and all capture calls
  // no-op, so local/dev startup is unaffected.
  SENTRY_DSN: process.env.SENTRY_DSN || '',
  SENTRY_TRACES_SAMPLE_RATE: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),

  // Shared secret Cloud Scheduler sends (header x-cron-secret) to run digest jobs.
  // When unset, the cron endpoint is disabled (returns 403).
  CRON_SECRET: process.env.CRON_SECRET || '',

  // ─── Web push (VAPID) — optional ─────────────────────────────
  // Generate once with `npx web-push generate-vapid-keys`. When unset, push is
  // disabled (subscribe endpoints 503, deliverPush no-ops). Public key is also
  // exposed to the client as VITE_VAPID_PUBLIC_KEY.
  VAPID_PUBLIC_KEY:  process.env.VAPID_PUBLIC_KEY || '',
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || '',
  VAPID_SUBJECT:     process.env.VAPID_SUBJECT || 'mailto:info@allfor1.pro',

  // ─── Logging ─────────────────────────────────────────────────
  // Accepted values: error | warn | info | http | verbose | debug
  LOG_LEVEL: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
};
