import prisma from '../config/db';
import type { ReportTargetType } from '@prisma/client';

/**
 * Shared report helpers so account-level (USER) and content-level
 * (POST / COMMENT / MESSAGE) reports validate and persist identically.
 *
 * reportedUserId always holds the author of the offending content (or the
 * reported account for USER reports); targetId points at the specific
 * post/comment/message and is null for USER reports.
 */

export interface ReportInput {
  reason: string;
  details: string | null;
}

/** Validate + normalize the request body shared by every report endpoint. */
export function parseReportInput(body: any): ReportInput | { error: string } {
  const reason = String(body?.reason ?? '').trim();
  const details = body?.details ? String(body.details).trim().slice(0, 1000) : null;
  if (!reason || reason.length > 100) {
    return { error: 'Reason is required (max 100 chars)' };
  }
  return { reason, details };
}

export async function createReport(params: {
  reporterId: string;
  reportedUserId: string;
  targetType: ReportTargetType;
  targetId?: string | null;
  reason: string;
  details: string | null;
}) {
  return prisma.report.create({
    data: {
      reporterId: params.reporterId,
      reportedUserId: params.reportedUserId,
      targetType: params.targetType,
      targetId: params.targetId ?? null,
      reason: params.reason,
      details: params.details,
    },
  });
}
