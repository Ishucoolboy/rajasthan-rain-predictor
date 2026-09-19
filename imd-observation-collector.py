"""
Rajasthan Rain Predictor
IMD Observation Collector V1

Purpose:
- Fetch official IMD district-wise rainfall observations
- Keep only Rajasthan records
- Save a clean JSON file for the website
- Preserve source metadata
- Never invent rainfall values
- If IMD access is blocked/not whitelisted, record the failure clearly

Official IMD API:
https://mausam.imd.gov.in/api/districtwise_rainfall_api.php

Important:
IMD API access may require server public-IP whitelisting.
This script is designed for server-side execution, not browser execution.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests


# ============================================================
# CONFIG
# ============================================================

IMD_DISTRICT_RAINFALL_URL = (
    "https://mausam.imd.gov.in/api/districtwise_rainfall_api.php"
)

OUTPUT_DIR = Path("data")
OUTPUT_FILE = OUTPUT_DIR / "imd_observations.json"

REQUEST_TIMEOUT = 30

TARGET_STATE = "RAJASTHAN"


# ============================================================
# HELPERS
# ============================================================

def now_utc_iso() -> str:
    """Return current UTC timestamp."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def clean_text(value: Any) -> str:
    """Convert any value to clean text."""
    if value is None:
        return ""

    return str(value).strip()


def normalize_name(value: Any) -> str:
    """
    Normalize names for matching.

    Example:
    'Rajasthan ' -> 'RAJASTHAN'
    'Nagaur'     -> 'NAGAUR'
    """
    return " ".join(clean_text(value).upper().split())


def safe_float(value: Any) -> float | None:
    """
    Convert rainfall-like values into float.

    Handles:
    - 12
    - '12'
    - '12.5'
    - '12.5 mm'
    - '--'
    - 'NA'
    - 'NR'
    """
    if value is None:
        return None

    text = clean_text(value)

    if not text:
        return None

    text_upper = text.upper()

    invalid_values = {
        "",
        "-",
        "--",
        "NA",
        "N/A",
        "NULL",
        "NONE",
        "NR",
        "ND",
        "NO DATA",
    }

    if text_upper in invalid_values:
        return None

    # Remove common rainfall units/symbols
    text = (
        text.replace("mm", "")
        .replace("MM", "")
        .replace(",", "")
        .strip()
    )

    try:
        return float(text)
    except ValueError:
        return None


def extract_records(payload: Any) -> list[dict[str, Any]]:
    """
    Convert different possible IMD JSON structures into a list of dictionaries.

    Supports:
    - direct list
    - {"data": [...]}
    - {"Data": [...]}
    - {"result": [...]}
    - {"results": [...]}
    """

    if isinstance(payload, list):
        return [
            item for item in payload
            if isinstance(item, dict)
        ]

    if not isinstance(payload, dict):
        return []

    possible_keys = [
        "data",
        "Data",
        "result",
        "results",
        "records",
        "Records",
    ]

    for key in possible_keys:
        value = payload.get(key)

        if isinstance(value, list):
            return [
                item for item in value
                if isinstance(item, dict)
            ]

    # Sometimes an API may return a single dictionary record
    if any(
        key in payload
        for key in [
            "District",
            "district",
            "State",
            "state",
            "Daily Actual",
        ]
    ):
        return [payload]

    return []


def find_value(record: dict[str, Any], possible_keys: list[str]) -> Any:
    """
    Find a field using several possible spellings.
    """

    normalized_record = {
        normalize_name(key): value
        for key, value in record.items()
    }

    for key in possible_keys:
        normalized_key = normalize_name(key)

        if normalized_key in normalized_record:
            return normalized_record[normalized_key]

    return None


# ============================================================
# IMD FETCH
# ============================================================

def fetch_imd_district_rainfall() -> tuple[Any | None, str | None]:
    """
    Fetch district-wise rainfall from official IMD API.

    Returns:
        payload, error_message
    """

    headers = {
        "User-Agent": (
            "Rajasthan-Rain-Predictor/1.0 "
            "(official IMD observation collector)"
        ),
        "Accept": "application/json,text/plain,*/*",
    }

    try:
        print("[IMD] Requesting official district rainfall API...")
        print(f"[IMD] URL: {IMD_DISTRICT_RAINFALL_URL}")

        response = requests.get(
            IMD_DISTRICT_RAINFALL_URL,
            headers=headers,
            timeout=REQUEST_TIMEOUT,
        )

        print(f"[IMD] HTTP status: {response.status_code}")

        if response.status_code != 200:
            return (
                None,
                (
                    f"IMD API returned HTTP "
                    f"{response.status_code}"
                ),
            )

        try:
            payload = response.json()
        except ValueError:
            return (
                None,
                "IMD API response was not valid JSON.",
            )

        return payload, None

    except requests.exceptions.Timeout:
        return None, "IMD API request timed out."

    except requests.exceptions.ConnectionError as exc:
        return None, f"IMD connection error: {exc}"

    except requests.exceptions.RequestException as exc:
        return None, f"IMD request error: {exc}"

    except Exception as exc:
        return None, f"Unexpected IMD error: {exc}"


# ============================================================
# NORMALIZATION
# ============================================================

