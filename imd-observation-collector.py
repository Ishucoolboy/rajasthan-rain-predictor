"""
Rajasthan Rain Predictor
IMD Observation Collector V3

IMD direct API:
- May return HTTP 401 because of access restrictions.

Fallback:
- Official IMD District-wise Rainfall Distribution page/PDF.

IMPORTANT:
- Never invent rainfall.
- Never use unrelated PDFs.
- Only accept an actual IMD district-rainfall PDF.
"""

from __future__ import annotations

import io
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests


# ============================================================
# CONFIG
# ============================================================

IMD_API_URL = (
    "https://mausam.imd.gov.in/api/"
    "districtwise_rainfall_api.php"
)

IMD_DISTRICT_RAINFALL_PAGE = (
    "https://mausam.imd.gov.in/imd_latest/contents/"
    "rainfall_statistics_3.php"
)

# This is the actual district-rainfall PDF filename used
# by IMD's rainfall statistics product.
IMD_DISTRICT_RAINFALL_PDF = (
    "https://mausam.imd.gov.in/imd_latest/Rainfall/"
    "DISTRICT_RAINFALL_DISTRIBUTION_COUNTRY_INDIA_cd.pdf"
)

OUTPUT_DIR = Path("data")

OUTPUT_FILE = (
    OUTPUT_DIR / "imd_observations.json"
)

REQUEST_TIMEOUT = 45

USER_AGENT = (
    "Mozilla/5.0 "
    "(compatible; Rajasthan-Rain-Predictor/3.0; "
    "+https://github.com/Ishucoolboy/"
    "rajasthan-rain-predictor)"
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

    text = text.upper()

    text = re.sub(
        r"\s+",
        " ",
        text,
    )

    return text.strip()


def safe_float(value: Any) -> float | None:

    if value is None:
        return None

    text = clean_text(value)

    if not text:
        return None

    upper = text.upper()

    invalid = {
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

    if upper in invalid:
        return None

    text = (
        text
        .replace(",", "")
        .replace("MM", "")
        .replace("mm", "")
        .strip()
    )

    try:
        return float(text)

    except ValueError:
        return None


# ============================================================
# HTTP
# ============================================================

def http_get(
    url: str,
    accept: str = "*/*",
) -> requests.Response:

    headers = {
        "User-Agent": USER_AGENT,
        "Accept": accept,
        "Cache-Control": "no-cache",
    }

    return requests.get(
        url,
        headers=headers,
        timeout=REQUEST_TIMEOUT,
        allow_redirects=True,
    )


# ============================================================
# DIRECT IMD API
# ============================================================

def fetch_imd_api() -> tuple[Any | None, str | None]:

    print("")
    print(
        "[IMD API] Trying official district rainfall API..."
    )

    print(
        f"[IMD API] URL: {IMD_API_URL}"
    )

    try:

        response = http_get(
            IMD_API_URL,
            "application/json,text/plain,*/*",
        )

        print(
            f"[IMD API] HTTP status: "
            f"{response.status_code}"
        )

        if response.status_code != 200:

            return (
                None,
                (
                    "IMD API returned HTTP "
                    f"{response.status_code}"
                ),
            )

        try:

            return response.json(), None

        except ValueError:

            return (
                None,
                "IMD API returned invalid JSON.",
            )

    except Exception as exc:

        return (
            None,
            f"IMD API request failed: {exc}",
        )


# ============================================================
# API RECORDS
# ============================================================

def extract_api_records(
    payload: Any,
) -> list[dict[str, Any]]:

    if isinstance(payload, list):

        return [
            item
            for item in payload
            if isinstance(item, dict)
        ]

    if not isinstance(payload, dict):

        return []

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

    return []


def find_value(
    record: dict[str, Any],
    keys: list[str],
) -> Any:

    normalized = {
        normalize_name(key): value
        for key, value in record.items()
    }

    for key in keys:

        lookup = normalize_name(key)

        if lookup in normalized:

            return normalized[lookup]

    return None


def normalize_api_record(
    record: dict[str, Any],
) -> dict[str, Any]:

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
        ],
    )

    rainfall = find_value(
        record,
        [
            "Daily Actual",
            "Daily Actual Rainfall",
            "Actual Rainfall",
            "Daily Rainfall",
        ],
    )

    normal = find_value(
        record,
        [
            "Daily Normal",
            "Normal Rainfall",
        ],
    )

    departure = find_value(
        record,
        [
            "Daily Departure Per",
            "Daily Departure",
            "Departure",
        ],
    )

    category = find_value(
        record,
        [
            "Daily Category",
            "Category",
        ],
    )

    return {
        "state": clean_text(state),
        "district": clean_text(district),
        "date": clean_text(date_value),
        "rainfall_mm": safe_float(rainfall),
        "daily_normal_mm": safe_float(normal),
        "daily_departure": clean_text(departure),
        "daily_category": clean_text(category),
        "source": "IMD District-wise Rainfall API",
        "source_url": IMD_API_URL,
        "period_type": "IMD_DAILY",
    }


