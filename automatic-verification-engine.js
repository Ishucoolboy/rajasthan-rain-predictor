(function () {
    "use strict";

    /*
     * Rajasthan Rain Predictor
     * Automatic Verification Engine V3
     *
     * Priority:
     *
     * 1. Independent / manual actual observations
     * 2. ERA5 / Open-Meteo reanalysis fallback
     *
     * IMPORTANT:
     * This engine does NOT claim a fixed forecast accuracy.
     * Accuracy depends on the quantity and quality of verified
     * observations available.
     */

    const VERSION = "3.0";

    const STORAGE_KEY =
        "rrp_automatic_verification_v3";

    const SNAPSHOT_KEY =
        "rrp_forecast_snapshots_v1";

    const OBSERVATION_KEY =
        "rrp_actual_observations_v1";

    const RAIN_THRESHOLD_MM = 0.1;

    const MODEL_NAMES = [
        "ECMWF",
        "GFS",
        "ICON"
    ];

    let running = false;

    let lastRunTime = 0;

    const RUN_COOLDOWN_MS = 60000;


    /*
     * =========================================================
     * LOGGING
     * =========================================================
     */

    function log(...args) {
        console.log(
            "[RRP Automatic Verification V3]",
            ...args
        );
    }


    function warn(...args) {
        console.warn(
            "[RRP Automatic Verification V3]",
            ...args
        );
    }


    /*
     * =========================================================
     * BASIC HELPERS
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


    function clamp(
        value,
        min,
        max
    ) {
        return Math.max(
            min,
            Math.min(
                max,
                value
            )
        );
    }


    function escapeHTML(value) {
        return String(
            value ?? ""
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


    /*
     * =========================================================
     * LOCAL STORAGE
     * =========================================================
     */

    function readArray(
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

            return Array.isArray(data)
                ? data
                : [];

        } catch (error) {

            warn(
                "Could not read storage:",
                key,
                error
            );

            return [];

        }
    }


    function saveArray(
        key,
        value
    ) {
        try {

            localStorage.setItem(
                key,
                JSON.stringify(
                    value
                )
            );

            return true;

        } catch (error) {

            warn(
                "Could not save storage:",
                key,
                error
            );

            return false;

        }
    }


    function getSnapshots() {
        return readArray(
            SNAPSHOT_KEY
        );
    }


    function getObservations() {
        return readArray(
            OBSERVATION_KEY
        );
    }


    function getRecords() {
        return readArray(
            STORAGE_KEY
        );
    }


    /*
     * =========================================================
     * DATE
     * =========================================================
     */

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

        const year =
            parsed.getFullYear();

        const month =
            String(
                parsed.getMonth() + 1
            ).padStart(
                2,
                "0"
            );

        const day =
            String(
                parsed.getDate()
            ).padStart(
                2,
                "0"
            );

        return (
            year +
            "-" +
            month +
            "-" +
            day
        );
    }


    function isPastDate(
        value
    ) {
        const date =
            normalizeDate(
                value
            );

        if (!date) {
            return false;
        }

        const today =
            new Date()
                .toISOString()
                .slice(
                    0,
                    10
                );

        return date < today;
    }


    /*
     * =========================================================
     * MODEL
     * =========================================================
     */

    function getModel(
        snapshot
    ) {
        const model =
            String(
                snapshot.model ||
                snapshot.modelName ||
                ""
            ).toUpperCase();

        const modelId =
            String(
                snapshot.modelId ||
                ""
            ).toLowerCase();


        if (
            model.includes(
                "ECMWF"
            ) ||
            modelId.includes(
                "ecmwf"
            )
        ) {
            return "ECMWF";
        }


        if (
            model.includes(
                "GFS"
            ) ||
            modelId.includes(
                "gfs"
            )
        ) {
            return "GFS";
        }


        if (
            model.includes(
                "ICON"
            ) ||
            modelId.includes(
                "icon"
            )
        ) {
            return "ICON";
        }


        return null;
    }


    /*
     * =========================================================
     * FORECAST VALUES
     * =========================================================
     */

    function getForecastRain(
        snapshot
    ) {
        const candidates = [

            snapshot.forecastRainOnlyMm,

            snapshot.forecastRainMm,

            snapshot.rainfallMm,

            snapshot.rainfall,

            snapshot.rainAmount,

            snapshot.precipitation

        ];


        for (
            const value of candidates
        ) {

            const n =
                number(
                    value
                );

            if (n !== null) {
                return Math.max(
                    0,
                    n
                );
            }

        }


        return null;
    }


    function getForecastProbability(
        snapshot
    ) {
        const candidates = [

            snapshot.rainProbability,

            snapshot.precipitationProbability,

            snapshot.probability

        ];


        for (
            const value of candidates
        ) {

            const n =
                number(
                    value
                );

            if (
                n !== null &&
                n >= 0 &&
                n <= 100
            ) {

                return n;

            }

        }


        return null;
    }


    /*
     * =========================================================
     * LOCATION
     * =========================================================
     */

    function getLocationName(
        item
    ) {
        return String(
            item.locationName ||
            item.location ||
            item.name ||
            "Unknown location"
        ).trim();
    }


    function getLocationKey(
        item
    ) {
        const lat =
            number(
                item.latitude
            );

        const lon =
            number(
                item.longitude
            );

        const name =
            getLocationName(
                item
            );


        if (
            lat !== null &&
            lon !== null
        ) {

            return (
                name +
                "|" +
                lat.toFixed(
                    3
                ) +
                "|" +
                lon.toFixed(
                    3
                )
            );

        }


        return name;
    }


    function coordinatesMatch(
        snapshot,
        observation
    ) {
        const snapshotLat =
            number(
                snapshot.latitude
            );

        const snapshotLon =
            number(
                snapshot.longitude
            );

        const observationLat =
            number(
                observation.latitude
            );

        const observationLon =
            number(
                observation.longitude
            );


        if (
            snapshotLat === null ||
            snapshotLon === null ||
            observationLat === null ||
            observationLon === null
        ) {
            return false;
        }


        const tolerance =
            0.08;


        return (
            Math.abs(
                snapshotLat -
                observationLat
            ) <= tolerance &&

            Math.abs(
                snapshotLon -
                observationLon
            ) <= tolerance
        );
    }


    function normalizeLocationName(
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


    function locationNameMatch(
        snapshot,
        observation
    ) {
        const a =
            normalizeLocationName(
                getLocationName(
                    snapshot
                )
            );

        const b =
            normalizeLocationName(
                getLocationName(
                    observation
                )
            );

        if (
            !a ||
            !b
        ) {
            return false;
        }

        return a === b;
    }


    function locationsMatch(
        snapshot,
        observation
    ) {
        if (
            coordinatesMatch(
                snapshot,
                observation
            )
        ) {
            return true;
        }

        return locationNameMatch(
            snapshot,
            observation
        );
    }


    /*
     * =========================================================
     * ACTUAL OBSERVATION
     * =========================================================
     */

    function getActualObservationRain(
        observation
    ) {
        const candidates = [

            observation.rainfall_mm,

            observation.rainfallMm,

            observation.precipitation_mm,

            observation.precipitationMm,

            observation.actualRainMm,

            observation.rainfall,

            observation.rainAmount

        ];


        for (
            const value of candidates
        ) {

            const n =
                number(
                    value
                );

            if (n !== null) {
                return Math.max(
                    0,
                    n
                );
            }

        }


        return null;
    }


    function findActualObservation(
        snapshot
    ) {
        const observations =
            getObservations();

        const targetDate =
            normalizeDate(
                snapshot.validDate
            );

        if (
            !targetDate
        ) {
            return null;
        }


        const matches =
            observations.filter(
                function (
                    observation
                ) {

                    const observationDate =
                        normalizeDate(
                            observation.date ||
                            observation.validDate ||
                            observation.observationDate
                        );

                    if (
                        observationDate !==
                        targetDate
                    ) {
                        return false;
                    }


                    return locationsMatch(
                        snapshot,
                        observation
                    );

                }
            );


        if (
            !matches.length
        ) {
            return null;
        }


        /*
         * Prefer an explicitly independent
         * source when several observations
         * exist.
         */

        matches.sort(
            function (
                a,
                b
            ) {

                const aIndependent =
                    isIndependentObservation(
                        a
                    )
                        ? 1
                        : 0;

                const bIndependent =
                    isIndependentObservation(
                        b
                    )
                        ? 1
                        : 0;


                if (
                    aIndependent !==
                    bIndependent
                ) {

                    return (
                        bIndependent -
                        aIndependent
                    );

                }


                const aTime =
                    Date.parse(
                        a.createdAt ||
                        a.timestamp ||
                        0
                    );

                const bTime =
                    Date.parse(
                        b.createdAt ||
                        b.timestamp ||
                        0
                    );


                return (
                    bTime -
                    aTime
                );

            }
        );


        return matches[0];
    }


    function isIndependentObservation(
        observation
    ) {
        const source =
            String(
                observation.source ||
                observation.observationSource ||
                ""
            ).toLowerCase();


        return (
            source.includes(
                "imd"
            ) ||
            source.includes(
                "gauge"
            ) ||
            source.includes(
                "rain gauge"
            ) ||
            source.includes(
                "station"
            ) ||
            source.includes(
                "manual"
            ) ||
            source.includes(
                "actual"
            )
        );
    }


    /*
     * =========================================================
     * ERA5 FALLBACK
     * =========================================================
     */

    async function fetchReferenceRainfall(
        latitude,
        longitude,
        startDate,
        endDate
    ) {

        const url =
            "https://archive-api.open-meteo.com/v1/archive" +

            `?latitude=${encodeURIComponent(
                latitude
            )}` +

            `&longitude=${encodeURIComponent(
                longitude
            )}` +

            `&start_date=${encodeURIComponent(
                startDate
            )}` +

            `&end_date=${encodeURIComponent(
                endDate
            )}` +

            `&daily=precipitation_sum` +

            `&timezone=auto` +

            `&precipitation_unit=mm`;


        log(
            "ERA5 request:",
            startDate,
            "→",
            endDate
        );


        const response =
            await fetch(
                url
            );


        if (
            !response.ok
        ) {

            throw new Error(
                "Historical API HTTP " +
                response.status
            );

        }


        const data =
            await response.json();


        if (
            !data.daily ||
            !Array.isArray(
                data.daily.time
            ) ||
            !Array.isArray(
                data.daily.precipitation_sum
            )
        ) {

            throw new Error(
                "Historical rainfall data incomplete."
            );

        }


        const result = {};


        data.daily.time.forEach(
            function (
                date,
                index
            ) {

                const rainfall =
                    number(
                        data.daily
                            .precipitation_sum[
                                index
                            ]
                    );


                if (
                    rainfall !== null
                ) {

                    result[date] =
                        rainfall;

                }

            }
        );


        return result;
    }


    /*
     * =========================================================
     * CLASSIFICATION
     * =========================================================
     */

    function isRain(
        value
    ) {
        const n =
            number(
                value
            );

        if (
            n === null
        ) {
            return false;
        }

        return (
            n >=
            RAIN_THRESHOLD_MM
        );
    }


    /*
     * =========================================================
     * RECORD KEY
     * =========================================================
     */

    function makeVerificationKey(
        snapshot,
        model,
        source
    ) {
        return [

            normalizeDate(
                snapshot.validDate
            ),

            getLocationKey(
                snapshot
            ),

            model,

            snapshot.modelId ||
            "",

            source

        ].join(
            "|"
        );
    }


    /*
     * =========================================================
     * CREATE RECORD
     * =========================================================
     */

    function createRecord(
        snapshot,
        model,
        actualRain,
        source,
        sourceDetail
    ) {
        const forecastRain =
            getForecastRain(
                snapshot
            );

        if (
            forecastRain === null ||
            actualRain === null
        ) {
            return null;
        }


        const probability =
            getForecastProbability(
                snapshot
            );


        const error =
            forecastRain -
            actualRain;


        const forecastRainEvent =
            isRain(
                forecastRain
            );

        const actualRainEvent =
            isRain(
                actualRain
            );


        let brierScore =
            null;


        if (
            probability !== null
        ) {

            const p =
                probability /
                100;

            const outcome =
                actualRainEvent
                    ? 1
                    : 0;


            brierScore =
                Math.pow(
                    p -
                    outcome,
                    2
                );

        }


        return {

            verificationKey:
                makeVerificationKey(
                    snapshot,
                    model,
                    source
                ),

            version:
                VERSION,

            verifiedAt:
                new Date()
                    .toISOString(),

            validDate:
                normalizeDate(
                    snapshot.validDate
                ),

            locationName:
                getLocationName(
                    snapshot
                ),

            latitude:
                number(
                    snapshot.latitude
                ),

            longitude:
                number(
                    snapshot.longitude
                ),

            model:
                model,

            modelId:
                snapshot.modelId ||
                null,

            forecastRainMm:
                round(
                    forecastRain,
                    2
                ),

            actualRainMm:
                round(
                    actualRain,
                    2
                ),

            forecastProbability:
                probability !== null
                    ? round(
                        probability,
                        1
                    )
                    : null,

            absoluteError:
                round(
                    Math.abs(
                        error
                    ),
                    2
                ),

            signedError:
                round(
                    error,
                    2
                ),

            squaredError:
                round(
                    error *
                    error,
                    4
                ),

            forecastHadRain:
                forecastRainEvent,

            actualHadRain:
                actualRainEvent,

            hit:
                forecastRainEvent &&
                actualRainEvent,

            falseAlarm:
                forecastRainEvent &&
                !actualRainEvent,

            miss:
                !forecastRainEvent &&
                actualRainEvent,

            correctNoRain:
                !forecastRainEvent &&
                !actualRainEvent,

            brierScore:
                brierScore !== null
                    ? round(
                        brierScore,
                        4
                    )
                    : null,

            verificationSource:
                source,

            verificationSourceDetail:
                sourceDetail,

            independentObservation:
                source ===
                "actual-observation"

        };
    }


    /*
     * =========================================================
     * METRICS
     * =========================================================
     */

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

                falseAlarms: 0,

                misses: 0,

                correctNoRain: 0,

                brierScore: null,

                brierSamples: 0

            };

        }


        let absoluteError = 0;

        let squaredError = 0;

        let biasTotal = 0;

        let correctRain = 0;

        let hits = 0;

        let falseAlarms = 0;

        let misses = 0;

        let correctNoRain = 0;

        let brierTotal = 0;

        let brierSamples = 0;


        records.forEach(
            function (
                record
            ) {

                const forecast =
                    number(
                        record.forecastRainMm,
                        0
                    );

                const actual =
                    number(
                        record.actualRainMm,
                        0
                    );


                const error =
                    forecast -
                    actual;


                absoluteError +=
                    Math.abs(
                        error
                    );


                squaredError +=
                    error *
                    error;


                biasTotal +=
                    error;


                const forecastRain =
                    isRain(
                        forecast
                    );

                const actualRain =
                    isRain(
                        actual
                    );


                if (
                    forecastRain ===
                    actualRain
                ) {

                    correctRain++;

                }


                if (
                    forecastRain &&
                    actualRain
                ) {
                    hits++;
                }


                if (
                    forecastRain &&
                    !actualRain
                ) {
                    falseAlarms++;
                }


                if (
                    !forecastRain &&
                    actualRain
                ) {
                    misses++;
                }


                if (
                    !forecastRain &&
                    !actualRain
                ) {
                    correctNoRain++;
                }


                const probability =
                    number(
                        record.forecastProbability
                    );


                if (
                    probability !== null
                ) {

                    const p =
                        clamp(
                            probability /
                            100,
                            0,
                            1
                        );

                    const outcome =
                        actualRain
                            ? 1
                            : 0;


                    brierTotal +=
                        Math.pow(
                            p -
                            outcome,
                            2
                        );


                    brierSamples++;

                }

            }
        );


        return {

            samples:
                records.length,

            mae:
                round(
                    absoluteError /
                    records.length,
                    2
                ),

            rmse:
                round(
                    Math.sqrt(
                        squaredError /
                        records.length
                    ),
                    2
                ),

            bias:
                round(
                    biasTotal /
                    records.length,
                    2
                ),

            rainAccuracy:
                round(
                    (
                        correctRain /
                        records.length
                    ) *
                    100,
                    1
                ),

            hits:

                hits,

            falseAlarms:
                falseAlarms,

            misses:
                misses,

            correctNoRain:
                correctNoRain,

            brierScore:
                brierSamples
                    ? round(
                        brierTotal /
                        brierSamples,
                        4
                    )
                    : null,

            brierSamples:
                brierSamples

        };

    }


    function getMetricsByModel(
        records
    ) {

        const result = {};


        MODEL_NAMES.forEach(
            function (
                model
            ) {

                const modelRecords =
                    records.filter(
                        function (
                            record
                        ) {

                            return (
                                record.model ===
                                model
                            );

                        }
                    );


                result[model] =
                    calculateMetrics(
                        modelRecords
                    );

            }
        );


        return result;
    }


    /*
     * =========================================================
     * SOURCE SUMMARY
     * =========================================================
     */

    function getSourceSummary(
        records
    ) {

        const actual =
            records.filter(
                function (
                    record
                ) {

                    return (
                        record.verificationSource ===
                        "actual-observation"
                    );

                }
            ).length;


        const reanalysis =
            records.filter(
                function (
                    record
                ) {

                    return (
                        record.verificationSource ===
                        "era5-reanalysis"
                    );

                }
            ).length;


        return {

            actualObservation:
                actual,

            era5Reanalysis:
                reanalysis,

            total:
                records.length

        };

    }


    /*
     * =========================================================
     * DASHBOARD
     * =========================================================
     */

    function renderDashboard(
        records,
        pendingCount,
        statusMessage
    ) {

        const container =
            document.getElementById(
                "automaticAccuracy"
            );


        if (
            !container
        ) {
            return;
        }


        const metrics =
            getMetricsByModel(
                records
            );


        const sourceSummary =
            getSourceSummary(
                records
            );


        let html = `

            <div style="
                padding:20px;
                background:#f4f7fb;
                border-radius:14px;
                margin-top:20px;
            ">

                <h3>
                    🤖 Automatic Forecast vs Actual
                </h3>

                <p>
                    ${escapeHTML(
                        statusMessage ||
                        ""
                    )}
                </p>


                <div style="
                    display:grid;
                    grid-template-columns:
                        repeat(
                            auto-fit,
                            minmax(140px,1fr)
                        );
                    gap:10px;
                    margin:16px 0;
                ">

                    <div style="
                        background:white;
                        padding:14px;
                        border-radius:10px;
                    ">

                        <strong>
                            ${records.length}
                        </strong>

                        <br>

                        <small>
                            Verified Records
                        </small>

                    </div>


                    <div style="
                        background:white;
                        padding:14px;
                        border-radius:10px;
                    ">

                        <strong>
                            ${pendingCount}
                        </strong>

                        <br>

                        <small>
                            Pending Forecasts
                        </small>

                    </div>


                    <div style="
                        background:white;
                        padding:14px;
                        border-radius:10px;
                    ">

                        <strong>
                            ${
                                sourceSummary
                                    .actualObservation
                            }
                        </strong>

                        <br>

                        <small>
                            Actual Observations
                        </small>

                    </div>


                    <div style="
                        background:white;
                        padding:14px;
                        border-radius:10px;
                    ">

                        <strong>
                            ${
                                sourceSummary
                                    .era5Reanalysis
                            }
                        </strong>

                        <br>

                        <small>
                            ERA5 Reference
                        </small>

                    </div>

                </div>

        `;


        MODEL_NAMES.forEach(
            function (
                model
            ) {

                const m =
                    metrics[
                        model
                    ];


                html += `

                    <div style="
                        margin-top:15px;
                        padding:15px;
                        background:white;
                        border-radius:12px;
                    ">

                        <h3>
                            🛰️
                            ${escapeHTML(
                                model
                            )}
                        </h3>


                        <div style="
                            display:grid;
                            grid-template-columns:
                                repeat(
                                    auto-fit,
                                    minmax(
                                        105px,
                                        1fr
                                    )
                                );
                            gap:10px;
                        ">


                            <div>

                                <strong>
                                    ${
                                        m.samples
                                    }
                                </strong>

                                <br>

                                <small>
                                    Samples
                                </small>

                            </div>


                            <div>

                                <strong>
                                    ${
                                        m.mae === null
                                            ? "—"
                                            : m.mae +
                                              " mm"
                                    }
                                </strong>

                                <br>

                                <small>
                                    MAE
                                </small>

                            </div>


                            <div>

                                <strong>
                                    ${
                                        m.rmse === null
                                            ? "—"
                                            : m.rmse +
                                              " mm"
                                    }
                                </strong>

                                <br>

                                <small>
                                    RMSE
                                </small>

                            </div>


                            <div>

                                <strong>
                                    ${
                                        m.bias === null
                                            ? "—"
                                            : m.bias +
                                              " mm"
                                    }
                                </strong>

                                <br>

                                <small>
                                    Bias
                                </small>

                            </div>


                            <div>

                                <strong>
                                    ${
                                        m.rainAccuracy === null
                                            ? "—"
                                            : m.rainAccuracy +
                                              "%"
                                    }
                                </strong>

                                <br>

                                <small>
                                    Rain Accuracy
                                </small>

                            </div>


                            <div>

                                <strong>
                                    ${
                                        m.hits
                                    }
                                </strong>

                                <br>

                                <small>
                                    Hits
                                </small>

                            </div>


                            <div>

                                <strong>
                                    ${
                                        m.falseAlarms
                                    }
                                </strong>

                                <br>

                                <small>
                                    False Alarms
                                </small>

                            </div>


                            <div>

                                <strong>
                                    ${
                                        m.misses
                                    }
                                </strong>

                                <br>

                                <small>
                                    Misses
                                </small>

                            </div>


                            <div>

                                <strong>
                                    ${
                                        m.brierScore === null
                                            ? "—"
                                            : m.brierScore
                                    }
                                </strong>

                                <br>

                                <small>
                                    Brier
                                </small>

                            </div>


                        </div>

                    </div>

                `;

            }
        );


        html += `

                <div style="
                    margin-top:15px;
                    padding:15px;
                    border-radius:12px;
                    background:
                        rgba(
                            255,
                            193,
                            7,
                            .10
                        );
                    border:1px solid
                        rgba(
                            255,
                            193,
                            7,
                            .25
                        );
                    font-size:12px;
                    line-height:1.7;
                ">

                    <strong>
                        Verification source:
                    </strong>

                    Actual observations are preferred
                    whenever available.

                    ERA5 / Open-Meteo reanalysis is used
                    only as fallback when an actual
                    observation is unavailable.

                    <br><br>

                    ⚠️ ERA5/reanalysis verification
                    is NOT the same as independent
                    IMD/rain-gauge accuracy.

                </div>


                <div style="
                    margin-top:10px;
                    font-size:11px;
                    opacity:.75;
                ">

                    Automatic Verification Engine V${VERSION}

                </div>

            </div>

        `;


        container.innerHTML =
            html;

    }


    /*
     * =========================================================
     * MAIN RUN
     * =========================================================
     */

    async function run(
        force = false
    ) {

        const now =
            Date.now();


        if (
            running
        ) {

            log(
                "Verification already running. Skipping."
            );

            return null;

        }


        if (
            !force &&
            now -
                lastRunTime <
                RUN_COOLDOWN_MS
        ) {

            log(
                "Cooldown active. Skipping duplicate run."
            );

            return null;

        }


        running =
            true;

        lastRunTime =
            now;


        log(
            "================================="
        );

        log(
            "AUTOMATIC VERIFICATION V3 START"
        );

        log(
            "================================="
        );


        try {

            const snapshots =
                getSnapshots();


            const pastSnapshots =
                snapshots.filter(
                    function (
                        snapshot
                    ) {

                        return (
                            snapshot.validDate &&
                            isPastDate(
                                snapshot.validDate
                            )
                        );

                    }
                );


            let records =
                getRecords();


            log(
                "Forecast snapshots:",
                snapshots.length
            );

            log(
                "Past snapshots:",
                pastSnapshots.length
            );

            log(
                "Existing V3 records:",
                records.length
            );


            if (
                pastSnapshots.length === 0
            ) {

                renderDashboard(

                    records,

                    snapshots.length,

                    "⏳ Abhi koi completed forecast date nahi hai. Forecast date pass hone ke baad verification automatically chalega."

                );


                return {

                    processed: 0,

                    newRecords: 0,

                    totalRecords:
                        records.length,

                    pending:
                        snapshots.length

                };

            }


            const existingKeys =
                new Set(
                    records.map(
                        function (
                            record
                        ) {

                            return (
                                record.verificationKey
                            );

                        }
                    )
                );


            /*
             * -------------------------------------------------
             * STEP 1
             * ACTUAL OBSERVATION FIRST
             * -------------------------------------------------
             */

            let actualCount =
                0;


            pastSnapshots.forEach(
                function (
                    snapshot
                ) {

                    const model =
                        getModel(
                            snapshot
                        );


                    if (
                        !model
                    ) {
                        return;
                    }


                    const observation =
                        findActualObservation(
                            snapshot
                        );


                    if (
                        !observation
                    ) {
                        return;
                    }


                    const actualRain =
                        getActualObservationRain(
                            observation
                        );


                    if (
                        actualRain === null
                    ) {
                        return;
                    }


                    const source =
                        "actual-observation";


                    const key =
                        makeVerificationKey(
                            snapshot,
                            model,
                            source
                        );


                    if (
                        existingKeys.has(
                            key
                        )
                    ) {
                        return;
                    }


                    const sourceDetail =
                        observation.source ||
                        observation.observationSource ||
                        "Actual observation";


                    const record =
                        createRecord(
                            snapshot,
                            model,
                            actualRain,
                            source,
                            sourceDetail
                        );


                    if (
                        !record
                    ) {
                        return;
                    }


                    records.push(
                        record
                    );


                    existingKeys.add(
                        key
                    );


                    actualCount++;

                }
            );


            /*
             * -------------------------------------------------
             * STEP 2
             * ERA5 FALLBACK
             *
             * Only snapshots without actual observations
             * are sent to ERA5.
             * -------------------------------------------------
             */

            const unresolved =
                pastSnapshots.filter(
                    function (
                        snapshot
                    ) {

                        const model =
                            getModel(
                                snapshot
                            );


                        if (
                            !model
                        ) {
                            return false;
                        }


                        const observation =
                            findActualObservation(
                                snapshot
                            );


                        return (
                            !observation
                        );

                    }
                );


            /*
             * Group unresolved snapshots
             * by location.
             */

            const groups = {};


            unresolved.forEach(
                function (
                    snapshot
                ) {

                    const latitude =
                        number(
                            snapshot.latitude
                        );

                    const longitude =
                        number(
                            snapshot.longitude
                        );


                    const model =
                        getModel(
                            snapshot
                        );


                    if (
                        latitude === null ||
                        longitude === null ||
                        !model
                    ) {
                        return;
                    }


                    const key =
                        latitude.toFixed(
                            4
                        ) +
                        "|" +
                        longitude.toFixed(
                            4
                        );


                    if (
                        !groups[key]
                    ) {

                        groups[key] = {

                            latitude:
                                latitude,

                            longitude:
                                longitude,

                            snapshots: [],

                            dates:
                                new Set()

                        };

                    }


                    groups[key]
                        .snapshots
                        .push(
                            snapshot
                        );


                    groups[key]
                        .dates
                        .add(
                            snapshot.validDate
                        );

                }
            );


            let era5Count =
                0;


            for (
                const key of
                Object.keys(
                    groups
                )
            ) {

                const group =
                    groups[key];


                const dates =
                    Array.from(
                        group.dates
                    ).sort();


                if (
                    !dates.length
                ) {
                    continue;
                }


                const startDate =
                    dates[0];


                const endDate =
                    dates[
                        dates.length - 1
                    ];


                let reference;


                try {

                    reference =
                        await fetchReferenceRainfall(
                            group.latitude,
                            group.longitude,
                            startDate,
                            endDate
                        );

                } catch (
                    error
                ) {

                    warn(
                        "ERA5 request failed:",
                        error
                    );

                    continue;

                }


                group.snapshots.forEach(
                    function (
                        snapshot
                    ) {

                        /*
                         * If an actual observation became
                         * available, do not use ERA5.
                         */

                        if (
                            findActualObservation(
                                snapshot
                            )
                        ) {
                            return;
                        }


                        const model =
                            getModel(
                                snapshot
                            );


                        const forecast =
                            getForecastRain(
                                snapshot
                            );


                        const actualRain =
                            number(
                                reference[
                                    snapshot.validDate
                                ]
                            );


                        if (
                            !model ||
                            forecast === null ||
                            actualRain === null
                        ) {
                            return;
                        }


                        const source =
                            "era5-reanalysis";


                        const key =
                            makeVerificationKey(
                                snapshot,
                                model,
                                source
                            );


                        if (
                            existingKeys.has(
                                key
                            )
                        ) {
                            return;
                        }


                        const record =
                            createRecord(
                                snapshot,
                                model,
                                actualRain,
                                source,
                                "ERA5 / Open-Meteo reanalysis"
                            );


                        if (
                            !record
                        ) {
                            return;
                        }


                        records.push(
                            record
                        );


                        existingKeys.add(
                            key
                        );


                        era5Count++;

                    }
                );

            }


            /*
             * -------------------------------------------------
             * SORT
             * -------------------------------------------------
             */

            records.sort(
                function (
                    a,
                    b
                ) {

                    return String(
                        b.validDate
                    ).localeCompare(
                        String(
                            a.validDate
                        )
                    );

                }
            );


            saveArray(
                STORAGE_KEY,
                records
            );


            const pending =
                snapshots.length -
                pastSnapshots.length;


            renderDashboard(

                records,

                pending,

                `✅ Verification complete. Actual observations: ${actualCount}. ERA5 fallback records: ${era5Count}.`

            );


            log(
                "Actual observation records:",
                actualCount
            );

            log(
                "ERA5 fallback records:",
                era5Count
            );

            log(
                "Total V3 records:",
                records.length
            );

            log(
                "Pending forecasts:",
                pending
            );


            log(
                "================================="
            );

            log(
                "AUTOMATIC VERIFICATION V3 COMPLETE"
            );

            log(
                "================================="
            );


            return {

                processed:
                    pastSnapshots.length,

                newActualRecords:
                    actualCount,

                newEra5Records:
                    era5Count,

                newRecords:
                    actualCount +
                    era5Count,

                totalRecords:
                    records.length,

                pending:
                    pending

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

    function getAll() {
        return getRecords();
    }


    function getMetrics() {
        return getMetricsByModel(
            getRecords()
        );
    }


    function getSourceSummaryPublic() {
        return getSourceSummary(
            getRecords()
        );
    }


    function clear() {

        try {

            localStorage.removeItem(
                STORAGE_KEY
            );


            log(
                "Automatic V3 verification data cleared."
            );


            renderDashboard(
                [],
                0,
                "Verification data cleared."
            );

        } catch (
            error
        ) {

            warn(
                "Could not clear data:",
                error
            );

        }

    }


    /*
     * =========================================================
     * GLOBAL API
     * =========================================================
     */

    window.RRP_AUTOMATIC_VERIFICATION = {

        version:
            VERSION,

        run:
            run,

        getAll:
            getAll,

        getMetrics:
            getMetrics,

        getSourceSummary:
            getSourceSummaryPublic,

        clear:
            clear

    };


    /*
     * =========================================================
     * STARTUP
     * =========================================================
     */

    function startup() {

        setTimeout(
            function () {

                run()
                    .catch(
                        function (
                            error
                        ) {

                            console.error(
                                "[RRP Automatic Verification V3] Startup failed:",
                                error
                            );

                        }
                    );

            },
            3500
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


    /*
     * WEATHER UPDATE
     */

    window.addEventListener(
        "rrp:weather-updated",
        function () {

            setTimeout(
                function () {

                    run()
                        .catch(
                            function (
                                error
                            ) {

                                console.error(
                                    "[RRP Automatic Verification V3] Weather-update run failed:",
                                    error
                                );

                            }
                        );

                },
                2500
            );

        }
    );


    log(
        "Automatic Verification Engine V3 loaded."
    );

})();
