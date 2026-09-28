// The Express app, without starting a server. Used by src/index.js (local
// development) and by api/index.js (Vercel serverless function).
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { jurisdictionsRouter } from './routes/jurisdictions.js';
import { layersRouter } from './routes/layers.js';
import { metaRouter } from './routes/meta.js';
import { trendsRouter } from './routes/trends.js';
import { stationsRouter } from './routes/stations.js';
import { reportsRouter } from './routes/reports.js';

// Comma-separated list of allowed origins; defaults to the Vite dev server.
// Not needed on Vercel, where the site and the API share one origin.
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173').split(',');

const app = express();
app.disable('x-powered-by');
// Behind Vercel's proxy, trust the forwarded client IP (used by the reports rate limiter).
if (process.env.VERCEL) app.set('trust proxy', 1);
app.use(compression());
app.use(cors({ origin: CORS_ORIGINS }));
app.use(express.json({ limit: '10kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/jurisdictions', jurisdictionsRouter);
app.use('/api/meta', metaRouter);
app.use('/api/layers', layersRouter);
app.use('/api/trends', trendsRouter);
app.use('/api/stations', stationsRouter);
app.use('/api/reports', reportsRouter);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
