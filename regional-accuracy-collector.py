"""
Rajasthan Rain Predictor
Regional Accuracy Collector

Purpose:
- Read Rajasthan monitoring locations
- Get coordinates automatically
- Fetch historical rainfall reference
- Fetch ECMWF / GFS / ICON previous-run forecasts
- Calculate Day 1-7 forecast accuracy
- Store results in a regional JSON database

Reference:
Open-Meteo ERA5/reanalysis

IMPORTANT:
This is NOT independent IMD rain-gauge accuracy.
"""

import json
import math
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests


# ============================================================
# CONFIGURATION
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

LOCATIONS_FILE = (
    BASE_DIR / "regional-monitoring-locations.json"
)

OUTPUT_FILE = (
    BASE_DIR / "regional-accuracy-database.json"
)

GEOCODING_URL = (
    "https://geocoding-api.open-meteo.com/v1/search"
)

ARCHIVE_URL = (
    "https://archive-api.open-meteo.com/v1/archive"
)

PREVIOUS_RUNS_URL = (
    "https://previous-runs-api.open-meteo.com/v1/forecast"
)


MODELS = [
    {
        "name": "ECMWF",
        "model_id": "ecmwf_ifs025",
    },
    {
        "name": "GFS",
        "model_id": "gfs_seamless",
    },
    {
        "name": "ICON",
        "model_id": "icon_seamless",
    },
]


# Number of historical days used to initialise
# the regional database.

INITIAL_TEST_DAYS = 90

# Keep a safety gap because the most recent historical
# data may not yet be completely available.

HISTORICAL_DELAY_DAYS = 8


REQUEST_TIMEOUT = 60

REQUEST_DELAY_SECONDS = 0.5


# ============================================================
# HELPERS
# ============================================================

def log(message):
    """Print a timestamped message."""

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    print(
        f"[{now}] {message}",
        flush=True,
    )


def safe_float(value):
    """Convert a value to float safely."""

    try:
        number = float(value)

        if math.isfinite(number):
            return number

    except (
        TypeError,
        ValueError,
    ):
        pass

    return None


def request_json(url, params):
    """Make a GET request and return JSON."""

    response = requests.get(
        url,
        params=params,
        timeout=REQUEST_TIMEOUT,
    )

    if not response.ok:

        body = ""

        try:
            body = response.text[:1000]
        except Exception:
            pass

        raise RuntimeError(
            f"HTTP {response.status_code}: {body}"
        )

    return response.json()


def load_locations():
    """Load monitoring locations."""

    if not LOCATIONS_FILE.exists():

        raise FileNotFoundError(
            f"Missing file: {LOCATIONS_FILE}"
        )

    with open(
        LOCATIONS_FILE,
        "r",
        encoding="utf-8",
    ) as file:

        data = json.load(file)

    locations = data.get(
        "locations",
        [],
    )

    if not locations:

        raise ValueError(
            "No monitoring locations found."
        )

    return locations


# ============================================================
# GEOCODING
# ============================================================

def geocode_location(query):
    """
    Convert a location name into latitude/longitude.

    Open-Meteo geocoding is used so the project does not
    require a separate API key.
    """

    params = {
        "name": query,
        "count": 1,
        "language": "en",
        "format": "json",
    }

    data = request_json(
        GEOCODING_URL,
        params,
    )

    results = data.get(
        "results",
        [],
    )

    if not results:

        raise RuntimeError(
            f"Could not geocode: {query}"
        )

    result = results[0]

    latitude = safe_float(
        result.get("latitude")
    )

    longitude = safe_float(
        result.get("longitude")
    )

    if (
        latitude is None
        or longitude is None
    ):

        raise RuntimeError(
            f"Invalid coordinates for: {query}"
        )

    return {
        "latitude": latitude,
        "longitude": longitude,
        "name": result.get(
            "name",
            query,
        ),
        "country": result.get(
            "country",
            "India",
        ),
        "admin1": result.get(
            "admin1",
            "Rajasthan",
        ),
    }


