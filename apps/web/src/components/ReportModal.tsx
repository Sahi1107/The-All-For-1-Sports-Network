import { useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/client';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Heading shown in the modal, e.g. "Report post" or "Report comment". */
  title: string;
  /** API path the report is POSTed to, e.g. `/posts/123/report`. */
  endpoint: string;
}

/**
 * Shared report dialog for content-level flagging (posts, comments, messages).
 * Posts `{ reason, details }` to the given endpoint — the same shape every
 * report endpoint accepts. Account-level reports keep their own inline modal
 * in Profile.
 */
export default function ReportModal({ open, onClose, title, endpoint }: Props) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const close = () => {
    setReason('');
    setDetails('');
    onClose();
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      await api.post(endpoint, { reason, details: details || undefined });
      toast.success('Report submitted');
      close();
    } catch {
      toast.error('Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      onClick={close}
    >
      <div
        className="w-full max-w-md bg-card border border-line rounded-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold mb-1">{title}</h3>
        <p className="text-xs text-gray-custom mb-4">
          Reports are reviewed by admins. False reports may impact your account.
        </p>
        <label className="block text-xs text-gray-custom mb-1">Reason</label>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary mb-3"
        >
          <option value="">Select a reason</option>
          <option value="spam">Spam</option>
          <option value="harassment">Harassment or hateful behavior</option>
          <option value="impersonation">Impersonation</option>
          <option value="inappropriate">Inappropriate content</option>
          <option value="other">Other</option>
        </select>
        <label className="block text-xs text-gray-custom mb-1">Details (optional)</label>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Add any extra context"
          className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-foreground placeholder-gray-custom focus:outline-none focus:border-primary resize-none"
        />
        <div className="flex gap-2 mt-4">
          <button
            onClick={close}
            disabled={submitting}
            className="flex-1 py-2 bg-elevated hover:bg-surface border border-line text-sm rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={!reason || submitting}
            onClick={submit}
            className="flex-1 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Submit report'}
          </button>
        </div>
      </div>
    </div>
  );
}
