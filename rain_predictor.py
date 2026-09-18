"""
Rajasthan Rain Predictor

Fetches weather forecast data for a selected location
and prepares rainfall information for further analysis.
"""

import requests
from typing import Optional, Dict, Any

from config import (
    OPEN_METEO_FORECAST_URL,
    HOURLY_VARIABLES,
    FORECAST_DAYS,
    TIMEZONE,
)


def get_weather_forecast(
    latitude: float,
    longitude: float,
    model: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Fetch hourly weather forecast for a location.

    Parameters
    ----------
    latitude : float
        Latitude of the location.

    longitude : float
        Longitude of the location.

    model : str, optional
        Weather model to use.

    Returns
    -------
    dict
        Weather forecast response.
    """

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": ",".join(HOURLY_VARIABLES),
        "forecast_days": FORECAST_DAYS,
        "timezone": TIMEZONE,
    }

    if model:
        params["models"] = model

    response = requests.get(
        OPEN_METEO_FORECAST_URL,
        params=params,
        timeout=30,
    )

    response.raise_for_status()

    return response.json()


def calculate_rain_summary(
    weather_data: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Create a simple rainfall summary from forecast data.
    """

    hourly = weather_data.get("hourly", {})

    precipitation = hourly.get("precipitation", [])
    rain_probability = hourly.get(
        "precipitation_probability", []
    )

    total_rain = sum(
        value for value in precipitation
        if isinstance(value, (int, float))
    )

    valid_probabilities = [
        value
        for value in rain_probability
        if isinstance(value, (int, float))
    ]

    maximum_rain_probability = (
        max(valid_probabilities)
        if valid_probabilities
        else 0
    )

    return {
        "total_forecast_rain_mm": round(total_rain, 2),
        "maximum_rain_probability_percent": round(
            maximum_rain_probability,
            1,
        ),
    }


def get_location_weather(
    location_name: str,
    latitude: float,
    longitude: float,
    model: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Get forecast and rainfall summary for a location.
    """

    weather_data = get_weather_forecast(
        latitude=latitude,
        longitude=longitude,
        model=model,
    )

    summary = calculate_rain_summary(weather_data)

    return {
        "location": location_name,
        "latitude": latitude,
        "longitude": longitude,
        "model": model or "default",
        "summary": summary,
        "forecast": weather_data,
    }


if __name__ == "__main__":

    # Example location: Kuchera, Nagaur, Rajasthan
    # Coordinates can later be obtained automatically
    # using a geocoding service.

    kuchera_latitude = 27.01
    kuchera_longitude = 73.97

    try:

        result = get_location_weather(
            location_name="Kuchera, Nagaur, Rajasthan",
            latitude=kuchera_latitude,
            longitude=kuchera_longitude,
        )

        print("Rajasthan Rain Predictor")
        print("------------------------")
        print(
            f"Location: {result['location']}"
        )
        print(
            f"Forecast rain: "
            f"{result['summary']['total_forecast_rain_mm']} mm"
        )
        print(
            f"Maximum rain probability: "
            f"{result['summary']['maximum_rain_probability_percent']}%"
        )

    except requests.RequestException as error:

        print(
            "Weather API request failed:"
        )
        print(error)

    except Exception as error:

        print(
            "An unexpected error occurred:"
        )
        print(error)
