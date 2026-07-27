import { Router, Response } from 'express';
import prisma from '../config/db';
import { authenticateAllowSuspended, AuthRequest } from '../middleware/auth';
import { writeLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { AppealSubmitBody } from '../validation/appeal';
import { canSubmitAppeal, type AppealKindT, type AppealStatusT } from '../services/account/appeals';
import logger from '../utils/logger';

const router = Router();

// GET /api/appeals/mine — the user's current suspension status, the moderation
// actions taken against them, and their appeals. Allow-suspended: a suspended
// user (who can authenticate but can't use the app) can still see + contest.
router.get('/mine', authenticateAllowSuspended, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.userId;
    const [me, actions, appeals] = await Promise.all([
      prisma.user.findUnique({ where: { id: uid }, select: { suspended: true, suspendedAt: true, suspensionReason: true } }),
      prisma.moderationAction.findMany({ where: { userId: uid }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.appeal.findMany({ where: { userId: uid }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    res.json({ suspension: me, actions, appeals });
  } catch (e) {
    logger.error('appeals.mine error', { error: String(e) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/appeals — submit an appeal (allow-suspended).
router.post('/', authenticateAllowSuspended, writeLimiter, validate({ body: AppealSubmitBody }), async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.userId;
    const kind = req.body.kind as AppealKindT;
    const actionId: string | undefined = req.body.actionId;
    const message: string = req.body.message;

    let subjectLabel: string | null = null;
    // If they're appealing a specific action, it must be one of THEIR actions.
    if (actionId) {
      const action = await prisma.moderationAction.findFirst({ where: { id: actionId, userId: uid } });
      if (!action) { res.status(404).json({ error: 'Nothing to appeal here' }); return; }
      subjectLabel = action.detail ?? action.reason ?? null;
    }
    // A suspension appeal only makes sense while actually suspended.
    if (kind === 'ACCOUNT_SUSPENSION') {
      const me = await prisma.user.findUnique({ where: { id: uid }, select: { suspended: true, suspensionReason: true } });
      if (!me?.suspended) { res.status(400).json({ error: 'Your account is not suspended' }); return; }
      if (!subjectLabel) subjectLabel = me.suspensionReason ?? null;
    }

    const existing = await prisma.appeal.findMany({ where: { userId: uid }, select: { kind: true, actionId: true, status: true } });
    const gate = canSubmitAppeal(existing as { kind: AppealKindT; actionId: string | null; status: AppealStatusT }[], kind, actionId ?? null);
    if (!gate.ok) { res.status(409).json({ error: gate.error }); return; }

    const appeal = await prisma.appeal.create({
      data: { userId: uid, kind, actionId: actionId ?? null, message, subjectLabel: subjectLabel ?? undefined },
    });
    logger.info('appeal.submitted', { userId: uid, appealId: appeal.id, kind });
    res.status(201).json({ appeal });
  } catch (e) {
    logger.error('appeals.submit error', { error: String(e) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
