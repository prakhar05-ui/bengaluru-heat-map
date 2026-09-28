import PropTypes from 'prop-types';
import { useMeta } from '../api/queries.js';

/**
 * Where the numbers and shapes come from.
 *
 * @param {Object} props
 * @param {'station'|'city'} [props.scope]   'city' describes the official city-wide figures
 * @param {boolean} [props.showBoundaries]   describe where the area boundaries come from (map only)
 */
export default function DataNotice({ scope = 'station', showBoundaries = false }) {
  const { data: meta, isError } = useMeta();
  if (isError || !meta) return null;

  if (scope === 'city') {
    const sources = meta.cityCounts?.sources ?? [];
    return (
      <div className="rounded-2xl border border-brand-100 bg-brand-50 p-3 text-xs text-ink-700">
        <p>
          <span className="mr-1.5 rounded-md bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            Official figures
          </span>
          {sources.length ? (
            <>
              Reported cases for {meta.cityCounts.area}:{' '}
              {sources.map((s, i) => (
                <span key={s.table}>
                  {i > 0 && '; '}
                  <a href={s.url} target="_blank" rel="noreferrer" className="font-medium text-brand-700 underline underline-offset-2">
                    {s.publisher}
                  </a>{' '}
                  ({s.years.join(', ')})
                </span>
              ))}
              , via OpenCity.
            </>
          ) : (
            'No city-wide figures have been imported yet.'
          )}
        </p>
      </div>
    );
  }

  const imported = meta.counts.source === 'imported';
  return (
    <div className="rounded-2xl bg-ink-100/70 p-3 text-xs text-ink-700">
      {imported ? (
        <p>
          <span className="font-medium text-ink-900">Per-station figures:</span> {meta.counts.label}
          {meta.counts.importedAt && ` · imported ${new Date(meta.counts.importedAt).toLocaleDateString('en-IN')}`}
          {` · ${meta.counts.stationsWithData} of ${meta.stations.count} stations have data`}
        </p>
      ) : (
        scope === 'station' &&
        !showBoundaries && (
          <p>
            <span className="font-medium text-ink-900">No per-station figures are published.</span> Bengaluru City
            Police release city-wide totals only; choose "Bengaluru City" above for official figures.
          </p>
        )
      )}
      {showBoundaries && <p className={imported ? 'mt-1.5' : undefined}>{meta.boundaries.label}</p>}
      <p className="mt-1.5 text-ink-500">{meta.stations.attribution}</p>
    </div>
  );
}

DataNotice.propTypes = {
  scope: PropTypes.oneOf(['station', 'city']),
  showBoundaries: PropTypes.bool,
};
