/*
=========================================================
RAJASTHAN RAIN PREDICTOR
COMPLETE APP.JS
=========================================================

Features:
- Rajasthan village / town / city search
- Local villages.json database
- Open-Meteo geocoding
- OpenStreetMap fallback
- Current weather
- Rain probability
- Rainfall
- Temperature
- Humidity
- Wind
- Thunderstorm indication
- 24-hour forecast
- 7-day forecast
- Interactive Rajasthan rainfall map
- ECMWF / GFS / ICON comparison
- Model consensus
- Smart rain summary
- Next rain alert
- Automatic refresh
- Prediction Engine event integration
- Observation / accuracy framework
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
    "./data/rajasthan-village-registry.json";


// =======================================================
// DEFAULT LOCATION
// =======================================================

const DEFAULT_LOCATION = {
    name: "Kuchera, Nagaur, Rajasthan",
    latitude: 27.01,
    longitude: 73.97
};


// =======================================================
// GLOBAL STATE
// =======================================================

let VILLAGE_DATABASE = [];

let villageDatabaseLoaded = false;

let villageCoverageMeta = {
    coordinateRecords: 0,
    completeCoverageVerified: false,
    generatedAt: null
};

let currentSelectedLocation =
    DEFAULT_LOCATION;

let latestWeatherData = null;

let latestModelResults = [];

let weatherLoading = false;

let rainMap = null;

let rainMapMarker = null;

let rainMapCircle = null;

let rainRadarLayer = null;

let rainRadarFrameTime = null;

let statewideMapMarkers = [];

let districtRainfallMarkers = [];

let districtRainfallData = [];

let actualRainfallData = [];


// =======================================================
// KNOWN LOCATION ALIASES
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
    },

    "kuchera": DEFAULT_LOCATION,

    "कुचेरा": DEFAULT_LOCATION

};


// =======================================================
// RAJASTHAN OVERVIEW LOCATIONS
// =======================================================

const RAJASTHAN_LOCATIONS = [

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
        latitude: 25.7457,
        longitude: 71.3921
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


// =======================================================
// DOM ELEMENTS
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
// MAP SETTINGS
// =======================================================

const RAJASTHAN_MAP_CENTER =
    [27.0238, 74.2179];

const RAJASTHAN_MAP_ZOOM =
    6.2;


// =======================================================
// SAFE NUMBER
// =======================================================

function number(value, fallback = 0) {

    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : fallback;

}


// =======================================================
// HTML ESCAPE
// =======================================================

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


// =======================================================
// STATUS
// =======================================================

function setStatus(
    message,
    online = true
) {

    if (statusText) {

        statusText.textContent =
            message;

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

    if (!location) {
        return;
    }

    if (locationName) {

        locationName.textContent =
            location.name ||
            "Rajasthan";

    }

    if (locationCoordinates) {

        locationCoordinates.textContent =
            `Latitude: ${number(location.latitude).toFixed(4)}° | Longitude: ${number(location.longitude).toFixed(4)}°`;

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

    a =
        normalizeSearchText(a);

    b =
        normalizeSearchText(b);

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

    for (
        let i = 0;
        i <= b.length;
        i++
    ) {

        matrix[i] = [i];

    }

    for (
        let j = 0;
        j <= a.length;
        j++
    ) {

        matrix[0][j] = j;

    }

    for (
        let i = 1;
        i <= b.length;
        i++
    ) {

        for (
            let j = 1;
            j <= a.length;
            j++
        ) {

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
// GET VILLAGE FIELD
// =======================================================

function getVillageField(
    village,
    fields
) {

    for (
        const field of fields
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
                "Village database unavailable"
            );

        }

        const data =
            await response.json();

        if (Array.isArray(data)) {

            VILLAGE_DATABASE =
                data;

            villageCoverageMeta = {
                coordinateRecords: data.length,
                completeCoverageVerified: false,
                generatedAt: null
            };

        } else if (
            Array.isArray(data.villages)
        ) {

            VILLAGE_DATABASE =
                data.villages;

            villageCoverageMeta = {
                coordinateRecords:
                    number(
                        data.coordinate_records,
                        VILLAGE_DATABASE.length
                    ),
                completeCoverageVerified:
                    Boolean(
                        data.complete_coverage_verified
                    ),
                generatedAt:
                    data.generated_at_utc || null
            };

        } else {

            throw new Error(
                "Invalid village database format"
            );

        }

        villageDatabaseLoaded =
            true;

        renderVillageCoverageStatus();

        console.log(
            `Rajasthan village database loaded: ${VILLAGE_DATABASE.length} records`
        );

    } catch (error) {

        console.error(
            "Village database error:",
            error
        );

        villageDatabaseLoaded =
            false;

        VILLAGE_DATABASE =
            [];

    }

}


// =======================================================
// VILLAGE COVERAGE STATUS
// =======================================================

function getVillageCoverageStatus() {

    const count =
        number(
            villageCoverageMeta.coordinateRecords,
            VILLAGE_DATABASE.length
        );

    if (!count) {
        return "Village registry not loaded";
    }

    if (
        villageCoverageMeta.completeCoverageVerified
    ) {
        return `Village-level registry active: ${count.toLocaleString("en-IN")} coordinate records`;
    }

    return `Village coordinate registry active: ${count.toLocaleString("en-IN")} records; current LGD reconciliation is still in progress.`;
}

// =======================================================
// RENDER VILLAGE COVERAGE
// =======================================================

function renderVillageCoverageStatus() {

    const el =
        document.getElementById(
            "villageCoverageContent"
        );

    if (!el) {
        return;
    }

    const count =
        number(
            villageCoverageMeta.coordinateRecords,
            VILLAGE_DATABASE.length
        );

    if (!count) {
        el.innerHTML =
            "⚠️ Village registry abhi available nahi hai. Search fallback geocoding se continue karega.";
        return;
    }

    const completeness =
        villageCoverageMeta.completeCoverageVerified
            ? "Verified coordinate coverage threshold reached"
            : "Coordinate enrichment active; current LGD reconciliation pending";

    const generated =
        villageCoverageMeta.generatedAt
            ? new Date(villageCoverageMeta.generatedAt).toLocaleString("en-IN")
            : "—";

    el.innerHTML = `
      <div style="font-size:18px;font-weight:800;">
        ${count.toLocaleString("en-IN")} village coordinate records
      </div>
      <div style="margin-top:8px;">
        <strong>Status:</strong> ${escapeHtml(completeness)}
      </div>
      <div>
        <strong>Registry:</strong> Census-2011-linked village coordinates
      </div>
      <div>
        <strong>Last generated:</strong> ${escapeHtml(generated)}
      </div>
      <div style="margin-top:8px;opacity:.85;">
        Village search + village-specific forecast selection is enabled.
        Weather forecast is an estimate and cannot be guaranteed.
      </div>
    `;
}


// =======================================================
// CREATE VILLAGE LOCATION
// =======================================================

function createVillageLocation(
    village
) {

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
        number(
            getVillageField(
                village,
                [
                    "latitude",
                    "lat",
                    "Latitude",
                    "LAT"
                ]
            ),
            NaN
        );

    const longitude =
        number(
            getVillageField(
                village,
                [
                    "longitude",
                    "lon",
                    "lng",
                    "Longitude",
                    "LON"
                ]
            ),
            NaN
        );

    const parts = [

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
            parts.join(", "),

        latitude,

        longitude

    };

}


// =======================================================
// SEARCH LOCAL VILLAGE DATABASE
// =======================================================

function searchVillageDatabase(
    query
) {

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

    for (
        const village of
        VILLAGE_DATABASE
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

        if (name === q) {

            exact.push(village);

            continue;

        }

        if (
            combined.includes(q)
        ) {

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
                q.length <= 6
                    ? 2
                    : 3;

            if (
                distance <= threshold
            ) {

                fuzzy.push({

                    village,

                    distance

                });

            }

        }

    }

    fuzzy.sort(
        (a, b) =>
            a.distance -
            b.distance
    );

    return [

        ...exact,

        ...contains,

        ...fuzzy
            .slice(0, 10)
            .map(
                item =>
                    item.village
            )

    ];

}


// =======================================================
// CREATE OPEN METEO LOCATION
// =======================================================

function createOpenMeteoLocation(
    place
) {

    const parts = [

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
            parts.join(", "),

        latitude:
            number(
                place.latitude,
                NaN
            ),

        longitude:
            number(
                place.longitude,
                NaN
            )

    };

}


// =======================================================
// CREATE OSM LOCATION
// =======================================================

function createOSMLocation(
    place
) {

    const address =
        place.address || {};

    const mainName =
        place.name ||
        address.village ||
        address.town ||
        address.city ||
        address.hamlet ||
        address.municipality ||
        "Location";

    const district =
        address.county ||
        address.state_district ||
        address.district;

    const state =
        address.state ||
        "Rajasthan";

    const parts = [

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
            parts.join(", "),

        latitude:
            number(
                place.lat,
                NaN
            ),

        longitude:
            number(
                place.lon,
                NaN
            )

    };

}


// =======================================================
// RAJASTHAN CHECK
// =======================================================

function isRajasthan(
    place
) {

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
// OPEN METEO SEARCH
// =======================================================

async function searchOpenMeteo(
    query
) {

    const searchTerms = [

        query,

        `${query}, Rajasthan`,

        `${query}, Rajasthan, India`

    ];

    let allResults = [];

    for (
        const term of searchTerms
    ) {

        try {

            const url =
                `${GEOCODING_API}?name=${encodeURIComponent(term)}&count=100&language=en&format=json&countryCode=IN`;

            const response =
                await fetch(url);

            if (!response.ok) {
                continue;
            }

            const data =
                await response.json();

            if (
                Array.isArray(
                    data.results
                )
            ) {

                allResults =
                    allResults.concat(
                        data.results
                    );

            }

        } catch (error) {

            console.warn(
                "Open-Meteo search error:",
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
                    place.admin1 ===
                        "Rajasthan" ||

                    String(
                        place.admin1 || ""
                    )
                        .toLowerCase()
                        .includes("rajasthan")
                )
        );

    return (
        rajasthan.length
            ? rajasthan
            : unique
    );

}


// =======================================================
// OPENSTREETMAP FALLBACK
// =======================================================

async function searchOpenStreetMap(
    query
) {

    try {

        const url =
            `${OSM_GEOCODING_API}?q=${encodeURIComponent(
                query + ", Rajasthan, India"
            )}&format=json&addressdetails=1&limit=10&countrycodes=in&accept-language=en`;

        const response =
            await fetch(url);

        if (!response.ok) {

            throw new Error(
                "OSM search failed"
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
            "OSM fallback error:",
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

    if (!locationInput?.parentElement) {
        return;
    }

    const div =
        document.createElement("div");

    div.id =
        "osmAttribution";

    div.style.fontSize =
        "11px";

    div.style.marginTop =
        "6px";

    div.style.opacity =
        "0.65";

    div.innerHTML =
        'Location search may use <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>.';

    locationInput.parentElement
        .appendChild(div);

}


// =======================================================
// SET SELECTED LOCATION
// =======================================================

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
            number(
                location.latitude
            ),

        longitude:
            number(
                location.longitude
            )

    };

    window.RRP_SELECTED_LOCATION =
        currentSelectedLocation;

}


// =======================================================
// WEATHER DESCRIPTION
// =======================================================

function getWeatherDescription(
    code
) {

    code =
        Number(code);

    if (!Number.isFinite(code)) {
        return "Unknown";
    }

    if (
        isThunderstorm(code)
    ) {

        return "Thunderstorm";

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


// =======================================================
// WEATHER ICON
// =======================================================

function getWeatherIcon(
    code
) {

    code =
        Number(code);

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

function isThunderstorm(
    code
) {

    code =
        Number(code);

    return (

        code === 95 ||
        code === 96 ||
        code === 99

    );

}


// =======================================================
// TIME FORMAT
// =======================================================

function formatTime(
    date
) {

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

function formatDay(
    date
) {

    return date.toLocaleDateString(
        "en-IN",
        {
            weekday: "short",
            day: "numeric",
            month: "short"
        }
    );

}


// =======================================================
// FIND CURRENT HOUR
// =======================================================

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
        Date.now();

    let bestIndex =
        0;

    let bestDifference =
        Infinity;

    times.forEach(
        (time, index) => {

            const t =
                new Date(time)
                    .getTime();

            if (!Number.isFinite(t)) {
                return;
            }

            const difference =
                Math.abs(
                    t - now
                );

            if (
                difference <
                bestDifference
            ) {

                bestDifference =
                    difference;

                bestIndex =
                    index;

            }

        }
    );

    return bestIndex;

}


// =======================================================
// RAIN MAP COLOR
// =======================================================

function getRainMapColor(
    rain
) {

    rain =
        number(rain);

    if (rain >= 20) {
        return "#7c3aed";
    }

    if (rain >= 10) {
        return "#2563eb";
    }

    if (rain >= 5) {
        return "#0891b2";
    }

    if (rain >= 1) {
        return "#16a34a";
    }

    if (rain > 0) {
        return "#f59e0b";
    }

    return "#64748b";

}


// =======================================================
// INITIALIZE RAIN MAP
// =======================================================

function initializeRainMap() {

    const mapElement =
        document.getElementById(
            "rainMap"
        );

    if (!mapElement) {
        return;
    }

    if (
        typeof L ===
        "undefined"
    ) {

        mapElement.innerHTML = `
            <div class="map-placeholder">
                🗺️
                <p>Map library could not be loaded.</p>
            </div>
        `;

        return;

    }

    if (rainMap) {
        return;
    }

    mapElement.innerHTML =
        "";

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

                minZoom:
                    5,

                maxZoom:
                    14,

                scrollWheelZoom:
                    true
            }
        );

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {

            maxZoom: 19,

            attribution:
                "&copy; OpenStreetMap contributors"

        }
    ).addTo(
        rainMap
    );

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

    legend.addTo(
        rainMap
    );

    updateLiveRadarLayer().catch(
        error => console.warn(
            "Initial radar layer failed:",
            error
        )
    );

}


// =======================================================
// UPDATE RAIN MAP
// =======================================================

function updateRainMap(
    location,
    weatherData
) {

    if (
        !location ||
        !weatherData
    ) {

        return;

    }

    if (!rainMap) {
        initializeRainMap();
    }

    if (
        !rainMap ||
        typeof L ===
            "undefined"
    ) {

        return;

    }

    const hourly =
        weatherData.hourly;

    const index =
        findCurrentHourIndex(
            hourly?.time || []
        );

    const rain =
        number(
            hourly?.precipitation?.[index]
        );

    const probability =
        number(
            hourly?.precipitation_probability?.[index]
        );

    const temp =
        hourly?.temperature_2m?.[index];

    const code =
        hourly?.weather_code?.[index];

    const latitude =
        number(
            location.latitude,
            NaN
        );

    const longitude =
        number(
            location.longitude,
            NaN
        );

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
    ) {

        return;

    }

    const color =
        getRainMapColor(
            rain
        );

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
        )
        .addTo(
            rainMap
        );

    rainMapMarker.bindPopup(`

        <div style="min-width:200px">

            <strong>
                📍
                ${escapeHtml(location.name)}
            </strong>

            <hr>

            <div>
                🌧️ Current Rain:
                <strong>
                    ${rain.toFixed(1)} mm
                </strong>
            </div>

            <div>
                💧 Probability:
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

                weight:
                    2

            }
        )
        .addTo(
            rainMap
        );

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


// =======================================================
// LIVE RADAR — CURRENT RAIN
// =======================================================

async function updateLiveRadarLayer() {

    if (!rainMap || typeof L === "undefined") {
        return;
    }

    try {
        const response = await fetch(
            "https://api.rainviewer.com/public/weather-maps.json?ts=" + Date.now()
        );

        if (!response.ok) {
            throw new Error("Radar metadata unavailable");
        }

        const data = await response.json();
        const past = data?.radar?.past || [];

        if (!past.length) {
            return;
        }

        const frame = past[past.length - 1];

        if (
            rainRadarLayer &&
            rainRadarFrameTime === frame.time
        ) {
            return;
        }

        if (rainRadarLayer) {
            rainMap.removeLayer(rainRadarLayer);
        }

        const tileUrl =
            `${data.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;

        rainRadarLayer = L.tileLayer(tileUrl, {
            opacity: 0.58,
            maxZoom: 7,
            attribution: "Weather radar: RainViewer"
        });

        rainRadarLayer.addTo(rainMap);
        rainRadarFrameTime = frame.time;

        const liveBox = document.getElementById("liveRainStatus");

        if (liveBox) {
            const radarTime = new Date(frame.time * 1000);

            liveBox.innerHTML =
                `<strong>📡 Live radar:</strong> latest radar frame ${radarTime.toLocaleTimeString("en-IN", {
                    hour: "numeric",
                    minute: "2-digit"
                })}`;
        }

    } catch (error) {
        console.warn("Live radar unavailable:", error);
    }
}


// =======================================================
// FETCH MAIN WEATHER
// =======================================================

async function fetchWeather(
    location
) {

    const params =
        new URLSearchParams({

            latitude:
                location.latitude,

            longitude:
                location.longitude,

            current:
                [
                    "precipitation",
                    "rain",
                    "showers",
                    "weather_code"
                ].join(","),

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
            "Weather API request failed"
        );

    }

    return await response.json();

}


// =======================================================
// UPDATE CURRENT WEATHER
// =======================================================

function updateCurrentWeather(
    data
) {

    const current = data?.current;
    const hourly = data?.hourly;

    if (!current && !hourly?.time?.length) {
        return;
    }

    const index = findCurrentHourIndex(hourly?.time || []);

    const probability = number(
        hourly?.precipitation_probability?.[index]
    );

    const precipitation = number(
        current?.precipitation ??
        current?.rain ??
        current?.showers ??
        hourly?.precipitation?.[index]
    );

    const recentRainValues = Array.isArray(hourly?.precipitation)
        ? hourly.precipitation.slice(Math.max(0, index - 2), index + 1).map(number)
        : [];

    const recentRainMm = recentRainValues.length
        ? Math.max(...recentRainValues)
        : precipitation;

    const temp = current?.temperature_2m ?? hourly?.temperature_2m?.[index];
    const humidityValue = current?.relative_humidity_2m ?? hourly?.relative_humidity_2m?.[index];
    const windValue = current?.wind_speed_10m ?? hourly?.wind_speed_10m?.[index];
    const code = current?.weather_code ?? hourly?.weather_code?.[index];

    if (rainProbability) {
        rainProbability.textContent = `${Math.round(probability)}%`;
    }

    if (rainAmount) {
        rainAmount.textContent = `${precipitation.toFixed(1)} mm`;
    }

    if (temperature) {
        temperature.textContent =
            temp !== undefined ? `${Math.round(temp)} °C` : "-- °C";
    }

    if (humidity) {
        humidity.textContent =
            humidityValue !== undefined ? `${Math.round(humidityValue)}%` : "--%";
    }

    if (wind) {
        wind.textContent =
            windValue !== undefined ? `${Math.round(windValue)} km/h` : "-- km/h";
    }

    if (thunderstorm) {
        thunderstorm.textContent =
            isThunderstorm(code) ? "Possible" : "No indication";
    }

    const liveBox = document.getElementById("liveRainStatus");

    if (liveBox) {
        const hasCurrentRain = precipitation > 0.05;
        const hasRecentRain = recentRainMm > 0.05;

        liveBox.innerHTML = hasCurrentRain
            ? `<strong>🌧️ Abhi rain signal:</strong> ${precipitation.toFixed(1)} mm`
            : hasRecentRain
                ? `<strong>🌧️ Recent rain signal:</strong> pichhle ~2–3 ghanton mein ${recentRainMm.toFixed(1)} mm tak ka precipitation signal mila.`
                : `<strong>☁️ Recent rain signal:</strong> selected point par measurable rain signal nahi mila.`;
    }
}



// =======================================================
// UPDATE HOURLY FORECAST
// =======================================================

function updateHourlyForecast(
    data
) {

    const hourly =
        data?.hourly;

    if (
        !hourly ||
        !hourlyForecast
    ) {

        return;

    }

    hourlyForecast.innerHTML =
        "";

    const start =
        findCurrentHourIndex(
            hourly.time
        );

    const end =
        Math.min(
            start + 24,
            hourly.time.length
        );

    for (
        let i = start;
        i < end;
        i++
    ) {

        const date =
            new Date(
                hourly.time[i]
            );

        const rain =
            number(
                hourly.precipitation?.[i]
            );

        const probability =
            number(
                hourly.precipitation_probability?.[i]
            );

        const code =
            hourly.weather_code?.[i];

        const temp =
            hourly.temperature_2m?.[i];

        const card =
            document.createElement(
                "div"
            );

        card.className =
            "hour-card";

        card.innerHTML = `

            <div class="time">
                ${formatTime(date)}
            </div>

            <div class="icon">
                ${getWeatherIcon(code)}
            </div>

            <div>
                ${temp !== undefined
                    ? `${Math.round(temp)}°C`
                    : "--"}
            </div>

            <div class="rain">
                ${rain.toFixed(1)} mm
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
// UPDATE DAILY FORECAST
// =======================================================

function updateDailyForecast(
    data
) {

    const daily =
        data?.daily;

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
            number(
                daily.precipitation_sum?.[i]
            );

        const probability =
            number(
                daily.precipitation_probability_max?.[i]
            );

        const max =
            daily.temperature_2m_max?.[i];

        const min =
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

            <div>
                🌧️
                ${rain.toFixed(1)} mm
            </div>

            <div>
                💧
                ${Math.round(probability)}%
            </div>

            <div class="day-temp">
                ${
                    max !== undefined &&
                    min !== undefined
                        ? `${Math.round(max)}° / ${Math.round(min)}°`
                        : "--"
                }
            </div>

        `;

        dailyForecast.appendChild(
            card
        );

    }

}


// =======================================================
// MODEL CONFIGURATION
// =======================================================

const WEATHER_MODELS = [

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


// =======================================================
// FETCH ONE MODEL
// =======================================================

async function fetchModel(
    location,
    model
) {

    const params =
        new URLSearchParams({

            latitude:
                location.latitude,

            longitude:
                location.longitude,

            hourly:
                [
                    "precipitation",
                    "precipitation_probability",
                    "weather_code"
                ].join(","),

            daily:
                [
                    "precipitation_sum",
                    "precipitation_probability_max",
                    "weather_code"
                ].join(","),

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

    return await response.json();

}


// =======================================================
// UPDATE MODEL STATUS
// =======================================================

async function updateModelStatus(
    location
) {

    if (!location) {
        return;
    }

    const results = [];

    WEATHER_MODELS.forEach(
        model => {

            if (model.element) {

                model.element.textContent =
                    "Loading...";

            }

        }
    );

    for (
        const model of WEATHER_MODELS
    ) {

        try {

            const data =
                await fetchModel(
                    location,
                    model
                );

            const daily =
                data.daily;

            if (
                !daily ||
                !Array.isArray(
                    daily.precipitation_sum
                )
            ) {

                throw new Error(
                    "Rainfall unavailable"
                );

            }

            const rainfall =
                daily.precipitation_sum
                    .map(
                        value =>
                            number(value)
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
                                number(value)
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

            const result = {

                name:
                    model.name,

                id:
                    model.id,

                rainfall,

                totalRain,

                averageProbability,

                data,

                success:
                    true

            };

            results.push(
                result
            );

            if (model.element) {

                model.element.textContent =
                    `${totalRain.toFixed(1)} mm`;

            }

        } catch (error) {

            console.error(
                `${model.name} failed:`,
                error
            );

            results.push({

                name:
                    model.name,

                id:
                    model.id,

                rainfall:
                    [],

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

    latestModelResults =
        results;

    renderModelConsensus(
        results
    );

    return results;

}


// =======================================================
// MODEL CONSENSUS
// =======================================================

function renderModelConsensus(
    results
) {

    let container =
        document.getElementById(
            "modelConsensus"
        );

    if (!container) {

        container =
            document.createElement(
                "div"
            );

        container.id =
            "modelConsensus";

        container.style.marginTop =
            "18px";

        container.style.padding =
            "16px";

        container.style.borderRadius =
            "14px";

        container.style.background =
            "rgba(15,23,42,0.06)";

        container.style.border =
            "1px solid rgba(100,116,139,0.18)";

        const parent =
            document.querySelector(
                ".model-section"
            ) ||
            ecmwfRain?.parentElement;

        if (parent) {

            parent.appendChild(
                container
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

        if (container) {

            container.innerHTML = `

                <strong>
                    🌧️ Model Consensus
                </strong>

                <p>
                    ECMWF, GFS aur ICON data
                    abhi available nahi hai.
                </p>

            `;

        }

        return;

    }

    const totals =
        successful.map(
            item =>
                item.totalRain
        );

    const average =
        totals.reduce(
            (sum, value) =>
                sum + value,
            0
        ) /
        totals.length;

    const minimum =
        Math.min(...totals);

    const maximum =
        Math.max(...totals);

    const spread =
        maximum - minimum;

    let agreement =
        "Low";

    if (average < 1) {

        if (spread <= 2) {

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
                average * 0.30
            )
        ) {

            agreement =
                "High";

        } else if (
            spread <=
            Math.max(
                10,
                average * 0.60
            )
        ) {

            agreement =
                "Moderate";

        }

    }

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

    const rows =
        successful
            .map(
                item => `

                    <div style="
                        display:flex;
                        justify-content:space-between;
                        padding:7px 0;
                        border-bottom:1px solid rgba(100,116,139,.15);
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

    container.innerHTML = `

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
                ${average.toFixed(1)} mm
            </div>

            <div>
                <strong>
                    Model Range:
                </strong>
                ${minimum.toFixed(1)}
                –
                ${maximum.toFixed(1)} mm
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
                ${Math.round(averageProbability)}%
            </div>

        </div>

        <div style="
            margin-top:10px;
            font-size:12px;
            opacity:.7;
            line-height:1.5;
        ">

            Model consensus multiple weather
            models ka comparison hai.
            Ye guaranteed accuracy percentage
            nahi hai.

        </div>

    `;

}


// =======================================================
// RAIN INTENSITY
// =======================================================

function getRainIntensity(
    rain
) {

    rain =
        number(rain);

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


// =======================================================
// RAIN RISK
// =======================================================

function getRainRisk(
    probability,
    rainfall
) {

    probability =
        number(probability);

    rainfall =
        number(rainfall);

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


// =======================================================
// FIND NEXT RAIN
// =======================================================

function findNextRain(
    hourly
) {

    if (
        !hourly?.time?.length
    ) {

        return null;

    }

    const start =
        findCurrentHourIndex(
            hourly.time
        );

    for (
        let i = start;
        i < hourly.time.length;
        i++
    ) {

        const rain =
            number(
                hourly.precipitation?.[i]
            );

        const probability =
            number(
                hourly.precipitation_probability?.[i]
            );

        if (
            rain >= 0.1 ||
            probability >= 50
        ) {

            return {

                time:
                    hourly.time[i],

                rainfall:
                    rain,

                probability

            };

        }

    }

    return null;

}


// =======================================================
// SMART RAIN SUMMARY
// =======================================================

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
            "rgba(14,165,233,.08)";

        summary.style.border =
            "1px solid rgba(14,165,233,.18)";

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
                🌤️ Smart Rain Forecast
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

    const formatted =
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
                ${escapeHtml(formatted)}
            </div>

            <div>
                💧
                <strong>
                    Probability:
                </strong>
                ${Math.round(nextRain.probability)}%
            </div>

            <div>
                📏
                <strong>
                    Expected Rain:
                </strong>
                ${nextRain.rainfall.toFixed(1)} mm
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
            opacity:.7;
        ">

            Forecast signal hai,
            guaranteed prediction nahi.

        </div>

    `;

}


// =======================================================
// NEXT RAIN ALERT
// =======================================================

function renderNextRainAlert(
    data
) {

    const hourly =
        data?.hourly;

    if (!hourly) {
        return;
    }

    let alertBox =
        document.getElementById(
            "nextRainAlert"
        );

    if (!alertBox) {

        alertBox =
            document.createElement(
                "div"
            );

        alertBox.id =
            "nextRainAlert";

        alertBox.style.marginTop =
            "14px";

        alertBox.style.padding =
            "15px";

        alertBox.style.borderRadius =
            "14px";

        alertBox.style.background =
            "rgba(59,130,246,.08)";

        alertBox.style.border =
            "1px solid rgba(59,130,246,.18)";

        const target =
            document.getElementById(
                "smartRainSummary"
            ) ||
            document.querySelector(
                "main"
            );

        if (target) {

            target.parentNode.insertBefore(
                alertBox,
                target.nextSibling
            );

        }

    }

    const nextRain =
        findNextRain(
            hourly
        );

    if (!nextRain) {

        alertBox.innerHTML = `

            <strong>
                ⏰ Next Rain Alert
            </strong>

            <div style="margin-top:6px">
                No significant rain event detected
                in available hourly forecast.
            </div>

        `;

        return;

    }

    const date =
        new Date(
            nextRain.time
        );

    alertBox.innerHTML = `

        <strong>
            ⏰ Next Rain Alert
        </strong>

        <div style="
            margin-top:7px;
            line-height:1.7;
        ">

            Rain signal around

            <strong>
                ${escapeHtml(
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
                    )
                )}
            </strong>

            <br>

            🌧️
            ${nextRain.rainfall.toFixed(1)}
            mm

            <br>

            💧
            ${Math.round(nextRain.probability)}
            % probability

        </div>

    `;

}


// =======================================================
// HOURLY MODEL COMPARISON
// =======================================================

async function loadHourlyModelComparison(
    location
) {

    if (!location) {
        return;
    }

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

        container.style.border =
            "1px solid rgba(100,116,139,.18)";

        const target =
            document.getElementById(
                "modelConsensus"
            ) ||
            document.querySelector(
                ".model-section"
            );

        if (target) {

            target.parentNode.insertBefore(
                container,
                target.nextSibling
            );

        }

    }

    container.innerHTML = `

        <div style="
            font-size:18px;
            font-weight:700;
            margin-bottom:10px;
        ">
            🕐 Hourly Model Comparison
        </div>

        <div style="opacity:.7">
            Loading ECMWF, GFS and ICON hourly rainfall...
        </div>

    `;

    try {

        const responses =
            await Promise.all(
                WEATHER_MODELS.map(
                    model =>
                        fetchModel(
                            location,
                            model
                        )
                            .then(
                                data => ({
                                    model,
                                    data
                                })
                            )
                            .catch(
                                () => ({
                                    model,
                                    data: null
                                })
                            )
                )
            );

        const startIndex =
            responses[0]?.data?.hourly
                ? findCurrentHourIndex(
                    responses[0].data.hourly.time
                )
                : 0;

        let html = `

            <div style="
                overflow-x:auto;
            ">

            <table style="
                width:100%;
                border-collapse:collapse;
                font-size:13px;
            ">

                <thead>

                    <tr>

                        <th style="
                            text-align:left;
                            padding:7px;
                        ">
                            Time
                        </th>

        `;

        responses.forEach(
            item => {

                html += `

                    <th style="
                        padding:7px;
                    ">
                        ${item.model.name}
                    </th>

                `;

            }
        );

        html += `

                    </tr>

                </thead>

                <tbody>

        `;

        for (
            let offset = 0;
            offset < 12;
            offset++
        ) {

            const response =
                responses.find(
                    item =>
                        item.data?.hourly
                );

            if (!response) {
                break;
            }

            const index =
                startIndex + offset;

            const time =
                response.data.hourly.time?.[
                    index
                ];

            if (!time) {
                break;
            }

            html += `

                <tr>

                    <td style="
                        padding:7px;
                        font-weight:600;
                    ">
                        ${formatTime(
                            new Date(time)
                        )}
                    </td>

            `;

            responses.forEach(
                item => {

                    const rain =
                        number(
                            item.data
                                ?.hourly
                                ?.precipitation
                                ?.[index]
                        );

                    html += `

                        <td style="
                            text-align:center;
                            padding:7px;
                        ">
                            ${rain.toFixed(1)}
                            mm
                        </td>

                    `;

                }
            );

            html += `

                </tr>

            `;

        }

        html += `

                </tbody>

            </table>

            </div>

            <div style="
                margin-top:10px;
                font-size:12px;
                opacity:.7;
            ">
                Values are model forecasts and
                are not observed rainfall measurements.
            </div>

        `;

        container.innerHTML =
            html;

    } catch (error) {

        console.error(
            "Hourly model comparison failed:",
            error
        );

        container.innerHTML = `

            <strong>
                🕐 Hourly Model Comparison
            </strong>

            <p>
                Model comparison temporarily unavailable.
            </p>

        `;

    }

}


// =======================================================
// RAJASTHAN DISTRICT RAINFALL DASHBOARD
// =======================================================

function normalizeDistrictName(name) {
    return String(name || "").trim().replace(/\s+/g, " ");
}

function buildDistrictLocations() {
    const grouped = new Map();

    VILLAGE_DATABASE.forEach(village => {
        const district = normalizeDistrictName(getVillageField(village, [
            "district", "District", "district_name"
        ]));

        const latitude = number(getVillageField(village, [
            "latitude", "lat", "Latitude", "LAT"
        ]), NaN);

        const longitude = number(getVillageField(village, [
            "longitude", "lon", "lng", "Longitude", "LON"
        ]), NaN);

        if (!district || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

        if (!grouped.has(district)) {
            grouped.set(district, {
                name: district,
                latitudeSum: 0,
                longitudeSum: 0,
                count: 0
            });
        }

        const item = grouped.get(district);
        item.latitudeSum += latitude;
        item.longitudeSum += longitude;
        item.count += 1;
    });

    return Array.from(grouped.values())
        .map(item => ({
            name: item.name,
            latitude: item.latitudeSum / item.count,
            longitude: item.longitudeSum / item.count,
            coordinateCount: item.count
        }))
        .filter(item =>
            Number.isFinite(item.latitude) &&
            Number.isFinite(item.longitude)
        )
        .sort((a, b) => a.name.localeCompare(b.name));
}

function districtRainClass(mm) {
    mm = number(mm);

    if (mm >= 115.6) return "extreme";
    if (mm >= 64.5) return "very-heavy";
    if (mm >= 15.6) return "heavy";
    if (mm >= 2.5) return "moderate";
    if (mm > 0) return "light";
    return "none";
}

function districtRainLabel(mm) {
    mm = number(mm);

    if (mm >= 115.6) return "Extreme";
    if (mm >= 64.5) return "Very Heavy";
    if (mm >= 15.6) return "Heavy";
    if (mm >= 2.5) return "Moderate";
    if (mm > 0) return "Light";
    return "No rain";
}

function districtRainColor(mm) {
    return {
        none: "#64748b",
        light: "#f59e0b",
        moderate: "#0891b2",
        heavy: "#2563eb",
        "very-heavy": "#7c3aed",
        extreme: "#be123c"
    }[districtRainClass(mm)];
}

function formatDistrictRain(mm) {
    return number(mm).toFixed(1);
}

function renderDistrictRainfallDashboard() {
    const container = document.getElementById("districtRainfallDashboard");

    if (!container) return;

    if (!districtRainfallData.length) {
        container.innerHTML = `
            <div class="district-empty">
                🌧️ District rainfall data abhi available nahi hai.
            </div>
        `;
        return;
    }

    const sorted = [...districtRainfallData].sort((a, b) => b.total3Day - a.total3Day);
    const wettest = sorted.slice(0, 5);
    const next24 = [...districtRainfallData].sort((a, b) => b.day1 - a.day1);

    const wettestRows = wettest.map(item => `
        <div class="district-top-row">
            <strong>${escapeHtml(item.name)}</strong>
            <span>${formatDistrictRain(item.total3Day)} mm</span>
        </div>
    `).join("");

    const tableRows = next24.map(item => `
        <tr>
            <td><strong>${escapeHtml(item.name)}</strong></td>
            <td><span class="rain-pill ${districtRainClass(item.day1)}">${formatDistrictRain(item.day1)} mm</span></td>
            <td>${formatDistrictRain(item.day2)} mm</td>
            <td>${formatDistrictRain(item.day3)} mm</td>
            <td><strong>${formatDistrictRain(item.total3Day)} mm</strong></td>
            <td>${Math.round(item.maxProbability)}%</td>
            <td><span class="rain-label ${districtRainClass(item.total3Day)}">${districtRainLabel(item.total3Day)}</span></td>
        </tr>
    `).join("");

    container.innerHTML = `
        <div class="district-summary-grid">
            <div class="district-stat">
                <span>Districts</span>
                <strong>${districtRainfallData.length}</strong>
            </div>
            <div class="district-stat">
                <span>Highest next 24h</span>
                <strong>${escapeHtml(next24[0]?.name || "--")}</strong>
                <small>${formatDistrictRain(next24[0]?.day1)} mm</small>
            </div>
            <div class="district-stat">
                <span>Highest 3-day</span>
                <strong>${escapeHtml(wettest[0]?.name || "--")}</strong>
                <small>${formatDistrictRain(wettest[0]?.total3Day)} mm</small>
            </div>
        </div>

        <div class="district-top-box">
            <h3>🌧️ Top Rainfall Areas — Next 3 Days</h3>
            ${wettestRows}
        </div>

        <div class="district-table-wrap">
            <table class="district-rain-table">
                <thead>
                    <tr>
                        <th>District</th>
                        <th>Next 24h</th>
                        <th>Day 2</th>
                        <th>Day 3</th>
                        <th>3-Day Total</th>
                        <th>Rain Chance</th>
                        <th>Level</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>
        </div>

        <div class="district-source-note">
            📌 Rainfall values are forecast estimates from Open-Meteo model data at
            district coordinate centroids. IMD district warnings/nowcasts remain a
            separate official warning signal.
        </div>
    `;
}

function renderRainNews() {
    const box = document.getElementById("rainNews");
    if (!box) return;
    const rows = Array.isArray(districtRainfallData) ? [...districtRainfallData] : [];
    if (!rows.length) {
        box.innerHTML = "⏳ District forecast load ho raha hai...";
        return;
    }
    const top = rows.filter(r => Number(r.total3Day) > 0)
        .sort((a,b) => Number(b.total3Day) - Number(a.total3Day)).slice(0,5);
    const radar = document.getElementById("liveRainStatus")?.textContent?.trim() || "Live radar signal available hai.";
    const d1 = rows.filter(r => Number(r.day1) > 0).length;
    box.innerHTML =
        '<div class="rain-news-item">📡 <strong>Abhi:</strong> ' + escapeHTML(radar) + '</div>' +
        '<div class="rain-news-item">🌧️ <strong>Next 24 hours:</strong> Rajasthan ke ' + d1 + ' districts mein measurable rain forecast hai.</div>' +
        '<div class="rain-news-item">🔮 <strong>Next 3 days:</strong> ' +
        (top.length ? top.map(r => escapeHTML(r.district) + ' (' + formatDistrictRain(r.total3Day) + ')').join(", ") : "significant rain signal nahi mila.") +
        '.</div>' +
        '<div class="rain-news-item">⚡ <strong>Official warning:</strong> IMD warning/nowcast ko forecast se separate rakha gaya hai.</div>';
}

async function loadDistrictRainfall() {
    if (!VILLAGE_DATABASE.length) return;

    const districts = buildDistrictLocations();
    if (!districts.length) return;

    const container = document.getElementById("districtRainfallDashboard");

    if (container) {
        container.innerHTML = `
            <div class="district-loading">
                ⏳ Rajasthan ke ${districts.length} districts ka rainfall forecast load ho raha hai...
            </div>
        `;
    }

    try {
        const latitude = districts.map(item => item.latitude.toFixed(5)).join(",");
        const longitude = districts.map(item => item.longitude.toFixed(5)).join(",");

        const params = new URLSearchParams({
            latitude,
            longitude,
            daily: "precipitation_sum,precipitation_probability_max,weather_code",
            forecast_days: "3",
            timezone: "Asia/Kolkata"
        });

        const response = await fetch(`${WEATHER_API}?${params}`);

        if (!response.ok) throw new Error("District rainfall API failed");

        const payload = await response.json();
        const responses = Array.isArray(payload) ? payload : [payload];

        districtRainfallData = districts.map((district, index) => {
            const data = responses[index] || {};
            const daily = data.daily || {};

            const rainfall = Array.isArray(daily.precipitation_sum)
                ? daily.precipitation_sum.map(value => number(value))
                : [0, 0, 0];

            const probabilities = Array.isArray(daily.precipitation_probability_max)
                ? daily.precipitation_probability_max.map(value => number(value))
                : [0, 0, 0];

            return {
                ...district,
                day1: rainfall[0] || 0,
                day2: rainfall[1] || 0,
                day3: rainfall[2] || 0,
                total3Day: (rainfall[0] || 0) + (rainfall[1] || 0) + (rainfall[2] || 0),
                maxProbability: Math.max(...probabilities)
            };
        });

        renderDistrictRainfallDashboard();
        renderDistrictRainfallMap();
        renderRainNews();

    } catch (error) {
        console.error("District rainfall failed:", error);
        districtRainfallData = [];

        if (container) {
            container.innerHTML = `
                <div class="district-error">
                    ⚠️ District rainfall forecast temporarily unavailable.
                </div>
            `;
        }
    }
}

function renderDistrictRainfallMap() {
    if (!rainMap || typeof L === "undefined") return;

    districtRainfallMarkers.forEach(marker => {
        try { rainMap.removeLayer(marker); } catch (_) {}
    });

    districtRainfallMarkers = [];

    districtRainfallData.forEach(item => {
        const rain = item.day1;
        const color = districtRainColor(rain);

        const marker = L.circleMarker(
            [item.latitude, item.longitude],
            {
                radius: Math.max(6, Math.min(14, 6 + Math.sqrt(rain + 1) * 1.5)),
                color,
                fillColor: color,
                fillOpacity: 0.72,
                weight: 2
            }
        ).addTo(rainMap);

        marker.bindPopup(`
            <div class="district-popup">
                <strong>📍 ${escapeHtml(item.name)}</strong>
                <hr>
                🌧️ <strong>Next 24h:</strong> ${formatDistrictRain(item.day1)} mm<br>
                📅 <strong>Day 2:</strong> ${formatDistrictRain(item.day2)} mm<br>
                📅 <strong>Day 3:</strong> ${formatDistrictRain(item.day3)} mm<br>
                💧 <strong>Rain chance:</strong> ${Math.round(item.maxProbability)}%<br>
                <b>${districtRainLabel(item.total3Day)}</b> — 3-day total ${formatDistrictRain(item.total3Day)} mm
            </div>
        `);

        districtRainfallMarkers.push(marker);
    });
}


// =======================================================
// LEGACY STATEWIDE RAINFALL
// =======================================================

async function loadStatewideRainfall() {
    if (!rainMap || typeof L === "undefined") return;

    statewideMapMarkers.forEach(marker => {
        try { rainMap.removeLayer(marker); } catch (_) {}
    });

    statewideMapMarkers = [];
}


// =======================================================
// ACCURACY FRAMEWORK
// =======================================================

function loadAccuracyRecords() {

    try {

        const saved =
            localStorage.getItem(
                "rrp_accuracy_records"
            );

        if (!saved) {

            actualRainfallData =
                [];

            return;

        }

        const parsed =
            JSON.parse(saved);

        actualRainfallData =
            Array.isArray(parsed)
                ? parsed
                : [];

    } catch (error) {

        console.error(
            "Accuracy records error:",
            error
        );

        actualRainfallData =
            [];

    }

}


// =======================================================
// SAVE ACCURACY RECORD
// =======================================================

function saveAccuracyRecord(
    record
) {

    if (!record) {
        return;
    }

    actualRainfallData.push(
        record
    );

    try {

        localStorage.setItem(
            "rrp_accuracy_records",
            JSON.stringify(
                actualRainfallData
            )
        );

    } catch (error) {

        console.error(
            "Could not save accuracy record:",
            error
        );

    }

}


// =======================================================
// ACCURACY DISPLAY
// =======================================================

function updateAccuracyDisplay() {

    let box =
        document.getElementById(
            "accuracyNote"
        );

    if (!box) {

        box =
            document.createElement(
                "div"
            );

        box.id =
            "accuracyNote";

        box.style.marginTop =
            "16px";

        box.style.padding =
            "14px";

        box.style.borderRadius =
            "14px";

        box.style.fontSize =
            "13px";

        box.style.background =
            "rgba(100,116,139,.07)";

        const target =
            document.querySelector(
                "main"
            );

        if (target) {

            target.appendChild(
                box
            );

        }

    }

    box.innerHTML = `

        <strong>
            📊 Forecast Accuracy
        </strong>

        <div style="margin-top:6px">

            ${
                actualRainfallData.length
                    ? `${actualRainfallData.length} observation record(s) available.`
                    : "Accuracy will be calculated only after verified observation data becomes available."
            }

        </div>

        <div style="
            margin-top:6px;
            opacity:.7;
        ">

            Model consensus ko accuracy
            nahi maana jaata. Actual accuracy ke
            liye verified rainfall observations
            aur historical forecast records
            required hain.

        </div>

    `;

}


// =======================================================
// LOAD WEATHER
// =======================================================

async function loadWeather(
    location
) {

    if (!location) {
        return;
    }

    if (weatherLoading) {
        return;
    }

    const latitude =
        number(
            location.latitude,
            NaN
        );

    const longitude =
        number(
            location.longitude,
            NaN
        );

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
    ) {

        setStatus(
            "Invalid location coordinates",
            false
        );

        return;

    }

    weatherLoading =
        true;

    try {

        setCurrentSelectedLocation(
            location
        );

        displayLocation(
            location
        );

        setStatus(
            "Loading weather data..."
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

        /*
        ==================================================
        IMPORTANT PREDICTION ENGINE CONNECTION
        ==================================================
        prediction-engine.js listens to this event.
        ==================================================
        */

        try {

            window.dispatchEvent(
                new CustomEvent(
                    "rrp:weather-updated",
                    {
                        detail: {

                            location,

                            weatherData:
                                data

                        }
                    }
                )
            );

        } catch (error) {

            console.warn(
                "Prediction engine event failed:",
                error
            );

        }

        await updateModelStatus(
            location
        );

        await loadHourlyModelComparison(
            location
        );

        /*
        Statewide rainfall markers are useful,
        but should not block the selected
        location weather from displaying.
        */

        loadStatewideRainfall()
            .catch(
                error =>
                    console.warn(
                        "Statewide rainfall failed:",
                        error
                    )
            );

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


