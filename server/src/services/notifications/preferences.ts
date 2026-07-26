import prisma from '../../config/db';
import type { NotificationType, DigestFrequency } from '@prisma/client';
import { CATALOG } from './catalog';

export interface EffectivePref { inApp: boolean; email: boolean; digest: DigestFrequency }

/** Code-defined default for a type (used when the user has no override row). */
export function defaultPref(type: NotificationType): EffectivePref {
  const m = CATALOG[type];
  return { inApp: m.defaultInApp, email: m.defaultEmail, digest: m.defaultDigest };
}

/** Force account/security notices on regardless of any stored override. */
function applyMandatory(type: NotificationType, p: EffectivePref): EffectivePref {
  return CATALOG[type].configurable ? p : { inApp: true, email: true, digest: 'INSTANT' };
}

/** Effective preference for one user + type: override ?? default (SYSTEM forced on). */
export async function resolvePreference(userId: string, type: NotificationType): Promise<EffectivePref> {
  const base = defaultPref(type);
  try {
    const o = await prisma.notificationPreference.findUnique({ where: { userId_type: { userId, type } } });
    return applyMandatory(type, o ? { inApp: o.inApp, email: o.email, digest: o.digest } : base);
  } catch {
    return applyMandatory(type, base); // table not migrated yet → defaults
  }
}

/** All effective preferences for a user (settings screen + digest job). */
export async function resolveAllPreferences(userId: string): Promise<Record<NotificationType, EffectivePref>> {
  const overrides = await prisma.notificationPreference.findMany({ where: { userId } }).catch(() => []);
  const byType = new Map(overrides.map((o) => [o.type, o]));
  const out = {} as Record<NotificationType, EffectivePref>;
  for (const type of Object.keys(CATALOG) as NotificationType[]) {
    const o = byType.get(type);
    out[type] = applyMandatory(type, o ? { inApp: o.inApp, email: o.email, digest: o.digest } : defaultPref(type));
  }
  return out;
}
