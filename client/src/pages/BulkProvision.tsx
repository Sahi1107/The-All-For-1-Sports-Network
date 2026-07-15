import { useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import Papa from 'papaparse';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import { SPORTS } from '../data/sports';
import {
  Upload, ArrowLeft, CheckCircle, AlertTriangle, Users, Crown, Award,
  Download, FileSpreadsheet, Loader2,
} from 'lucide-react';

// ─── Types mirroring the server's preview report ─────────────────────────────

type Classification = 'NEW' | 'EXISTING' | 'ERROR';

interface RowReport {
  index: number;
  teamName: string;
  name: string;
  email: string;
  memberRole: 'CAPTAIN' | 'PLAYER' | 'COACH' | null;
  classification: Classification;
  reasons: string[];
  warnings: string[];
}
interface TeamReport {
  teamName: string;
  memberCount: number;
  playerCount: number;
  hasCaptain: boolean;
  hasCoach: boolean;
  errors: string[];
  warnings: string[];
}
interface PreviewReport {
  rows: RowReport[];
  teams: TeamReport[];
  counts: { newAccounts: number; linkedAccounts: number; teams: number; totalMembers: number };
  blockingErrors: string[];
  canCommit: boolean;
}
interface CommitResult {
  accountsCreated: number;
  accountsLinked: number;
  teamsCreated: number;
  membersAdded: number;
  emailsSent: number;
  skips: string[];
}

/** Canonical long-format fields the server expects. */
type LongRow = {
  team_name: string;
  member_role: string;
  name: string;
  email: string;
  dob: string;
  gender: string;
  position: string;
  phone: string;
  guardian_email: string;
};

const CANONICAL_FIELDS: { key: keyof LongRow; label: string; required: boolean }[] = [
  { key: 'team_name',      label: 'Team name',     required: true },
  { key: 'member_role',    label: 'Role',          required: true },
  { key: 'name',           label: 'Name',          required: true },
  { key: 'email',          label: 'Email',         required: true },
  { key: 'dob',            label: 'Date of birth', required: false },
  { key: 'gender',         label: 'Gender',        required: false },
  { key: 'position',       label: 'Position',      required: false },
  { key: 'phone',          label: 'Phone',         required: false },
  { key: 'guardian_email', label: 'Guardian email', required: false },
];

// ─── CSV reshaping ────────────────────────────────────────────────────────────

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '_');

/** Common header aliases → canonical field keys (applied after norm()). Lets the
 *  standard player-list template ("Player Name, Date of Birth, Playing Position,
 *  Email") be recognized without a manual mapping step. */
const HEADER_ALIASES: Record<string, keyof LongRow> = {
  player_name:      'name',
  full_name:        'name',
  athlete_name:     'name',
  date_of_birth:    'dob',
  birth_date:       'dob',
  birthdate:        'dob',
  playing_position: 'position',
  player_email:     'email',
  email_address:    'email',
  parent_email:     'guardian_email',
  team:             'team_name',
  role:             'member_role',
};

/** norm() + alias resolution → a canonical field key when one matches. */
const canon = (h: string): string => {
  const n = norm(h);
  return (HEADER_ALIASES as Record<string, string>)[n] ?? n;
};

/** Detect a wide Google-Form export (one row per team, repeating player blocks). */
function isWideFormat(headers: string[]): boolean {
  const set = new Set(headers.map((h) => h.trim().toLowerCase()));
  return set.has('team name') && set.has('player 1 name');
}

/** Detect a normalized long-format CSV (one row per member). */
function isLongFormat(headers: string[]): boolean {
  const set = new Set(headers.map(canon));
  return set.has('team_name') && set.has('member_role') && set.has('email');
}

/** Detect a simple player-list CSV — one row per player, no team columns.
 *  Matches the standard template: Player Name, Date of Birth, Playing Position,
 *  Email. Rows are parsed team-less; a team is assigned in the next step. */
function isPlayerListFormat(headers: string[]): boolean {
  const set = new Set(headers.map(canon));
  return set.has('name') && set.has('email') && !set.has('team_name') && !isWideFormat(headers);
}

