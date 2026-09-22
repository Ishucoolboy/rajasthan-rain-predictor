#!/usr/bin/env python3
"""
Build Rajasthan village registry with village centroids.

Authoritative hierarchy target:
- Census 2011 / LGD naming and codes.
Coordinate enrichment:
- Open village-boundary dataset with Census village codes and centroids.

The generated file is intentionally compact: no polygon geometry is shipped to the
browser. Only village identity + hierarchy + centroid are retained.

This script refuses to label the registry as complete unless the coordinate source
contains a substantial Rajasthan village population. It records source/count metadata
so the UI never presents guessed coverage as verified coverage.
"""
from __future__ import annotations
import csv
import json
import lzma
import os
import urllib.request
from pathlib import Path

SOURCE_URL = os.environ.get(
    "RAJASTHAN_VILLAGE_COORD_SOURCE",
    "https://raw.githubusercontent.com/gggodhwani/indian_village_boundaries/master/statewise/rajasthan.csv.xz",
)
OUT = Path("data/rajasthan-village-registry.json")
TMP = Path("/tmp/rajasthan.csv.xz")

def download():
    req = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "Rajasthan-Rain-Predictor/1.0"})
    with urllib.request.urlopen(req, timeout=90) as r, TMP.open("wb") as f:
        while True:
            chunk = r.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)

def pick(row, *names):
    for n in names:
        if n in row and str(row[n]).strip():
            return str(row[n]).strip()
    return ""

def main():
    download()
    rows = []
    with lzma.open(TMP, "rt", encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.DictReader(f)
        for raw in reader:
            state = pick(raw, "state_name", "State", "state")
            if state and "rajasthan" not in state.lower():
                continue
            name = pick(raw, "village_name", "Village", "village")
            lat = pick(raw, "centroid_latitude", "latitude", "lat")
            lon = pick(raw, "centroid_longitude", "longitude", "lon", "lng")
            if not name or not lat or not lon:
                continue
            try:
                latf, lonf = float(lat), float(lon)
            except ValueError:
                continue
            if not (23.0 <= latf <= 30.3 and 69.2 <= lonf <= 78.5):
                continue
            rows.append({
                "id": pick(raw, "village_census_code", "village_id") or name.lower().replace(" ", "-"),
                "name": name,
                "tehsil": pick(raw, "block_name", "subdistrict", "sub_district"),
                "district": pick(raw, "district_name", "district"),
                "panchayat": pick(raw, "panchayat_name"),
                "censusCode": pick(raw, "village_census_code"),
                "lgdCode": "",
                "latitude": round(latf, 6),
                "longitude": round(lonf, 6),
                "source": "Census-2011-linked village boundary centroid",
            })

    # De-duplicate by census code first, then name+district+coordinates.
    seen = set()
    clean = []
    for r in rows:
        key = r["censusCode"] or f'{r["name"].lower()}|{r["district"].lower()}|{r["latitude"]}|{r["longitude"]}'
        if key in seen:
            continue
        seen.add(key)
        clean.append(r)

    clean.sort(key=lambda x: (x["district"].lower(), x["tehsil"].lower(), x["name"].lower()))

    payload = {
        "version": 1,
        "generated_at_utc": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "state": "Rajasthan",
        "coverage_basis": "Census 2011 village boundary centroid enrichment; LGD is the authoritative current administrative directory.",
        "expected_census_village_count_reference": 44672,
        "coordinate_records": len(clean),
        "complete_coverage_verified": len(clean) >= 42438,
        "source_url": SOURCE_URL,
        "notes": [
            "Census 2011 is historical; current LGD can contain newly created/reorganized villages.",
            "Centroid coordinates are suitable for weather-cell selection, not legal boundary use.",
            "A village forecast is still a numerical-weather-model estimate and is never guaranteed."
        ],
        "villages": clean,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Built {len(clean)} Rajasthan village coordinate records")
    print(f"Complete threshold met: {payload['complete_coverage_verified']}")

if __name__ == "__main__":
    main()
