/*
=========================================================
RAJASTHAN RAIN PREDICTOR
MAIN WEBSITE JAVASCRIPT
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
// VILLAGE DATABASE
// =======================================================

let VILLAGE_DATABASE = [];
let villageDatabaseLoaded = false;


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
            online ? "#22c55e" : "#ef4444";

    }

}


// =======================================================
// DISPLAY LOCATION
// =======================================================

function displayLocation(location) {

    if (locationName) {

        locationName.textContent =
            location.name;

    }

    if (locationCoordinates) {

        locationCoordinates.textContent =
            `Latitude: ${Number(location.latitude).toFixed(4)}° | Longitude: ${Number(location.longitude).toFixed(4)}°`;

    }

}


// =======================================================
// NORMALIZE TEXT
// =======================================================

function normalizeSearchText(text) {

    return String(text || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");

}


// =======================================================
// LEVENSHTEIN
// =======================================================

function levenshteinDistance(a, b) {

    a = normalizeSearchText(a);
    b = normalizeSearchText(b);

    if (a === b) {
        return 0;
    }

    if (!a.length) {
        return b.length;
    }

    if (!b.length) {
        return a.length;
    }

    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {

        for (let j = 1; j <= a.length; j++) {

            if (
                b.charAt(i - 1) ===
                a.charAt(j - 1)
            ) {

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

    return matrix[b.length][a.length];

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
                `${VILLAGE_DATABASE_URL}?v=2`
            );

        if (!response.ok) {

            throw new Error(
                "Village database could not be loaded."
            );

        }

        const data =
            await response.json();

        if (Array.isArray(data)) {

            VILLAGE_DATABASE = data;

        } else if (
            Array.isArray(data.villages)
        ) {

            VILLAGE_DATABASE =
                data.villages;

        } else {

            throw new Error(
                "Invalid village database format."
            );

        }

        villageDatabaseLoaded = true;

        console.log(
            `Village database loaded: ${VILLAGE_DATABASE.length} records`
        );

    } catch (error) {

        villageDatabaseLoaded = false;
        VILLAGE_DATABASE = [];

        console.error(
            "Village database loading failed:",
            error
        );

    }

}


// =======================================================
// GET VILLAGE FIELD
// =======================================================

function getVillageField(village, fields) {

    for (const field of fields) {

        if (
            village &&
            village[field] !== undefined &&
            village[field] !== null
        ) {

            return village[field];

        }

    }

    return "";

}


// =======================================================
// CREATE VILLAGE LOCATION
// =======================================================

function createVillageLocation(village) {

    const name =
        getVillageField(
            village,
            [
                "name",
                "village",
                "village_name",
                "Village",
                "VillageName",
                "location"
            ]
        );

    const district =
        getVillageField(
            village,
            [
                "district",
                "District",
                "district_name"
            ]
        );

    const tehsil =
        getVillageField(
            village,
            [
                "tehsil",
                "Tehsil",
                "subdistrict",
                "sub_district",
                "taluka"
            ]
        );

    const latitude =
        Number(
            getVillageField(
                village,
                [
                    "latitude",
                    "lat",
                    "Latitude",
                    "LAT"
                ]
            )
        );

    const longitude =
        Number(
            getVillageField(
                village,
                [
                    "longitude",
                    "lon",
                    "lng",
                    "Longitude",
                    "LON"
                ]
            )
        );

    const nameParts = [
        name,
        tehsil,
        district,
        "Rajasthan"
    ]
        .filter(Boolean)
        .filter(
            (value, index, array) =>
                array.indexOf(value) === index
        );

    return {
        name: nameParts.join(", "),
        latitude,
        longitude
    };

}


// =======================================================
// SEARCH VILLAGE DATABASE
// =======================================================

function searchVillageDatabase(query) {

    if (
        !villageDatabaseLoaded ||
        !VILLAGE_DATABASE.length
    ) {

        return [];

    }

    const q =
        normalizeSearchText(query);

    const exact = [];
    const contains = [];
    const fuzzy = [];

    for (const village of VILLAGE_DATABASE) {

        const name =
            normalizeSearchText(
                getVillageField(
                    village,
                    [
                        "name",
                        "village",
                        "village_name",
                        "Village",
                        "VillageName",
                        "location"
                    ]
                )
            );

        const district =
            normalizeSearchText(
                getVillageField(
                    village,
                    [
                        "district",
                        "District",
                        "district_name"
                    ]
                )
            );

        const tehsil =
            normalizeSearchText(
                getVillageField(
                    village,
                    [
                        "tehsil",
                        "Tehsil",
                        "subdistrict",
                        "sub_district",
                        "taluka"
                    ]
                )
            );

        if (!name) {
            continue;
        }

        const combined =
            `${name} ${tehsil} ${district}`;

        if (name === q) {

            exact.push(village);
            continue;

        }

        if (combined.includes(q)) {

            contains.push(village);
            continue;

        }

        if (q.length >= 4) {

            const distance =
                levenshteinDistance(
                    name,
                    q
                );

            const threshold =
                q.length <= 6 ? 2 : 3;

            if (distance <= threshold) {

                fuzzy.push({
                    village,
                    distance
                });

            }

        }

    }

    fuzzy.sort(
        (a, b) =>
            a.distance - b.distance
    );

    return [

        ...exact,

        ...contains,

        ...fuzzy
            .slice(0, 10)
            .map(item => item.village)

    ];

}


// =======================================================
// RAJASTHAN CHECK
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
// OPEN-METEO LOCATION
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

        name:
            nameParts.join(", "),

        latitude:
            Number(place.latitude),

        longitude:
            Number(place.longitude)

    };

}


// =======================================================
// OSM LOCATION
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

    return {

        name: [
            mainName,
            district,
            state,
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

            if (Array.isArray(data.results)) {

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

    const unique =
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

    const rajasthan =
        unique.filter(
            place =>
                place.country_code === "IN" &&
                (
                    place.admin1 === "Rajasthan" ||
                    place.admin1
                        ?.toLowerCase()
                        .includes("rajasthan")
                )
        );

    return rajasthan.length
        ? rajasthan
        : unique;

}


// =======================================================
// OSM SEARCH
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
            place =>
                isRajasthan(place)
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
            .appendChild(attribution);

    }

}


// =======================================================
// SEARCH LOCATION
// =======================================================

async function searchLocation() {

    const query =
        locationInput?.value.trim();

    if (!query) {

        alert(
            "Please enter a village, town or city."
        );

        return;

    }

    setStatus(
        "Searching location..."
    );

    if (searchButton) {

        searchButton.disabled = true;
        searchButton.textContent =
            "Searching...";

    }

    const normalizedQuery =
        normalizeSearchText(query);

    try {

        // LOCAL DATABASE FIRST

        const localResults =
            searchVillageDatabase(query);

        if (localResults.length) {

            const selected =
                createVillageLocation(
                    localResults[0]
                );

            if (
                Number.isFinite(
                    selected.latitude
                ) &&
                Number.isFinite(
                    selected.longitude
                )
            ) {

                displayLocation(selected);

                locationInput.value =
                    selected.name;

                await loadWeather(selected);

                return;

            }

        }


        // KNOWN LOCATIONS

        if (
            KNOWN_LOCATIONS[
                normalizedQuery
            ]
        ) {

            const selected =
                KNOWN_LOCATIONS[
                    normalizedQuery
                ];

            displayLocation(selected);

            locationInput.value =
                selected.name;

            await loadWeather(selected);

            return;

        }


        // OPEN METEO

        let results =
            await searchOpenMeteo(query);


        // OSM FALLBACK

        if (!results.length) {

            setStatus(
                "Trying extended village search..."
            );

            const osmResults =
                await searchOpenStreetMap(
                    query
                );

            if (osmResults.length) {

                results =
                    osmResults;

                addOSMAttribution();

            }

        }


        if (!results.length) {

            throw new Error(
                `Location "${query}" not found. Try village + district, for example "Kuchera Nagaur".`
            );

        }


        const place =
            results[0];

        const selectedLocation =
            place.lat !== undefined &&
            place.lon !== undefined

                ? createOSMLocation(place)

                : createOpenMeteoLocation(place);


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

        if (searchButton) {

            searchButton.disabled =
                false;

            searchButton.textContent =
                "Search";

        }

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


        updateCurrentWeather(data);

        updateHourlyForecast(data);

        updateDailyForecast(data);


        // MODEL COMPARISON

        await updateModelStatus(
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
        !hourly.time?.length
    ) {
        return;
    }

    const index =
        findCurrentHourIndex(
            hourly.time
        );

    const probability =
        hourly.precipitation_probability?.[
            index
        ] ?? 0;

    const precipitation =
        hourly.precipitation?.[
            index
        ] ?? 0;

    const temp =
        hourly.temperature_2m?.[
            index
        ];

    const humidityValue =
        hourly.relative_humidity_2m?.[
            index
        ];

    const windValue =
        hourly.wind_speed_10m?.[
            index
        ];

    const weatherCode =
        hourly.weather_code?.[
            index
        ];


    if (rainProbability) {

        rainProbability.textContent =
            `${Math.round(probability)}%`;

    }

    if (rainAmount) {

        rainAmount.textContent =
            `${Number(precipitation).toFixed(1)} mm`;

    }

    if (temperature) {

        temperature.textContent =
            temp !== undefined
                ? `${Math.round(temp)} °C`
                : "-- °C";

    }

    if (humidity) {

        humidity.textContent =
            humidityValue !== undefined
                ? `${Math.round(humidityValue)}%`
                : "--%";

    }

    if (wind) {

        wind.textContent =
            windValue !== undefined
                ? `${Math.round(windValue)} km/h`
                : "-- km/h";

    }

    if (thunderstorm) {

        thunderstorm.textContent =
            isThunderstorm(weatherCode)
                ? "Possible"
                : "No indication";

    }

}


// =======================================================
// CURRENT HOUR INDEX
// =======================================================

function findCurrentHourIndex(times) {

    const now =
        new Date();

    let closestIndex = 0;
    let smallestDifference = Infinity;

    times.forEach(
        (time, index) => {

            const difference =
                Math.abs(
                    new Date(time).getTime() -
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

    if (
        !hourly ||
        !hourlyForecast
    ) {
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
            hourly.precipitation?.[
                i
            ] ?? 0;

        const probability =
            hourly.precipitation_probability?.[
                i
            ] ?? 0;

        const code =
            hourly.weather_code?.[
                i
            ];

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

        hourlyForecast.appendChild(card);

    }

}


// =======================================================
// DAILY FORECAST
// =======================================================

function updateDailyForecast(data) {

    const daily =
        data.daily;

    if (
        !daily ||
        !dailyForecast
    ) {
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
            daily.precipitation_sum?.[
                i
            ] ?? 0;

        const probability =
            daily.precipitation_probability_max?.[
                i
            ] ?? 0;

        const maxTemp =
            daily.temperature_2m_max?.[
                i
            ];

        const minTemp =
            daily.temperature_2m_min?.[
                i
            ];

        const code =
            daily.weather_code?.[
                i
            ];

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
                ${maxTemp !== undefined
                    ? Math.round(maxTemp)
                    : "--"}° /
                ${minTemp !== undefined
                    ? Math.round(minTemp)
                    : "--"}°
            </div>

        `;

        dailyForecast.appendChild(card);

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
// ECMWF + GFS + ICON
// =======================================================

async function updateModelStatus(location) {

    if (
        !location ||
        !Number.isFinite(
            Number(location.latitude)
        ) ||
        !Number.isFinite(
            Number(location.longitude)
        )
    ) {
        return;
    }


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


    const modelResults = [];


    models.forEach(
        model => {

            if (model.element) {

                model.element.textContent =
                    "Loading...";

            }

        }
    );


    // ===================================================
    // FETCH EACH MODEL
    // ===================================================

    for (const model of models) {

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
                            "precipitation_probability",
                            "weather_code"
                        ].join(","),

                    daily:
                        "precipitation_sum,precipitation_probability_max",

                    forecast_days:
                        "7",

                    timezone:
                        "auto",

                    models:
                        model.id

                });


            const response =
                await fetch(
                    `${WEATHER_API}?${params}`
                );


            if (!response.ok) {

                throw new Error(
                    `${model.name} API error`
                );

            }


            const data =
                await response.json();


            const daily =
                data.daily;

            const hourly =
                data.hourly;


            if (
                !daily ||
                !Array.isArray(
                    daily.precipitation_sum
                )
            ) {

                throw new Error(
                    `${model.name} rainfall data unavailable`
                );

            }


            // 7 DAY RAIN

            const rainfall =
                daily.precipitation_sum.map(
                    value =>
                        Number(value) || 0
                );


            const totalRain =
                rainfall.reduce(
                    (sum, value) =>
                        sum + value,
                    0
                );


            // RAIN PROBABILITY

            const probabilities =
                Array.isArray(
                    daily.precipitation_probability_max
                )
                    ? daily
                        .precipitation_probability_max
                        .map(
                            value =>
                                Number(value) || 0
                        )
                    : [];


            const averageProbability =
                probabilities.length

                    ? probabilities.reduce(
                        (sum, value) =>
                            sum + value,
                        0
                    ) /
                    probabilities.length

                    : 0;


            // HOURLY DATA

            const hourlyData = {

                time:
                    hourly?.time || [],

                precipitation:
                    hourly?.precipitation || [],

                rain:
                    hourly?.rain || [],

                showers:
                    hourly?.showers || [],

                probability:
                    hourly?.precipitation_probability || [],

                weatherCode:
                    hourly?.weather_code || []

            };


            modelResults.push({

                name:
                    model.name,

                rainfall,

                totalRain,

                averageProbability,

                hourly:
                    hourlyData,

                success:
                    true

            });


            if (model.element) {

                model.element.textContent =
                    `${totalRain.toFixed(1)} mm`;

            }


        } catch (error) {

            console.error(
                `${model.name} failed:`,
                error
            );


            modelResults.push({

                name:
                    model.name,

                rainfall: [],

                totalRain: null,

                averageProbability: null,

                hourly: null,

                success: false

            });


            if (model.element) {

                model.element.textContent =
                    "Unavailable";

            }

        }

    }


    // 7 DAY CONSENSUS

    renderModelConsensus(
        modelResults
    );


    // HOURLY COMPARISON

    renderHourlyModelComparison(
        modelResults
    );

}


// =======================================================
// 7-DAY MODEL CONSENSUS
// =======================================================

function renderModelConsensus(results) {

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
            "18px";

        consensus.style.padding =
            "16px";

        consensus.style.borderRadius =
            "14px";

        consensus.style.background =
            "rgba(15,23,42,0.06)";

        consensus.style.border =
            "1px solid rgba(100,116,139,0.18)";


        if (
            ecmwfRain?.parentElement?.parentElement
        ) {

            ecmwfRain.parentElement
                .parentElement
                .appendChild(
                    consensus
                );

        }

    }


    const successful =
        results.filter(
            item =>
                item.success &&
                Number.isFinite(
                    item.totalRain
                )
        );


    if (!successful.length) {

        consensus.innerHTML = `

            <strong>
                🌧️ Model Consensus
            </strong>

            <div style="margin-top:8px;">
                ECMWF, GFS aur ICON data
                available nahi hai.
            </div>

        `;

        return;

    }


    const totals =
        successful.map(
            item =>
                item.totalRain
        );


    const averageRain =
        totals.reduce(
            (sum, value) =>
                sum + value,
            0
        ) /
        totals.length;


    const minimumRain =
        Math.min(...totals);


    const maximumRain =
        Math.max(...totals);


    const spread =
        maximumRain -
        minimumRain;


    const probabilities =
        successful
            .map(
                item =>
                    item.averageProbability
            )
            .filter(
                value =>
                    Number.isFinite(value)
            );


    const averageProbability =
        probabilities.length

            ? probabilities.reduce(
                (sum, value) =>
                    sum + value,
                0
            ) /
            probabilities.length

            : 0;


    let agreement =
        "Low";


    if (
        averageRain < 1
    ) {

        if (spread <= 2) {

            agreement =
                "High";

        } else if (spread <= 5) {

            agreement =
                "Moderate";

        }

    } else {

        if (
            spread <=
            Math.max(
                5,
                averageRain * 0.30
            )
        ) {

            agreement =
                "High";

        } else if (
            spread <=
            Math.max(
                10,
                averageRain * 0.60
            )
        ) {

            agreement =
                "Moderate";

        }

    }


    const rows =
        successful
            .map(
                item => `

                    <div style="
                        display:flex;
                        justify-content:space-between;
                        padding:6px 0;
                        border-bottom:
                            1px solid
                            rgba(100,116,139,0.12);
                    ">

                        <span>
                            ${item.name}
                        </span>

                        <strong>
                            ${item.totalRain.toFixed(1)} mm
                        </strong>

                    </div>

                `
            )
            .join("");


    consensus.innerHTML = `

        <div style="
            font-size:18px;
            font-weight:700;
            margin-bottom:10px;
        ">
            🌧️ Model Consensus
        </div>


        ${rows}


        <div style="
            margin-top:12px;
            line-height:1.7;
        ">

            <div>
                <strong>
                    7-Day Average:
                </strong>
                ${averageRain.toFixed(1)} mm
            </div>

            <div>
                <strong>
                    Model Range:
                </strong>
                ${minimumRain.toFixed(1)}
                –
                ${maximumRain.toFixed(1)} mm
            </div>

            <div>
                <strong>
                    Model Spread:
                </strong>
                ${spread.toFixed(1)} mm
            </div>

            <div>
                <strong>
                    Agreement:
                </strong>
                ${agreement}
            </div>

            <div>
                <strong>
                    Average Rain Probability:
                </strong>
                ${Math.round(
                    averageProbability
                )}%
            </div>

        </div>


        <div style="
            margin-top:10px;
            font-size:12px;
            opacity:0.7;
        ">
            Model consensus comparison hai,
            guaranteed accuracy percentage nahi.
        </div>

    `;

}


// =======================================================
// HOURLY MODEL COMPARISON
// =======================================================

function renderHourlyModelComparison(results) {

    let container =
        document.getElementById(
            "hourlyModelComparison"
        );


    // CREATE CONTAINER

    if (!container) {

        container =
            document.createElement(
                "div"
            );

        container.id =
            "hourlyModelComparison";

        container.style.marginTop =
            "20px";

        container.style.padding =
            "16px";

        container.style.borderRadius =
            "14px";

        container.style.background =
            "rgba(15,23,42,0.06)";

        container.style.border =
            "1px solid rgba(100,116,139,0.18)";


        if (
            hourlyForecast?.parentElement
        ) {

            hourlyForecast.parentElement
                .appendChild(
                    container
                );

        }

    }


    const successful =
        results.filter(
            item =>
                item.success &&
                item.hourly &&
                Array.isArray(
                    item.hourly.time
                )
        );


    if (!successful.length) {

        container.innerHTML = `

            <div style="
                font-size:18px;
                font-weight:700;
            ">
                🕐 Hourly Model Comparison
            </div>

            <div style="
                margin-top:8px;
            ">
                Hourly model data available nahi hai.
            </div>

        `;

        return;

    }


    const reference =
        successful[0];


    const startIndex =
        findCurrentHourIndex(
            reference.hourly.time
        );


    const endIndex =
        Math.min(
            startIndex + 24,
            reference.hourly.time.length
        );


    let rows = "";


    // ===================================================
    // CREATE 24 HOUR ROWS
    // ===================================================

    for (
        let i = startIndex;
        i < endIndex;
        i++
    ) {

        const time =
            reference.hourly.time[i];

        const date =
            new Date(time);


        const values = {};


        successful.forEach(
            model => {

                const index =
                    model.hourly.time.indexOf(
                        time
                    );


                if (index >= 0) {

                    values[
                        model.name
                    ] = {

                        rain:
                            Number(
                                model.hourly
                                    .precipitation[
                                        index
                                    ] || 0
                            ),

                        probability:
                            Number(
                                model.hourly
                                    .probability[
                                        index
                                    ] || 0
                            ),

                        code:
                            model.hourly
                                .weatherCode[
                                    index
                                ]

                    };

                }

            }
        );


        const ecmwf =
            values.ECMWF || {};

        const gfs =
            values.GFS || {};

        const icon =
            values.ICON || {};


        const rains = [

            Number(ecmwf.rain || 0),

            Number(gfs.rain || 0),

            Number(icon.rain || 0)

        ];


        const maxRain =
            Math.max(...rains);


        const rainModels =
            rains.filter(
                value =>
                    value >= 0.1
            ).length;


        let signal =
            "No significant rain";


        if (
            rainModels >= 2
        ) {

            signal =
                "🌧️ Model agreement";

        } else if (
            rainModels === 1
        ) {

            signal =
                "🌦️ One model";

        } else if (
            maxRain >= 0.1
        ) {

            signal =
                "🌦️ Weak signal";

        }


        let storm =
            false;


        successful.forEach(
            model => {

                const index =
                    model.hourly.time.indexOf(
                        time
                    );


                if (
                    index >= 0 &&
                    isThunderstorm(
                        model.hourly.weatherCode[
                            index
                        ]
                    )
                ) {

                    storm = true;

                }

            }
        );


        rows += `

            <div style="
                padding:10px 0;
                border-bottom:
                    1px solid
                    rgba(100,116,139,0.15);
            ">

                <div style="
                    display:grid;
                    grid-template-columns:
                        70px 1fr 1fr 1fr;
                    gap:6px;
                    align-items:center;
                    font-size:13px;
                ">

                    <strong>
                        ${formatTime(date)}
                    </strong>


                    <span>
                        ECMWF:
                        ${Number(
                            ecmwf.rain || 0
                        ).toFixed(1)} mm
                    </span>


                    <span>
                        GFS:
                        ${Number(
                            gfs.rain || 0
                        ).toFixed(1)} mm
                    </span>


                    <span>
                        ICON:
                        ${Number(
                            icon.rain || 0
                        ).toFixed(1)} mm
                    </span>

                </div>


                <div style="
                    margin-top:5px;
                    font-size:12px;
                    opacity:0.75;
                ">

                    ${signal}

                    ${
                        storm
                            ? " ⚡ Thunderstorm signal"
                            : ""
                    }

                </div>

            </div>

        `;

    }


    container.innerHTML = `

        <div style="
            font-size:18px;
            font-weight:700;
            margin-bottom:4px;
        ">
            🕐 Hourly Rain Model Comparison
        </div>


        <div style="
            font-size:12px;
            opacity:0.7;
            margin-bottom:12px;
        ">
            Next 24 hours — ECMWF vs GFS vs ICON
        </div>


        <div>
            ${rows}
        </div>


        <div style="
            margin-top:12px;
            font-size:12px;
            opacity:0.7;
            line-height:1.5;
        ">
            🌧️ Model agreement ka matlab hai ki
            multiple models us hour me rain signal
            de rahe hain. Ye guaranteed rainfall nahi hai.
        </div>

    `;

}


// =======================================================
// SEARCH BUTTON
// =======================================================

if (searchButton) {

    searchButton.addEventListener(
        "click",
        searchLocation
    );

}


// =======================================================
// ENTER KEY
// =======================================================

if (locationInput) {

    locationInput.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Enter"
            ) {

                searchLocation();

            }

        }
    );

}


// =======================================================
// INITIALIZE
// =======================================================

async function initialize() {

    await loadVillageDatabase();


    displayLocation(
        DEFAULT_LOCATION
    );


    if (locationInput) {

        locationInput.value =
            DEFAULT_LOCATION.name;

    }


    await loadWeather(
        DEFAULT_LOCATION
    );

}


// =======================================================
// START
// =======================================================

initialize();
