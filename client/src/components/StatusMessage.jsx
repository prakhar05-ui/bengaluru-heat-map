import PropTypes from 'prop-types';
import { CircleAlert, Info } from 'lucide-react';
import { Spinner } from './ui.jsx';

/** Small inline spinner + label. */
export function Loading({ label = 'Loading…' }) {
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-ink-500">
      <Spinner />
      {label}
    </div>
  );
}
Loading.propTypes = { label: PropTypes.string };

/** Error message with an optional retry action. */
export function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="flex gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
      <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p>{message}</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="mt-1.5 text-xs font-semibold underline underline-offset-2">
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
ErrorState.propTypes = { message: PropTypes.string.isRequired, onRetry: PropTypes.func };

/** Neutral empty-state text. */
export function EmptyState({ children }) {
  return (
    <div className="flex gap-2.5 rounded-xl bg-ink-100 p-3 text-sm text-ink-700">
      <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink-500" />
      <p>{children}</p>
    </div>
  );
}
EmptyState.propTypes = { children: PropTypes.node.isRequired };
