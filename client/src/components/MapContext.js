import { createContext, useContext } from 'react';

/**
 * @typedef {Object} MapContextValue
 * @property {import('maplibre-gl').Map} map
 */

/** @type {import('react').Context<MapContextValue | null>} */
export const MapContext = createContext(null);

/** @returns {MapContextValue} */
export function useMapContext() {
  const ctx = useContext(MapContext);
  if (!ctx) throw new Error('useMapContext must be used inside <MapView>');
  return ctx;
}
