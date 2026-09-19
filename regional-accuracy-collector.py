"""
Rajasthan Rain Predictor
Regional Accuracy Collector V4

Purpose:
- Read Rajasthan monitoring locations
- Geocode locations automatically
- Fetch ERA5/reanalysis rainfall reference
- Fetch ECMWF / GFS / ICON previous-run forecasts
- Calculate Day 1-7 rainfall forecast accuracy
- Build a Rajasthan regional accuracy database
- Preserve successful model results
- Retry only missing/failed models
- Recover gracefully from API timeouts

IMPORTANT:
This uses ERA5 / Open-Meteo reanalysis as the reference.
It is NOT independent IMD rain-gauge accuracy.
"""


import json
import math
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests


# ============================================================
# PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

LOCATIONS_FILE = (
    BASE_DIR / "regional-monitoring-locations.json"
)

OUTPUT_FILE = (
    BASE_DIR / "regional-accuracy-database.json"
)


# ============================================================
# API ENDPOINTS
# ============================================================

GEOCODING_URL = (
    "https://geocoding-api.open-meteo.com/v1/search"
)

ARCHIVE_URL = (
    "https://archive-api.open-meteo.com/v1/archive"
)

PREVIOUS_RUNS_URL = (
    "https://previous-runs-api.open-meteo.com/v1/forecast"
)


# ============================================================
# MODELS
# ============================================================

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
# HISTORICAL SETTINGS
# ============================================================

INITIAL_TEST_DAYS = 90

HISTORICAL_DELAY_DAYS = 8


# ============================================================
# NETWORK SETTINGS
# ============================================================

REQUEST_TIMEOUT = 35

MAX_RETRIES = 2

RETRY_DELAY_SECONDS = 5

REQUEST_DELAY_SECONDS = 0.5


# ============================================================
# SESSION
# ============================================================

SESSION = requests.Session()

SESSION.headers.update(
    {
        "User-Agent": (
            "Rajasthan-Rain-Predictor/"
            "Regional-Accuracy-Collector-V4"
        )
    }
)


# ============================================================
# LOGGING
# ============================================================

def log(message):
    """Print timestamped log."""

    now = datetime.now().strftime(
        "%Y-%m-%d %H:%M:%S"
    )

    print(
        f"[{now}] {message}",
        flush=True,
    )


def warning(message):
    """Print warning."""

    log(
        f"WARNING: {message}"
    )


def log_error(message):
    """Print error."""

    log(
        f"ERROR: {message}"
    )


# ============================================================
# SAFE FLOAT
# ============================================================

def safe_float(value):
    """Convert value safely to finite float."""

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
# HTTP REQUEST
# ============================================================

