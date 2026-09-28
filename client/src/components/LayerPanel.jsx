import { useId, useState } from 'react';
import PropTypes from 'prop-types';
import { Info } from 'lucide-react';
import { iconDataUrl } from '../lib/layerStyles.js';
import { Spinner, Switch } from './ui.jsx';

const GROUPS = [
  { id: 'help', title: 'Help nearby', subtitle: 'Places you can go to or call' },
  { id: 'other', title: 'Surroundings', subtitle: 'Infrastructure data; not a safety rating' },
];

function LayerRow({ layer, checked, loading, error, onToggle, children }) {
  const [showInfo, setShowInfo] = useState(false);
  const labelId = useId();
  const infoId = useId();
  return (
    <li className="py-2.5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-50 ring-1 ring-ink-100">
          {layer.kind === 'point' ? (
            <img src={iconDataUrl(layer.id)} alt="" aria-hidden="true" className="h-5 w-5" />
          ) : (
            <span aria-hidden="true" className="h-4 w-5 rounded bg-gradient-to-r from-[#fdf0c4] to-[#7a5000]" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p id={labelId} className="text-sm font-medium text-ink-900">
            {layer.label}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-ink-500">
            {layer.count.toLocaleString('en-IN')} {layer.kind === 'fill' ? 'wards' : 'places'}
            {loading && (
              <>
                <span aria-hidden="true">·</span>
                <Spinner className="h-3 w-3" /> loading
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowInfo((s) => !s)}
          aria-expanded={showInfo}
          aria-controls={infoId}
          aria-label={`About the ${layer.label} data`}
          className={`rounded-lg p-1.5 transition-colors ${showInfo ? 'bg-brand-50 text-brand-600' : 'text-ink-500 hover:bg-ink-100'}`}
        >
          <Info aria-hidden="true" className="h-4 w-4" />
        </button>
        <Switch checked={checked} onChange={() => onToggle(layer.id)} label={`Show ${layer.label}`} />
      </div>
      {showInfo && (
        <div id={infoId} className="ml-12 mt-2 rounded-xl bg-ink-50 p-3 text-xs text-ink-700">
          <p>{layer.caveat}</p>
          <p className="mt-1.5 text-ink-500">
            <a href={layer.source.url} target="_blank" rel="noreferrer" className="font-medium text-brand-700 underline underline-offset-2">
              {layer.source.name}
            </a>
            {' · '}
            {layer.source.licence}
            {' · '}downloaded {new Date(layer.downloadedAt).toLocaleDateString('en-IN')}
          </p>
        </div>
      )}
      {error && <p className="ml-12 mt-1 text-xs text-rose-900">Could not load this layer. {error}</p>}
      {checked && children}
    </li>
  );
}
LayerRow.propTypes = {
  layer: PropTypes.object.isRequired,
  checked: PropTypes.bool.isRequired,
  loading: PropTypes.bool,
  error: PropTypes.string,
  onToggle: PropTypes.func.isRequired,
  children: PropTypes.node,
};

/**
 * Toggle list for the map's optional layers, grouped, with provenance per layer.
 *
 * @param {Object} props
 * @param {Array<Object>} props.layers                  catalogue from /api/layers
 * @param {Set<string>} props.enabled
 * @param {(id: string) => void} props.onToggle
 * @param {Record<string, { loading: boolean, error?: string }>} props.status
 * @param {Array<{ min: number, max: number, color: string }>} props.streetlightClasses
 */
export default function LayerPanel({ layers, enabled, onToggle, status, streetlightClasses }) {
  return (
    <div className="space-y-4">
      {GROUPS.map((group) => {
        const items = layers.filter((l) => l.group === group.id);
        if (!items.length) return null;
        return (
          <section key={group.id} className="card py-3" aria-labelledby={`layers-${group.id}`}>
            <h3 id={`layers-${group.id}`} className="eyebrow">
              {group.title}
            </h3>
            <p className="text-xs text-ink-500">{group.subtitle}</p>
            {group.id === 'help' && (
              <div className="mt-2 flex items-center gap-3 border-b border-ink-100 pb-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink-50 ring-1 ring-ink-100">
                  <img src={iconDataUrl('police')} alt="" aria-hidden="true" className="h-5 w-5" />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium">Police stations</p>
                  <p className="text-xs text-ink-500">Always shown · tap any area for its station</p>
                </div>
              </div>
            )}
            <ul className="divide-y divide-ink-100">
              {items.map((layer) => (
                <LayerRow
                  key={layer.id}
                  layer={layer}
                  checked={enabled.has(layer.id)}
                  loading={status[layer.id]?.loading}
                  error={status[layer.id]?.error}
                  onToggle={onToggle}
                >
                  {layer.id === 'streetlights' && streetlightClasses.length > 0 && (
                    <div className="ml-12 mt-2">
                      <div className="flex overflow-hidden rounded-md">
                        {streetlightClasses.map((c) => (
                          <span key={c.min} className="h-2 flex-1" style={{ background: c.color }} aria-hidden="true" />
                        ))}
                      </div>
                      <div className="mt-1 flex justify-between text-[11px] text-ink-500">
                        {streetlightClasses.map((c) => (
                          <span key={c.min}>{Math.round(c.min)}</span>
                        ))}
                        <span>{Math.round(streetlightClasses[streetlightClasses.length - 1].max)}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-ink-500">Streetlights per km of road, by ward</p>
                    </div>
                  )}
                </LayerRow>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

LayerPanel.propTypes = {
  layers: PropTypes.array.isRequired,
  enabled: PropTypes.instanceOf(Set).isRequired,
  onToggle: PropTypes.func.isRequired,
  status: PropTypes.object.isRequired,
  streetlightClasses: PropTypes.array.isRequired,
};
