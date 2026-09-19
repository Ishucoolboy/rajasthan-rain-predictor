(function () {
    "use strict";

    /*
     * Rajasthan Rain Predictor
     * Forecast Confidence Engine V3
     *
     * Purpose:
     * - Estimate forecast consistency between available weather models.
     * - Uses model rain probability + rainfall amount agreement.
     * - Does NOT claim forecast accuracy.
     * - Regional historical data is shown as context only.
     */

    const ENGINE_VERSION = "3.0";
    const STORAGE_KEY = "rrp_forecast_confidence_v3";

    function log(...args) {
        console.log("[RRP Forecast Confidence V3]", ...args);
    }

    function warn(...args) {
        console.warn("[RRP Forecast Confidence V3]", ...args);
    }

    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function number(value, fallback = 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function round(value, decimals = 1) {
        const p = Math.pow(10, decimals);
        return Math.round(value * p) / p;
    }

    function getPrediction() {
        try {
            if (
                window.RRP_PREDICTION_ENGINE &&
                typeof window.RRP_PREDICTION_ENGINE.getLatest === "function"
            ) {
                return window.RRP_PREDICTION_ENGINE.getLatest();
            }
        } catch (error) {
            warn("Could not read prediction engine:", error);
        }

        return null;
    }

    function getRegionalMetrics() {
        try {
            if (
                window.RRP_REGIONAL_ACCURACY &&
                typeof window.RRP_REGIONAL_ACCURACY.getSelectedMetrics === "function"
            ) {
                return window.RRP_REGIONAL_ACCURACY.getSelectedMetrics();
            }
        } catch (error) {
            warn("Could not read regional metrics:", error);
        }

        return null;
    }

    function getSuccessfulModels(prediction) {
        if (!prediction || !Array.isArray(prediction.models)) {
            return [];
        }

        return prediction.models.filter(function (model) {
            return model && model.success !== false;
        });
    }

    /*
     * MODEL AVAILABILITY
     */

    function calculateModelCompleteness(models) {
        const count = models.length;

        if (count >= 3) {
            return {
                score: 100,
                level: "3/3 models",
                count: count
            };
        }

        if (count === 2) {
            return {
                score: 75,
                level: "2/3 models",
                count: count
            };
        }

        if (count === 1) {
            return {
                score: 45,
                level: "1/3 models",
                count: count
            };
        }

        return {
            score: 0,
            level: "0/3 models",
            count: 0
        };
    }

    /*
     * RAIN PROBABILITY AGREEMENT
     *
     * Important:
     * We use peakProbability/currentProbability instead of rainfall
     * amount alone because rainfall amounts can differ considerably
     * even when models agree that the practical rain signal is weak.
     */

    function getModelProbability(model) {
        const candidates = [
            model.peakProbability,
            model.currentProbability,
            model.rainProbability
        ];

        for (let i = 0; i < candidates.length; i++) {
            const n = Number(candidates[i]);

            if (Number.isFinite(n)) {
                return clamp(n, 0, 100);
            }
        }

        return null;
    }

    function calculateProbabilityAgreement(models) {
        const values = models
            .map(getModelProbability)
            .filter(function (value) {
                return Number.isFinite(value);
            });

        if (values.length < 2) {
            return {
                score: values.length === 1 ? 45 : 0,
                range: null,
                mean: values.length ? values[0] : null,
                values: values
            };
        }

        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min;
        const mean =
            values.reduce(function (sum, value) {
                return sum + value;
            }, 0) / values.length;

        let score;

        if (range <= 10) {
            score = 100;
        } else if (range <= 20) {
            score = 90;
        } else if (range <= 35) {
            score = 75;
        } else if (range <= 50) {
            score = 55;
        } else if (range <= 70) {
            score = 35;
        } else {
            score = 20;
        }

        return {
            score: score,
            range: round(range, 1),
            mean: round(mean, 1),
            values: values
        };
    }

    /*
     * RAINFALL AMOUNT AGREEMENT
     *
     * Uses an absolute floor of 5 mm in the denominator.
     * This prevents tiny values like 0.2 vs 1.5 mm from creating
     * an artificially huge relative spread.
     */

    function getModelRain(model) {
        const candidates = [
            model.next24Rain,
            model.rainfall,
            model.currentRain
        ];

        for (let i = 0; i < candidates.length; i++) {
            const n = Number(candidates[i]);

            if (Number.isFinite(n)) {
                return Math.max(0, n);
            }
        }

        return null;
    }

    function calculateRainfallAgreement(models) {
        const values = models
            .map(getModelRain)
            .filter(function (value) {
                return Number.isFinite(value);
            });

        if (values.length < 2) {
            return {
                score: values.length === 1 ? 45 : 0,
                min: values.length ? round(values[0], 1) : null,
                max: values.length ? round(values[0], 1) : null,
                mean: values.length ? round(values[0], 1) : null,
                spread: null,
                values: values
            };
        }

        const min = Math.min(...values);
        const max = Math.max(...values);

        const mean =
            values.reduce(function (sum, value) {
                return sum + value;
            }, 0) / values.length;

        /*
         * Practical dry / very-low-rain rule.
         *
         * Example:
         * 0.2 mm
         * 1.0 mm
         * 2.0 mm
         *
         * These can have a mathematically large relative spread,
         * but practically they are all indicating very little rain.
         */
        if (max <= 2) {
            return {
                score: 95,
                min: round(min, 1),
                max: round(max, 1),
                mean: round(mean, 1),
                spread: round(max - min, 1),
                values: values
            };
        }

        if (max <= 5 && mean <= 3) {
            return {
                score: 90,
                min: round(min, 1),
                max: round(max, 1),
                mean: round(mean, 1),
                spread: round(max - min, 1),
                values: values
            };
        }

        const denominator = Math.max(mean, 5);
        const relativeSpread = ((max - min) / denominator) * 100;

        let score;

        if (relativeSpread <= 10) {
            score = 100;
        } else if (relativeSpread <= 25) {
            score = 90;
        } else if (relativeSpread <= 50) {
            score = 75;
        } else if (relativeSpread <= 100) {
            score = 55;
        } else if (relativeSpread <= 150) {
            score = 35;
        } else {
            score = 20;
        }

        return {
            score: score,
            min: round(min, 1),
            max: round(max, 1),
            mean: round(mean, 1),
            spread: round(max - min, 1),
            relativeSpread: round(relativeSpread, 1),
            values: values
        };
    }

    /*
     * PRACTICAL SIGNAL
     */

    function getPracticalSignal(probability, rainfall) {
        const probabilityMean = probability.mean;
        const rainfallMean = rainfall.mean;

        if (
            Number.isFinite(probabilityMean) &&
            probabilityMean < 25 &&
            Number.isFinite(rainfallMean) &&
            rainfallMean <= 2
        ) {
            return {
                type: "dry",
                text: "Models broadly agree on a low-rain / dry signal."
            };
        }

        if (
            Number.isFinite(probabilityMean) &&
            probabilityMean >= 60 &&
            Number.isFinite(rainfallMean) &&
            rainfallMean >= 5
        ) {
            return {
                type: "rain",
                text: "Models show a meaningful rain signal."
            };
        }

        if (
            Number.isFinite(probabilityMean) &&
            probabilityMean >= 40
        ) {
            return {
                type: "mixed",
                text: "Models indicate a moderate or mixed rain signal."
            };
        }

        return {
            type: "neutral",
            text: "Model signal is currently mixed or limited."
        };
    }

    /*
     * FINAL CONFIDENCE
     *
     * This is forecast consistency, NOT measured forecast accuracy.
     */

    function calculateConfidence(prediction) {
        const models = getSuccessfulModels(prediction);

        const completeness = calculateModelCompleteness(models);
        const probability = calculateProbabilityAgreement(models);
        const rainfall = calculateRainfallAgreement(models);

        /*
         * Probability agreement gets more weight because it is more
         * useful for identifying whether models agree on the rain event.
         *
         * Rainfall amount agreement gets a smaller weight because exact
         * precipitation totals are naturally more variable.
         */
        let consistency = 0;

        if (probability.score > 0 && rainfall.score > 0) {
            consistency =
                probability.score * 0.65 +
                rainfall.score * 0.35;
        } else if (probability.score > 0) {
            consistency = probability.score;
        } else if (rainfall.score > 0) {
            consistency = rainfall.score;
        }

        /*
         * Keep model availability separate from consistency.
         * We don't want one missing model to destroy an otherwise
         * consistent forecast signal.
         */
        let finalScore;

        if (models.length >= 3) {
            finalScore = consistency;
        } else if (models.length === 2) {
            finalScore = consistency * 0.90;
        } else if (models.length === 1) {
            finalScore = consistency * 0.65;
        } else {
            finalScore = 0;
        }

        finalScore = Math.round(clamp(finalScore, 0, 100));

        let level;

        if (finalScore >= 85) {
            level = "High";
        } else if (finalScore >= 70) {
            level = "Moderate-High";
        } else if (finalScore >= 50) {
            level = "Moderate";
        } else if (finalScore >= 30) {
            level = "Low";
        } else {
            level = "Very Low";
        }

        const signal = getPracticalSignal(probability, rainfall);

        return {
            engineVersion: ENGINE_VERSION,
            score: finalScore,
            level: level,

            consistency: Math.round(consistency),

            probabilityAgreement: probability,
            rainfallAgreement: rainfall,

            modelCompleteness: completeness,

            practicalSignal: signal,

            location: prediction
                ? prediction.location || null
                : null,

            generatedAt: new Date().toISOString(),

            note:
                "Confidence represents agreement/consistency between available forecast models. It is not a measured accuracy percentage."
        };
    }

    /*
     * REGIONAL CONTEXT
     */

    function getRegionalContext() {
        const regional = getRegionalMetrics();

        if (!regional) {
            return {
                available: false,
                text: "Regional historical context is not available yet."
            };
        }

        const locationName =
            regional.locationName ||
            regional.name ||
            "Regional proxy";

        const distance =
            Number.isFinite(Number(regional.distanceKm))
                ? Number(regional.distanceKm)
                : null;

        const successfulModels =
            Number(regional.successfulModels) ||
            Number(regional.modelsAvailable) ||
            null;

        let text = locationName;

        if (distance !== null) {
            text += " (" + round(distance, 1) + " km)";
        }

        if (successfulModels !== null) {
            text += " • " + successfulModels + " model datasets";
        }

        return {
            available: true,
            locationName: locationName,
            distanceKm: distance,
            successfulModels: successfulModels,
            raw: regional,
            text: text
        };
    }

    /*
     * BUILD COMPLETE RESULT
     */

    function buildResult() {
        const prediction = getPrediction();

        if (!prediction) {
            return null;
        }

        const confidence = calculateConfidence(prediction);
        const regional = getRegionalContext();

        return {
            ...confidence,
            regional: regional
        };
    }

    /*
     * DISPLAY HELPERS
     */

    function scoreClass(score) {
        if (score >= 85) return "high";
        if (score >= 70) return "moderate-high";
        if (score >= 50) return "moderate";
        if (score >= 30) return "low";
        return "very-low";
    }

    function signalText(signal) {
        if (!signal) {
            return "No clear signal available.";
        }

        return signal.text;
    }

    function render() {
        const container = document.getElementById("forecastConfidence");

        if (!container) {
            return;
        }

        const result = buildResult();

        if (!result) {
            container.innerHTML = `
                <div class="confidence-card">
                    <div class="confidence-title">
                        Forecast Confidence
                    </div>

                    <div class="confidence-muted">
                        Waiting for forecast model data...
                    </div>
                </div>
            `;

            return;
        }

        const score = result.score;
        const probability = result.probabilityAgreement;
        const rainfall = result.rainfallAgreement;
        const completeness = result.modelCompleteness;
        const regional = result.regional;

        const probabilityRange =
            probability.range !== null
                ? probability.range + "%"
                : "N/A";

        const rainfallSpread =
            rainfall.spread !== null
                ? rainfall.spread + " mm"
                : "N/A";

        const probabilityMean =
            probability.mean !== null
                ? probability.mean + "%"
                : "N/A";

        const rainfallMean =
            rainfall.mean !== null
                ? rainfall.mean + " mm"
                : "N/A";

        const regionalText = regional
            ? regional.text
            : "Not available";

        container.innerHTML = `
            <div class="confidence-card">

                <div class="confidence-header">
                    <div>
                        <div class="confidence-title">
                            Forecast Confidence
                        </div>

                        <div class="confidence-subtitle">
                            Model-consistency based indicator
                        </div>
                    </div>

                    <div class="confidence-version">
                        V${escapeHTML(ENGINE_VERSION)}
                    </div>
                </div>

                <div class="confidence-main">

                    <div class="confidence-score-box">
                        <div class="confidence-score">
                            ${escapeHTML(score)}
                        </div>

                        <div class="confidence-percent">
                            / 100
                        </div>

                        <div class="confidence-level ${escapeHTML(
                            scoreClass(score)
                        )}">
                            ${escapeHTML(result.level)}
                        </div>
                    </div>

                    <div class="confidence-summary">
                        <div class="confidence-signal">
                            ${escapeHTML(
                                signalText(result.practicalSignal)
                            )}
                        </div>

                        <div class="confidence-note">
                            This is model agreement, not guaranteed forecast accuracy.
                        </div>
                    </div>

                </div>

                <div class="confidence-grid">

                    <div class="confidence-factor">
                        <div class="factor-label">
                            Rain Probability Agreement
                        </div>

                        <div class="factor-value">
                            ${escapeHTML(probability.score)} / 100
                        </div>

                        <div class="factor-detail">
                            Mean ${escapeHTML(probabilityMean)}
                            • Range ${escapeHTML(probabilityRange)}
                        </div>
                    </div>

                    <div class="confidence-factor">
                        <div class="factor-label">
                            Rainfall Amount Agreement
                        </div>

                        <div class="factor-value">
                            ${escapeHTML(rainfall.score)} / 100
                        </div>

                        <div class="factor-detail">
                            Mean ${escapeHTML(rainfallMean)}
                            • Spread ${escapeHTML(rainfallSpread)}
                        </div>
                    </div>

                    <div class="confidence-factor">
                        <div class="factor-label">
                            Model Availability
                        </div>

                        <div class="factor-value">
                            ${escapeHTML(completeness.score)} / 100
                        </div>

                        <div class="factor-detail">
                            ${escapeHTML(completeness.level)}
                        </div>
                    </div>

                    <div class="confidence-factor">
                        <div class="factor-label">
                            Regional Context
                        </div>

                        <div class="factor-value">
                            ${regional && regional.available
                                ? "Available"
                                : "Pending"}
                        </div>

                        <div class="factor-detail">
                            ${escapeHTML(regionalText)}
                        </div>
                    </div>

                </div>

                <div class="confidence-explanation">
                    <strong>How this score works:</strong>
                    Rain-probability agreement has higher weight than exact
                    rainfall totals. Very small rainfall differences are treated
                    as a low-rain signal instead of creating an exaggerated
                    disagreement.
                </div>

                <div class="confidence-footer">
                    Historical/regional data is shown as context only.
                    It is not directly converted into this confidence score.
                </div>

            </div>
        `;

        try {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(result)
            );
        } catch (error) {
            warn("Could not save confidence result:", error);
        }

        log(
            "Rendered:",
            result.location || "Selected location",
            result
        );
    }

    /*
     * PUBLIC API
     */

    function getLatest() {
        return buildResult();
    }

    function getSaved() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);

            if (!raw) {
                return null;
            }

            return JSON.parse(raw);
        } catch (error) {
            return null;
        }
    }

    function init() {
        render();

        /*
         * Prediction engine may finish after this engine loads.
         * Give it a few chances to render after forecast data arrives.
         */
        setTimeout(render, 500);
        setTimeout(render, 1500);
        setTimeout(render, 3000);
    }

    /*
     * EVENTS
     */

    window.addEventListener(
        "rrp:weather-updated",
        function () {
            setTimeout(render, 250);
        }
    );

    window.addEventListener(
        "rrp:prediction-updated",
        function () {
            setTimeout(render, 150);
        }
    );

    window.addEventListener(
        "rrp:location-selected",
        function () {
            setTimeout(render, 300);
        }
    );

    /*
     * PUBLIC GLOBAL
     */

    window.RRP_FORECAST_CONFIDENCE = {
        version: ENGINE_VERSION,
        run: render,
        render: render,
        getLatest: getLatest,
        getSaved: getSaved,
        calculateConfidence: calculateConfidence
    };

    /*
     * START
     */

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    log("Forecast Confidence Engine V3 ready.");
})();
