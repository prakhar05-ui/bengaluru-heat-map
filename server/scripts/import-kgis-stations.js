// Imports official Bengaluru police station boundaries and locations.
//
// Source: Karnataka GIS (KGIS) layers published on OpenCity (data.opencity.in),
// licence "Public Domain":
//   - "Bengaluru Police Jurisdictions Map" (polygons)
//   - "Bengaluru Urban Police Station Locations" (points)
// plus Bengaluru City Police's station contact list (phone, email, division).
// Stations outside the city police (e.g. Anekal, Jigani) have no listed phone.
//
// Usage (from the repo root):
//   python3 server/scripts/download-open-data.py  downloads the files with curl
//   npm run import:stations -w server              this script: offline, reads server/data-raw/opencity/
//
// Writes to src/data/geo/: stations.geojson, jurisdictions.geojson, meta.json
//
// Station IDs are slugs of the official boundary name (e.g. "ps-koramangala").
// KGIS boundary IDs can't be used: they are reused when a station is split off
// from an older one.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import pointOnFeature from '@turf/point-on-feature';
import simplify from '@turf/simplify';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = path.join(SERVER_DIR, 'data-raw/opencity');
const OUT_DIR = path.join(SERVER_DIR, 'src/data/geo');
const BOUNDARIES_KML = 'police-jurisdiction-maps-for-major-cities-of-india/Bengaluru_Police_Jurisdictions_Map.kml';
const STATIONS_KML = 'police-station-locations/Bengaluru_Urban_Police_Station_Locations.kml';
const CONTACTS_CSV = 'bengaluru-city-police-contact-info/Bengaluru_City_Police_Police_Stations_Contact_Numbers.csv';
const CONTACT_MATCH_MIN = 0.72; // name similarity needed to attach a phone number
// BCP contact names that are abbreviations of the official station names (contact key -> station id).
const CONTACT_ALIASES = {
  srnagar: 'ps-sampangiramanagar',
  djhalli: 'ps-devarajeevanahalli',
  halasoor: 'ps-halasur',
  jbnagar: 'ps-jeevanbheemanagar',
  kghalli: 'ps-kadugondanahalli',
  rmcyard: 'ps-yeshwanthpurarmcyard',
  jpnagar: 'ps-jayaprakashnagar',
  madivala: 'ps-madiwala',
};

// Units without a geographic jurisdiction of their own.
const SPECIAL_UNIT = /\bcen\b|cyber|women|\bisd\b/i;
const SIMPLIFY_TOLERANCE = 0.0001; // degrees, ~11 m: keeps shapes, shrinks the file a lot

const round5 = (n) => Math.round(n * 1e5) / 1e5;
const decodeXml = (s) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

