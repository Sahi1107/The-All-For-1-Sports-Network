import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Type, Image, Video, Upload, Plus, Trash2, Mail, Trophy, RefreshCw, CheckCircle2 } from 'lucide-react';
import api from '../api/client';
import toast from 'react-hot-toast';
import ImageCropModal from './ImageCropModal';
import { useAuth } from '../contexts/AuthContext';

type PostType = 'TEXT' | 'IMAGE' | 'HIGHLIGHT' | 'PERFORMANCE';

/** One played match, as offered by /share-cards/matches. */
interface MatchOption {
  matchId: string;
  tournamentName: string;
  matchDate: string;
  round: string | null;
  playerTeam: string;
  opponent: string;
  scoreLine: string;
  result: 'W' | 'L' | 'D';
  statLine: string;
}

/** Shared input styling. Placeholders sit well below body-text contrast so a
 *  hint never reads as a value the athlete already typed. */
const FIELD =
  'w-full bg-ink/5 border border-ink/10 rounded-lg px-3 py-2.5 text-sm text-foreground placeholder-ink/25 focus:outline-none focus:border-primary';

/** Every field carries a visible label — the placeholder is only ever an
 *  example, never the field's name. */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-foreground/60 mb-1.5">
        {label}
        {hint && <span className="text-foreground/35 font-normal"> · {hint}</span>}
      </span>
      {children}
    </label>
  );
}

/** Modals mount on <body>, never in the page tree. An ancestor with a transform
 *  (the pull-to-refresh wrapper animating back to rest, a page transition) becomes
 *  the containing block for `position: fixed` descendants, which left the composer
 *  positioned against that element instead of the viewport — the backdrop covered
 *  the screen while the dialog itself sat offscreen. A portal can't be captured. */
const portal = (node: React.ReactNode) =>
  typeof document === 'undefined' ? null : createPortal(node, document.body);

/** The message the API put on a failed request, if it sent one. */
const apiError = (err: unknown): string | undefined =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error;

const matchDateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

interface Props {
  onClose: () => void;
}

