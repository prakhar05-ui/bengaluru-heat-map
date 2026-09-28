import { useEffect, useId, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { NOTE_MAX_LENGTH, REPORT_CATEGORIES, REPORT_CATEGORY_LABELS, createReportSchema } from '@app/shared';
import { Check, CircleAlert, Lightbulb, MapPin, Route, X } from 'lucide-react';
import { useCreateReport } from '../api/queries.js';
import { Spinner } from './ui.jsx';

const CATEGORY_ICONS = { poor_lighting: Lightbulb, isolated: Route, harassment_spot: CircleAlert };

/**
 * Dialog to submit a community report for a chosen map location.
 * Renders as a bottom sheet on small screens and a centred modal on larger ones.
 *
 * @param {Object} props
 * @param {{ lat: number, lng: number }} props.location
 * @param {() => void} props.onClose
 * @param {() => void} props.onPickAgain   let the user re-drop the pin
 */
export default function ReportPinDialog({ location, onClose, onPickAgain }) {
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [validationError, setValidationError] = useState(null);
  const mutation = useCreateReport();
  const headingId = useId();
  const noteId = useId();
  const dialogRef = useRef(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = (e) => {
    e.preventDefault();
    const parsed = createReportSchema.safeParse({ ...location, category, note: note || undefined });
    if (!parsed.success) {
      setValidationError(category ? parsed.error.issues[0].message : 'Please choose a category.');
      return;
    }
    setValidationError(null);
    mutation.mutate(parsed.data);
  };

  const errorMessage =
    validationError ??
    (mutation.isError
      ? mutation.error.status === 429
        ? 'You have sent several reports recently. Please try again in a few minutes.'
        : mutation.error.message
      : null);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink-900/40 backdrop-blur-[2px] md:items-center" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-float focus:outline-none md:rounded-2xl"
      >
        {mutation.isSuccess ? (
          <div className="py-2 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/50">
              <Check aria-hidden="true" className="h-6 w-6" />
            </span>
            <h2 id={headingId} className="mt-4 text-lg font-semibold">
              Submitted for review
            </h2>
            <p className="mt-1.5 text-sm text-ink-500">
              Thank you. Your report will appear on the map once a moderator has reviewed it.
            </p>
            <button type="button" onClick={onClose} className="btn-dark mt-5 w-full">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id={headingId} className="text-lg font-semibold">
                  Report a spot
                </h2>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-500">
                  <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
                  {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                  <button type="button" onClick={onPickAgain} className="ml-1 font-semibold text-brand-700 hover:underline">
                    Change
                  </button>
                </p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100">
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            <fieldset className="mt-4">
              <legend className="label">What did you notice?</legend>
              <div className="grid grid-cols-3 gap-2">
                {REPORT_CATEGORIES.map((c) => {
                  const Icon = CATEGORY_ICONS[c];
                  const checked = category === c;
                  return (
                    <label
                      key={c}
                      className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border p-3 text-center text-xs font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 ${
                        checked ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-ink-300 text-ink-700 hover:bg-ink-50'
                      }`}
                    >
                      <input type="radio" name="category" value={c} checked={checked} onChange={() => setCategory(c)} className="sr-only" />
                      <Icon aria-hidden="true" className={`h-5 w-5 ${checked ? 'text-brand-600' : 'text-ink-500'}`} />
                      {REPORT_CATEGORY_LABELS[c]}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <label htmlFor={noteId} className="label mt-4">
              Note <span className="font-normal">(optional)</span>
            </label>
            <textarea
              id={noteId}
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX_LENGTH))}
              maxLength={NOTE_MAX_LENGTH}
              rows={3}
              placeholder="Describe the place, not people. Please don't include names or phone numbers."
              className="field resize-none"
            />
            <p className="mt-1 text-right text-[11px] tabular-nums text-ink-500" aria-live="polite">
              {note.length}/{NOTE_MAX_LENGTH}
            </p>

            {/* TODO: render the Cloudflare Turnstile widget here and send its token with the report. */}

            {errorMessage && (
              <p role="alert" className="mt-2 rounded-xl bg-rose-50 p-2.5 text-sm text-rose-900">
                {errorMessage}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <button type="button" onClick={onClose} className="btn-secondary flex-1">
                Cancel
              </button>
              <button type="submit" disabled={mutation.isPending} className="btn-primary flex-1">
                {mutation.isPending && <Spinner />}
                {mutation.isPending ? 'Submitting…' : 'Submit report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

ReportPinDialog.propTypes = {
  location: PropTypes.shape({ lat: PropTypes.number.isRequired, lng: PropTypes.number.isRequired }).isRequired,
  onClose: PropTypes.func.isRequired,
  onPickAgain: PropTypes.func.isRequired,
};