def request_json(
    url,
    params,
    description,
):
    """
    Request JSON from API.

    Uses short retries so one slow API request
    cannot block the entire collection.
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
                f"{description}: HTTP {status} "
                f"(attempt {attempt}/{MAX_RETRIES})"
            )

        except requests.Timeout as error:

            last_error = error

            warning(
                f"{description}: timeout "
                f"(attempt {attempt}/{MAX_RETRIES})"
            )

        except requests.ConnectionError as error:

            last_error = error

            warning(
                f"{description}: connection error "
                f"(attempt {attempt}/{MAX_RETRIES})"
            )

        except requests.RequestException as error:

            last_error = error

            warning(
                f"{description}: {error} "
                f"(attempt {attempt}/{MAX_RETRIES})"
            )

        except ValueError as error:

            last_error = error

            warning(
                f"{description}: invalid JSON "
                f"(attempt {attempt}/{MAX_RETRIES})"
            )

        if attempt < MAX_RETRIES:

            log(
                f"Retrying in "
                f"{RETRY_DELAY_SECONDS}s..."
            )

            time.sleep(
                RETRY_DELAY_SECONDS
            )

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
        f"Loaded {len(locations)} "
        f"monitoring locations."
    )

    return locations


# ============================================================
# EMPTY DATABASE
# ============================================================

def create_empty_database():
    """Create empty database structure."""

    return {
        "version": "regional-accuracy-v4",

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
# LOAD DATABASE
# ============================================================

def load_database():
    """Load existing regional database."""

    if not OUTPUT_FILE.exists():

        log(
            "No existing database found."
        )

        return create_empty_database()

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
                "Database format is invalid."
            )

        data.setdefault(
            "locations",
            [],
        )

        log(
            "Existing regional database loaded."
        )

        log(
            f"Existing locations: "
            f"{len(data['locations'])}"
        )

        return data

    except Exception as error:

        warning(
            f"Could not load existing database: "
            f"{error}"
        )

        return create_empty_database()


# ============================================================
# SAVE DATABASE
# ============================================================

def save_database(database):
    """Safely save regional database."""

    database[
        "version"
    ] = "regional-accuracy-v4"

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
    """Convert location query into coordinates."""

    params = {
        "name": query,
        "count": 1,
        "language": "en",
        "format": "json",
    }

    data = request_json(
        GEOCODING_URL,
        params,
        f"Geocoding {query}",
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
        result.get(
            "latitude"
        )
    )

    longitude = safe_float(
        result.get(
            "longitude"
        )
    )

    if (
        latitude is None
        or longitude is None
    ):

        raise RuntimeError(
            f"Invalid coordinates: {query}"
        )

    return {
        "latitude": latitude,
        "longitude": longitude,
    }


# ============================================================
# DATE PERIOD
# ============================================================

def get_test_period():
    """
    Return historical test period.

    The latest 8 days are skipped because recent
    historical data may still be incomplete.
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
# REFERENCE RAINFALL
# ============================================================

