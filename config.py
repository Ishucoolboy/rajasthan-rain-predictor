"""Configuration for Rajasthan Rain Predictor."""

# Approximate geographic boundaries of Rajasthan.
RAJASTHAN_BOUNDS = {
    "north": 30.20,
    "south": 23.00,
    "west": 69.30,
    "east": 78.30,
}

# Grid spacing.
# 0.10 degree is roughly 10 km in latitude.
# We can later move to a finer grid where useful.
GRID_STEP_DEGREES = 0.10

# Open-Meteo forecast API
OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"

# Weather variables used for rainfall analysis.
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
