/* =========================================================
   RAJASTHAN RAIN PREDICTOR
   ACCURACY ENGINE - VERSION 1
   =========================================================

   Purpose:
   ---------------------------------------------------------
   1. Save forecast snapshots
   2. Record actual rainfall observations
   3. Compare forecast vs actual rainfall
   4. Calculate rainfall error
   5. Calculate rain/no-rain accuracy
   6. Calculate MAE
   7. Maintain historical accuracy records

   IMPORTANT:
   ---------------------------------------------------------
   This version uses browser localStorage.

   It does NOT invent actual rainfall.
   It does NOT claim 95% accuracy.
   It does NOT treat model consensus as measured accuracy.

   A reliable observation source can be connected later.
   ========================================================= */


(() => {

    "use strict";


    /* =====================================================
       CONFIGURATION
       ===================================================== */

    const STORAGE_KEY =
        "rrp_accuracy_records_v1";


    const FORECAST_STORAGE_KEY =
        "rrp_forecast_snapshots_v1";


    const RAIN_THRESHOLD_MM =
        0.1;


    /* =====================================================
       STATE
       ===================================================== */

    let records =
        loadRecords();


    let forecasts =
        loadForecasts();


    /* =====================================================
       BASIC HELPERS
       ===================================================== */

    function number(value) {

        const n =
            Number(value);

        return Number.isFinite(n)
            ? n
            : 0;

    }


    function escapeHTML(value) {

        return String(
            value == null
                ? ""
                : value
        )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

    }


    function round(
        value,
        decimals = 1
    ) {

        const multiplier =
            Math.pow(
                10,
                decimals
            );

        return Math.round(
            number(value) *
            multiplier
        ) / multiplier;

    }


    function getNowISO() {

        return new Date()
            .toISOString();

    }


    function createID() {

        return (
            "rrp_" +
            Date.now() +
            "_" +
            Math.random()
                .toString(36)
                .slice(2, 9)
        );

    }


    /* =====================================================
       LOCAL STORAGE
       ===================================================== */

    function loadRecords() {

        try {

            const saved =
                localStorage.getItem(
                    STORAGE_KEY
                );


            if (!saved) {

                return [];

            }


            const parsed =
                JSON.parse(
                    saved
                );


            return Array.isArray(
                parsed
            )
                ? parsed
                : [];

        } catch (error) {

            console.warn(
                "Accuracy records could not be loaded:",
                error
            );

            return [];

        }

    }


    function saveRecords() {

        try {

            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(records)
            );

        } catch (error) {

            console.warn(
                "Accuracy records could not be saved:",
                error
            );

        }

    }


    function loadForecasts() {

        try {

            const saved =
                localStorage.getItem(
                    FORECAST_STORAGE_KEY
                );


            if (!saved) {

                return [];

            }


            const parsed =
                JSON.parse(
                    saved
                );


            return Array.isArray(
                parsed
            )
                ? parsed
                : [];

        } catch (error) {

            console.warn(
                "Forecast snapshots could not be loaded:",
                error
            );

            return [];

        }

    }


    function saveForecasts() {

        try {

            localStorage.setItem(
                FORECAST_STORAGE_KEY,
                JSON.stringify(
                    forecasts
                )
            );

        } catch (error) {

            console.warn(
                "Forecast snapshots could not be saved:",
                error
            );

        }

    }


    /* =====================================================
       NORMALIZE LOCATION
       ===================================================== */

    function locationKey(
        location
    ) {

        if (!location) {

            return "unknown";

        }


        const latitude =
            round(
                location.latitude,
                4
            );


        const longitude =
            round(
                location.longitude,
                4
            );


        return (
            latitude +
            "," +
            longitude
        );

    }


    /* =====================================================
       SAVE FORECAST SNAPSHOT
       ===================================================== */

    function saveForecastSnapshot(
        data
    ) {

        if (!data) {

            return null;

        }


        const location =
            data.location ||
            {};


        const forecast =
            data.forecast ||
            {};


        const snapshot = {

            id:
                createID(),

            createdAt:
                getNowISO(),

            location: {

                name:
                    location.name ||
                    "Unknown",

                latitude:
                    number(
                        location.latitude
                    ),

                longitude:
                    number(
                        location.longitude
                    )

            },

            validFor:
                forecast.validFor ||
                null,

            forecastRainMM:
                round(
                    forecast.rainMM
                ),

            forecastProbability:
                round(
                    forecast.probability,
                    1
                ),

            source:
                forecast.source ||
                "Rajasthan Rain Predictor"

        };


        forecasts.push(
            snapshot
        );


        /*
        Keep browser storage from growing
        forever.
        */

        if (
            forecasts.length >
            1000
        ) {

            forecasts =
                forecasts.slice(
                    -1000
                );

        }


        saveForecasts();


        return snapshot;

    }


    /* =====================================================
       RECORD ACTUAL OBSERVATION
       ===================================================== */

    function addObservation(
        data
    ) {

        if (!data) {

            return null;

        }


        const forecastRain =
            number(
                data.forecastRainMM
            );


        const actualRain =
            number(
                data.actualRainMM
            );


        const forecastProbability =
            number(
                data.forecastProbability
            );


        const forecastRainFlag =
            forecastRain >=
            RAIN_THRESHOLD_MM;


        const actualRainFlag =
            actualRain >=
            RAIN_THRESHOLD_MM;


        const rainCorrect =
            forecastRainFlag ===
            actualRainFlag;


        const absoluteError =
            Math.abs(
                forecastRain -
                actualRain
            );


        const signedError =
            forecastRain -
            actualRain;


        const record = {

            id:
                data.id ||
                createID(),

            createdAt:
                getNowISO(),

            location: {

                name:
                    data.locationName ||
                    "Unknown",

                latitude:
                    number(
                        data.latitude
                    ),

                longitude:
                    number(
                        data.longitude
                    )

            },

            forecast: {

                rainfallMM:
                    round(
                        forecastRain
                    ),

                probability:
                    round(
                        forecastProbability,
                        1
                    )

            },

            actual: {

                rainfallMM:
                    round(
                        actualRain
                    )

            },

            error: {

                absoluteMM:
                    round(
                        absoluteError
                    ),

                signedMM:
                    round(
                        signedError
                    )

            },

            rainNoRain:

                rainCorrect
                    ? "correct"
                    : "incorrect",

            observationSource:
                data.observationSource ||
                "Manual observation",

            notes:
                data.notes ||
                ""

        };


        records.push(
            record
        );


        /*
        Keep only the latest
        5000 records in browser storage.
        */

        if (
            records.length >
            5000
        ) {

            records =
                records.slice(
                    -5000
                );

        }


        saveRecords();


        renderAccuracy();


        return record;

    }


    /* =====================================================
       FIND MATCHING FORECAST
       ===================================================== */

    function findForecast(
        id
    ) {

        if (!id) {

            return null;

        }


        return forecasts.find(
            forecast =>
                forecast.id === id
        ) || null;

    }


    /* =====================================================
       CALCULATE STATISTICS
       ===================================================== */

    function calculateStatistics(
        filteredRecords
    ) {

        const data =
            Array.isArray(
                filteredRecords
            )
                ? filteredRecords
                : [];


        if (!data.length) {

            return {

                records:
                    0,

                mae:
                    null,

                meanSignedError:
                    null,

                rainNoRainAccuracy:
                    null,

                totalForecastRain:
                    0,

                totalActualRain:
                    0

            };

        }


        const absoluteErrors =
            data.map(
                record =>
                    number(
                        record.error?.absoluteMM
                    )
            );


        const signedErrors =
            data.map(
                record =>
                    number(
                        record.error?.signedMM
                    )
            );


        const correctRainFlags =
            data.filter(
                record =>
                    record.rainNoRain ===
                    "correct"
            ).length;


        const totalForecastRain =
            data.reduce(
                (
                    sum,
                    record
                ) =>
                    sum +
                    number(
                        record.forecast?.rainfallMM
                    ),
                0
            );


        const totalActualRain =
            data.reduce(
                (
                    sum,
                    record
                ) =>
                    sum +
                    number(
                        record.actual?.rainfallMM
                    ),
                0
            );


        const mae =
            absoluteErrors.reduce(
                (
                    sum,
                    value
                ) =>
                    sum + value,
                0
            ) /
            data.length;


        const meanSignedError =
            signedErrors.reduce(
                (
                    sum,
                    value
                ) =>
                    sum + value,
                0
            ) /
            data.length;


        const rainNoRainAccuracy =
            (
                correctRainFlags /
                data.length
            ) *
            100;


        return {

            records:
                data.length,

            mae:
                round(
                    mae,
                    2
                ),

            meanSignedError:
                round(
                    meanSignedError,
                    2
                ),

            rainNoRainAccuracy:
                round(
                    rainNoRainAccuracy,
                    1
                ),

            totalForecastRain:
                round(
                    totalForecastRain,
                    1
                ),

            totalActualRain:
                round(
                    totalActualRain,
                    1
                )

        };

    }


    /* =====================================================
       LOCATION FILTER
       ===================================================== */

    function getLocationRecords(
        location
    ) {

        if (!location) {

            return records;

        }


        const key =
            locationKey(
                location
            );


        return records.filter(
            record =>
                locationKey(
                    record.location
                ) === key
        );

    }


    /* =====================================================
       RENDER ACCURACY UI
       ===================================================== */

    function renderAccuracy() {

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


        /*
        Global statistics
        */

        const stats =
            calculateStatistics(
                records
            );


        if (accuracyElement) {

            accuracyElement.textContent =
                stats.rainNoRainAccuracy === null
                    ? "--%"
                    : stats.rainNoRainAccuracy +
                      "%";

        }


        if (dataPointsElement) {

            dataPointsElement.textContent =
                String(
                    stats.records
                );

        }


        if (historicalElement) {

            historicalElement.textContent =
                String(
                    forecasts.length
                );

        }


        renderAccuracyPanel();

    }


    /* =====================================================
       CREATE ACCURACY PANEL
       ===================================================== */

    function getPanel() {

        let panel =
            document.getElementById(
                "accuracyEnginePanel"
            );


        if (panel) {

            return panel;

        }


        panel =
            document.createElement(
                "div"
            );


        panel.id =
            "accuracyEnginePanel";


        panel.style.marginTop =
            "18px";


        panel.style.padding =
            "18px";


        panel.style.borderRadius =
            "16px";


        panel.style.background =
            "#f8fafc";


        panel.style.border =
            "1px solid #e2e8f0";


        const target =
            document.querySelector(
                ".accuracy-section"
            );


        if (target) {

            target.appendChild(
                panel
            );

        }


        return panel;

    }


    /* =====================================================
       RENDER ACCURACY PANEL
       ===================================================== */

    function renderAccuracyPanel() {

        const panel =
            getPanel();


        if (!panel) {

            return;

        }


        const stats =
            calculateStatistics(
                records
            );


        const recent =
            records
                .slice(-10)
                .reverse();


        let recentHTML = "";


        if (!recent.length) {

            recentHTML = `

                <div style="
                    padding:15px;
                    background:white;
                    border-radius:12px;
                    color:#64748b;
                ">

                    No verified rainfall observations
                    have been recorded yet.

                </div>

            `;

        } else {

            recentHTML =
                recent.map(
                    record => `

                        <div style="
                            display:grid;
                            grid-template-columns:
                                1.3fr
                                0.8fr
                                0.8fr
                                0.8fr;
                            gap:8px;
                            padding:9px 0;
                            border-bottom:
                                1px solid #e2e8f0;
                            font-size:13px;
                        ">

                            <span>
                                ${escapeHTML(
                                    record.location?.name ||
                                    "Unknown"
                                )}
                            </span>

                            <span>
                                Forecast:
                                ${number(
                                    record.forecast?.rainfallMM
                                ).toFixed(1)}
                                mm
                            </span>

                            <span>
                                Actual:
                                ${number(
                                    record.actual?.rainfallMM
                                ).toFixed(1)}
                                mm
                            </span>

                            <span>
                                Error:
                                ${number(
                                    record.error?.absoluteMM
                                ).toFixed(1)}
                                mm
                            </span>

                        </div>

                    `
                )
                .join("");

        }


        panel.innerHTML = `

            <h3 style="
                margin-bottom:8px;
            ">
                📊 Verified Accuracy Records
            </h3>


            <p style="
                color:#64748b;
                font-size:13px;
                margin-bottom:15px;
            ">

                Accuracy is calculated only from
                forecast records that have a
                recorded actual rainfall observation.

            </p>


            <div style="
                display:grid;
                grid-template-columns:
                    repeat(3,minmax(0,1fr));
                gap:10px;
                margin-bottom:18px;
            ">


                <div style="
                    background:white;
                    padding:14px;
                    border-radius:12px;
                ">

                    <small>
                        Verified Records
                    </small>

                    <strong style="
                        display:block;
                        font-size:22px;
                        margin-top:3px;
                    ">
                        ${stats.records}
                    </strong>

                </div>


                <div style="
                    background:white;
                    padding:14px;
                    border-radius:12px;
                ">

                    <small>
                        Rain/No-Rain Accuracy
                    </small>

                    <strong style="
                        display:block;
                        font-size:22px;
                        margin-top:3px;
                    ">

                        ${
                            stats.rainNoRainAccuracy === null
                                ? "--"
                                : stats.rainNoRainAccuracy +
                                  "%"
                        }

                    </strong>

                </div>


                <div style="
                    background:white;
                    padding:14px;
                    border-radius:12px;
                ">

                    <small>
                        Mean Absolute Error
                    </small>

                    <strong style="
                        display:block;
                        font-size:22px;
                        margin-top:3px;
                    ">

                        ${
                            stats.mae === null
                                ? "--"
                                : stats.mae +
                                  " mm"
                        }

                    </strong>

                </div>


            </div>


            <h4 style="
                margin-bottom:8px;
            ">
                Recent Verified Records
            </h4>


            <div>
                ${recentHTML}
            </div>


            <div style="
                margin-top:15px;
                padding:12px;
                background:#eff6ff;
                border-radius:10px;
                color:#334155;
                font-size:12px;
            ">

                ℹ️ This system does not treat
                ECMWF/GFS/ICON agreement as accuracy.
                Accuracy requires independent actual
                rainfall observations.

            </div>

        `;

    }


    /* =====================================================
       MANUAL OBSERVATION FORM
       ===================================================== */

    function createObservationForm() {

        const existing =
            document.getElementById(
                "manualObservationForm"
            );


        if (existing) {

            return;

        }


        const target =
            document.querySelector(
                ".accuracy-section"
            );


        if (!target) {

            return;

        }


        const wrapper =
            document.createElement(
                "div"
            );


        wrapper.id =
            "manualObservationForm";


        wrapper.style.marginTop =
            "20px";


        wrapper.style.padding =
            "18px";


        wrapper.style.background =
            "white";


        wrapper.style.borderRadius =
            "16px";


        wrapper.style.border =
            "1px solid #e2e8f0";


        wrapper.innerHTML = `

            <h3 style="
                margin-bottom:5px;
            ">
                📝 Record Actual Rainfall
            </h3>


            <p style="
                color:#64748b;
                font-size:13px;
                margin-bottom:15px;
            ">

                Enter an independently observed rainfall
                value to calculate forecast error.

            </p>


            <div style="
                display:grid;
                grid-template-columns:
                    repeat(3,minmax(0,1fr));
                gap:10px;
            ">


                <input
                    id="accuracyLocationName"
                    type="text"
                    placeholder="Location"
                    style="
                        width:100%;
                        padding:11px;
                        border:1px solid #cbd5e1;
                        border-radius:9px;
                    "
                >


                <input
                    id="accuracyForecastRain"
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="Forecast rain (mm)"
                    style="
                        width:100%;
                        padding:11px;
                        border:1px solid #cbd5e1;
                        border-radius:9px;
                    "
                >


                <input
                    id="accuracyActualRain"
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="Actual rain (mm)"
                    style="
                        width:100%;
                        padding:11px;
                        border:1px solid #cbd5e1;
                        border-radius:9px;
                    "
                >

            </div>


            <div style="
                margin-top:10px;
                display:flex;
                gap:10px;
                flex-wrap:wrap;
            ">


                <input
                    id="accuracyObservationSource"
                    type="text"
                    placeholder="Observation source"
                    style="
                        flex:1;
                        min-width:220px;
                        padding:11px;
                        border:1px solid #cbd5e1;
                        border-radius:9px;
                    "
                >


                <button
                    id="saveAccuracyObservation"
                    type="button"
                    style="
                        padding:11px 18px;
                        border:0;
                        border-radius:9px;
                        background:#0284c7;
                        color:white;
                        font-weight:bold;
                        cursor:pointer;
                    "
                >
                    Save Observation
                </button>

            </div>


            <p
                id="accuracyObservationMessage"
                style="
                    margin-top:10px;
                    font-size:13px;
                    color:#64748b;
                "
            ></p>

        `;


        target.appendChild(
            wrapper
        );


        const saveButton =
            document.getElementById(
                "saveAccuracyObservation"
            );


        if (saveButton) {

            saveButton.addEventListener(
                "click",
                saveManualObservation
            );

        }

    }


    /* =====================================================
       SAVE MANUAL OBSERVATION
       ===================================================== */

    function saveManualObservation() {

        const locationName =
            document.getElementById(
                "accuracyLocationName"
            )?.value
            ?.trim();


        const forecastRain =
            document.getElementById(
                "accuracyForecastRain"
            )?.value;


        const actualRain =
            document.getElementById(
                "accuracyActualRain"
            )?.value;


        const source =
            document.getElementById(
                "accuracyObservationSource"
            )?.value
            ?.trim();


        const message =
            document.getElementById(
                "accuracyObservationMessage"
            );


        if (!locationName) {

            if (message) {

                message.textContent =
                    "Please enter the location.";

            }

            return;

        }


        if (
            forecastRain ===
            "" ||
            actualRain ===
            ""
        ) {

            if (message) {

                message.textContent =
                    "Please enter both forecast and actual rainfall.";

            }

            return;

        }


        const record =
            addObservation({

                locationName,

                forecastRainMM:
                    number(
                        forecastRain
                    ),

                actualRainMM:
                    number(
                        actualRain
                    ),

                observationSource:
                    source ||
                    "Manual observation"

            });


        if (message) {

            message.textContent =
                "Observation saved. Forecast error: " +
                record.error.absoluteMM.toFixed(1) +
                " mm";

        }


        const actualInput =
            document.getElementById(
                "accuracyActualRain"
            );


        if (actualInput) {

            actualInput.value =
                "";

        }


        renderAccuracy();

    }


    /* =====================================================
       AUTO CONNECT TO CURRENT APP
       ===================================================== */

    function captureCurrentForecast() {

        /*
        The main app can expose latest weather data.
        We deliberately do not assume a forecast is
        an actual observation.
        */

        const app =
            window.RRP_APP;


        if (
            !app ||
            typeof app.getCurrentLocation !==
                "function"
        ) {

            return null;

        }


        const location =
            app.getCurrentLocation();


        const weather =
            typeof app.getLatestWeather ===
                "function"
                ? app.getLatestWeather()
                : null;


        if (
            !location ||
            !weather
        ) {

            return null;

        }


        const hourly =
            weather.hourly ||
            {};


        const times =
            hourly.time ||
            [];


        if (!times.length) {

            return null;

        }


        let currentIndex =
            0;


        const now =
            Date.now();


        let smallest =
            Infinity;


        times.forEach(
            (
                time,
                index
            ) => {

                const difference =
                    Math.abs(
                        new Date(
                            time
                        ).getTime() -
                        now
                    );


                if (
                    difference <
                    smallest
                ) {

                    smallest =
                        difference;

                    currentIndex =
                        index;

                }

            }
        );


        const rain =
            number(
                hourly
                    .precipitation?.[
                        currentIndex
                    ]
            );


        const probability =
            number(
                hourly
                    .precipitation_probability?.[
                        currentIndex
                    ]
            );


        return saveForecastSnapshot({

            location,

            forecast: {

                validFor:
                    times[
                        currentIndex
                    ] ||
                    null,

                rainMM:
                    rain,

                probability:
                    probability,

                source:
                    "Open-Meteo forecast"

            }

        });

    }


    /* =====================================================
       PUBLIC API
       ===================================================== */

    window.RRP_ACCURACY =
        {

            getRecords:
                function () {

                    return [
                        ...records
                    ];

                },


            getForecasts:
                function () {

                    return [
                        ...forecasts
                    ];

                },


            addObservation:
                addObservation,


            saveForecastSnapshot:
                saveForecastSnapshot,


            captureCurrentForecast:
                captureCurrentForecast,


            calculateStatistics:
                calculateStatistics,


            getLocationRecords:
                getLocationRecords,


            render:
                renderAccuracy

        };


    /* =====================================================
       EVENTS
       ===================================================== */

    window.addEventListener(
        "rrp:weather-updated",
        function () {

            /*
            Save a forecast snapshot whenever
            fresh weather data arrives.

            This is a FORECAST record only.
            It is not actual rainfall.
            */

            try {

                captureCurrentForecast();

            } catch (error) {

                console.warn(
                    "Forecast snapshot failed:",
                    error
                );

            }


            renderAccuracy();

        }
    );


    /* =====================================================
       INITIALIZATION
       ===================================================== */

    function initialize() {

        renderAccuracy();


        /*
        Wait for the main dashboard DOM
        and then add the observation form.
        */

        setTimeout(
            function () {

                createObservationForm();

                renderAccuracy();

            },
            700
        );

    }


    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            initialize
        );

    } else {

        initialize();

    }


})();
