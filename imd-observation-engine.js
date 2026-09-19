(function () {
    "use strict";

    /*
     * Rajasthan Rain Predictor
     * IMD Observation Engine V1
     *
     * Purpose:
     * - Fetch official IMD current weather observations.
     * - Extract last 24-hour rainfall.
     * - Match IMD station observations with the selected location.
     * - Save observations for forecast verification.
     *
     * IMPORTANT:
     * IMD API access may require public-IP whitelisting.
     * No fake station IDs are used here.
     */

    const VERSION = "1.0";

    const IMD_API =
        "https://mausam.imd.gov.in/api/current_wx_api.php";

    const OBSERVATION_KEY =
        "rrp_actual_observations_v1";

    const CACHE_KEY =
        "rrp_imd_observation_cache_v1";

    const CACHE_TIME_MS =
        15 * 60 * 1000;

    let running = false;


    /*
     * =========================================================
     * LOGGING
     * =========================================================
     */

    function log(...args) {
        console.log(
            "[RRP IMD Observation V1]",
            ...args
        );
    }


    function warn(...args) {
        console.warn(
            "[RRP IMD Observation V1]",
            ...args
        );
    }


    /*
     * =========================================================
     * HELPERS
     * =========================================================
     */

    function number(
        value,
        fallback = null
    ) {
        const n = Number(value);

        return Number.isFinite(n)
            ? n
            : fallback;
    }


    function round(
        value,
        decimals = 2
    ) {
        const n = Number(value);

        if (!Number.isFinite(n)) {
            return null;
        }

        const factor =
            Math.pow(
                10,
                decimals
            );

        return (
            Math.round(
                n * factor
            ) / factor
        );
    }


    function normalizeText(
        value
    ) {
        return String(
            value || ""
        )
            .trim()
            .toLowerCase()
            .replace(
                /\s+/g,
                " "
            );
    }


    function normalizeDate(
        value
    ) {
        if (!value) {
            return null;
        }

        const text =
            String(value);

        const match =
            text.match(
                /^(\d{4}-\d{2}-\d{2})/
            );

        if (match) {
            return match[1];
        }

        const parsed =
            new Date(
                value
            );

        if (
            Number.isNaN(
                parsed.getTime()
            )
        ) {
            return null;
        }

        return (
            parsed.getFullYear() +
            "-" +
            String(
                parsed.getMonth() + 1
            ).padStart(
                2,
                "0"
            ) +
            "-" +
            String(
                parsed.getDate()
            ).padStart(
                2,
                "0"
            )
        );
    }


    /*
     * =========================================================
     * STORAGE
     * =========================================================
     */

    function loadArray(
        key
    ) {
        try {

            const raw =
                localStorage.getItem(
                    key
                );

            if (!raw) {
                return [];
            }

            const data =
                JSON.parse(
                    raw
                );

            return Array.isArray(
                data
            )
                ? data
                : [];

        } catch (error) {

            warn(
                "Storage read failed:",
                error
            );

            return [];

        }
    }


    function saveArray(
        key,
        data
    ) {
        try {

            localStorage.setItem(
                key,
                JSON.stringify(
                    data
                )
            );

            return true;

        } catch (error) {

            warn(
                "Storage write failed:",
                error
            );

            return false;

        }
    }


    function loadCache() {
        try {

            const raw =
                localStorage.getItem(
                    CACHE_KEY
                );

            if (!raw) {
                return null;
            }

            return JSON.parse(
                raw
            );

        } catch (
            error
        ) {

            return null;

        }
    }


    function saveCache(
        data
    ) {
        try {

            localStorage.setItem(
                CACHE_KEY,
                JSON.stringify(
                    data
                )
            );

        } catch (
            error
        ) {

            warn(
                "Could not save IMD cache:",
                error
            );

        }
    }


    /*
     * =========================================================
     * SELECTED LOCATION
     * =========================================================
     */

    function getSelectedLocation() {

        try {

            if (
                window.RRP_APP &&
                typeof
                    window.RRP_APP
                        .getCurrentLocation ===
                    "function"
            ) {

                return window.RRP_APP
                    .getCurrentLocation();

            }

        } catch (
            error
        ) {

            warn(
                "Could not read selected location:",
                error
            );

        }


        /*
         * Fallback to visible UI.
         */

        const nameElement =
            document.getElementById(
                "locationName"
            );


        const coordinatesElement =
            document.getElementById(
                "locationCoordinates"
            );


        const name =
            nameElement
                ? nameElement.textContent.trim()
                : "";


        let latitude =
            null;

        let longitude =
            null;


        if (
            coordinatesElement
        ) {

            const text =
                coordinatesElement
                    .textContent;


            const match =
                text.match(
                    /Latitude:\s*([-\d.]+).*Longitude:\s*([-\d.]+)/i
                );


            if (match) {

                latitude =
                    number(
                        match[1]
                    );

                longitude =
                    number(
                        match[2]
                    );

            }

        }


        if (
            !name &&
            latitude === null
        ) {

            return null;

        }


        return {

            name:
                name ||
                "Selected Location",

            latitude:
                latitude,

            longitude:
                longitude

        };

    }


    /*
     * =========================================================
     * IMD API FETCH
     * =========================================================
     */

    async function fetchIMDData(
        force = false
    ) {

        const cached =
            loadCache();


        if (
            !force &&
            cached &&
            cached.timestamp &&
            Date.now() -
                cached.timestamp <
                CACHE_TIME_MS &&
            Array.isArray(
                cached.data
            )
        ) {

            log(
                "Using cached IMD observation data."
            );

            return cached.data;

        }


        log(
            "Fetching official IMD current weather API..."
        );


        const response =
            await fetch(
                IMD_API,
                {
                    method:
                        "GET",

                    cache:
                        "no-store",

                    headers: {
                        "Accept":
                            "application/json"
                    }
                }
            );


        if (
            !response.ok
        ) {

            throw new Error(
                "IMD API HTTP " +
                response.status
            );

        }


        const contentType =
            response.headers.get(
                "content-type"
            ) || "";


        let data;


        if (
            contentType.includes(
                "application/json"
            )
        ) {

            data =
                await response.json();

        } else {

            const text =
                await response.text();


            try {

                data =
                    JSON.parse(
                        text
                    );

            } catch (
                error
            ) {

                throw new Error(
                    "IMD API did not return valid JSON."
                );

            }

        }


        const stations =
            normalizeStationData(
                data
            );


        saveCache({

            timestamp:
                Date.now(),

            data:
                stations

        });


        log(
            "IMD observations received:",
            stations.length
        );


        return stations;

    }


    /*
     * =========================================================
     * NORMALIZE IMD RESPONSE
     * =========================================================
     */

    function normalizeStationData(
        data
    ) {

        /*
         * IMD may return either:
         *
         * - array
         * - object containing data array
         * - single station object
         */

        let source = [];


        if (
            Array.isArray(
                data
            )
        ) {

            source =
                data;

        } else if (
            data &&
            Array.isArray(
                data.data
            )
        ) {

            source =
                data.data;

        } else if (
            data &&
            Array.isArray(
                data.result
            )
        ) {

            source =
                data.result;

        } else if (
            data &&
            Array.isArray(
                data.stations
            )
        ) {

            source =
                data.stations;

        } else if (
            data &&
            typeof data ===
                "object"
        ) {

            /*
             * If the API returns a single
             * station object.
             */

            if (
                data.Station ||
                data.station ||
                data.Station_Id
            ) {

                source = [
                    data
                ];

            }

        }


        return source
            .map(
                normalizeStation
            )
            .filter(
                function (
                    station
                ) {

                    return (
                        station &&
                        station.name
                    );

                }
            );

    }


    function normalizeStation(
        raw
    ) {

        if (
            !raw ||
            typeof raw !==
                "object"
        ) {

            return null;

        }


        const name =
            raw.Station ||
            raw.station ||
            raw.Station_Name ||
            raw.station_name ||
            raw.name ||
            "";


        const stationId =
            raw.Station_Id ||
            raw.Station_ID ||
            raw.station_id ||
            raw.StationCode ||
            raw.Station_Code ||
            raw.id ||
            null;


        const latitude =
            number(
                raw.Latitude ||
                raw.latitude ||
                raw.lat
            );


        const longitude =
            number(
                raw.Longitude ||
                raw.longitude ||
                raw.lon ||
                raw.lng
            );


        const rainfall =
            number(
                raw[
                    "Last 24 hrs Rainfall"
                ] ??
                raw[
                    "Last 24 hrs Rainfall "
                ] ??
                raw.Last_24_hrs_Rainfall ??
                raw.Last_24_Hrs_Rainfall ??
                raw.last_24_hrs_rainfall ??
                raw.Past_24_hrs_Rainfall ??
                raw.past_24_hrs_rainfall ??
                raw.rainfall
            );


        const temperature =
            number(
                raw.Temperature ??
                raw.temperature ??
                raw.Temp
            );


        const humidity =
            number(
                raw.Humidity ??
                raw.humidity ??
                raw.RH
            );


        const windSpeed =
            number(
                raw[
                    "Wind Speed"
                ] ??
                raw.Wind_Speed ??
                raw.wind_speed ??
                raw.windSpeed
            );


        const observationDate =
            normalizeDate(
                raw[
                    "Date of Observation"
                ] ??
                raw.Date_of_Observation ??
                raw.date ??
                raw.observationDate
            );


        const observationTime =
            raw.Time ??
            raw.time ??
            null;


        return {

            stationId:
                stationId !== null
                    ? String(
                        stationId
                    )
                    : null,

            name:
                String(
                    name
                ).trim(),

            normalizedName:
                normalizeText(
                    name
                ),

            latitude:
                latitude,

            longitude:
                longitude,

            rainfall24hMm:
                rainfall !== null
                    ? Math.max(
                        0,
                        rainfall
                    )
                    : null,

            temperatureC:
                temperature,

            humidity:
                humidity,

            windSpeedKmph:
                windSpeed,

            observationDate:
                observationDate,

            observationTime:
                observationTime,

            source:
                "IMD",

            raw:
                raw

        };

    }


    /*
     * =========================================================
     * STATION MATCHING
     * =========================================================
     */

    function distanceKm(
        lat1,
        lon1,
        lat2,
        lon2
    ) {

        if (
            lat1 === null ||
            lon1 === null ||
            lat2 === null ||
            lon2 === null
        ) {

            return null;

        }


        const R =
            6371;


        const dLat =
            (
                lat2 -
                lat1
            ) *
            Math.PI /
            180;


        const dLon =
            (
                lon2 -
                lon1
            ) *
            Math.PI /
            180;


        const a =
            Math.sin(
                dLat / 2
            ) *
            Math.sin(
                dLat / 2
            ) +

            Math.cos(
                lat1 *
                Math.PI /
                180
            ) *

            Math.cos(
                lat2 *
                Math.PI /
                180
            ) *

            Math.sin(
                dLon / 2
            ) *
            Math.sin(
                dLon / 2
            );


        const c =
            2 *
            Math.atan2(
                Math.sqrt(a),
                Math.sqrt(
                    1 - a
                )
            );


        return R * c;

    }


    function stationScore(
        station,
        location
    ) {

        const stationName =
            station.normalizedName;


        const locationName =
            normalizeText(
                location.name
            );


        let score = 0;


        /*
         * Exact / partial name match.
         */

        if (
            stationName ===
            locationName
        ) {

            score += 100;

        } else if (
            stationName.includes(
                locationName
            ) ||
            locationName.includes(
                stationName
            )
        ) {

            score += 60;

        }


        /*
         * Coordinate proximity.
         */

        const distance =
            distanceKm(
                station.latitude,
                station.longitude,
                number(
                    location.latitude
                ),
                number(
                    location.longitude
                )
            );


        if (
            distance !== null
        ) {

            if (
                distance <= 10
            ) {

                score += 80;

            } else if (
                distance <= 25
            ) {

                score += 60;

            } else if (
                distance <= 50
            ) {

                score += 40;

            } else if (
                distance <= 100
            ) {

                score += 20;

            }

        }


        return {

            score:
                score,

            distanceKm:
                distance

        };

    }


    function findBestStation(
        stations,
        location
    ) {

        if (
            !Array.isArray(
                stations
            ) ||
            !stations.length ||
            !location
        ) {

            return null;

        }


        const ranked =
            stations
                .map(
                    function (
                        station
                    ) {

                        const score =
                            stationScore(
                                station,
                                location
                            );


                        return {

                            station:
                                station,

                            score:
                                score.score,

                            distanceKm:
                                score.distanceKm

                        };

                    }
                )
                .sort(
                    function (
                        a,
                        b
                    ) {

                        return (
                            b.score -
                            a.score
                        );

                    }
                );


        if (
            !ranked.length
        ) {

            return null;

        }


        const best =
            ranked[0];


        /*
         * Don't silently claim that a distant
         * station represents a village.
         */

        if (
            best.score < 20
        ) {

            return null;

        }


        return best;

    }


    /*
     * =========================================================
     * SAVE ACTUAL OBSERVATION
     * =========================================================
     */

    function saveObservation(
        station,
        location,
        matchInfo
    ) {

        if (
            !station
        ) {

            return null;

        }


        if (
            station.rainfall24hMm ===
            null
        ) {

            warn(
                "Selected IMD station has no rainfall value."
            );

            return null;

        }


        const observations =
            loadArray(
                OBSERVATION_KEY
            );


        const date =
            station.observationDate ||
            normalizeDate(
                new Date()
            );


        const recordKey =

            "IMD|" +

            String(
                station.stationId ||
                station.name
            ) +

            "|" +

            String(
                date
            );


        const existingIndex =
            observations.findIndex(
                function (
                    item
                ) {

                    return (
                        item.recordKey ===
                        recordKey
                    );

                }
            );


        const record = {

            recordKey:
                recordKey,

            date:
                date,

            rainfall_mm:
                round(
                    station.rainfall24hMm,
                    2
                ),

            source:
                "IMD",

            observationSource:
                "IMD Current Weather API",

            stationId:
                station.stationId,

            stationName:
                station.name,

            locationName:
                location.name,

            latitude:
                station.latitude ??
                location.latitude,

            longitude:
                station.longitude ??
                location.longitude,

            stationDistanceKm:
                matchInfo
                    ? round(
                        matchInfo.distanceKm,
                        1
                    )
                    : null,

            observationTime:
                station.observationTime,

            temperatureC:
                station.temperatureC,

            humidity:
                station.humidity,

            windSpeedKmph:
                station.windSpeedKmph,

            createdAt:
                new Date()
                    .toISOString(),

            engineVersion:
                VERSION

        };


        if (
            existingIndex >=
            0
        ) {

            observations[
                existingIndex
            ] =
                record;

        } else {

            observations.push(
                record
            );

        }


        saveArray(
            OBSERVATION_KEY,
            observations
        );


        return record;

    }


    /*
     * =========================================================
     * RUN
     * =========================================================
     */

    async function run(
        force = false
    ) {

        if (
            running
        ) {

            log(
                "Already running."
            );

            return null;

        }


        running =
            true;


        try {

            const location =
                getSelectedLocation();


            if (
                !location
            ) {

                throw new Error(
                    "Selected location not available."
                );

            }


            log(
                "Selected location:",
                location
            );


            let stations;


            try {

                stations =
                    await fetchIMDData(
                        force
                    );

            } catch (
                error
            ) {

                const message =
                    String(
                        error.message ||
                        error
                    );


                if (
                    message.includes(
                        "403"
                    ) ||
                    message.includes(
                        "401"
                    )
                ) {

                    throw new Error(
                        "IMD API access denied. Official IMD API may require your public IP to be whitelisted."
                    );

                }


                throw error;

            }


            if (
                !stations.length
            ) {

                throw new Error(
                    "IMD API returned no usable station observations."
                );

            }


            const best =
                findBestStation(
                    stations,
                    location
                );


            if (
                !best
            ) {

                log(
                    "No sufficiently close IMD station found for:",
                    location.name
                );


                return {

                    success:
                        false,

                    reason:
                        "No sufficiently close IMD station found.",

                    stationCount:
                        stations.length

                };

            }


            log(
                "Best IMD station:",
                best.station.name,
                "| distance:",
                best.distanceKm !== null
                    ? round(
                        best.distanceKm,
                        1
                    ) +
                      " km"
                    : "unknown"
            );


            const record =
                saveObservation(
                    best.station,
                    location,
                    best
                );


            if (
                !record
            ) {

                throw new Error(
                    "IMD station matched, but rainfall observation could not be saved."
                );

            }


            log(
                "IMD rainfall saved:",
                record.rainfall_mm,
                "mm"
            );


            /*
             * Notify other engines.
             */

            window.dispatchEvent(
                new CustomEvent(
                    "rrp:imd-observation-updated",
                    {
                        detail:
                            record
                    }
                )
            );


            return {

                success:
                    true,

                record:
                    record,

                station:
                    best.station,

                distanceKm:
                    best.distanceKm

            };

        } finally {

            running =
                false;

        }

    }


    /*
     * =========================================================
     * PUBLIC API
     * =========================================================
     */

    function getObservations() {

        return loadArray(
            OBSERVATION_KEY
        );

    }


    function getLatestObservation() {

        const data =
            getObservations();


        if (
            !data.length
        ) {

            return null;

        }


        return data
            .slice()
            .sort(
                function (
                    a,
                    b
                ) {

                    return String(
                        b.createdAt
                    ).localeCompare(
                        String(
                            a.createdAt
                        )
                    );

                }
            )[0];

    }


    function clearCache() {

        try {

            localStorage.removeItem(
                CACHE_KEY
            );

            log(
                "IMD cache cleared."
            );

        } catch (
            error
        ) {

            warn(
                "Could not clear cache:",
                error
            );

        }

    }


    /*
     * =========================================================
     * EVENTS
     * =========================================================
     */

    window.addEventListener(
        "rrp:location-selected",
        function () {

            setTimeout(
                function () {

                    run(
                        false
                    ).catch(
                        function (
                            error
                        ) {

                            warn(
                                "Location update IMD check failed:",
                                error.message
                            );

                        }
                    );

                },
                1500
            );

        }
    );


    /*
     * =========================================================
     * GLOBAL
     * =========================================================
     */

    window.RRP_IMD_OBSERVATION = {

        version:
            VERSION,

        run:
            run,

        getObservations:
            getObservations,

        getLatest:
            getLatestObservation,

        clearCache:
            clearCache

    };


    /*
     * =========================================================
     * STARTUP
     * =========================================================
     */

    function startup() {

        log(
            "IMD Observation Engine V1 ready."
        );


        /*
         * We intentionally do NOT automatically hammer
         * the IMD endpoint on every page load.
         *
         * First attempt after a short delay.
         */

        setTimeout(
            function () {

                run(
                    false
                )
                    .then(
                        function (
                            result
                        ) {

                            if (
                                result &&
                                result.success
                            ) {

                                log(
                                    "Initial IMD observation saved."
                                );

                            } else {

                                log(
                                    "Initial IMD observation not available."
                                );

                            }

                        }
                    )
                    .catch(
                        function (
                            error
                        ) {

                            warn(
                                "Initial IMD observation unavailable:",
                                error.message
                            );

                        }
                    );

            },
            5000
        );

    }


    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            startup
        );

    } else {

        startup();

    }


})();