# ============================================================
# VERIFY PDF
# ============================================================

def download_imd_district_pdf() -> tuple[
    bytes | None,
    str | None,
]:

    print("")
    print(
        "[IMD PDF] Downloading official "
        "district-rainfall PDF..."
    )

    print(
        f"[IMD PDF] URL: "
        f"{IMD_DISTRICT_RAINFALL_PDF}"
    )

    try:

        response = http_get(
            IMD_DISTRICT_RAINFALL_PDF,
            "application/pdf,*/*",
        )

        print(
            f"[IMD PDF] HTTP status: "
            f"{response.status_code}"
        )

        if response.status_code != 200:

            return (
                None,
                (
                    "Official district rainfall PDF "
                    "returned HTTP "
                    f"{response.status_code}"
                ),
            )

        content = response.content

        # A real PDF starts with %PDF.
        if not content.startswith(b"%PDF"):

            return (
                None,
                (
                    "The official district rainfall "
                    "URL did not return a PDF."
                ),
            )

        # Additional safety check:
        # Reject obviously tiny/invalid files.
        if len(content) < 10_000:

            return (
                None,
                "Downloaded PDF is unexpectedly small.",
            )

        print(
            "[IMD PDF] Valid district-rainfall PDF found."
        )

        print(
            f"[IMD PDF] Size: {len(content)} bytes"
        )

        return content, None

    except Exception as exc:

        return (
            None,
            f"IMD PDF download failed: {exc}",
        )


# ============================================================
# PDF TEXT EXTRACTION
# ============================================================

def extract_pdf_text(
    pdf_bytes: bytes,
) -> tuple[str, str | None]:

    print("")
    print(
        "[IMD PDF] Extracting PDF text..."
    )

    try:

        import pdfplumber

    except ImportError:

        return (
            "",
            (
                "pdfplumber is not installed. "
                "Check requirements.txt."
            ),
        )

    try:

        all_text = []

        with pdfplumber.open(
            io.BytesIO(pdf_bytes)
        ) as pdf:

            print(
                f"[IMD PDF] Pages: "
                f"{len(pdf.pages)}"
            )

            for page_number, page in enumerate(
                pdf.pages,
                start=1,
            ):

                text = page.extract_text()

                if text:

                    all_text.append(
                        text
                    )

                print(
                    f"[IMD PDF] Page "
                    f"{page_number}: "
                    f"{len(text or '')} chars"
                )

        combined = "\n".join(
            all_text
        )

        print(
            "[IMD PDF] Total extracted characters:"
            f" {len(combined)}"
        )

        return combined, None

    except Exception as exc:

        return (
            "",
            f"PDF text extraction failed: {exc}",
        )


# ============================================================
# PDF VALIDATION
# ============================================================

def validate_district_rainfall_pdf(
    text: str,
) -> bool:

    upper = normalize_name(text)

    required_patterns = [
        "DISTRICT-WISE",
        "RAINFALL",
    ]

    for pattern in required_patterns:

        if pattern not in upper:

            return False

    return True


# ============================================================
# PDF PARSER
# ============================================================

