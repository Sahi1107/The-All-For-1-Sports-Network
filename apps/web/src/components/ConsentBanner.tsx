import { Link } from 'react-router-dom';
import type { Consent } from '../config/consent';

// Cookie/analytics consent notice (DPDP). Shown until the user makes a choice.
// Accepting enables product analytics; declining keeps everything off. Essential
// auth/session storage is unaffected either way.
export default function ConsentBanner({
  consent,
  onDecide,
}: {
  consent: Consent | null;
  onDecide: (v: Consent) => void;
}) {
  if (consent !== null) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-4"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      role="dialog"
      aria-live="polite"
      aria-label="Cookie and analytics consent"
    >
      <div className="mx-auto max-w-3xl bg-card border border-line rounded-2xl shadow-lg p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <p className="text-sm text-gray-custom flex-1">
          We use cookies and privacy-respecting analytics to understand how All For 1 is used and
          improve it. Essential features work regardless.{' '}
          <Link to="/privacy" className="text-primary hover:text-primary-light underline">
            Privacy Policy
          </Link>
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onDecide('denied')}
            className="px-4 py-2 text-sm rounded-lg border border-line text-gray-custom hover:text-foreground hover:border-gray-custom transition-colors"
          >
            Decline
          </button>
          <button
            onClick={() => onDecide('granted')}
            className="px-4 py-2 text-sm rounded-lg bg-primary hover:bg-primary-dark text-on-primary font-semibold transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
