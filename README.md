# Bengaluru Help & Reported Incidents Map

A mobile-first map for women's safety in Bengaluru. It shows who to call and where help is, not "safe" or "unsafe" areas.

> Based on reported incidents only. Reporting rates differ by area, so this is not a measure of actual safety.

**What it does, all with real public data:**
- **Your police station.** Tap anywhere, or use "Find my police station", to see the station responsible for that spot. The card shows its phone number, email, distance, directions and 112.
- **SOS.** Shares your location on WhatsApp, together with your area's police station and phone number, and has a Call 112 button.
- **Help nearby.** Hospitals (only those with a recorded emergency department when zoomed out), public health centres and Namma Clinics, and metro stations.
- **More layers.** CCTV cameras, public toilets (with whether there's a women's section), BMTC bus stops, and streetlights per km of road by ward.
- **Official figures.** City-wide reported cases for 2021–2024, with sources, on the Trends page.
- **Community reports.** Moderated reports of poor lighting, isolated stretches and harassment spots.

| Data | Source | Notes |
|---|---|---|
| Police station boundaries and locations (119) | Karnataka GIS (KGIS), via OpenCity | Public domain; map undated |
| Station phone and email (106 of 119) | Bengaluru City Police, via OpenCity | District stations (Anekal, Jigani, Sarjapura…) have none; 112 is always shown |
| City-wide figures, 2021–2024 | Bengaluru City Police (2021–23), Karnataka State Police (2024), via OpenCity | Molestation, insulting modesty, rape |
| Hospitals (1,137), metro stations (83) | OpenStreetMap contributors (ODbL) | Community-mapped |
| Health centres (139 UPHC, 239 Namma Clinics, 7 referral) | BBMP / GBA via OpenCity | Public domain; daytime clinics |
| CCTV cameras (1,541) | Citizen Matters via OpenCity (from OSM) | CC BY-NC; crowdsourced and incomplete |
| Public toilets (479), bus stops (7,486), streetlights by ward (198) | BBMP / BMTC via OpenCity | Licence not stated; undated |
| **Per-station crime counts** | **Not published** | The map shows no crime shading unless you import real figures (see "Per-station counts") |

Offence types are the official heads: **molestation** (IPC 354 / BNS 74), **insulting modesty** (IPC 509 / BNS 79) and **rape** (IPC 376 / BNS 64).

Stack:
- **Client:** Vite + React (JSX), Tailwind, React Router, TanStack Query, MapLibre GL, PMTiles, recharts
- **Server:** Node + Express (ES modules), Zod validation, in-memory rate limit
- **Shared:** Zod schemas in plain JS (`@app/shared`), used by both sides
- Plain JavaScript only (no TypeScript). No paid services, no API keys.

## Setup

Requirements: Node **18.16+** (Node 20 LTS or newer recommended) and npm 9+.

```bash
npm install
npm run dev
```

- Client: http://localhost:5173 (Vite proxies `/api` to the server)
- API: http://localhost:4000

The repo already contains all the imported data, so it runs straight away. On Node 18, `node --watch` prints a harmless `ExperimentalWarning`.

## Data workflow

All commands run from the repo root. The server re-reads data files when they change, so imports take effect without a restart.

### 1. Download

```bash
python3 server/scripts/download-open-data.py   # or: npm run data:download -w server
```

- **What it downloads:** every dataset listed above. OpenCity files come via its public API; hospitals and metro stations come from OpenStreetMap's Overpass API. Everything goes to `server/data-raw/` (git-ignored), with `opencity/manifest.json` recording sources, URLs and licences.
- **No setup needed:** it uses only Python's standard library plus the system `curl`, so there's no `pip install`. curl follows your OS's normal certificate trust, so it works behind corporate TLS proxies without changing any settings.
- **Overpass is often busy.** The script retries and tries mirrors. If all fail, it exits with code 2 and keeps the OpenCity files, so just re-run later.
- **Quick-look file:** it also writes `opencity/bengaluru_city_rows.csv`, with every "Bengaluru City" row from the Karnataka district-wise tables. It excludes Bengaluru Rural, District and South, which are different police jurisdictions.

### 2. Police stations and boundaries (official)

```bash
npm run import:stations -w server   # offline: reads data-raw/opencity, writes server/src/data/geo/
```

