import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import * as maplibregl from 'maplibre-gl';
import { useMapContext } from './MapContext.js';
import { continuousClasses, stepExpression } from '../lib/choropleth.js';
import { POINT_STYLES, STREETLIGHT_RAMP, describeFeature, iconImage } from '../lib/layerStyles.js';

// Layer id conventions shared with JurisdictionLayer: point layers are "lyr-pt-<id>" (plus
// "lyr-pt-<id>~priority" for features that stay visible when zoomed out); the police station
// icons are "stations-icon" and stay on top of other points.
export const POINT_LAYER_PREFIX = 'lyr-pt-';
const layerIdOf = (mapLayerId) => mapLayerId.slice(POINT_LAYER_PREFIX.length).split('~')[0];
const POLICE_LAYER = 'stations-icon';
const OUTLINE_LAYER = 'jur-line';
const NO_DATA = '#e4e2dd';

const safely = (fn) => {
  try {
    fn();
  } catch {
    // The map may already be gone during unmount.
  }
};

/** Build popup DOM from lines of text (textContent only: never inject HTML from data). */
function popupContent(lines) {
  const el = document.createElement('div');
  el.className = 'text-xs text-ink-900';
  lines.forEach((line, i) => {
    const p = document.createElement('p');
    if (i === 0) p.className = 'font-semibold';
    p.textContent = line;
    el.append(p);
  });
  return el;
}

/**
 * One point layer drawn as icons.
 * @param {{ id: string, data: Object, minzoom?: number }} props
 */
function PointLayer({ id, data, minzoom }) {
  const { map } = useMapContext();
  const source = `lyr-src-${id}`;
  const layer = `${POINT_LAYER_PREFIX}${id}`;

  useEffect(() => {
    const image = `icon-${id}`;
    if (!map.hasImage(image)) {
      const { image: img, pixelRatio } = iconImage(id);
      map.addImage(image, img, { pixelRatio });
    }
    map.addSource(source, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const before = map.getLayer(POLICE_LAYER) ? POLICE_LAYER : undefined;
    const layout = {
      'icon-image': image,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.7, 15, 1],
    };
    const priority = minzoom ? POINT_STYLES[id].priority : undefined;
    const added = [layer];
    map.addLayer(
      {
        id: layer,
        type: 'symbol',
        source,
        ...(minzoom ? { minzoom } : {}),
        ...(priority ? { filter: ['!', priority] } : {}),
        layout,
      },
      before,
    );
    if (priority) {
      map.addLayer({ id: `${layer}~priority`, type: 'symbol', source, filter: priority, layout }, before);
      added.push(`${layer}~priority`);
    }
    return () =>
      safely(() => {
        added.forEach((l) => map.getLayer(l) && map.removeLayer(l));
        if (map.getSource(source)) map.removeSource(source);
      });
  }, [map, id, source, layer, minzoom]);

  useEffect(() => {
    map.getSource(source)?.setData(data);
  }, [map, source, data]);

  return null;
}
PointLayer.propTypes = { id: PropTypes.string.isRequired, data: PropTypes.object.isRequired, minzoom: PropTypes.number };

/**
 * Wards shaded by streetlights per km of road.
 * @param {{ data: Object, onClasses: (classes: Array<Object>) => void }} props
 */
function StreetlightLayer({ data, onClasses }) {
  const { map } = useMapContext();

  useEffect(() => {
    map.addSource('lyr-src-streetlights', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const before = map.getLayer(OUTLINE_LAYER) ? OUTLINE_LAYER : undefined;
    map.addLayer(
      { id: 'lyr-fill-streetlights', type: 'fill', source: 'lyr-src-streetlights', paint: { 'fill-color': NO_DATA, 'fill-opacity': 0.6 } },
      before,
    );
    map.addLayer(
      {
        id: 'lyr-line-streetlights',
        type: 'line',
        source: 'lyr-src-streetlights',
        paint: { 'line-color': '#7a5000', 'line-width': 0.4, 'line-opacity': 0.5 },
      },
      before,
    );
    return () =>
      safely(() => {
        ['lyr-line-streetlights', 'lyr-fill-streetlights'].forEach((l) => map.getLayer(l) && map.removeLayer(l));
        if (map.getSource('lyr-src-streetlights')) map.removeSource('lyr-src-streetlights');
      });
  }, [map]);

  useEffect(() => {
    const classes = continuousClasses(
      data.features.map((f) => f.properties.perKm),
      STREETLIGHT_RAMP,
    );
    map.getSource('lyr-src-streetlights')?.setData(data);
    map.setPaintProperty('lyr-fill-streetlights', 'fill-color', stepExpression('perKm', classes, NO_DATA));
    onClasses(classes);
  }, [map, data, onClasses]);

  return null;
}
StreetlightLayer.propTypes = { data: PropTypes.object.isRequired, onClasses: PropTypes.func.isRequired };

/**
 * Renders the enabled optional layers and handles their popups.
 *
 * @param {Object} props
 * @param {Array<{ id: string, kind: 'point'|'fill', minzoom?: number, data?: Object }>} props.layers  enabled layers with loaded data
 * @param {boolean} props.interactive   false while the user is placing a report pin
 * @param {(classes: Array<Object>) => void} props.onStreetlightClasses
 */
export default function MapLayers({ layers, interactive, onStreetlightClasses }) {
  const { map } = useMapContext();
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;

  // One click handler for every point layer, plus ward info for streetlights.
  useEffect(() => {
    // closeOnClick is handled here: MapLibre's own handler runs after this one and would
    // immediately close a popup opened by the same click.
    const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, offset: 12, maxWidth: '260px' });
    const onClick = (e) => {
      if (!interactiveRef.current) return;
      const features = map.queryRenderedFeatures(e.point);
      const pointHit = features.find((f) => f.layer.id.startsWith(POINT_LAYER_PREFIX));
      if (pointHit) {
        const id = layerIdOf(pointHit.layer.id);
        popup.setLngLat(pointHit.geometry.coordinates).setDOMContent(popupContent(describeFeature(id, pointHit.properties))).addTo(map);
        return;
      }
      const ward = features.find((f) => f.layer.id === 'lyr-fill-streetlights');
      if (ward) {
        const p = ward.properties;
        const lines = [
          `Ward ${p.ward}${p.name ? `: ${p.name}` : ''}`,
          typeof p.perKm === 'number' ? `${p.perKm} streetlights per km of road` : 'No streetlight count',
          p.lights && p.roadKm ? `${Number(p.lights).toLocaleString('en-IN')} lights · ${p.roadKm} km of road` : undefined,
        ].filter(Boolean);
        popup.setLngLat(e.lngLat).setDOMContent(popupContent(lines)).addTo(map);
        return;
      }
      popup.remove();
    };
    map.on('click', onClick);
    return () => {
      popup.remove();
      safely(() => map.off('click', onClick));
    };
  }, [map]);

  return layers.map((l) =>
    l.kind === 'fill' ? (
      <StreetlightLayer key={l.id} data={l.data} onClasses={onStreetlightClasses} />
    ) : (
      <PointLayer key={l.id} id={l.id} data={l.data} minzoom={l.minzoom} />
    ),
  );
}

MapLayers.propTypes = {
  layers: PropTypes.arrayOf(
    PropTypes.shape({ id: PropTypes.string.isRequired, kind: PropTypes.string.isRequired, data: PropTypes.object.isRequired }),
  ).isRequired,
  interactive: PropTypes.bool.isRequired,
  onStreetlightClasses: PropTypes.func.isRequired,
};
