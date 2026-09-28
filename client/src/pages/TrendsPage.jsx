import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import PropTypes from 'prop-types';
import { INCIDENT_TYPES, INCIDENT_TYPE_LABELS, INCIDENT_TYPE_SECTIONS } from '@app/shared';
import { useMeta, useStations, useTrends, useTrendsMany } from '../api/queries.js';
import DataNotice from '../components/DataNotice.jsx';
import StationSelect from '../components/StationSelect.jsx';
import { EmptyState, ErrorState, Loading } from '../components/StatusMessage.jsx';
import TrendSparkline from '../components/TrendSparkline.jsx';
import { SERIES_COLOR } from '../lib/constants.js';
import { Scale, Shapes } from 'lucide-react';
import { SectionHeader } from '../components/ui.jsx';

const selectClass = 'field';

/** Two yearly totals are comparable only if the same offence types are included in both. */
const sameTypes = (a, b) => (a.missingTypes ?? []).join() === (b.missingTypes ?? []).join();
const typeList = (types) => types.map((t) => INCIDENT_TYPE_LABELS[t].toLowerCase()).join(', ');

/** Change vs previous year as text. Either side null (no data) -> em dash. */
function formatChange(prev, curr) {
  if (prev === null || prev === undefined || curr === null) return '—';
  if (prev === 0) return curr === 0 ? 'no change' : 'new (none prior year)';
  const pct = Math.round(((curr - prev) / prev) * 100);
  if (pct === 0) return 'no change';
  return `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%`;
}

function BarTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { year, count, change, missingTypes, sourceLabel } = payload[0].payload;
  return (
    <div className="rounded-xl border border-ink-100 bg-white px-3 py-2 text-xs text-ink-900 shadow-float">
      <p className="font-semibold">{year}</p>
      <p>{count === null ? 'No data' : `${count.toLocaleString('en-IN')} reported cases`}</p>
      {missingTypes && <p className="text-ink-700">Excludes {typeList(missingTypes)} (no figure)</p>}
      {count !== null && change && <p className="text-ink-700">vs previous year: {change}</p>}
      {sourceLabel && <p className="text-ink-500">Source: {sourceLabel}</p>}
    </div>
  );
}
BarTooltip.propTypes = { active: PropTypes.bool, payload: PropTypes.array };

function StatTile({ label, value, sub }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-ink-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-500">{sub}</p>}
    </div>
  );
}
StatTile.propTypes = { label: PropTypes.string.isRequired, value: PropTypes.node.isRequired, sub: PropTypes.string };

