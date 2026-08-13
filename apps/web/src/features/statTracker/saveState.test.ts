import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reduceSaveState, saveDisplay, shouldWarnBeforeUnload, hasUnsavedEdits, retryDelayMs,
  type SaveState,
} from './saveState.ts';

// The one rule that matters: the operator is NEVER told "Saved" while an edit is
// unpersisted. These pin the honest transitions + labels behind the indicator.

test('an edit or an in-flight save reads as "saving"', () => {
  assert.equal(reduceSaveState('saved', { type: 'edit' }), 'saving');
  assert.equal(reduceSaveState('offline', { type: 'save-start' }), 'saving');
});

test('a successful save is the ONLY path to "saved"', () => {
  assert.equal(reduceSaveState('saving', { type: 'save-ok' }), 'saved');
  // No other event yields 'saved'.
  const events = [
    { type: 'edit' }, { type: 'save-start' }, { type: 'save-fail', online: true }, { type: 'save-fail', online: false },
  ] as const;
  for (const s of ['saved', 'saving', 'error', 'offline'] as SaveState[]) {
    for (const ev of events) assert.notEqual(reduceSaveState(s, ev), 'saved', `${s} + ${ev.type} must not read as saved`);
  }
});

test('a failure is offline when the browser is offline, error otherwise — never "saved"', () => {
  assert.equal(reduceSaveState('saving', { type: 'save-fail', online: false }), 'offline');
  assert.equal(reduceSaveState('saving', { type: 'save-fail', online: true }), 'error');
});

test('labels never claim safety when it is not', () => {
  assert.deepEqual(saveDisplay('saved'), { label: 'Saved', tone: 'ok' });
  assert.equal(saveDisplay('saving').tone, 'busy');
  assert.equal(saveDisplay('offline').tone, 'bad');
  assert.equal(saveDisplay('error').tone, 'bad');
  // Only the 'saved' state may show the positive "Saved" claim (an 'ok' tone).
  // ("Offline — not saved" is honest and allowed — it says the opposite.)
  for (const s of ['saving', 'offline', 'error'] as SaveState[]) {
    assert.notEqual(saveDisplay(s).label, 'Saved', `${s} must not show the positive "Saved" label`);
    assert.notEqual(saveDisplay(s).tone, 'ok', `${s} must not read as an ok/safe tone`);
  }
});

test('unsaved edits ⇔ not in the saved state; warn-before-unload follows it', () => {
  assert.equal(hasUnsavedEdits('saved'), false);
  for (const s of ['saving', 'offline', 'error'] as SaveState[]) assert.equal(hasUnsavedEdits(s), true);
  assert.equal(shouldWarnBeforeUnload(true), true);
  assert.equal(shouldWarnBeforeUnload(false), false);
});

test('retry backoff grows then caps at 15s (keeps trying at a steady cadence)', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(retryDelayMs), [1000, 2000, 4000, 8000, 15000]);
  assert.equal(retryDelayMs(10), 15000);
  assert.equal(retryDelayMs(0), 1000); // guards against attempt 0
});
