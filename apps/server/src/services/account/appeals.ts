// ─────────────────────────────────────────────────────────────────────────────
// Appeal logic — pure decisions used by the appeal + admin routes, so they're
// unit-tested without a DB.
// ─────────────────────────────────────────────────────────────────────────────

export type AppealKindT = 'ACCOUNT_SUSPENSION' | 'CONTENT_REMOVAL';
export type AppealStatusT = 'PENDING' | 'REVIEWING' | 'GRANTED' | 'DENIED';

const OPEN_STATES: AppealStatusT[] = ['PENDING', 'REVIEWING'];

/** An appeal is still "open" (awaiting/under review) — not yet resolved. */
export function isOpenAppeal(status: AppealStatusT): boolean {
  return OPEN_STATES.includes(status);
}

/**
 * A user may keep only ONE open appeal per subject: same kind and same action
 * (or same kind with no action, for a generic suspension appeal). Prevents
 * spamming moderators with duplicate appeals for the same decision.
 */
export function canSubmitAppeal(
  existing: { kind: AppealKindT; actionId: string | null; status: AppealStatusT }[],
  kind: AppealKindT,
  actionId: string | null,
): { ok: true } | { ok: false; error: string } {
  const dup = existing.find(
    (a) => isOpenAppeal(a.status) && a.kind === kind && (a.actionId ?? null) === (actionId ?? null),
  );
  if (dup) return { ok: false, error: 'You already have an appeal under review for this' };
  return { ok: true };
}

/** Only GRANTED / DENIED are valid admin resolutions (PENDING/REVIEWING are in-flight). */
export function isResolution(status: string): status is 'GRANTED' | 'DENIED' {
  return status === 'GRANTED' || status === 'DENIED';
}

/**
 * What granting an appeal should DO to the underlying action. A granted
 * suspension appeal lifts the suspension; a granted content-removal appeal
 * can't un-delete the content, so it's acknowledged only (no side effect).
 */
export function grantEffect(kind: AppealKindT): { unsuspend: boolean } {
  return { unsuspend: kind === 'ACCOUNT_SUSPENSION' };
}
