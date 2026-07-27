import { z } from 'zod';
import { reqText, optStr, PaginationQuery } from './common';

// ── User-submitted appeal ───────────────────────────────────────────────────
export const AppealSubmitBody = z.object({
  kind:     z.enum(['ACCOUNT_SUSPENSION', 'CONTENT_REMOVAL'], { error: 'Invalid appeal type' }),
  actionId: z.string().uuid('Invalid reference').optional(),
  message:  reqText(2000, 'Appeal', 10), // at least a sentence
});

// ── Admin: suspend / unsuspend a user ───────────────────────────────────────
export const AdminSuspendBody = z.object({
  suspend: z.boolean({ error: 'suspend must be true or false' }),
  reason:  optStr(500, 'Reason'),
});

// ── Admin: resolve an appeal ────────────────────────────────────────────────
export const AdminAppealResolveBody = z.object({
  status:     z.enum(['REVIEWING', 'GRANTED', 'DENIED'], { error: 'Invalid status' }),
  reviewNote: optStr(1000, 'Review note'),
});

export const AdminAppealListQuery = PaginationQuery.extend({
  status: z.enum(['PENDING', 'REVIEWING', 'GRANTED', 'DENIED']).optional(),
});
