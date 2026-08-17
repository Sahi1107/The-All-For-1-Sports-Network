import prisma from '../config/db';
import { POLICY_VERSION } from '@af1/core';

// Recording + querying legal-document acceptance. Terms and Privacy are released
// and accepted together, so every acceptance writes a row for both documents at
// the current POLICY_VERSION. Kept append-only and idempotent per (user, document,
// version) so re-running sync or re-acknowledging never duplicates the record.

const DOCUMENTS = ['TERMS', 'PRIVACY'] as const;

export async function recordPolicyAcceptance(opts: {
  userId: string;
  actor: 'SELF' | 'GUARDIAN';
  consentText?: string | null;
  ipAddress?: string | null;
}): Promise<void> {
  const { userId, actor, consentText = null, ipAddress = null } = opts;
  for (const document of DOCUMENTS) {
    const existing = await prisma.policyAcceptance.findFirst({
      where: { userId, document, version: POLICY_VERSION },
      select: { id: true },
    });
    if (existing) continue; // already on record for this version — don't duplicate
    await prisma.policyAcceptance.create({
      data: { userId, document, version: POLICY_VERSION, actor, consentText, ipAddress },
    });
  }
}

/** True once the user has an acceptance on record for the current version of BOTH
 *  documents. Drives the notify-and-acknowledge prompt (false → ask on next login). */
export async function hasAcceptedCurrentPolicy(userId: string): Promise<boolean> {
  const rows = await prisma.policyAcceptance.findMany({
    where: { userId, version: POLICY_VERSION },
    select: { document: true },
    distinct: ['document'],
  });
  return DOCUMENTS.every((d) => rows.some((r) => r.document === d));
}