export default function CreatePostModal({ onClose }: Props) {
  const { unverifiedEmail, user, resendVerification } = useAuth();
  // Inline resend state for the "verify to post" gate — so a blocked user can
  // actually resolve it here (send + clear feedback) instead of a dead-end.
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const doResend = async () => {
    setResend('sending');
    try { await resendVerification(); setResend('sent'); }
    catch { setResend('error'); }
  };
  const verified = user?.verified ?? false;
  const qc = useQueryClient();
  const [type, setType] = useState<PostType>('TEXT');
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState(0);
  const [commentsDisabled, setCommentsDisabled] = useState(false);
  const [matchId, setMatchId] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // The athlete's played matches — the only source a stat card can come from.
  // Loaded only when the Stat tab is open, and never used to send figures: the
  // request carries the match id, and the server reads the stats itself.
  const matches = useQuery({
    queryKey: ['postable-matches'],
    queryFn: async () => (await api.get('/share-cards/matches')).data.matches as MatchOption[],
    enabled: type === 'PERFORMANCE',
    staleTime: 5 * 60_000,
  });
  const pickedMatch = matches.data?.find((m) => m.matchId === matchId) ?? null;

  // Crop state: queue of raw files waiting to be cropped
  const [cropQueue, setCropQueue] = useState<string[]>([]);
  const [rawQueue, setRawQueue] = useState<File[]>([]);

  const mutation = useMutation({
    mutationFn: async () => {
      // Highlights upload straight to GCS via a signed URL — Cloud Run caps API
      // request bodies at 32 MiB, so large videos can't go through /posts as
      // multipart. We send only the resulting object key to the API.
      if (type === 'HIGHLIGHT') {
        const file = files[0];
        // Prefer the browser-reported MIME; some browsers leave it blank, so
        // fall back to the file extension. Must land in the server's allow-list.
        const extMime: Record<string, string> = {
          mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
          mkv: 'video/x-matroska', webm: 'video/webm',
        };
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        const contentType = file.type || extMime[ext] || 'video/mp4';

        const { data: signed } = await api.post('/posts/upload-url', {
          filename: file.name,
          contentType,
        });

        // PUT directly to GCS (bare axios — no API baseURL / auth header).
        // The Content-Type must match what the signed URL was minted with.
        await axios.put(signed.uploadUrl, file, {
          headers: { 'Content-Type': contentType },
          onUploadProgress: (e) => {
            if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
          },
        });

        const { data } = await api.post('/posts', {
          type,
          ...(content ? { content } : {}),
          ...(title ? { title } : {}),
          ...(commentsDisabled ? { commentsDisabled: true } : {}),
          videoKey: signed.key,
        });
        return data;
      }

      const formData = new FormData();
      formData.append('type', type);
      if (content) formData.append('content', content);
      if (title) formData.append('title', title);
      if (commentsDisabled) formData.append('commentsDisabled', 'true');
      // Stat card: the match id is the whole payload. The server renders the
      // card from the persisted stat row for that match.
      if (type === 'PERFORMANCE') formData.append('matchId', matchId);
      for (const file of files) {
        formData.append('media', file);
      }

      const { data } = await api.post('/posts', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['profile'] });
      qc.invalidateQueries({ queryKey: ['user-posts'] });
      toast.success('Posted!');
      onClose();
    },
    onError: (err) => toast.error(apiError(err) ?? 'Failed to post'),
  });

  const canSubmit =
    (type === 'TEXT' && content.trim()) ||
    (type === 'IMAGE' && files.length > 0) ||
    (type === 'HIGHLIGHT' && files.length > 0 && title.trim()) ||
    (type === 'PERFORMANCE' && !!matchId);

  const acceptType = type === 'HIGHLIGHT' ? 'video/*' : 'image/*';

  const handleFiles = (selected: FileList | null) => {
    if (!selected) return;
    const newFiles = Array.from(selected);
    if (type === 'IMAGE') {
      // Open crop modal for each selected image
      const urls = newFiles.map((f) => URL.createObjectURL(f));
      setRawQueue(newFiles);
      setCropQueue(urls);
    } else {
      // Highlights: single video, no crop
      setFiles([newFiles[0]]);
    }
  };

  const handleCropped = (blob: Blob) => {
    // Cropped blob is always JPEG — strip the source extension so the filename
    // agrees with the bytes (server rejects ext/magic-byte mismatches).
    const baseName = (rawQueue[0]?.name || 'photo').replace(/\.[^.]+$/, '');
    const file = new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
    setFiles((prev) => [...prev, file].slice(0, 10));
    // Advance to next in queue
    setCropQueue((q) => q.slice(1));
    setRawQueue((q) => q.slice(1));
  };

  const handleCropSkip = () => {
    // Skip cropping, use original file
    if (rawQueue[0]) {
      setFiles((prev) => [...prev, rawQueue[0]].slice(0, 10));
    }
    setCropQueue((q) => q.slice(1));
    setRawQueue((q) => q.slice(1));
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  if (unverifiedEmail) {
    return portal(
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="bg-card border border-ink/10 rounded-2xl w-full max-w-md shadow-2xl p-8 text-center">
          <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail size={28} className="text-primary" />
          </div>
          <h2 className="font-semibold text-foreground text-lg mb-2">Verify your email to post</h2>
          <p className="text-foreground/60 text-sm mb-1">
            Posting opens once you confirm <span className="text-foreground/85 break-all">{unverifiedEmail}</span>. Tap the link in the email we sent you.
          </p>
          <p className="text-foreground/45 text-xs mb-6">
            Not there? Check your <span className="font-semibold">spam or junk folder</span>, or resend it below.
          </p>

          {resend === 'sent' ? (
            <div className="w-full py-2.5 mb-1.5 rounded-lg bg-primary/10 text-primary-light text-sm font-medium flex items-center justify-center gap-2">
              <CheckCircle2 size={16} /> Sent — check your inbox and spam
            </div>
          ) : (
            <button
              onClick={doResend}
              disabled={resend === 'sending'}
              className="w-full py-2.5 mb-1.5 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg transition-colors text-sm disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {resend === 'sending'
                ? <><span className="w-4 h-4 border-2 border-on-primary/40 border-t-transparent rounded-full animate-spin" /> Sending…</>
                : <><RefreshCw size={15} /> Resend verification email</>}
            </button>
          )}
          {resend === 'error' && (
            <p className="text-red-400 text-xs mb-1.5">Couldn't send just now — please try again in a moment.</p>
          )}

          <button onClick={onClose} className="w-full py-2 text-sm text-foreground/40 hover:text-foreground transition-colors">
            Close
          </button>
        </div>
      </div>,
    );
  }

  return portal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-ink/10 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink/10">
          <h2 className="font-semibold text-foreground">Create Post</h2>
          <button onClick={onClose} className="text-foreground/50 hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Type tabs */}
        <div className="flex border-b border-ink/10">
          {([
            { key: 'TEXT', icon: Type, label: 'Text' },
            { key: 'IMAGE', icon: Image, label: 'Photo' },
            { key: 'HIGHLIGHT', icon: Video, label: 'Highlight' },
            { key: 'PERFORMANCE', icon: Trophy, label: 'Stat card' },
          ] as const).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => { setType(key); setFiles([]); setContent(''); setTitle(''); setMatchId(''); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors ${
                type === key
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-foreground/50 hover:text-foreground'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        {/* Form */}
        <div className="p-5 space-y-4">
          {/* Title — for highlight only */}
          {type === 'HIGHLIGHT' && (
            <Field label="Title" hint="required">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Assist to a baseline dunk"
                className={FIELD}
              />
            </Field>
          )}

          {/* Stat card — built from a match the athlete actually played. There is
              no free-text stat entry anywhere here: the athlete picks the match,
              the server reads the recorded box score and renders the card. */}
          {type === 'PERFORMANCE' && (
            <div className="space-y-3">
              {matches.isLoading ? (
                <p className="text-sm text-foreground/50">Loading your matches…</p>
              ) : matches.isError ? (
                <p className="text-sm text-foreground/50">
                  {/* A guardian-managed or under-13 account is refused outright;
                      the server says so, and that is more useful than "retry". */}
                  {apiError(matches.error)
                    ?? "Couldn't load your matches just now — please try again in a moment."}
                </p>
              ) : (matches.data?.length ?? 0) === 0 ? (
                <div className="rounded-xl border border-dashed border-ink/15 px-4 py-6 text-center">
                  <Trophy size={22} className="mx-auto mb-2 text-foreground/30" />
                  <p className="text-sm font-medium text-foreground/70">No recorded matches yet</p>
                  <p className="text-xs text-foreground/45 mt-1 leading-relaxed">
                    Stat cards are built from published box scores. Once a match you
                    played is published, it appears here ready to post.
                  </p>
                </div>
              ) : (
                <>
                  <Field label="Match" hint="your recorded box scores">
                    <select
                      value={matchId}
                      onChange={(e) => setMatchId(e.target.value)}
                      className={FIELD}
                    >
                      <option value="">Select a match…</option>
                      {matches.data!.map((m) => (
                        <option key={m.matchId} value={m.matchId}>
                          {`vs ${m.opponent} · ${m.scoreLine} ${m.result} · ${matchDateLabel(m.matchDate)}`}
                        </option>
                      ))}
                    </select>
                  </Field>

                  {/* Read-only confirmation of what the card will say. These
                      figures come from the server, never from an input. */}
                  {pickedMatch && (
                    <div className="rounded-xl border border-primary/25 bg-primary/[0.07] px-4 py-3.5">
                      <p className="font-display font-bold tracking-[0.12em] text-[10px] text-primary/90 mb-1.5">
                        {[pickedMatch.round, pickedMatch.tournamentName].filter(Boolean).join(' · ').toUpperCase()}
                      </p>
                      <p className="text-sm font-semibold text-foreground">
                        {pickedMatch.playerTeam} {pickedMatch.scoreLine} {pickedMatch.opponent}
                      </p>
                      <p className="font-numeric tabular-nums text-sm text-foreground/80 mt-1.5">
                        {pickedMatch.statLine}
                      </p>
                      <p className="text-[11px] text-foreground/45 mt-2">
                        Recorded stats{verified ? ' · Verified' : ''} — your card is rendered from this box score.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Content / caption */}
          {(type === 'TEXT' || type === 'IMAGE' || type === 'PERFORMANCE') && (
            <Field label={type === 'TEXT' ? 'Post' : 'Caption'} hint={type === 'TEXT' ? undefined : 'optional'}>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={type === 'TEXT' ? "Share a highlight, result or update…" : 'Say something about it…'}
                rows={type === 'TEXT' ? 5 : 3}
                className={`${FIELD} resize-none`}
              />
            </Field>
          )}

          {/* File picker — image or video */}
          {(type === 'IMAGE' || type === 'HIGHLIGHT') && (
            <>
              {/* Thumbnail previews for selected images */}
              {type === 'IMAGE' && files.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {files.map((f, i) => (
                    <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-ink/10 group">
                      <img
                        src={URL.createObjectURL(f)}
                        alt={f.name}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => removeFile(i)}
                        className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={14} className="text-red-400" />
                      </button>
                    </div>
                  ))}
                  {files.length < 10 && (
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="w-20 h-20 rounded-lg border-2 border-dashed border-ink/15 flex items-center justify-center hover:border-primary/60 transition-colors"
                    >
                      <Plus size={20} className="text-foreground/40" />
                    </button>
                  )}
                </div>
              )}

              {/* Drop zone — show when no files selected, or for highlights */}
              {(files.length === 0 || type === 'HIGHLIGHT') && !(type === 'IMAGE' && files.length > 0) && (
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-ink/15 rounded-xl p-6 text-center cursor-pointer hover:border-primary/60 transition-colors"
                >
                  {files.length > 0 && type === 'HIGHLIGHT' ? (
                    <div>
                      <p className="text-sm font-medium text-foreground truncate">{files[0].name}</p>
                      <p className="text-xs text-foreground/40 mt-1">{(files[0].size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                  ) : (
                    <div className="text-foreground/40">
                      <Upload size={22} className="mx-auto mb-2" />
                      <p className="text-sm">Click to select {type === 'IMAGE' ? 'photos' : 'video'}</p>
                      <p className="text-xs mt-1">
                        {type === 'IMAGE' ? 'JPG, PNG, WebP · max 5 MB each · up to 10 photos' : 'MP4, MOV · max 100 MB'}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <input
                ref={fileRef}
                type="file"
                accept={acceptType}
                multiple={type === 'IMAGE'}
                className="hidden"
                onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
              />
            </>
          )}

          {/* Upload progress */}
          {mutation.isPending && (type === 'IMAGE' || type === 'HIGHLIGHT') && (
            <div>
              <div className="flex justify-between text-xs text-foreground/40 mb-1">
                <span>Uploading…</span><span>{progress}%</span>
              </div>
              <div className="w-full bg-ink/10 rounded-full h-1.5">
                <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* Disable comments toggle */}
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm text-foreground/60">Disable comments</span>
            <button
              type="button"
              role="switch"
              aria-checked={commentsDisabled}
              onClick={() => setCommentsDisabled((v) => !v)}
              className={`relative w-9 h-5 rounded-full transition-colors ${commentsDisabled ? 'bg-primary' : 'bg-ink/15'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${commentsDisabled ? 'translate-x-4' : ''}`} />
            </button>
          </label>

          {/* Submit */}
          <button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit || mutation.isPending}
            className="w-full py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-40 text-on-primary font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
          >
            {mutation.isPending
              ? <div className="w-4 h-4 border-2 border-surface border-t-transparent rounded-full animate-spin" />
              : 'Post'}
          </button>
        </div>
      </div>

      {/* Crop modal — processes one image at a time from the queue */}
      {cropQueue.length > 0 && (
        <ImageCropModal
          image={cropQueue[0]}
          aspect={4 / 5}
          onCrop={handleCropped}
          onClose={handleCropSkip}
        />
      )}
    </div>,
  );
}
