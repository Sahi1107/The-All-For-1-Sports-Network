import { useState } from 'react';
import type { BasketballRules } from '@af1/core';
import type { RosterTeam } from '../types';
import type { JerseyEdit } from '../useTrackerMatch';

/** One team's column of number inputs. Declared at module scope on purpose — a
 *  component defined inside JerseyModal would be a new type every render, so
 *  React would remount these inputs and the field would lose focus after each
 *  keystroke. */
function JerseyCol({ team, draft, clashing, setNum }: {
  team: RosterTeam; draft: Record<string, string>; clashing: Set<string>;
  setNum: (userId: string, raw: string) => void;
}) {
  return (
    <div className="card" style={{ minHeight: 0 }}>
      <strong>{team.name}</strong>
      <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
        {team.players.map((p) => (
          <label key={p.userId} className="jersey-row">
            <input
              className={`jersey-input${clashing.has(p.userId) ? ' bad' : ''}`}
              value={draft[p.userId] ?? ''}
              onChange={(e) => setNum(p.userId, e.target.value)}
              inputMode="numeric" maxLength={2} placeholder="–"
              aria-label={`Jersey number for ${p.name}`}
              aria-invalid={clashing.has(p.userId)}
            />
            <span className="jersey-name">{p.name}</span>
            <span style={{ color: '#9ca3af', fontSize: 12 }}>{p.position ?? '—'}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** Pre-match jersey check. Prefilled from the saved roster, so the common case
 *  is a glance and Save; a first run is data entry. Numbers persist on the
 *  session roster, not the match, so they carry to every later fixture.
 *
 *  This runs BEFORE the starting five for a reason: the number is how an analyst
 *  picks a player out on court, and the new layout's rails are keyed by it. */
export function JerseyModal({ persist, homeTeam, awayTeam, onSaved, onClose }: {
  persist: (numbers: JerseyEdit[]) => Promise<RosterTeam[]>;
  homeTeam: RosterTeam; awayTeam: RosterTeam;
  onSaved: () => void; onClose: () => void;
}) {
  const all = [...homeTeam.players, ...awayTeam.players];
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(all.map((p) => [p.userId, p.number == null ? '' : String(p.number)])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A number repeated inside ONE team is the failure that matters — it makes the
  // analyst's shorthand ambiguous. The same number across opposing teams is
  // normal and is left alone.
  const clashing = new Set<string>();
  for (const team of [homeTeam, awayTeam]) {
    const byNumber = new Map<string, string[]>();
    for (const p of team.players) {
      const v = (draft[p.userId] ?? '').trim();
      if (!v) continue;
      byNumber.set(v, [...(byNumber.get(v) ?? []), p.userId]);
    }
    for (const ids of byNumber.values()) if (ids.length > 1) ids.forEach((id) => clashing.add(id));
  }

  const setNum = (userId: string, raw: string) => {
    // Digits only, max two — matches what the server accepts (0–99).
    const v = raw.replace(/\D/g, '').slice(0, 2);
    setDraft((d) => ({ ...d, [userId]: v }));
    setError(null);
  };

  async function save() {
    if (clashing.size) { setError('Two players on the same team share a number — fix the highlighted rows.'); return; }
    setSaving(true);
    setError(null);
    try {
      const numbers = all.map((p) => {
        const v = (draft[p.userId] ?? '').trim();
        return { userId: p.userId, number: v === '' ? null : Number(v) };
      });
      await persist(numbers);
      onSaved();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(msg || 'Could not save jersey numbers. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  const filled = all.filter((p) => (draft[p.userId] ?? '').trim() !== '').length;

  return (
    <div className="bball-modal-backdrop">
      <div className="bball-modal" style={{ width: 720, maxWidth: '92vw' }}>
        <h3 style={{ marginTop: 0 }}>Jersey Numbers</h3>
        <div style={{ color: '#9ca3af', marginTop: 4 }}>
          Check or add each player's number, then save. Leave blank if unknown — you can
          come back to this any time with the <strong>Jersey #s</strong> button.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
          <JerseyCol team={homeTeam} draft={draft} clashing={clashing} setNum={setNum} />
          <JerseyCol team={awayTeam} draft={draft} clashing={clashing} setNum={setNum} />
        </div>
        {error && <div className="jersey-error" role="alert">{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 14 }}>
          <span style={{ color: '#9ca3af', fontSize: 12 }}>{filled} of {all.length} numbered</span>
          <span style={{ display: 'flex', gap: 10 }}>
            <button className="btn secondary" onClick={onClose} disabled={saving}>Skip for now</button>
            <button className="btn" onClick={save} disabled={saving || clashing.size > 0}>
              {saving ? 'Saving…' : 'Save & continue'}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

function StartersCol({ team, sel, set, need }: {
  team: RosterTeam; sel: string[]; set: (v: string[]) => void; need: number;
}) {
  const toggle = (id: string) => {
    if (sel.includes(id)) set(sel.filter((x) => x !== id));
    else if (sel.length < need) set([...sel, id]);
  };
  return (
    <div className="card" style={{ minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong>{team.name}</strong>
        <span style={{ color: sel.length === need ? '#22c55e' : '#f59e0b' }}>{sel.length}/{need}</span>
      </div>
      <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
        {team.players.map((p) => (
          <label key={p.userId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" checked={sel.includes(p.userId)}
              onChange={() => toggle(p.userId)}
              disabled={!sel.includes(p.userId) && sel.length >= need} />
            <span><strong>#{p.number ?? '-'}</strong> {p.name} <span style={{ color: '#9ca3af' }}>({p.position ?? '—'})</span></span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** Set the starting lineup for both sides — five in 5v5, THREE in 3x3. Saving
 *  emits a LINEUP_SET per team, so minutes start accruing against the log the
 *  moment the clock does.
 *
 *  The count comes from the rules rather than a constant: locking it at five
 *  would make a 3x3 fixture impossible to start, since a four-player squad can
 *  never satisfy it. */
export function StartersModal({ homeTeam, awayTeam, rules, onSave, onBack }: {
  homeTeam: RosterTeam; awayTeam: RosterTeam;
  rules: BasketballRules;
  onSave: (home: string[], away: string[]) => void;
  onBack: () => void;
}) {
  const onCourt = rules.playersOnCourt;
  // A short-handed squad still has to be able to start: clamp to what is there.
  const needH = Math.min(onCourt, homeTeam.players.length);
  const needA = Math.min(onCourt, awayTeam.players.length);
  const [h, setH] = useState<string[]>([]);
  const [a, setA] = useState<string[]>([]);

  return (
    <div className="bball-modal-backdrop">
      <div className="bball-modal" style={{ width: 720, maxWidth: '92vw' }}>
        <h3 style={{ marginTop: 0 }}>Set Starting {onCourt}</h3>
        <div style={{ color: '#9ca3af', marginTop: 4 }}>
          Select {needH} player{needH === 1 ? '' : 's'} for each team. Use the rails either side
          of the court to substitute during the game.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
          <StartersCol team={homeTeam} sel={h} set={setH} need={needH} />
          <StartersCol team={awayTeam} sel={a} set={setA} need={needA} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 14 }}>
          <button className="btn secondary" onClick={onBack}>← Jersey numbers</button>
          <span style={{ display: 'flex', gap: 10 }}>
            <button className="btn secondary" onClick={() => {
              if (!h.length) setH(homeTeam.players.slice(0, needH).map((p) => p.userId));
              if (!a.length) setA(awayTeam.players.slice(0, needA).map((p) => p.userId));
            }}>
              Auto-pick first {needH}
            </button>
            <button className="btn" disabled={h.length !== needH || a.length !== needA} onClick={() => onSave(h, a)}>
              Save Starters
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
