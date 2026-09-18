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

// OpenStreetMap Nominatim fallback
const OSM_GEOCODING_API =
    "https://nominatim.openstreetmap.org/search";


// =======================================================
// DEFAULT LOCATION
// =======================================================

const DEFAULT_LOCATION = {
    name: "Kuchera, Nagaur, Rajasthan",
    latitude: 27.01,
    longitude: 73.97
};


// =======================================================
// KNOWN VILLAGE / LOCATION ALIASES
// =======================================================

const KNOWN_LOCATIONS = {

    "junjhala": {
        name: "Jhunjhala, Jayal, Nagaur, Rajasthan",
        latitude: 27.03144,
        longitude: 73.93637
    },

    "junjala": {
        name: "Jhunjhala, Jayal, Nagaur, Rajasthan",
        latitude: 27.03144,
        longitude: 73.93637
    },

    "jhunjhala": {
        name: "Jhunjhala, Jayal, Nagaur, Rajasthan",
        latitude: 27.03144,
        longitude: 73.93637
    },

    "झुंझाला": {
        name: "Jhunjhala, Jayal, Nagaur, Rajasthan",
        latitude: 27.03144,
        longitude: 73.93637
    }

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
// DISPLAY LOCATION
// =======================================================

function displayLocation(location) {

    locationName.textContent =
        location.name;

    locationCoordinates.textContent =
        `Latitude: ${Number(location.latitude).toFixed(4)}° | Longitude: ${Number(location.longitude).toFixed(4)}°`;

}


// =======================================================
// NORMALIZE SEARCH
// =======================================================

function normalizeSearchText(text) {

    return text
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");

}


// =======================================================
// CHECK WHETHER LOCATION IS IN RAJASTHAN
// =======================================================

function isRajasthan(place) {

    const state =
        String(
            place.admin1 ||
            place.address?.state ||
            ""
        ).toLowerCase();

    const country =
        String(
            place.country_code ||
            place.address?.country_code ||
            ""
        ).toLowerCase();

    return (
        country === "in" &&
        (
            state.includes("rajasthan") ||
            state.includes("राजस्थान")
        )
    );

}


// =======================================================
// CREATE LOCATION FROM OPEN-METEO RESULT
// =======================================================

function createOpenMeteoLocation(place) {

    const nameParts = [
        place.name,
        place.admin4,
        place.admin3,
        place.admin2,
        place.admin1
    ]
        .filter(Boolean)
        .filter(
            (value, index, array) =>
                array.indexOf(value) === index
        );

    return {

        name: nameParts.join(", "),

        latitude:
            Number(place.latitude),

        longitude:
            Number(place.longitude)

    };

}


// =======================================================
// CREATE LOCATION FROM OSM RESULT
// =======================================================

function createOSMLocation(place) {

    const address =
        place.address || {};

    const mainName =
        place.name ||
        address.village ||
        address.town ||
        address.city ||
        address.hamlet ||
        address.municipality;

    const district =
        address.county ||
        address.state_district ||
        address.district;

    const state =
        address.state ||
        "Rajasthan";

    const nameParts = [
        mainName,
        district,
        state,
        "India"
    ]
        .filter(Boolean)
        .filter(
            (value, index, array) =>
                array.indexOf(value) === index
        );

    return {

        name: nameParts.join(", "),

        latitude:
            Number(place.lat),

        longitude:
            Number(place.lon)

    };

}


// =======================================================
// OPEN-METEO SEARCH
// =======================================================

async function searchOpenMeteo(query) {

    const searches = [

        query,

        `${query}, Rajasthan`,

        `${query}, Rajasthan, India`

    ];

    let allResults = [];


    for (const searchTerm of searches) {

        try {

            const url =
                `${GEOCODING_API}?name=${encodeURIComponent(searchTerm)}&count=100&language=en&format=json&countryCode=IN`;

            const response =
                await fetch(url);

            if (!response.ok) {
                continue;
            }

            const data =
                await response.json();

            if (data.results) {

                allResults =
                    allResults.concat(
                        data.results
                    );

            }

        } catch (error) {

            console.log(
                "Open-Meteo search failed:",
                error
            );

        }

    }


    // Remove duplicates

    const uniqueResults =
        Array.from(

            new Map(

                allResults.map(
                    place => [
                        `${place.latitude},${place.longitude}`,
                        place
                    ]
                )

            ).values()

        );


    // Prefer Rajasthan

    const rajasthanResults =
        uniqueResults.filter(
            place =>
                place.country_code === "IN" &&
                (
                    place.admin1 === "Rajasthan" ||
                    place.admin1
                        ?.toLowerCase()
                        .includes("rajasthan")
                )
        );


    if (rajasthanResults.length > 0) {

        return rajasthanResults;

    }


    return uniqueResults;

}


// =======================================================
// OPENSTREETMAP / NOMINATIM FALLBACK
// =======================================================

async function searchOpenStreetMap(query) {

    try {

        const url =
            `${OSM_GEOCODING_API}?q=${encodeURIComponent(
                query + ", Rajasthan, India"
            )}&format=json&addressdetails=1&limit=10&countrycodes=in&accept-language=en`;

        const response =
            await fetch(url);

        if (!response.ok) {

            throw new Error(
                "OpenStreetMap search failed."
            );

        }

        const data =
            await response.json();

        if (!Array.isArray(data)) {

            return [];

        }


        // Only keep Rajasthan locations

        return data.filter(
            place => isRajasthan(place)
        );

    } catch (error) {

        console.error(
            "OpenStreetMap fallback failed:",
            error
        );

        return [];

    }

}


// =======================================================
// ADD OSM ATTRIBUTION
// =======================================================

function addOSMAttribution() {

    if (
        document.getElementById(
            "osmAttribution"
        )
    ) {
        return;
    }


    const attribution =
        document.createElement("div");

    attribution.id =
        "osmAttribution";

    attribution.style.fontSize =
        "11px";

    attribution.style.marginTop =
        "6px";

    attribution.style.opacity =
        "0.65";

    attribution.innerHTML =
        'Location search may use <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>.';


    if (locationInput?.parentElement) {

        locationInput.parentElement
            .appendChild(attribution);

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


    const normalizedQuery =
        normalizeSearchText(query);


    // ---------------------------------------------------
    // CHECK KNOWN LOCATIONS FIRST
    // ---------------------------------------------------

    if (
        KNOWN_LOCATIONS[
            normalizedQuery
        ]
    ) {

        const selectedLocation =
            KNOWN_LOCATIONS[
                normalizedQuery
            ];


        displayLocation(
            selectedLocation
        );


        locationInput.value =
            selectedLocation.name;


        await loadWeather(
            selectedLocation
        );


        searchButton.disabled = false;

        searchButton.textContent =
            "Search";

        return;

    }


    try {

        // ------------------------------------------------
        // STEP 1 — OPEN-METEO
        // ------------------------------------------------

        let results =
            await searchOpenMeteo(query);


        // ------------------------------------------------
        // STEP 2 — OSM FALLBACK
        // ------------------------------------------------

        if (
            results.length === 0
        ) {

            setStatus(
                "Trying extended village search..."
            );


            const osmResults =
                await searchOpenStreetMap(
                    query
                );


            if (
                osmResults.length > 0
            ) {

                results =
                    osmResults;

                addOSMAttribution();

            }

        }


        // ------------------------------------------------
        // NO RESULT
        // ------------------------------------------------

        if (
            results.length === 0
        ) {

            throw new Error(
                `Location "${query}" not found. Try village + district, for example "Kuchera Nagaur".`
            );

        }


        // ------------------------------------------------
        // SELECT BEST RESULT
        // ------------------------------------------------

        const place =
            results[0];


        let selectedLocation;


        // OpenStreetMap result

        if (
            place.lat !== undefined &&
            place.lon !== undefined
        ) {

            selectedLocation =
                createOSMLocation(
                    place
                );

        }

        // Open-Meteo result

        else {

            selectedLocation =
                createOpenMeteoLocation(
                    place
                );

        }


        displayLocation(
            selectedLocation
        );


        locationInput.value =
            selectedLocation.name;


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
// LOAD WEATHER
// =======================================================

async function loadWeather(location) {

    setStatus(
        "Loading weather..."
    );


    try {

        const params =
            new URLSearchParams({

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
            document.createElement(
                "div"
            );


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
            document.createElement(
                "div"
            );


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
     * ECMWF, GFS and ICON comparison
     * will be connected separately.
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
// ENTER KEY
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


    locationInput.value =
        DEFAULT_LOCATION.name;


    await loadWeather(
        DEFAULT_LOCATION
    );

}


initialize();
