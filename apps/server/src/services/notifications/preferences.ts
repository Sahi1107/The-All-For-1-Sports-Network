import prisma from '../../config/db';
import type { NotificationType, DigestFrequency } from '@prisma/client';
import { CATALOG } from './catalog';

export interface EffectivePref { inApp: boolean; email: boolean; digest: DigestFrequency }

/** Code-defined default for a type (used when the user has no override row). */
export function defaultPref(type: NotificationType): EffectivePref {
  const m = CATALOG[type];
  return { inApp: m.defaultInApp, email: m.defaultEmail, digest: m.defaultDigest };
}

/**
 * Pure resolution: effective pref = stored override ?? code default, with
 * account/security (non-configurable) types forced fully on. Exported for tests.
 */
export function effectivePref(type: NotificationType, override: EffectivePref | null): EffectivePref {
  if (!CATALOG[type].configurable) return { inApp: true, email: true, digest: 'INSTANT' };
  return override ?? defaultPref(type);
}

/** Effective preference for one user + type: override ?? default (SYSTEM forced on). */
export async function resolvePreference(userId: string, type: NotificationType): Promise<EffectivePref> {
  try {
    const o = await prisma.notificationPreference.findUnique({ where: { userId_type: { userId, type } } });
    return effectivePref(type, o ? { inApp: o.inApp, email: o.email, digest: o.digest } : null);
  } catch {
    return effectivePref(type, null); // table not migrated yet → defaults
  }
}

/** All effective preferences for a user (settings screen + digest job). */
export async function resolveAllPreferences(userId: string): Promise<Record<NotificationType, EffectivePref>> {
  const overrides = await prisma.notificationPreference.findMany({ where: { userId } }).catch(() => []);
  const byType = new Map(overrides.map((o) => [o.type, o]));
  const out = {} as Record<NotificationType, EffectivePref>;
  for (const type of Object.keys(CATALOG) as NotificationType[]) {
    const o = byType.get(type);
    out[type] = effectivePref(type, o ? { inApp: o.inApp, email: o.email, digest: o.digest } : null);
  }
  return out;
}
