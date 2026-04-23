import { Router, Response } from 'express';
import prisma from '../config/db';
import admin from '../config/firebaseAdmin';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { writeLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { AdminUserListQuery, AdminUpdateRoleBody, AdminVerifyBody, CreateAdminBody } from '../validation/admin';
import logger from '../utils/logger';

const router = Router();

// All admin routes require ADMIN role
router.use(authenticate, requireRole('ADMIN'));

// GET /api/admin/users — list all users
router.get('/users', validate({ query: AdminUserListQuery }), async (req: AuthRequest, res: Response) => {
  try {
    const { role, sport, search, page = '1', limit = '50' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};
    if (role) where.role = role;
    if (sport) where.sport = sport;
    if (search) where.name = { contains: search as string, mode: 'insensitive' };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, email: true, name: true, role: true, sport: true,
          avatar: true, verified: true, createdAt: true,
          _count: { select: { highlights: true, followers: true } },
        },
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, total, page: parseInt(page as string), totalPages: Math.ceil(total / parseInt(limit as string)) });
  } catch (error) {
    console.error('Admin get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/users/:id/verify
router.patch('/users/:id/verify', validate({ body: AdminVerifyBody }), async (req: AuthRequest, res: Response) => {
  try {
    const { verified } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data: { verified: verified ?? true },
    });
    res.json({ message: 'User updated', userId: user.id, verified: user.verified });
  } catch (error) {
    console.error('Verify user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/admin/users/:id/role
router.patch('/users/:id/role', validate({ body: AdminUpdateRoleBody }), async (req: AuthRequest, res: Response) => {
  try {
    const { role } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data: { role, ...(role === 'ADMIN' && { sport: null }) },
    });

    // Keep Firebase custom claims in sync so the user's next token has the new role
    if (user.firebaseUid) {
      await admin.auth().setCustomUserClaims(user.firebaseUid, { userId: user.id, role: user.role });
    }

    res.json({ message: 'Role updated', userId: user.id, role: user.role });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req: AuthRequest, res: Response) => {
  try {
    // Prevent an admin from deleting their own account via this endpoint
    if (req.params.id as string === req.user!.userId) {
      res.status(400).json({ error: 'Cannot delete your own account' });
      return;
    }
    await prisma.user.delete({ where: { id: req.params.id as string } });
    res.json({ message: 'User deleted' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/create-admin — create a new admin account
router.post('/create-admin', writeLimiter, validate({ body: CreateAdminBody }), async (req: AuthRequest, res: Response) => {
  try {
    const { email, name, password } = req.body;

    // Check Prisma first to surface a friendly duplicate-email error
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    // 1. Create Firebase Auth user (emailVerified: true — no verification needed)
    const firebaseUser = await admin.auth().createUser({
      email,
      password,
      displayName: name,
      emailVerified: true,
    });

    // 2. Create Prisma user linked to Firebase UID
    const newAdmin = await prisma.user.create({
      data: {
        firebaseUid: firebaseUser.uid,
        email,
        name,
        role:     'ADMIN',
        sport:    'BASKETBALL',
        verified: true,
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    // 3. Set custom claims so the new admin's tokens carry userId + role
    await admin.auth().setCustomUserClaims(firebaseUser.uid, {
      userId: newAdmin.id,
      role:   'ADMIN',
    });

    logger.info('admin.create_admin', { createdId: newAdmin.id, byAdminId: req.user!.userId });
    res.status(201).json({ admin: newAdmin });
  } catch (error: any) {
    if (error?.code === 'auth/email-already-exists') {
      res.status(409).json({ error: 'Email already registered in Firebase' });
      return;
    }
    logger.error('Create admin error', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/stats — platform statistics
router.get('/stats', async (_req: AuthRequest, res: Response) => {
  try {
    const [
      totalUsers, athletes, coaches, scouts, verifiedUsers,
      highlights, teams, tournaments,
      basketball, football, cricket,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'ATHLETE' } }),
      prisma.user.count({ where: { role: 'COACH' } }),
      prisma.user.count({ where: { role: 'SCOUT' } }),
      prisma.user.count({ where: { verified: true } }),
      prisma.highlight.count(),
      prisma.team.count(),
      prisma.tournament.count(),
      prisma.user.count({ where: { sport: 'BASKETBALL' } }),
      prisma.user.count({ where: { sport: 'FOOTBALL' } }),
      prisma.user.count({ where: { sport: 'CRICKET' } }),
    ]);

    res.json({
      stats: {
        totalUsers, athletes, coaches, scouts, verifiedUsers,
        highlights, teams, tournaments,
        bySport: { BASKETBALL: basketball, FOOTBALL: football, CRICKET: cricket },
      },
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