# ============================================================
# DATE RANGE
# ============================================================

def get_test_period():
    """
    Return a completed historical period.

    Example:

    Today
       ↓
    minus 8 days
       ↓
    end date

    Then 90 days backwards.
    """

    today = datetime.now(
        timezone.utc
    ).date()

    end_date = (
        today
        - timedelta(
            days=HISTORICAL_DELAY_DAYS
        )
    )

    start_date = (
        end_date
        - timedelta(
            days=INITIAL_TEST_DAYS - 1
        )
    )

    return (
        start_date.isoformat(),
        end_date.isoformat(),
    )


# ============================================================
# HISTORICAL REFERENCE
# ============================================================

def fetch_reference(
    latitude,
    longitude,
    start_date,
    end_date,
):
    """
    Fetch ERA5/reanalysis daily rainfall.
    """

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "start_date": start_date,
        "end_date": end_date,
        "daily": "precipitation_sum",
        "timezone": "auto",
        "precipitation_unit": "mm",
    }

    data = request_json(
        ARCHIVE_URL,
        params,
    )

    daily = data.get(
        "daily",
        {},
    )

    dates = daily.get(
        "time",
        [],
    )

    rainfall = daily.get(
        "precipitation_sum",
        [],
    )

    result = {}

    for index, date in enumerate(
        dates
    ):

        if index >= len(rainfall):
            continue

        value = safe_float(
            rainfall[index]
        )

        if value is None:
            continue

        result[date] = value

    return result


# ============================================================
# PREVIOUS RUNS
# ============================================================

def fetch_previous_runs(
    latitude,
    longitude,
    start_date,
    end_date,
    model_id,
):
    """
    Fetch fixed lead-time forecast rainfall.

    precipitation_previous_day1 ... day7 are
    requested through the HOURLY endpoint.

    They are later aggregated into daily totals.
    """

    variables = []

    for day in range(1, 8):

        variables.append(
            f"precipitation_previous_day{day}"
        )

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "start_date": start_date,
        "end_date": end_date,
        "hourly": ",".join(
            variables
        ),
        "models": model_id,
        "timezone": "auto",
        "precipitation_unit": "mm",
    }

    return request_json(
        PREVIOUS_RUNS_URL,
        params,
    )


# ============================================================
# HOURLY → DAILY
# ============================================================

def aggregate_hourly_to_daily(
    hourly,
    variable_name,
):
    """
    Sum hourly precipitation into daily totals.
    """

    dates = hourly.get(
        "time",
        [],
    )

    values = hourly.get(
        variable_name,
        [],
    )

    result = {}

    for index, timestamp in enumerate(
        dates
    ):

        if index >= len(values):
            continue

        if not timestamp:
            continue

        date = str(
            timestamp
        )[:10]

        value = safe_float(
            values[index]
        )

        if value is None:
            continue

        result[date] = (
            result.get(
                date,
                0.0,
            )
            + value
        )

    return result


# ============================================================
# METRICS
# ============================================================

def calculate_metrics(pairs):
    """
    Calculate rainfall forecast metrics.
    """

    if not pairs:

        return {
            "samples": 0,
            "mae_mm": None,
            "rmse_mm": None,
            "bias_mm": None,
            "rain_accuracy_percent": None,
            "hits": 0,
            "misses": 0,
            "false_alarms": 0,
            "correct_no_rain": 0,
        }

    absolute_error = 0.0
    squared_error = 0.0
    bias_total = 0.0

    hits = 0
    misses = 0
    false_alarms = 0
    correct_no_rain = 0

    for pair in pairs:

        forecast = pair[
            "forecast_rain_mm"
        ]

        actual = pair[
            "actual_rain_mm"
        ]

        error = (
            forecast - actual
        )

        absolute_error += abs(
            error
        )

        squared_error += (
            error * error
        )

        bias_total += error

        forecast_rain = (
            forecast >= 0.1
        )

        actual_rain = (
            actual >= 0.1
        )

        if (
            forecast_rain
            and actual_rain
        ):

            hits += 1

        elif (
            not forecast_rain
            and actual_rain
        ):

            misses += 1

        elif (
            forecast_rain
            and not actual_rain
        ):

            false_alarms += 1

        else:

            correct_no_rain += 1

    samples = len(pairs)

    return {
        "samples": samples,

        "mae_mm": round(
            absolute_error
            / samples,
            4,
        ),

        "rmse_mm": round(
            math.sqrt(
                squared_error
                / samples
            ),
            4,
        ),

        "bias_mm": round(
            bias_total
            / samples,
            4,
        ),

        "rain_accuracy_percent": round(
            (
                (
                    hits
                    + correct_no_rain
                )
                / samples
            )
            * 100,
            2,
        ),

        "hits": hits,
        "misses": misses,
        "false_alarms": false_alarms,
        "correct_no_rain": correct_no_rain,
    }


