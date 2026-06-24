import { useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import Papa from 'papaparse';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
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

/** Detect a wide Google-Form export (one row per team, repeating player blocks). */
function isWideFormat(headers: string[]): boolean {
  const set = new Set(headers.map((h) => h.trim().toLowerCase()));
  return set.has('team name') && set.has('player 1 name');
}

/** Detect a normalized long-format CSV (one row per member). */
function isLongFormat(headers: string[]): boolean {
  const set = new Set(headers.map(norm));
  return set.has('team_name') && set.has('member_role') && set.has('email');
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

/** Pass-through for a long-format CSV (header keys normalized to canonical). */
function reshapeLong(rows: Record<string, string>[]): LongRow[] {
  return rows.map((r) => {
    const o: any = {};
    for (const f of CANONICAL_FIELDS) o[f.key] = '';
    for (const [k, v] of Object.entries(r)) {
      const nk = norm(k);
      if (CANONICAL_FIELDS.some((f) => f.key === nk)) o[nk] = (v ?? '').trim();
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

type Step = 'upload' | 'map' | 'preview' | 'done';

export default function BulkProvision() {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const { user } = useAuth();

  const [step, setStep] = useState<Step>('upload');
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [longRows, setLongRows] = useState<LongRow[]>([]);
  const [report, setReport] = useState<PreviewReport | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);

  if (user?.role !== 'ADMIN') return <Navigate to="/home" replace />;

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
      const { data } = await api.post(`/admin/tournaments/${tournamentId}/bulk-provision/preview`, { rows });
      return data.report as PreviewReport;
    },
    onSuccess: (rep) => { setReport(rep); setStep('preview'); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Preview failed'),
  });

  const commitMutation = useMutation({
    mutationFn: async (rows: LongRow[]) => {
      const { data } = await api.post(`/admin/tournaments/${tournamentId}/bulk-provision/commit`, { rows });
      return data.result as CommitResult;
    },
    onSuccess: (res) => { setResult(res); setStep('done'); toast.success('Provisioning complete'); },
    onError: (err: any) => {
      const blocking = err.response?.data?.blockingErrors;
      toast.error(blocking ? `Blocked: ${blocking[0]}` : (err.response?.data?.error || 'Commit failed'));
    },
  });

  function handleFile(file: File) {
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
        } else {
          // Unknown headers → guess a mapping, then let the admin confirm it.
          const guess: Record<string, string> = {};
          for (const f of CANONICAL_FIELDS) {
            const hit = hdrs.find((h) => norm(h) === f.key);
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
    const missing = CANONICAL_FIELDS.filter((f) => f.required && !mapping[f.key]);
    if (missing.length) { toast.error(`Map required columns: ${missing.map((m) => m.label).join(', ')}`); return; }
    const rows = reshapeMapped(rawRows, mapping);
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
    a.download = `provision-log-${tournamentId}.csv`;
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
          <Upload size={20} className="text-primary-light" /> Bulk provision roster
        </h1>
        <p className="text-sm text-gray-custom mt-1">
          {tournament ? <>For <span className="text-foreground font-medium">{tournament.name}</span></> : 'Loading tournament…'}
        </p>
        <p className="text-xs text-amber-300/90 mt-2 flex items-center gap-1.5">
          <AlertTriangle size={13} />
          Accounts are created and added to teams immediately — no invites are sent. New users get a temp password by email.
        </p>
      </div>

      {/* ── Upload step ─────────────────────────────────────────── */}
      {step === 'upload' && (
        <div className="bg-card rounded-xl border border-line p-8">
          <label className="block border-2 border-dashed border-line rounded-xl p-10 text-center cursor-pointer hover:border-primary transition-colors">
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <FileSpreadsheet size={32} className="mx-auto mb-3 text-gray-custom" />
            <p className="text-sm font-medium">Click to upload a CSV</p>
            <p className="text-xs text-gray-custom mt-1">
              Accepts the Google Form export (one row per team) or the long-format roster template.
            </p>
            {previewMutation.isPending && (
              <p className="text-xs text-primary-light mt-3 flex items-center justify-center gap-1.5">
                <Loader2 size={13} className="animate-spin" /> Validating…
              </p>
            )}
          </label>
          <div className="mt-4 text-center">
            <a href={sampleHref} download className="text-xs text-primary-light hover:underline inline-flex items-center gap-1.5">
              <Download size={12} /> Download sample_roster.csv (long format)
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
                  {f.label}{f.required && <span className="text-red-400"> *</span>}
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
