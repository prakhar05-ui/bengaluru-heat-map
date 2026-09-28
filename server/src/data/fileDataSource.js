// DataSource backed by the files the import scripts write:
//   geo/stations.geojson, geo/jurisdictions.geojson, geo/meta.json  (npm run import:stations)
//   layers/catalog.json, layers/<id>.geojson                        (npm run import:layers)
//   counts/city-counts.json      official city-wide figures        (npm run import:city-counts)
//   counts/station-counts.json   per-station counts, optional      (npm run import:counts)
//   mock/reports.json                                               seed community reports
//
// Data files are re-read automatically when they change on disk, so re-running
// an import takes effect without restarting the server. Reports created at
// runtime live in memory only and reset on restart.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { IS_DEPLOYED } from '../config.js';
import { INCIDENT_TYPES, LAYER_IDS, MAX_YEAR, MIN_YEAR, cityCountsFileSchema, stationCountsFileSchema } from '@app/shared';

const NO_COUNTS = {
  meta: { source: 'none', label: 'No per-station figures have been imported', importedAt: null },
  rows: 0,
  index: new Map(),
};

const fileUrl = (rel) => new URL(`./${rel}`, import.meta.url);

/**
 * Cache a parsed file and rebuild it when its mtime changes.
 * @template T
 * @param {string} rel
 * @param {(raw: any) => T} build
 * @param {{ optional?: boolean }} [options]  optional files return null while missing
 * @returns {() => T | null}
 */
function watchedFile(rel, build, { optional = false } = {}) {
  let mtime = -1;
  let value;
  return () => {
    if (optional && !existsSync(fileUrl(rel))) return null;
    const current = statSync(fileUrl(rel)).mtimeMs;
    if (current !== mtime) {
      value = build(JSON.parse(readFileSync(fileUrl(rel), 'utf8')));
      mtime = current;
    }
    return value;
  };
}

/** stationId -> year -> type -> count */
function indexCounts(raw) {
  const file = stationCountsFileSchema.parse(raw);
  /** @type {Map<string, Map<number, Map<string, number>>>} */
  const index = new Map();
  for (const r of file.rows) {
    if (!index.has(r.stationId)) index.set(r.stationId, new Map());
    const years = index.get(r.stationId);
    if (!years.has(r.year)) years.set(r.year, new Map());
    years.get(r.year).set(r.type, r.count);
  }
  return { meta: file.meta, rows: file.rows.length, index };
}

/** Count for one covered (station, year); missing types are 0. */
function yearTotal(types, type) {
  if (type) return types.get(type) ?? 0;
  let sum = 0;
  for (const n of types.values()) sum += n;
  return sum;
}

/**
 * @returns {import('./dataSource.js').DataSource}
 */
