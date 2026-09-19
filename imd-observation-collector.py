"""
Rajasthan Rain Predictor
IMD Observation Collector V4

Uses the current official IMD API platform.

Official District-wise Rainfall API:
https://api.imd.gov.in/api/v1/districtrainfall

The API documentation defines fields such as:
- OBJ_ID
- District
- Date
- Daily Actual
- Daily Normal
- Daily Departure Per
- Daily Category
- Weekly Actual
- Cumulative Actual
- Monthly Actual

Important:
- No rainfall values are invented.
- API authentication is supplied through GitHub Secret
  IMD_API_KEY when available.
- The key is NEVER written into the generated JSON.
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
    "https://api.imd.gov.in/api/v1/districtrainfall"
)

OUTPUT_DIR = Path("data")

OUTPUT_FILE = (
    OUTPUT_DIR / "imd_observations.json"
)

REQUEST_TIMEOUT = 45

USER_AGENT = (
    "Rajasthan-Rain-Predictor/4.0 "
    "GitHub Actions"
)


# ============================================================
# TIME
# ============================================================

def now_utc_iso() -> str:
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
    )


# ============================================================
# TEXT
# ============================================================

def clean_text(value: Any) -> str:

    if value is None:
        return ""

    return str(value).strip()


def normalize_name(value: Any) -> str:

    text = clean_text(value)

    return " ".join(
        text.upper().split()
    )


def safe_float(value: Any) -> float | None:

    if value is None:
        return None

    text = clean_text(value)

    if not text:
        return None

    invalid_values = {
        "",
        "-",
        "--",
        "*",
        "NA",
        "N/A",
        "NULL",
        "NONE",
        "NR",
        "ND",
        "NO DATA",
    }

    if text.upper() in invalid_values:
        return None

    text = (
        text
        .replace(",", "")
        .replace("%", "")
        .replace("mm", "")
        .replace("MM", "")
        .strip()
    )

    try:
        return float(text)

    except ValueError:
        return None


# ============================================================
# AUTHENTICATION
# ============================================================

def get_api_key() -> str:

    return clean_text(
        os.environ.get(
            "IMD_API_KEY",
            ""
        )
    )


def build_headers() -> dict[str, str]:

    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
        "Cache-Control": "no-cache",
    }

    api_key = get_api_key()

    if api_key:

        # Current IMD API access is account/key controlled.
        #
        # We send the key through standard API-key headers.
        # The secret itself is never printed.
        headers["X-API-Key"] = api_key

        headers["Authorization"] = (
            f"Bearer {api_key}"
        )

    return headers


# ============================================================
# HTTP
# ============================================================

def fetch_imd_rainfall() -> tuple[
    Any | None,
    str | None,
]:

    api_key = get_api_key()

    print("")
    print(
        "[IMD] Current District-wise Rainfall API"
    )

    print(
        f"[IMD] URL: "
        f"{IMD_DISTRICT_RAINFALL_URL}"
    )

    if api_key:

        print(
            "[IMD] API key detected from GitHub Secret."
        )

    else:

        print(
            "[IMD] No IMD_API_KEY GitHub Secret "
            "is configured yet."
        )

    try:

        response = requests.get(
            IMD_DISTRICT_RAINFALL_URL,
            headers=build_headers(),
            timeout=REQUEST_TIMEOUT,
        )

        print(
            f"[IMD] HTTP status: "
            f"{response.status_code}"
        )

        if response.status_code != 200:

            if response.status_code == 401:

                return (
                    None,
                    (
                        "HTTP 401 Unauthorized. "
                        "The current IMD API requires "
                        "authorized access."
                    ),
                )

            if response.status_code == 403:

                return (
                    None,
                    (
                        "HTTP 403 Forbidden. "
                        "The IMD API rejected the request."
                    ),
                )

            return (
                None,
                (
                    "IMD API returned HTTP "
                    f"{response.status_code}"
                ),
            )

        try:

            payload = response.json()

        except ValueError:

            return (
                None,
                "IMD API returned invalid JSON.",
            )

        return payload, None

    except requests.exceptions.Timeout:

        return (
            None,
            "IMD API request timed out.",
        )

    except requests.exceptions.ConnectionError:

        return (
            None,
            "Could not connect to IMD API.",
        )

    except requests.exceptions.RequestException as exc:

        return (
            None,
            f"IMD request failed: {exc}",
        )

    except Exception as exc:

        return (
            None,
            f"Unexpected error: {exc}",
        )


# ============================================================
# PAYLOAD EXTRACTION
# ============================================================

def extract_records(
    payload: Any,
) -> list[dict[str, Any]]:

    if isinstance(payload, list):

        return [
            item
            for item in payload
            if isinstance(item, dict)
        ]

    if isinstance(payload, dict):

        # Common wrapper names
        for key in (
            "data",
            "Data",
            "result",
            "results",
            "records",
            "Records",
        ):

            value = payload.get(key)

            if isinstance(value, list):

                return [
                    item
                    for item in value
                    if isinstance(item, dict)
                ]

        # Some API responses may directly contain
        # one district record.

        if (
            "District" in payload
            or "district" in payload
        ):

            return [payload]

    return []


# ============================================================
# FIELD LOOKUP
# ============================================================

def get_field(
    record: dict[str, Any],
    *names: str,
) -> Any:

    normalized_record = {
        normalize_name(key): value
        for key, value in record.items()
    }

    for name in names:

        value = normalized_record.get(
            normalize_name(name)
        )

        if value is not None:

            return value

    return None


# ============================================================
# NORMALIZATION
# ============================================================

def normalize_record(
    record: dict[str, Any],
) -> dict[str, Any]:

    return {
        "obj_id": clean_text(
            get_field(
                record,
                "OBJ_ID",
                "Obj_id",
                "ID",
            )
        ),

        "district": clean_text(
            get_field(
                record,
                "District",
                "DISTRICT",
            )
        ),

        "date": clean_text(
            get_field(
                record,
                "Date",
            )
        ),

        "rainfall_mm": safe_float(
            get_field(
                record,
                "Daily Actual",
                "Daily Actual Rainfall",
            )
        ),

        "daily_normal_mm": safe_float(
            get_field(
                record,
                "Daily Normal",
            )
        ),

        "daily_departure": clean_text(
            get_field(
                record,
                "Daily Departure Per",
            )
        ),

        "daily_category": clean_text(
            get_field(
                record,
                "Daily Category",
            )
        ),

        "week_date": clean_text(
            get_field(
                record,
                "Week Date",
            )
        ),

        "weekly_actual_mm": safe_float(
            get_field(
                record,
                "Weekly Actual",
            )
        ),

        "weekly_normal_mm": safe_float(
            get_field(
                record,
                "Weekly Normal",
            )
        ),

        "weekly_departure": clean_text(
            get_field(
                record,
                "Weekly Departure Per",
            )
        ),

        "weekly_category": clean_text(
            get_field(
                record,
                "Weekly Category",
            )
        ),

        "cumulative_date": clean_text(
            get_field(
                record,
                "Cumulative Date",
            )
        ),

        "cumulative_actual_mm": safe_float(
            get_field(
                record,
                "Cumulative Actual",
            )
        ),

        "cumulative_normal_mm": safe_float(
            get_field(
                record,
                "Cumulative Normal",
            )
        ),

        "cumulative_departure": clean_text(
            get_field(
                record,
                "Cumulative Departure Per",
            )
        ),

        "cumulative_category": clean_text(
            get_field(
                record,
                "Cumulative Category",
            )
        ),

        "monthly_date": clean_text(
            get_field(
                record,
                "Monthly Date",
            )
        ),

        "monthly_actual_mm": safe_float(
            get_field(
                record,
                "Monthly Actual",
            )
        ),

        "monthly_normal_mm": safe_float(
            get_field(
                record,
                "Monthly Normal",
            )
        ),

        "monthly_departure": clean_text(
            get_field(
                record,
                "Monthly Departure Per",
            )
        ),

        "monthly_category": clean_text(
            get_field(
                record,
                "Monthly Category",
            )
        ),

        "source": (
            "India Meteorological Department"
        ),

        "source_product": (
            "District-wise Rainfall"
        ),

        "source_url": (
            IMD_DISTRICT_RAINFALL_URL
        ),

        "period_type": "IMD_DAILY",
    }


# ============================================================
# RAJASTHAN FILTER
# ============================================================

def is_rajasthan_district(
    district: str,
) -> bool:

    """
    The official district rainfall API response is
    district-based and does not necessarily include
    a State field.

    We therefore filter using the known Rajasthan
    district names.
    """

    districts = {
        "AJMER",
        "ALWAR",
        "BALOTRA",
        "BANSWARA",
        "BARAN",
        "BARMER",
        "BEAWAR",
        "BHARATPUR",
        "BHILWARA",
        "BIKANER",
        "BUNDI",
        "CHITTORGARH",
        "CHURU",
        "DAUSA",
        "DEEG",
        "DHOLPUR",
        "DIDWANA-KUCHAMANDI",
        "DIDWANA KUCHAMAN",
        "DUNGARPUR",
        "HANUMANGARH",
        "JAIPUR",
        "JAISALMER",
        "JALORE",
        "JHALAWAR",
        "JHUNJHUNU",
        "JODHPUR",
        "KARAULI",
        "KOTA",
        "KHAIRTHAL-TIJARA",
        "KHAIRTHAL TIJARA",
        "NAGAUR",
        "PALI",
        "PHALODI",
        "PRATAPGARH",
        "RAJSAMAND",
        "SALUMBER",
        "SAWAI MADHOPUR",
        "SIKAR",
        "SIROHI",
        "SRI GANGANAGAR",
        "TONK",
        "UDAIPUR",
        "DHAULPUR",
    }

    name = normalize_name(
        district
    )

    return name in districts


def filter_rajasthan(
    records: list[dict[str, Any]],
) -> list[dict[str, Any]]:

    result = []

    for record in records:

        normalized = normalize_record(
            record
        )

        district = normalized[
            "district"
        ]

        if is_rajasthan_district(
            district
        ):

            result.append(
                normalized
            )

    return result


# ============================================================
# SORT
# ============================================================

def sort_records(
    records: list[dict[str, Any]],
) -> list[dict[str, Any]]:

    return sorted(
        records,
        key=lambda item: (
            normalize_name(
                item.get(
                    "district",
                    "",
                )
            ),
            item.get(
                "date",
                "",
            ),
        ),
    )


# ============================================================
# OUTPUT
# ============================================================

def save_output(
    records: list[dict[str, Any]],
    status: str,
    error: str | None = None,
) -> None:

    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    output = {
        "schema_version": "4.0",

        "generated_at_utc": (
            now_utc_iso()
        ),

        "status": status,

        "source": {
            "name": (
                "India Meteorological "
                "Department"
            ),

            "product": (
                "District-wise Rainfall"
            ),

            "url": (
                IMD_DISTRICT_RAINFALL_URL
            ),
        },

        "coverage": {
            "state": "Rajasthan",

            "record_count": len(
                records
            ),
        },

        "period": {
            "type": "IMD_DAILY",

            "note": (
                "Daily Actual rainfall is "
                "preserved exactly from the "
                "official IMD district rainfall "
                "product."
            ),
        },

        "records": records,
    }

    if error:

        output["error"] = error

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

    print("")
    print(
        f"[IMD] Saved: {OUTPUT_FILE}"
    )


# ============================================================
# MAIN
# ============================================================

def main() -> int:

    print("")
    print("=" * 72)

    print(
        "RAJASTHAN RAIN PREDICTOR - "
        "IMD OBSERVATION COLLECTOR V4"
    )

    print("=" * 72)

    # --------------------------------------------------------
    # FETCH
    # --------------------------------------------------------

    payload, error = (
        fetch_imd_rainfall()
    )

    if payload is None:

        print("")
        print(
            "[IMD] COLLECTION UNAVAILABLE"
        )

        print(
            f"[IMD] Reason: {error}"
        )

        save_output(
            records=[],
            status="unavailable",
            error=error,
        )

        return 0

    # --------------------------------------------------------
    # EXTRACT
    # --------------------------------------------------------

    raw_records = extract_records(
        payload
    )

    print("")
    print(
        "[IMD] Raw records received:"
        f" {len(raw_records)}"
    )

    if not raw_records:

        error = (
            "IMD returned JSON but no "
            "district records were found."
        )

        print(
            f"[IMD] {error}"
        )

        save_output(
            records=[],
            status="invalid_response",
            error=error,
        )

        return 0

    # --------------------------------------------------------
    # RAJASTHAN
    # --------------------------------------------------------

    rajasthan_records = (
        filter_rajasthan(
            raw_records
        )
    )

    rajasthan_records = sort_records(
        rajasthan_records
    )

    print(
        "[IMD] Rajasthan records:"
        f" {len(rajasthan_records)}"
    )

    # --------------------------------------------------------
    # SUCCESS
    # --------------------------------------------------------

    if rajasthan_records:

        save_output(
            records=rajasthan_records,
            status="success",
        )

        print("")

        print(
            "[IMD] Sample records:"
        )

        for record in (
            rajasthan_records[:10]
        ):

            print(
                "  "
                f"{record['district']} | "
                f"{record['date']} | "
                f"{record['rainfall_mm']} mm | "
                f"{record['daily_category']}"
            )

        print("")
        print(
            "[IMD] COLLECTION COMPLETE"
        )

        return 0

    # --------------------------------------------------------
    # NO RAJASTHAN DATA
    # --------------------------------------------------------

    error = (
        "IMD returned district rainfall data, "
        "but no known Rajasthan district names "
        "were recognized."
    )

    save_output(
        records=[],
        status="no_rajasthan_records",
        error=error,
    )

    print("")
    print(
        "[IMD] No rainfall values were invented."
    )

    return 0


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":

    sys.exit(
        main()
    )
