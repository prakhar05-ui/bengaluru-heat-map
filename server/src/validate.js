import { formatZodIssues } from '@app/shared';

/**
 * Parse `req.query` with a Zod schema. Sends a 400 and returns null on failure.
 * @template T
 * @param {import('zod').ZodType<T>} schema
 * @param {unknown} input
 * @param {import('express').Response} res
 * @returns {T | null}
 */
export function parseOr400(schema, input, res) {
  const result = schema.safeParse(input);
  if (!result.success) {
    res.status(400).json({ error: 'Invalid request', issues: formatZodIssues(result.error) });
    return null;
  }
  return result.data;
}

/** Drop empty-string query params so `?type=` behaves like "not set". */
export function cleanQuery(query) {
  return Object.fromEntries(Object.entries(query).filter(([, v]) => typeof v === 'string' && v !== ''));
}
