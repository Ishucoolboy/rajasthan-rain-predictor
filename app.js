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

// Village database
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
// RAIN MAP
// =======================================================

let rainMap = null;
let rainMapMarker = null;
let rainMapCircle = null;


// Rajasthan map center
const RAJASTHAN_MAP_CENTER = [27.0238, 74.2179];

const RAJASTHAN_MAP_ZOOM = 6.2;


// =======================================================
// INITIALIZE RAIN MAP
// =======================================================

function initializeRainMap() {

    const mapElement =
        document.getElementById("rainMap");

    if (!mapElement) {
        return;
    }

    // Leaflet library not loaded yet
    if (typeof L === "undefined") {

        mapElement.innerHTML = `
            <div class="map-placeholder">
                <div>🗺️</div>
                <p>Map library could not be loaded.</p>
            </div>
        `;

        return;

    }

    // Prevent duplicate map initialization
    if (rainMap) {
        return;
    }

    mapElement.innerHTML = "";

    // Leaflet needs a real height to render correctly.
    mapElement.style.width = "100%";
    mapElement.style.height = "480px";
    mapElement.style.minHeight = "360px";
    mapElement.style.borderRadius = "16px";
    mapElement.style.overflow = "hidden";

    rainMap = L.map(
        mapElement,
        {
            center: RAJASTHAN_MAP_CENTER,
            zoom: RAJASTHAN_MAP_ZOOM,
            minZoom: 5,
            maxZoom: 14,
            scrollWheelZoom: true
        }
    );

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors"
        }
    ).addTo(rainMap);

    // Rainfall intensity legend
    const legend = L.control({ position: "bottomright" });

    legend.onAdd = function () {

        const div = L.DomUtil.create("div", "rain-map-legend");

        div.style.background = "rgba(255,255,255,0.94)";
        div.style.padding = "9px 11px";
        div.style.borderRadius = "10px";
        div.style.boxShadow = "0 2px 10px rgba(0,0,0,0.18)";
        div.style.fontSize = "11px";
        div.style.lineHeight = "1.6";

        div.innerHTML = `
            <strong>Rainfall</strong><br>
            <span style="color:#64748b">●</span> 0 mm<br>
            <span style="color:#f59e0b">●</span> &lt; 1 mm<br>
            <span style="color:#16a34a">●</span> 1–4.9 mm<br>
            <span style="color:#0891b2">●</span> 5–9.9 mm<br>
            <span style="color:#2563eb">●</span> 10–19.9 mm<br>
            <span style="color:#7c3aed">●</span> 20+ mm
        `;

        return div;

    };

    legend.addTo(rainMap);

    const info =
        document.getElementById("mapInfo");

    if (info) {

        info.innerHTML = `
            <strong>🌧️ Live Rainfall Location Map</strong>
            <p>Search a Rajasthan location above.
            The marker shows the selected location and
            its current forecast rainfall conditions.</p>
        `;

    }

}


// =======================================================
// RAIN MAP COLOR
// =======================================================

function getRainMapColor(rain) {

    const value = Number(rain) || 0;

    if (value >= 20) {
        return "#7c3aed";
    }

    if (value >= 10) {
        return "#2563eb";
    }

    if (value >= 5) {
        return "#0891b2";
    }

    if (value >= 1) {
        return "#16a34a";
    }

    if (value > 0) {
        return "#f59e0b";
    }

    return "#64748b";

}


// =======================================================
// UPDATE RAIN MAP
// =======================================================

