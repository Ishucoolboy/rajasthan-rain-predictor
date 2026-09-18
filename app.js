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

const OSM_GEOCODING_API =
    "https://nominatim.openstreetmap.org/search";

const VILLAGE_DATABASE_URL =
    "./villages.json";


// =======================================================
// DEFAULT LOCATION
// =======================================================

const DEFAULT_LOCATION = {
    name: "Kuchera, Nagaur, Rajasthan",
    latitude: 27.01,
    longitude: 73.97
};


// =======================================================
// KNOWN LOCATIONS
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
// VILLAGE DATABASE
// =======================================================

let villageDatabase = [];


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

    if (statusText) {
        statusText.textContent = message;
    }

    if (statusIndicator) {

        statusIndicator.style.background =
            online
                ? "#22c55e"
                : "#ef4444";

    }

}


// =======================================================
// NORMALIZE SEARCH
// =======================================================

function normalizeSearchText(text) {

    return String(text || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");

}


// =======================================================
// SIMPLE FUZZY MATCH
// =======================================================

function levenshteinDistance(a, b) {

    const matrix = [];

    const aa = String(a);
    const bb = String(b);

    for (let i = 0; i <= bb.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= aa.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= bb.length; i++) {

        for (let j = 1; j <= aa.length; j++) {

            if (bb.charAt(i - 1) === aa.charAt(j - 1)) {

                matrix[i][j] =
                    matrix[i - 1][j - 1];

            } else {

                matrix[i][j] =
                    Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );

            }

        }

    }

    return matrix[bb.length][aa.length];

}


function similarityScore(a, b) {

    const first =
        normalizeSearchText(a);

    const second =
        normalizeSearchText(b);

    if (!first || !second) {
        return 0;
    }

    if (first === second) {
        return 1;
    }

    if (
        first.includes(second) ||
        second.includes(first)
    ) {
        return 0.95;
    }

    const distance =
        levenshteinDistance(
            first,
            second
        );

    const maxLength =
        Math.max(
            first.length,
            second.length
        );

    if (!maxLength) {
        return 0;
    }

    return 1 - (
        distance / maxLength
    );

}


// =======================================================
// LOAD VILLAGE DATABASE
// =======================================================