/** Unpivot a wide team row into one record per member. */
function reshapeWide(rows: Record<string, string>[]): LongRow[] {
  const out: LongRow[] = [];
  const get = (r: Record<string, string>, key: string) => {
    const hit = Object.keys(r).find((k) => k.trim().toLowerCase() === key.toLowerCase());
    return hit ? (r[hit] ?? '').trim() : '';
  };
  for (const r of rows) {
    const teamName = get(r, 'Team Name');
    if (!teamName) continue;
    for (let n = 1; n <= 12; n++) {
      const name = get(r, `Player ${n} Name`);
      const email = get(r, `Player ${n} Email`);
      if (!name && !email) continue;
      out.push({
        team_name: teamName,
        member_role: n === 1 ? 'captain' : 'player',
        name,
        email,
        dob: get(r, `Player ${n} Date of Birth`),
        gender: '',
        position: get(r, `Player ${n} Playing Position`),
        phone: '',
        guardian_email: '',
      });
    }
    const coachName = get(r, 'Coach Name');
    const coachEmail = get(r, 'Coach Email');
    if (coachName && coachEmail) {
      out.push({
        team_name: teamName, member_role: 'coach', name: coachName, email: coachEmail,
        dob: '', gender: '', position: '', phone: '', guardian_email: '',
      });
    }
  }
  return out;
}

/** Pass-through for a long-format or player-list CSV (header keys resolved to
 *  canonical via norm() + aliases). Unmapped canonical fields stay ''. */
function reshapeLong(rows: Record<string, string>[]): LongRow[] {
  return rows.map((r) => {
    const o: any = {};
    for (const f of CANONICAL_FIELDS) o[f.key] = '';
    for (const [k, v] of Object.entries(r)) {
      const ck = canon(k);
      if (CANONICAL_FIELDS.some((f) => f.key === ck)) o[ck] = (v ?? '').trim();
    }
    return o as LongRow;
  });
}

/** Build long rows from a user-supplied header → canonical-field mapping. */
function reshapeMapped(rows: Record<string, string>[], mapping: Record<string, string>): LongRow[] {
  return rows.map((r) => {
    const o: any = {};
    for (const f of CANONICAL_FIELDS) {
      const sourceHeader = mapping[f.key];
      o[f.key] = sourceHeader ? (r[sourceHeader] ?? '').trim() : '';
    }
    return o as LongRow;
  });
}

// ─── Component ──────────────────────────────────────────────────────────────

type Step = 'upload' | 'map' | 'team' | 'preview' | 'done';

