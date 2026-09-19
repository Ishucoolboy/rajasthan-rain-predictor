"""
Rajasthan Rain Predictor
Regional Accuracy Collector V2

Purpose:
- Read Rajasthan monitoring locations
- Get coordinates automatically
- Fetch historical rainfall reference
- Fetch ECMWF / GFS / ICON previous-run forecasts
- Calculate Day 1-7 forecast accuracy
- Store results in a regional JSON database
- Continue processing even when individual API requests fail

Reference:
Open-Meteo ERA5 / reanalysis

IMPORTANT:
This is NOT independent IMD rain-gauge accuracy.
"""

import json
import math
import sys
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


# ============================================================
# HISTORICAL TEST SETTINGS
# ============================================================

INITIAL_TEST_DAYS = 90

HISTORICAL_DELAY_DAYS = 8


# ============================================================
# REQUEST SETTINGS
# ============================================================

REQUEST_TIMEOUT = 90

REQUEST_DELAY_SECONDS = 0.8

MAX_RETRIES = 5

RETRY_DELAYS = [
    3,
    8,
    15,
    30,
    60,
]


# ============================================================
# HTTP SESSION
# ============================================================

SESSION = requests.Session()

SESSION.headers.update(
    {
        "User-Agent": (
            "Rajasthan-Rain-Predictor/"
            "regional-accuracy-collector"
        )
    }
)


# ============================================================
# LOGGING
# ============================================================

def log(message):
    """Print timestamped log message."""

    now = datetime.now().strftime(
        "%Y-%m-%d %H:%M:%S"
    )

    print(
        f"[{now}] {message}",
        flush=True,
    )


def warning(message):
    """Print warning message."""

    log(
        f"WARNING: {message}"
    )


def log_error(message):
    """Print error message."""

    log(
        f"ERROR: {message}"
    )


# ============================================================
# SAFE CONVERSION
# ============================================================

def safe_float(value):
    """Convert value to finite float safely."""

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


# ============================================================
# REQUEST HELPER WITH RETRIES
# ============================================================

def request_json(
    url,
    params,
    description="API request",
):
    """
    GET JSON with retry support.

    Retries:
    - HTTP 429
    - HTTP 500+
    - network errors
    - timeout errors

    Does not retry most 4xx errors.
    """

    last_error = None

    for attempt in range(
        1,
        MAX_RETRIES + 1,
    ):

        try:

            response = SESSION.get(
                url,
                params=params,
                timeout=REQUEST_TIMEOUT,
            )

            if response.ok:

                return response.json()

            status = response.status_code

            body = ""

            try:
                body = response.text[:500]
            except Exception:
                body = ""

            last_error = RuntimeError(
                f"HTTP {status}: {body}"
            )

            retryable = (
                status == 429
                or status >= 500
            )

            if not retryable:

                raise last_error

            warning(
                f"{description} failed with "
                f"HTTP {status}. "
                f"Retry {attempt}/{MAX_RETRIES}"
            )

        except (
            requests.Timeout,
            requests.ConnectionError,
            requests.RequestException,
        ) as request_error:

            last_error = request_error

            warning(
                f"{description} network error: "
                f"{request_error}. "
                f"Retry {attempt}/{MAX_RETRIES}"
            )

        except ValueError as json_error:

            last_error = json_error

            warning(
                f"{description} returned invalid JSON. "
                f"Retry {attempt}/{MAX_RETRIES}"
            )

        if attempt < MAX_RETRIES:

            delay_index = min(
                attempt - 1,
                len(RETRY_DELAYS) - 1,
            )

            delay = RETRY_DELAYS[
                delay_index
            ]

            log(
                f"Waiting {delay}s before retry..."
            )

            time.sleep(delay)

    raise RuntimeError(
        f"{description} failed after "
        f"{MAX_RETRIES} attempts: "
        f"{last_error}"
    )


# ============================================================
# LOAD LOCATIONS
# ============================================================

def load_locations():
    """Load Rajasthan monitoring locations."""

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

    log(
        f"Loaded {len(locations)} monitoring locations."
    )

    return locations


# ============================================================
# LOAD EXISTING DATABASE
# ============================================================

