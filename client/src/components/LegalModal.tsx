import { X } from 'lucide-react';
import { LegalDocContent } from '../pages/legal/LegalDoc';
import { TERMS_DOC } from '../content/terms';
import { PRIVACY_DOC } from '../content/privacy';

interface Props {
  /** Which legal document to show. */
  docType: 'terms' | 'privacy';
  onClose: () => void;
}

/**
 * In-app overlay that renders the Terms or Privacy document over the current
 * screen — used from the signup form so tapping a legal link never navigates
 * away (which would lose registration progress) and works identically in the
 * web app and the native iOS/Android WebView, where an external `_blank` link
 * to an internal route would break.
 */
export default function LegalModal({ docType, onClose }: Props) {
  const doc = docType === 'terms' ? TERMS_DOC : PRIVACY_DOC;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="legal-root relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky close bar stays reachable while scrolling the long doc. */}
        <div className="sticky top-0 z-10 flex justify-end p-2 bg-[#0f1230]/85 backdrop-blur">
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <main className="legal-main" style={{ marginTop: 8, marginBottom: 40 }}>
          <LegalDocContent {...doc} />
        </main>
      </div>
    </div>
  );
}