// =======================================================
// SEARCH LOCATION
// =======================================================

async function searchLocation() {

    const query =
        normalizeSearchText(
            locationInput?.value
        );

    if (!query) {

        setStatus(
            "Please enter a village, town or city.",
            false
        );

        return;

    }

    if (searchButton) {

        searchButton.disabled =
            true;

        searchButton.textContent =
            "Searching...";

    }

    try {

        setStatus(
            "Searching location..."
        );

        // ------------------------------------------------
        // 1. KNOWN ALIAS
        // ------------------------------------------------

        if (
            KNOWN_LOCATIONS[query]
        ) {

            const location =
                KNOWN_LOCATIONS[query];

            if (locationInput) {

                locationInput.value =
                    location.name;

            }

            await loadWeather(
                location
            );

            return;

        }


        // ------------------------------------------------
        // 2. LOCAL VILLAGE DATABASE
        // ------------------------------------------------

        const localMatches =
            searchVillageDatabase(
                query
            );

        if (
            localMatches.length
        ) {

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

                if (locationInput) {

                    locationInput.value =
                        location.name;

                }

                await loadWeather(
                    location
                );

                return;

            }

        }


        // ------------------------------------------------
        // 3. OPEN METEO
        // ------------------------------------------------

        let results =
            await searchOpenMeteo(
                query
            );


        // ------------------------------------------------
        // 4. OSM FALLBACK
        // ------------------------------------------------

        if (!results.length) {

            setStatus(
                "Trying extended Rajasthan search..."
            );

            const osmResults =
                await searchOpenStreetMap(
                    query
                );

            if (
                osmResults.length
            ) {

                results =
                    osmResults;

                addOSMAttribution();

            }

        }


        // ------------------------------------------------
        // NO RESULT
        // ------------------------------------------------

        if (!results.length) {

            throw new Error(
                `Location "${query}" not found in Rajasthan.`
            );

        }


        // ------------------------------------------------
        // SELECT FIRST RESULT
        // ------------------------------------------------

        const place =
            results[0];

        let location;

        if (
            place.lat !== undefined &&
            place.lon !== undefined
        ) {

            location =
                createOSMLocation(
                    place
                );

        } else {

            location =
                createOpenMeteoLocation(
                    place
                );

        }

        if (
            !Number.isFinite(
                location.latitude
            ) ||
            !Number.isFinite(
                location.longitude
            )
        ) {

            throw new Error(
                "Location coordinates unavailable."
            );

        }

        if (locationInput) {

            locationInput.value =
                location.name;

        }

        await loadWeather(
            location
        );

    } catch (error) {

        console.error(
            "Location search failed:",
            error
        );

        setStatus(
            "Location search failed",
            false
        );

        /*
        Don't use alert() here because it is
        annoying on mobile. Show the message
        directly in status.
        */

        if (statusText) {

            statusText.textContent =
                error.message ||
                "Location search failed.";

        }

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
// AUTO REFRESH
// =======================================================

async function refreshCurrentWeather() {

    if (
        !currentSelectedLocation
    ) {

        return;

    }

    console.log(
        "Refreshing weather..."
    );

    await loadWeather(
        currentSelectedLocation
    );

    loadDistrictRainfall().catch(
        error => console.warn(
            "District rainfall refresh failed:",
            error
        )
    );

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
                event.key ===
                "Enter"
            ) {

                event.preventDefault();

                searchLocation();

            }

        }
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
// LIVE RADAR REFRESH
// =======================================================