def load_database():
    """
    Load existing database.

    Existing successful location records are preserved.
    """

    if not OUTPUT_FILE.exists():

        return {
            "version": "regional-accuracy-v2",
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
                "Database is not a JSON object."
            )

        data.setdefault(
            "locations",
            [],
        )

        log(
            "Existing regional database loaded."
        )

        log(
            "Existing locations: "
            f"{len(data['locations'])}"
        )

        return data

    except Exception as load_error:

        warning(
            "Existing database could not be loaded: "
            f"{load_error}"
        )

        return {
            "version": "regional-accuracy-v2",
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
    """Save database safely."""

    database[
        "version"
    ] = "regional-accuracy-v2"

    database[
        "generated_at"
    ] = datetime.now(
        timezone.utc
    ).isoformat()

    temporary_file = (
        OUTPUT_FILE.with_suffix(
            ".tmp"
        )
    )

    with open(
        temporary_file,
        "w",
        encoding="utf-8",
    ) as file:

        json.dump(
            database,
            file,
            indent=2,
            ensure_ascii=False,
        )

    temporary_file.replace(
        OUTPUT_FILE
    )


# ============================================================
# GEOCODING
# ============================================================

def geocode_location(query):
    """
    Convert location name into coordinates.
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
        description=f"Geocoding {query}",
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
    Return completed historical period.

    Latest date:
    today - HISTORICAL_DELAY_DAYS

    Then INITIAL_TEST_DAYS backwards.
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
        description=(
            "ERA5 reference "
            f"{latitude},{longitude}"
        ),
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

        if index >= len(
            rainfall
        ):
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

    IMPORTANT:
    previous_day1 ... previous_day7
    are hourly variables.
    """

    variables = []

    for day in range(
        1,
        8,
    ):

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
        description=(
            f"{model_id} previous runs "
            f"{latitude},{longitude}"
        ),
    )


# ============================================================
# HOURLY TO DAILY
# ============================================================

def aggregate_hourly_to_daily(
    hourly,
    variable_name,
):
    """
    Convert hourly precipitation
    into daily totals.
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

        error_value = (
            forecast - actual
        )

        absolute_error += abs(
            error_value
        )

        squared_error += (
            error_value
            * error_value
        )

        bias_total += error_value

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

        "correct_no_rain": (
            correct_no_rain
        ),
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
    Test one weather model.
    """

    model_name = model[
        "name"
    ]

    model_id = model[
        "model_id"
    ]

    log(
        f"{location['name']} → "
        f"{model_name} historical test"
    )

    previous_runs = fetch_previous_runs(
        latitude=location[
            "latitude"
        ],
        longitude=location[
            "longitude"
        ],
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
            "precipitation_previous_day"
            f"{lead_day}"
        )

        forecast_daily = (
            aggregate_hourly_to_daily(
                hourly,
                variable_name,
            )
        )

        pairs = []

        for (
            date,
            actual,
        ) in reference.items():

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
                    "forecast_rain_mm": (
                        forecast
                    ),
                    "actual_rain_mm": (
                        actual_value
                    ),
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
            f"  {model_name} "
            f"Day {lead_day}: "
            f"{metrics['samples']} samples"
        )

    return {
        "name": model_name,
        "model_id": model_id,
        "success": True,
        "leads": leads,
    }


# ============================================================
# FIND EXISTING LOCATION
# ============================================================

def find_existing_location(
    database,
    location_id,
):
    """
    Find existing location record.
    """

    locations = database.setdefault(
        "locations",
        [],
    )

    for index, record in enumerate(
        locations
    ):

        current_location = record.get(
            "location",
            {},
        )

        if (
            current_location.get(
                "id"
            )
            == location_id
        ):

            return index

    return None


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
    Generate regional accuracy
    for one location.
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

    # --------------------------------------------------------
    # GEOCODE
    # --------------------------------------------------------

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
        "Coordinates: "
        f"{resolved_location['latitude']}, "
        f"{resolved_location['longitude']}"
    )

    time.sleep(
        REQUEST_DELAY_SECONDS
    )

    # --------------------------------------------------------
    # REFERENCE
    # --------------------------------------------------------

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

    time.sleep(
        REQUEST_DELAY_SECONDS
    )

    # --------------------------------------------------------
    # MODELS
    # --------------------------------------------------------

    model_results = []

    model_failures = 0

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

        except Exception as model_error:

            model_failures += 1

            log_error(
                f"{model['name']} failed "
                f"for {location['name']}: "
                f"{model_error}"
            )

            model_results.append(
                {
                    "name": model[
                        "name"
                    ],
                    "model_id": model[
                        "model_id"
                    ],
                    "success": False,
                    "error": str(
                        model_error
                    ),
                    "leads": [],
                }
            )

        time.sleep(
            REQUEST_DELAY_SECONDS
        )

    # --------------------------------------------------------
    # RECORD
    # --------------------------------------------------------

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

    if model_failures == len(
        MODELS
    ):

        warning(
            f"{location['name']}: "
            "all weather models failed."
        )

    # --------------------------------------------------------
    # SAVE / REPLACE LOCATION
    # --------------------------------------------------------

    existing_index = (
        find_existing_location(
            database,
            location["id"],
        )
    )

    if existing_index is not None:

        database[
            "locations"
        ][existing_index] = record

        log(
            f"Updated existing location: "
            f"{location['name']}"
        )

    else:

        database[
            "locations"
        ].append(record)

        log(
            f"Added new location: "
            f"{location['name']}"
        )

    return record


