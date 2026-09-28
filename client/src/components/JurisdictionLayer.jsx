import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import * as maplibregl from 'maplibre-gl';
import { useMapContext } from './MapContext.js';
import { POINT_LAYER_PREFIX } from './MapLayers.jsx';
import { iconImage } from '../lib/layerStyles.js';

const JUR = 'jurisdictions';
const STN = 'stations';
const LAYERS = ['jur-fill', 'jur-selected-fill', 'jur-nodata-line', 'jur-line', 'jur-selected', 'stations-icon'];
const EMPTY = { type: 'FeatureCollection', features: [] };
const hasCount = ['==', ['typeof', ['get', 'count']], 'number'];
const hovered = ['boolean', ['feature-state', 'hover'], false];

/** Tooltip lines for one area. */
function describe({ stationName, count, yearsCovered, yearsInRange }, hasCounts) {
  if (!hasCounts) return [stationName, 'Tap for phone number and directions'];
  if (typeof count !== 'number') return [stationName, 'No data'];
  const partial = yearsCovered < yearsInRange ? ` (data for ${yearsCovered} of ${yearsInRange} years)` : '';
  return [stationName, `${count.toLocaleString('en-IN')} reported incident${count === 1 ? '' : 's'}${partial}`];
}

/**
 * Official police station areas and station icons. Areas are shaded by counts
 * only when real per-station figures have been imported; otherwise they are
 * outlines you can tap to find the station responsible for that area.
 *
 * @param {Object} props
 * @param {Object|undefined} props.jurisdictions   GeoJSON FeatureCollection from /api/jurisdictions
 * @param {Object|undefined} props.stations        GeoJSON FeatureCollection from /api/stations
 * @param {boolean} props.hasCounts                real per-station figures are available
 * @param {unknown} [props.fillColor]              MapLibre fill-color expression (when hasCounts)
 * @param {string|null} props.selectedId
 * @param {boolean} props.interactive               false while the user is placing a report pin
 * @param {(stationId: string) => void} props.onSelect
 */