function readRaw(rel) {
  const file = path.join(RAW_DIR, rel);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${file}. Run "python3 server/scripts/download-open-data.py" first.`);
  }
  return fs.readFileSync(file, 'utf8');
}

const placemarks = (kml) => kml.match(/<Placemark[\s\S]*?<\/Placemark>/g) ?? [];

function simpleData(pm, key) {
  const m = pm.match(new RegExp(`<SimpleData name="${key}">\\s*([^<]*?)\\s*</SimpleData>`));
  return m ? decodeXml(m[1]).replace(/\s+/g, ' ').trim() : undefined;
}

/** "lon,lat,0 lon,lat,0 ..." -> [[lon, lat], ...] */
const parseCoords = (text) =>
  text
    .trim()
    .split(/\s+/)
    .map((t) => t.split(',').slice(0, 2).map(Number))
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

/** All <Polygon> elements in a placemark -> GeoJSON polygon coordinate arrays. */
function parsePolygons(pm) {
  return (pm.match(/<Polygon[\s\S]*?<\/Polygon>/g) ?? []).map((poly) => {
    const ring = (tag) =>
      (poly.match(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'g')) ?? []).map((b) =>
        parseCoords(b.match(/<coordinates>([\s\S]*?)<\/coordinates>/)[1]),
      );
    return [...ring('outerBoundaryIs'), ...ring('innerBoundaryIs')];
  });
}

/** Normalised key for matching names across files: "Kadugondana Halli PS" -> "kadugondanahalli". */
const nameKey = (name) =>
  name
    .toLowerCase()
    .replace(/\bbangalore\b|\bbengaluru\b/g, '')
    .replace(/\bp\.?s\.?\b|police station/g, '')
    .replace(/[^a-z]/g, '');

/** Dice coefficient on character bigrams, for fuzzy tie-breaks between spellings. */
function similarity(a, b) {
  const grams = (s) => new Set(Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2)));
  const A = grams(a);
  const B = grams(b);
  if (!A.size || !B.size) return a === b ? 1 : 0;
  let hits = 0;
  for (const g of A) if (B.has(g)) hits++;
  return (2 * hits) / (A.size + B.size);
}

const titleCase = (s) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** "Kaggalipura PS" -> "Kaggalipura Police Station" */
const displayName = (raw) =>
  `${titleCase(raw.replace(/,.*$/, '').replace(/\s*P\.?S\.?\s*$/, '').replace(/\s+/g, ' ').trim())} Police Station`;

/** Minimal CSV parser (quoted fields, escaped quotes, CRLF, BOM). */
function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '');
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

/** "080 22942076" -> "080-22942076"; keeps only plausible Indian landline/mobile numbers. */
function cleanPhone(raw) {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (/^0\d{10}$/.test(digits)) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (/^[6-9]\d{9}$/.test(digits)) return digits;
  return undefined;
}

/** BCP station contacts: [{ key, name, division, subdivision, phone, email }] */
function loadContacts() {
  const file = path.join(RAW_DIR, CONTACTS_CSV);
  if (!fs.existsSync(file)) return [];
  const [header, ...rows] = parseCsv(fs.readFileSync(file, 'utf8'));
  const col = (re) => header.findIndex((h) => re.test(h));
  const c = { name: col(/police station/i), division: col(/^division/i), subdivision: col(/sub.?division/i), phone: col(/phone/i), email: col(/mail/i) };
  return rows
    .filter((r) => r[c.name])
    .map((r) => ({
      key: nameKey(r[c.name]),
      name: r[c.name],
      division: r[c.division] || undefined,
      subdivision: r[c.subdivision] || undefined,
      phone: cleanPhone(r[c.phone]),
      email: /^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(r[c.email] ?? '') ? r[c.email].toLowerCase() : undefined,
    }));
}

/** Pair stations with contacts (aliases first, then name similarity); each contact is used at most once. */
function matchContacts(stationKeys, contacts) {
  const pairs = [];
  stationKeys.forEach((sk, si) =>
    contacts.forEach((c, ci) =>
      pairs.push({ si, ci, score: CONTACT_ALIASES[c.key] === `ps-${sk}` ? 2 : similarity(sk, c.key) }),
    ),
  );
  pairs.sort((a, b) => b.score - a.score);
  const byStation = new Map();
  const used = new Set();
  for (const p of pairs) {
    if (p.score < CONTACT_MATCH_MIN) break;
    if (byStation.has(p.si) || used.has(p.ci)) continue;
    byStation.set(p.si, { ...contacts[p.ci], score: p.score });
    used.add(p.ci);
  }
  return { byStation, unusedContacts: contacts.filter((_, i) => !used.has(i)) };
}

function roundGeometry(g) {
  const r = (ring) => ring.map(([x, y]) => [round5(x), round5(y)]);
  return g.type === 'Polygon'
    ? { type: 'Polygon', coordinates: g.coordinates.map(r) }
    : { type: 'MultiPolygon', coordinates: g.coordinates.map((p) => p.map(r)) };
}

function main() {
  // 1. Boundaries, grouped by name (a station can be split across placemarks).
  const areas = new Map();
  for (const pm of placemarks(readRaw(BOUNDARIES_KML))) {
    const raw = simpleData(pm, 'PS_BOUNDName') ?? decodeXml(pm.match(/<name>([\s\S]*?)<\/name>/)?.[1] ?? '').trim();
    const key = nameKey(raw);
    if (!key) continue;
    if (!areas.has(key)) areas.set(key, { rawName: raw, polygons: [] });
    areas.get(key).polygons.push(...parsePolygons(pm));
  }

  // 2. Station points (skip units that have no area of their own).
  const points = placemarks(readRaw(STATIONS_KML))
    .map((pm) => {
      const name = simpleData(pm, 'POL_STAName');
      const coords = pm.match(/<Point>\s*<coordinates>([\s\S]*?)<\/coordinates>/)?.[1];
      return name && coords ? { name, key: nameKey(name), coord: parseCoords(coords)[0] } : null;
    })
    .filter((p) => p && !SPECIAL_UNIT.test(p.name));

  // 3. Join: prefer a station point inside the area; break ties by name similarity.
  const stations = [];
  const jurisdictions = [];
  const unmatched = [];
  for (const [key, area] of areas) {
    const geometry =
      area.polygons.length === 1
        ? { type: 'Polygon', coordinates: area.polygons[0] }
        : { type: 'MultiPolygon', coordinates: area.polygons };
    const feature = simplify({ type: 'Feature', properties: {}, geometry }, { tolerance: SIMPLIFY_TOLERANCE });

    const inside = points
      .filter((p) => booleanPointInPolygon(p.coord, feature))
      .map((p) => ({ ...p, score: similarity(key, p.key) }))
      .sort((a, b) => b.score - a.score);
    const match = inside[0] && inside[0].score >= 0.4 ? inside[0] : null;
    if (!match) unmatched.push(area.rawName);

    const id = `ps-${key}`;
    const name = displayName(match && match.score >= 0.6 ? match.name : area.rawName);
    const coord = match ? match.coord : pointOnFeature(feature).geometry.coordinates;

    stations.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coord.map(round5) },
      properties: { id, name, locationSource: match ? 'station' : 'area' },
    });
    jurisdictions.push({
      type: 'Feature',
      geometry: roundGeometry(feature.geometry),
      properties: { stationId: id, stationName: name },
    });
  }

  // 4. Contact numbers from Bengaluru City Police.
  const contacts = loadContacts();
  const { byStation, unusedContacts } = matchContacts(
    stations.map((s) => s.properties.id.slice(3)),
    contacts,
  );
  const weak = [];
  stations.forEach((s, i) => {
    const c = byStation.get(i);
    if (!c) return;
    if (c.score < 0.9) weak.push(`${s.properties.name}  <-  "${c.name}" (${c.score.toFixed(2)})`);
    Object.assign(s.properties, {
      ...(c.phone ? { phone: c.phone } : {}),
      ...(c.email ? { email: c.email } : {}),
      ...(c.division ? { division: c.division } : {}),
      ...(c.subdivision ? { subdivision: c.subdivision } : {}),
    });
  });

  stations.sort((a, b) => a.properties.name.localeCompare(b.properties.name));
  jurisdictions.sort((a, b) => a.properties.stationName.localeCompare(b.properties.stationName));

  const manifest = JSON.parse(readRaw('manifest.json'));
  const mapFiles = manifest.datasets.flatMap((d) => d.files.map((f) => ({ ...f, dataset: d.title, license: d.license })))
    .filter((f) => [BOUNDARIES_KML, STATIONS_KML].includes(f.path));

  const write = (name, data) => {
    const file = path.join(OUT_DIR, name);
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(data) + '\n');
    fs.renameSync(`${file}.tmp`, file);
  };
  fs.mkdirSync(OUT_DIR, { recursive: true });
  write('stations.geojson', { type: 'FeatureCollection', features: stations });
  write('jurisdictions.geojson', { type: 'FeatureCollection', features: jurisdictions });
  write('meta.json', {
    stations: {
      source: 'Karnataka GIS (KGIS) police station layers, via OpenCity',
      fetchedAt: manifest.downloadedAt,
      attribution: 'Police station boundaries and locations: KGIS via OpenCity (public domain). Phone numbers: Bengaluru City Police via OpenCity.',
      files: mapFiles.map(({ dataset, name, url, lastModified, license }) => ({ dataset, name, url, lastModified, license })),
    },
    boundaries: {
      kind: 'official',
      label:
        'Police station boundaries from Karnataka GIS (KGIS). The map is undated, so stations created recently may be missing or still shown inside an older station’s area.',
    },
  });

  const kb = (name) => Math.round(fs.statSync(path.join(OUT_DIR, name)).size / 1024);
  console.log(`Wrote ${stations.length} stations and ${jurisdictions.length} jurisdictions (${kb('jurisdictions.geojson')} KB)`);
  console.log(`Station points used: ${stations.filter((s) => s.properties.locationSource === 'station').length}; ` +
    `areas without a matching point (dot placed inside the area): ${unmatched.length}`);
  if (unmatched.length) console.log(`  ${unmatched.join(' | ')}`);
  const withPhone = stations.filter((s) => s.properties.phone).length;
  console.log(`Phone numbers attached: ${withPhone} of ${stations.length} stations (from ${contacts.length} BCP contacts)`);
  if (unusedContacts.length) console.log(`  BCP contacts with no matching boundary: ${unusedContacts.map((c) => c.name).join(' | ')}`);
  if (weak.length) console.log(`  Fuzzy matches to review:\n    ${weak.join('\n    ')}`);
}

try {
  main();
} catch (err) {
  console.error(`Import failed: ${err.message}`);
  process.exit(1);
}
