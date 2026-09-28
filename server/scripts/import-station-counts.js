// Imports real per-station counts from a CSV into src/data/counts/station-counts.json.
//
// Usage (from the repo root):
//   npm run import:counts -w server -- --template ../station-counts-template.csv
//       Writes a CSV with every station x year x type and an empty count column to fill in.
//   npm run import:counts -w server -- path/to/counts.csv --source "RTI reply, Bengaluru City Police, Oct 2026"
//       Validates the CSV and REPLACES the counts file. Nothing is written if any row is invalid.
//
// CSV columns (header row required, any order, extra columns such as stationName are ignored):
//   stationId  id from src/data/geo/stations.geojson (e.g. osm-way-1099882755)
//   year       MIN_YEAR..MAX_YEAR from @app/shared
//   type       harassment | stalking | assault | theft
//   count      whole number >= 0. Leave BLANK when you have no figure: blank means
//              "no data" (shown as No data), 0 means "zero reported".
// Relative paths are resolved from the directory you ran npm from.
import fs from 'node:fs';
import path from 'node:path';
import { INCIDENT_TYPES, MAX_YEAR, MIN_YEAR, stationCountSchema } from '@app/shared';
import { COUNTS_FILE, loadStations, writeCountsFile } from './lib/counts-file.js';

const REQUIRED = ['stationId', 'year', 'type', 'count'];
const MAX_ERRORS_SHOWN = 25;

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

function writeTemplate(outPath, stations) {
  const lines = ['stationId,stationName,year,type,count'];
  for (const s of stations) {
    for (let year = MIN_YEAR; year <= MAX_YEAR; year++) {
      for (const type of INCIDENT_TYPES) lines.push([s.id, s.name, year, type, ''].map(csvCell).join(','));
    }
  }
  fs.writeFileSync(outPath, lines.join('\n') + '\n');
  console.log(`Wrote template with ${lines.length - 1} rows (${stations.length} stations) to ${outPath}`);
  console.log('Fill in the count column (leave blank where you have no figure), then import it.');
}

function importCsv(csvPath, sourceLabel, stations) {
  const table = parseCsv(fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, ''));
  if (table.length === 0) throw new Error('CSV is empty');

  const header = table[0].map((h) => h.trim());
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`CSV header is missing column(s): ${missing.join(', ')}`);
  const col = Object.fromEntries(REQUIRED.map((c) => [c, header.indexOf(c)]));

  const stationIds = new Set(stations.map((s) => s.id));
  const seen = new Set();
  const rows = [];
  const errors = [];
  let blank = 0;

  table.slice(1).forEach((cells, i) => {
    const line = i + 2; // 1-based, after header
    const get = (c) => (cells[col[c]] ?? '').trim();
    if (get('count') === '') { blank++; return; }

    const candidate = {
      stationId: get('stationId'),
      year: Number(get('year')),
      type: get('type').toLowerCase(),
      count: Number(get('count')),
    };
    const parsed = stationCountSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push(`line ${line}: ${parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; ')}`);
      return;
    }
    if (!stationIds.has(parsed.data.stationId)) {
      errors.push(`line ${line}: unknown stationId "${parsed.data.stationId}" (see the template for valid ids)`);
      return;
    }
    const key = `${parsed.data.stationId}|${parsed.data.year}|${parsed.data.type}`;
    if (seen.has(key)) {
      errors.push(`line ${line}: duplicate row for ${parsed.data.stationId}, ${parsed.data.year}, ${parsed.data.type}`);
      return;
    }
    seen.add(key);
    rows.push(parsed.data);
  });

  if (errors.length) {
    console.error(`Found ${errors.length} invalid row(s). Nothing was written.\n`);
    errors.slice(0, MAX_ERRORS_SHOWN).forEach((e) => console.error(`  ${e}`));
    if (errors.length > MAX_ERRORS_SHOWN) console.error(`  ...and ${errors.length - MAX_ERRORS_SHOWN} more`);
    process.exit(1);
  }
  if (rows.length === 0) throw new Error('No rows with a count. Nothing was written.');

  writeCountsFile({
    meta: { source: 'imported', label: sourceLabel, importedAt: new Date().toISOString() },
    rows,
  });
  const covered = new Set(rows.map((r) => r.stationId)).size;
  console.log(`Imported ${rows.length} rows (${blank} blank rows skipped) for ${covered} of ${stations.length} stations.`);
  console.log(`Wrote ${COUNTS_FILE}. The running server picks it up automatically.`);
}

function main() {
  const args = process.argv.slice(2);
  // npm runs workspace scripts from the workspace folder; resolve paths from where npm was invoked.
  const baseDir = process.env.INIT_CWD ?? process.cwd();
  const flag = (name) => {
    const i = args.indexOf(name);
    if (i === -1) return undefined;
    const value = args[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`${name} needs a value`);
    args.splice(i, 2);
    return value;
  };

  const stations = loadStations();
  const template = flag('--template');
  if (template) return writeTemplate(path.resolve(baseDir, template), stations);

  const source = flag('--source') ?? 'Imported figures';
  const [csvPath] = args;
  if (!csvPath) {
    throw new Error('Usage: import-station-counts.js <file.csv> [--source "label"] | --template <out.csv>');
  }
  importCsv(path.resolve(baseDir, csvPath), source, stations);
}

try {
  main();
} catch (err) {
  console.error(`Import failed: ${err.message}`);
  process.exit(1);
}
