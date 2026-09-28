import { Router } from 'express';
import { LAYER_IDS } from '@app/shared';
import { dataSource } from '../data/dataSource.js';

export const layersRouter = Router();

// GET /api/layers -> catalogue: what each layer is, where it comes from, caveats
layersRouter.get('/', async (_req, res, next) => {
  try {
    res.json(await dataSource.listLayers());
  } catch (err) {
    next(err);
  }
});

// GET /api/layers/:id -> GeoJSON for one layer
layersRouter.get('/:id', async (req, res, next) => {
  try {
    if (!LAYER_IDS.includes(req.params.id)) return res.status(404).json({ error: 'Unknown layer' });
    const data = await dataSource.getLayer(req.params.id);
    if (!data) return res.status(404).json({ error: 'Layer has not been imported' });
    // Layers change only on import; let browsers cache them briefly.
    res.set('Cache-Control', 'public, max-age=3600, s-maxage=86400').type('application/geo+json').json(data);
  } catch (err) {
    next(err);
  }
});
