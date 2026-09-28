#!/usr/bin/env python3
"""pySTEPS radar nowcast adapter for Nagaur Rain Intelligence.

Input: a directory containing at least 3 quantitative radar frames.
Supported formats:
- ODIM HDF5 / OPERA HDF5 (.h5/.hdf5)
- BoM Rainfields3 NetCDF (.nc)
- FMI reflectivity GeoTIFF (.tif/.tiff)

The script converts reflectivity to rain rate when needed, estimates motion
with Lucas-Kanade and produces a deterministic extrapolation nowcast.

It intentionally does NOT decode RainViewer's colorized map tiles as
quantitative radar data.
"""

from __future__ import annotations
import argparse, glob, json, os, sys
from datetime import datetime, timezone

import numpy as np
import pysteps
from pysteps import io, motion, nowcasts
from pysteps.utils import conversion, transformation


def importer_for(path: str):
    ext = os.path.splitext(path)[1].lower()
    if ext in (".h5", ".hdf5"):
        return io.get_method("odim_hdf5", "importer")
    if ext == ".nc":
        return io.get_method("bom_rf3", "importer")
    if ext in (".tif", ".tiff"):
        return io.get_method("fmi_geotiff", "importer")
    raise ValueError(f"Unsupported radar format: {path}")


def read_frame(path: str):
    importer = importer_for(path)
    return importer(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input-dir", required=True)
    ap.add_argument("--output", default="data/pysteps-nowcast.json")
    ap.add_argument("--lead-minutes", type=int, default=120)
    ap.add_argument("--timestep", type=int, default=10)
    args = ap.parse_args()

    files = sorted(
        p for p in glob.glob(os.path.join(args.input_dir, "*"))
        if os.path.isfile(p) and os.path.splitext(p)[1].lower() in
        (".h5", ".hdf5", ".nc", ".tif", ".tiff")
    )
    if len(files) < 3:
        raise SystemExit("pySTEPS needs at least 3 consecutive quantitative radar frames.")

    # Use the latest 3 frames for Lucas-Kanade motion estimation.
    files = files[-3:]
    fields, metadata = [], None

    for path in files:
        field, _, meta = read_frame(path)
        fields.append(field.astype(np.float32))
        metadata = meta

    R = np.stack(fields)
    unit = metadata.get("unit", "dBZ")
    if unit.lower() == "dbz":
        # Standard Z-R conversion. For local radar calibration, this can be
        # replaced later with an IMD/radar-specific relationship.
        R, metadata = conversion.to_rainrate(R, metadata)

    # Work in dB rain-rate space for optical-flow extrapolation.
    R_db, metadata = transformation.dB_transform(
        R, metadata, threshold=0.1, zerovalue=-15.0
    )
    R_db[~np.isfinite(R_db)] = metadata["zerovalue"]

    oflow = motion.get_method("LK")
    V = oflow(R_db)

    n_leadtimes = max(1, args.lead_minutes // args.timestep)
    extrapolate = nowcasts.get_method("extrapolation")
    forecast_db = extrapolate(R_db[-1], V, n_leadtimes)
    forecast = transformation.dB_transform(
        forecast_db, threshold=-10.0, inverse=True
    )[0]
    forecast = np.maximum(forecast, 0)

    # Persist compact statistics for the web dashboard. The full raster is
    # deliberately not committed to Git because it can become very large.
    summary = []
    cy, cx = np.array(forecast.shape[1:]) // 2
    for i, field in enumerate(forecast):
        finite = field[np.isfinite(field)]
        summary.append({
            "lead_minutes": (i + 1) * args.timestep,
            "center_mm_h": float(field[cy, cx]) if np.isfinite(field[cy, cx]) else 0.0,
            "max_mm_h": float(np.nanmax(field)) if finite.size else 0.0,
            "mean_mm_h": float(np.nanmean(field)) if finite.size else 0.0,
        })

    result = {
        "engine": "pySTEPS",
        "version": getattr(pysteps, "__version__", "unknown"),
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "input_frames": [os.path.basename(x) for x in files],
        "timestep_minutes": args.timestep,
        "lead_minutes": args.lead_minutes,
        "summary": summary,
        "note": "Nowcast is extrapolation-based and requires quantitative radar input; it is not a universal accuracy guarantee."
    }

    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
