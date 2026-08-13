import type { Prisma } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// Duplicate detection at account creation. Only `email` is DB-unique, so two
// records with the same NAME or PHONE (different emails) slip through and cause
// the exact roster/account confusion we hit. This flags a likely duplicate so the
// caller can warn (and, for a deliberate create, override). It never hard-blocks —
// same names are legitimate — it surfaces the match so a human decides.
// ─────────────────────────────────────────────────────────────────────────────

/** Normalise a phone to digits so "+91 98…" and "098…" compare equal-ish. */
export function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-10) : null; // last 10 digits (local part)
}

/**
 * Prisma WHERE matching an existing record with the same name (case-insensitive,
 * trimmed) OR the same phone (normalised). Returns null when there's nothing to
 * match on, so the caller can skip the query entirely. `excludeEmail` keeps the
 * about-to-be-created / same-email record out of its own result.
 */
export function duplicateWhere(input: { name?: string | null; phone?: string | null; excludeEmail?: string | null }): Prisma.UserWhereInput | null {
  const or: Prisma.UserWhereInput[] = [];
  const name = input.name?.trim();
  if (name) or.push({ name: { equals: name, mode: 'insensitive' } });

  const phone = normalizePhone(input.phone);
  if (phone) or.push({ phone: { contains: phone } });

  if (or.length === 0) return null;

  const where: Prisma.UserWhereInput = { OR: or };
  if (input.excludeEmail) where.NOT = { email: input.excludeEmail.toLowerCase() };
  return where;
}
