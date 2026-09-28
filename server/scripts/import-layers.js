// Builds the help-point and optional map layers from downloaded open data.
//
// Usage (from the repo root):
//   python3 server/scripts/download-open-data.py   downloads everything with curl
//   npm run import:layers -w server                  this script: offline
//
// Writes src/data/layers/<id>.geojson and src/data/layers/catalog.json (sources,
// licences, counts, caveats). Only fields useful to the public are kept; names of
// individual officials are dropped.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import simplify from '@turf/simplify';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OC = path.join(SERVER_DIR, 'data-raw/opencity');
const OSM_FILE = path.join(SERVER_DIR, 'data-raw/osm/hospitals-metro.json');
const OUT_DIR = path.join(SERVER_DIR, 'src/data/layers');
const BOUNDS = { minLng: 77.3, minLat: 12.7, maxLng: 77.95, maxLat: 13.3 };

const round5 = (n) => Math.round(n * 1e5) / 1e5;
const inBounds = ([x, y]) => x >= BOUNDS.minLng && x <= BOUNDS.maxLng && y >= BOUNDS.minLat && y <= BOUNDS.maxLat;
const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim() || undefined;
const decodeXml = (s) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

function read(rel) {
  const file = path.join(OC, rel);
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}. Run "python3 server/scripts/download-open-data.py" first.`);
  return fs.readFileSync(file, 'utf8');
}

/** Minimal CSV parser (quoted fields, escaped quotes, CRLF, BOM). */
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
  const [header, ...body] = rows.map((r) => r.map((v) => v.replace(/\s+/g, ' ').trim()));
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const placemarks = (kml) => kml.match(/<Placemark[\s\S]*?<\/Placemark>/g) ?? [];
/** KML <SimpleData name=k> or <Data name=k><value> */
function kmlField(pm, key) {
  const esc = key.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&');
  const m =
    pm.match(new RegExp(`<SimpleData name="${esc}">\\s*([^<]*?)\\s*</SimpleData>`)) ??
    pm.match(new RegExp(`<Data name=["']${esc}["']>\\s*<value>\\s*([^<]*?)\\s*</value>`));
  return m ? clean(decodeXml(m[1])) : undefined;
}
const kmlPoint = (pm) => {
  const c = pm.match(/<Point>\s*<coordinates>\s*([^<]+?)\s*<\/coordinates>/)?.[1];
  return c ? c.split(',').slice(0, 2).map(Number) : null;
};
const kmlPolygons = (pm) =>
  (pm.match(/<Polygon[\s\S]*?<\/Polygon>/g) ?? []).map((poly) =>
    ['outerBoundaryIs', 'innerBoundaryIs'].flatMap((tag) =>
      (poly.match(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'g')) ?? []).map((b) =>
        b
          .match(/<coordinates>([\s\S]*?)<\/coordinates>/)[1]
          .trim()
          .split(/\s+/)
          .map((t) => t.split(',').slice(0, 2).map(Number)),
      ),
    ),
  );

const point = (coord, properties) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: coord.map(round5) },
  properties: Object.fromEntries(Object.entries(properties).filter(([, v]) => v !== undefined && v !== '')),
});

