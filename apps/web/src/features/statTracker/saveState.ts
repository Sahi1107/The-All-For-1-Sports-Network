// Honest save-state for the live tracker. During a real game on flaky venue wifi,
// an operator must NEVER be told their data is safe when it isn't. These are the
// pure decisions behind the indicator + retry loop, kept framework-free so they
// unit-test directly.

export type SaveState = 'saved' | 'saving' | 'error' | 'offline';

export type SaveEvent =
  | { type: 'edit' }                       // an edit was made — persist is now owed
  | { type: 'save-start' }                 // a flush is in flight
  | { type: 'save-ok' }                    // flush succeeded
  | { type: 'save-fail'; online: boolean };// flush threw

/**
 * Next honest state. An edit or an in-flight flush reads as 'saving' (we're
 * committed to persisting it). A failure reads as 'offline' when the browser has
 * no connectivity (recoverable when it returns) or 'error' otherwise.
 */
export function reduceSaveState(_prev: SaveState, ev: SaveEvent): SaveState {
  switch (ev.type) {
    case 'edit':
    case 'save-start':
      return 'saving';
    case 'save-ok':
      return 'saved';
    case 'save-fail':
      return ev.online ? 'error' : 'offline';
  }
}

export interface SaveDisplay { label: string; tone: 'ok' | 'busy' | 'bad' }

/** Human-facing label + tone. Never says "Saved" unless edits are truly persisted. */
export function saveDisplay(state: SaveState): SaveDisplay {
  switch (state) {
    case 'saving':  return { label: 'Saving…', tone: 'busy' };
    case 'saved':   return { label: 'Saved', tone: 'ok' };
    case 'offline': return { label: 'Offline — not saved', tone: 'bad' };
    case 'error':   return { label: 'Save failed — retrying', tone: 'bad' };
  }
}

/** Only warn before leaving when edits are genuinely not yet persisted. */
export function shouldWarnBeforeUnload(hasUnsaved: boolean): boolean {
  return hasUnsaved;
}

/** There ARE unsaved edits whenever the last persist didn't succeed. */
export function hasUnsavedEdits(state: SaveState): boolean {
  return state !== 'saved';
}

/** Exponential backoff (ms) for the failure-retry loop, capped so it keeps trying
 *  at a steady cadence rather than drifting to minutes-long gaps mid-game. */
export function retryDelayMs(attempt: number): number {
  const a = Math.max(1, attempt);
  return Math.min(1000 * 2 ** (a - 1), 15_000); // 1s, 2s, 4s, 8s, 15s cap
}
