import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import * as maplibregl from 'maplibre-gl';
import { useMapContext } from './MapContext.js';

/**
 * Renders React children as a MapLibre HTML marker at [lng, lat].
 *
 * @param {Object} props
 * @param {number} props.lng
 * @param {number} props.lat
 * @param {'center'|'bottom'|'top'|'left'|'right'} [props.anchor]
 * @param {import('react').ReactNode} props.children
 */
export default function MapMarker({ lng, lat, anchor = 'center', children }) {
  const { map } = useMapContext();
  const element = useMemo(() => document.createElement('div'), []);
  const markerRef = useRef(null);

  useEffect(() => {
    const marker = new maplibregl.Marker({ element, anchor }).setLngLat([lng, lat]).addTo(map);
    markerRef.current = marker;
    return () => marker.remove();
    // Position updates are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, element, anchor]);

  useEffect(() => {
    markerRef.current?.setLngLat([lng, lat]);
  }, [lng, lat]);

  return createPortal(children, element);
}

MapMarker.propTypes = {
  lng: PropTypes.number.isRequired,
  lat: PropTypes.number.isRequired,
  anchor: PropTypes.oneOf(['center', 'bottom', 'top', 'left', 'right']),
  children: PropTypes.node.isRequired,
};
