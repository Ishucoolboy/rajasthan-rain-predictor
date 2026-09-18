"""
Rajasthan Rain Predictor
------------------------
Fetches hourly rainfall forecasts for any latitude/longitude in Rajasthan.

Important:
This is a forecast-data engine, not a claim of 95% accuracy.
Accuracy will be measured later against observed rainfall data.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd
import requests

from config import HOURLY_VARIABLES, OPEN_METEO_FORECAST_URL


def fetch_forecast(
    latitude: float,
    longitude: float,
    days: int = 7,
) -> pd.DataFrame:
    """Fetch hourly forecast data for one location."""

    if not -90 <= latitude <= 90:
        raise ValueError("Invalid latitude.")

    if not -180 <= longitude <= 180:
        raise ValueError("Invalid longitude.")

    if not
