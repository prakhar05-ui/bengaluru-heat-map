import { Info } from 'lucide-react';

/**
 * Persistent, non-dismissible disclaimer shown on every page.
 */
export default function DisclaimerBanner() {
  return (
    <div role="note" className="flex items-center gap-2 border-b border-amber-200/70 bg-amber-50 px-4 py-1.5 text-xs text-amber-900">
      <Info aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-amber-600" />
      <p className="leading-snug">
        Based on reported incidents only. Reporting rates differ by area, so this is not a measure of actual safety.
      </p>
    </div>
  );
}
