"""
Rajasthan Rain Predictor
Regional Accuracy Collector V5

Purpose:
- Read Rajasthan monitoring locations
- Geocode locations automatically
- Use fallback coordinates when geocoding fails
- Fetch ERA5/reanalysis rainfall reference
- Fetch ECMWF / GFS / ICON previous-run forecasts
- Calculate Day 1-7 rainfall forecast accuracy
- Preserve successful existing model results
- Retry only missing/failed models
- Save incomplete locations instead of losing them
- Recover gracefully from API failures

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
# FALLBACK COORDINATES
# ============================================================

# Used only when Open-Meteo geocoding fails.

FALLBACK_COORDINATES = {
    "jalore": {
        "latitude": 25.34345,
        "longitude": 72.61579,
    },
}


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
            "Regional-Accuracy-Collector-V5"
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
    """Request JSON with short retries."""

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

    log(
        f"Loaded {len(locations)} "
        f"monitoring locations."
    )

    return locations


# ============================================================
# EMPTY DATABASE
# ============================================================

def create_empty_database():

    return {
        "version": "regional-accuracy-v5",

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
    """Load existing database."""

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
                "Invalid database format."
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
            f"Could not load database: "
            f"{error}"
        )

        return create_empty_database()


# ============================================================
# SAVE DATABASE
# ============================================================

def save_database(database):
    """Safely save database."""

    database[
        "version"
    ] = "regional-accuracy-v5"

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
# FIND EXISTING LOCATION
# ============================================================

def get_existing_location(
    database,
    location_id,
):

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
# FALLBACK COORDINATES
# ============================================================

def get_fallback_coordinates(
    location_id,
):

    key = str(
        location_id
    ).strip().lower()

    return FALLBACK_COORDINATES.get(
        key
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
# RESOLVE LOCATION
# ============================================================

def resolve_location(
    location,
    existing_record,
):
    """
    Resolve coordinates.

    Priority:
    1. Existing database coordinates
    2. Open-Meteo geocoding
    3. Hardcoded fallback coordinates
    """

    location_id = location[
        "id"
    ]

    # --------------------------------------------------------
    # EXISTING COORDINATES
    # --------------------------------------------------------

    if isinstance(
        existing_record,
        dict,
    ):

        old_location = (
            existing_record.get(
                "location",
                {},
            )
        )

        old_latitude = safe_float(
            old_location.get(
                "latitude"
            )
        )

        old_longitude = safe_float(
            old_location.get(
                "longitude"
            )
        )

        if (
            old_latitude is not None
            and old_longitude is not None
        ):

            log(
                "Using existing saved coordinates."
            )

            return {
                "id": location_id,

                "name": location[
                    "name"
                ],

                "query": location.get(
                    "query",
                    location["name"],
                ),

                "latitude": old_latitude,

                "longitude": old_longitude,

                "coordinate_source": (
                    "existing_database"
                ),
            }

    # --------------------------------------------------------
    # OPEN-METEO GEOCODING
    # --------------------------------------------------------

    query = location.get(
        "query",
        location["name"],
    )

    try:

        coordinates = geocode_location(
            query
        )

        return {
            "id": location_id,

            "name": location[
                "name"
            ],

            "query": query,

            "latitude": coordinates[
                "latitude"
            ],

            "longitude": coordinates[
                "longitude"
            ],

            "coordinate_source": (
                "open_meteo_geocoding"
            ),
        }

    except Exception as geocode_error:

        warning(
            f"Geocoding failed for "
            f"{location['name']}: "
            f"{geocode_error}"
        )

    # --------------------------------------------------------
    # FALLBACK
    # --------------------------------------------------------

    fallback = get_fallback_coordinates(
        location_id
    )

    if fallback is not None:

        warning(
            f"Using fallback coordinates "
            f"for {location['name']}."
        )

        return {
            "id": location_id,

            "name": location[
                "name"
            ],

            "query": query,

            "latitude": fallback[
                "latitude"
            ],

            "longitude": fallback[
                "longitude"
            ],

            "coordinate_source": (
                "fallback_coordinates"
            ),
        }

    raise RuntimeError(
        f"No coordinates available for "
        f"{location['name']}"
    )


# ============================================================
# DATE PERIOD
# ============================================================

def get_test_period():

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

        if index >= len(
            values
        ):

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
# EXISTING MODEL STATUS
# ============================================================

def get_model_status(
    record,
):

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
# PERIOD CHECK
# ============================================================

def record_has_current_period(
    record,
    start_date,
    end_date,
):

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
# COMPLETE CHECK
# ============================================================

def record_is_complete(
    record,
    start_date,
    end_date,
):

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
# MERGE MODEL
# ============================================================

def merge_model_result(
    existing_models,
    new_result,
):

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
# BUILD INCOMPLETE RECORD
# ============================================================

def build_base_record(
    resolved_location,
    start_date,
    end_date,
    existing_record,
):

    existing_models = []

    if (
        record_has_current_period(
            existing_record,
            start_date,
            end_date,
        )
    ):

        existing_models = list(
            existing_record.get(
                "models",
                [],
            )
        )

    return {
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

        "models": existing_models,

        "updated_at": datetime.now(
            timezone.utc
        ).isoformat(),

        "collector_version": "V5",
    }


# ============================================================
# SAVE/REPLACE LOCATION
# ============================================================

def save_location_record(
    database,
    record,
):

    locations = database.setdefault(
        "locations",
        [],
    )

    location_id = (
        record.get(
            "location",
            {},
        ).get(
            "id"
        )
    )

    replaced = False

    for index, existing in enumerate(
        locations
    ):

        existing_id = (
            existing.get(
                "location",
                {},
            ).get(
                "id"
            )
        )

        if existing_id == location_id:

            locations[index] = record

            replaced = True

            break

    if not replaced:

        locations.append(
            record
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
    # RESOLVE COORDINATES
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

    log(
        "Coordinate source: "
        f"{resolved_location['coordinate_source']}"
    )

    # --------------------------------------------------------
    # BUILD BASE RECORD IMMEDIATELY
    # --------------------------------------------------------

    record = build_base_record(
        resolved_location,
        start_date,
        end_date,
        existing_record,
    )

    # IMPORTANT:
    # Save the location BEFORE API calls.
    #
    # This guarantees that a location cannot
    # disappear from the regional database simply
    # because one API request failed.

    save_location_record(
        database,
        record,
    )

    save_database(
        database
    )

    log(
        f"{location['name']} base record saved."
    )

    # --------------------------------------------------------
    # MODEL STATUS
    # --------------------------------------------------------

    successful_models, missing_models = (
        get_model_status(
            record
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

    if not missing_models:

        log(
            f"{location['name']}: "
            "all models already complete."
        )

        return record

    log(
        "Models needing work: "
        + ", ".join(
            sorted(
                missing_models
            )
        )
    )

    # --------------------------------------------------------
    # REFERENCE DATA
    # --------------------------------------------------------

    try:

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

    except Exception as reference_error:

        log_error(
            f"Reference data failed for "
            f"{location['name']}: "
            f"{reference_error}"
        )

        record[
            "reference_error"
        ] = str(
            reference_error
        )

        record[
            "collection_status"
        ] = {
            "complete": False,

            "successful_models": sorted(
                successful_models
            ),

            "missing_models": sorted(
                missing_models
            ),

            "reference_available": False,
        }

        record[
            "updated_at"
        ] = datetime.now(
            timezone.utc
        ).isoformat()

        save_location_record(
            database,
            record,
        )

        save_database(
            database
        )

        return record

    time.sleep(
        REQUEST_DELAY_SECONDS
    )

    # --------------------------------------------------------
    # MODEL LOOKUP
    # --------------------------------------------------------

    model_lookup = {
        model["name"]: model
        for model in MODELS
    }

    current_models = list(
        record.get(
            "models",
            [],
        )
    )

    # --------------------------------------------------------
    # RUN ONLY MISSING MODELS
    # --------------------------------------------------------

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

            record[
                "models"
            ] = current_models

            record[
                "updated_at"
            ] = datetime.now(
                timezone.utc
            ).isoformat()

            save_location_record(
                database,
                record,
            )

            save_database(
                database
            )

            log(
                f"{location['name']} → "
                f"{model_name}: SUCCESS"
            )

        except Exception as model_error:

            log_error(
                f"{location['name']} → "
                f"{model_name}: "
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

            record[
                "models"
            ] = current_models

            record[
                "updated_at"
            ] = datetime.now(
                timezone.utc
            ).isoformat()

            save_location_record(
                database,
                record,
            )

            save_database(
                database
            )

        time.sleep(
            REQUEST_DELAY_SECONDS
        )

    # --------------------------------------------------------
    # FINAL STATUS
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

        "reference_available": True,
    }

    record[
        "updated_at"
    ] = datetime.now(
        timezone.utc
    ).isoformat()

    save_location_record(
        database,
        record,
    )

    save_database(
        database
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

    present = 0

    complete = 0

    incomplete = 0

    missing_names = []

    incomplete_locations = []

    for location in requested_locations:

        record = get_existing_location(
            database,
            location["id"],
        )

        if record is None:

            missing_names.append(
                location["name"]
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
                    "name": location[
                        "name"
                    ],

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

        "missing": missing_names,

        "incomplete_locations": (
            incomplete_locations
        ),
    }


# ============================================================
# MAIN
# ============================================================

def main():

    log(
        "=============================================="
    )

    log(
        "RAJASTHAN REGIONAL ACCURACY COLLECTOR V5"
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
        f"Locations requested: "
        f"{len(locations)}"
    )

    # --------------------------------------------------------
    # INITIAL STATUS
    # --------------------------------------------------------

    initial = database_summary(
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
        f"{initial['present']}/"
        f"{initial['requested']}"
    )

    log(
        f"Complete locations: "
        f"{initial['complete']}"
    )

    log(
        f"Incomplete locations: "
        f"{initial['incomplete']}"
    )

    if initial[
        "missing"
    ]:

        log(
            "Missing locations: "
            + ", ".join(
                initial[
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
        # COMPLETE LOCATION
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
                f"UPDATED: "
                f"{location['name']}"
            )

        except Exception as location_error:

            failed += 1

            log_error(
                f"{location['name']} failed: "
                f"{location_error}"
            )

            # ------------------------------------------------
            # LAST-RESORT FALLBACK RECORD
            # ------------------------------------------------

            try:

                fallback = (
                    get_fallback_coordinates(
                        location["id"]
                    )
                )

                if fallback is not None:

                    emergency_record = {
                        "location": {
                            "id": location[
                                "id"
                            ],

                            "name": location[
                                "name"
                            ],

                            "query": location.get(
                                "query",
                                location[
                                    "name"
                                ],
                            ),

                            "latitude": fallback[
                                "latitude"
                            ],

                            "longitude": fallback[
                                "longitude"
                            ],

                            "coordinate_source": (
                                "fallback_coordinates"
                            ),
                        },

                        "period": {
                            "start": start_date,

                            "end": end_date,

                            "days": (
                                INITIAL_TEST_DAYS
                            ),
                        },

                        "reference": {
                            "name": (
                                "ERA5 / "
                                "Open-Meteo reanalysis"
                            ),

                            "type": "reanalysis",
                        },

                        "models": [],

                        "collection_status": {
                            "complete": False,

                            "successful_models": [],

                            "missing_models": [
                                "ECMWF",
                                "GFS",
                                "ICON",
                            ],

                            "reference_available": False,
                        },

                        "error": str(
                            location_error
                        ),

                        "collector_version": "V5",

                        "updated_at": datetime.now(
                            timezone.utc
                        ).isoformat(),
                    }

                    save_location_record(
                        database,
                        emergency_record,
                    )

                    save_database(
                        database
                    )

                    log(
                        f"Fallback record saved "
                        f"for {location['name']}."
                    )

            except Exception as fallback_error:

                log_error(
                    "Fallback save failed: "
                    f"{fallback_error}"
                )

        # ----------------------------------------------------
        # CHECKPOINT
        # ----------------------------------------------------

        save_database(
            database
        )

        log(
            "Database checkpoint saved."
        )

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

    final = database_summary(
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
        f"{final['requested']}"
    )

    log(
        f"Locations present: "
        f"{final['present']}"
    )

    log(
        f"Complete locations: "
        f"{final['complete']}"
    )

    log(
        f"Incomplete locations: "
        f"{final['incomplete']}"
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

    if final[
        "missing"
    ]:

        warning(
            "Still missing locations: "
            + ", ".join(
                final[
                    "missing"
                ]
            )
        )

    else:

        log(
            "ALL MONITORING LOCATIONS "
            "ARE PRESENT IN DATABASE."
        )

    if final[
        "incomplete_locations"
    ]:

        log(
            "----------------------------------------------"
        )

        log(
            "INCOMPLETE MODEL DATA:"
        )

        for item in final[
            "incomplete_locations"
        ]:

            log(
                f"  {item['name']}: "
                f"missing "
                f"{', '.join(item['missing'])}"
            )

    log(
        "=============================================="
    )

    log(
        f"Database file: "
        f"{OUTPUT_FILE}"
    )

    log(
        "Collector V5 finished."
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
