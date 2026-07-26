import { AlertTriangle, GitFork } from 'lucide-react';
import type { DrawPreview } from './drawPreview';

/** Shows what the current draw config will produce (bracket size, byes) and any
 *  warnings for degenerate configs. Shared by the real + demo setup forms. */
export default function DrawPreviewPanel({ preview }: { preview: DrawPreview }) {
  return (
    <div className={`rounded-lg border p-3 text-xs space-y-1.5 ${preview.blocked ? 'border-red-500/40 bg-red-500/5' : 'border-line bg-surface'}`}>
      <p className={`flex items-start gap-1.5 ${preview.blocked ? 'text-red-400' : 'text-gray-custom'}`}>
        <GitFork size={13} className="mt-0.5 shrink-0" />
        <span>{preview.summary}</span>
      </p>
      {preview.warnings.map((w, i) => (
        <p key={i} className="flex items-start gap-1.5 text-amber-300">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span>{w}</span>
        </p>
      ))}
    </div>
  );
}
