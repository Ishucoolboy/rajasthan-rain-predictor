/*
=========================================================
Rajasthan Rain Predictor
Main Website JavaScript
=========================================================
*/


// =======================================================
// API
// =======================================================

const WEATHER_API =
    "https://api.open-meteo.com/v1/forecast";

const GEOCODING_API =
    "https://geocoding-api.open-meteo.com/v1/search";


// =======================================================
// DEFAULT LOCATION
// =======================================================

const DEFAULT_LOCATION = {
    name: "Kuchera, Nagaur, Rajasthan",
    latitude: 27.01,
    longitude: 73.97
};


// =======================================================
// HTML ELEMENTS
// =======================================================

const locationInput =
    document.getElementById("locationInput");

const searchButton =
    document.getElementById("searchButton");

const locationName =
    document.getElementById("locationName");

const locationCoordinates =
    document.getElementById("locationCoordinates");

const statusText =
    document.getElementById("statusText");

const statusIndicator =
    document.getElementById("statusIndicator");

const rainProbability =
    document.getElementById("rainProbability");

const rainAmount =
    document.getElementById("rainAmount");

const temperature =
    document.getElementById("temperature");

const humidity =
    document.getElementById("humidity");

const wind =
    document.getElementById("wind");

const thunderstorm =
    document.getElementById("thunderstorm");

const hourlyForecast =
    document.getElementById("hourlyForecast");

const dailyForecast =
    document.getElementById("dailyForecast");

const ecmwfRain =
    document.getElementById("ecmwfRain");

const gfsRain =
    document.getElementById("gfsRain");

const iconRain =
    document.getElementById("iconRain");


// =======================================================
// STATUS
// =======================================================

function setStatus(message, online = true) {

    statusText.textContent = message;

    if (online) {
        statusIndicator.style.background =
            "#22c55e";
    } else {
        statusIndicator.style.background =
            "#ef4444";
    }
}


// =======================================================
// SEARCH LOCATION
// =======================================================

async function searchLocation() {

    const query =
        locationInput.value.trim();

    if (!query) {

        alert(
            "Please enter a village, town or city."
        );

        return;
    }


    setStatus(
        "Searching location..."
    );


    searchButton.disabled = true;

    searchButton.textContent =
        "Searching...";


    try {

        const url =
            `${GEOCODING_API}?name=${encodeURIComponent(query)}&count=10&language=en&format=json`;


        const response =
            await fetch(url);


        if (!response.ok) {

            throw new Error(
                "Location search failed."
            );

        }


        const data =
            await response.json();


        if (
            !data.results ||
            data.results.length === 0
        ) {

            throw new Error(
                "Location not found."
            );

        }


        // Prefer Rajasthan result

        const rajasthanResult =
            data.results.find(
                place =>
                    place.country_code === "IN" &&
                    (
                        place.admin1 === "Rajasthan" ||
                        place.admin2?.includes("Rajasthan")
                    )
            );


        const place =
            rajasthanResult ||
            data.results.find(
                place =>
                    place.country_code === "IN"
            ) ||
            data.results[0];


        const selectedLocation = {

            name:
                [
                    place.name,
                    place.admin2,
                    place.admin1
                ]
                    .filter(Boolean)
                    .join(", "),

            latitude:
                place.latitude,

            longitude:
                place.longitude

        };


        displayLocation(
            selectedLocation
        );


        await loadWeather(
            selectedLocation
        );


    } catch (error) {

        console.error(error);

        setStatus(
            "Location search failed",
            false
        );

        alert(
            error.message
        );

    } finally {

        searchButton.disabled = false;

        searchButton.textContent =
            "Search";
    }
}


// =======================================================
// DISPLAY LOCATION
// =======================================================

function displayLocation(location) {

    locationName.textContent =
        location.name;

    locationCoordinates.textContent =
        `Latitude: ${location.latitude.toFixed(4)}° | Longitude: ${location.longitude.toFixed(4)}°`;
}


// =======================================================
// LOAD WEATHER
// =======================================================

