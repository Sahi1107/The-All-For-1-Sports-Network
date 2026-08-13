import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { writeLimiter } from '../middleware/rateLimiter';
import { sendSupportRequest } from '../services/email';
import logger from '../utils/logger';

const router = Router();

export const SUPPORT_CATEGORIES = ['General', 'Account', 'Bug', 'Report or appeal', 'Other'] as const;

const SupportBody = z.object({
  category: z.enum(SUPPORT_CATEGORIES),
  subject:  z.string().trim().min(3, 'Subject is too short').max(150),
  message:  z.string().trim().min(10, 'Please add a little more detail').max(4000),
});

// POST /api/support — authenticated in-app contact/support request. Emails the
// support inbox (reply-to the user) and sends the user a confirmation.
router.post('/', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  const parse = SupportBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parse.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
    });
    return;
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { name: true, email: true },
    });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    await sendSupportRequest({
      fromName:  user.name,
      // Fall back to the token's address: the request is authenticated, so there
      // is always one, even in the edge case of a row with no stored email.
      fromEmail: user.email ?? req.user!.email,
      userId:    req.user!.userId,
      category:  parse.data.category,
      subject:   parse.data.subject,
      message:   parse.data.message,
    });
    logger.info('support.request', { userId: req.user!.userId, category: parse.data.category });
    res.json({ message: 'Support request sent' });
  } catch (error) {
    logger.error('Support request error', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
