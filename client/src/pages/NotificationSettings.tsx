import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, BellOff, Moon } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import BallLoader from '../components/BallLoader';

type Digest = 'INSTANT' | 'DAILY' | 'WEEKLY' | 'OFF';
interface Effective { inApp: boolean; email: boolean; digest: Digest }
interface TypeRow {
  type: string; label: string; description: string; configurable: boolean; collapsible: boolean;
  effective: Effective;
}
interface Category { key: string; label: string; types: TypeRow[] }
interface PrefsResponse {
  categories: Category[];
  global: { paused: boolean; quietStart: number | null; quietEnd: number | null };
}

const DIGESTS: { value: Digest; label: string }[] = [
  { value: 'INSTANT', label: 'Instant' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
];

function Toggle({ on, disabled, onChange, label }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40
        ${on ? 'bg-primary' : 'bg-elevated border border-line'}`}
    >
      <span className={`inline-block h-4 w-4 rounded-full transition-transform ${on ? 'translate-x-6 bg-on-primary' : 'translate-x-1 bg-gray-custom'}`} />
    </button>
  );
}

const hourLabel = (h: number) => {
  const am = h < 12; const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${am ? 'AM' : 'PM'}`;
};

export default function NotificationSettings() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery<PrefsResponse>({
    queryKey: ['notif-prefs'],
    queryFn: async () => (await api.get('/notifications/preferences')).data,
  });

  const [local, setLocal] = useState<PrefsResponse | null>(null);
  useEffect(() => { if (data) setLocal(data); }, [data]);

  const save = useMutation({
    mutationFn: (body: any) => api.patch('/notifications/preferences', body),
    onError: () => { toast.error('Could not save — reverting'); qc.invalidateQueries({ queryKey: ['notif-prefs'] }); },
  });

  if (isLoading || !local) return <div className="flex justify-center py-20"><BallLoader /></div>;
  if (isError) return <div className="max-w-2xl mx-auto p-6 text-center text-gray-custom">Couldn't load notification settings.</div>;

  const patchType = (type: string, patch: Partial<Effective>) => {
    setLocal((prev) => prev && ({
      ...prev,
      categories: prev.categories.map((c) => ({
        ...c,
        types: c.types.map((t) => (t.type === type ? { ...t, effective: { ...t.effective, ...patch } } : t)),
      })),
    }));
    save.mutate({ prefs: [{ type, ...patch }] });
  };

  const patchGlobal = (patch: Partial<PrefsResponse['global']>) => {
    setLocal((prev) => prev && ({ ...prev, global: { ...prev.global, ...patch } }));
    save.mutate({ global: patch });
  };

  const quietOn = local.global.quietStart !== null && local.global.quietEnd !== null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
      <button onClick={() => navigate('/settings')} className="flex items-center gap-1 text-sm text-gray-custom hover:text-foreground mb-4 transition-colors">
        <ChevronLeft size={16} /> Settings
      </button>
      <h1 className="text-2xl font-bold mb-1">Notifications</h1>
      <p className="text-sm text-gray-custom mb-6">Choose what reaches you, and how. Account &amp; security notices are always on.</p>

      {/* Global controls */}
      <section className="bg-card rounded-xl border border-line p-5 mb-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <BellOff size={18} className="text-gray-custom mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium">Pause all</p>
              <p className="text-xs text-gray-custom mt-0.5">Silence emails &amp; push. Your in-app notifications still collect quietly.</p>
            </div>
          </div>
          <Toggle on={local.global.paused} onChange={(v) => patchGlobal({ paused: v })} label="Pause all notifications" />
        </div>

        <div className="border-t border-line pt-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <Moon size={18} className="text-gray-custom mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Quiet hours</p>
                <p className="text-xs text-gray-custom mt-0.5">Hold emails &amp; push overnight (IST). They send once quiet hours end.</p>
              </div>
            </div>
            <Toggle
              on={quietOn}
              onChange={(v) => patchGlobal(v ? { quietStart: 22, quietEnd: 7 } : { quietStart: null, quietEnd: null })}
              label="Quiet hours"
            />
          </div>
          {quietOn && (
            <div className="flex items-center gap-2 mt-3 pl-8">
              <HourSelect value={local.global.quietStart!} onChange={(h) => patchGlobal({ quietStart: h })} />
              <span className="text-xs text-gray-custom">to</span>
              <HourSelect value={local.global.quietEnd!} onChange={(h) => patchGlobal({ quietEnd: h })} />
            </div>
          )}
        </div>
      </section>

      {/* Per-category, per-type */}
      {local.categories.map((cat) => (
        <section key={cat.key} className="bg-card rounded-xl border border-line mb-5 overflow-hidden">
          <div className="px-5 py-3 border-b border-line flex items-center justify-between">
            <h2 className="text-sm font-semibold">{cat.label}</h2>
            <div className="flex items-center gap-6 text-[11px] uppercase tracking-wide text-gray-custom pr-1">
              <span className="w-11 text-center">In-app</span>
              <span className="w-11 text-center">Email</span>
            </div>
          </div>
          <ul className="divide-y divide-line">
            {cat.types.map((t) => (
              <li key={t.type} className="px-5 py-3.5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t.label}{t.collapsible && <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-custom/70">grouped</span>}</p>
                    <p className="text-xs text-gray-custom mt-0.5">{t.description}</p>
                  </div>
                  {t.configurable ? (
                    <div className="flex items-center gap-6 shrink-0">
                      <Toggle on={t.effective.inApp} onChange={(v) => patchType(t.type, { inApp: v })} label={`${t.label} in-app`} />
                      <Toggle on={t.effective.email} onChange={(v) => patchType(t.type, { email: v })} label={`${t.label} email`} />
                    </div>
                  ) : (
                    <span className="text-[11px] uppercase tracking-wide text-primary shrink-0">Always on</span>
                  )}
                </div>
                {t.configurable && t.effective.email && (
                  <div className="mt-2.5 flex items-center gap-2 pl-0">
                    <span className="text-xs text-gray-custom">Email frequency</span>
                    <div className="flex rounded-lg border border-line overflow-hidden">
                      {DIGESTS.map((d) => (
                        <button key={d.value}
                          onClick={() => patchType(t.type, { digest: d.value })}
                          className={`px-2.5 py-1 text-xs transition-colors ${t.effective.digest === d.value ? 'bg-primary text-on-primary font-medium' : 'text-gray-custom hover:bg-surface'}`}>
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function HourSelect({ value, onChange }: { value: number; onChange: (h: number) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))}
      className="bg-surface border border-line rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary">
      {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
    </select>
  );
}
