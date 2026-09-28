import { Router } from 'express';
import { stationLookupQuerySchema } from '@app/shared';
import { dataSource } from '../data/dataSource.js';
import { parseOr400 } from '../validate.js';

export const stationsRouter = Router();

// GET /api/stations -> GeoJSON FeatureCollection
stationsRouter.get('/', async (_req, res, next) => {
  try {
    res.set('Cache-Control', 'public, max-age=3600, s-maxage=86400').type('application/geo+json').json(await dataSource.listStations());
  } catch (err) {
    next(err);
  }
});

// GET /api/stations/at?lat=12.97&lng=77.59 -> the police station whose official area contains the point
stationsRouter.get('/at', async (req, res, next) => {
  try {
    const q = parseOr400(stationLookupQuerySchema, req.query, res);
    if (!q) return;
    const result = await dataSource.stationAt(q.lat, q.lng);
    if (!result) return res.status(404).json({ error: 'This location is outside the mapped police station areas.' });
    res.json(result);
  } catch (err) {
    next(err);
  }
});