def fetch_reference(
    latitude,
    longitude,
    start_date,
    end_date,
):
    """Fetch ERA5/reanalysis daily rainfall."""

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
        (
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
    Fetch fixed lead-time rainfall forecasts.

    previous_day1 ... previous_day7 are hourly
    variables and are aggregated into daily totals.
    """

    variables = [
        (
            "precipitation_previous_day"
            f"{day}"
        )
        for day in range(
            1,
            8,
        )
    ]

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
        (
            f"{model_id} previous runs "
            f"{latitude},{longitude}"
        ),
    )


# ============================================================
# HOURLY → DAILY
# ============================================================

def aggregate_hourly_to_daily(
    hourly,
    variable_name,
):
    """Aggregate hourly rainfall into daily totals."""

    times = hourly.get(
        "time",
        [],
    )

    values = hourly.get(
        variable_name,
        [],
    )

    result = {}

    for index, timestamp in enumerate(
        times
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
    """Calculate rainfall forecast metrics."""

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

    samples = len(
        pairs
    )

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
    """Test one model at one location."""

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
# EXISTING LOCATION LOOKUP
# ============================================================

def get_existing_location(
    database,
    location_id,
):
    """Return existing location record."""

    for record in database.get(
        "locations",
        [],
    ):

        location = record.get(
            "location",
            {},
        )

        if (
            location.get("id")
            == location_id
        ):

            return record

    return None


# ============================================================
# FIND EXISTING MODEL
# ============================================================

def get_existing_model(
    record,
    model_name,
):
    """Find an existing model result."""

    if not isinstance(
        record,
        dict,
    ):

        return None

    for model in record.get(
        "models",
        [],
    ):

        if (
            model.get("name")
            == model_name
            and model.get("success")
            is True
        ):

            return model

    return None


# ============================================================
# RECORD PERIOD CHECK
# ============================================================

def record_has_current_period(
    record,
    start_date,
    end_date,
):
    """Check whether record belongs to current test period."""

    if not isinstance(
        record,
        dict,
    ):

        return False

    period = record.get(
        "period",
        {},
    )

    return (
        period.get("start")
        == start_date
        and
        period.get("end")
        == end_date
    )


# ============================================================
# MODEL COMPLETENESS
# ============================================================

def get_model_status(
    record,
):
    """Return successful and missing models."""

    successful = set()

    if isinstance(
        record,
        dict,
    ):

        for model in record.get(
            "models",
            [],
        ):

            if (
                model.get("success")
                is True
            ):

                successful.add(
                    model.get("name")
                )

    required = {
        "ECMWF",
        "GFS",
        "ICON",
    }

    missing = (
        required
        - successful
    )

    return (
        successful,
        missing,
    )


# ============================================================
# RECORD COMPLETE
# ============================================================

def record_is_complete(
    record,
    start_date,
    end_date,
):
    """Check whether all three models are successful."""

    if not record_has_current_period(
        record,
        start_date,
        end_date,
    ):

        return False

    successful, missing = (
        get_model_status(
            record
        )
    )

    return (
        len(successful) == 3
        and len(missing) == 0
    )


# ============================================================
# BUILD LOCATION
# ============================================================

def resolve_location(
    location,
    existing_record,
):
    """
    Resolve coordinates.

    Existing coordinates are reused whenever
    possible to avoid unnecessary geocoding calls.
    """

    if isinstance(
        existing_record,
        dict,
    ):

        existing_location = (
            existing_record.get(
                "location",
                {},
            )
        )

        old_latitude = safe_float(
            existing_location.get(
                "latitude"
            )
        )

        old_longitude = safe_float(
            existing_location.get(
                "longitude"
            )
        )

        if (
            old_latitude is not None
            and old_longitude is not None
        ):

            log(
                "Using saved coordinates."
            )

            return {
                "id": location["id"],

                "name": location["name"],

                "query": location.get(
                    "query",
                    location["name"],
                ),

                "latitude": old_latitude,

                "longitude": old_longitude,
            }

    query = location.get(
        "query",
        location["name"],
    )

    coordinates = geocode_location(
        query
    )

    return {
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


# ============================================================
# UPDATE MODEL RESULT
# ============================================================

def merge_model_result(
    existing_models,
    new_result,
):
    """
    Merge one model result into existing results.

    Successful results are preserved unless the
    new result is also successful.
    """

    models = []

    replaced = False

    for existing in existing_models:

        if (
            existing.get("name")
            == new_result.get("name")
        ):

            models.append(
                new_result
            )

            replaced = True

        else:

            models.append(
                existing
            )

    if not replaced:

        models.append(
            new_result
        )

    return models


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
    Generate or repair accuracy for one location.

    IMPORTANT:
    Only missing/failed models are requested.
    Existing successful models are preserved.
    """

    log(
        "------------------------------------------------"
    )

    log(
        f"Processing: {location['name']}"
    )

    existing_record = (
        get_existing_location(
            database,
            location["id"],
        )
    )

    # --------------------------------------------------------
    # RESOLVE LOCATION
    # --------------------------------------------------------

    resolved_location = resolve_location(
        location,
        existing_record,
    )

    log(
        "Coordinates: "
        f"{resolved_location['latitude']}, "
        f"{resolved_location['longitude']}"
    )

    # --------------------------------------------------------
    # CHECK PERIOD
    # --------------------------------------------------------

    if record_has_current_period(
        existing_record,
        start_date,
        end_date,
    ):

        existing_models = (
            existing_record.get(
                "models",
                [],
            )
        )

    else:

        existing_models = []

    successful_models, missing_models = (
        get_model_status(
            {
                "models": existing_models
            }
        )
    )

    if successful_models:

        log(
            "Already successful: "
            + ", ".join(
                sorted(
                    successful_models
                )
            )
        )

    if missing_models:

        log(
            "Models needing retry: "
            + ", ".join(
                sorted(
                    missing_models
                )
            )
        )

    # --------------------------------------------------------
    # IF NOTHING NEEDS WORK
    # --------------------------------------------------------

    if not missing_models:

        log(
            f"{location['name']}: "
            "all 3 models already complete."
        )

        return existing_record

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
    # MODEL RETRIES
    # --------------------------------------------------------

    model_lookup = {
        model["name"]: model
        for model in MODELS
    }

    current_models = list(
        existing_models
    )

    successful_now = 0

    failed_now = 0

    for model_name in [
        "ECMWF",
        "GFS",
        "ICON",
    ]:

        if model_name not in missing_models:

            continue

        model = model_lookup[
            model_name
        ]

        try:

            result = test_model(
                location=resolved_location,
                model=model,
                reference=reference,
                start_date=start_date,
                end_date=end_date,
            )

            current_models = (
                merge_model_result(
                    current_models,
                    result,
                )
            )

            successful_now += 1

            log(
                f"{location['name']} → "
                f"{model_name}: SUCCESS"
            )

        except Exception as model_error:

            failed_now += 1

            log_error(
                f"{model_name} failed for "
                f"{location['name']}: "
                f"{model_error}"
            )

            failure_result = {
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

            current_models = (
                merge_model_result(
                    current_models,
                    failure_result,
                )
            )

        time.sleep(
            REQUEST_DELAY_SECONDS
        )

    # --------------------------------------------------------
    # BUILD RECORD
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

        "models": current_models,

        "updated_at": datetime.now(
            timezone.utc
        ).isoformat(),

        "collector_version": "V4",
    }

    # --------------------------------------------------------
    # MODEL STATUS
    # --------------------------------------------------------

    final_successful, final_missing = (
        get_model_status(
            record
        )
    )

    record[
        "collection_status"
    ] = {
        "complete": (
            len(final_missing) == 0
        ),

        "successful_models": sorted(
            final_successful
        ),

        "missing_models": sorted(
            final_missing
        ),
    }

    # --------------------------------------------------------
    # REPLACE OR ADD LOCATION
    # --------------------------------------------------------

    locations = database.setdefault(
        "locations",
        [],
    )

    replaced = False

    for index, existing in enumerate(
        locations
    ):

        existing_location = (
            existing.get(
                "location",
                {},
            )
        )

        if (
            existing_location.get(
                "id"
            )
            == location["id"]
        ):

            locations[index] = record

            replaced = True

            break

    if not replaced:

        locations.append(
            record
        )

    log(
        f"{location['name']}: "
        f"{len(final_successful)}/3 models available."
    )

    if final_missing:

        log(
            "Still missing: "
            + ", ".join(
                sorted(
                    final_missing
                )
            )
        )

    else:

        log(
            f"{location['name']}: "
            "ALL 3 MODELS COMPLETE."
        )

    log(
        f"New successes this run: "
        f"{successful_now}"
    )

    log(
        f"Failures this run: "
        f"{failed_now}"
    )

    return record


# ============================================================
# DATABASE SUMMARY
# ============================================================

def database_summary(
    database,
    requested_locations,
    start_date,
    end_date,
):
    """Calculate final database status."""

    present = 0

    complete = 0

    incomplete = 0

    missing_ids = []

    incomplete_locations = []

    for location in requested_locations:

        record = get_existing_location(
            database,
            location["id"],
        )

        if record is None:

            missing_ids.append(
                location["id"]
            )

            continue

        present += 1

        if record_is_complete(
            record,
            start_date,
            end_date,
        ):

            complete += 1

        else:

            incomplete += 1

            successful, missing = (
                get_model_status(
                    record
                )
            )

            incomplete_locations.append(
                {
                    "id": location["id"],

                    "name": location["name"],

                    "successful": sorted(
                        successful
                    ),

                    "missing": sorted(
                        missing
                    ),
                }
            )

    return {
        "requested": len(
            requested_locations
        ),

        "present": present,

        "complete": complete,

        "incomplete": incomplete,

        "missing": missing_ids,

        "incomplete_locations": (
            incomplete_locations
        ),
    }


# ============================================================
# MAIN
# ============================================================

def main():
    """Run regional collector."""

    log(
        "=============================================="
    )

    log(
        "RAJASTHAN REGIONAL ACCURACY COLLECTOR V4"
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
    # DATE PERIOD
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
    # INITIAL SUMMARY
    # --------------------------------------------------------

    initial_summary = database_summary(
        database,
        locations,
        start_date,
        end_date,
    )

    log(
        "----------------------------------------------"
    )

    log(
        f"Database present: "
        f"{initial_summary['present']}/"
        f"{initial_summary['requested']}"
    )

    log(
        f"Complete locations: "
        f"{initial_summary['complete']}"
    )

    log(
        f"Incomplete locations: "
        f"{initial_summary['incomplete']}"
    )

    if initial_summary[
        "missing"
    ]:

        log(
            "Missing location IDs: "
            + ", ".join(
                initial_summary[
                    "missing"
                ]
            )
        )

    # --------------------------------------------------------
    # COUNTERS
    # --------------------------------------------------------

    processed = 0

    skipped = 0

    failed = 0

    # --------------------------------------------------------
    # PROCESS
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

        existing_record = (
            get_existing_location(
                database,
                location["id"],
            )
        )

        # ----------------------------------------------------
        # COMPLETE?
        # ----------------------------------------------------

        if (
            existing_record is not None
            and record_is_complete(
                existing_record,
                start_date,
                end_date,
            )
        ):

            skipped += 1

            log(
                f"SKIP: {location['name']} "
                "already complete."
            )

            continue

        # ----------------------------------------------------
        # PROCESS / REPAIR
        # ----------------------------------------------------

        try:

            update_location(
                database=database,

                location=location,

                start_date=start_date,

                end_date=end_date,
            )

            processed += 1

            log(
                f"SUCCESS/UPDATED: "
                f"{location['name']}"
            )

        except Exception as location_error:

            failed += 1

            log_error(
                f"{location['name']} failed: "
                f"{location_error}"
            )

        # ----------------------------------------------------
        # CHECKPOINT
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
                f"Database save failed: "
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
    # FINAL SUMMARY
    # --------------------------------------------------------

    final_summary = database_summary(
        database,
        locations,
        start_date,
        end_date,
    )

    log(
        "=============================================="
    )

    log(
        "REGIONAL COLLECTION COMPLETE"
    )

    log(
        f"Requested locations: "
        f"{final_summary['requested']}"
    )

    log(
        f"Locations present: "
        f"{final_summary['present']}"
    )

    log(
        f"Complete locations: "
        f"{final_summary['complete']}"
    )

    log(
        f"Incomplete locations: "
        f"{final_summary['incomplete']}"
    )

    log(
        f"Processed/updated: "
        f"{processed}"
    )

    log(
        f"Skipped: "
        f"{skipped}"
    )

    log(
        f"Failed: "
        f"{failed}"
    )

    if final_summary[
        "missing"
    ]:

        warning(
            "Still missing locations: "
            + ", ".join(
                final_summary[
                    "missing"
                ]
            )
        )

    if final_summary[
        "incomplete_locations"
    ]:

        log(
            "----------------------------------------------"
        )

        log(
            "INCOMPLETE MODEL DATA:"
        )

        for item in final_summary[
            "incomplete_locations"
        ]:

            log(
                f"  {item['name']}: "
                f"missing "
                f"{', '.join(item['missing'])}"
            )

    if (
        final_summary["complete"]
        == final_summary["requested"]
    ):

        log(
            "=============================================="
        )

        log(
            "ALL 41 MONITORING LOCATIONS "
            "HAVE ALL 3 MODELS."
        )

        log(
            "=============================================="
        )

    else:

        log(
            "=============================================="
        )

        log(
            "COLLECTION IS PARTIALLY COMPLETE."
        )

        log(
            "Next daily run will retry only "
            "missing/incomplete model data."
        )

        log(
            "=============================================="
        )

    log(
        f"Database file: "
        f"{OUTPUT_FILE}"
    )

    log(
        "Collector finished."
    )


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":

    try:

        main()

    except KeyboardInterrupt:

        log(
            "Collector interrupted."
        )

        sys.exit(1)

    except Exception as fatal_error:

        log_error(
            f"Fatal error: {fatal_error}"
        )

        sys.exit(1)
