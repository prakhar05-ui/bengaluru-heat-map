import { MAX_YEAR, MIN_YEAR } from '@app/shared';

export const YEARS = Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, i) => MIN_YEAR + i);

// Single-hue sequential blue ramp (light -> dark) for the choropleth. Deliberately
// NOT red/traffic-light colours: more *reports* is not a safety rating, and the
// palette should not imply one.
export const CHOROPLETH_RAMP = ['#b7d3f6', '#6da7ec', '#3987e5', '#1c5cab', '#0d366b'];

// "No data" is a neutral grey plus a dashed outline, so it never reads as "zero".
export const NO_DATA_COLOR = '#e4e2dd';

// Series colour for single-series trend charts.
export const SERIES_COLOR = '#2a78d6';
