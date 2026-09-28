import * as maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { layers, namedFlavor } from '@protomaps/basemaps';
// MapLibre v6 locates its web worker via import.meta.url, which breaks once Vite
// pre-bundles it. Let Vite bundle the worker and hand MapLibre the URL instead.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

const TILES_URL = import.meta.env.VITE_TILES_URL;

/** Which basemap is in use: 'pmtiles' | 'osm-dev' | 'none'. */
export const basemapMode = TILES_URL ? 'pmtiles' : import.meta.env.DEV ? 'osm-dev' : 'none';

let protocolRegistered = false;

/** One-time MapLibre setup: worker URL + pmtiles:// protocol. */
export function ensurePmtilesProtocol() {
  if (protocolRegistered) return;
  maplibregl.setWorkerUrl(maplibreWorkerUrl);
  const protocol = new Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);
  protocolRegistered = true;
}

/**
 * Build the MapLibre style for the current environment.
 * @returns {import('maplibre-gl').StyleSpecification}
 */
export function buildMapStyle() {
  if (basemapMode === 'pmtiles') {
    // Accept "pmtiles://https://…", "https://…" or a site-relative path like "/bengaluru.pmtiles".
    const raw = TILES_URL.replace(/^pmtiles:\/\//, '');
    const url = `pmtiles://${new URL(raw, window.location.href).href}`;
    return {
      version: 8,
      // Free, key-less Protomaps assets. Self-host these for production if preferred.
      glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
      sprite: 'https://protomaps.github.io/basemaps-assets/sprites/v4/light',
      sources: {
        protomaps: {
          type: 'vector',
          url,
          attribution:
            '<a href="https://protomaps.com">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        },
      },
      layers: layers('protomaps', namedFlavor('light'), { lang: 'en' }),
    };
  }

  if (basemapMode === 'osm-dev') {
    // DEVELOPMENT ONLY. NOT FOR PRODUCTION.
    // tile.openstreetmap.org is a donated community service; its tile usage
    // policy forbids heavy/production use. Set VITE_TILES_URL to a PMTiles
    // basemap you host yourself before deploying.
    return {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          maxzoom: 19,
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        },
      },
      layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
    };
  }

  // Production build without VITE_TILES_URL: plain background so the data layers
  // still render, rather than silently hitting OSM's servers.
  return {
    version: 8,
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eef2f5' } }],
  };
}
