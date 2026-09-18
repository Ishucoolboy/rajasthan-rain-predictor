/* =========================================================
   RAJASTHAN RAIN PREDICTOR
   COMPLETE APP.JS
   ========================================================= */


/* =========================================================
   API
   ========================================================= */

const WEATHER_API =
    "https://api.open-meteo.com/v1/forecast";

const GEOCODING_API =
    "https://geocoding-api.open-meteo.com/v1/search";

const OSM_GEOCODING_API =
    "https://nominatim.openstreetmap.org/search";

const VILLAGE_DATABASE_URL =
    "./villages.json";


/* =========================================================
   DEFAULT LOCATION
   ========================================================= */

const DEFAULT_LOCATION = {
    name: "Kuchera, Nagaur, Rajasthan",
    latitude: 27.01,
    longitude: 73.97
};


/* =========================================================
   GLOBAL STATE
   ========================================================= */

let VILLAGE_DATABASE = [];
let villageDatabaseLoaded = false;

let currentSelectedLocation = {
    ...DEFAULT_LOCATION
};

let latestWeatherData = null;

let rainMap = null;
let rainMapMarker = null;
let rainMapCircle = null;

let statewideRainMarkers = [];

let accuracyRecords = [];
let actualRainfallData = [];

let weatherLoading = false;
let statewideLoading = false;


/* =========================================================
   KNOWN LOCATIONS / ALIASES
   ========================================================= */

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


/* =========================================================
   DOM ELEMENTS
   ========================================================= */

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


/* =========================================================
   RAJASTHAN MAP
   ========================================================= */

const RAJASTHAN_MAP_CENTER =
    [27.0238, 74.2179];

const RAJASTHAN_MAP_ZOOM =
    6.2;


/* =========================================================
   RAJASTHAN OVERVIEW LOCATIONS
   ========================================================= */

const RAJASTHAN_OVERVIEW_LOCATIONS = [

    {
        name: "Jaipur",
        latitude: 26.9124,
        longitude: 75.7873
    },

    {
        name: "Jodhpur",
        latitude: 26.2389,
        longitude: 73.0243
    },

    {
        name: "Udaipur",
        latitude: 24.5854,
        longitude: 73.7125
    },

    {
        name: "Kota",
        latitude: 25.2138,
        longitude: 75.8648
    },

    {
        name: "Bikaner",
        latitude: 28.0229,
        longitude: 73.3119
    },

    {
        name: "Ajmer",
        latitude: 26.4499,
        longitude: 74.6399
    },

    {
        name: "Alwar",
        latitude: 27.5530,
        longitude: 76.6346
    },

    {
        name: "Bharatpur",
        latitude: 27.2152,
        longitude: 77.5030
    },

    {
        name: "Nagaur",
        latitude: 27.2020,
        longitude: 73.7339
    },

    {
        name: "Barmer",
        latitude: 25.7530,
        longitude: 71.3950
    },

    {
        name: "Chittorgarh",
        latitude: 24.8887,
        longitude: 74.6269
    },

    {
        name: "Sri Ganganagar",
        latitude: 29.9038,
        longitude: 73.8772
    }

];


/* =========================================================
   STATUS
   ========================================================= */

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


/* =========================================================
   HTML ESCAPE
   ========================================================= */

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


/* =========================================================
   SEARCH NORMALIZATION
   ========================================================= */

function normalizeSearchText(text) {

    return String(text || "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");

}


/* =========================================================
   LEVENSHTEIN
   ========================================================= */

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


/* =========================================================
   VILLAGE DATABASE FIELD
   ========================================================= */

