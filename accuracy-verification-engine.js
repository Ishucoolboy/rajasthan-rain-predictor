(function () {
    "use strict";

    /*
     * Rajasthan Rain Predictor
     * Accuracy Verification Engine V3
     *
     * Purpose:
     * - Compare saved forecast snapshots with actual observations.
     * - Calculate model-wise verification metrics.
     * - Keep forecast consistency separate from measured accuracy.
     *
     * IMPORTANT:
     * - Accuracy requires actual observations.
     * - Model agreement is NOT accuracy.
     * - A small sample should not be presented as a reliable long-term
     *   accuracy percentage.
     */

    const VERSION = "3.0";

    const OBSERVATION_KEY = "rrp_actual_observations_v1";
    const SNAPSHOT_KEY = "rrp_forecast_snapshots_v1";
    const RESULT_KEY = "rrp_verified_accuracy_v3";

    const MODELS = [
        {
            id: "ecmwf_ifs025",
            shortName: "ECMWF",
            name: "ECMWF"
        },
        {
            id: "gfs_seamless",
            shortName: "GFS",
            name: "GFS"
        },
        {
            id: "icon_seamless",
            shortName: "ICON",
            name: "ICON"
        }
    ];

    function log(...args) {
        console.log("[RRP Accuracy Verification V3]", ...args);
    }

    function warn(...args) {
        console.warn("[RRP Accuracy Verification V3]", ...args);
    }

    function number(value, fallback = null) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function round(value, decimals = 2) {
        const n = Number(value);

        if (!Number.isFinite(n)) {
            return null;
        }

        const factor = Math.pow(10, decimals);

        return Math.round(n * factor) / factor;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    /*
     * ---------------------------------------------------------
     * STORAGE
     * ---------------------------------------------------------
     */

    function loadJSON(key, fallback) {
        try {
            const raw = localStorage.getItem(key);

            if (!raw) {
                return fallback;
            }

            const parsed = JSON.parse(raw);

            return parsed ?? fallback;
        } catch (error) {
            warn("Storage read failed:", key, error);

            return fallback;
        }
    }

    function saveJSON(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));

            return true;
        } catch (error) {
            warn("Storage write failed:", key, error);

            return false;
        }
    }

    function getObservations() {
        const data = loadJSON(OBSERVATION_KEY, []);

        return Array.isArray(data) ? data : [];
    }

    function getSnapshots() {
        const data = loadJSON(SNAPSHOT_KEY, []);

        return Array.isArray(data) ? data : [];
    }

    /*
     * ---------------------------------------------------------
     * DATE HELPERS
     * ---------------------------------------------------------
     */

    function normalizeDate(value) {
        if (!value) {
            return null;
        }

        /*
         * We primarily work with YYYY-MM-DD forecast valid dates.
         * This avoids timezone shifting when parsing dates such as
         * "2026-09-18".
         */

        const text = String(value);

        const match = text.match(/^(\d{4}-\d{2}-\d{2})/);

        if (match) {
            return match[1];
        }

        const parsed = new Date(value);

        if (Number.isNaN(parsed.getTime())) {
            return null;
        }

        const year = parsed.getFullYear();
        const month = String(parsed.getMonth() + 1).padStart(2, "0");
        const day = String(parsed.getDate()).padStart(2, "0");

        return `${year}-${month}-${day}`;
    }

    function dateDifferenceDays(dateA, dateB) {
        const a = normalizeDate(dateA);
        const b = normalizeDate(dateB);

        if (!a || !b) {
            return null;
        }

        const aTime = Date.parse(a + "T00:00:00Z");
        const bTime = Date.parse(b + "T00:00:00Z");

        if (!Number.isFinite(aTime) || !Number.isFinite(bTime)) {
            return null;
        }

        return Math.round(
            Math.abs(aTime - bTime) / 86400000
        );
    }

    /*
     * ---------------------------------------------------------
     * MODEL NORMALIZATION
     * ---------------------------------------------------------
     */

    function normalizeModel(value) {
        if (!value) {
            return null;
        }

        const text = String(value).toLowerCase();

        if (
            text.includes("ecmwf") ||
            text.includes("ifs025")
        ) {
            return "ECMWF";
        }

        if (
            text.includes("gfs") ||
            text.includes("gfs_seamless")
        ) {
            return "GFS";
        }

        if (
            text.includes("icon") ||
            text.includes("icon_seamless")
        ) {
            return "ICON";
        }

        return null;
    }

    function getModelId(snapshot) {
        if (!snapshot) {
            return null;
        }

        return (
            snapshot.modelId ||
            snapshot.model ||
            snapshot.modelName ||
            null
        );
    }

    function getModelName(snapshot) {
        return normalizeModel(
            snapshot.model ||
            snapshot.modelId ||
            snapshot.modelName
        );
    }

    /*
     * ---------------------------------------------------------
     * LOCATION MATCHING
     * ---------------------------------------------------------
     */

    function normalizeLocationName(value) {
        return String(value || "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, " ");
    }

    function getCoordinate(value) {
        const n = Number(value);

        return Number.isFinite(n) ? n : null;
    }

    function coordinatesMatch(
        snapshot,
        observation,
        tolerance = 0.08
    ) {
        const snapshotLat = getCoordinate(
            snapshot.latitude
        );

        const snapshotLon = getCoordinate(
            snapshot.longitude
        );

        const observationLat = getCoordinate(
            observation.latitude
        );

        const observationLon = getCoordinate(
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

        return (
            Math.abs(snapshotLat - observationLat) <= tolerance &&
            Math.abs(snapshotLon - observationLon) <= tolerance
        );
    }

    function locationsMatch(snapshot, observation) {
        if (
            coordinatesMatch(
                snapshot,
                observation,
                0.08
            )
        ) {
            return true;
        }

        const snapshotName = normalizeLocationName(
            snapshot.locationName ||
            snapshot.name
        );

        const observationName = normalizeLocationName(
            observation.locationName ||
            observation.name
        );

        if (!snapshotName || !observationName) {
            return false;
        }

        return snapshotName === observationName;
    }

    /*
     * ---------------------------------------------------------
     * FORECAST VALUE EXTRACTION
     * ---------------------------------------------------------
     */

    function getForecastRain(snapshot) {
        const candidates = [
            snapshot.forecastRainOnlyMm,
            snapshot.forecastRainMm,
            snapshot.rainfallMm,
            snapshot.precipitationMm
        ];

        for (const value of candidates) {
            const n = number(value);

            if (n !== null) {
                return Math.max(0, n);
            }
        }

        return null;
    }

    function getForecastProbability(snapshot) {
        const candidates = [
            snapshot.rainProbability,
            snapshot.precipitationProbability,
            snapshot.probability
        ];

        for (const value of candidates) {
            const n = number(value);

            if (n !== null) {
                return clamp(n, 0, 100);
            }
        }

        return null;
    }

    function getActualRain(observation) {
        const candidates = [
            observation.rainfall_mm,
            observation.rainfallMm,
            observation.precipitation_mm,
            observation.precipitationMm,
            observation.actualRainMm
        ];

        for (const value of candidates) {
            const n = number(value);

            if (n !== null) {
                return Math.max(0, n);
            }
        }

        return null;
    }

    /*
     * ---------------------------------------------------------
     * RAIN / NO-RAIN CLASSIFICATION
     * ---------------------------------------------------------
     *
     * We use 0.1 mm as a practical threshold.
     */

    const RAIN_THRESHOLD_MM = 0.1;

    function isRain(value) {
        const n = number(value);

        if (n === null) {
            return false;
        }

        return n >= RAIN_THRESHOLD_MM;
    }

    /*
     * ---------------------------------------------------------
     * MATCH SNAPSHOTS TO OBSERVATIONS
     * ---------------------------------------------------------
     */

    function findBestObservation(snapshot, observations) {
        const validDate = normalizeDate(
            snapshot.validDate ||
            snapshot.date ||
            snapshot.forecastDate
        );

        if (!validDate) {
            return null;
        }

        const candidates = observations.filter(
            function (observation) {
                const observationDate = normalizeDate(
                    observation.date ||
                    observation.validDate ||
                    observation.observationDate
                );

                if (observationDate !== validDate) {
                    return false;
                }

                return locationsMatch(
                    snapshot,
                    observation
                );
            }
        );

        if (!candidates.length) {
            return null;
        }

        /*
         * If several observations exist for the same date/location,
         * prefer the newest one.
         */
        candidates.sort(function (a, b) {
            const aTime = Date.parse(
                a.createdAt || a.timestamp || 0
            );

            const bTime = Date.parse(
                b.createdAt || b.timestamp || 0
            );

            return bTime - aTime;
        });

        return candidates[0];
    }

    /*
     * ---------------------------------------------------------
     * CREATE VERIFICATION RECORDS
     * ---------------------------------------------------------
     */

    function buildVerificationRecords() {
        const observations = getObservations();
        const snapshots = getSnapshots();

        const records = [];
        const seen = new Set();

        snapshots.forEach(function (snapshot) {
            const modelName = getModelName(snapshot);

            if (!modelName) {
                return;
            }

            const validDate = normalizeDate(
                snapshot.validDate ||
                snapshot.date ||
                snapshot.forecastDate
            );

            if (!validDate) {
                return;
            }

            const observation =
                findBestObservation(
                    snapshot,
                    observations
                );

            if (!observation) {
                return;
            }

            const actualRain =
                getActualRain(observation);

            const forecastRain =
                getForecastRain(snapshot);

            if (
                actualRain === null ||
                forecastRain === null
            ) {
                return;
            }

            const forecastProbability =
                getForecastProbability(snapshot);

            const locationName =
                snapshot.locationName ||
                observation.locationName ||
                "Unknown location";

            const key = [
                modelName,
                validDate,
                normalizeLocationName(locationName),
                number(snapshot.latitude, ""),
                number(snapshot.longitude, "")
            ].join("|");

            if (seen.has(key)) {
                return;
            }

            seen.add(key);

            const absoluteError =
                Math.abs(
                    forecastRain - actualRain
                );

            const signedError =
                forecastRain - actualRain;

            const squaredError =
                Math.pow(
                    signedError,
                    2
                );

            const forecastHadRain =
                isRain(forecastRain);

            const actualHadRain =
                isRain(actualRain);

            const hit =
                forecastHadRain &&
                actualHadRain;

            const falseAlarm =
                forecastHadRain &&
                !actualHadRain;

            const miss =
                !forecastHadRain &&
                actualHadRain;

            const correctNoRain =
                !forecastHadRain &&
                !actualHadRain;

            /*
             * Brier score.
             *
             * Probability is converted from 0-100 to 0-1.
             * If probability is unavailable, Brier is null.
             */
            let brierScore = null;

            if (forecastProbability !== null) {
                const probability =
                    forecastProbability / 100;

                const observed =
                    actualHadRain ? 1 : 0;

                brierScore =
                    Math.pow(
                        probability - observed,
                        2
                    );
            }

            records.push({
                id:
                    snapshot.id ||
                    `${modelName}-${validDate}-${records.length}`,

                model: modelName,

                modelId: getModelId(snapshot),

                locationName: locationName,

                latitude:
                    number(
                        snapshot.latitude,
                        number(
                            observation.latitude
                        )
                    ),

                longitude:
                    number(
                        snapshot.longitude,
                        number(
                            observation.longitude
                        )
                    ),

                validDate: validDate,

                forecastCreatedAt:
                    snapshot.forecastCreatedAt ||
                    snapshot.createdAt ||
                    null,

                forecastRainMm:
                    round(forecastRain, 2),

                actualRainMm:
                    round(actualRain, 2),

                forecastProbability:
                    forecastProbability !== null
                        ? round(
                            forecastProbability,
                            1
                        )
                        : null,

                absoluteError:
                    round(
                        absoluteError,
                        2
                    ),

                signedError:
                    round(
                        signedError,
                        2
                    ),

                squaredError:
                    round(
                        squaredError,
                        4
                    ),

                forecastHadRain:
                    forecastHadRain,

                actualHadRain:
                    actualHadRain,

                hit: hit,

                falseAlarm: falseAlarm,

                miss: miss,

                correctNoRain:
                    correctNoRain,

                brierScore:
                    brierScore !== null
                        ? round(
                            brierScore,
                            4
                        )
                        : null,

                observationSource:
                    observation.source ||
                    observation.observationSource ||
                    "manual",

                verifiedAt:
                    new Date().toISOString(),

                engineVersion: VERSION
            });
        });

        return records;
    }

    /*
     * ---------------------------------------------------------
     * METRICS
     * ---------------------------------------------------------
     */

    function calculateMetrics(records) {
        if (!records.length) {
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
                brierScore: null
            };
        }

        const errors =
            records.map(function (record) {
                return number(
                    record.absoluteError,
                    0
                );
            });

        const signedErrors =
            records.map(function (record) {
                return number(
                    record.signedError,
                    0
                );
            });

        const squaredErrors =
            records.map(function (record) {
                return number(
                    record.squaredError,
                    0
                );
            });

        const mae =
            errors.reduce(
                function (sum, value) {
                    return sum + value;
                },
                0
            ) / records.length;

        const bias =
            signedErrors.reduce(
                function (sum, value) {
                    return sum + value;
                },
                0
            ) / records.length;

        const meanSquaredError =
            squaredErrors.reduce(
                function (sum, value) {
                    return sum + value;
                },
                0
            ) / records.length;

        const rmse =
            Math.sqrt(meanSquaredError);

        const hits =
            records.filter(
                function (record) {
                    return record.hit;
                }
            ).length;

        const falseAlarms =
            records.filter(
                function (record) {
                    return record.falseAlarm;
                }
            ).length;

        const misses =
            records.filter(
                function (record) {
                    return record.miss;
                }
            ).length;

        const correctNoRain =
            records.filter(
                function (record) {
                    return record.correctNoRain;
                }
            ).length;

        const correct =
            hits + correctNoRain;

        const rainAccuracy =
            (correct / records.length) * 100;

        const brierRecords =
            records.filter(
                function (record) {
                    return (
                        record.brierScore !== null &&
                        Number.isFinite(
                            Number(record.brierScore)
                        )
                    );
                }
            );

        let brierScore = null;

        if (brierRecords.length) {
            brierScore =
                brierRecords.reduce(
                    function (sum, record) {
                        return (
                            sum +
                            Number(
                                record.brierScore
                            )
                        );
                    },
                    0
                ) / brierRecords.length;
        }

        return {
            samples: records.length,

            mae: round(mae, 2),

            rmse: round(rmse, 2),

            bias: round(bias, 2),

            rainAccuracy:
                round(
                    rainAccuracy,
                    1
                ),

            hits: hits,

            falseAlarms:
                falseAlarms,

            misses: misses,

            correctNoRain:
                correctNoRain,

            brierSamples:
                brierRecords.length,

            brierScore:
                brierScore !== null
                    ? round(
                        brierScore,
                        4
                    )
                    : null
        };
    }

    /*
     * ---------------------------------------------------------
     * MODEL-WISE RESULTS
     * ---------------------------------------------------------
     */

    function buildModelResults(records) {
        return MODELS.map(function (model) {
            const modelRecords =
                records.filter(
                    function (record) {
                        return (
                            record.model ===
                            model.shortName
                        );
                    }
                );

            return {
                model:
                    model.shortName,

                modelId:
                    model.id,

                samples:
                    modelRecords.length,

                metrics:
                    calculateMetrics(
                        modelRecords
                    )
            };
        });
    }

    /*
     * ---------------------------------------------------------
     * OVERALL RESULTS
     * ---------------------------------------------------------
     */

    function buildOverallResult(records) {
        const byModel =
            buildModelResults(records);

        const metrics =
            calculateMetrics(records);

        return {
            version: VERSION,

            generatedAt:
                new Date().toISOString(),

            rainThresholdMm:
                RAIN_THRESHOLD_MM,

            totalVerifiedRecords:
                records.length,

            overall:
                metrics,

            models:
                byModel,

            records:
                records,

            note:
                "Verified accuracy depends on the quantity and quality of actual observations. These metrics should not be interpreted as a guaranteed future accuracy percentage."
        };
    }

    /*
     * ---------------------------------------------------------
     * DATA QUALITY
     * ---------------------------------------------------------
     */

    function getDataQuality(result) {
        const samples =
            result.totalVerifiedRecords;

        if (samples === 0) {
            return {
                level: "No verified samples",
                description:
                    "No matching forecast and actual-observation pairs are available."
            };
        }

        if (samples < 10) {
            return {
                level: "Very small sample",
                description:
                    "Accuracy numbers are highly preliminary because fewer than 10 verified samples are available."
            };
        }

        if (samples < 30) {
            return {
                level: "Early sample",
                description:
                    "The dataset is growing, but accuracy metrics can still change substantially."
            };
        }

        if (samples < 100) {
            return {
                level: "Developing sample",
                description:
                    "There is a useful verification dataset, but longer-term monitoring is still needed."
            };
        }

        return {
            level: "Large verification sample",
            description:
                "The verification dataset is substantially larger, although performance can still vary by season and location."
        };
    }

    /*
     * ---------------------------------------------------------
     * RENDER
     * ---------------------------------------------------------
     */

    function render() {
        const container =
            document.getElementById(
                "accuracy"
            );

        if (!container) {
            return;
        }

        const observations =
            getObservations();

        const snapshots =
            getSnapshots();

        const records =
            buildVerificationRecords();

        const result =
            buildOverallResult(records);

        const quality =
            getDataQuality(result);

        saveJSON(
            RESULT_KEY,
            result
        );

        const overall =
            result.overall;

        const modelCards =
            result.models
                .map(function (model) {
                    const metrics =
                        model.metrics;

                    return `
                        <div class="accuracy-model-card">

                            <div class="accuracy-model-name">
                                ${escapeHTML(
                                    model.model
                                )}
                            </div>

                            <div class="accuracy-model-samples">
                                ${escapeHTML(
                                    metrics.samples
                                )} verified samples
                            </div>

                            <div class="accuracy-model-grid">

                                <div>
                                    <span>MAE</span>
                                    <strong>
                                        ${
                                            metrics.mae !== null
                                                ? escapeHTML(
                                                    metrics.mae
                                                ) + " mm"
                                                : "N/A"
                                        }
                                    </strong>
                                </div>

                                <div>
                                    <span>RMSE</span>
                                    <strong>
                                        ${
                                            metrics.rmse !== null
                                                ? escapeHTML(
                                                    metrics.rmse
                                                ) + " mm"
                                                : "N/A"
                                        }
                                    </strong>
                                </div>

                                <div>
                                    <span>Bias</span>
                                    <strong>
                                        ${
                                            metrics.bias !== null
                                                ? escapeHTML(
                                                    metrics.bias
                                                ) + " mm"
                                                : "N/A"
                                        }
                                    </strong>
                                </div>

                                <div>
                                    <span>Rain Accuracy</span>
                                    <strong>
                                        ${
                                            metrics.rainAccuracy !== null
                                                ? escapeHTML(
                                                    metrics.rainAccuracy
                                                ) + "%"
                                                : "N/A"
                                        }
                                    </strong>
                                </div>

                            </div>

                            <div class="accuracy-events">

                                <span>
                                    Hits:
                                    ${escapeHTML(
                                        metrics.hits
                                    )}
                                </span>

                                <span>
                                    False:
                                    ${escapeHTML(
                                        metrics.falseAlarms
                                    )}
                                </span>

                                <span>
                                    Misses:
                                    ${escapeHTML(
                                        metrics.misses
                                    )}
                                </span>

                                <span>
                                    No Rain:
                                    ${escapeHTML(
                                        metrics.correctNoRain
                                    )}
                                </span>

                            </div>

                        </div>
                    `;
                })
                .join("");

        container.innerHTML = `
            <div class="accuracy-card">

                <div class="accuracy-header">

                    <div>
                        <div class="accuracy-title">
                            Forecast vs Actual Accuracy
                        </div>

                        <div class="accuracy-subtitle">
                            Verified model performance
                        </div>
                    </div>

                    <div class="accuracy-version">
                        V${escapeHTML(
                            VERSION
                        )}
                    </div>

                </div>

                <div class="accuracy-summary">

                    <div class="accuracy-summary-item">
                        <span>Forecast Snapshots</span>
                        <strong>
                            ${escapeHTML(
                                snapshots.length
                            )}
                        </strong>
                    </div>

                    <div class="accuracy-summary-item">
                        <span>Actual Observations</span>
                        <strong>
                            ${escapeHTML(
                                observations.length
                            )}
                        </strong>
                    </div>

                    <div class="accuracy-summary-item">
                        <span>Verified Pairs</span>
                        <strong>
                            ${escapeHTML(
                                records.length
                            )}
                        </strong>
                    </div>

                    <div class="accuracy-summary-item">
                        <span>Rain Accuracy</span>
                        <strong>
                            ${
                                overall.rainAccuracy !== null
                                    ? escapeHTML(
                                        overall.rainAccuracy
                                    ) + "%"
                                    : "N/A"
                            }
                        </strong>
                    </div>

                </div>

                <div class="accuracy-quality">

                    <strong>
                        ${escapeHTML(
                            quality.level
                        )}
                    </strong>

                    <span>
                        ${escapeHTML(
                            quality.description
                        )}
                    </span>

                </div>

                <div class="accuracy-models">
                    ${modelCards}
                </div>

                <div class="accuracy-overall">

                    <div class="accuracy-overall-title">
                        Overall Verification
                    </div>

                    <div class="accuracy-overall-grid">

                        <div>
                            <span>MAE</span>
                            <strong>
                                ${
                                    overall.mae !== null
                                        ? escapeHTML(
                                            overall.mae
                                        ) + " mm"
                                        : "N/A"
                                }
                            </strong>
                        </div>

                        <div>
                            <span>RMSE</span>
                            <strong>
                                ${
                                    overall.rmse !== null
                                        ? escapeHTML(
                                            overall.rmse
                                        ) + " mm"
                                        : "N/A"
                                }
                            </strong>
                        </div>

                        <div>
                            <span>Bias</span>
                            <strong>
                                ${
                                    overall.bias !== null
                                        ? escapeHTML(
                                            overall.bias
                                        ) + " mm"
                                        : "N/A"
                                }
                            </strong>
                        </div>

                        <div>
                            <span>Brier Score</span>
                            <strong>
                                ${
                                    overall.brierScore !== null
                                        ? escapeHTML(
                                            overall.brierScore
                                        )
                                        : "N/A"
                                }
                            </strong>
                        </div>

                    </div>

                </div>

                <div class="accuracy-warning">

                    <strong>
                        Important:
                    </strong>

                    Accuracy is calculated only from matched
                    forecast snapshots and actual observations.
                    More independent observations are required
                    before drawing long-term conclusions.

                </div>

                <div class="accuracy-footer">

                    Verification engine:
                    V${escapeHTML(
                        VERSION
                    )}

                    •

                    Rain threshold:
                    ${escapeHTML(
                        RAIN_THRESHOLD_MM
                    )} mm

                </div>

            </div>
        `;

        log(
            "Rendered",
            {
                snapshots:
                    snapshots.length,

                observations:
                    observations.length,

                verified:
                    records.length,

                overall:
                    overall
            }
        );

        return result;
    }

    /*
     * ---------------------------------------------------------
     * PUBLIC API
     * ---------------------------------------------------------
     */

    function run() {
        return render();
    }

    function getResults() {
        return loadJSON(
            RESULT_KEY,
            null
        );
    }

    function getVerifiedRecords() {
        const result =
            getResults();

        if (
            !result ||
            !Array.isArray(
                result.records
            )
        ) {
            return [];
        }

        return result.records;
    }

    function getModelMetrics(modelName) {
        const result =
            getResults();

        if (!result) {
            return null;
        }

        const normalized =
            normalizeModel(
                modelName
            );

        if (!normalized) {
            return null;
        }

        const model =
            result.models.find(
                function (item) {
                    return (
                        item.model ===
                        normalized
                    );
                }
            );

        return model
            ? model.metrics
            : null;
    }

    function clear() {
        try {
            localStorage.removeItem(
                RESULT_KEY
            );

            log(
                "Verified accuracy results cleared."
            );

            render();
        } catch (error) {
            warn(
                "Could not clear results:",
                error
            );
        }
    }

    /*
     * ---------------------------------------------------------
     * EVENTS
     * ---------------------------------------------------------
     */

    window.addEventListener(
        "rrp:weather-updated",
        function () {
            setTimeout(
                render,
                300
            );
        }
    );

    window.addEventListener(
        "rrp:prediction-updated",
        function () {
            setTimeout(
                render,
                300
            );
        }
    );

    window.addEventListener(
        "rrp:location-selected",
        function () {
            setTimeout(
                render,
                400
            );
        }
    );

    /*
     * ---------------------------------------------------------
     * GLOBAL API
     * ---------------------------------------------------------
     */

    window.RRP_VERIFICATION = {
        version: VERSION,

        run: run,

        render: render,

        getResults:
            getResults,

        getVerifiedRecords:
            getVerifiedRecords,

        getModelMetrics:
            getModelMetrics,

        clear:
            clear
    };

    /*
     * ---------------------------------------------------------
     * STARTUP
     * ---------------------------------------------------------
     */

    function init() {
        render();

        setTimeout(
            render,
            1000
        );

        setTimeout(
            render,
            2500
        );
    }

    if (
        document.readyState ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            init
        );
    } else {
        init();
    }

    log(
        "Accuracy Verification Engine V3 ready."
    );
})();
