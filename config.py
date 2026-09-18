"""
Configuration for Rajasthan Rain Predictor.

This file contains project-wide settings such as:
- Rajasthan geographic boundaries
- Weather API configuration
- Weather variables
- Forecast settings
- Model configuration
"""

# ============================================================
# RAJASTHAN GEOGRAPHIC BOUNDARIES
# ============================================================

RAJASTHAN_BOUNDS = {
    "north": 30.20,
    "south": 23.00,
    "west": 69.30,
    "east": 78.30,
}


# ============================================================
# WEATHER GRID
# ============================================================

# Approximate grid spacing in degrees.
#
# 0.10 degree latitude is roughly 11 km.
# A finer grid can be introduced later if required.

GRID_STEP_DEGREES = 0.10


# ============================================================
# OPEN-METEO API
# ============================================================

OPEN_METEO_FORECAST_URL = (
    "https://api.open-meteo.com/v1/forecast"
)


# ============================================================
# WEATHER VARIABLES
# ============================================================

HOURLY_VARIABLES = [
    "precipitation",
    "rain",
    "showers",
    "weather_code",
    "precipitation_probability",
    "temperature_2m",
    "relative_humidity_2m",
    "cloud_cover",
    "wind_speed_10m",
]


# ============================================================
# FORECAST SETTINGS
# ============================================================

FORECAST_DAYS = 7

TIMEZONE = "auto"


# ============================================================
# WEATHER MODELS
# ============================================================

# Models that may be compared when supported by the API.

WEATHER_MODELS = [
    "ecmwf_ifs025",
    "gfs_seamless",
    "icon_seamless",
]


# ============================================================
# RAINFALL THRESHOLDS
# ============================================================

# These thresholds are used for rainfall classification.

RAIN_THRESHOLDS_MM = {
    "none": 0.0,
    "light": 2.5,
    "moderate": 15.6,
    "heavy": 64.5,
    "very_heavy": 115.6,
}


# ============================================================
# DATA STORAGE
# ============================================================

RAW_DATA_DIRECTORY = "data/raw"

PROCESSED_DATA_DIRECTORY = "data/processed"

MODEL_DIRECTORY = "models"


# ============================================================
# PREDICTION SETTINGS
# ============================================================

# Minimum rainfall probability considered as a
# meaningful chance of rain.

RAIN_PROBABILITY_THRESHOLD = 30


# ============================================================
# ACCURACY / VERIFICATION
# ============================================================

# Historical forecasts will eventually be compared
# against actual rainfall observations.

ACCURACY_ENABLED = True

MINIMUM_ACCURACY_DATA_POINTS = 30


# ============================================================
# APPLICATION SETTINGS
# ============================================================

PROJECT_NAME = "Rajasthan Rain Predictor"

PROJECT_REGION = "Rajasthan, India"

VERSION = "0.1.0"
