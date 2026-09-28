import { useState } from 'react';
import PropTypes from 'prop-types';
import { REPORT_CATEGORY_LABELS } from '@app/shared';
import MapMarker from './MapMarker.jsx';

/**
 * Approved community reports, plus the draft pin while a user is reporting.
 *
 * @param {Object} props
 * @param {Array<{ id: string, lat: number, lng: number, category: string, note?: string, createdAt: string }>} props.reports
 * @param {{ lat: number, lng: number } | null} [props.draftPin]
 */
export default function ReportPins({ reports, draftPin }) {
  const [openId, setOpenId] = useState(null);

  return (
    <>
      {reports.map((r) => (
        <MapMarker key={r.id} lng={r.lng} lat={r.lat}>
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpenId((id) => (id === r.id ? null : r.id));
              }}
              aria-expanded={openId === r.id}
              aria-label={`Community report: ${REPORT_CATEGORY_LABELS[r.category]}`}
              className="h-4 w-4 rounded-full border-2 border-white bg-violet-700 shadow focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-300"
            />
            {openId === r.id && (
              <div className="absolute bottom-6 left-1/2 w-56 -translate-x-1/2 rounded-md bg-white p-2 text-xs text-ink-900 shadow-lg">
                <p className="font-semibold">{REPORT_CATEGORY_LABELS[r.category]}</p>
                {r.note && <p className="mt-1 text-ink-700">{r.note}</p>}
                <p className="mt-1 text-ink-500">
                  Community report · {new Date(r.createdAt).toLocaleDateString('en-IN')}
                </p>
              </div>
            )}
          </div>
        </MapMarker>
      ))}
      {draftPin && (
        <MapMarker lng={draftPin.lng} lat={draftPin.lat} anchor="bottom">
          <svg aria-label="Selected location" role="img" viewBox="0 0 24 32" className="h-8 w-6 drop-shadow">
            <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0Z" fill="#2a78d6" />
            <circle cx="12" cy="12" r="4.5" fill="#fff" />
          </svg>
        </MapMarker>
      )}
    </>
  );
}

ReportPins.propTypes = {
  reports: PropTypes.array.isRequired,
  draftPin: PropTypes.shape({ lat: PropTypes.number, lng: PropTypes.number }),
};