export default function JurisdictionLayer({ jurisdictions, stations, hasCounts, fillColor, selectedId, interactive, onSelect }) {
  const { map } = useMapContext();
  const interactiveRef = useRef(interactive);
  const onSelectRef = useRef(onSelect);
  const hasCountsRef = useRef(hasCounts);
  const popupRef = useRef(null);
  interactiveRef.current = interactive;
  onSelectRef.current = onSelect;
  hasCountsRef.current = hasCounts;

  // Create sources, layers and event handlers once.
  useEffect(() => {
    map.addSource(JUR, { type: 'geojson', data: EMPTY, promoteId: 'stationId' });
    map.addSource(STN, { type: 'geojson', data: EMPTY });
    if (!map.hasImage('icon-police')) {
      const { image, pixelRatio } = iconImage('police');
      map.addImage('icon-police', image, { pixelRatio });
    }

    map.addLayer({ id: 'jur-fill', type: 'fill', source: JUR, paint: { 'fill-color': '#1f2937', 'fill-opacity': 0 } });
    map.addLayer({
      id: 'jur-selected-fill',
      type: 'fill',
      source: JUR,
      filter: ['==', ['get', 'stationId'], ''],
      paint: { 'fill-color': '#2a78d6', 'fill-opacity': 0.12 },
    });
    map.addLayer({
      id: 'jur-nodata-line',
      type: 'line',
      source: JUR,
      filter: ['all', ['!', hasCount], ['literal', false]],
      paint: { 'line-color': '#8a877f', 'line-width': 1, 'line-dasharray': [2, 2] },
    });
    map.addLayer({
      id: 'jur-line',
      type: 'line',
      source: JUR,
      paint: { 'line-color': '#334155', 'line-opacity': 0.6, 'line-width': ['case', hovered, 2.5, 0.8] },
    });
    map.addLayer({
      id: 'jur-selected',
      type: 'line',
      source: JUR,
      filter: ['==', ['get', 'stationId'], ''],
      paint: { 'line-color': '#0b0b0b', 'line-width': 3 },
    });
    map.addLayer({
      id: 'stations-icon',
      type: 'symbol',
      source: STN,
      minzoom: 10,
      layout: {
        'icon-image': 'icon-police',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.65, 14, 1],
      },
    });

    const canHover = window.matchMedia('(hover: hover)').matches;
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, maxWidth: '260px' });
    popupRef.current = popup;
    let hoveredId = null;

    const setHover = (id) => {
      if (hoveredId !== null) map.setFeatureState({ source: JUR, id: hoveredId }, { hover: false });
      hoveredId = id;
      if (id !== null) map.setFeatureState({ source: JUR, id }, { hover: true });
    };
    const overPoint = (point) => map.queryRenderedFeatures(point).some((f) => f.layer.id.startsWith(POINT_LAYER_PREFIX));

    const onMove = (e) => {
      if (!interactiveRef.current) return;
      const f = e.features?.[0];
      if (!f) return;
      map.getCanvas().style.cursor = 'pointer';
      setHover(f.id);
      if (!canHover || overPoint(e.point)) {
        popup.remove();
        return;
      }
      const [title, detail] = describe(f.properties, hasCountsRef.current);
      const el = document.createElement('div');
      el.className = 'text-xs text-ink-900';
      const strong = document.createElement('p');
      strong.className = 'font-semibold';
      strong.textContent = title; // textContent: never inject HTML from data
      const p = document.createElement('p');
      p.textContent = detail;
      el.append(strong, p);
      popup.setLngLat(e.lngLat).setDOMContent(el).addTo(map);
    };
    const onLeave = () => {
      if (interactiveRef.current) map.getCanvas().style.cursor = '';
      setHover(null);
      popup.remove();
    };
    const onClick = (e) => {
      if (!interactiveRef.current || overPoint(e.point)) return; // other icons show their own popup
      const id = e.features?.[0]?.properties?.stationId ?? e.features?.[0]?.properties?.id;
      if (id) onSelectRef.current(id);
    };

    map.on('mousemove', 'jur-fill', onMove);
    map.on('mouseleave', 'jur-fill', onLeave);
    map.on('click', 'jur-fill', onClick);
    map.on('click', 'stations-icon', onClick);

    return () => {
      popup.remove();
      try {
        map.off('mousemove', 'jur-fill', onMove);
        map.off('mouseleave', 'jur-fill', onLeave);
        map.off('click', 'jur-fill', onClick);
        map.off('click', 'stations-icon', onClick);
        LAYERS.forEach((id) => map.getLayer(id) && map.removeLayer(id));
        [JUR, STN].forEach((id) => map.getSource(id) && map.removeSource(id));
      } catch {
        // The map itself may already have been removed.
      }
    };
  }, [map]);

  useEffect(() => {
    map.getSource(JUR)?.setData(jurisdictions ?? EMPTY);
    popupRef.current?.remove(); // its numbers are stale now; the next mouse move redraws it
  }, [map, jurisdictions]);

  useEffect(() => {
    map.getSource(STN)?.setData(stations ?? EMPTY);
  }, [map, stations]);

  // Shading only exists for real imported counts; otherwise areas are outlines with a hover tint.
  useEffect(() => {
    if (hasCounts) {
      map.setPaintProperty('jur-fill', 'fill-color', fillColor);
      map.setPaintProperty('jur-fill', 'fill-opacity', 0.62);
      map.setPaintProperty('jur-line', 'line-color', '#ffffff');
      map.setPaintProperty('jur-line', 'line-opacity', 1);
      map.setFilter('jur-nodata-line', ['!', hasCount]);
    } else {
      map.setPaintProperty('jur-fill', 'fill-color', '#1f2937');
      map.setPaintProperty('jur-fill', 'fill-opacity', ['case', hovered, 0.07, 0]);
      map.setPaintProperty('jur-line', 'line-color', '#334155');
      map.setPaintProperty('jur-line', 'line-opacity', 0.6);
      map.setFilter('jur-nodata-line', ['literal', false]);
    }
  }, [map, hasCounts, fillColor]);

  // Highlight the selected area and bring its station into view if needed.
  useEffect(() => {
    const filter = ['==', ['get', 'stationId'], selectedId ?? ''];
    map.setFilter('jur-selected', filter);
    map.setFilter('jur-selected-fill', filter);
    if (!selectedId) return;
    const station = stations?.features.find((f) => f.properties.id === selectedId);
    if (!station) return;
    const center = station.geometry.coordinates;
    if (!map.getBounds().contains(center)) {
      map.easeTo({ center, zoom: Math.max(map.getZoom(), 12.5) });
    }
  }, [map, selectedId, stations]);

  return null;
}

JurisdictionLayer.propTypes = {
  jurisdictions: PropTypes.object,
  stations: PropTypes.object,
  hasCounts: PropTypes.bool.isRequired,
  fillColor: PropTypes.oneOfType([PropTypes.string, PropTypes.array]),
  selectedId: PropTypes.string,
  interactive: PropTypes.bool.isRequired,
  onSelect: PropTypes.func.isRequired,
};