function updateRainMap(location, weatherData) {

    if (!location) {
        return;
    }

    if (!rainMap) {
        initializeRainMap();
    }

    if (!rainMap || typeof L === "undefined") {
        return;
    }

    const hourly =
        weatherData?.hourly;

    const currentIndex =
        hourly?.time?.length
            ? findCurrentHourIndex(hourly.time)
            : 0;

    const rain =
        Number(
            hourly?.precipitation?.[currentIndex] ?? 0
        ) || 0;

    const probability =
        Number(
            hourly?.precipitation_probability?.[currentIndex] ?? 0
        ) || 0;

    const temperature =
        hourly?.temperature_2m?.[currentIndex];

    const weatherCode =
        hourly?.weather_code?.[currentIndex];

    const latitude =
        Number(location.latitude);

    const longitude =
        Number(location.longitude);

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
    ) {
        return;
    }

    const color =
        getRainMapColor(rain);

    if (rainMapMarker) {
        rainMap.removeLayer(rainMapMarker);
    }

    if (rainMapCircle) {
        rainMap.removeLayer(rainMapCircle);
    }

    rainMapMarker =
        L.marker([latitude, longitude])
            .addTo(rainMap);

    rainMapMarker.bindPopup(`
        <div style="min-width:190px;">
            <strong>📍 ${escapeHtml(location.name)}</strong>
            <hr style="border:0;border-top:1px solid #ddd;margin:7px 0;">
            <div>🌧️ Current rain: <strong>${rain.toFixed(1)} mm</strong></div>
            <div>💧 Rain probability: <strong>${Math.round(probability)}%</strong></div>
            <div>🌡️ Temperature: <strong>${
                temperature !== undefined
                    ? `${Math.round(temperature)} °C`
                    : "--"
            }</strong></div>
            <div>🌦️ Condition: <strong>${getWeatherDescription(weatherCode)}</strong></div>
        </div>
    `);

    rainMapCircle =
        L.circle([latitude, longitude], {
            radius: Math.max(5000, Math.min(25000, 5000 + rain * 500)),
            color,
            fillColor: color,
            fillOpacity: 0.22,
            weight: 2
        }).addTo(rainMap);

    rainMapCircle.bindTooltip(
        `${rain.toFixed(1)} mm | ${Math.round(probability)}% rain`,
        {
            direction: "top"
        }
    );

    rainMap.setView(
        [latitude, longitude],
        Math.max(8, rainMap.getZoom())
    );

    // Keep marker visible after map movement
    setTimeout(() => {
        rainMap.invalidateSize();
    }, 100);

}


// =======================================================
// WEATHER DESCRIPTION
// =======================================================

function getWeatherDescription(code) {

    if (code === undefined || code === null) {
        return "Unknown";
    }

    if (isThunderstorm(code)) {
        return "Thunderstorm possible";
    }

    if (code >= 61 && code <= 67) {
        return "Rain";
    }

    if (code >= 80 && code <= 82) {
        return "Rain showers";
    }

    if (code >= 51 && code <= 57) {
        return "Drizzle";
    }

    if (code === 0) {
        return "Clear sky";
    }

    if (code === 1 || code === 2) {
        return "Partly cloudy";
    }

    if (code === 3) {
        return "Overcast";
    }

    return "Cloudy / variable";

}


// =======================================================
// HTML ESCAPE
// =======================================================

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


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
// NORMALIZE SEARCH
// =======================================================

function normalizeSearchText(text) {

    return String(text || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");

}


// =======================================================
// LEVENSHTEIN DISTANCE
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

            if (b.charAt(i - 1) === a.charAt(j - 1)) {

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
                `${VILLAGE_DATABASE_URL}?v=1`
            );

        if (!response.ok) {

            throw new Error(
                "Village database could not be loaded."
            );

        }

        const data =
            await response.json();

        if (Array.isArray(data)) {

            VILLAGE_DATABASE =
                data;

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

        villageDatabaseLoaded =
            true;

        console.log(
            `Village database loaded: ${VILLAGE_DATABASE.length} records`
        );

    } catch (error) {

        villageDatabaseLoaded =
            false;

        VILLAGE_DATABASE =
            [];

        console.error(
            "Village database loading failed:",
            error
        );

    }

}


// =======================================================
// GET VILLAGE FIELD
// =======================================================

