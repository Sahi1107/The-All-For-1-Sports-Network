import { useState } from 'react';
import { LifeBuoy, CheckCircle2, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';

const CATEGORIES = ['General', 'Account', 'Bug', 'Report or appeal', 'Other'] as const;
type Category = typeof CATEGORIES[number];

export default function Support() {
  const [category, setCategory] = useState<Category>('General');
  const [subject, setSubject]   = useState('');
  const [message, setMessage]   = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const canSubmit = subject.trim().length >= 3 && message.trim().length >= 10 && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await api.post('/support', { category, subject: subject.trim(), message: message.trim() });
      setSent(true);
    } catch (err: any) {
      const details = err?.response?.data?.details;
      toast.error(Array.isArray(details) ? details.join(', ') : 'Could not send your message. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10">
        <div className="bg-card rounded-2xl border border-line p-8 text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={30} className="text-primary" />
          </div>
          <h1 className="text-xl font-semibold mb-2">Message sent</h1>
          <p className="text-gray-custom text-sm mb-6">
            Thanks for reaching out — we’ve emailed you a confirmation and will get back to you soon.
          </p>
          <button
            onClick={() => { setSent(false); setSubject(''); setMessage(''); setCategory('General'); }}
            className="px-5 py-2.5 text-sm rounded-lg border border-line hover:bg-elevated transition-colors"
          >
            Send another message
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="flex items-center gap-2 mb-1">
        <LifeBuoy size={20} className="text-primary" />
        <h1 className="text-2xl font-bold">Help &amp; Support</h1>
      </div>
      <p className="text-gray-custom text-sm mb-6">
        Questions, problems, or an appeal against a moderation decision — tell us and we’ll help.
      </p>

      <form onSubmit={handleSubmit} className="bg-card rounded-2xl border border-line p-6 space-y-4">
        <div>
          <label className="block text-sm text-gray-custom mb-2">Topic</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            className="w-full px-4 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground"
          >
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-custom mb-2">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={150}
            placeholder="A short summary"
            className="w-full px-4 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground placeholder-gray-custom"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-custom mb-2">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={4000}
            rows={6}
            placeholder="Tell us what’s going on…"
            className="w-full px-4 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground placeholder-gray-custom resize-y"
          />
          <p className="text-xs text-gray-custom mt-1 text-right">{message.trim().length}/4000</p>
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full py-3 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          {submitting ? 'Sending…' : 'Send message'}
        </button>

        <p className="text-xs text-gray-custom text-center flex items-center justify-center gap-1.5 pt-1">
          <Mail size={12} /> Or email us at{' '}
          <a href="mailto:info@allfor1.pro" className="text-primary hover:text-primary-light">info@allfor1.pro</a>
        </p>
      </form>
    </div>
  );
}
