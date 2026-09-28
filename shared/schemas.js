// Shared Zod schemas used by both the client and the server.
// Plain JavaScript (ES modules). Import as: import { ... } from '@app/shared'
//
// Privacy rule: these schemas intentionally carry NO personal data — no names,
// phone numbers, victim/accused details or criminal-record fields. Official
// figures are aggregated counts per police station, per year, per type.
import { z } from 'zod';

// Years with Bengaluru City figures by offence (BCP 2021-2023, KSP 2024).
// Change these if your imported data covers other years.
export const MIN_YEAR = 2021;
export const MAX_YEAR = 2024;

// Official offence heads, as used in Bengaluru City Police / Karnataka State
// Police tables. The three heads do not overlap, so "all types" is their sum.
export const INCIDENT_TYPES = /** @type {const} */ (['molestation', 'insult_to_modesty', 'rape']);

export const INCIDENT_TYPE_LABELS = {
  molestation: 'Molestation',
  insult_to_modesty: 'Insulting modesty',
  rape: 'Rape',
};

/** Legal sections: IPC until 30 June 2024, Bharatiya Nyaya Sanhita (BNS) from 1 July 2024. */
export const INCIDENT_TYPE_SECTIONS = {
  molestation: 'Assault on women with intent to outrage modesty (IPC 354 / BNS 74)',
  insult_to_modesty: 'Insulting the modesty of women, "eve teasing" (IPC 509 / BNS 79)',
  rape: 'Rape (IPC 376 / BNS 64)',
};

export const REPORT_CATEGORIES = /** @type {const} */ (['poor_lighting', 'isolated', 'harassment_spot']);

export const REPORT_CATEGORY_LABELS = {
  poor_lighting: 'Poor lighting',
  isolated: 'Isolated stretch',
  harassment_spot: 'Harassment reported here',
};

export const REPORT_STATUSES = /** @type {const} */ (['pending', 'approved', 'rejected']);

export const NOTE_MAX_LENGTH = 200;

// Generous bounding box around greater Bengaluru. Reports outside it are rejected.
export const BENGALURU_BOUNDS = { minLng: 77.3, minLat: 12.7, maxLng: 77.95, maxLat: 13.25 };
export const BENGALURU_CENTER = { lat: 12.9716, lng: 77.5946 };

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);
const year = z.number().int().min(MIN_YEAR).max(MAX_YEAR);
const position = z.tuple([lng, lat]);

export const incidentTypeSchema = z.enum(INCIDENT_TYPES);
export const reportCategorySchema = z.enum(REPORT_CATEGORIES);
export const reportStatusSchema = z.enum(REPORT_STATUSES);

/** "2021" or "2019-2022" -> { from, to } */
export const yearRangeSchema = z
  .string()
  .regex(/^\d{4}(-\d{4})?$/, 'year must be "YYYY" or "YYYY-YYYY"')
  .transform((value) => {
    const [from, to = from] = value.split('-').map(Number);
    return { from, to };
  })
  .refine((r) => r.from <= r.to, 'year range start must be <= end')
  .refine((r) => r.from >= MIN_YEAR && r.to <= MAX_YEAR, `years must be within ${MIN_YEAR}-${MAX_YEAR}`);

/* ------------------------- Station counts ---------------------------- */

/**
 * One row of official data: reported incidents of one type, at one police
 * station, in one year. A (stationId, year) with at least one row counts as
 * "covered"; types missing within a covered year are treated as 0. Years with
 * no rows at all are "no data", never zero.
 */
export const stationCountSchema = z.object({
  stationId: z.string().min(1).max(64),
  year,
  type: incidentTypeSchema,
  count: z.number().int().nonnegative(),
});

/** 'none' = no per-station figures imported (none are published); 'imported' = your CSV import. */
export const COUNT_SOURCES = /** @type {const} */ (['none', 'imported']);

export const stationCountsFileSchema = z.object({
  meta: z.object({
    source: z.literal('imported'),
    label: z.string(),
    importedAt: z.string().nullable(),
  }),
  rows: z.array(stationCountSchema),
});

/**
 * City-wide official figures for Bengaluru City (the police commissionerate).
 * Missing (year, type) pairs are "no data", never zero.
 */
export const cityCountSchema = z.object({
  year,
  type: incidentTypeSchema,
  count: z.number().int().nonnegative(),
  /** Index into meta.sources */
  source: z.number().int().nonnegative(),
});

export const citySourceSchema = z.object({
  publisher: z.string(),
  dataset: z.string(),
  table: z.string(),
  url: z.string().url(),
  years: z.array(year),
});

export const cityCountsFileSchema = z.object({
  meta: z.object({
    area: z.string(),
    importedAt: z.string(),
    sources: z.array(citySourceSchema),
  }),
  rows: z.array(cityCountSchema),
});

/* ----------------------------- Stations ------------------------------ */

export const stationPropertiesSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** 'station' = official station location; 'area' = no point on file, dot placed inside the area. */
  locationSource: z.enum(['station', 'area']),
  /** Official station contacts (Bengaluru City Police); absent for district police stations. */
  phone: z.string().optional(),
  email: z.string().optional(),
  division: z.string().optional(),
  subdivision: z.string().optional(),
});

export const stationLookupQuerySchema = z.object({
  lat: z.coerce.number().min(BENGALURU_BOUNDS.minLat).max(BENGALURU_BOUNDS.maxLat),
  lng: z.coerce.number().min(BENGALURU_BOUNDS.minLng).max(BENGALURU_BOUNDS.maxLng),
});