function getVillageField(village, possibleNames) {

    for (
        const field of possibleNames
    ) {

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
// CREATE LOCATION FROM VILLAGE DATABASE
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

        name:
            nameParts.join(", "),

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
        !Array.isArray(VILLAGE_DATABASE) ||
        VILLAGE_DATABASE.length === 0
    ) {

        return [];

    }

    const normalizedQuery =
        normalizeSearchText(query);

    const exactMatches = [];

    const containsMatches = [];

    const fuzzyMatches = [];

    for (
        const village of VILLAGE_DATABASE
    ) {

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

        if (
            name === normalizedQuery
        ) {

            exactMatches.push(village);

            continue;

        }

        if (
            combined.includes(
                normalizedQuery
            )
        ) {

            containsMatches.push(village);

            continue;

        }

        if (
            normalizedQuery.length >= 4
        ) {

            const distance =
                levenshteinDistance(
                    name,
                    normalizedQuery
                );

            const threshold =
                normalizedQuery.length <= 6
                    ? 2
                    : 3;

            if (
                distance <= threshold
            ) {

                fuzzyMatches.push({
                    village,
                    distance
                });

            }

        }

    }

    fuzzyMatches.sort(
        (a, b) =>
            a.distance - b.distance
    );

    return [

        ...exactMatches,

        ...containsMatches,

        ...fuzzyMatches
            .slice(0, 10)
            .map(item => item.village)

    ];

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

        name:
            nameParts.join(", "),

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

        name:
            nameParts.join(", "),

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

    if (
        rajasthanResults.length > 0
    ) {

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

        return data.filter(
            place =>
                isRajasthan(place)
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
        document.createElement(
            "div"
        );

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

    if (
        locationInput?.parentElement
    ) {

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

    searchButton.disabled =
        true;

    searchButton.textContent =
        "Searching...";

    const normalizedQuery =
        normalizeSearchText(query);

    try {

        // ------------------------------------------------
        // STEP 1 — LOCAL VILLAGE DATABASE
        // ------------------------------------------------

        const localResults =
            searchVillageDatabase(
                query
            );

        if (
            localResults.length > 0
        ) {

            const selectedLocation =
                createVillageLocation(
                    localResults[0]
                );

            if (
                Number.isFinite(
                    selectedLocation.latitude
                ) &&
                Number.isFinite(
                    selectedLocation.longitude
                )
            ) {

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

        searchButton.disabled =
            false;

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

        // Update interactive rainfall map
        updateRainMap(
            location,
            data
        );

        // IMPORTANT:
        // Live ECMWF / GFS / ICON comparison
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
// FIND CURRENT HOUR
// =======================================================

function findCurrentHourIndex(times) {

    const now =
        new Date();

    let closestIndex =
        0;

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

    if (!hourlyForecast) {
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

    if (!dailyForecast) {
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

    // Initial loading text

    models.forEach(
        model => {

            if (model.element) {

                model.element.textContent =
                    "Loading...";

            }

        }
    );


    // ===================================================
    // FETCH ALL MODELS
    // ===================================================

    for (
        const model of models
    ) {

        try {

            const params =
                new URLSearchParams({

                    latitude:
                        location.latitude,

                    longitude:
                        location.longitude,

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

            const rainfall =
                daily.precipitation_sum
                    .map(value =>
                        Number(value) || 0
                    );

            const totalRain =
                rainfall.reduce(
                    (sum, value) =>
                        sum + value,
                    0
                );

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
                probabilities.length > 0

                    ? probabilities.reduce(
                        (sum, value) =>
                            sum + value,
                        0
                    ) / probabilities.length

                    : 0;

            modelResults.push({

                name:
                    model.name,

                rainfall,

                totalRain,

                averageProbability,

                success:
                    true

            });

            if (model.element) {

                model.element.textContent =
                    `${totalRain.toFixed(1)} mm`;

            }

        } catch (error) {

            console.error(
                `${model.name} model failed:`,
                error
            );

            modelResults.push({

                name:
                    model.name,

                rainfall: [],

                totalRain:
                    null,

                averageProbability:
                    null,

                success:
                    false

            });

            if (model.element) {

                model.element.textContent =
                    "Unavailable";

            }

        }

    }


    // ===================================================
    // MODEL CONSENSUS
    // ===================================================

    renderModelConsensus(
        modelResults
    );

}


// =======================================================
// MODEL CONSENSUS DISPLAY
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

        const modelContainer =
            ecmwfRain?.closest(
                ".card, .model-card, section, div"
            );

        if (
            modelContainer &&
            modelContainer.parentElement
        ) {

            modelContainer.parentElement
                .appendChild(
                    consensus
                );

        } else if (
            dailyForecast?.parentElement
        ) {

            dailyForecast.parentElement
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


    if (
        successful.length === 0
    ) {

        consensus.innerHTML = `

            <strong>Model Consensus</strong>

            <div style="margin-top:8px;">
                ECMWF, GFS aur ICON data
                abhi available nahi hai.
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
        ) / totals.length;


    const minimumRain =
        Math.min(
            ...totals
        );


    const maximumRain =
        Math.max(
            ...totals
        );


    const spread =
        maximumRain -
        minimumRain;


    const probabilityValues =
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
        probabilityValues.length > 0

            ? probabilityValues.reduce(
                (sum, value) =>
                    sum + value,
                0
            ) /
            probabilityValues.length

            : 0;


    // ===================================================
    // AGREEMENT
    // ===================================================

    let agreement =
        "Low";

    if (
        averageRain < 1
    ) {

        if (
            spread <= 2
        ) {

            agreement =
                "High";

        } else if (
            spread <= 5
        ) {

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


    // ===================================================
    // MODEL ROWS
    // ===================================================

    const modelRows =
        successful
            .map(
                item => `

                    <div style="
                        display:flex;
                        justify-content:space-between;
                        gap:10px;
                        padding:6px 0;
                        border-bottom:1px solid rgba(100,116,139,0.12);
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

        <div style="
            display:grid;
            gap:4px;
        ">

            ${modelRows}

        </div>

        <div style="
            margin-top:12px;
            display:grid;
            gap:6px;
        ">

            <div>
                <strong>7-Day Average:</strong>
                ${averageRain.toFixed(1)} mm
            </div>

            <div>
                <strong>Model Range:</strong>
                ${minimumRain.toFixed(1)}
                –
                ${maximumRain.toFixed(1)} mm
            </div>

            <div>
                <strong>Model Spread:</strong>
                ${spread.toFixed(1)} mm
            </div>

            <div>
                <strong>Agreement:</strong>
                ${agreement}
            </div>

            <div>
                <strong>Average Rain Probability:</strong>
                ${Math.round(averageProbability)}%
            </div>

        </div>

        <div style="
            margin-top:10px;
            font-size:12px;
            opacity:0.70;
            line-height:1.5;
        ">
            Consensus multiple weather models ka
            comparison hai. Ye guaranteed accuracy
            percentage nahi hai.
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
        function (event) {

            if (
                event.key === "Enter"
            ) {

                searchLocation();

            }

        }
    );

}


// =======================================================
// INITIAL LOAD
// =======================================================

async function initialize() {

    // Load village database first

    await loadVillageDatabase();


    // Initialize interactive rainfall map

    initializeRainMap();


    // Show default location

    displayLocation(
        DEFAULT_LOCATION
    );


    if (locationInput) {

        locationInput.value =
            DEFAULT_LOCATION.name;

    }


    // Load weather

    await loadWeather(
        DEFAULT_LOCATION
    );

}


// =======================================================
// START
// =======================================================
// =======================================================
// SMART RAIN FORECAST SUMMARY
// =======================================================

function getRainIntensity(rain) {

    rain = Number(rain) || 0;

    if (rain <= 0) {
        return "No Rain";
    }

    if (rain < 2.5) {
        return "Light Rain";
    }

    if (rain < 7.6) {
        return "Moderate Rain";
    }

    if (rain < 50) {
        return "Heavy Rain";
    }

    return "Very Heavy Rain";
}


function getRainRisk(probability, rainfall) {

    probability = Number(probability) || 0;
    rainfall = Number(rainfall) || 0;

    if (rainfall >= 50 || probability >= 90) {
        return "High";
    }

    if (rainfall >= 10 || probability >= 60) {
        return "Moderate";
    }

    if (rainfall > 0 || probability >= 30) {
        return "Low";
    }

    return "Minimal";
}


function findNextRain(hourlyData) {

    if (
        !hourlyData ||
        !Array.isArray(hourlyData.time)
    ) {
        return null;
    }

    const rain =
        hourlyData.precipitation || [];

    const probability =
        hourlyData.precipitation_probability || [];

    const startIndex =
        findCurrentHourIndex(
            hourlyData.time
        );

    for (
        let i = startIndex;
        i < hourlyData.time.length;
        i++
    ) {

        const rainfall =
            Number(rain[i]) || 0;

        const rainProbability =
            Number(probability[i]) || 0;

        if (
            rainfall >= 0.1 ||
            rainProbability >= 50
        ) {

            return {
                time:
                    hourlyData.time[i],

                rainfall,

                probability:
                    rainProbability
            };
        }
    }

    return null;
}


function renderSmartRainSummary(data) {

    const hourly =
        data?.hourly;

    if (!hourly) {
        return;
    }

    let summary =
        document.getElementById(
            "smartRainSummary"
        );

    if (!summary) {

        summary =
            document.createElement(
                "div"
            );

        summary.id =
            "smartRainSummary";

        summary.style.marginTop =
            "18px";

        summary.style.padding =
            "18px";

        summary.style.borderRadius =
            "16px";

        summary.style.background =
            "rgba(14,165,233,0.08)";

        summary.style.border =
            "1px solid rgba(14,165,233,0.18)";

        const target =
            document.querySelector(
                ".weather-grid"
            ) ||
            document.querySelector(
                "main"
            );

        if (target) {
            target.parentNode.insertBefore(
                summary,
                target.nextSibling
            );
        }
    }

    const nextRain =
        findNextRain(hourly);

    if (!nextRain) {

        summary.innerHTML = `
            <div style="
                font-size:18px;
                font-weight:700;
                margin-bottom:8px;
            ">
                🌤️ Rain Forecast Summary
            </div>

            <div>
                No significant rain signal found
                in the available forecast.
            </div>
        `;

        return;
    }

    const intensity =
        getRainIntensity(
            nextRain.rainfall
        );

    const risk =
        getRainRisk(
            nextRain.probability,
            nextRain.rainfall
        );

    const date =
        new Date(
            nextRain.time
        );

    const formattedTime =
        date.toLocaleString(
            "en-IN",
            {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit"
            }
        );

    summary.innerHTML = `
        <div style="
            font-size:18px;
            font-weight:700;
            margin-bottom:12px;
        ">
            🌧️ Smart Rain Forecast
        </div>

        <div style="
            display:grid;
            gap:8px;
        ">

            <div>
                🕒 <strong>Next Rain:</strong>
                ${escapeHtml(formattedTime)}
            </div>

            <div>
                💧 <strong>Probability:</strong>
                ${Math.round(nextRain.probability)}%
            </div>

            <div>
                📏 <strong>Expected Rain:</strong>
                ${nextRain.rainfall.toFixed(1)} mm
            </div>

            <div>
                🌦️ <strong>Intensity:</strong>
                ${intensity}
            </div>

            <div>
                ⚠️ <strong>Risk:</strong>
                ${risk}
            </div>

        </div>

        <div style="
            margin-top:10px;
            font-size:12px;
            opacity:0.7;
            line-height:1.5;
        ">
            This is a forecast signal based on available
            weather data, not a guaranteed prediction.
        </div>
    `;
}
// =======================================================
// AUTOMATIC WEATHER REFRESH
// =======================================================

let currentSelectedLocation =
    DEFAULT_LOCATION;


// =======================================================
// SAVE SELECTED LOCATION
// =======================================================

function setCurrentSelectedLocation(location) {

    if (!location) {
        return;
    }

    currentSelectedLocation = {
        name: location.name,
        latitude: Number(location.latitude),
        longitude: Number(location.longitude)
    };
}


// =======================================================
// REFRESH WEATHER
// =======================================================

async function refreshCurrentWeather() {

    if (!currentSelectedLocation) {
        return;
    }

    console.log(
        "Refreshing weather data..."
    );

    await loadWeather(
        currentSelectedLocation
    );

}


// =======================================================
// AUTO REFRESH EVERY 30 MINUTES
// =======================================================

setInterval(
    refreshCurrentWeather,
    30 * 60 * 1000
);


// =======================================================
// FIRST LOCATION
// =======================================================

setCurrentSelectedLocation(
    DEFAULT_LOCATION
);
// =======================================================
// HOURLY MODEL COMPARISON
// =======================================================

async function loadHourlyModelComparison(location) {

    if (!location) {
        return;
    }

    const models = [
        {
            name: "ECMWF",
            id: "ecmwf_ifs025"
        },
        {
            name: "GFS",
            id: "gfs_seamless"
        },
        {
            name: "ICON",
            id: "icon_seamless"
        }
    ];

    const results = [];

    for (const model of models) {

        try {

            const params =
                new URLSearchParams({

                    latitude:
                        location.latitude,

                    longitude:
                        location.longitude,

                    hourly:
                        "precipitation,precipitation_probability",

                    forecast_days:
                        "2",

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

            results.push({
                name:
                    model.name,

                time:
                    data.hourly?.time || [],

                rainfall:
                    data.hourly?.precipitation || [],

                probability:
                    data.hourly
                        ?.precipitation_probability || [],

                success:
                    true
            });

        } catch (error) {

            console.error(
                `${model.name} hourly model failed:`,
                error
            );

            results.push({
                name:
                    model.name,

                time: [],

                rainfall: [],

                probability: [],

                success:
                    false
            });
        }
    }

    renderHourlyModelComparison(
        results
    );
}


// =======================================================
// RENDER HOURLY MODEL COMPARISON
// =======================================================

function renderHourlyModelComparison(
    results
) {

    let container =
        document.getElementById(
            "hourlyModelComparison"
        );

    if (!container) {

        container =
            document.createElement(
                "div"
            );

        container.id =
            "hourlyModelComparison";

        container.style.marginTop =
            "18px";

        container.style.padding =
            "18px";

        container.style.borderRadius =
            "16px";

        container.style.background =
            "rgba(14,165,233,0.06)";

        container.style.border =
            "1px solid rgba(14,165,233,0.15)";

        const target =
            document.getElementById(
                "modelConsensus"
            );

        if (target) {

            target.parentNode.insertBefore(
                container,
                target.nextSibling
            );

        } else {

            const main =
                document.querySelector(
                    "main"
                );

            if (main) {
                main.appendChild(
                    container
                );
            }
        }
    }

    const successful =
        results.filter(
            item => item.success
        );

    if (!successful.length) {

        container.innerHTML = `
            <strong>
                📊 Hourly Model Comparison
            </strong>

            <p>
                Model data currently unavailable.
            </p>
        `;

        return;
    }

    const maxHours =
        Math.min(
            24,
            ...successful.map(
                item =>
                    item.time.length
            )
        );

    let rows = "";

    for (
        let i = 0;
        i < maxHours;
        i++
    ) {

        const date =
            new Date(
                successful[0].time[i]
            );

        const time =
            date.toLocaleTimeString(
                "en-IN",
                {
                    hour: "numeric",
                    minute: "2-digit"
                }
            );

        const values =
            successful.map(
                item => {

                    const rain =
                        Number(
                            item.rainfall[i]
                        ) || 0;

                    const probability =
                        Number(
                            item.probability[i]
                        ) || 0;

                    return {
                        rain,
                        probability
                    };
                }
            );

        const rainValues =
            values.map(
                value =>
                    value.rain
            );

        const average =
            rainValues.reduce(
                (sum, value) =>
                    sum + value,
                0
            ) /
            rainValues.length;

        rows += `
            <div style="
                display:grid;
                grid-template-columns:
                    70px repeat(${successful.length}, 1fr) 90px;
                gap:6px;
                padding:7px 0;
                border-bottom:
                    1px solid rgba(100,116,139,0.12);
                font-size:13px;
                align-items:center;
            ">

                <strong>
                    ${time}
                </strong>

                ${values.map(
                    value => `
                        <span>
                            ${value.rain.toFixed(1)}
                            mm
                            <small>
                                (${Math.round(
                                    value.probability
                                )}%)
                            </small>
                        </span>
                    `
                ).join("")}

                <strong>
                    Avg:
                    ${average.toFixed(1)} mm
                </strong>

            </div>
        `;
    }

    container.innerHTML = `

        <div style="
            font-size:18px;
            font-weight:700;
            margin-bottom:12px;
        ">
            📊 Next 24 Hours — Model Comparison
        </div>

        <div style="
            overflow-x:auto;
        ">

            <div style="
                min-width:620px;
            ">

                <div style="
                    display:grid;
                    grid-template-columns:
                        70px repeat(${successful.length}, 1fr) 90px;
                    gap:6px;
                    padding:8px 0;
                    font-size:12px;
                    font-weight:700;
                ">

                    <span>Time</span>

                    ${successful.map(
                        item =>
                            `<span>${item.name}</span>`
                    ).join("")}

                    <span>Average</span>

                </div>

                ${rows}

            </div>

        </div>

        <div style="
            margin-top:10px;
            font-size:12px;
            opacity:0.7;
            line-height:1.5;
        ">
            Values are forecast rainfall in mm.
            Percentage in brackets is precipitation
            probability. Model comparison is not a
            guaranteed accuracy measurement.
        </div>
    `;
}
// =======================================================
// FORECAST ACCURACY ENGINE
// =======================================================

let accuracyRecords = [];


function calculateRainfallAccuracy(
    forecastRain,
    actualRain
) {

    forecastRain =
        Number(forecastRain) || 0;

    actualRain =
        Number(actualRain) || 0;

    const difference =
        Math.abs(
            forecastRain - actualRain
        );

    // When actual rainfall is zero
    if (actualRain === 0) {

        if (forecastRain === 0) {
            return 100;
        }

        return 0;
    }

    const errorPercent =
        (
            difference /
            actualRain
        ) * 100;

    return Math.max(
        0,
        Math.min(
            100,
            100 - errorPercent
        )
    );
}


// =======================================================
// ADD ACCURACY RECORD
// =======================================================

function addAccuracyRecord(
    forecastRain,
    actualRain,
    locationName,
    date
) {

    const accuracy =
        calculateRainfallAccuracy(
            forecastRain,
            actualRain
        );

    accuracyRecords.push({

        location:
            locationName || "Unknown",

        date:
            date || new Date().toISOString(),

        forecast:
            Number(forecastRain) || 0,

        actual:
            Number(actualRain) || 0,

        accuracy:
            Number(
                accuracy.toFixed(1)
            )

    });

    updateAccuracyDisplay();
}


// =======================================================
// CALCULATE OVERALL ACCURACY
// =======================================================

function calculateOverallAccuracy() {

    if (
        !accuracyRecords.length
    ) {
        return null;
    }

    const total =
        accuracyRecords.reduce(
            (
                sum,
                record
            ) =>
                sum + record.accuracy,
            0
        );

    return (
        total /
        accuracyRecords.length
    );
}


// =======================================================
// UPDATE ACCURACY DISPLAY
// =======================================================

function updateAccuracyDisplay() {

    const accuracyElement =
        document.getElementById(
            "accuracy"
        );

    const dataPointsElement =
        document.getElementById(
            "dataPoints"
        );

    const historicalElement =
        document.getElementById(
            "historicalRecords"
        );

    const overallAccuracy =
        calculateOverallAccuracy();

    if (accuracyElement) {

        if (
            overallAccuracy === null
        ) {

            accuracyElement.textContent =
                "--%";

        } else {

            accuracyElement.textContent =
                `${overallAccuracy.toFixed(1)}%`;
        }
    }

    if (dataPointsElement) {

        dataPointsElement.textContent =
            accuracyRecords.length;
    }

    if (historicalElement) {

        historicalElement.textContent =
            accuracyRecords.length;
    }
}


// =======================================================
// SAVE ACCURACY DATA
// =======================================================

function saveAccuracyRecords() {

    try {

        localStorage.setItem(
            "rajasthanRainAccuracy",
            JSON.stringify(
                accuracyRecords
            )
        );

    } catch (error) {

        console.error(
            "Accuracy data save failed:",
            error
        );
    }
}


// =======================================================
// LOAD ACCURACY DATA
// =======================================================

function loadAccuracyRecords() {

    try {

        const saved =
            localStorage.getItem(
                "rajasthanRainAccuracy"
            );

        if (!saved) {
            return;
        }

        const records =
            JSON.parse(saved);

        if (
            Array.isArray(records)
        ) {

            accuracyRecords =
                records;
        }

        updateAccuracyDisplay();

    } catch (error) {

        console.error(
            "Accuracy data load failed:",
            error
        );
    }
}


// =======================================================
// AUTO SAVE WHEN RECORD ADDED
// =======================================================

const originalAddAccuracyRecord =
    addAccuracyRecord;

addAccuracyRecord =
    function (
        forecastRain,
        actualRain,
        locationName,
        date
    ) {

        originalAddAccuracyRecord(
            forecastRain,
            actualRain,
            locationName,
            date
        );

        saveAccuracyRecords();
    };


// =======================================================
// INITIALIZE ACCURACY ENGINE
// =======================================================

loadAccuracyRecords();
updateAccuracyDisplay();
// =======================================================
// ACTUAL OBSERVATION DATA FOUNDATION
// =======================================================

const OBSERVATION_SOURCE = {
    name: "IMD",
    official: true,
    status: "pending_connection"
};


// =======================================================
// ACTUAL RAINFALL HOLDER
// =======================================================

let actualRainfallData = [];


// =======================================================
// ADD ACTUAL OBSERVATION
// =======================================================

function addActualRainfallObservation(
    location,
    rainfall,
    observationTime,
    stationName
) {

    if (!location) {
        return;
    }

    const rain =
        Number(rainfall);

    if (!Number.isFinite(rain)) {
        return;
    }

    actualRainfallData.push({

        location:
            location.name || "Unknown",

        latitude:
            Number(location.latitude),

        longitude:
            Number(location.longitude),

        station:
            stationName || "IMD Observation",

        rainfall:
            rain,

        time:
            observationTime ||
            new Date().toISOString(),

        source:
            OBSERVATION_SOURCE.name
    });

    updateObservationDisplay();
}


// =======================================================
// OBSERVATION COUNT
// =======================================================

function updateObservationDisplay() {

    const dataPoints =
        document.getElementById(
            "dataPoints"
        );

    if (dataPoints) {

        dataPoints.textContent =
            actualRainfallData.length;
    }

}


// =======================================================
// OBSERVATION STATUS
// =======================================================

function showObservationStatus() {

    const accuracyNote =
        document.querySelector(
            ".accuracy-note"
        );

    if (!accuracyNote) {
        return;
    }

    if (
        actualRainfallData.length === 0
    ) {

        accuracyNote.innerHTML = `
            ℹ️ Actual rainfall observations
            are not connected yet.
            Accuracy will be calculated only
            after verified observation data
            becomes available.
        `;

        return;
    }

    accuracyNote.innerHTML = `
        ✅ ${actualRainfallData.length}
        verified observation record(s)
        currently available for comparison.
    `;
}


// =======================================================
// INITIALIZE OBSERVATION SYSTEM
// =======================================================

function initializeObservationSystem() {

    actualRainfallData = [];

    updateObservationDisplay();

    showObservationStatus();
}


// =======================================================
// START OBSERVATION SYSTEM
// =======================================================

initializeObservationSystem();
initialize();
