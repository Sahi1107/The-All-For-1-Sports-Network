import type { ComponentType, ReactNode } from 'react';

/**
 * The one empty-state system. A young network spends most of its life empty —
 * a bare grey string reads as "broken"; an icon + one warm line + a next step
 * reads as "not yet". Use everywhere a list can be empty.
 *
 * Icon sits in a soft elevated disc; title in foreground; hint one size down;
 * optional action renders below (pass a ready-made button/Link). Built on the
 * semantic tokens so it works in both themes.
 */
export default function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  compact = false,
}: {
  icon: ComponentType<{ size?: number | string; className?: string }>;
  title: string;
  hint?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 ${compact ? 'py-6' : 'py-12'}`}>
      <div className={`rounded-full bg-elevated ring-1 ring-line flex items-center justify-center ${compact ? 'w-10 h-10' : 'w-14 h-14'}`}>
        <Icon size={compact ? 18 : 24} className="text-gray-custom" />
      </div>
      <p className={`font-display font-semibold text-foreground/85 ${compact ? 'text-sm mt-2.5' : 'text-base mt-4'}`}>{title}</p>
      {hint && <p className={`text-gray-custom max-w-xs ${compact ? 'text-xs mt-1' : 'text-sm mt-1.5'}`}>{hint}</p>}
      {action && <div className={compact ? 'mt-3' : 'mt-4'}>{action}</div>}
    </div>
  );
}