def parse_district_rainfall_text(
    text: str,
) -> list[dict[str, Any]]:

    """
    Conservative parser.

    The IMD PDF layout can change. We only publish a rainfall
    value when a row can be recognized with enough confidence.

    If the format is not safely recognizable, we return zero
    records rather than creating incorrect rainfall.
    """

    if not validate_district_rainfall_pdf(
        text
    ):

        print(
            "[IMD PDF] PDF validation failed."
        )

        return []

    print(
        "[IMD PDF] District-rainfall PDF "
        "validated."
    )

    # Normalize line endings.
    lines = [
        line.strip()
        for line in text.splitlines()
        if line.strip()
    ]

    records = []

    # Look for date information.
    date_match = re.search(
        r"(\d{2}[-/]\d{2}[-/]\d{4})",
        text,
    )

    report_date = (
        date_match.group(1)
        if date_match
        else ""
    )

    # --------------------------------------------------------
    # IMPORTANT
    #
    # We do not guess columns from arbitrary numbers.
    #
    # First detect whether the extracted PDF contains
    # recognizable table headers.
    # --------------------------------------------------------

    header_index = None

    for index, line in enumerate(lines):

        upper = normalize_name(line)

        if (
            "DISTRICT" in upper
            and "ACTUAL" in upper
            and (
                "NORMAL" in upper
                or "DEPARTURE" in upper
            )
        ):

            header_index = index

            break

    if header_index is None:

        print(
            "[IMD PDF] No unambiguous district "
            "rainfall table header found."
        )

        return []

    print(
        "[IMD PDF] Table header detected at line:"
        f" {header_index}"
    )

    # --------------------------------------------------------
    # Conservative row parsing.
    #
    # We look for:
    # District name + numeric actual rainfall.
    # --------------------------------------------------------

    for line in lines[
        header_index + 1:
    ]:

        upper = normalize_name(line)

        # Stop at obvious non-table sections.
        if (
            upper.startswith("NOTE")
            or upper.startswith("SOURCE")
            or upper.startswith("TOTAL")
        ):

            continue

        # Rajasthan only.
        if (
            "RAJASTHAN" not in upper
            and not any(
                district in upper
                for district in [
                    "AJMER",
                    "ALWAR",
                    "BANSWARA",
                    "BARAN",
                    "BARMER",
                    "BHARATPUR",
                    "BHILWARA",
                    "BIKANER",
                    "BUNDI",
                    "CHITTORGARH",
                    "CHURU",
                    "DAUSA",
                    "DHAULPUR",
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
                    "NAGAUR",
                    "PALI",
                    "PRATAPGARH",
                    "RAJSAMAND",
                    "SAWAI MADHOPUR",
                    "SIKAR",
                    "SIROHI",
                    "SRI GANGANAGAR",
                    "TONK",
                    "UDAIPUR",
                ]
            )
        ):

            continue

        numbers = re.findall(
            r"-?\d+(?:\.\d+)?",
            line,
        )

        if not numbers:

            continue

        # We still do not know which numeric column is
        # "actual". Keep this parser conservative.
        #
        # A row is accepted only if at least 2 numerical
        # values are present, which corresponds to Actual
        # and Normal in the common IMD table format.

        if len(numbers) < 2:

            continue

        rainfall_mm = safe_float(
            numbers[0]
        )

        normal_mm = safe_float(
            numbers[1]
        )

        if rainfall_mm is None:

            continue

        # Remove numeric values from the line to find
        # district text.
        district_text = re.sub(
            r"-?\d+(?:\.\d+)?",
            " ",
            line,
        )

        district_text = re.sub(
            r"\s+",
            " ",
            district_text,
        ).strip()

        if not district_text:

            continue

        records.append(
            {
                "state": "Rajasthan",
                "district": district_text,
                "date": report_date,
                "rainfall_mm": rainfall_mm,
                "daily_normal_mm": normal_mm,
                "source": (
                    "IMD District-wise "
                    "Rainfall Distribution PDF"
                ),
                "source_url": (
                    IMD_DISTRICT_RAINFALL_PDF
                ),
                "period_type": "IMD_DAILY",
            }
        )

    return records


