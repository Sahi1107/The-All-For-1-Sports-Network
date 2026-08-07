import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { helmetMiddleware, httpsRedirect, noCache } from './middleware/security';
import { httpLogger, errorHandler } from './middleware/httpLogger';
import { globalApiLimiter } from './middleware/rateLimiter';
import { attachRequestId, blockBots, paginationGuard } from './middleware/botProtection';
import { signMediaResponse } from './middleware/signMediaResponse';
import authRoutes         from './routes/auth.routes';
import userRoutes         from './routes/user.routes';
import connectionRoutes   from './routes/connection.routes';
import highlightRoutes    from './routes/highlight.routes';
import feedRoutes         from './routes/feed.routes';
import teamRoutes         from './routes/team.routes';
import tournamentRoutes   from './routes/tournament.routes';
import rankingRoutes      from './routes/ranking.routes';
import announcementRoutes from './routes/announcement.routes';
import notificationRoutes from './routes/notification.routes';
import messageRoutes      from './routes/message.routes';
import adminRoutes        from './routes/admin.routes';
import postRoutes         from './routes/post.routes';
import radarRoutes        from './routes/radar.routes';
import statsRoutes        from './routes/stats.routes';
import trackerRoutes      from './routes/tracker.routes';
import endorsementRoutes  from './routes/endorsement.routes';
import supportRoutes      from './routes/support.routes';
import inviteRoutes       from './routes/invite.routes';
import pushRoutes         from './routes/push.routes';
import ogRoutes           from './routes/og.routes';
import shareRoutes        from './routes/share.routes';
import searchRoutes       from './routes/search.routes';
import appealRoutes       from './routes/appeal.routes';
import newsRoutes         from './routes/news.routes';

const app = express();

// ─── Trust proxy ──────────────────────────────────────────────
// Tell Express to trust one proxy hop (Nginx / Cloudflare / AWS ALB).
// This makes req.ip reflect the real client IP from X-Forwarded-For,
// and enables the HTTPS redirect to read X-Forwarded-Proto correctly.
app.set('trust proxy', env.TRUST_PROXY);

// ─── Security headers ─────────────────────────────────────────
app.use(helmetMiddleware);
app.use(httpsRedirect);

// ─── Request logging ──────────────────────────────────────────
app.use(httpLogger);

// ─── CORS ─────────────────────────────────────────────────────
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));

// ─── Body parsers ─────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─── Abuse protection ─────────────────────────────────────────
// Applied to all /api routes before any authentication or business logic.
// Order matters: attach IDs first (for log correlation), then block bots,
// then enforce the global rate cap, then validate pagination params.
app.use('/api', attachRequestId);
app.use('/api', blockBots);
app.use('/api', globalApiLimiter);
app.use('/api', paginationGuard);

// ─── Prevent caching of all API responses ────────────────────
app.use('/api', noCache);

// ─── Sign media URLs in every JSON response ──────────────────
// Wraps res.json to walk the response body and replace any GCS object key
// or legacy Cloudinary URL with a short-lived signed URL.
app.use('/api', signMediaResponse);

// ─── Health check (unauthenticated) ──────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Version / build info (unauthenticated) ──────────────────
// Answers "what is actually deployed here?" in one request. `sha` is the git
// commit baked into the image at build time (server/Dockerfile ARG GIT_SHA,
// which the Cloud Build trigger passes as $COMMIT_SHA). `revision` is the Cloud
// Run revision — it changes on every deploy even before the SHA is wired, so
// this endpoint distinguishes deploys immediately.
const STARTED_AT = new Date().toISOString();
app.get('/api/version', (_req, res) => {
  res.json({
    sha: process.env.BUILD_SHA || process.env.COMMIT_SHA || process.env.GIT_SHA || null,
    revision: process.env.K_REVISION || null,
    service: process.env.K_SERVICE || null,
    startedAt: STARTED_AT,
    node: process.version,
    env: process.env.NODE_ENV || 'development',
  });
});

// ─── Routes ───────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/search',        searchRoutes);
app.use('/api/appeals',       appealRoutes);
app.use('/api/connections',   connectionRoutes);
app.use('/api/highlights',    highlightRoutes);
app.use('/api/posts',         postRoutes);
app.use('/api/feed',          feedRoutes);
app.use('/api/teams',         teamRoutes);
app.use('/api/tournaments',   tournamentRoutes);
app.use('/api/rankings',      rankingRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/messages',      messageRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/radar',         radarRoutes);
app.use('/api/stats',         statsRoutes);
app.use('/api/tracker',       trackerRoutes);
app.use('/api/endorsements',  endorsementRoutes);
app.use('/api/support',       supportRoutes);
app.use('/api/invite',        inviteRoutes);
app.use('/api/push',          pushRoutes);
app.use('/api/news',          newsRoutes);

// ─── Public share surface (top-level, outside /api so images stay cacheable) ──
// Reached via Firebase Hosting run: rewrites (/og/**, /s/**). Serves OG card
// PNGs and crawler-friendly share pages.
app.use('/og', ogRoutes);
app.use('/s',  shareRoutes);

// ─── 404 handler ─────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Global error handler ─────────────────────────────────────
// Must be last — Express identifies error handlers by their 4-argument signature.
app.use(errorHandler);

export default app;