# ============================================================
# MAIN
# ============================================================

def main():
    """Run regional accuracy collector."""

    log(
        "=============================================="
    )

    log(
        "RAJASTHAN REGIONAL ACCURACY COLLECTOR V2"
    )

    log(
        "=============================================="
    )

    # --------------------------------------------------------
    # LOAD
    # --------------------------------------------------------

    locations = load_locations()

    database = load_database()

    # --------------------------------------------------------
    # PERIOD
    # --------------------------------------------------------

    start_date, end_date = (
        get_test_period()
    )

    log(
        f"Historical period: "
        f"{start_date} → {end_date}"
    )

    log(
        f"Locations requested: "
        f"{len(locations)}"
    )

    # --------------------------------------------------------
    # COUNTERS
    # --------------------------------------------------------

    successful_locations = 0

    failed_locations = 0

    # --------------------------------------------------------
    # PROCESS LOCATIONS
    # --------------------------------------------------------

    for index, location in enumerate(
        locations,
        start=1,
    ):

        log(
            "=============================================="
        )

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

            successful_locations += 1

            log(
                f"SUCCESS: "
                f"{location['name']}"
            )

        except Exception as location_error:

            failed_locations += 1

            log_error(
                f"{location['name']} failed: "
                f"{location_error}"
            )

            # IMPORTANT:
            # Do not delete existing successful
            # database record if a new attempt fails.

        # ----------------------------------------------------
        # SAVE AFTER EVERY LOCATION
        # ----------------------------------------------------

        try:

            save_database(
                database
            )

            log(
                "Database checkpoint saved."
            )

        except Exception as save_error:

            log_error(
                "Database save failed: "
                f"{save_error}"
            )

            raise

        time.sleep(
            REQUEST_DELAY_SECONDS
        )

    # --------------------------------------------------------
    # FINAL SAVE
    # --------------------------------------------------------

    save_database(
        database
    )

    # --------------------------------------------------------
    # FINAL REPORT
    # --------------------------------------------------------

    database_locations = len(
        database.get(
            "locations",
            [],
        )
    )

    log(
        "=============================================="
    )

    log(
        "REGIONAL COLLECTION COMPLETE"
    )

    log(
        f"Requested locations: "
        f"{len(locations)}"
    )

    log(
        f"Successful locations: "
        f"{successful_locations}"
    )

    log(
        f"Failed locations: "
        f"{failed_locations}"
    )

    log(
        f"Locations in database: "
        f"{database_locations}"
    )

    log(
        f"Database: "
        f"{OUTPUT_FILE}"
    )

    log(
        "=============================================="
    )

    # --------------------------------------------------------
    # IMPORTANT:
    # We intentionally keep exit code 0 so that the GitHub
    # workflow can commit partial progress.
    #
    # Failed locations will be retried on the next daily run.
    # --------------------------------------------------------

    if failed_locations > 0:

        warning(
            "Some locations failed. "
            "They will be retried on the next run."
        )

    log(
        "Collector finished successfully."
    )


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":

    try:

        main()

    except KeyboardInterrupt:

        log(
            "Collector interrupted by user."
        )

        sys.exit(1)

    except Exception as fatal_error:

        log_error(
            f"Fatal collector error: "
            f"{fatal_error}"
        )

        sys.exit(1)
