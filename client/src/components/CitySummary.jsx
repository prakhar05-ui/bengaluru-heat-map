import { Link } from 'react-router';
import { ArrowUpRight, ChartColumn } from 'lucide-react';
import { INCIDENT_TYPES, INCIDENT_TYPE_LABELS } from '@app/shared';
import { useTrendsMany } from '../api/queries.js';
import { SectionHeader } from './ui.jsx';
import { Loading } from './StatusMessage.jsx';

/** Latest official city-wide figures by offence, with a link to the Trends page. */
export default function CitySummary() {
  const queries = useTrendsMany(INCIDENT_TYPES.map((type) => ({ type })));
  if (queries.some((q) => q.isPending)) return <Loading label="Loading official figures…" />;
  if (queries.some((q) => q.isError)) return null;

  const years = queries.flatMap((q) => q.data.points.filter((p) => p.count !== null).map((p) => p.year));
  if (!years.length) return null;
  const latest = Math.max(...years);

  return (
    <section className="card" aria-labelledby="city-summary-heading">
      <SectionHeader
        id="city-summary-heading"
        icon={ChartColumn}
        title={`Reported in Bengaluru City, ${latest}`}
        subtitle="Official city-wide police figures. No per-station figures are published."
      />
      <dl className="mt-3 grid grid-cols-3 gap-2">
        {INCIDENT_TYPES.map((type, i) => {
          const count = queries[i].data.points.find((p) => p.year === latest)?.count ?? null;
          return (
            <div key={type} className="rounded-xl bg-ink-50 p-2.5">
              <dt className="text-[11px] font-medium leading-tight text-ink-500">{INCIDENT_TYPE_LABELS[type]}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-ink-900">
                {count === null ? <span className="text-xs font-normal text-ink-500">no figure</span> : count.toLocaleString('en-IN')}
              </dd>
            </div>
          );
        })}
      </dl>
      <Link to="/trends" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
        Yearly trends and sources
        <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}