# ============================================================
# OUTPUT
# ============================================================

def save_output(
    records: list[dict[str, Any]],
    status: str,
    method: str,
    source_url: str,
    error: str | None = None,
) -> None:

    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    output = {
        "schema_version": "3.0",
        "generated_at_utc": now_utc_iso(),

        "status": status,

        "source": {
            "name": (
                "India Meteorological "
                "Department"
            ),
            "product": (
                "District-wise Rainfall "
                "Distribution"
            ),
            "method": method,
            "url": source_url,
        },

        "coverage": {
            "state": "Rajasthan",
            "record_count": len(records),
        },

        "period": {
            "type": "IMD_DAILY",
            "note": (
                "IMD daily rainfall is reported "
                "using the official IMD rainfall "
                "reporting period."
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
        "IMD OBSERVATION COLLECTOR V3"
    )
    print("=" * 72)

    # --------------------------------------------------------
    # STEP 1 - OFFICIAL API
    # --------------------------------------------------------

    payload, api_error = fetch_imd_api()

    if payload is not None:

        raw_records = extract_api_records(
            payload
        )

        normalized = []

        for record in raw_records:

            item = normalize_api_record(
                record
            )

            if (
                normalize_name(
                    item["state"]
                )
                == "RAJASTHAN"
            ):

                normalized.append(
                    item
                )

        if normalized:

            save_output(
                records=normalized,
                status="success",
                method=(
                    "IMD District-wise "
                    "Rainfall API"
                ),
                source_url=IMD_API_URL,
            )

            print(
                "[IMD] API collection successful."
            )

            return 0

        api_error = (
            "API returned data but no Rajasthan "
            "district records were recognized."
        )

    print("")
    print(
        "[IMD] Direct API unavailable."
    )

    if api_error:

        print(
            f"[IMD] API reason: {api_error}"
        )

    # --------------------------------------------------------
    # STEP 2 - OFFICIAL DISTRICT PDF
    # --------------------------------------------------------

    pdf_bytes, pdf_error = (
        download_imd_district_pdf()
    )

    if pdf_bytes is None:

        save_output(
            records=[],
            status="unavailable",
            method="IMD official sources",
            source_url=(
                IMD_DISTRICT_RAINFALL_PAGE
            ),
            error=(
                f"API: {api_error}; "
                f"PDF: {pdf_error}"
            ),
        )

        return 0

    pdf_text, text_error = (
        extract_pdf_text(
            pdf_bytes
        )
    )

    if text_error:

        save_output(
            records=[],
            status="unavailable",
            method=(
                "IMD District Rainfall PDF"
            ),
            source_url=(
                IMD_DISTRICT_RAINFALL_PDF
            ),
            error=text_error,
        )

        return 0

    records = parse_district_rainfall_text(
        pdf_text
    )

    # --------------------------------------------------------
    # SUCCESS
    # --------------------------------------------------------

    if records:

        save_output(
            records=records,
            status="success",
            method=(
                "IMD District-wise "
                "Rainfall Distribution PDF"
            ),
            source_url=(
                IMD_DISTRICT_RAINFALL_PDF
            ),
        )

        print("")
        print(
            "[IMD] Rajasthan rainfall records:"
            f" {len(records)}"
        )

        print(
            "[IMD] COLLECTION COMPLETE"
        )

        return 0

    # --------------------------------------------------------
    # SAFE FAILURE
    # --------------------------------------------------------

    error = (
        "Official IMD district-rainfall PDF was "
        "downloaded, but its current table format "
        "could not be mapped safely to rainfall "
        "records. No rainfall values were invented."
    )

    save_output(
        records=[],
        status="unavailable",
        method=(
            "IMD District-wise "
            "Rainfall Distribution PDF"
        ),
        source_url=(
            IMD_DISTRICT_RAINFALL_PDF
        ),
        error=error,
    )

    print("")
    print(
        "[IMD] No rainfall values were invented."
    )

    return 0


if __name__ == "__main__":
    sys.exit(main())