# ============================================================
# TEST ONE MODEL
# ============================================================

def test_model(
    location,
    model,
    reference,
    start_date,
    end_date,
):
    """
    Test one weather model for one location.
    """

    name = model["name"]

    model_id = model["model_id"]

    log(
        f"{location['name']} → "
        f"{name} historical test"
    )

    previous_runs = fetch_previous_runs(
        latitude=location["latitude"],
        longitude=location["longitude"],
        start_date=start_date,
        end_date=end_date,
        model_id=model_id,
    )

    hourly = previous_runs.get(
        "hourly",
        {},
    )

    leads = []

    for lead_day in range(
        1,
        8,
    ):

        variable_name = (
            f"precipitation_previous_day"
            f"{lead_day}"
        )

        forecast_daily = (
            aggregate_hourly_to_daily(
                hourly,
                variable_name,
            )
        )

        pairs = []

        for date, actual in reference.items():

            if date not in forecast_daily:
                continue

            forecast = safe_float(
                forecast_daily[date]
            )

            actual_value = safe_float(
                actual
            )

            if (
                forecast is None
                or actual_value is None
            ):
                continue

            pairs.append(
                {
                    "date": date,
                    "forecast_rain_mm": forecast,
                    "actual_rain_mm": actual_value,
                }
            )

        metrics = calculate_metrics(
            pairs
        )

        leads.append(
            {
                "lead_day": lead_day,
                "metrics": metrics,
            }
        )

        log(
            f"  {name} Day {lead_day}: "
            f"{metrics['samples']} samples"
        )

    return {
        "name": name,
        "model_id": model_id,
        "success": True,
        "leads": leads,
    }


# ============================================================
# LOAD EXISTING DATABASE
# ============================================================

def load_database():
    """Load existing database if available."""

    if not OUTPUT_FILE.exists():

        return {
            "version": "regional-accuracy-v1",
            "generated_at": None,
            "reference": {
                "name": (
                    "ERA5 / Open-Meteo reanalysis"
                ),
                "type": "reanalysis",
            },
            "locations": [],
        }

    try:

        with open(
            OUTPUT_FILE,
            "r",
            encoding="utf-8",
        ) as file:

            data = json.load(file)

        if not isinstance(
            data,
            dict,
        ):

            raise ValueError(
                "Invalid database format."
            )

        return data

    except Exception as error:

        log(
            f"Existing database could not be "
            f"loaded: {error}"
        )

        return {
            "version": "regional-accuracy-v1",
            "generated_at": None,
            "reference": {
                "name": (
                    "ERA5 / Open-Meteo reanalysis"
                ),
                "type": "reanalysis",
            },
            "locations": [],
        }


# ============================================================
# SAVE DATABASE
# ============================================================

def save_database(database):
    """Write database to JSON."""

    database[
        "generated_at"
    ] = datetime.now(
        timezone.utc
    ).isoformat()

    with open(
        OUTPUT_FILE,
        "w",
        encoding="utf-8",
    ) as file:

        json.dump(
            database,
            file,
            indent=2,
            ensure_ascii=False,
        )


