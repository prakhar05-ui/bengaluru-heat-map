import PropTypes from 'prop-types';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SERIES_COLOR } from '../lib/constants.js';

function SparkTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { year, count } = payload[0].payload;
  return (
    <div className="rounded border border-ink-100 bg-white px-2 py-1 text-xs text-ink-900 shadow">
      <span className="font-semibold">{year}</span>: {count === null ? 'No data' : `${count} reported`}
    </div>
  );
}
SparkTooltip.propTypes = { active: PropTypes.bool, payload: PropTypes.array };

/**
 * Compact yearly trend line with hover tooltip. Years with no data (null) are
 * left as gaps, never drawn as zero.
 *
 * @param {Object} props
 * @param {Array<{ year: number, count: number|null }>} props.points
 * @param {number} [props.height]
 * @param {number} [props.yMax]      shared y-domain max for small multiples
 * @param {string} props.ariaLabel
 */
export default function TrendSparkline({ points, height = 64, yMax, ariaLabel }) {
  return (
    <div style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
          <XAxis dataKey="year" hide />
          <YAxis hide domain={[0, yMax ?? 'dataMax']} />
          <Tooltip content={<SparkTooltip />} cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }} />
          <Line
            type="linear"
            dataKey="count"
            stroke={SERIES_COLOR}
            strokeWidth={2}
            connectNulls={false}
            dot={{ r: 2, fill: SERIES_COLOR, strokeWidth: 0 }}
            activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

TrendSparkline.propTypes = {
  points: PropTypes.arrayOf(PropTypes.shape({ year: PropTypes.number, count: PropTypes.number })).isRequired,
  height: PropTypes.number,
  yMax: PropTypes.number,
  ariaLabel: PropTypes.string.isRequired,
};
