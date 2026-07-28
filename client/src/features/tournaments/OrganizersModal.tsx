import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  X, Search, UserPlus, Trash2, ShieldCheck, Mail, Loader2, CheckCircle2, UserCheck,
} from 'lucide-react';
import api from '../../api/client';
import { useDebounce } from '../../hooks/useDebounce';

interface LiteUser { id: string; name: string; email: string; avatar?: string | null; role?: string }
interface OrganizerRow {
  userId: string; name: string; email: string; avatar?: string | null;
  addedBy: { id: string; name: string } | null; createdAt: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Super-admin only. Assign / revoke tournament organisers. Detects, as the email
 * is typed, whether the person already has an account (assign + notify) or needs a
 * new one (create + email credentials) — the two paths the backend implements.
 * Every action here is server-enforced as ADMIN-only; this is just the surface.
 */
export default function OrganizersModal({
  tournamentId, tournamentName, onClose,
}: {
  tournamentId: string; tournamentName: string; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<LiteUser | null>(null);
  const [newName, setNewName] = useState('');
  const debounced = useDebounce(query.trim(), 250);
  const isEmail = EMAIL_RE.test(debounced);

  const listKey = ['tournament-organizers', tournamentId];
  const { data: organizers = [], isLoading: loadingList } = useQuery<OrganizerRow[]>({
    queryKey: listKey,
    queryFn: async () => (await api.get(`/admin/tournaments/${tournamentId}/organizers`)).data.organizers,
  });
  const assignedIds = useMemo(() => new Set(organizers.map((o) => o.userId)), [organizers]);

  // Typeahead over all users (name or email). Suppressed once a user is chosen.
  const { data: searchResults = [] } = useQuery<LiteUser[]>({
    queryKey: ['organizer-user-search', debounced],
    queryFn: async () => (await api.get(`/admin/users?search=${encodeURIComponent(debounced)}&limit=6`)).data.users,
    enabled: !selected && debounced.length > 1,
  });

  // Authoritative case detection the moment a full email is entered.
  const { data: lookup, isFetching: lookingUp } = useQuery<{ exists: boolean; user: LiteUser | null }>({
    queryKey: ['organizer-lookup', debounced],
    queryFn: async () => (await api.get(`/admin/users/lookup?email=${encodeURIComponent(debounced)}`)).data,
    enabled: !selected && isEmail,
  });

  const reset = () => { setQuery(''); setSelected(null); setNewName(''); };

  const add = useMutation({
    mutationFn: (body: { userId?: string; name?: string; email?: string }) =>
      api.post(`/admin/tournaments/${tournamentId}/organizers`, body),
    onSuccess: (res) => {
      const created = res.data?.created;
      toast.success(created ? 'Account created & organiser added — credentials emailed' : 'Organiser added & notified');
      qc.invalidateQueries({ queryKey: listKey });
      reset();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Could not add organiser'),
  });

  const revoke = useMutation({
    mutationFn: (userId: string) => api.delete(`/admin/tournaments/${tournamentId}/organizers/${userId}`),
    onMutate: async (userId) => {
      await qc.cancelQueries({ queryKey: listKey });
      const prev = qc.getQueryData<OrganizerRow[]>(listKey);
      qc.setQueryData<OrganizerRow[]>(listKey, (old) => (old ?? []).filter((o) => o.userId !== userId));
      return { prev };
    },
    onError: (_e, _id, ctx) => { if (ctx?.prev) qc.setQueryData(listKey, ctx.prev); toast.error('Could not revoke access'); },
    onSuccess: () => toast.success('Organiser access revoked'),
    onSettled: () => qc.invalidateQueries({ queryKey: listKey }),
  });

  // Which "case" the add panel is in.
  const existingUser: LiteUser | null = selected ?? (isEmail && lookup?.exists ? lookup.user : null);
  const isNewAccount = isEmail && lookup && !lookup.exists;
  const alreadyAssigned = existingUser ? assignedIds.has(existingUser.id) : false;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-line rounded-2xl w-full max-w-md max-h-[88vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck size={17} className="text-primary shrink-0" />
            <h3 className="font-semibold truncate">Organisers</h3>
          </div>
          <button onClick={onClose} className="text-gray-custom hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          <p className="text-[12px] text-gray-custom -mt-1">
            Organisers can run <span className="text-foreground">{tournamentName}</span> — teams, draw, schedule and results —
            but nothing else on the platform. Access is scoped to this tournament only.
          </p>

          {/* Current organisers */}
          <div>
            <h4 className="text-xs font-semibold text-gray-custom uppercase tracking-wide mb-2">Has access</h4>
            {loadingList ? (
              <p className="text-sm text-gray-custom py-2">Loading…</p>
            ) : organizers.length === 0 ? (
              <p className="text-sm text-gray-custom py-2">No organisers yet. Add one below.</p>
            ) : (
              <ul className="space-y-1.5">
                {organizers.map((o) => (
                  <li key={o.userId} className="flex items-center gap-2.5 bg-surface border border-line rounded-lg px-3 py-2">
                    <Avatar name={o.name} avatar={o.avatar} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{o.name}</p>
                      <p className="text-[11px] text-gray-custom truncate">{o.email}</p>
                    </div>
                    <button
                      onClick={() => { if (confirm(`Revoke ${o.name}'s organiser access to ${tournamentName}?`)) revoke.mutate(o.userId); }}
                      disabled={revoke.isPending}
                      className="p-1.5 rounded-lg text-gray-custom hover:text-red-400 hover:bg-elevated transition-colors disabled:opacity-50"
                      title="Revoke access"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Add organiser */}
          <div className="border-t border-line pt-4">
            <h4 className="text-xs font-semibold text-gray-custom uppercase tracking-wide mb-2">Add an organiser</h4>

            {selected ? (
              <SelectedChip user={selected} onClear={reset} />
            ) : (
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-custom" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, or enter an email…"
                  className="w-full pl-9 pr-3 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary"
                />
              </div>
            )}

            {/* Typeahead results (name/email match), hidden once a case is locked in */}
            {!selected && !existingUser && !isNewAccount && debounced.length > 1 && searchResults.length > 0 && (
              <div className="mt-2 border border-line rounded-lg divide-y divide-line max-h-44 overflow-y-auto">
                {searchResults.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => { setSelected(u); setQuery(''); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface transition-colors"
                  >
                    <Avatar name={u.name} avatar={u.avatar} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm truncate">{u.name}</span>
                      <span className="block text-[11px] text-gray-custom truncate">{u.email}</span>
                    </span>
                    {assignedIds.has(u.id)
                      ? <span className="text-[10px] text-accent shrink-0">Organiser</span>
                      : <UserPlus size={14} className="text-primary shrink-0" />}
                  </button>
                ))}
              </div>
            )}

            {/* Case detection while typing an email */}
            {!selected && isEmail && lookingUp && (
              <p className="mt-2 flex items-center gap-1.5 text-[12px] text-gray-custom"><Loader2 size={12} className="animate-spin" /> Checking…</p>
            )}

            {/* Existing account (via typeahead pick or email lookup) */}
            {existingUser && (
              <div className="mt-3 space-y-2.5">
                <CaseHint
                  icon={UserCheck}
                  tone="existing"
                  title="Already on the platform"
                  body={<>They’ll be assigned as an organiser and notified in-app &amp; by email. No new account is created.</>}
                />
                {!selected && (
                  <div className="flex items-center gap-2.5 bg-surface border border-line rounded-lg px-3 py-2">
                    <Avatar name={existingUser.name} avatar={existingUser.avatar} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{existingUser.name}</p>
                      <p className="text-[11px] text-gray-custom truncate">{existingUser.email}</p>
                    </div>
                  </div>
                )}
                {alreadyAssigned ? (
                  <p className="flex items-center gap-1.5 text-[12px] text-accent"><CheckCircle2 size={13} /> Already an organiser for this tournament.</p>
                ) : (
                  <button
                    onClick={() => add.mutate({ userId: existingUser.id })}
                    disabled={add.isPending}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-primary hover:bg-primary-dark text-on-primary transition-colors disabled:opacity-50"
                  >
                    {add.isPending ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
                    Add organiser
                  </button>
                )}
              </div>
            )}

            {/* New account */}
            {isNewAccount && (
              <div className="mt-3 space-y-2.5">
                <CaseHint
                  icon={Mail}
                  tone="new"
                  title="New account"
                  body={<>No account exists for <span className="text-foreground">{debounced}</span>. We’ll create one, email login details, and require a password change on first sign-in.</>}
                />
                <label className="block">
                  <span className="block text-xs text-gray-custom mb-1.5">Full name</span>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Priya Sharma"
                    className="w-full px-3 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary"
                  />
                </label>
                <button
                  onClick={() => add.mutate({ name: newName.trim(), email: debounced })}
                  disabled={add.isPending || newName.trim().length < 2}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-primary hover:bg-primary-dark text-on-primary transition-colors disabled:opacity-50"
                >
                  {add.isPending ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
                  Create account &amp; add
                </button>
              </div>
            )}

            {!selected && !existingUser && !isNewAccount && debounced.length > 1 && searchResults.length === 0 && !isEmail && !lookingUp && (
              <p className="mt-2 text-[12px] text-gray-custom">No matches. Enter a full email to add someone new.</p>
            )}
          </div>
        </div>

        <div className="flex justify-end px-5 py-3 border-t border-line">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-line hover:bg-elevated transition-colors">Done</button>
        </div>
      </div>
    </div>
  );
}

function Avatar({ name, avatar }: { name: string; avatar?: string | null }) {
  return avatar ? (
    <img src={avatar} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
  ) : (
    <div className="w-7 h-7 rounded-full bg-elevated grid place-items-center text-[11px] font-semibold text-gray-custom shrink-0">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function SelectedChip({ user, onClear }: { user: LiteUser; onClear: () => void }) {
  return (
    <div className="flex items-center gap-2.5 bg-surface border border-primary/40 rounded-lg px-3 py-2">
      <Avatar name={user.name} avatar={user.avatar} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{user.name}</p>
        <p className="text-[11px] text-gray-custom truncate">{user.email}</p>
      </div>
      <button onClick={onClear} className="text-gray-custom hover:text-foreground p-1"><X size={15} /></button>
    </div>
  );
}

function CaseHint({
  icon: Icon, title, body, tone,
}: {
  icon: any; title: string; body: React.ReactNode; tone: 'existing' | 'new';
}) {
  const ring = tone === 'existing' ? 'border-accent/30 bg-accent/10' : 'border-primary/30 bg-primary/10';
  const ic = tone === 'existing' ? 'text-accent' : 'text-primary';
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border p-3 ${ring}`}>
      <Icon size={15} className={`mt-0.5 shrink-0 ${ic}`} />
      <div className="min-w-0">
        <p className="text-[12px] font-semibold">{title}</p>
        <p className="text-[11px] text-gray-custom mt-0.5 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}