# ============================================================
# UPDATE LOCATION
# ============================================================

def update_location(
    database,
    location,
    start_date,
    end_date,
):
    """
    Generate and save accuracy data
    for one monitoring location.
    """

    log(
        "------------------------------------------------"
    )

    log(
        f"Processing: {location['name']}"
    )

    query = location.get(
        "query",
        location["name"],
    )

    coordinates = geocode_location(
        query
    )

    resolved_location = {
        "id": location["id"],
        "name": location["name"],
        "query": query,
        "latitude": coordinates[
            "latitude"
        ],
        "longitude": coordinates[
            "longitude"
        ],
    }

    log(
        f"Coordinates: "
        f"{resolved_location['latitude']}, "
        f"{resolved_location['longitude']}"
    )

    reference = fetch_reference(
        latitude=resolved_location[
            "latitude"
        ],
        longitude=resolved_location[
            "longitude"
        ],
        start_date=start_date,
        end_date=end_date,
    )

    log(
        f"Reference days: "
        f"{len(reference)}"
    )

    model_results = []

    for model in MODELS:

        try:

            result = test_model(
                location=resolved_location,
                model=model,
                reference=reference,
                start_date=start_date,
                end_date=end_date,
            )

            model_results.append(
                result
            )

        except Exception as error:

            error(
                f"{model['name']} failed: "
                f"{error}"
            )

            model_results.append(
                {
                    "name": model["name"],
                    "model_id": model[
                        "model_id"
                    ],
                    "success": False,
                    "error": str(error),
                    "leads": [],
                }
            )

        time.sleep(
            REQUEST_DELAY_SECONDS
        )

    record = {
        "location": resolved_location,
        "period": {
            "start": start_date,
            "end": end_date,
            "days": INITIAL_TEST_DAYS,
        },
        "reference": {
            "name": (
                "ERA5 / Open-Meteo reanalysis"
            ),
            "type": "reanalysis",
        },
        "models": model_results,
        "updated_at": datetime.now(
            timezone.utc
        ).isoformat(),
    }

    existing_locations = database.setdefault(
        "locations",
        [],
    )

    replaced = False

    for index, existing in enumerate(
        existing_locations
    ):

        existing_location = existing.get(
            "location",
            {},
        )

        if (
            existing_location.get("id")
            == resolved_location["id"]
        ):

            existing_locations[index] = (
                record
            )

            replaced = True

            break

    if not replaced:

        existing_locations.append(
            record
        )

    return record


# ============================================================
# MAIN
# ============================================================

def main():
    """Run the regional accuracy collector."""

    log(
        "=============================================="
    )

    log(
        "RAJASTHAN REGIONAL ACCURACY COLLECTOR"
    )

    log(
        "=============================================="
    )

    locations = load_locations()

    database = load_database()

    start_date, end_date = (
        get_test_period()
    )

    log(
        f"Historical period: "
        f"{start_date} → {end_date}"
    )

    log(
        f"Locations: {len(locations)}"
    )

    successful = 0
    failed = 0

    for index, location in enumerate(
        locations,
        start=1,
    ):

        log(
            f"[{index}/{len(locations)}] "
            f"{location['name']}"
        )

        try:

            update_location(
                database=database,
                location=location,
                start_date=start_date,
                end_date=end_date,
            )

            successful += 1

        except Exception as error:

            failed += 1

            log(
                f"FAILED: "
                f"{location['name']} → "
                f"{error}"
            )

        save_database(
            database
        )

        time.sleep(
            REQUEST_DELAY_SECONDS
        )

    save_database(
        database
    )

    log(
        "=============================================="
    )

    log(
        "REGIONAL COLLECTION COMPLETE"
    )

    log(
        f"Successful locations: {successful}"
    )

    log(
        f"Failed locations: {failed}"
    )

    log(
        f"Database: {OUTPUT_FILE}"
    )

    log(
        "=============================================="
    )


if __name__ == "__main__":

    main()
