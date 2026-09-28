// Data source abstraction.
//
// Every route talks to the `dataSource` exported here, never to a concrete
// store. The default "file" source reads the JSON/GeoJSON files produced by the
// import scripts. To move to Postgres/PostGIS, write a module that implements
// the DataSource interface below (e.g. `postgisDataSource.js`) and select it via
// the DATA_SOURCE env var. Routes do not need to change.
//
// All methods are async so file and database implementations are interchangeable.

import { createFileDataSource } from './fileDataSource.js';

/**
 * @typedef {'harassment' | 'stalking' | 'assault' | 'theft'} IncidentType
 * @typedef {'poor_lighting' | 'isolated' | 'harassment_spot'} ReportCategory
 * @typedef {'pending' | 'approved' | 'rejected'} ReportStatus
 */

/**
 * One official figure: reported incidents of one type at one station in one year.
 * A (stationId, year) with at least one row is "covered"; missing types within a
 * covered year count as 0. Uncovered years are "no data" (null), never 0.
 * @typedef {Object} StationCount
 * @property {string} stationId
 * @property {number} year
 * @property {IncidentType} type
 * @property {number} count
 */

/**
 * @typedef {Object} CountFilter
 * @property {{ from: number, to: number }} [year]   inclusive year range
 * @property {IncidentType} [type]
 */

/**
 * @typedef {Object} TrendFilter
 * @property {string} [stationId]  omit for city-wide totals
 * @property {IncidentType} [type]
 */

/**
 * @typedef {Object} TrendPoint
 * @property {number} year
 * @property {number | null} count          null = no data
 * @property {IncidentType[]} [missingTypes] "all types" only: types with no figure that year
 * @property {number} [source]              city-wide only: index into cityCounts.sources
 */

/**
 * GeoJSON FeatureCollection of police stations (Point geometries) with
 * properties { id, name, locationSource, phone?, email?, division?, subdivision? }.
 * @typedef {Object} StationCollection
 * @property {'FeatureCollection'} type
 * @property {Array<Object>} features
 */

/**
 * GeoJSON FeatureCollection of jurisdiction polygons with properties
 * { stationId, stationName, count: number|null, yearsCovered, yearsInRange }.
 * @typedef {Object} JurisdictionCollection
 * @property {'FeatureCollection'} type
 * @property {Array<Object>} features
 */

/**
 * Provenance shown in the UI (city-wide sources, imported per-station counts, boundary source).
 * @typedef {Object} DataMeta
 * @property {{ area: string, importedAt: string, sources: Array<Object> } | null} cityCounts  official city-wide figures
 * @property {{ source: 'none'|'imported', label: string, importedAt: string|null, rows: number, stationsWithData: number }} counts
 * @property {{ count: number, source: string, fetchedAt: string|null, attribution: string }} stations
 * @property {{ kind: 'approximate'|'official', label: string }} boundaries
 */

/**
 * A user-submitted spot report. Moderated before it is public.
 * @typedef {Object} Report
 * @property {string} id
 * @property {number} lat
 * @property {number} lng
 * @property {ReportCategory} category
 * @property {string} [note]       max 200 chars
 * @property {ReportStatus} status
 * @property {string} createdAt    ISO timestamp
 */

/**
 * @typedef {Object} NewReport
 * @property {number} lat
 * @property {number} lng
 * @property {ReportCategory} category
 * @property {string} [note]
 */

/**
 * The contract every data source must implement.
 *
 * @typedef {Object} DataSource
 * @property {() => Promise<StationCollection>} listStations
 * @property {(id: string) => Promise<boolean>} stationExists
 * @property {(lat: number, lng: number) => Promise<{ station: Object, coordinates: [number, number] } | null>} stationAt
 *   The station whose official area contains the point, with its contact details.
 *   PostGIS hint: `WHERE ST_Contains(j.geom, ST_SetSRID(ST_Point($lng, $lat), 4326))`
 * @property {() => Promise<Array<Object>>} listLayers
 *   Catalogue of map layers (id, label, group, kind, count, source, licence, caveat).
 * @property {(id: string) => Promise<Object | null>} getLayer
 *   GeoJSON FeatureCollection for one layer.
 * @property {(filter: CountFilter) => Promise<JurisdictionCollection>} listJurisdictions
 *   Polygons joined with summed counts for the filter.
 * @property {(filter: TrendFilter) => Promise<{ scope: 'city'|'station', points: TrendPoint[] }>} getTrends
 *   One point per year MIN_YEAR..MAX_YEAR, ascending, null where there is no data.
 *   Without stationId: official city-wide figures (scope "city"), not a sum of stations.
 * @property {() => Promise<DataMeta>} getMeta
 * @property {(opts: { status?: ReportStatus }) => Promise<Report[]>} listReports
 * @property {(input: NewReport) => Promise<Report>} createReport
 *   Always persists with status "pending".
 */

/**
 * Pick the implementation from the environment.
 * @returns {DataSource}
 */
function selectDataSource() {
  const kind = process.env.DATA_SOURCE ?? 'file';
  switch (kind) {
    case 'file':
      return createFileDataSource();
    // case 'postgis':
    //   return createPostgisDataSource({ connectionString: process.env.DATABASE_URL });
    default:
      throw new Error(`Unknown DATA_SOURCE "${kind}". Expected "file".`);
  }
}

/** @type {DataSource} */
export const dataSource = selectDataSource();
