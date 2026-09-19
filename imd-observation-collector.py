"""
Rajasthan Rain Predictor
IMD Observation Collector V2

Purpose:
- Collect daily Rajasthan district rainfall observations.
- Prefer official IMD District Rainfall API when accessible.
- If IMD API returns 401/403, use the official IMD rainfall
  statistics PDF route.
- Never invent rainfall values.
- Save normalized Rajasthan observations.

Important:
IMD API access may require public-IP whitelisting.
The PDF fallback uses IMD's public rainfall product.
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

IMD_RAINFALL_STATISTICS_PAGE = (
    "https://mausam.imd.gov.in/imd_latest/contents/"
    "rainfall_statistics_3.php"
)

OUTPUT_DIR = Path("data")
OUTPUT_FILE = OUTPUT_DIR / "imd_observations.json"

REQUEST_TIMEOUT = 45

TARGET_STATE = "RAJASTHAN"

USER_AGENT = (
    "Mozilla/5.0 "
    "(compatible; Rajasthan-Rain-Predictor/2.0; "
    "+https://github.com/Ishucoolboy/rajasthan-rain-predictor)"
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
# TEXT HELPERS
# ============================================================

def clean_text(value: Any) -> str:

    if value is None:
        return ""

    return str(value).strip()


def normalize_name(value: Any) -> str:

    text = clean_text(value)

    text = text.upper()

    text = re.sub(r"\s+", " ", text)

    return text.strip()


def safe_float(value: Any) -> float | None:

    if value is None:
        return None

    text = clean_text(value)

    if not text:
        return None

    text_upper = text.upper()

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

    if text_upper in invalid:
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

    response = requests.get(
        url,
        headers=headers,
        timeout=REQUEST_TIMEOUT,
        allow_redirects=True,
    )

    return response


# ============================================================
# API SOURCE
# ============================================================

def fetch_imd_api() -> tuple[Any | None, str | None]:

    print("")
    print("[IMD API] Trying official district rainfall API...")
    print(f"[IMD API] {IMD_API_URL}")

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

            payload = response.json()

        except ValueError:

            return (
                None,
                "IMD API returned non-JSON content.",
            )

        return payload, None

    except Exception as exc:

        return (
            None,
            f"IMD API request failed: {exc}",
        )


# ============================================================
# API RECORD EXTRACTION
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

    if (
        "District" in payload
        or "district" in payload
    ):

        return [payload]

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

        value = normalized.get(
            normalize_name(key)
        )

        if value is not None:

            return value

    return None


# ============================================================
# API NORMALIZATION
# ============================================================

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
# PDF DISCOVERY
# ============================================================

def discover_imd_pdf() -> tuple[str | None, str | None]:

    print("")
    print("[IMD PDF] Discovering latest official rainfall PDF...")
    print(
        "[IMD PDF] Statistics page:"
        f" {IMD_RAINFALL_STATISTICS_PAGE}"
    )

    try:

        response = http_get(
            IMD_RAINFALL_STATISTICS_PAGE,
            "text/html,*/*",
        )

        print(
            "[IMD PDF] Statistics page HTTP status:"
            f" {response.status_code}"
        )

        if response.status_code != 200:

            return (
                None,
                (
                    "IMD rainfall statistics page returned "
                    f"HTTP {response.status_code}"
                ),
            )

        html = response.text

        # Find all PDF links.
        links = re.findall(
            r"""href\s*=\s*["']([^"']+\.pdf[^"']*)["']""",
            html,
            flags=re.IGNORECASE,
        )

        # Also search raw HTML for PDF-like URLs.
        if not links:

            links = re.findall(
                r"""["']([^"']+\.pdf(?:\?[^"']*)?)["']""",
                html,
                flags=re.IGNORECASE,
            )

        if not links:

            return (
                None,
                "No PDF link found on IMD statistics page.",
            )

        # Remove duplicates while preserving order.
        unique_links = []

        for link in links:

            if link not in unique_links:

                unique_links.append(link)

        print(
            f"[IMD PDF] Candidate PDF links found: "
            f"{len(unique_links)}"
        )

        # Convert relative links to absolute URLs.
        candidates = []

        for link in unique_links:

            link = link.strip()

            if link.startswith("http://"):

                candidates.append(
                    link.replace(
                        "http://",
                        "https://",
                        1,
                    )
                )

            elif link.startswith("https://"):

                candidates.append(link)

            elif link.startswith("//"):

                candidates.append(
                    "https:" + link
                )

            elif link.startswith("/"):

                candidates.append(
                    "https://mausam.imd.gov.in"
                    + link
                )

            else:

                candidates.append(
                    "https://mausam.imd.gov.in/"
                    + link.lstrip("./")
                )

        # Prefer links whose name looks like district rainfall.
        preferred = []

        for url in candidates:

            lower = url.lower()

            if (
                "rainfall" in lower
                or "district" in lower
                or "distribution" in lower
            ):

                preferred.append(url)

        ordered = preferred + [
            url
            for url in candidates
            if url not in preferred
        ]

        # Test candidates until a real PDF is found.
        for url in ordered:

            try:

                print(
                    "[IMD PDF] Testing:"
                    f" {url}"
                )

                response = http_get(
                    url,
                    "application/pdf,*/*",
                )

                content_type = (
                    response.headers
                    .get("Content-Type", "")
                    .lower()
                )

                if (
                    response.status_code == 200
                    and (
                        "pdf" in content_type
                        or response.content[:4] == b"%PDF"
                    )
                ):

                    print(
                        "[IMD PDF] Valid PDF found."
                    )

                    return url, None

            except Exception as exc:

                print(
                    "[IMD PDF] Candidate failed:"
                    f" {exc}"
                )

        return (
            None,
            "IMD page was reachable but no valid PDF could be downloaded.",
        )

    except Exception as exc:

        return (
            None,
            f"IMD PDF discovery failed: {exc}",
        )


