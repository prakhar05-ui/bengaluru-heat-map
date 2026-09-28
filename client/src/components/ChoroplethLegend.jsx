import PropTypes from 'prop-types';
import { NO_DATA_COLOR } from '../lib/constants.js';
import { formatRange } from '../lib/choropleth.js';

/**
 * Legend for the station-area choropleth: one swatch per class, plus "No data".
 *
 * @param {Object} props
 * @param {Array<{ min: number, max: number, color: string }>} props.classes
 * @param {string} props.caption   e.g. "Reported incidents, 2019–2024, all types"
 */
export default function ChoroplethLegend({ classes, caption }) {
  return (
    <figure>
      <figcaption className="text-xs font-medium text-ink-700">{caption}</figcaption>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-700">
        {classes.map((c) => (
          <li key={c.min} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-3 w-5 rounded-sm" style={{ background: c.color }} />
            {formatRange(c)}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-3 w-5 rounded-sm border border-dashed border-ink-500"
            style={{ background: NO_DATA_COLOR }}
          />
          No data
        </li>
      </ul>
    </figure>
  );
}

ChoroplethLegend.propTypes = {
  classes: PropTypes.arrayOf(
    PropTypes.shape({ min: PropTypes.number, max: PropTypes.number, color: PropTypes.string }),
  ).isRequired,
  caption: PropTypes.string.isRequired,
};