setInterval(
    () => {
        updateLiveRadarLayer().catch(
            error => console.warn(
                "Radar refresh failed:",
                error
            )
        );
    },
    5 * 60 * 1000
);


// =======================================================
// UPDATE RAIN ALERT EVERY MINUTE
// =======================================================

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


// =======================================================
// INITIALIZE
// =======================================================

async function initialize() {

    try {

        loadAccuracyRecords();

        updateAccuracyDisplay();

        initializeRainMap();

        displayLocation(
            DEFAULT_LOCATION
        );

        setCurrentSelectedLocation(
            DEFAULT_LOCATION
        );

        if (locationInput) {

            locationInput.value =
                DEFAULT_LOCATION.name;

        }

        await loadVillageDatabase();

        await loadWeather(
            DEFAULT_LOCATION
        );

        loadDistrictRainfall().catch(
            error => console.warn(
                "District rainfall initialization failed:",
                error
            )
        );

        /*
        Give prediction-engine.js a chance
        to initialize if it was loaded after
        this script.
        */

        setTimeout(
            () => {

                try {

                    if (
                        window.RRP_PREDICTION_ENGINE &&
                        typeof
                            window.RRP_PREDICTION_ENGINE.run ===
                            "function"
                    ) {

                        window.RRP_PREDICTION_ENGINE.run(
                            currentSelectedLocation
                        );

                    }

                } catch (error) {

                    console.warn(
                        "Prediction engine initial run failed:",
                        error
                    );

                }

            },
            800
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


// =======================================================
// START WEBSITE
// =======================================================

initialize();


// =======================================================
// GLOBAL API
// =======================================================

window.RRP_APP = {

    getCurrentLocation:
        () =>
            currentSelectedLocation,

    getLatestWeather:
        () =>
            latestWeatherData,

    getLatestModels:
        () =>
            latestModelResults,

    refresh:
        refreshCurrentWeather,

    search:
        searchLocation,

    loadWeather:

        loadWeather

};


// =======================================================
// END APP.JS
// =======================================================
