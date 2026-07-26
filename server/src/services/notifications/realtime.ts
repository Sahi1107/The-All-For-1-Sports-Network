import { getIO } from '../../config/socket';

// Best-effort real-time push to a user's socket room. No-ops if Socket.IO isn't
// initialised (e.g. during scripts/tests) — never throws into the notify path.
export function emitToUser(userId: string, event: string, payload: unknown): void {
  try {
    getIO().to(`user:${userId}`).emit(event, payload);
  } catch {
    /* socket not ready — in-app row is already persisted, so nothing is lost */
  }
}