# ============================================================
# PDF DOWNLOAD
# ============================================================

def download_pdf(
    pdf_url: str,
) -> tuple[bytes | None, str | None]:

    print("")
    print("[IMD PDF] Downloading official PDF...")
    print(f"[IMD PDF] {pdf_url}")

    try:

        response = http_get(
            pdf_url,
            "application/pdf,*/*",
        )

        print(
            "[IMD PDF] HTTP status:"
            f" {response.status_code}"
        )

        if response.status_code != 200:

            return (
                None,
                (
                    "IMD PDF returned HTTP "
                    f"{response.status_code}"
                ),
            )

        content = response.content

        if not content.startswith(b"%PDF"):

            return (
                None,
                "Downloaded file is not a valid PDF.",
            )

        print(
            "[IMD PDF] Downloaded:"
            f" {len(content)} bytes"
        )

        return content, None

    except Exception as exc:

        return (
            None,
            f"IMD PDF download failed: {exc}",
        )


# ============================================================
# PDF PARSER
# ============================================================

def parse_pdf(
    pdf_bytes: bytes,
) -> list[dict[str, Any]]:

    print("")
    print("[IMD PDF] Parsing rainfall PDF...")

    try:

        import pdfplumber

    except ImportError:

        print(
            "[IMD PDF] pdfplumber is not installed."
        )

        return []

    records: list[dict[str, Any]] = []

    try:

        with pdfplumber.open(
            io.BytesIO(pdf_bytes)
        ) as pdf:

            print(
                f"[IMD PDF] Pages: {len(pdf.pages)}"
            )

            for page_number, page in enumerate(
                pdf.pages,
                start=1,
            ):

                tables = page.extract_tables()

                print(
                    f"[IMD PDF] Page {page_number}: "
                    f"{len(tables)} tables"
                )

                for table in tables:

                    if not table:

                        continue

                    for row in table:

                        if not row:

                            continue

                        cleaned = [
                            clean_text(cell)
                            for cell in row
                        ]

                        # Save raw rows for later recognition.
                        records.append(
                            {
                                "_page": page_number,
                                "_row": cleaned,
                            }
                        )

        print(
            "[IMD PDF] Extracted raw rows:"
            f" {len(records)}"
        )

        return records

    except Exception as exc:

        print(
            "[IMD PDF] PDF parsing failed:"
            f" {exc}"
        )

        return []


# ============================================================
# RAJASTHAN ROW RECOGNITION
# ============================================================