async function loadVillageDatabase() {

    try {

        setStatus(
            "Loading Rajasthan village database..."
        );

        const response =
            await fetch(
                `${VILLAGE_DATABASE_URL}?v=1`
            );

        if (!response.ok) {

            throw new Error(
                "Village database could not be loaded."
            );

        }

        const data =
            await response.json();

        if (!Array.isArray(data)) {

            throw new Error(
                "Village database format is invalid."
            );

        }

        villageDatabase =
            data.filter(
                village =>
                    village &&
                    village.name &&
                    Number.isFinite(
                        Number(village.latitude)
                    ) &&
                    Number.isFinite(
                        Number(village.longitude)
                    )
            );

        console.log(
            `Loaded ${villageDatabase.length} Rajasthan villages.`
        );

        setStatus(
            "Village database ready"
        );

        return true;

    } catch (error) {

        console.error(
            "Village database error:",
            error
        );

        setStatus(
            "Village database unavailable",
            false
        );

        return false;

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
// VILLAGE DATABASE SEARCH
// =======================================================

function searchVillageDatabase(query) {

    if (
        !Array.isArray(villageDatabase) ||
        villageDatabase.length === 0
    ) {
        return null;
    }

    const search =
        normalizeSearchText(query);


    // ---------------------------------------------------
    // Exact village name
    // ---------------------------------------------------

    const exact =
        villageDatabase.find(
            village =>
                normalizeSearchText(
                    village.name
                ) === search
        );

    if (exact) {
        return exact;
    }


    // ---------------------------------------------------
    // Village + district / tehsil search
    // ---------------------------------------------------

    const containsMatches =
        villageDatabase.filter(
            village => {

                const fullText =
                    normalizeSearchText(
                        [
                            village.name,
                            village.tehsil,
                            village.district,
                            village.block
                        ]
                        .filter(Boolean)
                        .join(" ")
                    );

                return fullText.includes(search);

            }
        );

    if (containsMatches.length > 0) {

        const nameMatch =
            containsMatches.find(
                village =>
                    normalizeSearchText(
                        village.name
                    ).includes(search)
            );

        return nameMatch ||
            containsMatches[0];

    }


    // ---------------------------------------------------
    // Fuzzy matching
    // ---------------------------------------------------

    let bestVillage = null;

    let bestScore = 0;


    for (
        const village of villageDatabase
    ) {

        const villageName =
            normalizeSearchText(
                village.name
            );

        const score =
            similarityScore(
                search,
                villageName
            );

        if (
            score > bestScore
        ) {

            bestScore =
                score;

            bestVillage =
                village;

        }

    }


    // Don't accept extremely weak matches

    if (
        bestVillage &&
        bestScore >= 0.72
    ) {

        return bestVillage;

    }


    return null;

}


// =======================================================
// CREATE LOCATION FROM VILLAGE
// =======================================================

function createVillageLocation(village) {

    const parts = [

        village.name,

        village.tehsil,

        village.district,

        "Rajasthan"

    ]
        .filter(Boolean)
        .filter(
            (value, index, array) =>
                array.indexOf(value) === index
        );


    return {

        name:
            parts.join(", "),

        latitude:
            Number(village.latitude),

        longitude:
            Number(village.longitude)

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


    for (
        const searchTerm of searches
    ) {

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


    return rajasthanResults.length > 0
        ? rajasthanResults
        : uniqueResults;

}


// =======================================================
// OPENSTREETMAP FALLBACK
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
            return [];
        }

        const data =
            await response.json();

        if (!Array.isArray(data)) {
            return [];
        }


        return data.filter(
            place => {

                const state =
                    String(
                        place.address?.state ||
                        ""
                    ).toLowerCase();

                return (
                    state.includes("rajasthan")
                );

            }
        );

    } catch (error) {

        console.error(
            "OSM search failed:",
            error
        );

        return [];

    }

}


// =======================================================
// OSM ATTRIBUTION
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
            .appendChild(
                attribution
            );

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


    try {

        // ------------------------------------------------
        // STEP 1 — RAJASTHAN VILLAGE DATABASE
        // ------------------------------------------------

        const village =
            searchVillageDatabase(
                query
            );


        if (village) {

            const selectedLocation =
                createVillageLocation(
                    village
                );


            displayLocation(
                selectedLocation
            );


            locationInput.value =
                village.name;


            await loadWeather(
                selectedLocation
            );


            return;

        }


        // ------------------------------------------------
        // STEP 2 — KNOWN LOCATIONS
        // ------------------------------------------------

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


            return;

        }


        // ------------------------------------------------
        // STEP 3 — OPEN-METEO
        // ------------------------------------------------

        let results =
            await searchOpenMeteo(
                query
            );


        // ------------------------------------------------
        // STEP 4 — OSM FALLBACK
        // ------------------------------------------------

        if (
            results.length === 0
        ) {

            setStatus(
                "Trying extended location search..."
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


        if (
            results.length === 0
        ) {

            throw new Error(
                `Location "${query}" not found. Try village + district name.`
            );

        }


        const place =
            results[0];


        let selectedLocation;


        if (
            place.lat !== undefined &&
            place.lon !== undefined
        ) {

            selectedLocation = {

                name:
                    [
                        place.name,
                        place.address?.county,
                        place.address?.state,
                        "India"
                    ]
                    .filter(Boolean)
                    .filter(
                        (value, index, array) =>
                            array.indexOf(value) === index
                    )
                    .join(", "),

                latitude:
                    Number(place.lat),

                longitude:
                    Number(place.lon)

            };

        } else {

            selectedLocation = {

                name:
                    [
                        place.name,
                        place.admin3,
                        place.admin2,
                        place.admin1
                    ]
                    .filter(Boolean)
                    .filter(
                        (value, index, array) =>
                            array.indexOf(value) === index
                    )
                    .join(", "),

                latitude:
                    Number(place.latitude),

                longitude:
                    Number(place.longitude)

            };

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
// WEATHER API
// =======================================================

async function fetchWeatherModel(
    latitude,
    longitude,
    model
) {

    const params =
        new URLSearchParams({

            latitude:
                latitude,

            longitude:
                longitude,

            hourly:
                [
                    "precipitation"
                ].join(","),

            daily:
                [
                    "precipitation_sum",
                    "precipitation_probability_max"
                ].join(","),

            forecast_days:
                "7",

            timezone:
                "auto",

            models:
                model

        });


    const response =
        await fetch(
            `${WEATHER_API}?${params}`
        );


    if (!response.ok) {

        throw new Error(
            `${model} weather request failed`
        );

    }


    return await response.json();

}


// =======================================================
// MODEL TOTAL RAIN
// =======================================================

function getModelTotalRain(data) {

    const values =
        data?.daily?.precipitation_sum || [];


    return values.reduce(
        (total, value) => {

            const number =
                Number(value);

            return total +
                (
                    Number.isFinite(number)
                        ? number
                        : 0
                );

        },
        0
    );

}


// =======================================================
// MODEL COMPARISON
// =======================================================

async function updateModelComparison(
    location
) {

    ecmwfRain.textContent =
        "Loading...";

    gfsRain.textContent =
        "Loading...";

    iconRain.textContent =
        "Loading...";


    const models = [

        {
            name: "ECMWF",
            id: "ecmwf_ifs025",
            element: ecmwfRain
        },

        {
            name: "GFS",
            id: "gfs_seamless",
            element: gfsRain
        },

        {
            name: "ICON",
            id: "icon_seamless",
            element: iconRain
        }

    ];


    const results = [];


    await Promise.all(

        models.map(
            async model => {

                try {

                    const data =
                        await fetchWeatherModel(
                            location.latitude,
                            location.longitude,
                            model.id
                        );


                    const totalRain =
                        getModelTotalRain(
                            data
                        );


                    model.element.textContent =
                        `${totalRain.toFixed(1)} mm`;


                    results.push(
                        totalRain
                    );


                } catch (error) {

                    console.error(
                        `${model.name} error:`,
                        error
                    );


                    model.element.textContent =
                        "Unavailable";

                }

            }
        )

    );


    // ---------------------------------------------------
    // CONSENSUS
    // ---------------------------------------------------

    const validResults =
        results.filter(
            value =>
                Number.isFinite(value)
        );


    let consensus =
        document.getElementById(
            "modelConsensus"
        );


    if (!consensus) {

        consensus =
            document.createElement(
                "div"
            );

        consensus.id =
            "modelConsensus";

        consensus.style.marginTop =
            "12px";

        consensus.style.padding =
            "12px";

        consensus.style.borderRadius =
            "10px";

        consensus.style.background =
            "rgba(37, 99, 235, 0.08)";

        consensus.style.fontWeight =
            "600";


        const parent =
            ecmwfRain.closest("section") ||
            ecmwfRain.parentElement?.parentElement;


        if (parent) {

            parent.appendChild(
                consensus
            );

        }

    }


    if (
        validResults.length > 0
    ) {

        const average =
            validResults.reduce(
                (sum, value) =>
                    sum + value,
                0
            ) /
            validResults.length;


        consensus.textContent =
            `Model Consensus (7-day): ${average.toFixed(1)} mm`;

    } else {

        consensus.textContent =
            "Model Consensus: Data unavailable";

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


        // ------------------------------------------------
        // LIVE MODEL COMPARISON
        // ------------------------------------------------

        setStatus(
            "Loading ECMWF, GFS and ICON..."
        );


        await updateModelComparison(
            location
        );


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
// INITIALIZE
// =======================================================

async function initialize() {

    displayLocation(
        DEFAULT_LOCATION
    );


    locationInput.value =
        DEFAULT_LOCATION.name;


    // Load village database first

    await loadVillageDatabase();


    // Then load default weather

    await loadWeather(
        DEFAULT_LOCATION
    );

}


initialize();
