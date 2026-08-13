import prisma from '../../config/db';
import logger from '../../utils/logger';
import type { NotificationType, DigestFrequency } from '@prisma/client';
import { CATALOG, type NotifCtx } from './catalog';
import { resolvePreference } from './preferences';
import { blockedUserIds } from '../blocks';
import { deliverInApp } from './channels/inApp';
import { deliverEmail } from './channels/email';
import { deliverPush } from './channels/push';

export interface NotifyInput {
  recipientId: string;
  type: NotificationType;
  actorId?: string;        // who caused it (self-check, block-check, avatar, collapse)
  ctx?: NotifCtx;          // data the catalog renders copy from
  referenceId?: string;    // deep-link entity id
  link?: string;           // precomputed client route, e.g. `/profile/abc`
  groupKey?: string;       // override the default collapse key
  /** Copy overrides for a sub-variant the catalog doesn't cover (e.g. comment
   *  reply). When set, in-app uses these verbatim and does not collapse. */
  title?: string;
  message?: string;
  /** Force the email channel off for this one call (sub-variant that shouldn't email). */
  suppressEmail?: boolean;
  /** Caller has already verified visibility (e.g. it's the recipient's own team). */
  skipBlockCheck?: boolean;
}

// Quiet hours are interpreted in IST (primary market). Per-user timezones are a
// follow-up; until then this is the sensible default. Quiet hours DEFER email
// (the digest job flushes them afterwards); they don't drop it.
function currentHourIST(): number {
  const s = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(new Date());
  return parseInt(s, 10) % 24;
}
export function inQuietHours(start: number | null, end: number | null, hour = currentHourIST()): boolean {
  if (start == null || end == null) return false;
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
}

/**
 * Pure decision: should this notification email be sent right now? (INSTANT only;
 * suppressed by pref off, pause, quiet hours, explicit suppress, or a collapse
 * that already emailed — so 12 likes ⇒ 1 email). Digest DAILY/WEEKLY defer to
 * the cron. Exported for unit tests.
 */
export function shouldEmailNow(o: {
  emailPref: boolean; digest: DigestFrequency; paused: boolean; quiet: boolean;
  suppressEmail: boolean; created: boolean; alreadyEmailed: boolean; hasEmail: boolean;
}): boolean {
  return o.emailPref && o.digest === 'INSTANT' && !o.paused && !o.quiet && !o.suppressEmail
    && o.created && !o.alreadyEmailed && o.hasEmail;
}

/** Fan a triggered event out to every enabled channel. Never throws into the caller. */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    await dispatch(input);
  } catch (e) {
    logger.error('notify.failed', { type: input.type, recipientId: input.recipientId, error: String(e) });
  }
}

async function dispatch(input: NotifyInput): Promise<void> {
  const meta = CATALOG[input.type];

  // 1 · never notify someone about their own action
  if (input.actorId && input.actorId === input.recipientId) return;

  // 2 · recipient must exist
  const recipient = await prisma.user.findUnique({
    where: { id: input.recipientId },
    select: {
      id: true, email: true, name: true,
      notificationsPaused: true, notifyQuietStart: true, notifyQuietEnd: true,
      notificationUnsubToken: true,
    },
  });
  if (!recipient) return;

  // 3 · mutual block → suppress entirely
  if (input.actorId && !input.skipBlockCheck) {
    const blocked = await blockedUserIds(input.recipientId);
    if (blocked.includes(input.actorId)) return;
  }

  // 4 · effective preferences (override ?? catalog default; SYSTEM forced on)
  const pref = await resolvePreference(input.recipientId, input.type);
  // Global pause suppresses external interruptions (email/push) but NOT in-app
  // history — so the centre stays complete. SYSTEM (non-configurable) ignores pause.
  const paused = recipient.notificationsPaused && meta.configurable;
  const quiet = inQuietHours(recipient.notifyQuietStart, recipient.notifyQuietEnd);

  const ctx = input.ctx ?? {};
  const groupKey = input.groupKey ?? (meta.collapsible ? `${input.type}:${input.referenceId ?? 'all'}` : null);

  // 5 · IN-APP channel
  let created = true;
  let alreadyEmailed = false;
  let notifId: string | null = null;
  if (pref.inApp) {
    const override = input.title && input.message ? { title: input.title, message: input.message } : null;
    const r = await deliverInApp({
      recipientId: input.recipientId, type: input.type, actorId: input.actorId ?? null,
      referenceId: input.referenceId ?? null, link: input.link ?? null,
      groupKey: override ? null : groupKey, ctx, override,
      collapsible: meta.collapsible && !override, collapseWindowMins: meta.collapseWindowMins,
    });
    notifId = r.id; created = r.created; alreadyEmailed = r.alreadyEmailed;
  }

  // 6 · EMAIL channel — INSTANT only here; DAILY/WEEKLY handled by the digest job.
  //     Skipped by: email pref off, global pause, quiet hours (deferred to job),
  //     or a collapse that already emailed (so 12 likes ⇒ 1 email).
  const emailNow = shouldEmailNow({
    emailPref: pref.email, digest: pref.digest, paused, quiet,
    suppressEmail: !!input.suppressEmail, created, alreadyEmailed, hasEmail: !!recipient.email,
  });
  // `shouldEmailNow` already gates on hasEmail; re-checking here also narrows the
  // nullable column to the non-null address deliverEmail requires. An unclaimed
  // (organiser-created) profile has no email, so it silently gets in-app only.
  if (emailNow && recipient.email) {
    await deliverEmail({
      recipient: { ...recipient, email: recipient.email },
      type: input.type, ctx, link: input.link ?? null, notifId,
    });
  }

  // 7 · PUSH channel — mirrors the instant, in-app-enabled notifications (the
  //     "get me back to the app" signal). Same pause + quiet-hours gates. Sent
  //     fire-and-forget (never delays the trigger); no-ops without VAPID/subs.
  if (pref.inApp && pref.digest === 'INSTANT' && !paused && !quiet && !input.suppressEmail) {
    void deliverPush({ recipientId: input.recipientId, type: input.type, ctx, link: input.link ?? null }).catch(() => {});
  }
}
