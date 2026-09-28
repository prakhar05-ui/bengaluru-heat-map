// TanStack Query hooks. Components use these, never `api` directly.
import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './http.js';

export const queryKeys = {
  jurisdictions: (filters) => ['jurisdictions', filters],
  meta: ['meta'],
  trends: (filters) => ['trends', filters],
  stations: ['stations'],
  layers: ['layers'],
  layer: (id) => ['layer', id],
  reports: ['reports'],
};

/**
 * Station-area polygons with summed reported-incident counts for the filters.
 * Keeps the previous result on screen while new filters load to avoid flicker.
 * @param {{ yearFrom: number, yearTo: number, type?: string }} filters
 */
export function useJurisdictions(filters) {
  return useQuery({
    queryKey: queryKeys.jurisdictions(filters),
    queryFn: ({ signal }) => api.getJurisdictions(filters, signal),
    placeholderData: keepPreviousData,
  });
}

/** Data provenance: city-wide sources, imported per-station counts (if any), station and boundary sources. */
export function useMeta() {
  return useQuery({
    queryKey: queryKeys.meta,
    queryFn: ({ signal }) => api.getMeta(signal),
  });
}

/**
 * Yearly counts of reported incidents.
 * @param {{ stationId?: string, type?: string }} filters
 * @param {{ enabled?: boolean }} [options]
 */
export function useTrends(filters, { enabled = true } = {}) {
  return useQuery({
    queryKey: queryKeys.trends(filters),
    queryFn: ({ signal }) => api.getTrends(filters, signal),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/**
 * Several trend series at once (e.g. one per incident type).
 * @param {Array<{ stationId?: string, type?: string }>} filtersList
 */
export function useTrendsMany(filtersList) {
  return useQueries({
    queries: filtersList.map((filters) => ({
      queryKey: queryKeys.trends(filters),
      queryFn: ({ signal }) => api.getTrends(filters, signal),
    })),
  });
}

export function useStations() {
  return useQuery({
    queryKey: queryKeys.stations,
    queryFn: ({ signal }) => api.getStations(signal),
    staleTime: Infinity,
  });
}

/** Catalogue of map layers with sources and caveats. */
export function useLayers() {
  return useQuery({
    queryKey: queryKeys.layers,
    queryFn: ({ signal }) => api.getLayers(signal),
    staleTime: Infinity,
  });
}

/**
 * GeoJSON for several layers; each is fetched only once it is switched on.
 * @param {string[]} ids   all layer ids, in a stable order
 * @param {Set<string>} enabled
 */
export function useLayerData(ids, enabled) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: queryKeys.layer(id),
      queryFn: ({ signal }) => api.getLayer(id, signal),
      enabled: enabled.has(id),
      staleTime: Infinity,
    })),
  });
}

/** Approved (moderated) community reports only. */
export function useReports() {
  return useQuery({
    queryKey: queryKeys.reports,
    queryFn: ({ signal }) => api.getReports(signal),
  });
}

export function useCreateReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => api.createReport(input),
    // New reports are pending, so they won't appear yet, but refresh in case
    // moderation approved something in the meantime.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.reports }),
  });
}
