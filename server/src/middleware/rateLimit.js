// Minimal in-memory, fixed-window rate limiter keyed by client IP.
// Fine for a single dev process. For production (multiple instances) use a
// shared store such as Redis, and set `app.set('trust proxy', ...)` so req.ip
// reflects the real client behind your load balancer.

/**
 * @param {{ windowMs: number, max: number }} options
 * @returns {import('express').RequestHandler}
 */
export function rateLimit({ windowMs, max }) {
  /** @type {Map<string, { count: number, resetAt: number }>} */
  const hits = new Map();

  // Periodically drop expired entries so the map does not grow unbounded.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, windowMs);
  sweep.unref();

  return (req, res, next) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - entry.count)));

    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many reports from this device. Please try again later.', retryAfter });
    }
    next();
  };
}
