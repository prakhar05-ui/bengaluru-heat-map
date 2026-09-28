#!/usr/bin/env python3
"""
Download the open data this app uses, from OpenCity (data.opencity.in) and
OpenStreetMap (Overpass API).

Usage (from the repo root):
    python3 server/scripts/download-open-data.py

No pip installs needed: only the Python standard library, plus the `curl` that
ships with macOS/Linux. All network access goes through curl, which uses the
operating system's normal certificate trust, so this works behind corporate TLS
proxies without changing any Python, certificate or system settings.

What it downloads:
  OpenCity (CKAN API)
    - Crime: "Bengaluru Crime Data - YYYY" (BCP) and "Karnataka Crime Data YYYY" (KSP) tables
    - Police: KGIS station boundaries + locations, BCP station contact numbers
    - Help points: urban public health centres, Namma Clinics, referral hospitals
    - Layers: CCTV cameras, BBMP public toilets, BMTC bus stops,
              streetlights per ward + 2015 ward map + ward road lengths
  OpenStreetMap (Overpass)
    - Hospitals (amenity=hospital) and Namma Metro stations (current network)

Output (git-ignored), under server/data-raw/:
  opencity/<dataset>/<resource>.<ext>   raw files, untouched
  opencity/manifest.json                what was downloaded, from where, when, licence
  opencity/bengaluru_city_rows.csv      "Bengaluru City" rows from Karnataka district-wise
                                        tables, for quick inspection (not Rural/District)
  osm/hospitals-metro.json              Overpass result

Tables keep their own layouts; the Node import scripts turn them into app data.
"""

import csv
import io
import json
import re
import subprocess
import sys
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://data.opencity.in"
USER_AGENT = "bengaluru-reported-incidents-map/0.1 (open data import script)"
RAW_DIR = Path(__file__).resolve().parent.parent / "data-raw"
OUT_DIR = RAW_DIR / "opencity"
OSM_DIR = RAW_DIR / "osm"

# Crime datasets are discovered by title, so new years are picked up automatically.
CRIME_PATTERNS = [re.compile(r"^Bengaluru Crime Data\b", re.I), re.compile(r"^Karnataka\b.*Crime Data\b", re.I)]
CRIME_QUERIES = ["Bengaluru crime", "Karnataka crime"]

# Other datasets by their OpenCity id, with the resources to keep (matched on resource name).
DATASETS = {
    "police-jurisdiction-maps-for-major-cities-of-india": r"^Bengaluru Police Jurisdictions",
    "police-station-locations": r"^Bengaluru Urban Police Station Locations",
    "bengaluru-city-police-contact-info": r"^Bengaluru City Police Police Stations Contact Numbers",
    "bengaluru-urban-public-health-centres": r"Urban Public Health Centres|Namma Clinics Locations 2026|UCHC Referral",
    "bengaluru-cctv-cameras": r"CCTV",
    "bengaluru-public-toilets": r"^BBMP Existing Toilets",
    "bengaluru-bus-stops-and-routes": r"^BMTC Bus stops Locations",
    "bengaluru-streetlights": r"^Streetlights in Bengaluru wards",
    "bbmp-ward-information": r"^BBMP Ward Map - 2015",
    "bengaluru-bbmp-ward-details": r"Ward Area and Road Length",
}
WANTED_FORMATS = {"csv", "kml", "geojson"}
BENGALURU_CITY = re.compile(r"(bengaluru|bangalore)\s*city", re.I)

OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
OVERPASS_BBOX = "12.75,77.3,13.25,77.9"  # south,west,north,east: Bengaluru Urban
OVERPASS_QUERY = f"""[out:json][timeout:120];
(
  nwr["amenity"="hospital"]({OVERPASS_BBOX});
  nwr["railway"="station"]["network"~"Namma Metro"]({OVERPASS_BBOX});
  nwr["station"="subway"]["network"~"Namma Metro"]({OVERPASS_BBOX});
);
out center tags;"""


def curl(url, dest=None, params=None, data=None, timeout=120, attempts=3):
    """Fetch a URL with curl (GET, or POST form when `data` is given).

    Returns bytes, or writes to `dest` and returns None.
    """
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    cmd = ["curl", "--silent", "--show-error", "--fail", "--location",
           "--max-time", str(timeout), "--user-agent", USER_AGENT]
    for key, value in (data or {}).items():
        cmd += ["--data-urlencode", f"{key}={value}"]
    if dest:
        cmd += ["--output", str(dest)]
    cmd.append(url)
    last_error = None
    for attempt in range(1, attempts + 1):
        result = subprocess.run(cmd, capture_output=True)
        if result.returncode == 0:
            return None if dest else result.stdout
        last_error = result.stderr.decode(errors="replace").strip()
        time.sleep(3 * attempt)
    raise RuntimeError(f"curl failed for {url}: {last_error}")


def api(action, **params):
    data = json.loads(curl(f"{BASE}/api/3/action/{action}", params=params, timeout=60))
    if not data.get("success"):
        raise RuntimeError(f"CKAN error for {action}: {data.get('error')}")
    return data["result"]


def find_crime_datasets():
    found = {}
    for q in CRIME_QUERIES:
        start = 0
        while True:
            res = api("package_search", q=q, rows=100, start=start)
            for ds in res["results"]:
                if any(p.search(ds.get("title", "")) for p in CRIME_PATTERNS):
                    found[ds["name"]] = ds
            start += 100
            if start >= res["count"]:
                break
    return sorted(found.values(), key=lambda d: d["title"])


