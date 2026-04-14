import http from 'http';
import { Server } from 'socket.io';
import app from './app';
import { env } from './config/env';
import { initIO } from './config/socket';
import logger from './utils/logger';
import { getAuth } from 'firebase-admin/auth';
import prisma from './config/db';

// ─── Crash handlers ───────────────────────────────────────────
// Log unhandled errors before the process exits so they appear in the
// audit trail, not silently disappear.

process.on('uncaughtException', (err: Error) => {
  logger.error('Uncaught exception — shutting down', {
    message: err.message,
    stack:   err.stack,
  });
  // Allow logger to flush before exit
  setTimeout(() => process.exit(1), 500);
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack:  reason instanceof Error ? reason.stack : undefined,
  });
});

// ─── HTTP + Socket.IO server ──────────────────────────────────

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: env.CLIENT_URL,
    methods: ['GET', 'POST'],
  },
});

initIO(io);

// ─── Presence helpers ─────────────────────────────────────────

async function updatePresence(userId: string) {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { lastActiveAt: new Date() },
    });
  } catch {
    // Non-critical — log but don't crash
    logger.debug('Failed to update presence', { userId });
  }
}

// ─── Socket.IO connection handler ─────────────────────────────

io.on('connection', async (socket) => {
  logger.debug('Socket connected', { socketId: socket.id });

  // Authenticate socket: extract userId from Firebase token
  let userId: string | null = null;
  const token = socket.handshake.auth?.token;
  if (token) {
    try {
      const decoded = await getAuth().verifyIdToken(token);
      userId = decoded.userId as string || null;
      if (userId) {
        socket.join(`user:${userId}`);
        // Update presence on connect
        await updatePresence(userId);
        // Notify others this user is online
        socket.broadcast.emit('user_online', { userId });
      }
    } catch {
      logger.debug('Socket auth failed', { socketId: socket.id });
    }
  }

  socket.on('join', (joinUserId: string) => {
    socket.join(`user:${joinUserId}`);
    if (!userId) userId = joinUserId;
  });

  socket.on('join_conversation', (conversationId: string) => {
    socket.join(`conversation:${conversationId}`);
  });

  socket.on('leave_conversation', (conversationId: string) => {
    socket.leave(`conversation:${conversationId}`);
  });

  // Heartbeat for presence — client sends this every 30s
  socket.on('heartbeat', async () => {
    if (userId) await updatePresence(userId);
  });

  socket.on('disconnect', async () => {
    logger.debug('Socket disconnected', { socketId: socket.id });
    if (userId) {
      await updatePresence(userId);
      socket.broadcast.emit('user_offline', { userId });
    }
  });
});

// ─── Start ───────────────────────────────────────────────────

server.listen(env.PORT, () => {
  logger.info('Server started', {
    port:    env.PORT,
    env:     env.NODE_ENV,
    pid:     process.pid,
  });
});

// ─── Graceful shutdown ───────────────────────────────────────

function shutdown(signal: string) {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force-exit if graceful shutdown takes too long
  setTimeout(() => {
    logger.error('Forceful shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