- **Source:** KGIS police station boundaries (polygons) joined to KGIS station locations (points). Each area is matched to the station point inside it, with name similarity breaking ties. Special units without an area of their own (CEN crime, cyber, women's stations, ISD) are skipped.
- **Phone numbers:** these come from Bengaluru City Police's station contact list, matched by name. Abbreviations like "S .R. Nagar" or "K.G. Halli" are handled by `CONTACT_ALIASES` in the script, and weaker matches are printed for review on every run. The numbers match the 2025 BCP contacts PDF where checked, but the CSV itself is undated.
- **Station IDs** are slugs of the official name, e.g. `ps-koramangala`. KGIS's own boundary IDs can't be used because they're reused when a new station is split off an older one.
- **Caveat:** the KGIS map is undated, so recently created stations may be missing or still shown inside their parent station's area.

### 3. Help points and layers

```bash
npm run import:layers -w server   # offline: writes server/src/data/layers/<id>.geojson + catalog.json
```

- **Fields kept:** only what's useful to the public. The names of officials, such as the health centres' medical officers, are dropped.
- **Catalogue:** `catalog.json` records each layer's source, licence, count, caveat and download date. The app shows this under "About this data".
- **Streetlights per km:** calculated from BBMP's per-ward streetlight count and ward road length, on the 198-ward (2015) map. It counts installed lights, not whether they work, and is not a safety rating.

### 4. City-wide figures (official)

```bash
npm run import:city-counts -w server   # offline: writes server/src/data/counts/city-counts.json
```

- **Preference order:** Bengaluru City Police's "Crimes Against Women" table is used first (it covers 2021–2023 in the 2023 report). For other years, the "Bengaluru City" row of the Karnataka State Police district-wise table is used (2024). Only **reported** figures are used, never "detected".
- **Gaps:** 2024 has no insulting-modesty figure for Bengaluru City. The app shows it as "no figure", leaves it out of the 2024 total, and marks 2024 vs 2023 as not comparable. 2025 has totals only, with no breakdown by offence.
- **Sources disagree slightly.** The Karnataka "Sexual Harassment" district tables give 757 / 1,163 molestation cases for 2022 / 2023, where BCP gives 731 / 1,135. The importer sticks to one publisher per year and records the source of each figure, and the app shows it.

### 5. Per-station counts (only if you obtain them)

No per-station figures are published, so by default the map shows station areas as outlines only, with no crime shading. If you obtain station-wise figures (e.g. through RTI), importing them adds shading, a legend, year and type filters, and per-station trends. Counts are **per police station, per year, per offence type**.

```bash
# 1. Get a pre-filled sheet: every station x year x type, with an empty count column
npm run import:counts -w server -- --template station-counts-template.csv

# 2. Fill in the "count" column in any spreadsheet app and export as CSV

# 3. Import it (replaces any previous import)
npm run import:counts -w server -- station-counts.csv --source "RTI reply, Bengaluru City Police, Oct 2026"
```

CSV format:
- **Header row required.** Column order doesn't matter, and extra columns like `stationName` are ignored.
- **`stationId`:** from the template (or `server/src/data/geo/stations.geojson`).
- **`year`:** 2021–2024. Change `MIN_YEAR` / `MAX_YEAR` in `shared/schemas.js` to support other years.
- **`type`:** `molestation`, `insult_to_modesty` or `rape` (case-insensitive).
- **`count`:** a whole number ≥ 0.

**Blank vs 0:**
- **Blank count:** you have no figure for that row, and the app shows **No data**.
- **`0`:** zero incidents were reported.
- If a station has at least one row for a year, its missing types for that year count as 0.

**Validation:** the whole file is checked before anything is written. Unknown station IDs, bad years or types, negative counts and duplicate rows are reported with their line numbers. If any row is invalid, the existing data is left untouched.

**Legal categories:** use reported (not detected) cases. Figures before 1 July 2024 are under the IPC and later ones under the BNS. The heads map one-to-one: molestation is IPC 354 / BNS 74, insulting modesty is IPC 509 / BNS 79, and rape is IPC 376 / BNS 64. To add other heads (e.g. cruelty by husband, IPC 498A), extend `INCIDENT_TYPES` in `shared/schemas.js` and the patterns in `import-city-counts.js`.

To remove imported figures, delete `server/src/data/counts/station-counts.json`.

## Project layout

```
client/                Vite app
  src/pages/           MapPage.jsx (map + side panel/bottom sheet), TrendsPage.jsx
  src/components/      MapView, JurisdictionLayer, MapLayers, LayerPanel, PoliceStationCard, SosButton,
                       CitySummary, StationSelect, ReportPinDialog, ReportPins, DataNotice, DisclaimerBanner, …
  src/api/             http.js (fetch wrappers + response validation), queries.js (TanStack Query hooks)
  src/lib/             map style, layer icons/colours (layerStyles.js), choropleth classes, geo helpers
server/
  src/index.js         Express app
  src/routes/          stations.js (incl. /at lookup), layers.js, jurisdictions.js, trends.js, meta.js, reports.js
  src/data/            dataSource.js (interface + selection), fileDataSource.js
  src/data/geo/        stations.geojson, jurisdictions.geojson, meta.json   (official KGIS data)
  src/data/counts/     city-counts.json     official city-wide figures, with sources
                       station-counts.json  per-station counts, only if you import them
  src/data/layers/     catalog.json + <id>.geojson for hospitals, health, metro, cctv, toilets, bus-stops, streetlights
  src/data/mock/       reports.json (seed community reports)
  scripts/             download-open-data.py, import-kgis-stations.js, import-layers.js,
                       import-city-counts.js, import-station-counts.js
shared/                schemas.js (Zod), published to the workspace as @app/shared
```

## API

| Method | Path | Query / body | Returns |
|---|---|---|---|
| GET | `/api/jurisdictions` | `year=2021` or `year=2021-2024`, `type=molestation\|insult_to_modesty\|rape` | GeoJSON polygons with `{ stationId, stationName, count \| null, yearsCovered, yearsInRange }` |
| GET | `/api/trends` | `stationId=`, `type=` (both optional) | `{ stationId, type, scope: city\|station, points: [{ year, count \| null, missingTypes?, source? }] }` |
| GET | `/api/stations` | | GeoJSON points `{ id, name, locationSource, phone?, email?, division?, subdivision? }` |
| GET | `/api/stations/at` | `lat=`, `lng=` | `{ station, coordinates }` for the station whose official area contains the point; `404` outside all areas |
| GET | `/api/layers` | | Layer catalogue: id, label, group, kind, count, source, licence, caveat |
| GET | `/api/layers/:id` | | GeoJSON for one layer (cached for 1 hour) |
| GET | `/api/meta` | | Provenance: city-wide sources, per-station counts (`none` or `imported`), station and boundary source |
| GET | `/api/reports` | | `{ items, count }`, **approved reports only** |
| POST | `/api/reports` | `{ lat, lng, category: poor_lighting\|isolated\|harassment_spot, note? (≤200) }` | `201 { id, status: "pending" }` |

- `count: null` always means "no data". It is never used for zero.
- `/api/trends` without `stationId` returns the **official city-wide figures** (`scope: "city"`), never a sum of per-station counts. With "all types", `missingTypes` lists offences with no figure that year (left out of `count`), and `source` indexes `meta.cityCounts.sources`.
- Invalid input returns `400 { error, issues: [{ path, message }] }`.
- `POST /api/reports` is limited to 5 requests per IP per 10 minutes and returns `429` after that. There is a `TODO` for Cloudflare Turnstile verification.

## Data and wording principles

- The UI says **"reported incidents"** everywhere and never labels an area "dangerous" or "unsafe".
- **No invented numbers.** Crime shading appears only with real imported per-station figures. City-wide figures always show their source.
- **Layers stay separate and factual.** They are never combined into a "safety score". Streetlight density and CCTV coverage describe infrastructure, not safety.
- **Identity never relies on colour alone.** Each layer has its own icon shape and glyph as well as a colour, because six colours can't all be told apart, especially with colour-vision deficiency.
- If you import per-station figures, the choropleth uses a single-hue blue ramp rather than red. "No data" is grey with a dashed outline, so it is never confused with zero.
- **No individual or criminal-record data** anywhere: only aggregated counts per station, year and type.
- Community reports are saved as `pending` and only `approved` ones are public.
- **Raw counts favour big or busy areas.** Consider adding population (Census ward data) to show rates per 1,000 residents.

## Updating boundaries

`npm run import:stations -w server` rebuilds the boundaries from the downloaded KGIS files. If you get a newer or corrected boundary map (e.g. from Bengaluru City Police through RTI), write it to `server/src/data/geo/jurisdictions.geojson`:
- **Format:** a FeatureCollection of Polygon or MultiPolygon features, each with `properties: { stationId, stationName }`, where `stationId` matches `stations.geojson`.
- **Label:** update `boundaries.label` in `meta.json` to name the source.

Re-running `import:stations` will overwrite a hand-placed file.

## How to swap files for PostGIS

Routes only talk to `dataSource` from `server/src/data/dataSource.js`. The `DataSource` contract is documented there in JSDoc: `listStations`, `stationExists`, `listJurisdictions`, `getTrends`, `getMeta`, `listReports`, `createReport`, all async.

1. **Install a driver:** `npm install pg -w server`
2. **Create the schema:**
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;

   CREATE TABLE police_stations (
     id              text PRIMARY KEY,       -- e.g. ps-koramangala
     name            text NOT NULL,
     location_source text NOT NULL CHECK (location_source IN ('station','area')),
     geom            geometry(Point, 4326) NOT NULL
   );

   CREATE TABLE jurisdictions (
     station_id text PRIMARY KEY REFERENCES police_stations(id),
     kind       text NOT NULL CHECK (kind IN ('approximate','official')),
     geom       geometry(MultiPolygon, 4326) NOT NULL
   );
   CREATE INDEX jurisdictions_geom_idx ON jurisdictions USING gist (geom);

   CREATE TABLE station_counts (
     station_id text NOT NULL REFERENCES police_stations(id),
     year       int  NOT NULL,
     type       text NOT NULL CHECK (type IN ('molestation','insult_to_modesty','rape')),
     count      int  NOT NULL CHECK (count >= 0),
     source     text NOT NULL,
     PRIMARY KEY (station_id, year, type)
   );

   CREATE TABLE city_counts (          -- official city-wide figures
     year   int  NOT NULL,
     type   text NOT NULL,
     count  int  NOT NULL CHECK (count >= 0),
     source text NOT NULL,             -- publisher + table
     PRIMARY KEY (year, type)
   );

   CREATE TABLE reports (
     id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     category   text NOT NULL CHECK (category IN ('poor_lighting','isolated','harassment_spot')),
     note       varchar(200),
     status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
     created_at timestamptz NOT NULL DEFAULT now(),
     geom       geometry(Point, 4326) NOT NULL
   );
   CREATE INDEX reports_status_idx ON reports (status);
   ```
3. **Implement `server/src/data/postgisDataSource.js`** with the same return shapes as `fileDataSource.js`. The core query:
   ```js
   // listJurisdictions({ year, type }): sum covered years; NULL when no year in range has data
   const { rows } = await pool.query(
     `WITH yearly AS (
        SELECT station_id, year,
               SUM(count) FILTER (WHERE $3::text IS NULL OR type = $3) AS n
          FROM station_counts
         WHERE year BETWEEN $1 AND $2
         GROUP BY station_id, year)
      SELECT j.station_id AS "stationId", s.name AS "stationName",
             SUM(y.n)::int AS count, COUNT(y.year)::int AS "yearsCovered",
             ST_AsGeoJSON(j.geom)::json AS geometry
        FROM jurisdictions j
        JOIN police_stations s ON s.id = j.station_id
        LEFT JOIN yearly y ON y.station_id = j.station_id
       GROUP BY j.station_id, s.name, j.geom`,
     [year?.from ?? MIN_YEAR, year?.to ?? MAX_YEAR, type ?? null],
   );
   // Map rows to Features and add yearsInRange = to - from + 1. Same pattern for getTrends.
   ```
4. **Register it** in `selectDataSource()` in `dataSource.js` (the `postgis` case is stubbed in a comment), then run with `DATA_SOURCE=postgis DATABASE_URL=postgres://… npm run dev`.
5. **Load data** from the existing files: `ogr2ogr` for the GeoJSON, and `COPY` from the CSV you imported.

**Stations, contacts and layers in PostGIS:**
- **Contacts:** add `phone`, `email`, `division` and `subdivision` columns to `police_stations`.
- **Station lookup:** `stationAt` becomes `SELECT … FROM jurisdictions j JOIN police_stations s ON s.id = j.station_id WHERE ST_Contains(j.geom, ST_SetSRID(ST_Point($lng, $lat), 4326))`.
- **Layers:** these are reference data, so they can stay as static files. Or load them into `map_layer_features(layer_id text, props jsonb, geom geometry)` and serve `getLayer` with `ST_AsGeoJSON`.

## Deploying to Vercel (free)

The repo is ready for Vercel as-is. `vercel.json` builds the client, serves it from Vercel's CDN, and runs the whole Express API as one serverless function (`api/index.js`) with the data files bundled in.

1. **Push to GitHub.** A private repo is fine.
2. **Import the project.** On [vercel.com](https://vercel.com), sign in with GitHub, then "Add New → Project" and pick the repo. Leave **Root Directory** as the repo root. The build settings come from `vercel.json`, so there's nothing to change.
3. **Environment variables:** none are required. Optionally set `REPORTS_ENABLED=false` to be explicit; reports are already off on Vercel by default.
4. **Deploy,** then check the live site:
   - `https://<your-app>.vercel.app/api/health` returns `{"ok":true}`
   - the map shows the Protomaps basemap, and "Use my location" finds a station
   - `/trends` loads directly, not only by navigating to it
   - `curl -I -H "Range: bytes=0-100" https://<your-app>.vercel.app/bengaluru.pmtiles` returns `206`. The basemap needs range requests. If it ever doesn't, host the file on Cloudflare R2 and set `VITE_TILES_URL` in Vercel.

Every push to the main branch redeploys, and pull requests get preview URLs.

**How deployed mode differs from local:**
- **Community reports are off** (the UI shows "Coming soon", and `POST /api/reports` returns 503). They need a database and a moderation step first. Locally they stay on, with example reports, for development.
- **Basemap:** production builds use the self-hosted Bengaluru map (`client/public/bengaluru.pmtiles`, set in `client/.env.production`). Development keeps the OSM raster fallback unless you set `VITE_TILES_URL` in `client/.env.local`.
- **Caching:** reference data (stations, layers) is cached on Vercel's CDN for a day, and hashed assets for a year.

**Refreshing the basemap** (every few months):
```bash
pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles client/public/bengaluru.pmtiles \
  --bbox=77.3,12.7,77.95,13.25 --maxzoom=14
```
The file is about 18 MB. MapLibre scales the zoom-14 data up smoothly for street level.

## Production notes

- Set `VITE_TILES_URL`. The OSM raster fallback is for development only.
- **Caching and size:** responses are gzip-compressed. Layers are fetched only when switched on (bus stops are about 100 KB gzipped). Consider a CDN in front of `/api/layers/*` and `/api/jurisdictions`.
- **Licences:** the CCTV layer is CC BY-NC (non-commercial). Remove it, or get permission, if the app is ever used commercially. OpenStreetMap data (hospitals, metro) needs "© OpenStreetMap contributors" attribution, which the app shows.
- **Keep contacts fresh:** re-run the download and imports periodically. Phone numbers and new stations change over time.
- The in-memory rate limiter and reports store are per-process. Use Redis/Postgres, and set `app.set('trust proxy', …)` behind a load balancer.
- Wire up Cloudflare Turnstile (free) on `ReportPinDialog` and verify it in `POST /api/reports`.
- Add a moderation tool that sets report `status = 'approved'`.

### Environment variables

| Where | Variable | Default | Purpose |
|---|---|---|---|
| client | `VITE_TILES_URL` | _(unset)_ | PMTiles vector basemap URL (Protomaps schema). `pmtiles://` prefix optional. |
| client | `VITE_API_BASE_URL` | `''` | Set if the API is not served from the same origin. |
| server | `PORT` | `4000` | API port |
| server | `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated allowed origins |
| server | `DATA_SOURCE` | `file` | Which data source implementation to load |

Copy `client/.env.example` to `client/.env.local` to set client variables.

### Basemap tiles

- **With `VITE_TILES_URL`:** MapLibre loads your PMTiles file through the `pmtiles` protocol and styles it with `@protomaps/basemaps`. To make a Bengaluru extract, use the free [`pmtiles` CLI](https://docs.protomaps.com/pmtiles/cli):
  ```bash
  pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles bengaluru.pmtiles --bbox=77.3,12.7,77.95,13.25
  ```
  Host the file anywhere that supports HTTP range requests (Cloudflare R2, S3, or `client/public/` for local testing).
- **Without it (dev only):** the map falls back to OSM raster tiles with attribution. This is **not for production**. OSM's tile usage policy forbids it. Production builds without `VITE_TILES_URL` show a plain background instead.