function getVillageField(
    village,
    possibleNames
) {

    for (const field of possibleNames) {

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


/* =========================================================
   LOAD VILLAGE DATABASE
   ========================================================= */

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


/* =========================================================
   CREATE VILLAGE LOCATION
   ========================================================= */

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


/* =========================================================
   SEARCH VILLAGE DATABASE
   ========================================================= */

function searchVillageDatabase(query) {

    if (
        !villageDatabaseLoaded ||
        !Array.isArray(VILLAGE_DATABASE) ||
        !VILLAGE_DATABASE.length
    ) {

        return [];

    }

    const normalizedQuery =
        normalizeSearchText(query);

    const exactMatches = [];
    const containsMatches = [];
    const fuzzyMatches = [];

    for (
        const village
        of VILLAGE_DATABASE
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


/* =========================================================
   OPEN METEO LOCATION
   ========================================================= */

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


/* =========================================================
   RAJASTHAN CHECK
   ========================================================= */

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


/* =========================================================
   OPEN METEO SEARCH
   ========================================================= */

async function searchOpenMeteo(query) {

    const params =
        new URLSearchParams({

            name: query,

            count: "10",

            language: "en",

            format: "json"

        });

    const response =
        await fetch(
            `${GEOCODING_API}?${params}`
        );

    if (!response.ok) {
        throw new Error(
            "Geocoding failed."
        );
    }

    const data =
        await response.json();

    const results =
        Array.isArray(data.results)
            ? data.results
            : [];

    return results
        .filter(isRajasthan)
        .map(
            createOpenMeteoLocation
        );

}


/* =========================================================
   OSM SEARCH
   ========================================================= */

async function searchOSM(query) {

    const params =
        new URLSearchParams({

            q:
                `${query}, Rajasthan, India`,

            format: "json",

            addressdetails: "1",

            limit: "10",

            countrycodes: "in"

        });

    const response =
        await fetch(
            `${OSM_GEOCODING_API}?${params}`,
            {
                headers: {
                    "Accept":
                        "application/json"
                }
            }
        );

    if (!response.ok) {
        throw new Error(
            "OSM search failed."
        );
    }

    const data =
        await response.json();

    return data
        .filter(item => {

            const address =
                item.address || {};

            const state =
                String(
                    address.state || ""
                ).toLowerCase();

            return (
                state.includes(
                    "rajasthan"
                ) ||
                state.includes(
                    "राजस्थान"
                )
            );

        })
        .map(item => ({

            name:
                item.display_name,

            latitude:
                Number(item.lat),

            longitude:
                Number(item.lon)

        }));

}


/* =========================================================
   DISPLAY LOCATION
   ========================================================= */

function displayLocation(location) {

    if (locationName) {

        locationName.textContent =
            location.name;

    }

    if (locationCoordinates) {

        locationCoordinates.textContent =
            `Latitude: ${Number(location.latitude).toFixed(4)}° | Longitude: ${Number(location.longitude).toFixed(4)}°`;

    }

    if (locationInput) {

        locationInput.value =
            location.name;

    }

}


/* =========================================================
   SELECT LOCATION
   ========================================================= */

function setCurrentSelectedLocation(
    location
) {

    if (!location) {
        return;
    }

    currentSelectedLocation = {

        name:
            location.name,

        latitude:
            Number(location.latitude),

        longitude:
            Number(location.longitude)

    };

}


/* =========================================================
   FIND CURRENT HOUR
   ========================================================= */

function findCurrentHourIndex(
    times
) {

    if (
        !Array.isArray(times) ||
        !times.length
    ) {

        return 0;

    }

    const now =
        new Date();

    let bestIndex = 0;
    let smallestDifference =
        Infinity;

    times.forEach(
        (time, index) => {

            const date =
                new Date(time);

            const difference =
                Math.abs(
                    date.getTime() -
                    now.getTime()
                );

            if (
                difference <
                smallestDifference
            ) {

                smallestDifference =
                    difference;

                bestIndex =
                    index;

            }

        }
    );

    return bestIndex;

}


/* =========================================================
   THUNDERSTORM
   ========================================================= */

function isThunderstorm(code) {

    const value =
        Number(code);

    return (
        value === 95 ||
        value === 96 ||
        value === 99
    );

}


/* =========================================================
   WEATHER DESCRIPTION
   ========================================================= */

function getWeatherDescription(code) {

    if (
        code === undefined ||
        code === null
    ) {

        return "Unknown";

    }

    if (
        isThunderstorm(code)
    ) {

        return "Thunderstorm possible";

    }

    if (
        code >= 61 &&
        code <= 67
    ) {

        return "Rain";

    }

    if (
        code >= 80 &&
        code <= 82
    ) {

        return "Rain showers";

    }

    if (
        code >= 51 &&
        code <= 57
    ) {

        return "Drizzle";

    }

    if (code === 0) {

        return "Clear sky";

    }

    if (
        code === 1 ||
        code === 2
    ) {

        return "Partly cloudy";

    }

    if (code === 3) {

        return "Overcast";

    }

    return "Cloudy / variable";

}


/* =========================================================
   RAIN MAP COLOR
   ========================================================= */

function getRainMapColor(rain) {

    const value =
        Number(rain) || 0;

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


/* =========================================================
   INITIALIZE MAP
   ========================================================= */

function initializeRainMap() {

    const mapElement =
        document.getElementById(
            "rainMap"
        );

    if (!mapElement) {
        return;
    }

    if (
        typeof L === "undefined"
    ) {

        mapElement.innerHTML = `
            <div class="map-placeholder">
                <div>🗺️</div>
                <p>Map library could not be loaded.</p>
            </div>
        `;

        return;

    }

    if (rainMap) {
        return;
    }

    mapElement.innerHTML = "";

    mapElement.style.width =
        "100%";

    mapElement.style.height =
        "480px";

    mapElement.style.minHeight =
        "360px";

    mapElement.style.borderRadius =
        "16px";

    mapElement.style.overflow =
        "hidden";

    rainMap =
        L.map(
            mapElement,
            {
                center:
                    RAJASTHAN_MAP_CENTER,

                zoom:
                    RAJASTHAN_MAP_ZOOM,

                minZoom: 5,

                maxZoom: 14,

                scrollWheelZoom: true
            }
        );

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            maxZoom: 19,

            attribution:
                "&copy; OpenStreetMap contributors"
        }
    ).addTo(rainMap);


    const legend =
        L.control({
            position:
                "bottomright"
        });

    legend.onAdd =
        function () {

            const div =
                L.DomUtil.create(
                    "div",
                    "rain-map-legend"
                );

            div.style.background =
                "rgba(255,255,255,0.94)";

            div.style.padding =
                "9px 11px";

            div.style.borderRadius =
                "10px";

            div.style.boxShadow =
                "0 2px 10px rgba(0,0,0,0.18)";

            div.style.fontSize =
                "11px";

            div.style.lineHeight =
                "1.6";

            div.innerHTML = `

                <strong>Rainfall</strong><br>

                <span style="color:#64748b">
                    ●
                </span>
                0 mm<br>

                <span style="color:#f59e0b">
                    ●
                </span>
                &lt; 1 mm<br>

                <span style="color:#16a34a">
                    ●
                </span>
                1–4.9 mm<br>

                <span style="color:#0891b2">
                    ●
                </span>
                5–9.9 mm<br>

                <span style="color:#2563eb">
                    ●
                </span>
                10–19.9 mm<br>

                <span style="color:#7c3aed">
                    ●
                </span>
                20+ mm

            `;

            return div;

        };

    legend.addTo(rainMap);


    const info =
        document.getElementById(
            "mapInfo"
        );

    if (info) {

        info.innerHTML = `

            <strong>
                🌧️ Live Rainfall Location Map
            </strong>

            <p>
                Search a Rajasthan location above.
                The selected location and statewide
                rainfall overview are shown on the map.
            </p>

        `;

    }

}


/* =========================================================
   UPDATE SELECTED LOCATION MAP
   ========================================================= */

function updateRainMap(
    location,
    weatherData
) {

    if (!location) {
        return;
    }

    if (!rainMap) {
        initializeRainMap();
    }

    if (
        !rainMap ||
        typeof L === "undefined"
    ) {

        return;

    }

    const hourly =
        weatherData?.hourly;

    const currentIndex =
        hourly?.time?.length
            ? findCurrentHourIndex(
                hourly.time
            )
            : 0;

    const rain =
        Number(
            hourly?.precipitation?.[
                currentIndex
            ] ?? 0
        ) || 0;

    const probability =
        Number(
            hourly
                ?.precipitation_probability?.[
                    currentIndex
                ] ?? 0
        ) || 0;

    const temp =
        hourly
            ?.temperature_2m?.[
                currentIndex
            ];

    const code =
        hourly
            ?.weather_code?.[
                currentIndex
            ];

    const latitude =
        Number(
            location.latitude
        );

    const longitude =
        Number(
            location.longitude
        );

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
    ) {

        return;

    }

    const color =
        getRainMapColor(rain);


    if (rainMapMarker) {

        rainMap.removeLayer(
            rainMapMarker
        );

    }

    if (rainMapCircle) {

        rainMap.removeLayer(
            rainMapCircle
        );

    }


    rainMapMarker =
        L.marker(
            [
                latitude,
                longitude
            ]
        ).addTo(rainMap);


    rainMapMarker.bindPopup(`

        <div style="min-width:190px;">

            <strong>
                📍
                ${escapeHtml(location.name)}
            </strong>

            <hr style="
                border:0;
                border-top:1px solid #ddd;
                margin:7px 0;
            ">

            <div>
                🌧️ Current rain:
                <strong>
                    ${rain.toFixed(1)} mm
                </strong>
            </div>

            <div>
                💧 Rain probability:
                <strong>
                    ${Math.round(probability)}%
                </strong>
            </div>

            <div>
                🌡️ Temperature:
                <strong>
                    ${
                        temp !== undefined
                            ? `${Math.round(temp)} °C`
                            : "--"
                    }
                </strong>
            </div>

            <div>
                🌦️ Condition:
                <strong>
                    ${getWeatherDescription(code)}
                </strong>
            </div>

        </div>

    `);


    rainMapCircle =
        L.circle(
            [
                latitude,
                longitude
            ],
            {

                radius:
                    Math.max(
                        5000,
                        Math.min(
                            25000,
                            5000 +
                            rain * 500
                        )
                    ),

                color,

                fillColor:
                    color,

                fillOpacity:
                    0.22,

                weight: 2

            }
        ).addTo(rainMap);


    rainMapCircle.bindTooltip(
        `${rain.toFixed(1)} mm | ${Math.round(probability)}% rain`
    );


    rainMap.setView(
        [
            latitude,
            longitude
        ],
        Math.max(
            8,
            rainMap.getZoom()
        )
    );


    setTimeout(
        () => {

            if (rainMap) {

                rainMap.invalidateSize();

            }

        },
        100
    );

}


/* =========================================================
   CURRENT WEATHER
   ========================================================= */

function updateCurrentWeather(
    data
) {

    const hourly =
        data?.hourly;

    if (!hourly) {
        return;
    }

    const index =
        findCurrentHourIndex(
            hourly.time
        );

    const rain =
        Number(
            hourly.precipitation?.[
                index
            ] ?? 0
        ) || 0;

    const probability =
        Number(
            hourly
                .precipitation_probability?.[
                    index
                ] ?? 0
        ) || 0;

    const temp =
        hourly.temperature_2m?.[
            index
        ];

    const hum =
        hourly.relative_humidity_2m?.[
            index
        ];

    const windValue =
        hourly.wind_speed_10m?.[
            index
        ];

    const code =
        hourly.weather_code?.[
            index
        ];


    if (rainProbability) {

        rainProbability.textContent =
            `${Math.round(probability)}%`;

    }

    if (rainAmount) {

        rainAmount.textContent =
            `${rain.toFixed(1)} mm`;

    }

    if (temperature) {

        temperature.textContent =
            temp !== undefined
                ? `${Math.round(temp)}°C`
                : "--";

    }

    if (humidity) {

        humidity.textContent =
            hum !== undefined
                ? `${Math.round(hum)}%`
                : "--";

    }

    if (wind) {

        wind.textContent =
            windValue !== undefined
                ? `${Math.round(windValue)} km/h`
                : "--";

    }

    if (thunderstorm) {

        thunderstorm.textContent =
            isThunderstorm(code)
                ? "Possible"
                : "Low / None";

    }

}


/* =========================================================
   HOURLY FORECAST
   ========================================================= */

function updateHourlyForecast(
    data
) {

    if (!hourlyForecast) {
        return;
    }

    const hourly =
        data?.hourly;

    if (
        !hourly ||
        !Array.isArray(
            hourly.time
        )
    ) {

        return;

    }

    const start =
        findCurrentHourIndex(
            hourly.time
        );

    const end =
        Math.min(
            start + 24,
            hourly.time.length
        );

    let html = "";

    for (
        let i = start;
        i < end;
        i++
    ) {

        const date =
            new Date(
                hourly.time[i]
            );

        const time =
            date.toLocaleTimeString(
                "en-IN",
                {
                    hour:
                        "numeric",

                    minute:
                        "2-digit"
                }
            );

        const rain =
            Number(
                hourly
                    .precipitation?.[
                        i
                    ] ?? 0
            ) || 0;

        const probability =
            Number(
                hourly
                    .precipitation_probability?.[
                        i
                    ] ?? 0
            ) || 0;

        const temp =
            hourly
                .temperature_2m?.[
                    i
                ];

        const code =
            hourly
                .weather_code?.[
                    i
                ];


        html += `

            <div class="hourly-item">

                <div>
                    <strong>
                        ${time}
                    </strong>
                </div>

                <div>
                    🌧️
                    ${rain.toFixed(1)} mm
                </div>

                <div>
                    💧
                    ${Math.round(probability)}%
                </div>

                <div>
                    🌡️
                    ${
                        temp !== undefined
                            ? `${Math.round(temp)}°C`
                            : "--"
                    }
                </div>

                <div>
                    ${getWeatherDescription(code)}
                </div>

            </div>

        `;

    }

    hourlyForecast.innerHTML =
        html;

}


/* =========================================================
   DAILY FORECAST
   ========================================================= */

function updateDailyForecast(
    data
) {

    if (!dailyForecast) {
        return;
    }

    const daily =
        data?.daily;

    if (
        !daily ||
        !Array.isArray(
            daily.time
        )
    ) {

        return;

    }

    let html = "";

    const count =
        Math.min(
            7,
            daily.time.length
        );

    for (
        let i = 0;
        i < count;
        i++
    ) {

        const date =
            new Date(
                daily.time[i]
            );

        const day =
            date.toLocaleDateString(
                "en-IN",
                {
                    weekday:
                        "short",

                    day:
                        "numeric",

                    month:
                        "short"
                }
            );

        const rain =
            Number(
                daily
                    .precipitation_sum?.[
                        i
                    ] ?? 0
            ) || 0;

        const probability =
            Number(
                daily
                    .precipitation_probability_max?.[
                        i
                    ] ?? 0
            ) || 0;

        const max =
            daily
                .temperature_2m_max?.[
                    i
                ];

        const min =
            daily
                .temperature_2m_min?.[
                    i
                ];


        html += `

            <div class="daily-item">

                <strong>
                    ${day}
                </strong>

                <div>
                    🌧️
                    ${rain.toFixed(1)} mm
                </div>

                <div>
                    💧
                    ${Math.round(probability)}%
                </div>

                <div>
                    🌡️
                    ${
                        min !== undefined &&
                        max !== undefined
                            ? `${Math.round(min)}° / ${Math.round(max)}°`
                            : "--"
                    }
                </div>

            </div>

        `;

    }

    dailyForecast.innerHTML =
        html;

}


/* =========================================================
   FETCH MAIN WEATHER
   ========================================================= */

async function fetchWeather(
    location
) {

    const params =
        new URLSearchParams({

            latitude:
                location.latitude,

            longitude:
                location.longitude,

            hourly:
                [
                    "temperature_2m",
                    "relative_humidity_2m",
                    "precipitation",
                    "precipitation_probability",
                    "weather_code",
                    "wind_speed_10m"
                ].join(","),

            daily:
                [
                    "precipitation_sum",
                    "precipitation_probability_max",
                    "temperature_2m_max",
                    "temperature_2m_min",
                    "weather_code"
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
            "Weather API request failed."
        );

    }

    return await response.json();

}


/* =========================================================
   LOAD WEATHER
   ========================================================= */

async function loadWeather(
    location
) {

    if (!location) {
        return;
    }

    if (weatherLoading) {
        return;
    }

    weatherLoading = true;

    try {

        setCurrentSelectedLocation(
            location
        );

        displayLocation(
            location
        );

        setStatus(
            "Updating weather data..."
        );


        const data =
            await fetchWeather(
                location
            );


        latestWeatherData =
            data;


        updateCurrentWeather(
            data
        );

        updateHourlyForecast(
            data
        );

        updateDailyForecast(
            data
        );

        updateRainMap(
            location,
            data
        );

        renderSmartRainSummary(
            data
        );

        renderNextRainAlert(
            data
        );

        await updateModelStatus(
            location
        );

        await loadHourlyModelComparison(
            location
        );

        await loadStatewideRainfall();


        setStatus(
            "Weather data updated"
        );

    } catch (error) {

        console.error(
            "Weather loading failed:",
            error
        );

        setStatus(
            "Weather data unavailable",
            false
        );

    } finally {

        weatherLoading =
            false;

    }

}


/* =========================================================
   SEARCH LOCATION
   ========================================================= */

async function searchLocation() {

    const query =
        normalizeSearchText(
            locationInput?.value
        );

    if (!query) {

        setStatus(
            "Please enter a village, town or city."
        );

        return;

    }

    try {

        setStatus(
            "Searching location..."
        );


        /* ---------- KNOWN ALIAS ---------- */

        if (
            KNOWN_LOCATIONS[query]
        ) {

            await loadWeather(
                KNOWN_LOCATIONS[query]
            );

            return;

        }


        /* ---------- VILLAGE DATABASE ---------- */

        const localMatches =
            searchVillageDatabase(
                query
            );


        if (localMatches.length) {

            const location =
                createVillageLocation(
                    localMatches[0]
                );


            if (
                Number.isFinite(
                    location.latitude
                ) &&
                Number.isFinite(
                    location.longitude
                )
            ) {

                await loadWeather(
                    location
                );

                return;

            }

        }


        /* ---------- OPEN METEO ---------- */

        try {

            const results =
                await searchOpenMeteo(
                    query
                );

            if (results.length) {

                await loadWeather(
                    results[0]
                );

                return;

            }

        } catch (error) {

            console.warn(
                "Open-Meteo search failed:",
                error
            );

        }


        /* ---------- OSM FALLBACK ---------- */

        try {

            const results =
                await searchOSM(
                    query
                );

            if (results.length) {

                await loadWeather(
                    results[0]
                );

                return;

            }

        } catch (error) {

            console.warn(
                "OSM search failed:",
                error
            );

        }


        setStatus(
            "Location not found in Rajasthan.",
            false
        );

    } catch (error) {

        console.error(
            "Location search failed:",
            error
        );

        setStatus(
            "Search failed. Please try again.",
            false
        );

    }

}


/* =========================================================
   MODEL STATUS
   ========================================================= */

async function updateModelStatus(
    location
) {

    const models = [

        {
            name:
                "ECMWF",

            id:
                "ecmwf_ifs025",

            element:
                ecmwfRain
        },

        {
            name:
                "GFS",

            id:
                "gfs_seamless",

            element:
                gfsRain
        },

        {
            name:
                "ICON",

            id:
                "icon_seamless",

            element:
                iconRain
        }

    ];


    for (
        const model
        of models
    ) {

        if (model.element) {

            model.element.textContent =
                "Loading...";

        }

        try {

            const params =
                new URLSearchParams({

                    latitude:
                        location.latitude,

                    longitude:
                        location.longitude,

                    daily:
                        "precipitation_sum",

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
                    `${model.name} request failed`
                );
            }


            const data =
                await response.json();


            const values =
                data
                    ?.daily
                    ?.precipitation_sum ||
                [];


            const total =
                values.reduce(
                    (
                        sum,
                        value
                    ) =>
                        sum +
                        (
                            Number(value) ||
                            0
                        ),
                    0
                );


            if (model.element) {

                model.element.textContent =
                    `${total.toFixed(1)} mm`;

            }

        } catch (error) {

            console.error(
                `${model.name} failed:`,
                error
            );

            if (model.element) {

                model.element.textContent =
                    "--";

            }

        }

    }


    renderModelConsensus(
        location
    );

}


/* =========================================================
   MODEL CONSENSUS
   ========================================================= */

async function renderModelConsensus(
    location
) {

    const container =
        document.getElementById(
            "modelConsensus"
        );

    if (!container) {
        return;
    }


    const models = [

        {
            name:
                "ECMWF",

            id:
                "ecmwf_ifs025"
        },

        {
            name:
                "GFS",

            id:
                "gfs_seamless"
        },

        {
            name:
                "ICON",

            id:
                "icon_seamless"
        }

    ];


    const values = [];


    for (
        const model
        of models
    ) {

        try {

            const params =
                new URLSearchParams({

                    latitude:
                        location.latitude,

                    longitude:
                        location.longitude,

                    daily:
                        "precipitation_sum",

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
                continue;
            }


            const data =
                await response.json();


            const rain =
                (
                    data
                        ?.daily
                        ?.precipitation_sum ||
                    []
                )
                    .reduce(
                        (
                            sum,
                            value
                        ) =>
                            sum +
                            (
                                Number(value) ||
                                0
                            ),
                        0
                    );


            values.push({
                name:
                    model.name,

                rain

            });

        } catch (error) {

            console.warn(
                `${model.name} consensus failed`,
                error
            );

        }

    }


    if (!values.length) {

        container.innerHTML = `
            <div>
                Model consensus unavailable.
            </div>
        `;

        return;

    }


    const rains =
        values.map(
            item =>
                item.rain
        );


    const average =
        rains.reduce(
            (
                sum,
                value
            ) =>
                sum + value,
            0
        ) /
        rains.length;


    const minimum =
        Math.min(
            ...rains
        );

    const maximum =
        Math.max(
            ...rains
        );


    const spread =
        maximum -
        minimum;


    let agreement =
        "Low agreement";


    if (spread <= 10) {

        agreement =
            "High agreement";

    } else if (
        spread <= 30
    ) {

        agreement =
            "Moderate agreement";

    }


    container.innerHTML = `

        <div style="
            font-size:18px;
            font-weight:700;
            margin-bottom:10px;
        ">
            🤖 Model Consensus
        </div>

        <div>
            7-day average rainfall:
            <strong>
                ${average.toFixed(1)} mm
            </strong>
        </div>

        <div>
            Model range:
            <strong>
                ${minimum.toFixed(1)}
                –
                ${maximum.toFixed(1)} mm
            </strong>
        </div>

        <div>
            Agreement:
            <strong>
                ${agreement}
            </strong>
        </div>

        <div style="
            margin-top:10px;
            font-size:12px;
            opacity:0.7;
        ">
            Model consensus is a comparison
            between forecasts. It is not a
            guaranteed accuracy percentage.
        </div>

    `;

}


/* =========================================================
   RAIN INTENSITY
   ========================================================= */

function getRainIntensity(
    rain
) {

    rain =
        Number(rain) || 0;

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


/* =========================================================
   RAIN RISK
   ========================================================= */

function getRainRisk(
    probability,
    rainfall
) {

    probability =
        Number(probability) || 0;

    rainfall =
        Number(rainfall) || 0;


    if (
        rainfall >= 50 ||
        probability >= 90
    ) {

        return "High";

    }

    if (
        rainfall >= 10 ||
        probability >= 60
    ) {

        return "Moderate";

    }

    if (
        rainfall > 0 ||
        probability >= 30
    ) {

        return "Low";

    }

    return "Minimal";

}


/* =========================================================
   FIND NEXT RAIN
   ========================================================= */

function findNextRain(
    hourlyData
) {

    if (
        !hourlyData ||
        !Array.isArray(
            hourlyData.time
        )
    ) {

        return null;

    }


    const rain =
        hourlyData.precipitation ||
        [];

    const probability =
        hourlyData
            .precipitation_probability ||
        [];


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
            Number(
                rain[i]
            ) || 0;

        const rainProbability =
            Number(
                probability[i]
            ) || 0;


        if (
            rainfall >= 0.1 ||
            rainProbability >= 50
        ) {

            return {

                time:
                    hourlyData.time[i],

                rainfall,

                probability:
                    rainProbability,

                index:
                    i

            };

        }

    }


    return null;

}


/* =========================================================
   SMART RAIN SUMMARY
   ========================================================= */

function renderSmartRainSummary(
    data
) {

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
        findNextRain(
            hourly
        );


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
                weekday:
                    "short",

                day:
                    "numeric",

                month:
                    "short",

                hour:
                    "numeric",

                minute:
                    "2-digit"
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
                🕒
                <strong>
                    Next Rain:
                </strong>

                ${escapeHtml(
                    formattedTime
                )}
            </div>

            <div>
                💧
                <strong>
                    Probability:
                </strong>

                ${Math.round(
                    nextRain.probability
                )}%
            </div>

            <div>
                📏
                <strong>
                    Expected Rain:
                </strong>

                ${nextRain.rainfall.toFixed(1)}
                mm
            </div>

            <div>
                🌦️
                <strong>
                    Intensity:
                </strong>

                ${intensity}
            </div>

            <div>
                ⚠️
                <strong>
                    Risk:
                </strong>

                ${risk}
            </div>

        </div>

        <div style="
            margin-top:10px;
            font-size:12px;
            opacity:0.7;
            line-height:1.5;
        ">
            Forecast signal only.
            It is not a guaranteed prediction.
        </div>

    `;

}


/* =========================================================
   NEXT RAIN ALERT
   ========================================================= */

function renderNextRainAlert(
    data
) {

    const hourly =
        data?.hourly;

    if (!hourly) {
        return;
    }


    let alert =
        document.getElementById(
            "nextRainAlert"
        );


    if (!alert) {

        alert =
            document.createElement(
                "div"
            );

        alert.id =
            "nextRainAlert";

        alert.style.marginTop =
            "15px";

        alert.style.padding =
            "15px";

        alert.style.borderRadius =
            "14px";

        alert.style.background =
            "rgba(59,130,246,0.08)";

        alert.style.border =
            "1px solid rgba(59,130,246,0.18)";


        const summary =
            document.getElementById(
                "smartRainSummary"
            );


        if (summary) {

            summary.appendChild(
                alert
            );

        } else {

            const main =
                document.querySelector(
                    "main"
                );

            if (main) {
                main.appendChild(
                    alert
                );
            }

        }

    }


    const nextRain =
        findNextRain(
            hourly
        );


    if (!nextRain) {

        alert.innerHTML = `
            🌤️
            No rain signal found
            in the available hourly forecast.
        `;

        return;

    }


    const now =
        new Date();


    const rainTime =
        new Date(
            nextRain.time
        );


    const difference =
        Math.max(
            0,
            rainTime.getTime() -
            now.getTime()
        );


    const totalMinutes =
        Math.floor(
            difference /
            60000
        );


    const hours =
        Math.floor(
            totalMinutes /
            60
        );


    const minutes =
        totalMinutes %
        60;


    const countdown =
        hours > 0
            ? `${hours}h ${minutes}m`
            : `${minutes}m`;


    alert.innerHTML = `

        <strong>
            ⏱️ Next Rain Alert
        </strong>

        <div style="
            margin-top:6px;
        ">

            Expected around:
            <strong>
                ${rainTime.toLocaleTimeString(
                    "en-IN",
                    {
                        hour:
                            "numeric",

                        minute:
                            "2-digit"
                    }
                )}
            </strong>

        </div>

        <div style="
            margin-top:4px;
        ">

            Countdown:
            <strong>
                ${countdown}
            </strong>

        </div>

        <div style="
            margin-top:4px;
        ">

            Probability:
            <strong>
                ${Math.round(
                    nextRain.probability
                )}%
            </strong>

            |
            Rain:
            <strong>
                ${nextRain.rainfall.toFixed(1)}
                mm
            </strong>

        </div>

    `;

}


/* =========================================================
   HOURLY MODEL COMPARISON
   ========================================================= */

async function loadHourlyModelComparison(
    location
) {

    if (!location) {
        return;
    }


    const models = [

        {
            name:
                "ECMWF",

            id:
                "ecmwf_ifs025"
        },

        {
            name:
                "GFS",

            id:
                "gfs_seamless"
        },

        {
            name:
                "ICON",

            id:
                "icon_seamless"
        }

    ];


    const results = [];


    for (
        const model
        of models
    ) {

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
                    data
                        ?.hourly
                        ?.time ||
                    [],

                rainfall:
                    data
                        ?.hourly
                        ?.precipitation ||
                    [],

                probability:
                    data
                        ?.hourly
                        ?.precipitation_probability ||
                    [],

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

                time:
                    [],

                rainfall:
                    [],

                probability:
                    [],

                success:
                    false

            });

        }

    }


    renderHourlyModelComparison(
        results
    );

}


/* =========================================================
   RENDER HOURLY MODEL COMPARISON
   ========================================================= */

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
            item =>
                item.success
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
                    hour:
                        "numeric",

                    minute:
                        "2-digit"
                }
            );


        const values =
            successful.map(
                item => ({

                    rain:
                        Number(
                            item.rainfall[i]
                        ) || 0,

                    probability:
                        Number(
                            item.probability[i]
                        ) || 0

                })
            );


        const rainValues =
            values.map(
                value =>
                    value.rain
            );


        const average =
            rainValues.reduce(
                (
                    sum,
                    value
                ) =>
                    sum + value,
                0
            ) /
            rainValues.length;


        rows += `

            <div style="
                display:grid;
                grid-template-columns:
                    70px repeat(${successful.length},1fr) 90px;
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
                                (
                                ${Math.round(
                                    value.probability
                                )}%
                                )
                            </small>

                        </span>

                    `
                ).join("")}

                <strong>
                    Avg:
                    ${average.toFixed(1)}
                    mm
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

            📊 Next 24 Hours —
            Model Comparison

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
                        70px repeat(${successful.length},1fr) 90px;
                    gap:6px;
                    padding:8px 0;
                    font-size:12px;
                    font-weight:700;
                ">

                    <span>
                        Time
                    </span>

                    ${successful.map(
                        item =>
                            `<span>${item.name}</span>`
                    ).join("")}

                    <span>
                        Average
                    </span>

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
            probability.

        </div>

    `;

}


/* =========================================================
   STATEWIDE RAINFALL
   ========================================================= */

async function loadStatewideRainfall() {

    if (
        typeof L === "undefined" ||
        !rainMap
    ) {

        return;

    }

    if (statewideLoading) {
        return;
    }

    statewideLoading = true;


    try {

        clearStatewideRainfallMarkers();


        const requests =
            RAJASTHAN_OVERVIEW_LOCATIONS.map(
                async location => {

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
                                    "1",

                                timezone:
                                    "auto"

                            });


                        const response =
                            await fetch(
                                `${WEATHER_API}?${params}`
                            );


                        if (!response.ok) {
                            return null;
                        }


                        const data =
                            await response.json();


                        const hourly =
                            data?.hourly;


                        if (
                            !hourly ||
                            !hourly.time
                        ) {

                            return null;

                        }


                        const index =
                            findCurrentHourIndex(
                                hourly.time
                            );


                        const rainfall =
                            Number(
                                hourly
                                    .precipitation?.[
                                        index
                                    ]
                            ) || 0;


                        const probability =
                            Number(
                                hourly
                                    .precipitation_probability?.[
                                        index
                                    ]
                            ) || 0;


                        return {

                            location,

                            rainfall,

                            probability

                        };


                    } catch (error) {

                        console.error(
                            `Statewide rainfall failed for ${location.name}:`,
                            error
                        );

                        return null;

                    }

                }
            );


        const results =
            await Promise.all(
                requests
            );


        results
            .filter(Boolean)
            .forEach(
                result => {

                    const color =
                        getRainMapColor(
                            result.rainfall
                        );


                    const marker =
                        L.circleMarker(
                            [
                                result.location.latitude,
                                result.location.longitude
                            ],
                            {

                                radius:
                                    8,

                                color,

                                fillColor:
                                    color,

                                fillOpacity:
                                    0.75,

                                weight:
                                    2

                            }
                        ).addTo(
                            rainMap
                        );


                    marker.bindPopup(`

                        <div style="
                            min-width:170px;
                        ">

                            <strong>
                                📍
                                ${escapeHtml(
                                    result.location.name
                                )}
                            </strong>

                            <hr style="
                                border:0;
                                border-top:
                                    1px solid #ddd;
                                margin:7px 0;
                            ">

                            <div>
                                🌧️ Rain:
                                <strong>
                                    ${result.rainfall.toFixed(1)}
                                    mm
                                </strong>
                            </div>

                            <div>
                                💧 Probability:
                                <strong>
                                    ${Math.round(
                                        result.probability
                                    )}%
                                </strong>
                            </div>

                        </div>

                    `);


                    statewideRainMarkers.push(
                        marker
                    );

                }
            );


    } finally {

        statewideLoading =
            false;

    }

}


/* =========================================================
   CLEAR STATEWIDE MARKERS
   ========================================================= */

function clearStatewideRainfallMarkers() {

    if (!rainMap) {
        return;
    }


    statewideRainMarkers.forEach(
        marker => {

            try {

                rainMap.removeLayer(
                    marker
                );

            } catch (error) {}

        }
    );


    statewideRainMarkers = [];

}


/* =========================================================
   ACCURACY ENGINE
   ========================================================= */

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
            forecastRain -
            actualRain
        );


    if (
        actualRain === 0
    ) {

        return (
            forecastRain === 0
                ? 100
                : 0
        );

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
            100 -
            errorPercent
        )
    );

}


