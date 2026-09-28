import PropTypes from 'prop-types';
import { INCIDENT_TYPE_LABELS } from '@app/shared';
import { useTrends } from '../api/queries.js';
import { EmptyState, ErrorState, Loading } from './StatusMessage.jsx';
import TrendSparkline from './TrendSparkline.jsx';

/**
 * Yearly reported-incident sparkline for one police station.
 *
 * @param {Object} props
 * @param {{ id: string, name: string }} props.station
 * @param {string} props.type     '' for all types
 * @param {() => void} props.onClose
 */
export default function StationTrend({ station, type, onClose }) {
  const { data, isPending, isError, error, refetch, isFetching } = useTrends({
    stationId: station.id,
    type: type || undefined,
  });

  const points = data?.points ?? [];
  const covered = points.filter((p) => p.count !== null);
  const total = covered.reduce((sum, p) => sum + p.count, 0);
  const first = covered[0];
  const last = covered[covered.length - 1];

  return (
    <section className="rounded-lg border border-ink-100 bg-white p-3" aria-labelledby="station-trend-heading">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 id="station-trend-heading" className="text-sm font-semibold">
            {station.name}
          </h3>
          <p className="text-xs text-ink-700">
            {type ? INCIDENT_TYPE_LABELS[type] : 'All types'} · yearly reported incidents
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-ink-500 hover:bg-ink-100 hover:text-ink-900"
          aria-label="Close station trend"
        >
          ✕
        </button>
      </div>

      <div className="mt-2">
        {isPending ? (
          <Loading />
        ) : isError ? (
          <ErrorState message={error.message} onRetry={refetch} />
        ) : covered.length === 0 ? (
          <EmptyState>No data for this station yet.</EmptyState>
        ) : (
          <div className={isFetching ? 'opacity-60' : undefined}>
            <TrendSparkline
              points={points}
              ariaLabel={`Reported incidents per year at ${station.name}: ${points
                .map((p) => `${p.year} ${p.count ?? 'no data'}`)
                .join(', ')}`}
            />
            <div className="mt-1 flex justify-between text-xs text-ink-700">
              <span>
                {first.year}: {first.count}
              </span>
              <span>{total} total</span>
              <span>
                {last.year}: {last.count}
              </span>
            </div>
            {covered.length < points.length && (
              <p className="mt-1 text-xs text-ink-500">
                Data for {covered.length} of {points.length} years; gaps are years with no data.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

StationTrend.propTypes = {
  station: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
  }).isRequired,
  type: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};
