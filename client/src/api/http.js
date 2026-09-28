// Thin fetch wrappers around the Express API. Responses are validated with the
// shared Zod schemas so the UI never renders malformed data.
import {
  createReportResponseSchema,
  jurisdictionsResponseSchema,
  layerDataSchema,
  layersResponseSchema,
  metaResponseSchema,
  reportsResponseSchema,
  stationLookupResponseSchema,
  stationsResponseSchema,
  trendsResponseSchema,
} from '@app/shared';

// Empty in dev (Vite proxies /api). Set VITE_API_BASE_URL if the API lives elsewhere.
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status   HTTP status, 0 for network errors
   * @param {unknown} [body]
   */
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * @param {string} path
 * @param {{ params?: Record<string, string|number|undefined|null>, method?: string, body?: unknown,
 *           schema?: import('zod').ZodTypeAny, signal?: AbortSignal }} [options]
 */
async function request(path, { params, method = 'GET', body, schema, signal } = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();

  let res;
  try {
    res = await fetch(`${API_BASE}/api${path}${qs ? `?${qs}` : ''}`, {
      method,
      signal,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON body; handled below.
  }

  if (!res.ok) {
    throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status, data);
  }
  if (schema) {
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw new ApiError('Unexpected response from the server.', res.status, data);
    return parsed.data;
  }
  return data;
}

/**
 * @param {{ yearFrom: number, yearTo: number }} range
 * @returns {string} "2021" or "2019-2024"
 */
export function toYearParam({ yearFrom, yearTo }) {
  return yearFrom === yearTo ? String(yearFrom) : `${yearFrom}-${yearTo}`;
}

export const api = {
  /** @param {{ yearFrom: number, yearTo: number, type?: string }} filters */
  getJurisdictions: (filters, signal) =>
    request('/jurisdictions', {
      params: { year: toYearParam(filters), type: filters.type },
      schema: jurisdictionsResponseSchema,
      signal,
    }),

  getMeta: (signal) => request('/meta', { schema: metaResponseSchema, signal }),

  /** @param {{ stationId?: string, type?: string }} filters */
  getTrends: (filters, signal) =>
    request('/trends', { params: filters, schema: trendsResponseSchema, signal }),

  getStations: (signal) => request('/stations', { schema: stationsResponseSchema, signal }),

  /** The police station whose official area contains the point (404 ApiError outside all areas). */
  getStationAt: ({ lat, lng }, signal) =>
    request('/stations/at', { params: { lat, lng }, schema: stationLookupResponseSchema, signal }),

  getLayers: (signal) => request('/layers', { schema: layersResponseSchema, signal }),

  getLayer: (id, signal) => request(`/layers/${encodeURIComponent(id)}`, { schema: layerDataSchema, signal }),

  getReports: (signal) => request('/reports', { schema: reportsResponseSchema, signal }),

  /** @param {{ lat: number, lng: number, category: string, note?: string }} input */
  createReport: (input) =>
    request('/reports', { method: 'POST', body: input, schema: createReportResponseSchema }),
};