/* =========================================================
   ADD ACCURACY RECORD
   ========================================================= */

function addAccuracyRecord(
    forecastRain,
    actualRain,
    locationNameValue,
    date
) {

    const accuracy =
        calculateRainfallAccuracy(
            forecastRain,
            actualRain
        );


    accuracyRecords.push({

        location:
            locationNameValue ||
            "Unknown",

        date:
            date ||
            new Date().toISOString(),

        forecast:
            Number(
                forecastRain
            ) || 0,

        actual:
            Number(
                actualRain
            ) || 0,

        accuracy:
            Number(
                accuracy.toFixed(1)
            )

    });


    saveAccuracyRecords();
    updateAccuracyDisplay();

}


/* =========================================================
   OVERALL ACCURACY
   ========================================================= */

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
                sum +
                record.accuracy,
            0
        );


    return (
        total /
        accuracyRecords.length
    );

}


/* =========================================================
   ACCURACY DISPLAY
   ========================================================= */

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

        accuracyElement.textContent =
            overallAccuracy === null
                ? "--%"
                : `${overallAccuracy.toFixed(1)}%`;

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


/* =========================================================
   SAVE ACCURACY
   ========================================================= */

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
            "Accuracy save failed:",
            error
        );

    }

}


/* =========================================================
   LOAD ACCURACY
   ========================================================= */

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
            JSON.parse(
                saved
            );


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


