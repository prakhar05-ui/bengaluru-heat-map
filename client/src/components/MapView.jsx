import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import * as maplibregl from 'maplibre-gl';
import { BENGALURU_CENTER } from '@app/shared';
import { basemapMode, buildMapStyle, ensurePmtilesProtocol } from '../lib/mapStyle.js';
import { MapContext } from './MapContext.js';

/**
 * Full-size MapLibre map. Children (layers, markers) render once the map has
 * loaded and can reach it via useMapContext().
 *
 * @param {Object} props
 * @param {(lngLat: { lat: number, lng: number }) => void} [props.onMapClick]  fired for clicks on the map itself (not markers)
 * @param {string} [props.cursor]  CSS cursor for the map canvas, e.g. "crosshair"
 * @param {{ left?: number }} [props.desktopPadding]  space covered by floating UI on wide screens, so the
 *   map centres in the visible part
 * @param {import('react').ReactNode} [props.children]
 */
export default function MapView({ onMapClick, cursor, desktopPadding, children }) {
  const containerRef = useRef(null);
  const [ctx, setCtx] = useState(null);

  // Keep latest callbacks in refs so the map is created only once.
  const onMapClickRef = useRef(onMapClick);
  const paddingRef = useRef(desktopPadding);
  paddingRef.current = desktopPadding;
  onMapClickRef.current = onMapClick;

  useEffect(() => {
    ensurePmtilesProtocol();
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildMapStyle(),
      center: [BENGALURU_CENTER.lng, BENGALURU_CENTER.lat],
      zoom: window.innerWidth < 768 ? 10 : 10.6,
      minZoom: 9,
      maxZoom: 17,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    const applyPadding = () => {
      const wide = window.matchMedia('(min-width: 768px)').matches;
      map.setPadding({ top: 0, right: 0, bottom: 0, left: wide ? (paddingRef.current?.left ?? 0) : 0 });
    };
    applyPadding();
    window.addEventListener('resize', applyPadding);

    // The basemap style references a few POI icons that its sprite sheet lacks (e.g. "townhall").
    // Give MapLibre an empty image for those instead of logging a warning for each.
    map.setMissingStyleImageResolver((id) => {
      if (!map.hasImage(id)) map.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
    });

    map.on('load', () => setCtx({ map }));
    map.on('click', (e) => {
      // Ignore clicks that land on HTML markers or controls.
      if (e.originalEvent.target !== map.getCanvas()) return;
      onMapClickRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });
    map.on('error', (e) => {
      // Tile/network hiccups are common; log but keep the map usable.
      console.warn('[map]', e.error?.message ?? e);
    });

    return () => {
      window.removeEventListener('resize', applyPadding);
      setCtx(null);
      map.remove();
    };
  }, []);

  useEffect(() => {
    if (ctx) ctx.map.getCanvas().style.cursor = cursor ?? '';
  }, [ctx, cursor]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" aria-label="Map of reported incidents in Bengaluru" role="region" />
      {!ctx && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ink-100/60 text-sm text-ink-500">
          Loading map…
        </div>
      )}
      {basemapMode === 'none' && (
        <p className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-lg bg-white/90 px-2 py-1 text-xs text-ink-500 shadow-card">
          Basemap not configured (set VITE_TILES_URL).
        </p>
      )}
      {ctx && <MapContext.Provider value={ctx}>{children}</MapContext.Provider>}
    </div>
  );
}

MapView.propTypes = {
  onMapClick: PropTypes.func,
  cursor: PropTypes.string,
  desktopPadding: PropTypes.shape({ left: PropTypes.number }),
  children: PropTypes.node,
};
