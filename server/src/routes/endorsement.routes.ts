import { Router, Response } from 'express';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { browseLimiter, writeLimiter } from '../middleware/rateLimiter';
import { signMediaDeepAll } from '../services/storage';

const router = Router();

// GET /api/endorsements/user/:userId — list endorsements an athlete has received
router.get('/user/:userId', authenticate, browseLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const endorsements = await prisma.endorsement.findMany({
      where: { athleteId: req.params.userId as string },
      orderBy: { createdAt: 'desc' },
      include: {
        coach: { select: { id: true, name: true, avatar: true, role: true, sport: true, position: true } },
      },
    });
    await signMediaDeepAll(endorsements.map((e) => e.coach));
    // Tell the client whether the current (coach) user has already endorsed this athlete
    const mine = endorsements.find((e) => e.coachId === req.user!.userId) ?? null;
    res.json({ endorsements, myEndorsement: mine });
  } catch (error) {
    console.error('Get endorsements error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/endorsements/:athleteId — coach endorses an athlete
router.post('/:athleteId', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const athleteId = req.params.athleteId as string;
    const coachId = req.user!.userId;

    if (athleteId === coachId) {
      res.status(400).json({ error: 'You cannot endorse yourself' });
      return;
    }

    const message = String(req.body.message ?? '').trim();
    if (!message) {
      res.status(400).json({ error: 'An endorsement message is required' });
      return;
    }
    if (message.length > 500) {
      res.status(400).json({ error: 'Endorsement must be 500 characters or fewer' });
      return;
    }

    const [coach, athlete] = await Promise.all([
      prisma.user.findUnique({ where: { id: coachId }, select: { role: true, name: true, sport: true } }),
      prisma.user.findUnique({ where: { id: athleteId }, select: { role: true, sport: true } }),
    ]);

    if (!coach || coach.role !== 'COACH') {
      res.status(403).json({ error: 'Only coaches can endorse athletes' });
      return;
    }
    if (!athlete) {
      res.status(404).json({ error: 'Athlete not found' });
      return;
    }
    if (athlete.role !== 'ATHLETE') {
      res.status(400).json({ error: 'Only athletes can be endorsed' });
      return;
    }
    // A coach may only endorse athletes in their own sport.
    if (!coach.sport || coach.sport !== athlete.sport) {
      res.status(403).json({ error: 'You can only endorse athletes in your sport' });
      return;
    }

    const endorsement = await prisma.endorsement.create({
      data: { coachId, athleteId, message },
      include: {
        coach: { select: { id: true, name: true, avatar: true, role: true, sport: true, position: true } },
      },
    });

    await prisma.notification.create({
      data: {
        userId: athleteId,
        type: 'ENDORSEMENT',
        title: 'New Endorsement',
        message: `${coach.name ?? 'A coach'} endorsed you`,
        referenceId: coachId,
      },
    });

    res.status(201).json({ endorsement });
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(409).json({ error: 'You have already endorsed this athlete' });
      return;
    }
    console.error('Create endorsement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/endorsements/:id — coach removes their own endorsement
router.delete('/:id', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const endorsement = await prisma.endorsement.findUnique({ where: { id: req.params.id as string } });
    if (!endorsement || endorsement.coachId !== req.user!.userId) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }
    await prisma.endorsement.delete({ where: { id: req.params.id as string } });
    res.json({ message: 'Endorsement removed' });
  } catch (error) {
    console.error('Delete endorsement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