def normalize_imd_record(
    record: dict[str, Any]
) -> dict[str, Any]:
    """
    Convert one IMD record into our internal format.
    """

    state = find_value(
        record,
        [
            "State",
            "STATE",
            "state_name",
        ],
    )

    district = find_value(
        record,
        [
            "District",
            "DISTRICT",
            "district_name",
        ],
    )

    date_value = find_value(
        record,
        [
            "Date",
            "date",
            "Daily Date",
        ],
    )

    daily_actual = find_value(
        record,
        [
            "Daily Actual",
            "Daily Actual Rainfall",
            "Actual Rainfall",
            "Daily Rainfall",
        ],
    )

    daily_normal = find_value(
        record,
        [
            "Daily Normal",
            "Normal Rainfall",
        ],
    )

    daily_departure = find_value(
        record,
        [
            "Daily Departure Per",
            "Daily Departure",
            "Departure",
        ],
    )

    daily_category = find_value(
        record,
        [
            "Daily Category",
            "Category",
        ],
    )

    rainfall_mm = safe_float(daily_actual)

    return {
        "state": clean_text(state),
        "district": clean_text(district),
        "date": clean_text(date_value),
        "rainfall_mm": rainfall_mm,
        "daily_normal_mm": safe_float(daily_normal),
        "daily_departure": clean_text(daily_departure),
        "daily_category": clean_text(daily_category),
        "source": "IMD District-wise Rainfall API",
        "source_url": IMD_DISTRICT_RAINFALL_URL,

        # Important semantic information:
        # IMD daily rainfall is based on the official rainfall
        # reporting period rather than a random midnight-to-midnight
        # browser period.
        "period_type": "IMD_DAILY",
    }


# ============================================================
# RAJASTHAN FILTER
# ============================================================

def filter_rajasthan_records(
    records: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """
    Keep only Rajasthan district records.
    """

    rajasthan_records = []

    for record in records:
        normalized = normalize_imd_record(record)

        state = normalize_name(normalized["state"])

        if state != TARGET_STATE:
            continue

        rajasthan_records.append(normalized)

    return rajasthan_records


# ============================================================
# SORTING
# ============================================================

def sort_records(
    records: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """
    Sort by district name.
    """

    return sorted(
        records,
        key=lambda item: (
            normalize_name(item.get("district")),
            item.get("date", ""),
        ),
    )


# ============================================================
# OUTPUT
# ============================================================

def build_output(
    records: list[dict[str, Any]],
    status: str,
    error: str | None = None,
) -> dict[str, Any]:

    output = {
        "schema_version": "1.0",
        "generated_at_utc": now_utc_iso(),

        "status": status,

        "source": {
            "name": "India Meteorological Department",
            "product": "District-wise Rainfall",
            "url": IMD_DISTRICT_RAINFALL_URL,
        },

        "coverage": {
            "state": "Rajasthan",
            "record_count": len(records),
        },

        "period": {
            "type": "IMD_DAILY",
            "note": (
                "Daily rainfall values are preserved as reported "
                "by IMD. They are not converted to midnight-to-midnight totals."
            ),
        },

        "records": records,
    }

    if error:
        output["error"] = error

    return output


def save_output(output: dict[str, Any]) -> None:
    """
    Save JSON output.
    """

    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    with OUTPUT_FILE.open(
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            output,
            file,
            ensure_ascii=False,
            indent=2,
        )

    print(f"[IMD] Saved: {OUTPUT_FILE}")


# ============================================================
# MAIN
# ============================================================

def main() -> int:

    print("")
    print("=" * 70)
    print("RAJASTHAN RAIN PREDICTOR - IMD OBSERVATION COLLECTOR V1")
    print("=" * 70)
    print("")

    payload, error = fetch_imd_district_rainfall()

    # --------------------------------------------------------
    # IMD FAILED
    # --------------------------------------------------------

    if error:
        print("")
        print("[IMD] OBSERVATION FETCH FAILED")
        print(f"[IMD] Reason: {error}")
        print("")

        output = build_output(
            records=[],
            status="unavailable",
            error=error,
        )

        save_output(output)

        print(
            "[IMD] No rainfall values were invented or substituted."
        )

        return 0

    # --------------------------------------------------------
    # EXTRACT RECORDS
    # --------------------------------------------------------

    raw_records = extract_records(payload)

    print(
        f"[IMD] Raw dictionary records received: "
        f"{len(raw_records)}"
    )

    if not raw_records:

        error_message = (
            "IMD API returned JSON, but no recognizable "
            "district records were found."
        )

        print(f"[IMD] {error_message}")

        output = build_output(
            records=[],
            status="invalid_response",
            error=error_message,
        )

        save_output(output)

        return 0

    # --------------------------------------------------------
    # RAJASTHAN FILTER
    # --------------------------------------------------------

    rajasthan_records = filter_rajasthan_records(
        raw_records
    )

    rajasthan_records = sort_records(
        rajasthan_records
    )

    print(
        f"[IMD] Rajasthan records found: "
        f"{len(rajasthan_records)}"
    )

    # --------------------------------------------------------
    # SUCCESS
    # --------------------------------------------------------

    if rajasthan_records:

        output = build_output(
            records=rajasthan_records,
            status="success",
        )

        save_output(output)

        # Print a few records for GitHub Actions logs
        print("")
        print("[IMD] Sample Rajasthan records:")

        for record in rajasthan_records[:10]:

            print(
                f"  "
                f"{record.get('district', 'Unknown')} | "
                f"{record.get('date', 'Unknown')} | "
                f"{record.get('rainfall_mm')} mm | "
                f"{record.get('daily_category', '')}"
            )

        print("")
        print("[IMD] COLLECTION COMPLETE")
        print("")

        return 0

    # --------------------------------------------------------
    # NO RAJASTHAN RECORDS
    # --------------------------------------------------------

    error_message = (
        "IMD API responded successfully, but no Rajasthan "
        "district records could be identified."
    )

    print(f"[IMD] {error_message}")

    output = build_output(
        records=[],
        status="no_rajasthan_records",
        error=error_message,
    )

    save_output(output)

    return 0


if __name__ == "__main__":
    sys.exit(main())