async function loadWeather(location) {

    setStatus(
        "Loading weather..."
    );


    try {

        const params = new URLSearchParams({

            latitude:
                location.latitude,

            longitude:
                location.longitude,

            hourly:
                [
                    "precipitation",
                    "rain",
                    "showers",
                    "weather_code",
                    "precipitation_probability",
                    "temperature_2m",
                    "relative_humidity_2m",
                    "cloud_cover",
                    "wind_speed_10m"
                ].join(","),

            daily:
                [
                    "weather_code",
                    "temperature_2m_max",
                    "temperature_2m_min",
                    "precipitation_sum",
                    "precipitation_probability_max"
                ].join(","),

            forecast_days:
                "7",

            timezone:
                "auto"

        });


        const response =
            await fetch(
                `${WEATHER_API}?${params}`
            );


        if (!response.ok) {

            throw new Error(
                "Weather data could not be loaded."
            );

        }


        const data =
            await response.json();


        updateCurrentWeather(
            data
        );


        updateHourlyForecast(
            data
        );


        updateDailyForecast(
            data
        );


        updateModelStatus();


        setStatus(
            "Weather data updated"
        );


    } catch (error) {

        console.error(error);

        setStatus(
            "Weather data unavailable",
            false
        );

        alert(
            "Weather data load nahi ho paya. Please try again."
        );

    }
}


// =======================================================
// CURRENT WEATHER
// =======================================================

function updateCurrentWeather(data) {

    const hourly =
        data.hourly;

    if (
        !hourly ||
        !hourly.time ||
        hourly.time.length === 0
    ) {

        return;
    }


    const nowIndex =
        findCurrentHourIndex(
            hourly.time
        );


    const probability =
        hourly.precipitation_probability?.[
            nowIndex
        ] ?? 0;


    const precipitation =
        hourly.precipitation?.[
            nowIndex
        ] ?? 0;


    const temp =
        hourly.temperature_2m?.[
            nowIndex
        ];


    const humidityValue =
        hourly.relative_humidity_2m?.[
            nowIndex
        ];


    const windValue =
        hourly.wind_speed_10m?.[
            nowIndex
        ];


    const weatherCode =
        hourly.weather_code?.[
            nowIndex
        ];


    rainProbability.textContent =
        `${Math.round(probability)}%`;


    rainAmount.textContent =
        `${Number(precipitation).toFixed(1)} mm`;


    temperature.textContent =
        temp !== undefined
            ? `${Math.round(temp)} °C`
            : "-- °C";


    humidity.textContent =
        humidityValue !== undefined
            ? `${Math.round(humidityValue)}%`
            : "--%";


    wind.textContent =
        windValue !== undefined
            ? `${Math.round(windValue)} km/h`
            : "-- km/h";


    thunderstorm.textContent =
        isThunderstorm(weatherCode)
            ? "Possible"
            : "No indication";
}


// =======================================================
// FIND CURRENT HOUR
// =======================================================

function findCurrentHourIndex(times) {

    const now =
        new Date();

    let closestIndex = 0;

    let smallestDifference =
        Infinity;


    times.forEach(
        (time, index) => {

            const forecastTime =
                new Date(time);

            const difference =
                Math.abs(
                    forecastTime.getTime() -
                    now.getTime()
                );


            if (
                difference <
                smallestDifference
            ) {

                smallestDifference =
                    difference;

                closestIndex =
                    index;
            }

        }
    );


    return closestIndex;
}


// =======================================================
// HOURLY FORECAST
// =======================================================

function updateHourlyForecast(data) {

    const hourly =
        data.hourly;


    if (!hourly) {
        return;
    }


    hourlyForecast.innerHTML =
        "";


    const currentIndex =
        findCurrentHourIndex(
            hourly.time
        );


    const endIndex =
        Math.min(
            currentIndex + 24,
            hourly.time.length
        );


    for (
        let i = currentIndex;
        i < endIndex;
        i++
    ) {

        const time =
            new Date(
                hourly.time[i]
            );


        const rain =
            hourly.precipitation?.[i] ?? 0;


        const probability =
            hourly.precipitation_probability?.[i] ?? 0;


        const code =
            hourly.weather_code?.[i];


        const card =
            document.createElement("div");


        card.className =
            "hour-card";


        card.innerHTML = `

            <div class="time">
                ${formatTime(time)}
            </div>

            <div class="icon">
                ${getWeatherIcon(code)}
            </div>

            <div class="rain">
                ${Number(rain).toFixed(1)} mm
            </div>

            <div class="probability">
                Rain ${Math.round(probability)}%
            </div>

        `;


        hourlyForecast.appendChild(
            card
        );
    }
}


