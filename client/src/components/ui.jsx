// Small shared UI primitives. Styling tokens live in tailwind.config.js / index.css.
import { useId } from 'react';
import PropTypes from 'prop-types';
import { LoaderCircle } from 'lucide-react';

/** Segmented tabs (ARIA tablist). */
export function Tabs({ tabs, value, onChange, label }) {
  return (
    <div role="tablist" aria-label={label} className="flex rounded-xl bg-ink-100 p-1">
      {tabs.map(({ id, label: text, icon: Icon }) => {
        const selected = id === value;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={selected}
            aria-controls={`panel-${id}`}
            onClick={() => onChange(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-all ${
              selected ? 'bg-white text-ink-900 shadow-card' : 'text-ink-500 hover:text-ink-900'
            }`}
          >
            {Icon && <Icon aria-hidden="true" className="h-4 w-4" />}
            {text}
          </button>
        );
      })}
    </div>
  );
}
Tabs.propTypes = {
  tabs: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.string, label: PropTypes.string, icon: PropTypes.elementType })).isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
};

/** Accessible on/off switch. */
export function Switch({ checked, onChange, label, id }) {
  const fallback = useId();
  return (
    <button
      id={id ?? fallback}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-brand-600' : 'bg-ink-300'
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
      />
    </button>
  );
}
Switch.propTypes = { checked: PropTypes.bool.isRequired, onChange: PropTypes.func.isRequired, label: PropTypes.string.isRequired, id: PropTypes.string };

/** Card heading with an icon badge. */
export function SectionHeader({ icon: Icon, title, subtitle, action, tone = 'brand', id }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    rose: 'bg-rose-50 text-rose-600',
    ink: 'bg-ink-100 text-ink-700',
  };
  return (
    <div className="flex items-start gap-3">
      {Icon && (
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h3 id={id} className="text-[15px] font-semibold leading-tight text-ink-900">
          {title}
        </h3>
        {subtitle && <p className="mt-0.5 text-xs leading-snug text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
SectionHeader.propTypes = {
  icon: PropTypes.elementType,
  title: PropTypes.node.isRequired,
  subtitle: PropTypes.node,
  action: PropTypes.node,
  tone: PropTypes.oneOf(['brand', 'rose', 'ink']),
  id: PropTypes.string,
};

export function Spinner({ className = 'h-4 w-4' }) {
  return <LoaderCircle aria-hidden="true" className={`animate-spin ${className}`} />;
}
Spinner.propTypes = { className: PropTypes.string };
