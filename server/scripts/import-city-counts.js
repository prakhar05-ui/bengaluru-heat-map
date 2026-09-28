// Imports official city-wide figures for Bengaluru City (the police
// commissionerate) into src/data/counts/city-counts.json.
//
// Usage (from the repo root):
//   python3 server/scripts/download-open-data.py   downloads the CSVs with curl
//   npm run import:city-counts -w server           this script: offline, reads server/data-raw/opencity/
//
// Sources, in order of preference for any given year:
//   1. Bengaluru City Police "Crimes Against Women" tables (dataset "Bengaluru Crime Data - YYYY").
//      Each file covers three years: "Type of Crime, 2021 Reported, 2021 Detected, ...".
//   2. Karnataka State Police "District-wise IPC Crimes" tables (dataset "Karnataka Crime Data YYYY"),
//      using the "Bengaluru City" row only (not Bengaluru Rural / District / South).
// Only "Reported" figures are used, never "Detected".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INCIDENT_TYPES, MAX_YEAR, MIN_YEAR, cityCountsFileSchema } from '@app/shared';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = path.join(SERVER_DIR, 'data-raw/opencity');
const OUT_FILE = path.join(SERVER_DIR, 'src/data/counts/city-counts.json');

// How each official head is labelled in the source tables.
const BCP_ROW = {
  molestation: /molestation|\b354\b/i,
  insult_to_modesty: /insult\w*\s+modesty|\b509\b/i,
  rape: /^\s*rape\b|\b376\b/i,
};
const KSP_COLUMN = {
  molestation: /^molestation$/i,
  rape: /^rape$/i,
  // Not published per district: insult_to_modesty
};
const BENGALURU_CITY = /^\s*(bengaluru|bangalore)\s*city\s*$/i;

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF, BOM). */
function parseCsv(text) {
  text = text.replace(/^﻿/, '');
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
  return rows.map((r) => r.map((v) => v.replace(/\s+/g, ' ').trim()));
}

const toCount = (v) => (/^\d+$/.test(v ?? '') ? Number(v) : null);

function loadManifest() {
  const file = path.join(RAW_DIR, 'manifest.json');
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}. Run "python3 server/scripts/download-open-data.py" first.`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** BCP "Crimes Against Women" tables -> [{ year, type, count }] */
function readBcp(file) {
  const [header, ...rows] = parseCsv(fs.readFileSync(file, 'utf8'));
  const yearCols = header
    .map((h, i) => ({ i, m: h.match(/^(\d{4}) Reported$/i) }))
    .filter((c) => c.m)
    .map((c) => ({ i: c.i, year: Number(c.m[1]) }));
  const out = [];
  for (const [type, pattern] of Object.entries(BCP_ROW)) {
    const row = rows.find((r) => pattern.test(r[0] ?? ''));
    if (!row) continue;
    for (const { i, year } of yearCols) {
      const count = toCount(row[i]);
      if (count !== null) out.push({ year, type, count });
    }
  }
  return out;
}

/** KSP district-wise IPC table for one year -> [{ year, type, count }] */
function readKspDistrict(file, year) {
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  const headerIdx = rows.findIndex((r) => r.some((c) => /district|units/i.test(c)));
  if (headerIdx === -1) return [];
  const header = rows[headerIdx];
  const unitCol = header.findIndex((c) => /district|units/i.test(c));
  const city = rows.slice(headerIdx + 1).find((r) => BENGALURU_CITY.test(r[unitCol] ?? ''));
  if (!city) return [];
  const out = [];
  for (const [type, pattern] of Object.entries(KSP_COLUMN)) {
    const col = header.findIndex((h) => pattern.test(h));
    const count = col === -1 ? null : toCount(city[col]);
    if (count !== null) out.push({ year, type, count });
  }
  return out;
}

function main() {
  const manifest = loadManifest();
  const sources = [];
  /** key "year|type" -> row; first source to provide a value wins */
  const rows = new Map();

  const addSource = (dataset, file, publisher, found) => {
    const inRange = found.filter((r) => r.year >= MIN_YEAR && r.year <= MAX_YEAR && INCIDENT_TYPES.includes(r.type));
    const fresh = inRange.filter((r) => !rows.has(`${r.year}|${r.type}`));
    if (!fresh.length) return;
    const index = sources.length;
    sources.push({
      publisher,
      dataset: dataset.title,
      table: file.name,
      url: dataset.url,
      years: [...new Set(fresh.map((r) => r.year))].sort(),
    });
    for (const r of fresh) rows.set(`${r.year}|${r.type}`, { ...r, source: index });
  };

  // Newest BCP report first: its figures supersede older reports for the same year.
  const bcp = manifest.datasets
    .filter((d) => /^Bengaluru Crime Data/i.test(d.title))
    .sort((a, b) => b.title.localeCompare(a.title));
  for (const d of bcp) {
    for (const f of d.files.filter((f) => /crimes against women/i.test(f.name))) {
      addSource(d, f, 'Bengaluru City Police', readBcp(path.join(RAW_DIR, f.path)));
    }
  }

  const ksp = manifest.datasets.filter((d) => /^Karnataka\b.*Crime Data/i.test(d.title));
  for (const d of ksp) {
    const year = Number(d.title.match(/(20\d\d)/)?.[1]);
    for (const f of d.files.filter((f) => /district-wise ipc crimes/i.test(f.name))) {
      addSource(d, f, 'Karnataka State Police', readKspDistrict(path.join(RAW_DIR, f.path), year));
    }
  }

  const data = cityCountsFileSchema.parse({
    meta: { area: 'Bengaluru City (police commissionerate)', importedAt: new Date().toISOString(), sources },
    rows: [...rows.values()].sort((a, b) => a.year - b.year || INCIDENT_TYPES.indexOf(a.type) - INCIDENT_TYPES.indexOf(b.type)),
  });

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(`${OUT_FILE}.tmp`, JSON.stringify(data, null, 1) + '\n');
  fs.renameSync(`${OUT_FILE}.tmp`, OUT_FILE);

  console.log(`Wrote ${data.rows.length} city-wide rows to ${OUT_FILE}\n`);
  console.log(['year', ...INCIDENT_TYPES].join('\t'));
  for (let y = MIN_YEAR; y <= MAX_YEAR; y++) {
    console.log([y, ...INCIDENT_TYPES.map((t) => rows.get(`${y}|${t}`)?.count ?? '—')].join('\t'));
  }
  console.log('\nSources:');
  sources.forEach((s, i) => console.log(`  [${i}] ${s.publisher}, ${s.dataset} / ${s.table} (years ${s.years.join(', ')})`));
}

try {
  main();
} catch (err) {
  console.error(`Import failed: ${err.message}`);
  process.exit(1);
}
