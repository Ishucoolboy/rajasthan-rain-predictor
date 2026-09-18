/* =========================================================
   Rajasthan Rain Predictor
   Historical Model Accuracy Engine V4
   ---------------------------------------------------------
   ECMWF / GFS / ICON
   Fixed lead times: Day 1 to Day 7

   Reference:
   Open-Meteo Historical Weather / ERA5 reanalysis

   IMPORTANT:
   This is NOT independent IMD/rain-gauge accuracy.
   ========================================================= */

(function () {

    "use strict";


    /* =====================================================
       SETTINGS
       ===================================================== */

    const RESULT_KEY =
        "rrp_historical_model_accuracy_v4";


    const MODELS = [

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


    const LEAD_DAYS = [
        1,
        2,
        3,
        4,
        5,
        6,
        7
    ];


    const RAIN_THRESHOLD = 0.1;


    /*
       Historical data needs a delay.

       We test a period ending 8 days before today.
       This prevents future-date requests.
    */

    const HISTORICAL_DELAY_DAYS = 8;

    const TEST_DAYS = 7;


    /* =====================================================
       HELPERS
       ===================================================== */

    function number(
        value,
        fallback = null
    ) {

        const n =
            Number(value);

        return Number.isFinite(n)
            ? n
            : fallback;

    }


    function round(
        value,
        digits = 3
    ) {

        const n =
            Number(value);

        if (
            !Number.isFinite(n)
        ) {

            return null;

        }


        const multiplier =
            Math.pow(
                10,
                digits
            );


        return (
            Math.round(
                n * multiplier
            ) /
            multiplier
        );

    }


    function saveJSON(
        key,
        value
    ) {

        try {

            localStorage.setItem(
                key,
                JSON.stringify(value)
            );

        } catch (error) {

            console.warn(
                "Historical accuracy save error:",
                error
            );

        }

    }


    function loadJSON(
        key
    ) {

        try {

            const raw =
                localStorage.getItem(
                    key
                );


            if (!raw) {

                return null;

            }


            return JSON.parse(
                raw
            );

        } catch (error) {

            return null;

        }

    }


    function dateString(
        date
    ) {

        return date
            .toISOString()
            .slice(
                0,
                10
            );

    }


    /* =====================================================
       GET SELECTED LOCATION
       ===================================================== */

    function getLocation() {

        /*
           IMPORTANT FIX:

           app.js exposes the selected location through:

           window.RRP_APP.getCurrentLocation()

           We use that first.
        */

        try {

            if (
                window.RRP_APP &&
                typeof
                    window.RRP_APP
                        .getCurrentLocation ===
                    "function"
            ) {

                const location =
                    window.RRP_APP
                        .getCurrentLocation();


                if (
                    location
                ) {

                    const latitude =
                        number(
                            location.latitude
                        );


                    const longitude =
                        number(
                            location.longitude
                        );


                    if (
                        latitude !== null &&
                        longitude !== null
                    ) {

                        console.log(
                            "Historical accuracy location:",
                            location.name,
                            latitude,
                            longitude
                        );


                        return {

                            name:
                                location.name ||
                                "Selected Location",

                            latitude,

                            longitude

                        };

                    }

                }

            }

        } catch (error) {

            console.warn(
                "RRP_APP location lookup failed:",
                error
            );

        }


        /*
           Fallback:
           latestWeatherData may contain coordinates
           in some future version of app.js.
        */

        try {

            const data =
                window.latestWeatherData;


            if (
                data
            ) {

                const latitude =
                    number(
                        data.latitude ??
                        data.lat ??
                        data.location?.latitude ??
                        data.location?.lat
                    );


                const longitude =
                    number(
                        data.longitude ??
                        data.lon ??
                        data.lng ??
                        data.location?.longitude ??
                        data.location?.lon ??
                        data.location?.lng
                    );


                if (
                    latitude !== null &&
                    longitude !== null
                ) {

                    return {

                        name:
                            data.locationName ||
                            data.name ||
                            "Selected Location",

                        latitude,

                        longitude

                    };

                }

            }

        } catch (error) {

            console.warn(
                "Weather data location lookup failed:",
                error
            );

        }


        return null;

    }


    /* =====================================================
       HISTORICAL DATE RANGE
       ===================================================== */

    function getHistoricalPeriod() {

        const end =
            new Date();


        /*
           Move sufficiently into the past
           so ERA5 data is available.
        */

        end.setUTCDate(
            end.getUTCDate() -
            HISTORICAL_DELAY_DAYS
        );


        const start =
            new Date(
                end
            );


        start.setUTCDate(
            start.getUTCDate() -
            TEST_DAYS +
            1
        );


        return {

            startDate:
                dateString(
                    start
                ),

            endDate:
                dateString(
                    end
                )

        };

    }


    /* =====================================================
       HISTORICAL WEATHER API
       ===================================================== */

    async function fetchHistoricalActual(

        latitude,

        longitude,

        startDate,

        endDate

    ) {

        const params =
            new URLSearchParams();


        params.set(
            "latitude",
            String(latitude)
        );


        params.set(
            "longitude",
            String(longitude)
        );


        params.set(
            "start_date",
            startDate
        );


        params.set(
            "end_date",
            endDate
        );


        params.set(
            "daily",
            "precipitation_sum"
        );


        params.set(
            "timezone",
            "auto"
        );


        params.set(
            "precipitation_unit",
            "mm"
        );


        /*
           Do NOT send models=era5 here.

           The archive endpoint accepts the historical
           weather request directly.
        */

        const url =
            "https://archive-api.open-meteo.com/v1/archive?" +
            params.toString();


        console.log(
            "Historical Weather API request:",
            url
        );


        const response =
            await fetch(
                url
            );


        if (
            !response.ok
        ) {

            let reason =
                "HTTP " +
                response.status;


            try {

                const errorData =
                    await response.json();


                if (
                    errorData.reason
                ) {

                    reason =
                        errorData.reason;

                }

            } catch (error) {

                /* Ignore JSON parse error */

            }


            throw new Error(
                "Historical Weather API " +
                reason
            );

        }


        return response.json();

    }


    /* =====================================================
       ACTUAL DAILY RAIN MAP
       ===================================================== */

    function createActualMap(
        api
    ) {

        const map = {};


        if (
            !api ||
            !api.daily ||
            !Array.isArray(
                api.daily.time
            )
        ) {

            return map;

        }


        const rainfall =
            api.daily
                .precipitation_sum ||
            [];


        api.daily.time.forEach(
            function (
                date,
                index
            ) {

                const value =
                    number(
                        rainfall[index]
                    );


                if (
                    value !== null
                ) {

                    map[date] =
                        value;

                }

            }
        );


        return map;

    }


    /* =====================================================
       PREVIOUS RUNS API
       ===================================================== */

    async function fetchPreviousRun(

        modelId,

        leadDays,

        latitude,

        longitude,

        startDate,

        endDate

    ) {

        const leadVariable =
            "precipitation_previous_day" +
            leadDays;


        const params =
            new URLSearchParams();


        params.set(
            "latitude",
            String(latitude)
        );


        params.set(
            "longitude",
            String(longitude)
        );


        params.set(
            "start_date",
            startDate
        );


        params.set(
            "end_date",
            endDate
        );


        params.set(
            "hourly",
            leadVariable
        );


        params.set(
            "timezone",
            "auto"
        );


        params.set(
            "precipitation_unit",
            "mm"
        );


        params.set(
            "models",
            modelId
        );


        const url =
            "https://previous-runs-api.open-meteo.com/v1/forecast?" +
            params.toString();


        console.log(
            "Previous Runs request:",
            modelId,
            leadVariable
        );


        const response =
            await fetch(
                url
            );


        if (
            !response.ok
        ) {

            let reason =
                "HTTP " +
                response.status;


            try {

                const errorData =
                    await response.json();


                if (
                    errorData.reason
                ) {

                    reason =
                        errorData.reason;

                }

            } catch (error) {

                /* Ignore */

            }


            throw new Error(
                "Previous Runs API " +
                reason
            );

        }


        return response.json();

    }


    /* =====================================================
       HOURLY → DAILY FORECAST
       ===================================================== */

    function createDailyForecastMap(

        api,

        leadDays

    ) {

        const result = {};


        if (
            !api ||
            !api.hourly ||
            !Array.isArray(
                api.hourly.time
            )
        ) {

            return result;

        }


        const leadVariable =
            "precipitation_previous_day" +
            leadDays;


        const times =
            api.hourly.time ||
            [];


        const values =
            api.hourly[
                leadVariable
            ] ||
            [];


        times.forEach(
            function (
                time,
                index
            ) {

                const date =
                    String(
                        time
                    ).slice(
                        0,
                        10
                    );


                const value =
                    number(
                        values[index]
                    );


                if (
                    value === null
                ) {

                    return;

                }


                if (
                    !Object.prototype
                        .hasOwnProperty
                        .call(
                            result,
                            date
                        )
                ) {

                    result[date] =
                        0;

                }


                result[date] +=
                    value;

            }
        );


        Object.keys(
            result
        ).forEach(
            function (
                date
            ) {

                result[date] =
                    round(
                        result[date],
                        2
                    );

            }
        );


        return result;

    }


    /* =====================================================
       METRICS
       ===================================================== */

    function calculateMetrics(
        records
    ) {

        if (
            !records.length
        ) {

            return {

                samples: 0,

                mae: null,

                rmse: null,

                bias: null,

                rainAccuracy: null,

                hits: 0,

                misses: 0,

                falseAlarms: 0,

                correctNoRain: 0

            };

        }


        let absoluteError =
            0;


        let squaredError =
            0;


        let totalBias =
            0;


        let hits =
            0;


        let misses =
            0;


        let falseAlarms =
            0;


        let correctNoRain =
            0;


        records.forEach(
            function (
                item
            ) {

                const predicted =
                    number(
                        item.predictedRainMm
                    );


                const actual =
                    number(
                        item.actualRainMm
                    );


                if (
                    predicted === null ||
                    actual === null
                ) {

                    return;

                }


                const error =
                    predicted -
                    actual;


                absoluteError +=
                    Math.abs(
                        error
                    );


                squaredError +=
                    error *
                    error;


                totalBias +=
                    error;


                const predictedRain =
                    predicted >=
                    RAIN_THRESHOLD;


                const actualRain =
                    actual >=
                    RAIN_THRESHOLD;


                if (
                    predictedRain &&
                    actualRain
                ) {

                    hits++;

                }

                else if (
                    !predictedRain &&
                    actualRain
                ) {

                    misses++;

                }

                else if (
                    predictedRain &&
                    !actualRain
                ) {

                    falseAlarms++;

                }

                else {

                    correctNoRain++;

                }

            }
        );


        const samples =
            records.length;


        const mae =
            absoluteError /
            samples;


        const rmse =
            Math.sqrt(
                squaredError /
                samples
            );


        const bias =
            totalBias /
            samples;


        const classificationTotal =
            hits +
            misses +
            falseAlarms +
            correctNoRain;


        const rainAccuracy =
            classificationTotal > 0

                ? (
                    (
                        hits +
                        correctNoRain
                    ) /
                    classificationTotal
                ) *
                100

                : null;


        return {

            samples,

            mae:
                round(
                    mae,
                    3
                ),

            rmse:
                round(
                    rmse,
                    3
                ),

            bias:
                round(
                    bias,
                    3
                ),

            rainAccuracy:
                round(
                    rainAccuracy,
                    1
                ),

            hits,

            misses,

            falseAlarms,

            correctNoRain

        };

    }


    /* =====================================================
       MAIN HISTORICAL TEST
       ===================================================== */

    async function run(
        options = {}
    ) {

        console.log(
            "======================================"
        );


        console.log(
            "RRP Historical Model Accuracy V4"
        );


        /*
           GET LOCATION FROM APP.JS
        */

        const location =
            getLocation();


        if (
            !location
        ) {

            throw new Error(
                "Selected location coordinates nahi mil rahe."
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
                "Invalid latitude/longitude."
            );

        }


        /*
           HISTORICAL PERIOD
        */

        const period =
            getHistoricalPeriod();


        const startDate =
            period.startDate;


        const endDate =
            period.endDate;


        console.log(
            "Location:",
            location.name
        );


        console.log(
            "Latitude:",
            location.latitude
        );


        console.log(
            "Longitude:",
            location.longitude
        );


        console.log(
            "Period:",
            startDate,
            "to",
            endDate
        );


        console.log(
            "======================================"
        );


        /* =================================================
           STEP 1
           HISTORICAL REFERENCE
           ================================================= */

        const actualAPI =
            await fetchHistoricalActual(

                location.latitude,

                location.longitude,

                startDate,

                endDate

            );


        const actualMap =
            createActualMap(
                actualAPI
            );


        console.log(
            "Historical rainfall reference:",
            actualMap
        );


        /* =================================================
           RESULT OBJECT
           ================================================= */

        const result = {

            version:
                "historical-accuracy-v4",

            generatedAt:
                new Date()
                    .toISOString(),

            location,

            period: {

                startDate,

                endDate,

                days:
                    TEST_DAYS

            },

            reference:
                "Open-Meteo ERA5/reanalysis",

            referenceType:
                "reanalysis-not-rain-gauge",

            models: {},

            allRecords: []

        };


        /* =================================================
           STEP 2
           MODEL TEST
           ================================================= */

        for (
            const model of MODELS
        ) {

            result.models[
                model.name
            ] = {};


            for (
                const leadDays of
                LEAD_DAYS
            ) {

                console.log(
                    "Testing:",
                    model.name,
                    "Day",
                    leadDays
                );


                let api;


                try {

                    api =
                        await fetchPreviousRun(

                            model.id,

                            leadDays,

                            location.latitude,

                            location.longitude,

                            startDate,

                            endDate

                        );

                }

                catch (
                    error
                ) {

                    console.warn(
                        model.name,
                        "Day",
                        leadDays,
                        "failed:",
                        error.message
                    );


                    result.models[
                        model.name
                    ][
                        "day" +
                        leadDays
                    ] = {

                        samples: 0,

                        mae: null,

                        rmse: null,

                        bias: null,

                        rainAccuracy: null,

                        hits: 0,

                        misses: 0,

                        falseAlarms: 0,

                        correctNoRain: 0,

                        error:
                            error.message

                    };


                    continue;

                }


                const dailyForecasts =
                    createDailyForecastMap(

                        api,

                        leadDays

                    );


                const records =
                    [];


                Object.keys(
                    dailyForecasts
                ).forEach(
                    function (
                        validDate
                    ) {

                        const actual =
                            number(
                                actualMap[
                                    validDate
                                ]
                            );


                        if (
                            actual === null
                        ) {

                            return;

                        }


                        const predicted =
                            number(
                                dailyForecasts[
                                    validDate
                                ]
                            );


                        if (
                            predicted === null
                        ) {

                            return;

                        }


                        const record = {

                            date:
                                validDate,

                            model:
                                model.name,

                            modelId:
                                model.id,

                            leadDays,

                            predictedRainMm:
                                predicted,

                            actualRainMm:
                                actual

                        };


                        records.push(
                            record
                        );


                        result.allRecords
                            .push(
                                record
                            );

                    }
                );


                const metrics =
                    calculateMetrics(
                        records
                    );


                result.models[
                    model.name
                ][
                    "day" +
                    leadDays
                ] =
                    metrics;


                console.log(
                    model.name,
                    "Day",
                    leadDays,
                    metrics
                );

            }

        }


        /* =================================================
           SAVE RESULT
           ================================================= */

        saveJSON(
            RESULT_KEY,
            result
        );


        console.log(
            "======================================"
        );


        console.log(
            "HISTORICAL ACCURACY COMPLETE"
        );


        console.log(
            result
        );


        console.log(
            "======================================"
        );


        return result;

    }


    /* =====================================================
       PUBLIC API
       ===================================================== */

    window.RRP_HISTORICAL_ACCURACY = {

        run,

        getResults:
            function () {

                return loadJSON(
                    RESULT_KEY
                );

            },

        clear:
            function () {

                localStorage.removeItem(
                    RESULT_KEY
                );

            }

    };


    console.log(
        "RRP Historical Model Accuracy Engine V4 loaded."
    );


})();
