import { Router, type Response } from 'express';
import { authenticate, type AuthRequest } from '../middleware/auth';
import logger from '../utils/logger';
import {
  buildMatchCard, buildTournamentCard, buildCareerCard, buildRankingCard, buildProfileCard,
  listPostableMatches, CardBlockedError, type BuiltCard,
} from '../services/storyCards';
import type { CardFormat } from '../services/storyCards/render';

// Shareable story cards. SELF-ONLY by design: every card is about the
// authenticated athlete, so nobody can mint cards for someone else. The age gate
// (under-13 / guardian-managed → 403; 13-17 → initials + state-only) is enforced
// inside the service, not the client. Mounted under /api so the global noCache
// middleware applies: every render is a fresh read of the persisted stat tables,
// which is what makes corrections and un-publishes show up immediately.

const router = Router();

const fmt = (req: AuthRequest): CardFormat => (req.query.format === 'square' ? 'square' : 'story');

function send(res: Response, card: BuiltCard | null): void {
  if (!card) {
    res.status(404).json({ error: 'No recorded data to build this card from yet' });
    return;
  }
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `attachment; filename="${card.filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(card.buffer);
}

function fail(res: Response, error: unknown): void {
  if (error instanceof CardBlockedError) {
    res.status(403).json({ error: error.message });
    return;
  }
  logger.error('Story card error', { error: String(error) });
  res.status(500).json({ error: 'Failed to build the card' });
}

// GET /api/share-cards/matches — the athlete's own played matches, newest first.
// Feeds the composer's "which match?" picker: an athlete posting a stat card
// chooses from matches they actually played, and every entry here is one the
// renderer can build. Declared before /match/:matchId so it isn't shadowed.
router.get('/matches', authenticate, async (req: AuthRequest, res: Response) => {
  try { res.json({ matches: await listPostableMatches(req.user!.userId) }); }
  catch (e) { fail(res, e); }
});

router.get('/match/:matchId', authenticate, async (req: AuthRequest, res: Response) => {
  try { send(res, await buildMatchCard(req.user!.userId, String(req.params.matchId), fmt(req))); }
  catch (e) { fail(res, e); }
});

router.get('/tournament/:tournamentId', authenticate, async (req: AuthRequest, res: Response) => {
  try { send(res, await buildTournamentCard(req.user!.userId, String(req.params.tournamentId))); }
  catch (e) { fail(res, e); }
});

router.get('/career', authenticate, async (req: AuthRequest, res: Response) => {
  try { send(res, await buildCareerCard(req.user!.userId)); }
  catch (e) { fail(res, e); }
});

router.get('/ranking', authenticate, async (req: AuthRequest, res: Response) => {
  try { send(res, await buildRankingCard(req.user!.userId, fmt(req))); }
  catch (e) { fail(res, e); }
});

router.get('/profile', authenticate, async (req: AuthRequest, res: Response) => {
  try { send(res, await buildProfileCard(req.user!.userId)); }
  catch (e) { fail(res, e); }
});

export default router;
