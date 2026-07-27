import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { writeLimiter } from '../middleware/rateLimiter';
import { signMediaDeep } from '../services/storage';
import { env } from '../config/env';
import type { InviteKind } from '@prisma/client';

const router = Router();
const clientOrigin = Array.isArray(env.CLIENT_URL) ? env.CLIENT_URL[0] : env.CLIENT_URL;

const KINDS: InviteKind[] = ['GENERAL', 'TEAMMATE', 'COACH', 'ATHLETE', 'TOURNAMENT'];
const shortCode = () => randomBytes(9).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 9) || randomBytes(6).toString('hex');
const joinUrl = (code: string) => `${clientOrigin}/join/${code}`;

// GET /api/invite/link — my personal, reusable invite link (created on first use).
router.get('/link', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.userId;
    let user = await prisma.user.findUnique({ where: { id: uid }, select: { referralCode: true } });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    if (!user.referralCode) {
      for (let i = 0; i < 6; i++) {
        try { user = await prisma.user.update({ where: { id: uid }, data: { referralCode: shortCode() }, select: { referralCode: true } }); break; }
        catch { /* unique clash — retry */ }
      }
    }
    res.json({ code: user.referralCode, url: joinUrl(user.referralCode!) });
  } catch (e) { console.error('invite.link', e); res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/invite — create a contextual invite (teammate/coach/athlete/tournament).
router.post('/', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.userId;
    const { kind, teamId, tournamentId, note } = req.body ?? {};
    const k: InviteKind = KINDS.includes(kind) ? kind : 'GENERAL';
    const invite = await prisma.invite.create({
      data: {
        code: shortCode(), inviterId: uid, kind: k,
        teamId: typeof teamId === 'string' ? teamId : null,
        tournamentId: typeof tournamentId === 'string' ? tournamentId : null,
        note: typeof note === 'string' && note.trim() ? note.trim().slice(0, 300) : null,
      },
    });
    res.status(201).json({ code: invite.code, url: joinUrl(invite.code), kind: k });
  } catch (e) { console.error('invite.create', e); res.status(500).json({ error: 'Internal server error' }); }
});

// GET /api/invite/resolve/:code — public: who invited + what you're joining.
router.get('/resolve/:code', async (req: Request, res: Response) => {
  try {
    const code = req.params.code as string;
    const invite = await prisma.invite.findUnique({
      where: { code },
      include: { inviter: { select: { id: true, name: true, avatar: true, role: true, sport: true } } },
    });
    if (invite) {
      const [team, tournament] = await Promise.all([
        invite.teamId ? prisma.team.findUnique({ where: { id: invite.teamId }, select: { name: true, sport: true } }) : null,
        invite.tournamentId ? prisma.tournament.findUnique({ where: { id: invite.tournamentId }, select: { name: true } }) : null,
      ]);
      await signMediaDeep(invite.inviter);
      res.json({ inviter: invite.inviter, kind: invite.kind, team, tournament, note: invite.note });
      return;
    }
    const user = await prisma.user.findUnique({ where: { referralCode: code }, select: { id: true, name: true, avatar: true, role: true, sport: true } });
    if (user) { await signMediaDeep(user); res.json({ inviter: user, kind: 'GENERAL', team: null, tournament: null, note: null }); return; }
    res.status(404).json({ error: 'This invite link is no longer valid.' });
  } catch (e) { console.error('invite.resolve', e); res.status(500).json({ error: 'Internal server error' }); }
});

export default router;