export default function BulkProvision() {
  const { tournamentId } = useParams<{ tournamentId?: string }>();
  // No :tournamentId in the route ⇒ standalone import (sport chosen per batch).
  const standalone = !tournamentId;
  const { user } = useAuth();

  const [sport, setSport] = useState('');
  const [step, setStep] = useState<Step>('upload');
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [longRows, setLongRows] = useState<LongRow[]>([]);
  // Team-assignment step (player-list CSVs have no team column).
  const [teamName, setTeamName] = useState('');
  const [captainIdx, setCaptainIdx] = useState(0);
  const [report, setReport] = useState<PreviewReport | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);

  if (user?.role !== 'ADMIN') return <Navigate to="/home" replace />;

  // Name + email are always required. In a tournament import, member_role is
  // required only when a team column is actually mapped — CSVs without a team
  // column go through the team-assignment step, which sets team + roles itself.
  const isRequired = (key: keyof LongRow) =>
    key === 'name' || key === 'email' ||
    (!standalone && !!mapping.team_name && key === 'member_role');

  const { data: tournamentData } = useQuery({
    queryKey: ['tournament', tournamentId],
    queryFn: async () => {
      const { data } = await api.get(`/tournaments/${tournamentId}`);
      return data;
    },
    enabled: !!tournamentId,
  });
  const tournament = tournamentData?.tournament ?? tournamentData;

  const previewMutation = useMutation({
    mutationFn: async (rows: LongRow[]) => {
      const { data } = standalone
        ? await api.post('/admin/bulk-provision/preview', { sport, rows })
        : await api.post(`/admin/tournaments/${tournamentId}/bulk-provision/preview`, { rows });
      return data.report as PreviewReport;
    },
    onSuccess: (rep) => { setReport(rep); setStep('preview'); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Preview failed'),
  });

  const commitMutation = useMutation({
    mutationFn: async (rows: LongRow[]) => {
      const { data } = standalone
        ? await api.post('/admin/bulk-provision/commit', { sport, rows })
        : await api.post(`/admin/tournaments/${tournamentId}/bulk-provision/commit`, { rows });
      return data.result as CommitResult;
    },
    onSuccess: (res) => { setResult(res); setStep('done'); toast.success('Provisioning complete'); },
    onError: (err: any) => {
      const blocking = err.response?.data?.blockingErrors;
      toast.error(blocking ? `Blocked: ${blocking[0]}` : (err.response?.data?.error || 'Commit failed'));
    },
  });

  function handleFile(file: File) {
    if (standalone && !sport) { toast.error('Choose a sport for this batch first'); return; }
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const hdrs = res.meta.fields ?? [];
        const data = res.data;
        if (data.length === 0) { toast.error('CSV has no data rows'); return; }
        setRawRows(data);
        setHeaders(hdrs);

        if (isWideFormat(hdrs)) {
          const rows = reshapeWide(data);
          setLongRows(rows);
          previewMutation.mutate(rows);
        } else if (isLongFormat(hdrs)) {
          const rows = reshapeLong(data);
          setLongRows(rows);
          previewMutation.mutate(rows);
        } else if (isPlayerListFormat(hdrs)) {
          // Player-list template (no team column) → assign a team next.
          const rows = reshapeLong(data);
          setLongRows(rows);
          enterTeamStep(rows);
        } else {
          // Unknown headers → guess a mapping, then let the admin confirm it.
          const guess: Record<string, string> = {};
          for (const f of CANONICAL_FIELDS) {
            const hit = hdrs.find((h) => canon(h) === f.key);
            if (hit) guess[f.key] = hit;
          }
          setMapping(guess);
          setStep('map');
        }
      },
      error: () => toast.error('Could not parse CSV'),
    });
  }

  function submitMapping() {
    const missing = CANONICAL_FIELDS.filter((f) => isRequired(f.key) && !mapping[f.key]);
    if (missing.length) { toast.error(`Map required columns: ${missing.map((m) => m.label).join(', ')}`); return; }
    const rows = reshapeMapped(rawRows, mapping);
    setLongRows(rows);
    if (!mapping.team_name) {
      // No team column in the file → assign a team (and captain) next.
      enterTeamStep(rows);
      return;
    }
    previewMutation.mutate(rows);
  }

  /** Open the team-assignment step for team-less rows. Preselects the captain
   *  if a role column already marks one; otherwise defaults to the first row. */
  function enterTeamStep(rows: LongRow[]) {
    setTeamName('');
    const marked = rows.findIndex((r) => r.member_role.trim().toLowerCase() === 'captain');
    setCaptainIdx(marked >= 0 ? marked : 0);
    setStep('team');
  }

  function submitTeamStep() {
    const name = teamName.trim();
    if (!standalone && !name) { toast.error('Enter a team name for this roster'); return; }
    if (!name) {
      // Standalone with no team — import every row as an individual profile.
      previewMutation.mutate(longRows);
      return;
    }
    const rows = longRows.map((r, i) => ({
      ...r,
      team_name: name,
      // Keep an explicit role from the file (e.g. coach); default the rest to
      // player, with exactly one captain — the one picked here.
      member_role: i === captainIdx ? 'captain'
        : (r.member_role.trim().toLowerCase() === 'captain' ? 'player' : r.member_role.trim() || 'player'),
    }));
    setLongRows(rows);
    previewMutation.mutate(rows);
  }

  function downloadLog() {
    if (!result) return;
    // Created/linked accounts only — never plaintext passwords.
    const rows = (report?.rows ?? [])
      .filter((r) => r.classification !== 'ERROR')
      .map((r) => ({
        email: r.email, name: r.name, team: r.teamName,
        role: r.memberRole ?? '', status: r.classification === 'NEW' ? 'created' : 'linked',
      }));
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `provision-log-${tournamentId ?? 'standalone'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const sampleHref = '/sample_roster.csv';

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-custom hover:text-foreground mb-4">
        <ArrowLeft size={15} /> Back to admin
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Upload size={20} className="text-primary-light" /> {standalone ? 'Bulk import profiles' : 'Bulk provision roster'}
        </h1>
        <p className="text-sm text-gray-custom mt-1">
          {standalone
            ? 'Create claimable athlete/coach profiles — and optionally teams — from a CSV. No tournament needed.'
            : tournament ? <>For <span className="text-foreground font-medium">{tournament.name}</span></> : 'Loading tournament…'}
        </p>
        <p className="text-xs text-amber-300/90 mt-2 flex items-center gap-1.5">
          <AlertTriangle size={13} />
          Accounts are created immediately — no invites are sent. New users get a temp password by email; under-13 accounts stay private until a guardian consents by email.
        </p>
      </div>

      {/* ── Upload step ─────────────────────────────────────────── */}
      {step === 'upload' && (
        <div className="bg-card rounded-xl border border-line p-8">
          {standalone && (
            <div className="mb-5">
              <label className="block text-sm font-medium mb-1.5">
                Sport <span className="text-red-400">*</span>
              </label>
              <select
                value={sport}
                onChange={(e) => setSport(e.target.value)}
                className="w-full sm:w-72 px-3 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary"
              >
                <option value="">Select a sport for this batch</option>
                {SPORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <p className="text-xs text-gray-custom mt-1">Applied to every account and team created in this import.</p>
            </div>
          )}
          <label
            className={`block border-2 border-dashed border-line rounded-xl p-10 text-center transition-colors ${
              standalone && !sport ? 'opacity-50 pointer-events-none' : 'cursor-pointer hover:border-primary'
            }`}
          >
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={standalone && !sport}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <FileSpreadsheet size={32} className="mx-auto mb-3 text-gray-custom" />
            <p className="text-sm font-medium">Click to upload a CSV</p>
            <p className="text-xs text-gray-custom mt-1">
              Accepts a simple player list (Player Name, Date of Birth, Playing Position, Email),
              the Google Form export, or the multi-team roster template.
            </p>
            {previewMutation.isPending && (
              <p className="text-xs text-primary-light mt-3 flex items-center justify-center gap-1.5">
                <Loader2 size={13} className="animate-spin" /> Validating…
              </p>
            )}
          </label>
          <div className="mt-4 flex items-center justify-center gap-5 flex-wrap">
            <a href="/sample_players.csv" download className="text-xs text-primary-light hover:underline inline-flex items-center gap-1.5">
              <Download size={12} /> sample_players.csv (player list)
            </a>
            <a href={sampleHref} download className="text-xs text-primary-light hover:underline inline-flex items-center gap-1.5">
              <Download size={12} /> sample_roster.csv (multi-team)
            </a>
          </div>
        </div>
      )}

      {/* ── Column-map step ─────────────────────────────────────── */}
      {step === 'map' && (
        <div className="bg-card rounded-xl border border-line p-6">
          <h2 className="font-semibold mb-1">Map your columns</h2>
          <p className="text-sm text-gray-custom mb-5">
            We didn't recognize the headers. Match each field to a column from your file.
          </p>
          <div className="space-y-3">
            {CANONICAL_FIELDS.map((f) => (
              <div key={f.key} className="flex items-center gap-3">
                <label className="w-40 text-sm shrink-0">
                  {f.label}{isRequired(f.key) && <span className="text-red-400"> *</span>}
                </label>
                <select
                  value={mapping[f.key] ?? ''}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}
                  className="flex-1 px-3 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary"
                >
                  <option value="">— none —</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={() => setStep('upload')} className="px-4 py-2 border border-line text-gray-custom hover:text-foreground rounded-lg text-sm">
              Back
            </button>
            <button onClick={submitMapping} disabled={previewMutation.isPending} className="px-5 py-2 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg text-sm disabled:opacity-50">
              {previewMutation.isPending ? 'Validating…' : 'Preview'}
            </button>
          </div>
        </div>
      )}

      {/* ── Team-assignment step (CSV had no team column) ───────── */}
      {step === 'team' && (
        <div className="bg-card rounded-xl border border-line p-6">
          <h2 className="font-semibold mb-1 flex items-center gap-2">
            <Users size={16} className="text-primary-light" />
            {standalone ? 'Group into a team (optional)' : 'Create the team for this roster'}
          </h2>
          <p className="text-sm text-gray-custom mb-5">
            {standalone
              ? `Your file lists ${longRows.length} player(s) with no team column. Give them a team name to create a team, or leave it blank to import them as individual profiles.`
              : `Your file lists ${longRows.length} player(s) with no team column. Name the team to create and register in this tournament, then pick its captain.`}
          </p>
          <div className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Team name {!standalone && <span className="text-red-400">*</span>}
              </label>
              <input
                type="text" value={teamName} maxLength={120}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder={standalone ? 'Leave blank for individual profiles' : 'e.g. Mumbai Strikers'}
                className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary placeholder-gray-custom"
              />
            </div>
            {teamName.trim() !== '' && (
              <div>
                <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5">
                  <Crown size={13} className="text-amber-400" /> Captain <span className="text-red-400">*</span>
                </label>
                <select
                  value={captainIdx}
                  onChange={(e) => setCaptainIdx(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary"
                >
                  {longRows.map((r, i) => (
                    <option key={i} value={i}>
                      {r.name || '(no name)'}{r.email ? ` — ${r.email}` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-custom mt-1">
                  Every team needs exactly one captain. Everyone else joins as a player.
                </p>
              </div>
            )}
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={() => setStep('upload')} className="px-4 py-2 border border-line text-gray-custom hover:text-foreground rounded-lg text-sm">
              Back
            </button>
            <button onClick={submitTeamStep} disabled={previewMutation.isPending} className="px-5 py-2 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg text-sm disabled:opacity-50">
              {previewMutation.isPending ? 'Validating…' : 'Preview'}
            </button>
          </div>
        </div>
      )}

      {/* ── Preview step ────────────────────────────────────────── */}
      {step === 'preview' && report && (
        <div className="space-y-5">
          {/* Counts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="New accounts" value={report.counts.newAccounts} tone="green" />
            <StatCard label="Linked (existing)" value={report.counts.linkedAccounts} tone="blue" />
            <StatCard label="Teams" value={report.counts.teams} tone="neutral" />
            <StatCard label="Total members" value={report.counts.totalMembers} tone="neutral" />
          </div>

          {/* Blocking errors */}
          {report.blockingErrors.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
              <p className="text-sm font-semibold text-red-400 flex items-center gap-1.5 mb-2">
                <AlertTriangle size={14} /> {report.blockingErrors.length} issue(s) must be fixed before committing
              </p>
              <ul className="text-xs text-red-300/90 space-y-1 list-disc pl-5">
                {report.blockingErrors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          {/* Per-team summary */}
          <div className="space-y-3">
            {report.teams.map((t) => (
              <div key={t.teamName} className="bg-card rounded-xl border border-line overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-line">
                  <div className="flex items-center gap-2 min-w-0">
                    <Users size={15} className="text-gray-custom shrink-0" />
                    <span className="font-medium text-sm truncate">{t.teamName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs shrink-0">
                    <span className={t.hasCaptain ? 'text-amber-400 flex items-center gap-1' : 'text-red-400 flex items-center gap-1'}>
                      <Crown size={11} /> {t.hasCaptain ? 'captain' : 'no captain'}
                    </span>
                    {t.hasCoach && <span className="text-primary-light flex items-center gap-1"><Award size={11} /> coach</span>}
                    <span className="px-2 py-0.5 rounded-full bg-surface text-gray-custom border border-line">
                      {t.playerCount} players
                    </span>
                  </div>
                </div>
                {(t.errors.length > 0 || t.warnings.length > 0) && (
                  <div className="px-4 py-2 text-xs space-y-1">
                    {t.errors.map((e, i) => <p key={`e${i}`} className="text-red-400">⛔ {e}</p>)}
                    {t.warnings.map((w, i) => <p key={`w${i}`} className="text-amber-300">⚠ {w}</p>)}
                  </div>
                )}
                <div className="divide-y divide-line">
                  {report.rows.filter((r) => r.teamName === t.teamName).map((r) => (
                    <RowLine key={r.index} row={r} />
                  ))}
                </div>
              </div>
            ))}
            {/* Rows with no team (e.g. missing team name) */}
            {report.rows.filter((r) => !report.teams.some((t) => t.teamName === r.teamName)).map((r) => (
              <div key={r.index} className="bg-card rounded-xl border border-line">
                <RowLine row={r} />
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => { setStep('upload'); setReport(null); setLongRows([]); }}
              className="px-4 py-2.5 border border-line text-gray-custom hover:text-foreground rounded-lg text-sm"
            >
              Start over
            </button>
            <button
              onClick={() => commitMutation.mutate(longRows)}
              disabled={!report.canCommit || commitMutation.isPending}
              className="flex-1 px-5 py-2.5 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg text-sm disabled:opacity-50"
              title={report.canCommit ? '' : 'Resolve blocking errors first'}
            >
              {commitMutation.isPending ? 'Provisioning…'
                : report.canCommit ? `Confirm & provision ${report.counts.totalMembers} members`
                : 'Resolve errors to continue'}
            </button>
          </div>
        </div>
      )}

      {/* ── Done step ───────────────────────────────────────────── */}
      {step === 'done' && result && (
        <div className="bg-card rounded-xl border border-line p-8 text-center">
          <CheckCircle size={36} className="mx-auto mb-3 text-accent" />
          <h2 className="text-lg font-semibold mb-1">Provisioning complete</h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 my-6 text-left">
            <StatCard label="Created" value={result.accountsCreated} tone="green" />
            <StatCard label="Linked" value={result.accountsLinked} tone="blue" />
            <StatCard label="Teams" value={result.teamsCreated} tone="neutral" />
            <StatCard label="Members" value={result.membersAdded} tone="neutral" />
            <StatCard label="Emails sent" value={result.emailsSent} tone="neutral" />
          </div>
          {result.skips.length > 0 && (
            <div className="text-left text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-4">
              {result.skips.map((s, i) => <p key={i}>• {s}</p>)}
            </div>
          )}
          <div className="flex gap-3 justify-center">
            <button onClick={downloadLog} className="px-4 py-2.5 border border-line hover:bg-surface rounded-lg text-sm inline-flex items-center gap-1.5">
              <Download size={14} /> Download log
            </button>
            <Link to="/admin" className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg text-sm">
              Done
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Small presentational helpers ────────────────────────────────────────────

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'green' | 'blue' | 'neutral' }) {
  const toneClass =
    tone === 'green' ? 'text-accent' : tone === 'blue' ? 'text-primary-light' : 'text-foreground';
  return (
    <div className="bg-card rounded-xl border border-line p-4">
      <p className={`text-2xl font-bold ${toneClass}`}>{value}</p>
      <p className="text-xs text-gray-custom mt-0.5">{label}</p>
    </div>
  );
}

function RowLine({ row }: { row: RowReport }) {
  const dot =
    row.classification === 'NEW' ? 'bg-accent'
      : row.classification === 'EXISTING' ? 'bg-primary-light'
      : 'bg-red-500';
  return (
    <div className="flex items-start gap-3 px-4 py-2 text-xs">
      <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dot}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-foreground truncate">{row.name || '(no name)'}</span>
          <span className="text-gray-custom">{row.email || '(no email)'}</span>
          {row.memberRole && <span className="text-gray-custom">· {row.memberRole.toLowerCase()}</span>}
          <span className={
            row.classification === 'NEW' ? 'text-accent'
              : row.classification === 'EXISTING' ? 'text-primary-light'
              : 'text-red-400'
          }>
            {row.classification === 'NEW' ? 'new' : row.classification === 'EXISTING' ? 'linked' : 'error'}
          </span>
        </div>
        {row.reasons.map((r, i) => <p key={`r${i}`} className="text-red-400">⛔ {r}</p>)}
        {row.warnings.map((w, i) => <p key={`w${i}`} className="text-amber-300">⚠ {w}</p>)}
      </div>
    </div>
  );
}
