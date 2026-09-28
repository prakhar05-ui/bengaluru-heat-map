import PropTypes from 'prop-types';
import { INCIDENT_TYPES, INCIDENT_TYPE_LABELS } from '@app/shared';
import { YEARS } from '../lib/constants.js';

const selectClass = 'field mt-1';

/**
 * Year range + incident type filters.
 *
 * @param {Object} props
 * @param {{ yearFrom: number, yearTo: number, type: string }} props.value   type '' means all types
 * @param {(next: { yearFrom: number, yearTo: number, type: string }) => void} props.onChange
 */
export default function FilterBar({ value, onChange }) {
  const setYearFrom = (yearFrom) => onChange({ ...value, yearFrom, yearTo: Math.max(yearFrom, value.yearTo) });
  const setYearTo = (yearTo) => onChange({ ...value, yearTo, yearFrom: Math.min(yearTo, value.yearFrom) });

  return (
    <fieldset className="grid grid-cols-3 gap-2">
      <legend className="sr-only">Filter reported incidents</legend>
      <label className="text-xs font-medium text-ink-500">
        From
        <select className={selectClass} value={value.yearFrom} onChange={(e) => setYearFrom(Number(e.target.value))}>
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-ink-500">
        To
        <select className={selectClass} value={value.yearTo} onChange={(e) => setYearTo(Number(e.target.value))}>
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-ink-500">
        Type
        <select className={selectClass} value={value.type} onChange={(e) => onChange({ ...value, type: e.target.value })}>
          <option value="">All types</option>
          {INCIDENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {INCIDENT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  );
}

FilterBar.propTypes = {
  value: PropTypes.shape({
    yearFrom: PropTypes.number.isRequired,
    yearTo: PropTypes.number.isRequired,
    type: PropTypes.string.isRequired,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
};
