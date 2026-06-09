import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import logoUrl from '../../assets/logo.svg';

/** Full-bleed wrapper for the live trackers: no app sidebar, just the logo and
 *  a back arrow in the top-left corner so the full box score / action grid fits. */
export default function FullscreenShell({
  backTo,
  topRight,
  children,
}: {
  backTo: string;
  topRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  const nav = useNavigate();
  return (
    <div className="min-h-screen bg-dark text-white">
      {/* Logo + back arrow, stacked in the top-left corner */}
      <div className="fixed top-3 left-3 z-40 flex flex-col items-center gap-3">
        <img src={logoUrl} alt="All For 1" className="w-12 h-12" />
        <button
          onClick={() => nav(backTo)}
          title="Back"
          aria-label="Back"
          className="w-9 h-9 rounded-full bg-dark-light border border-dark-lighter flex items-center justify-center text-gray-custom hover:text-white hover:border-primary transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
      </div>

      {topRight && <div className="fixed top-3 right-4 z-40">{topRight}</div>}

      <main className="pl-20 pr-4 pt-4 pb-28">{children}</main>
    </div>
  );
}
