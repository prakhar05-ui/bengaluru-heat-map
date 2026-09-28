import { useState } from 'react';
import PropTypes from 'prop-types';
import { Phone, Send, Siren } from 'lucide-react';
import { api } from '../api/http.js';
import { Spinner } from './ui.jsx';
import { getCurrentPosition } from '../lib/geo.js';

const LOOKUP_TIMEOUT_MS = 4000;

/** Find the local police station, but never let a slow or failed lookup delay the SOS. */
async function lookupStation(position) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    return (await api.getStationAt(position, controller.signal)).station;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The WhatsApp message: location first (when known), then the local station and 112. */
function sosMessage(position, station) {
  const lines = position
    ? ['I need help. This is my current location:', `https://www.google.com/maps?q=${position.lat.toFixed(6)},${position.lng.toFixed(6)}`]
    : ['I need help. My phone could not share my location. Please call me now.'];
  if (station) {
    lines.push(`Police station for this area: ${station.name}${station.phone ? `, ${station.phone}` : ''}`);
  }
  lines.push('Emergency number: 112');
  return lines.join('\n');
}

/**
 * Share current location (plus the local police station) over WhatsApp.
 * Runs in the browser; the only server call is the optional station lookup.
 *
 * @param {Object} props
 * @param {string} [props.className]
 */
export default function SosButton({ className = '' }) {
  const [state, setState] = useState({ status: 'idle', message: null });

  /** Open WhatsApp with the message (position may be null). */
  const send = async (position) => {
    const station = position ? await lookupStation(position) : null;
    const url = `https://wa.me/?text=${encodeURIComponent(sosMessage(position, station))}`;
    // Don't pass "noopener" to window.open: browsers then return null even on success, which
    // would trigger the fallback and navigate this tab away. Detach the opener manually instead.
    // If a pop-up blocker stops the new tab (possible after the async steps above), navigate here.
    const win = window.open(url, '_blank');
    if (win) win.opener = null;
    else window.location.href = url;
    setState({ status: 'idle', message: null });
  };

  const share = async () => {
    setState({ status: 'locating', message: null });
    try {
      await send(await getCurrentPosition());
    } catch (err) {
      setState({ status: 'error', message: err.message });
    }
  };

  return (
    <div className={`flex flex-col items-end gap-2 ${className}`}>
      <div className="flex gap-2">
        <a
          href="tel:112"
          className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2.5 text-sm font-semibold text-rose-700 shadow-float ring-1 ring-rose-100 hover:bg-rose-50"
        >
          <Phone aria-hidden="true" className="h-4 w-4" />
          112
        </a>
        <button
          type="button"
          onClick={share}
          disabled={state.status === 'locating'}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-b from-rose-500 to-rose-600 px-4 py-2.5 text-sm font-bold text-white shadow-float ring-1 ring-rose-700/20 hover:from-rose-600 hover:to-rose-700 disabled:opacity-80"
        >
          {state.status === 'locating' ? <Spinner /> : <Siren aria-hidden="true" className="h-4 w-4" />}
          {state.status === 'locating' ? 'Locating…' : 'SOS · Share location'}
        </button>
      </div>
      {state.status === 'error' && (
        <div role="alert" className="w-72 rounded-2xl bg-white p-3 text-xs text-ink-700 shadow-float ring-1 ring-rose-100">
          <p>{state.message}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => send(null)} className="btn flex-1 bg-rose-600 px-2 py-1.5 text-xs text-white hover:bg-rose-700">
              <Send aria-hidden="true" className="h-3.5 w-3.5" />
              Send without location
            </button>
            <button type="button" onClick={share} className="btn-secondary px-2 py-1.5 text-xs">
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

SosButton.propTypes = { className: PropTypes.string };