// =======================================================
// DAILY FORECAST
// =======================================================

function updateDailyForecast(data) {

    const daily =
        data.daily;


    if (!daily) {
        return;
    }


    dailyForecast.innerHTML =
        "";


    for (
        let i = 0;
        i < daily.time.length;
        i++
    ) {

        const date =
            new Date(
                daily.time[i]
            );


        const rain =
            daily.precipitation_sum?.[i] ?? 0;


        const probability =
            daily.precipitation_probability_max?.[i] ?? 0;


        const maxTemp =
            daily.temperature_2m_max?.[i];


        const minTemp =
            daily.temperature_2m_min?.[i];


        const code =
            daily.weather_code?.[i];


        const card =
            document.createElement("div");


        card.className =
            "day-card";


        card.innerHTML = `

            <div class="day">
                ${formatDay(date)}
            </div>

            <div class="day-icon">
                ${getWeatherIcon(code)}
            </div>

            <div class="day-rain">
                ${Number(rain).toFixed(1)} mm
            </div>

            <div>
                Rain ${Math.round(probability)}%
            </div>

            <div class="day-temp">
                ${Math.round(maxTemp)}° /
                ${Math.round(minTemp)}°
            </div>

        `;


        dailyForecast.appendChild(
            card
        );
    }
}


// =======================================================
// WEATHER ICON
// =======================================================

function getWeatherIcon(code) {

    if (code === undefined) {
        return "🌤️";
    }


    if (
        code === 95 ||
        code === 96 ||
        code === 99
    ) {

        return "⛈️";
    }


    if (
        code >= 61 &&
        code <= 67
    ) {

        return "🌧️";
    }


    if (
        code >= 80 &&
        code <= 82
    ) {

        return "🌦️";
    }


    if (
        code >= 51 &&
        code <= 57
    ) {

        return "🌦️";
    }


    if (
        code === 1 ||
        code === 2
    ) {

        return "⛅";
    }


    if (code === 3) {

        return "☁️";
    }


    if (code === 0) {

        return "☀️";
    }


    return "🌤️";
}


// =======================================================
// THUNDERSTORM
// =======================================================

function isThunderstorm(code) {

    return (
        code === 95 ||
        code === 96 ||
        code === 99
    );
}


// =======================================================
// TIME FORMAT
// =======================================================

function formatTime(date) {

    return date.toLocaleTimeString(
        "en-IN",
        {
            hour: "numeric",
            minute: "2-digit"
        }
    );
}


// =======================================================
// DAY FORMAT
// =======================================================

function formatDay(date) {

    return date.toLocaleDateString(
        "en-IN",
        {
            weekday: "short",
            day: "numeric"
        }
    );
}


// =======================================================
// MODEL STATUS
// =======================================================

function updateModelStatus() {

    /*
     * Actual multi-model rainfall comparison
     * will be added in the next development stage.
     *
     * These fields intentionally remain "--"
     * until separate model forecasts are fetched.
     */

    ecmwfRain.textContent =
        "-- mm";

    gfsRain.textContent =
        "-- mm";

    iconRain.textContent =
        "-- mm";
}


// =======================================================
// SEARCH BUTTON
// =======================================================

searchButton.addEventListener(
    "click",
    searchLocation
);


// =======================================================
// ENTER KEY SEARCH
// =======================================================

locationInput.addEventListener(
    "keydown",
    function (event) {

        if (
            event.key === "Enter"
        ) {

            searchLocation();

        }

    }
);


// =======================================================
// INITIAL LOAD
// =======================================================

async function initialize() {

    displayLocation(
        DEFAULT_LOCATION
    );


    await loadWeather(
        DEFAULT_LOCATION
    );

}


initialize();