def normalize_pdf_rows(
    raw_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:

    """
    Attempt to recognize district rows from the IMD PDF.

    The parser is intentionally conservative.

    If a row cannot be confidently interpreted,
    it is skipped rather than inventing data.
    """

    output = []

    for item in raw_rows:

        row = item.get("_row", [])

        if not isinstance(row, list):

            continue

        values = [
            clean_text(value)
            for value in row
        ]

        if len(values) < 3:

            continue

        joined = " | ".join(values)

        upper = normalize_name(joined)

        # Rajasthan rows normally contain the state name
        # somewhere in the hierarchy.
        if "RAJASTHAN" not in upper:

            continue

        # Look for a district-looking rainfall value.
        rainfall_candidates = []

        for value in values:

            number = safe_float(value)

            if number is not None:

                rainfall_candidates.append(
                    number
                )

        if not rainfall_candidates:

            continue

        # Find first plausible district text.
        district = ""

        for value in values:

            text = normalize_name(value)

            if not text:

                continue

            if text == "RAJASTHAN":

                continue

            if (
                re.search(
                    r"[A-Z]",
                    text,
                )
                and not re.fullmatch(
                    r"[\d.\-%]+",
                    text,
                )
            ):

                district = clean_text(value)
                break

        if not district:

            continue

        # The PDF layout can change. We do NOT assume that an
        # arbitrary numeric column is definitely daily rainfall.
        #
        # Therefore only create a record when a header-like
        # "daily actual" column is visible in the row context.
        #
        # Otherwise leave the row for inspection.
        output.append(
            {
                "state": "Rajasthan",
                "district_candidate": district,
                "numeric_values": rainfall_candidates,
                "raw_row": values,
                "page": item.get("_page"),
            }
        )

    return output


# ============================================================
# PUBLIC FALLBACK
# ============================================================

def fetch_public_imd_pdf_records() -> tuple[
    list[dict[str, Any]],
    str | None,
]:

    pdf_url, error = discover_imd_pdf()

    if error:

        return [], error

    pdf_bytes, error = download_pdf(
        pdf_url
    )

    if error:

        return [], error

    raw_rows = parse_pdf(
        pdf_bytes
    )

    if not raw_rows:

        return (
            [],
            "PDF was downloaded but no table rows were extracted.",
        )

    recognized = normalize_pdf_rows(
        raw_rows
    )

    if not recognized:

        return (
            [],
            (
                "PDF was downloaded successfully, but the "
                "current PDF table layout could not be "
                "safely mapped into rainfall records. "
                "No values were invented."
            ),
        )

    # IMPORTANT:
    # We deliberately do not convert uncertain numeric columns
    # into rainfall_mm.
    #
    # This prevents silently publishing wrong rainfall values.

    print(
        "[IMD PDF] Rows recognized for Rajasthan:"
        f" {len(recognized)}"
    )

    return [], (
        "IMD PDF successfully downloaded and inspected, "
        "but rainfall column mapping requires confirmation "
        "for the current PDF format."
    )


# ============================================================
# OUTPUT
# ============================================================

def save_output(
    records: list[dict[str, Any]],
    status: str,
    source: str,
    source_url: str,
    error: str | None = None,
) -> None:

    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    output = {
        "schema_version": "2.0",
        "generated_at_utc": now_utc_iso(),

        "status": status,

        "source": {
            "name": "India Meteorological Department",
            "product": "District Rainfall",
            "method": source,
            "url": source_url,
        },

        "coverage": {
            "state": "Rajasthan",
            "record_count": len(records),
        },

        "period": {
            "type": "IMD_DAILY",
            "note": (
                "IMD daily rainfall follows the official "
                "IMD rainfall reporting period."
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
        f"[IMD] Saved output: {OUTPUT_FILE}"
    )


# ============================================================
# MAIN
# ============================================================

def main() -> int:

    print("")
    print("=" * 72)
    print(
        "RAJASTHAN RAIN PREDICTOR - "
        "IMD OBSERVATION COLLECTOR V2"
    )
    print("=" * 72)

    # --------------------------------------------------------
    # 1. TRY OFFICIAL API
    # --------------------------------------------------------

    payload, api_error = fetch_imd_api()

    if payload is not None:

        raw_records = extract_api_records(
            payload
        )

        print(
            "[IMD API] Records received:"
            f" {len(raw_records)}"
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
                == TARGET_STATE
            ):

                normalized.append(item)

        if normalized:

            save_output(
                records=normalized,
                status="success",
                source=(
                    "IMD District-wise "
                    "Rainfall API"
                ),
                source_url=IMD_API_URL,
            )

            print("")
            print(
                "[IMD] SUCCESS: Official API data collected."
            )

            return 0

        api_error = (
            "IMD API returned data, but no Rajasthan "
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
    # 2. PUBLIC PDF FALLBACK
    # --------------------------------------------------------

    pdf_records, pdf_error = (
        fetch_public_imd_pdf_records()
    )

    if pdf_records:

        save_output(
            records=pdf_records,
            status="success",
            source=(
                "IMD public rainfall "
                "statistics PDF"
            ),
            source_url=IMD_RAINFALL_STATISTICS_PAGE,
        )

        return 0

    # --------------------------------------------------------
    # 3. SAFE UNAVAILABLE STATE
    # --------------------------------------------------------

    combined_error = (
        "Direct IMD API unavailable. "
        "Public IMD PDF fallback did not produce "
        "safely mapped rainfall records."
    )

    if api_error:

        combined_error += (
            f" API: {api_error}."
        )

    if pdf_error:

        combined_error += (
            f" PDF: {pdf_error}"
        )

    save_output(
        records=[],
        status="unavailable",
        source=(
            "IMD official sources"
        ),
        source_url=IMD_RAINFALL_STATISTICS_PAGE,
        error=combined_error,
    )

    print("")
    print(
        "[IMD] No rainfall values were invented."
    )
    print(
        "[IMD] Collector finished safely."
    )
    print("")

    return 0


if __name__ == "__main__":
    sys.exit(main())