/* =========================================================
   ACTUAL OBSERVATION FOUNDATION
   ========================================================= */

const OBSERVATION_SOURCE = {

    name:
        "IMD",

    official:
        true,

    status:
        "pending_connection"

};


/* =========================================================
   ADD ACTUAL OBSERVATION
   ========================================================= */

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
        Number(
            rainfall
        );


    if (
        !Number.isFinite(rain)
    ) {

        return;

    }


    actualRainfallData.push({

        location:
            location.name ||
            "Unknown",

        latitude:
            Number(
                location.latitude
            ),

        longitude:
            Number(
                location.longitude
            ),

        station:
            stationName ||
            "IMD Observation",

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


/* =========================================================
   OBSERVATION DISPLAY
   ========================================================= */

function updateObservationDisplay() {

    const dataPoints =
        document.getElementById(
            "dataPoints"
        );


    if (dataPoints) {

        dataPoints.textContent =
            actualRainfallData.length;

    }


    showObservationStatus();

}


/* =========================================================
   OBSERVATION STATUS
   ========================================================= */

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

        ✅
        ${actualRainfallData.length}
        verified observation record(s)
        currently available for comparison.

    `;

}


/* =========================================================
   AUTO REFRESH
   ========================================================= */

async function refreshCurrentWeather() {

    if (
        !currentSelectedLocation
    ) {

        return;

    }


    console.log(
        "Refreshing weather data..."
    );


    await loadWeather(
        currentSelectedLocation
    );

}


/* =========================================================
   EVENT LISTENERS
   ========================================================= */

if (searchButton) {

    searchButton.addEventListener(
        "click",
        searchLocation
    );

}


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


/* =========================================================
   AUTO REFRESH EVERY 30 MINUTES
   ========================================================= */

setInterval(
    refreshCurrentWeather,
    30 * 60 * 1000
);


/* =========================================================
   COUNTDOWN REFRESH
   ========================================================= */

setInterval(
    () => {

        if (
            latestWeatherData
        ) {

            renderNextRainAlert(
                latestWeatherData
            );

        }

    },
    60 * 1000
);


/* =========================================================
   INITIALIZE
   ========================================================= */

async function initialize() {

    try {

        loadAccuracyRecords();

        updateAccuracyDisplay();

        updateObservationDisplay();

        initializeRainMap();

        displayLocation(
            DEFAULT_LOCATION
        );

        setCurrentSelectedLocation(
            DEFAULT_LOCATION
        );


        await loadVillageDatabase();


        await loadWeather(
            DEFAULT_LOCATION
        );


    } catch (error) {

        console.error(
            "Initialization failed:",
            error
        );

        setStatus(
            "Website initialization failed.",
            false
        );

    }

}


/* =========================================================
   START WEBSITE — ONLY ONCE
   ========================================================= */

initialize();
