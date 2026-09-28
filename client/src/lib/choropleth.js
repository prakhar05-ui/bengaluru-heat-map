import { CHOROPLETH_RAMP, NO_DATA_COLOR } from './constants.js';

/**
 * @typedef {Object} ChoroplethClass
 * @property {number} min    inclusive
 * @property {number} max    inclusive
 * @property {string} color
 */

/**
 * Quantile classes over whole-number counts. Nulls (no data) are ignored.
 * Returns at most `maxClasses` non-empty, non-overlapping classes.
 * @param {Array<number|null>} values
 * @param {number} [maxClasses]
 * @returns {ChoroplethClass[]}
 */
export function computeClasses(values, maxClasses = CHOROPLETH_RAMP.length) {
  const v = values.filter((n) => typeof n === 'number').sort((a, b) => a - b);
  if (v.length === 0) return [];
  const min = v[0];
  const max = v[v.length - 1];

  const lowerBounds = [min];
  for (let i = 1; i < maxClasses; i++) {
    const t = v[Math.floor((i * v.length) / maxClasses)];
    if (t > lowerBounds[lowerBounds.length - 1]) lowerBounds.push(t);
  }

  const n = lowerBounds.length;
  const colorAt = (i) =>
    n === 1 ? CHOROPLETH_RAMP[2] : CHOROPLETH_RAMP[Math.round((i * (CHOROPLETH_RAMP.length - 1)) / (n - 1))];

  return lowerBounds.map((lo, i) => ({
    min: lo,
    max: i < n - 1 ? lowerBounds[i + 1] - 1 : max,
    color: colorAt(i),
  }));
}

/**
 * MapLibre fill-color expression for the classes, with a "no data" fallback.
 * @param {ChoroplethClass[]} classes
 */
export function fillColorExpression(classes) {
  if (classes.length === 0) return NO_DATA_COLOR;
  const byCount =
    classes.length === 1
      ? classes[0].color
      : ['step', ['get', 'count'], classes[0].color, ...classes.slice(1).flatMap((c) => [c.min, c.color])];
  return ['case', ['!=', ['typeof', ['get', 'count']], 'number'], NO_DATA_COLOR, byCount];
}

/** "12" or "12–30" */
export const formatRange = (c) => (c.min === c.max ? `${c.min}` : `${c.min}–${c.max}`);

/**
 * Quantile thresholds for continuous values (e.g. streetlights per km).
 * Returns classes { min, max, color } with min inclusive, max exclusive except the last.
 * @param {number[]} values
 * @param {string[]} ramp
 */
export function continuousClasses(values, ramp) {
  const v = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (v.length === 0) return [];
  const k = ramp.length;
  const cuts = [v[0]];
  for (let i = 1; i < k; i++) {
    const t = Math.round(v[Math.floor((i * v.length) / k)]);
    if (t > cuts[cuts.length - 1]) cuts.push(t);
  }
  return cuts.map((lo, i) => ({
    min: lo,
    max: i < cuts.length - 1 ? cuts[i + 1] : v[v.length - 1],
    color: ramp[Math.round((i * (k - 1)) / Math.max(1, cuts.length - 1))],
  }));
}

/** MapLibre step expression over a numeric property, with a fallback colour for missing values. */
export function stepExpression(property, classes, missingColor) {
  if (classes.length === 0) return missingColor;
  const byValue =
    classes.length === 1
      ? classes[0].color
      : ['step', ['get', property], classes[0].color, ...classes.slice(1).flatMap((c) => [c.min, c.color])];
  return ['case', ['!=', ['typeof', ['get', property]], 'number'], missingColor, byValue];
}