export default function TrendsPage() {
  const [stationId, setStationId] = useState('');
  const [type, setType] = useState('');

  const stations = useStations();
  const meta = useMeta();
  const trends = useTrends({ stationId: stationId || undefined, type: type || undefined });
  const byType = useTrendsMany(INCIDENT_TYPES.map((t) => ({ stationId: stationId || undefined, type: t })));

  const isCity = trends.data?.scope === 'city';
  const sources = meta.data?.cityCounts?.sources ?? [];
  const rows = useMemo(
    () =>
      (trends.data?.points ?? []).map((p, i, arr) => {
        const prevPoint = i > 0 ? arr[i - 1] : undefined;
        const change = !prevPoint
          ? undefined
          : sameTypes(prevPoint, p)
            ? formatChange(prevPoint.count, p.count)
            : 'not comparable (different offences included)';
        const src = p.source !== undefined ? sources[p.source] : undefined;
        return { ...p, change, sourceLabel: src && `${src.publisher}, ${src.table}` };
      }),
    [trends.data, sources],
  );
  const covered = rows.filter((r) => r.count !== null);
  const total = covered.reduce((s, r) => s + r.count, 0);
  const latest = covered[covered.length - 1];
  const beforeLatest = rows.find((r) => r.year === latest?.year - 1);
  const missingYears = rows.filter((r) => r.count === null).map((r) => r.year);
  const partialYears = rows.filter((r) => r.missingTypes);
  const scopeName = stationId
    ? stations.data?.features.find((f) => f.properties.id === stationId)?.properties.name ?? 'Selected station'
    : 'Bengaluru City';
  const typeYMax = Math.max(1, ...byType.flatMap((q) => q.data?.points.map((p) => p.count ?? 0) ?? []));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 md:px-6">
        <div>
          <p className="eyebrow">Official figures</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">Year-over-year reported incidents</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-500">
            Changes can reflect reporting behaviour (awareness, access to police, trust) as much as underlying events.
          </p>
        </div>

        <DataNotice scope={stationId ? 'station' : 'city'} />

        {/* Filters: one row above the charts */}
        <div className="card grid gap-3 sm:grid-cols-2">
          <StationSelect
            stations={stations.data?.features ?? []}
            value={stationId}
            onChange={setStationId}
            label="Police station"
            emptyLabel="Bengaluru City (official city-wide figures)"
            allowEmpty
            disabled={stations.isPending || stations.isError}
          />
          <label className="label mb-0">
            <span className="mb-1 block">Offence</span>
            <select className={selectClass} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All types</option>
              {INCIDENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {INCIDENT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
        </div>
        {stations.isError && <ErrorState message={`Police stations: ${stations.error.message}`} onRetry={stations.refetch} />}

        {trends.isPending ? (
          <Loading label="Loading trends…" />
        ) : trends.isError ? (
          <ErrorState message={trends.error.message} onRetry={trends.refetch} />
        ) : covered.length === 0 ? (
          <EmptyState>
            {isCity
              ? 'No official figures for this selection.'
              : 'No figures for this police station. Bengaluru City Police publish city-wide totals only; if you obtain station-wise figures (e.g. through RTI), import them with the CSV import script.'}
          </EmptyState>
        ) : (
          <div className={`space-y-4 ${trends.isFetching ? 'opacity-60' : ''}`}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatTile
                label={`Total reported, ${covered[0].year}–${latest.year}`}
                value={total.toLocaleString('en-IN')}
                sub={missingYears.length || partialYears.length ? 'some years or offences have no figure' : undefined}
              />
              <StatTile label={`Reported in ${latest.year}`} value={latest.count.toLocaleString('en-IN')} />
              {(() => {
                const comparable = beforeLatest && beforeLatest.count !== null && sameTypes(beforeLatest, latest);
                return (
                  <StatTile
                    label={`${latest.year} vs ${latest.year - 1}`}
                    value={comparable ? formatChange(beforeLatest.count, latest.count) : '—'}
                    sub={
                      !beforeLatest || beforeLatest.count === null
                        ? 'no data for previous year'
                        : comparable
                          ? `${beforeLatest.count.toLocaleString('en-IN')} → ${latest.count.toLocaleString('en-IN')}`
                          : `not comparable: ${latest.year} has no figure for ${typeList(latest.missingTypes ?? beforeLatest.missingTypes)}`
                    }
                  />
                );
              })()}
            </div>

            <section className="card p-5">
              <h3 className="text-base font-semibold">
                {scopeName} · {type ? INCIDENT_TYPE_LABELS[type] : 'All types'}
              </h3>
              <p className="text-xs text-ink-700">
                Reported cases per year{isCity ? ' · official figures' : ' · imported per-station figures'}
              </p>
              <div className="mt-3 h-64" role="img" aria-label={`Bar chart of reported incidents per year for ${scopeName}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barCategoryGap="30%">
                    <CartesianGrid vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: '#cbd5e1' }} tick={{ fill: '#475569', fontSize: 12 }} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: '#475569', fontSize: 12 }} />
                    <Tooltip content={<BarTooltip />} cursor={{ fill: '#f1f5f9' }} />
                    <Bar dataKey="count" fill={SERIES_COLOR} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {missingYears.length > 0 && (
                <p className="mt-2 text-xs text-ink-700">No data for {missingYears.join(', ')} (not the same as zero).</p>
              )}
              {partialYears.map((r) => (
                <p key={r.year} className="mt-1 text-xs text-ink-700">
                  {r.year} total excludes {typeList(r.missingTypes)}: no figure was published for that year.
                </p>
              ))}

              {/* Table view for accessibility and exact values */}
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-brand-700">Show as table</summary>
                <div className="overflow-x-auto">
                  <table className="mt-2 w-full text-left text-sm">
                    <thead className="text-xs text-ink-500">
                      <tr>
                        <th className="py-1 font-medium">Year</th>
                        <th className="py-1 font-medium">Reported incidents</th>
                        <th className="py-1 font-medium">Change vs previous year</th>
                        {isCity && <th className="py-1 font-medium">Source</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.year} className="border-t border-ink-100">
                          <td className="py-1">{r.year}</td>
                          <td className="py-1 tabular-nums">
                            {r.count === null ? 'No data' : r.count.toLocaleString('en-IN')}
                            {r.missingTypes && '*'}
                          </td>
                          <td className="py-1 text-ink-700">{r.change ?? '—'}</td>
                          {isCity && <td className="py-1 text-ink-700">{r.sourceLabel ?? '—'}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>
          </div>
        )}

        {/* Small multiples by type, shared y-scale */}
        <section className="card p-5">
          <SectionHeader icon={Shapes} tone="ink" title="By offence" subtitle={`${scopeName} · same scale across offences · gaps are years with no figure`} />
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {INCIDENT_TYPES.map((t, i) => {
              const q = byType[i];
              const pts = q.data?.points ?? [];
              const has = pts.some((p) => p.count !== null);
              const sum = pts.reduce((s, p) => s + (p.count ?? 0), 0);
              return (
                <div key={t} className="rounded-xl bg-ink-50 p-3">
                  <p className="text-xs font-medium text-ink-900">
                    {INCIDENT_TYPE_LABELS[t]}{' '}
                    <span className="font-normal text-ink-500">· {q.data ? (has ? sum : 'no data') : '…'}</span>
                  </p>
                  {q.isPending ? (
                    <div className="h-16" />
                  ) : q.isError ? (
                    <p className="h-16 text-xs text-rose-900">Could not load.</p>
                  ) : (
                    <TrendSparkline
                      points={pts}
                      yMax={typeYMax}
                      ariaLabel={`${INCIDENT_TYPE_LABELS[t]} reported per year: ${pts
                        .map((p) => `${p.year} ${p.count ?? 'no data'}`)
                        .join(', ')}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <dl className="mt-4 space-y-1 border-t border-ink-100 pt-4 text-xs text-ink-700">
            <p className="flex items-center gap-1.5 font-semibold text-ink-900">
              <Scale aria-hidden="true" className="h-3.5 w-3.5" /> Legal sections
            </p>
            {INCIDENT_TYPES.map((t) => (
              <div key={t}>
                <dt className="inline font-medium text-ink-700">{INCIDENT_TYPE_LABELS[t]}:</dt>{' '}
                <dd className="inline">{INCIDENT_TYPE_SECTIONS[t]}</dd>
              </div>
            ))}
            <p className="pt-1">
              New criminal laws (BNS) replaced the IPC on 1 July 2024; these offences map one-to-one, so 2024 figures
              can combine both.
            </p>
          </dl>
        </section>
      </div>
    </div>
  );
}