export function createFileDataSource() {
  const getStations = watchedFile('geo/stations.geojson', (fc) => ({
    fc,
    ids: new Set(fc.features.map((f) => f.properties.id)),
    byId: new Map(fc.features.map((f) => [f.properties.id, f])),
  }));
  const getLayerCatalog = watchedFile('layers/catalog.json', (c) => c, { optional: true });
  const layerFiles = Object.fromEntries(
    LAYER_IDS.map((id) => [id, watchedFile(`layers/${id}.geojson`, (fc) => fc, { optional: true })]),
  );
  const getJurisdictions = watchedFile('geo/jurisdictions.geojson', (fc) => fc);
  const getGeoMeta = watchedFile('geo/meta.json', (m) => m);
  const getStationCounts = watchedFile('counts/station-counts.json', (raw) => {
    const counts = indexCounts(raw);
    const known = getStations().ids;
    const orphans = [...counts.index.keys()].filter((id) => !known.has(id));
    if (orphans.length) {
      console.warn(`[data] ${orphans.length} stationId(s) in station-counts.json are not in stations.geojson, e.g. ${orphans[0]}`);
    }
    return counts;
  }, { optional: true });
  const getCounts = () => getStationCounts() ?? NO_COUNTS;

  const getCity = watchedFile(
    'counts/city-counts.json',
    (raw) => {
      const file = cityCountsFileSchema.parse(raw);
      return { meta: file.meta, byKey: new Map(file.rows.map((r) => [`${r.year}|${r.type}`, r])) };
    },
    { optional: true },
  );

  /** Example reports for local development only; never loaded when deployed. */
  /** @type {import('./dataSource.js').Report[]} */
  const reports = IS_DEPLOYED ? [] : JSON.parse(readFileSync(fileUrl('mock/reports.json'), 'utf8'));

  return {
    async listStations() {
      return getStations().fc;
    },

    async stationExists(id) {
      return getStations().ids.has(id);
    },

    async stationAt(lat, lng) {
      const area = getJurisdictions().features.find((f) => booleanPointInPolygon([lng, lat], f));
      const station = area && getStations().byId.get(area.properties.stationId);
      return station ? { station: station.properties, coordinates: station.geometry.coordinates } : null;
    },

    async listLayers() {
      return (getLayerCatalog() ?? []).filter((l) => layerFiles[l.id]?.());
    },

    async getLayer(id) {
      return layerFiles[id]?.() ?? null;
    },

    async listJurisdictions({ year, type } = {}) {
      const from = year?.from ?? MIN_YEAR;
      const to = year?.to ?? MAX_YEAR;
      const { index } = getCounts();
      const features = getJurisdictions().features.map((f) => {
        const years = index.get(f.properties.stationId);
        let count = 0;
        let yearsCovered = 0;
        for (let y = from; y <= to; y++) {
          const types = years?.get(y);
          if (!types) continue;
          yearsCovered++;
          count += yearTotal(types, type);
        }
        return {
          ...f,
          properties: {
            ...f.properties,
            count: yearsCovered ? count : null,
            yearsCovered,
            yearsInRange: to - from + 1,
          },
        };
      });
      return { type: 'FeatureCollection', features };
    },

    async getTrends({ stationId, type } = {}) {
      const points = [];
      if (stationId) {
        const years = getCounts().index.get(stationId);
        for (let y = MIN_YEAR; y <= MAX_YEAR; y++) {
          const types = years?.get(y);
          points.push({ year: y, count: types ? yearTotal(types, type) : null });
        }
        return { scope: 'station', points };
      }

      // City-wide: official figures, never the sum of per-station counts.
      const city = getCity();
      for (let y = MIN_YEAR; y <= MAX_YEAR; y++) {
        const rows = (type ? [type] : INCIDENT_TYPES).map((t) => city?.byKey.get(`${y}|${t}`)).filter(Boolean);
        if (rows.length === 0) {
          points.push({ year: y, count: null });
          continue;
        }
        const sources = new Set(rows.map((r) => r.source));
        const missingTypes = type ? [] : INCIDENT_TYPES.filter((t) => !city.byKey.has(`${y}|${t}`));
        points.push({
          year: y,
          count: rows.reduce((sum, r) => sum + r.count, 0),
          ...(missingTypes.length ? { missingTypes } : {}),
          ...(sources.size === 1 ? { source: rows[0].source } : {}),
        });
      }
      return { scope: 'city', points };
    },

    async getMeta() {
      const counts = getCounts();
      const geo = getGeoMeta();
      return {
        cityCounts: getCity()?.meta ?? null,
        counts: {
          ...counts.meta,
          rows: counts.rows,
          stationsWithData: counts.index.size,
        },
        stations: {
          count: getStations().fc.features.length,
          source: geo.stations.source,
          fetchedAt: geo.stations.fetchedAt ?? null,
          attribution: geo.stations.attribution,
        },
        boundaries: geo.boundaries,
      };
    },

    async listReports({ status } = {}) {
      return reports.filter((r) => !status || r.status === status);
    },

    async createReport(input) {
      const report = {
        id: randomUUID(),
        lat: input.lat,
        lng: input.lng,
        category: input.category,
        ...(input.note ? { note: input.note } : {}),
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      reports.push(report);
      return report;
    },
  };
}
