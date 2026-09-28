import PropTypes from 'prop-types';
import { Mail, MapPin, Navigation, Phone, Shield, Siren, X } from 'lucide-react';
import { distanceKm, telHref } from '../lib/geo.js';

/**
 * The police station responsible for a chosen spot: phone, email, directions.
 *
 * @param {Object} props
 * @param {{ id: string, name: string, phone?: string, email?: string, division?: string, subdivision?: string }} props.station
 * @param {[number, number]} props.coordinates     station [lng, lat]
 * @param {{ lat: number, lng: number } | null} [props.from]  the user's location, for distance
 * @param {() => void} props.onClose
 * @param {import('react').ReactNode} [props.children]  extra content (e.g. imported yearly figures)
 */
export default function PoliceStationCard({ station, coordinates, from, onClose, children }) {
  const [lng, lat] = coordinates;
  const km = from ? distanceKm(from, { lat, lng }) : null;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  const name = station.name.replace(/ Police Station$/, '');

  return (
    <section className="card overflow-hidden p-0" aria-labelledby="station-card-heading">
      <div className="bg-gradient-to-br from-ink-900 to-ink-700 p-4 text-white">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
            <Shield aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">Police station for this area</p>
            <h3 id="station-card-heading" className="text-base font-semibold leading-tight">
              {name} <span className="font-normal text-white/70">Police Station</span>
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
            aria-label="Close police station details"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
          {station.division && <span className="rounded-full bg-white/10 px-2 py-0.5">{station.division} division</span>}
          {station.subdivision && <span className="rounded-full bg-white/10 px-2 py-0.5">{station.subdivision} sub-division</span>}
          {km !== null && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5">
              <MapPin aria-hidden="true" className="h-3 w-3" />
              {km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`} away
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2 p-4">
        {station.phone ? (
          <a href={telHref(station.phone)} className="btn-primary w-full py-3 text-[15px]">
            <Phone aria-hidden="true" className="h-4 w-4" />
            Call station · {station.phone}
          </a>
        ) : (
          <p className="rounded-xl bg-ink-100 p-3 text-xs text-ink-700">
            No phone number is listed for this station (it is outside Bengaluru City Police). In an emergency, call 112.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <a href={directions} target="_blank" rel="noreferrer" className="btn-secondary">
            <Navigation aria-hidden="true" className="h-4 w-4" />
            Directions
          </a>
          <a href="tel:112" className="btn-danger-outline">
            <Siren aria-hidden="true" className="h-4 w-4" />
            Call 112
          </a>
        </div>
        {station.email && (
          <a href={`mailto:${station.email}`} className="flex items-center gap-2 rounded-lg px-1 py-1 text-xs text-ink-700 hover:text-brand-700">
            <Mail aria-hidden="true" className="h-3.5 w-3.5 text-ink-500" />
            {station.email}
          </a>
        )}
        <p className="pt-1 text-[11px] leading-snug text-ink-500">
          Contacts: Bengaluru City Police via OpenCity · Boundaries: KGIS. Numbers can change; in an emergency always
          use 112.
        </p>
        {children}
      </div>
    </section>
  );
}

PoliceStationCard.propTypes = {
  station: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    phone: PropTypes.string,
    email: PropTypes.string,
    division: PropTypes.string,
    subdivision: PropTypes.string,
  }).isRequired,
  coordinates: PropTypes.arrayOf(PropTypes.number).isRequired,
  from: PropTypes.shape({ lat: PropTypes.number, lng: PropTypes.number }),
  onClose: PropTypes.func.isRequired,
  children: PropTypes.node,
};
