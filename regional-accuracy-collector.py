"""
Rajasthan Rain Predictor
Regional Accuracy Collector V3

Purpose:
- Read Rajasthan monitoring locations
- Geocode locations automatically
- Fetch ERA5/reanalysis rainfall reference
- Fetch ECMWF / GFS / ICON previous-run forecasts
- Calculate Day 1-7 rainfall forecast accuracy
- Build a Rajasthan regional accuracy database
- Preserve successful existing records
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

# Reduced from 90 seconds because the previous run
# was spending too much time waiting on a single request.

REQUEST_TIMEOUT = 35

# Only two attempts.
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
            "Regional-Accuracy-Collector-V3"
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
# HTTP REQUEST WITH SHORT RETRIES
# ============================================================

def request_json(
    url,
    params,
    description,
):
    """
    Request JSON from an API.

    Retry only a small number of times so that
    one slow API request cannot block the entire
    Rajasthan collection for several minutes.
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

            # Retry temporary server/rate-limit errors.
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

        except (
            requests.Timeout,
            requests.ConnectionError,
            requests.RequestException,
        ) as request_error:

            last_error = request_error

            warning(
                f"{description}: "
                f"{request_error} "
                f"(attempt {attempt}/{MAX_RETRIES})"
            )

        except ValueError as json_error:

            last_error = json_error

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
# LOAD DATABASE
# ============================================================

def load_database():
    """Load existing regional database."""

    if not OUTPUT_FILE.exists():

        log(
            "No existing database found."
        )

        return {
            "version": "regional-accuracy-v3",
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

        return {
            "version": "regional-accuracy-v3",
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
    """Safely save regional database."""

    database[
        "version"
    ] = "regional-accuracy-v3"

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

    previous_day1 ... previous_day7 are
    hourly variables and are later aggregated
    into daily rainfall totals.
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
# TEST MODEL
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
# CHECK COMPLETE RECORD
# ============================================================

def record_is_complete(
    record,
    start_date,
    end_date,
):
    """
    Check whether a record already contains
    the requested historical period and all
    three model results.
    """

    if not isinstance(
        record,
        dict,
    ):

        return False

    period = record.get(
        "period",
        {},
    )

    if (
        period.get("start")
        != start_date
        or period.get("end")
        != end_date
    ):

        return False

    models = record.get(
        "models",
        [],
    )

    if len(models) < 3:

        return False

    required_models = {
        "ECMWF",
        "GFS",
        "ICON",
    }

    available_models = set()

    for model in models:

        if (
            model.get("success")
            is True
        ):

            available_models.add(
                model.get("name")
            )

    return (
        required_models
        .issubset(
            available_models
        )
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
    """Generate accuracy for one location."""

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

    successful_models = 0

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

            successful_models += 1

        except Exception as model_error:

            log_error(
                f"{model['name']} failed for "
                f"{location['name']}: "
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

    # --------------------------------------------------------
    # REPLACE OR ADD
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
        f"{successful_models}/3 models successful."
    )

    return record


# ============================================================
# MAIN
# ============================================================

def main():
    """Run regional collector."""

    log(
        "=============================================="
    )

    log(
        "RAJASTHAN REGIONAL ACCURACY COLLECTOR V3"
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
    # EXISTING COUNT
    # --------------------------------------------------------

    existing_count = len(
        database.get(
            "locations",
            [],
        )
    )

    log(
        f"Existing database locations: "
        f"{existing_count}"
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
        # SKIP ONLY IF CURRENT PERIOD IS COMPLETE
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
                f"SKIP: "
                f"{location['name']} "
                "already complete."
            )

            continue

        # ----------------------------------------------------
        # PROCESS
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
                f"SUCCESS: "
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
    # FINAL COUNTS
    # --------------------------------------------------------

    database_count = len(
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
        f"Processed: "
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

    log(
        f"Locations in database: "
        f"{database_count}"
    )

    log(
        f"Database file: "
        f"{OUTPUT_FILE}"
    )

    log(
        "=============================================="
    )

    if (
        database_count
        < len(locations)
    ):

        warning(
            "Database is not complete yet. "
            "Failed/missing locations will be "
            "retried on the next run."
        )

    else:

        log(
            "ALL MONITORING LOCATIONS "
            "ARE PRESENT IN DATABASE."
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