/** The police station whose official area contains a point. */
export const stationLookupResponseSchema = z.object({
  station: stationPropertiesSchema,
  coordinates: position,
});

export const stationFeatureSchema = z.object({
  type: z.literal('Feature'),
  geometry: z.object({ type: z.literal('Point'), coordinates: position }),
  properties: stationPropertiesSchema,
});

export const stationsResponseSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(stationFeatureSchema),
});

/* --------------------------- Jurisdictions --------------------------- */

export const jurisdictionsQuerySchema = z.object({
  year: yearRangeSchema.optional(),
  type: incidentTypeSchema.optional(),
});

const polygonGeometry = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(position)) }),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(z.array(position))) }),
]);

export const jurisdictionFeatureSchema = z.object({
  type: z.literal('Feature'),
  geometry: polygonGeometry,
  properties: z.object({
    stationId: z.string(),
    stationName: z.string(),
    /** Sum over covered years in range; null when no year in range has data. */
    count: z.number().int().nonnegative().nullable(),
    yearsCovered: z.number().int().nonnegative(),
    yearsInRange: z.number().int().positive(),
  }),
});

export const jurisdictionsResponseSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(jurisdictionFeatureSchema),
});

/* ------------------------------ Trends ------------------------------- */

export const trendsQuerySchema = z.object({
  stationId: z.string().min(1).max(64).optional(),
  type: incidentTypeSchema.optional(),
});

export const trendPointSchema = z.object({
  year,
  /** null = no data for that year (not zero). */
  count: z.number().int().nonnegative().nullable(),
  /** "All types" only: types with no figure that year, left out of `count`. */
  missingTypes: z.array(incidentTypeSchema).optional(),
  /** City-wide only: which meta source the figure came from. */
  source: z.number().int().nonnegative().optional(),
});

export const trendsResponseSchema = z.object({
  stationId: z.string().nullable(),
  type: incidentTypeSchema.nullable(),
  /** 'city' = official city-wide figures; 'station' = per-station counts file */
  scope: z.enum(['city', 'station']),
  points: z.array(trendPointSchema),
});

/* ------------------------------ Layers ------------------------------- */

export const LAYER_IDS = /** @type {const} */ (['hospitals', 'health', 'metro', 'cctv', 'toilets', 'bus-stops', 'streetlights']);

export const layerInfoSchema = z.object({
  id: z.enum(LAYER_IDS),
  group: z.enum(['help', 'other']),
  kind: z.enum(['point', 'fill']),
  label: z.string(),
  count: z.number().int().nonnegative(),
  minzoom: z.number().optional(),
  source: z.object({ name: z.string(), url: z.string().url(), licence: z.string() }),
  caveat: z.string(),
  downloadedAt: z.string(),
});

export const layersResponseSchema = z.array(layerInfoSchema);

/** Layer data is GeoJSON; its property shapes vary by layer and are read defensively. */
export const layerDataSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(
    z.object({ type: z.literal('Feature'), geometry: z.object({ type: z.string() }).passthrough(), properties: z.record(z.unknown()) }),
  ),
});

/* ------------------------------- Meta -------------------------------- */

export const metaResponseSchema = z.object({
  /** Feature switches set by the server (e.g. reports are off when deployed). */
  features: z.object({ reports: z.boolean() }),
  cityCounts: z
    .object({
      area: z.string(),
      importedAt: z.string(),
      sources: z.array(citySourceSchema),
    })
    .nullable(),
  counts: z.object({
    source: z.enum(COUNT_SOURCES),
    label: z.string(),
    importedAt: z.string().nullable(),
    rows: z.number().int().nonnegative(),
    stationsWithData: z.number().int().nonnegative(),
  }),
  stations: z.object({
    count: z.number().int().nonnegative(),
    source: z.string(),
    fetchedAt: z.string().nullable(),
    attribution: z.string(),
  }),
  boundaries: z.object({
    kind: z.enum(['approximate', 'official']),
    label: z.string(),
  }),
});

/* --------------------------- User reports ---------------------------- */

export const createReportSchema = z
  .object({
    lat,
    lng,
    category: reportCategorySchema,
    note: z
      .string()
      .trim()
      .max(NOTE_MAX_LENGTH, `note must be at most ${NOTE_MAX_LENGTH} characters`)
      .optional()
      .transform((v) => (v ? v : undefined)),
    // TODO: add `turnstileToken: z.string()` once Cloudflare Turnstile is wired up.
  })
  .strict()
  .refine(
    (r) =>
      r.lat >= BENGALURU_BOUNDS.minLat &&
      r.lat <= BENGALURU_BOUNDS.maxLat &&
      r.lng >= BENGALURU_BOUNDS.minLng &&
      r.lng <= BENGALURU_BOUNDS.maxLng,
    { message: 'Location must be within Bengaluru', path: ['lat'] },
  );

export const reportSchema = z.object({
  id: z.string(),
  lat,
  lng,
  category: reportCategorySchema,
  note: z.string().max(NOTE_MAX_LENGTH).optional(),
  status: reportStatusSchema,
  createdAt: z.string(),
});

export const reportsResponseSchema = z.object({
  items: z.array(reportSchema),
  count: z.number().int().nonnegative(),
});

export const createReportResponseSchema = z.object({
  id: z.string(),
  status: z.literal('pending'),
});

/* ------------------------------ Helpers ------------------------------ */

/**
 * Turn a ZodError into a compact, client-friendly list.
 * @param {import('zod').ZodError} error
 * @returns {{ path: string, message: string }[]}
 */
export function formatZodIssues(error) {
  return error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}