def resource_format(res):
    fmt = (res.get("format") or "").lower()
    if fmt:
        return fmt
    return Path(urllib.parse.urlparse(res.get("url", "")).path).suffix.lstrip(".").lower()


def safe(s):
    return re.sub(r"[^A-Za-z0-9._-]+", "_", s).strip("_")[:90]


def decode(raw):
    for enc in ("utf-8-sig", "utf-8", "cp1252"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1", errors="replace")


def bengaluru_city_rows(path, ds, res):
    """Rows whose unit column is exactly 'Bengaluru City' (not Rural/District/South).

    The unit is usually the first column, but some tables start with a serial
    number, so the first two non-numeric cells are checked. Tables that list
    commissionerates twice produce identical rows; those are kept once.
    """
    rows = list(csv.reader(io.StringIO(decode(path.read_bytes()))))
    if not rows:
        return []
    header = " | ".join(re.sub(r"\s+", " ", c).strip() for c in rows[0])
    out, seen = [], set()
    for row in rows[1:]:
        labels = [c for c in row if c.strip() and not c.strip().isdigit()][:2]
        if not any(BENGALURU_CITY.fullmatch(c.strip()) for c in labels):
            continue
        cells = tuple(c.strip() for c in row)
        if cells in seen:
            continue
        seen.add(cells)
        out.append([ds["title"], res.get("name", ""), header] + list(cells))
    return out


def download_dataset(ds, resource_filter, manifest, city_rows):
    print(f"\n{ds['title']}  ({BASE}/dataset/{ds['name']})")
    entry = {
        "name": ds["name"],
        "title": ds["title"],
        "organization": (ds.get("organization") or {}).get("title"),
        "license": ds.get("license_title"),
        "url": f"{BASE}/dataset/{ds['name']}",
        "files": [],
    }
    ds_dir = OUT_DIR / safe(ds["name"])
    ds_dir.mkdir(exist_ok=True)
    for res in ds.get("resources", []):
        fmt = resource_format(res)
        name = res.get("name") or res["id"]
        if fmt not in WANTED_FORMATS or (resource_filter and not re.search(resource_filter, name, re.I)):
            continue
        dest = ds_dir / f"{safe(name)}.{fmt}"
        try:
            curl(res["url"], dest=dest, timeout=300)
        except RuntimeError as e:
            print(f"  [x] {name}: {e}")
            continue
        time.sleep(0.5)  # be polite
        print(f"  [+] {name}  ->  {dest.relative_to(OUT_DIR)}")
        entry["files"].append({
            "name": name,
            "format": fmt,
            "path": str(dest.relative_to(OUT_DIR)),
            "url": res["url"],
            "lastModified": res.get("last_modified") or res.get("created"),
        })
        if fmt == "csv" and ds["title"].lower().startswith("karnataka"):
            city_rows += bengaluru_city_rows(dest, ds, res)
    manifest["datasets"].append(entry)


def download_osm():
    OSM_DIR.mkdir(parents=True, exist_ok=True)
    dest = OSM_DIR / "hospitals-metro.json"
    tmp = dest.with_suffix(".tmp")
    for mirror in OVERPASS_MIRRORS:
        print(f"\nOpenStreetMap: querying {mirror}")
        try:
            curl(mirror, dest=tmp, data={"data": OVERPASS_QUERY}, timeout=180, attempts=2)
            if tmp.read_bytes()[:1] == b"{":
                tmp.replace(dest)
                n = len(json.loads(dest.read_text())["elements"])
                print(f"  [+] {n} features  ->  {dest.relative_to(RAW_DIR)}")
                return True
            print("  server busy (non-JSON reply)")
        except RuntimeError as e:
            print(f"  [x] {e}")
    tmp.unlink(missing_ok=True)
    print("  All Overpass mirrors failed; they are often busy. Re-run later (OpenCity files are kept).")
    return False


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {"downloadedAt": datetime.now(timezone.utc).isoformat(), "source": BASE, "datasets": []}
    city_rows = []

    print("Searching OpenCity for crime datasets...")
    for ds in find_crime_datasets():
        download_dataset(ds, None, manifest, city_rows)
    for name, resource_filter in DATASETS.items():
        try:
            ds = api("package_show", id=name)
        except RuntimeError as e:
            print(f"\n[x] dataset {name}: {e}")
            continue
        download_dataset(ds, resource_filter, manifest, city_rows)

    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")

    if city_rows:
        width = max(len(r) for r in city_rows)
        with (OUT_DIR / "bengaluru_city_rows.csv").open("w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["dataset", "resource", "file_header"] + [f"col{i}" for i in range(1, width - 2)])
            for r in city_rows:
                w.writerow(r + [""] * (width - len(r)))

    osm_ok = download_osm()

    n_files = sum(len(d["files"]) for d in manifest["datasets"])
    print(f"\nOpenCity: {n_files} files from {len(manifest['datasets'])} datasets into {OUT_DIR}")
    print(f"Found {len(city_rows)} 'Bengaluru City' rows in Karnataka district-wise tables")
    if not osm_ok:
        sys.exit(2)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, json.JSONDecodeError) as e:
        sys.exit(f"Error: {e}")
