// Shared helpers for scripts that read stations and write station-counts.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stationCountsFileSchema } from '@app/shared';

export const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const STATIONS_FILE = path.join(SERVER_DIR, 'src/data/geo/stations.geojson');
export const COUNTS_FILE = path.join(SERVER_DIR, 'src/data/counts/station-counts.json');

/** @returns {Array<{ id: string, name: string }>} */
export function loadStations() {
  if (!fs.existsSync(STATIONS_FILE)) {
    throw new Error(`Missing ${STATIONS_FILE}. Run "npm run import:stations -w server" first.`);
  }
  return JSON.parse(fs.readFileSync(STATIONS_FILE, 'utf8')).features.map((f) => f.properties);
}

/** Validate and atomically write the counts file. */
export function writeCountsFile(data) {
  const parsed = stationCountsFileSchema.parse(data);
  fs.mkdirSync(path.dirname(COUNTS_FILE), { recursive: true });
  fs.writeFileSync(`${COUNTS_FILE}.tmp`, JSON.stringify(parsed, null, 1) + '\n');
  fs.renameSync(`${COUNTS_FILE}.tmp`, COUNTS_FILE);
}
