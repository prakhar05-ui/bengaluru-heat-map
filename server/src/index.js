// Local development server. On Vercel, api/index.js serves the same app.
import app from './app.js';
import { REPORTS_ENABLED } from './config.js';

const PORT = Number(process.env.PORT ?? 4000);

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT} (community reports ${REPORTS_ENABLED ? 'on' : 'off'})`);
});