/** "97398 95701" / "080-2297 5671" -> normalised digits string, or undefined. */
function cleanPhone(raw) {
  const d = (raw ?? '').split(/[,/;]/)[0].replace(/\D/g, '');
  if (/^0\d{10}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (/^[6-9]\d{9}$/.test(d)) return d;
  if (/^\d{8}$/.test(d)) return `080-${d}`; // Bengaluru landline without STD code
  return undefined;
}

/** Drop near-duplicates (same normalised name within `metres`). */
function dedupe(features, metres = 200) {
  const out = [];
  const key = (f) => (f.properties.name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const f of features) {
    const [x, y] = f.geometry.coordinates;
    const dup = out.find((o) => {
      if (key(o) !== key(f)) return false;
      const [ox, oy] = o.geometry.coordinates;
      const dx = (x - ox) * 111320 * Math.cos((y * Math.PI) / 180);
      const dy = (y - oy) * 110540;
      return Math.hypot(dx, dy) < metres;
    });
    if (!dup) out.push(f);
  }
  return out;
}

/* ------------------------------- Layers -------------------------------- */

function osmElements() {
  if (!fs.existsSync(OSM_FILE)) throw new Error(`Missing ${OSM_FILE}. Run the downloader again (Overpass may have been busy).`);
  return JSON.parse(fs.readFileSync(OSM_FILE, 'utf8')).elements;
}
const osmCoord = (el) => [el.lon ?? el.center?.lon, el.lat ?? el.center?.lat];

function hospitals() {
  const features = osmElements()
    .filter((el) => el.tags?.amenity === 'hospital' && el.tags.name)
    .map((el) =>
      point(osmCoord(el), {
        name: clean(el.tags['name:en'] ?? el.tags.name),
        emergency: el.tags.emergency === 'yes' ? 'yes' : el.tags.emergency === 'no' ? 'no' : undefined,
        phone: cleanPhone(el.tags.phone ?? el.tags['contact:phone']),
        ownership: ['government', 'public'].includes(el.tags['operator:type']) ? 'government' : el.tags['operator:type'] === 'private' ? 'private' : undefined,
      }),
    )
    .filter((f) => inBounds(f.geometry.coordinates));
  return dedupe(features);
}

function metro() {
  const features = osmElements()
    .filter((el) => el.tags?.amenity !== 'hospital' && el.tags?.name)
    .filter((el) => !/proposed|under construction/i.test(el.tags.name) && !el.tags.proposed && !el.tags.construction)
    .map((el) => point(osmCoord(el), { name: clean(el.tags['name:en'] ?? el.tags.name).replace(/\s*metro station$/i, ''), line: clean(el.tags.colour) }))
    .filter((f) => inBounds(f.geometry.coordinates));
  return dedupe(features, 400);
}

function healthCentres() {
  const dir = 'bengaluru-urban-public-health-centres';
  const uphc = placemarks(read(`${dir}/BBMP_-_Urban_Public_Health_Centres_UPHC_Map.kml`)).map((pm) => {
    const lat = Number(kmlField(pm, 'Lattitude'));
    const lng = Number(kmlField(pm, 'Longitude'));
    const coord = Number.isFinite(lat) && Number.isFinite(lng) && lat && lng ? [lng, lat] : kmlPoint(pm);
    const name = kmlField(pm, 'UPHC');
    return coord && point(coord, {
      name: name && `${name.replace(/\s*uphc$/i, '')} Urban Primary Health Centre`,
      kind: 'Urban primary health centre',
      phone: cleanPhone(kmlField(pm, 'Contact_No')),
    });
  });
  const referral = placemarks(read(`${dir}/BBMP_UCHC_Referral_Hospitals.kml`)).map((pm) => {
    const coord = kmlPoint(pm);
    return coord && point(coord, { name: kmlField(pm, 'UCHC_HospitalName'), kind: 'Referral hospital (BBMP)' });
  });
  const namma = JSON.parse(read(`${dir}/Namma_Clinics_Locations_2026.geojson`)).features.map((f) =>
    f.geometry?.type === 'Point'
      ? point(f.geometry.coordinates, {
          name: clean(f.properties['Name of the Namma Clinic'])?.replace(/\bCinic\b/i, 'Clinic'),
          kind: 'Namma Clinic',
          area: clean(f.properties['Namma clinic covering area name']),
        })
      : null,
  );
  return [...uphc, ...referral, ...namma].filter((f) => f && f.properties.name && inBounds(f.geometry.coordinates));
}

function cctv() {
  return placemarks(read('bengaluru-cctv-cameras/Bengaluru_-_CCTV_Cameras_Map.kml'))
    .map((pm) => {
      const coord = kmlPoint(pm);
      return coord && point(coord, {
        surveyed: kmlField(pm, 'survey:date') ?? kmlField(pm, 'check_date'),
        operator: kmlField(pm, 'operator'),
      });
    })
    .filter((f) => f && inBounds(f.geometry.coordinates));
}

function toilets() {
  return parseCsv(read('bengaluru-public-toilets/BBMP_Existing_Toilets.csv'))
    .map((r) => {
      const coord = [Number(r.longitude), Number(r.latitude)];
      if (!coord.every(Number.isFinite)) return null;
      return point(coord, {
        name: clean(r['Location of the Toilet']),
        road: clean(r['Name of the Road/ street']),
        ward: clean(r['Ward Name']),
        ladies: /^yes$/i.test(r.Ladies) ? 'yes' : /^no$/i.test(r.Ladies) ? 'no' : undefined,
      });
    })
    .filter((f) => f && inBounds(f.geometry.coordinates));
}

function busStops() {
  return placemarks(read('bengaluru-bus-stops-and-routes/BMTC_Bus_stops_Locations.kml'))
    .filter((pm) => kmlField(pm, 'status') !== 'No')
    .map((pm) => {
      const coord = kmlPoint(pm);
      return coord && point(coord, { name: kmlField(pm, 'kgisbmtcbusstopname') });
    })
    .filter((f) => f && inBounds(f.geometry.coordinates));
}

function streetlights() {
  const lights = new Map(
    parseCsv(read('bengaluru-streetlights/Streetlights_in_Bengaluru_wards.csv'))
      .filter((r) => /^\d+$/.test(r.Ward_No))
      .map((r) => {
        // The header cell contains a stray line break ("Street lights\r#"), so match it loosely.
        const key = Object.keys(r).find((k) => /street\s*lights/i.test(k));
        return [Number(r.Ward_No), Number(String(r[key]).replace(/,/g, ''))];
      }),
  );
  const roads = new Map(
    parseCsv(read('bengaluru-bbmp-ward-details/BBMP_Ward_Area_and_Road_Length.csv'))
      .filter((r) => /^\d+$/.test(r.Ward_No))
      .map((r) => [Number(r.Ward_No), { area: Number(r['Area (sq km)']), roadKm: Number(r['Road length (kms)']) }]),
  );
  return placemarks(read('bbmp-ward-information/BBMP_Ward_Map_-_2015.kml'))
    .map((pm) => {
      const ward = Number(pm.match(/<name>\s*Ward\s+(\d+)\s*<\/name>/i)?.[1]);
      const polygons = kmlPolygons(pm);
      if (!ward || !polygons.length) return null;
      const count = lights.get(ward);
      const road = roads.get(ward);
      const perKm = count && road?.roadKm ? Math.round((count / road.roadKm) * 10) / 10 : undefined;
      const geometry = polygons.length === 1 ? { type: 'Polygon', coordinates: polygons[0] } : { type: 'MultiPolygon', coordinates: polygons };
      const f = simplify({ type: 'Feature', properties: {}, geometry }, { tolerance: 0.0001 });
      const r = (ring) => ring.map(([x, y]) => [round5(x), round5(y)]);
      return {
        type: 'Feature',
        geometry:
          f.geometry.type === 'Polygon'
            ? { type: 'Polygon', coordinates: f.geometry.coordinates.map(r) }
            : { type: 'MultiPolygon', coordinates: f.geometry.coordinates.map((p) => p.map(r)) },
        properties: Object.fromEntries(
          Object.entries({ ward, name: kmlField(pm, 'Ward Name'), lights: count, roadKm: road?.roadKm, perKm }).filter(([, v]) => v !== undefined),
        ),
      };
    })
    .filter(Boolean);
}

/* ------------------------------ Catalogue ------------------------------ */

const manifest = () => JSON.parse(read('manifest.json'));
const opencityUrl = (name) => `https://data.opencity.in/dataset/${name}`;

const LAYERS = [
  {
    id: 'hospitals',
    group: 'help',
    kind: 'point',
    label: 'Hospitals',
    build: hospitals,
    minzoom: 12.5, // below this, only hospitals with a recorded emergency department are drawn
    source: { name: 'OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright', licence: 'ODbL 1.0' },
    caveat: 'Community-mapped. When zoomed out, only hospitals with a recorded emergency department are shown; zoom in for all. Emergency status is only known where mapped, so call ahead or dial 112.',
  },
  {
    id: 'health',
    group: 'help',
    kind: 'point',
    label: 'Public health centres',
    build: healthCentres,
    source: { name: 'BBMP / GBA via OpenCity (health centres, Namma Clinics 2026, referral hospitals)', url: opencityUrl('bengaluru-urban-public-health-centres'), licence: 'Public domain' },
    caveat: 'Government clinics with daytime hours; most are not emergency facilities.',
  },
  {
    id: 'metro',
    group: 'help',
    kind: 'point',
    label: 'Metro stations',
    build: metro,
    source: { name: 'OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright', licence: 'ODbL 1.0' },
    caveat: 'Operational Namma Metro stations as mapped in OpenStreetMap; proposed stations are excluded.',
  },
  {
    id: 'cctv',
    group: 'other',
    kind: 'point',
    label: 'CCTV cameras',
    build: cctv,
    source: { name: 'Citizen Matters via OpenCity (from OpenStreetMap)', url: opencityUrl('bengaluru-cctv-cameras'), licence: 'CC BY-NC (non-commercial)' },
    caveat: 'Crowdsourced and incomplete: an area without dots may still have cameras. Owner and working status are unknown.',
  },
  {
    id: 'toilets',
    group: 'other',
    kind: 'point',
    label: 'Public toilets',
    build: toilets,
    source: { name: 'BBMP via OpenCity', url: opencityUrl('bengaluru-public-toilets'), licence: 'Not stated' },
    caveat: 'BBMP list of existing toilets; opening hours and condition are unknown.',
  },
  {
    id: 'bus-stops',
    group: 'other',
    kind: 'point',
    label: 'Bus stops (BMTC)',
    build: busStops,
    minzoom: 13,
    source: { name: 'BMTC / KGIS via OpenCity', url: opencityUrl('bengaluru-bus-stops-and-routes'), licence: 'Not stated' },
    caveat: 'Shown when zoomed in.',
  },
  {
    id: 'streetlights',
    group: 'other',
    kind: 'fill',
    label: 'Streetlights per km of road',
    build: streetlights,
    source: { name: 'BBMP via OpenCity (streetlight counts, 2015 ward map, ward road lengths)', url: opencityUrl('bengaluru-streetlights'), licence: 'Not stated' },
    caveat: 'Count of installed streetlights per ward (198-ward map), undated; not whether they work or where on the road they are.',
  },
];

function main() {
  const downloadedAt = manifest().downloadedAt;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const catalog = [];
  for (const { build, ...layer } of LAYERS) {
    const features = build();
    const file = path.join(OUT_DIR, `${layer.id}.geojson`);
    fs.writeFileSync(`${file}.tmp`, JSON.stringify({ type: 'FeatureCollection', features }) + '\n');
    fs.renameSync(`${file}.tmp`, file);
    catalog.push({ ...layer, count: features.length, downloadedAt });
    console.log(`${layer.id.padEnd(13)} ${String(features.length).padStart(5)} features  ${Math.round(fs.statSync(file).size / 1024)} KB`);
  }
  fs.writeFileSync(path.join(OUT_DIR, 'catalog.json'), JSON.stringify(catalog, null, 1) + '\n');
  console.log(`\nWrote ${catalog.length} layers to ${OUT_DIR}`);
}

try {
  main();
} catch (err) {
  console.error(`Import failed: ${err.message}`);
  process.exit(1);
}
