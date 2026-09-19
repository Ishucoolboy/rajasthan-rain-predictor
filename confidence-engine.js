/* =========================================================
   RAJASTHAN RAIN PREDICTOR
   FORECAST CONFIDENCE ENGINE V2
   ========================================================= */

(() => {

    "use strict";


    const ENGINE_NAME =
        "[RRP Forecast Confidence V2]";


    let lastRenderedLocation = null;


    // =====================================================
    // HELPERS
    // =====================================================

    function number(value) {

        const n = Number(value);

        return Number.isFinite(n)
            ? n
            : null;

    }


    function clamp(
        value,
        minimum,
        maximum
    ) {

        return Math.min(
            maximum,
            Math.max(
                minimum,
                value
            )
        );

    }


    function escapeHTML(value) {

        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

    }


    // =====================================================
    // PREDICTION
    // =====================================================

    function getPrediction() {

        try {

            if (
                !window.RRP_PREDICTION_ENGINE ||
                typeof
                window.RRP_PREDICTION_ENGINE.getLatest !==
                "function"
            ) {

                return null;

            }


            return window
                .RRP_PREDICTION_ENGINE
                .getLatest();

        } catch (error) {

            console.warn(
                ENGINE_NAME,
                "Prediction unavailable:",
                error
            );

            return null;

        }

    }


    // =====================================================
    // REGIONAL DATA
    // =====================================================

    function getRegionalData() {

        try {

            if (
                !window.RRP_REGIONAL_ACCURACY ||
                typeof
                window.RRP_REGIONAL_ACCURACY.getSelectedMetrics !==
                "function"
            ) {

                return null;

            }


            return window
                .RRP_REGIONAL_ACCURACY
                .getSelectedMetrics();

        } catch (error) {

            console.warn(
                ENGINE_NAME,
                "Regional data unavailable:",
                error
            );

            return null;

        }

    }


    // =====================================================
    // MODEL CONSISTENCY
    // =====================================================

    function getConsistencyScore(
        prediction
    ) {

        if (!prediction) {

            return null;

        }


        const consistency =
            prediction.forecastConsistency;


        if (
            consistency &&
            number(
                consistency.score
            ) !== null
        ) {

            return clamp(
                number(
                    consistency.score
                ),
                0,
                100
            );

        }


        const spread =
            number(
                prediction.modelSpread
            );


        if (
            spread === null
        ) {

            return null;

        }


        if (
            spread <= 10
        ) {

            return 95;

        }


        if (
            spread <= 25
        ) {

            return 85;

        }


        if (
            spread <= 40
        ) {

            return 70;

        }


        if (
            spread <= 60
        ) {

            return 55;

        }


        if (
            spread <= 100
        ) {

            return 40;

        }


        return 25;

    }


    // =====================================================
    // MODEL COMPLETENESS
    // =====================================================

    function getModelCompleteness(
        prediction
    ) {

        if (
            !prediction ||
            !Array.isArray(
                prediction.models
            )
        ) {

            return null;

        }


        const models =
            prediction.models.filter(
                model =>
                    model &&
                    model.success !== false
            );


        const count =
            models.length;


        if (
            count >= 3
        ) {

            return 100;

        }


        if (
            count === 2
        ) {

            return 75;

        }


        if (
            count === 1
        ) {

            return 45;

        }


        return 0;

    }


    // =====================================================
    // REGIONAL CONTEXT
    // =====================================================

    function getRegionalContext(
        regional
    ) {

        if (!regional) {

            return {

                available:
                    false,

                name:
                    null,

                distance:
                    null,

                type:
                    null

            };

        }


        const distance =
            number(
                regional.distanceKm
            );


        return {

            available:
                true,

            name:
                regional.regionalLocation?.name ||
                regional.selectedLocation?.name ||
                null,

            distance,

            type:
                regional.matchType ||
                "nearest"

        };

    }


    // =====================================================
    // CONFIDENCE CALCULATION
    // =====================================================
    //
    // IMPORTANT:
    //
    // Historical regional accuracy is NOT directly
    // converted into current forecast confidence.
    //
    // Current confidence is based primarily on:
    //
    // 1. Model agreement
    // 2. Model availability
    //
    // This avoids treating historical accuracy as
    // a guaranteed probability for today's forecast.
    //
    // =====================================================

    function calculateConfidence(
        consistencyScore,
        completenessScore
    ) {

        if (
            consistencyScore === null &&
            completenessScore === null
        ) {

            return {

                score:
                    null,

                level:
                    "Limited data"

            };

        }


        const consistency =
            consistencyScore !== null
                ? consistencyScore
                : 50;


        const completeness =
            completenessScore !== null
                ? completenessScore
                : 50;


        const score =
            (
                consistency * 0.75
            ) +
            (
                completeness * 0.25
            );


        let level;


        if (
            score >= 80
        ) {

            level =
                "High";

        } else if (
            score >= 60
        ) {

            level =
                "Moderate";

        } else {

            level =
                "Low";

        }


        return {

            score:
                Math.round(score),

            level

        };

    }


    // =====================================================
    // EXPLANATION
    // =====================================================

    function buildExplanation(
        prediction,
        consistencyScore,
        completenessScore,
        regionalContext
    ) {

        const parts = [];


        // -------------------------------------------------
        // MODEL AGREEMENT
        // -------------------------------------------------

        if (
            consistencyScore !== null
        ) {

            if (
                consistencyScore >= 85
            ) {

                parts.push(
                    "ECMWF, GFS aur ICON ke forecasts mein strong agreement hai."
                );

            } else if (
                consistencyScore >= 60
            ) {

                parts.push(
                    "ECMWF, GFS aur ICON ke forecasts mein moderate agreement hai."
                );

            } else {

                parts.push(
                    "ECMWF, GFS aur ICON ke forecasts mein noticeable disagreement hai."
                );

            }

        }


        // -------------------------------------------------
        // MODEL AVAILABILITY
        // -------------------------------------------------

        if (
            completenessScore === 100
        ) {

            parts.push(
                "Teeno major models successfully available hain."
            );

        } else if (
            completenessScore >= 75
        ) {

            parts.push(
                "Do major models successfully available hain."
            );

        } else if (
            completenessScore !== null
        ) {

            parts.push(
                "Model data partially available hai."
            );

        }


        // -------------------------------------------------
        // REGIONAL CONTEXT
        // -------------------------------------------------

        if (
            regionalContext.available
        ) {

            if (
                regionalContext.type ===
                "exact"
            ) {

                parts.push(
                    "Selected location ke liye exact regional historical reference available hai."
                );

            } else if (
                regionalContext.distance !== null
            ) {

                parts.push(
                    `Historical regional reference ${regionalContext.distance.toFixed(1)} km door hai.`
                );

            }

        }


        if (!parts.length) {

            parts.push(
                "Current model data se confidence calculate kiya gaya hai."
            );

        }


        return parts.join(" ");

    }


    // =====================================================
    // CONTAINER
    // =====================================================

    function getContainer() {

        let container =
            document.getElementById(
                "forecastConfidence"
            );


        if (container) {

            return container;

        }


        container =
            document.createElement(
                "section"
            );


        container.id =
            "forecastConfidence";


        container.style.marginTop =
            "18px";


        const predictionContainer =
            document.getElementById(
                "predictionEngine"
            );


        if (
            predictionContainer &&
            predictionContainer.parentNode
        ) {

            predictionContainer.parentNode.insertBefore(
                container,
                predictionContainer.nextSibling
            );

        } else {

            document
                .querySelector("main")
                ?.appendChild(
                    container
                );

        }


        return container;

    }


    // =====================================================
    // RENDER
    // =====================================================

    function render() {

        const prediction =
            getPrediction();


        if (!prediction) {

            return;

        }


        const regional =
            getRegionalData();


        const consistencyScore =
            getConsistencyScore(
                prediction
            );


        const completenessScore =
            getModelCompleteness(
                prediction
            );


        const regionalContext =
            getRegionalContext(
                regional
            );


        const confidence =
            calculateConfidence(
                consistencyScore,
                completenessScore
            );


        const explanation =
            buildExplanation(
                prediction,
                consistencyScore,
                completenessScore,
                regionalContext
            );


        const container =
            getContainer();


        if (!container) {

            return;

        }


        const locationName =
            prediction.location?.name ||
            "Selected Location";


        let title =
            "Forecast Confidence";


        if (
            confidence.level ===
            "High"
        ) {

            title =
                "High Forecast Confidence";

        } else if (
            confidence.level ===
            "Moderate"
        ) {

            title =
                "Moderate Forecast Confidence";

        } else if (
            confidence.level ===
            "Low"
        ) {

            title =
                "Low Forecast Confidence";

        } else {

            title =
                "Forecast Confidence — Limited Data";

        }


        const scoreText =
            confidence.score !== null
                ? `${confidence.score}/100`
                : "—";


        const modelCount =
            Array.isArray(
                prediction.models
            )
                ? prediction.models.length
                : 0;


        // =================================================
        // MODEL AGREEMENT LABEL
        // =================================================

        let agreementLabel =
            "Unavailable";


        if (
            consistencyScore !== null
        ) {

            if (
                consistencyScore >= 85
            ) {

                agreementLabel =
                    "Strong";

            } else if (
                consistencyScore >= 60
            ) {

                agreementLabel =
                    "Moderate";

            } else {

                agreementLabel =
                    "Low";

            }

        }


        // =================================================
        // REGIONAL TEXT
        // =================================================

        let regionalText =
            "Historical regional context unavailable";


        if (
            regionalContext.available
        ) {

            if (
                regionalContext.type ===
                "exact"
            ) {

                regionalText =
                    "Exact regional reference available";

            } else if (
                regionalContext.distance !== null
            ) {

                regionalText =
                    `Nearest regional reference: ${regionalContext.distance.toFixed(1)} km`;

            } else {

                regionalText =
                    "Regional proxy available";

            }

        }


        // =================================================
        // HTML
        // =================================================

        container.innerHTML = `

            <div style="
                background:#ffffff;
                border:1px solid #e2e8f0;
                border-radius:18px;
                padding:20px;
                box-shadow:0 5px 20px rgba(15,23,42,.06);
            ">


                <!-- =====================================
                     HEADER
                     ===================================== -->

                <div style="
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    gap:15px;
                    flex-wrap:wrap;
                ">


                    <div>

                        <div style="
                            font-size:11px;
                            color:#64748b;
                            text-transform:uppercase;
                            letter-spacing:.06em;
                        ">

                            🧠 Forecast Confidence

                        </div>


                        <h2 style="
                            margin:5px 0 0;
                            font-size:22px;
                        ">

                            ${title}

                        </h2>


                        <div style="
                            margin-top:4px;
                            font-size:12px;
                            color:#64748b;
                        ">

                            ${escapeHTML(
                                locationName
                            )}

                        </div>

                    </div>


                    <div style="
                        min-width:95px;
                        text-align:center;
                        padding:12px 15px;
                        border-radius:14px;
                        background:#f8fafc;
                        border:1px solid #e2e8f0;
                    ">

                        <div style="
                            font-size:24px;
                            font-weight:800;
                        ">

                            ${scoreText}

                        </div>


                        <div style="
                            font-size:10px;
                            color:#64748b;
                        ">

                            confidence index

                        </div>

                    </div>


                </div>



                <!-- =====================================
                     FACTORS
                     ===================================== -->

                <div style="
                    display:grid;
                    grid-template-columns:
                        repeat(auto-fit,minmax(170px,1fr));
                    gap:10px;
                    margin-top:18px;
                ">


                    <!-- MODEL AGREEMENT -->

                    <div style="
                        padding:14px;
                        border-radius:13px;
                        background:#f8fafc;
                        border:1px solid #e2e8f0;
                    ">

                        <div style="
                            font-size:11px;
                            color:#64748b;
                        ">

                            🤖 Model Agreement

                        </div>


                        <strong style="
                            display:block;
                            margin-top:5px;
                            font-size:18px;
                        ">

                            ${agreementLabel}

                        </strong>


                        <div style="
                            margin-top:3px;
                            font-size:11px;
                            color:#64748b;
                        ">

                            ${
                                consistencyScore !== null
                                    ? Math.round(
                                        consistencyScore
                                      ) + "%"
                                    : "—"
                            }

                        </div>

                    </div>



                    <!-- MODEL AVAILABILITY -->

                    <div style="
                        padding:14px;
                        border-radius:13px;
                        background:#f8fafc;
                        border:1px solid #e2e8f0;
                    ">

                        <div style="
                            font-size:11px;
                            color:#64748b;
                        ">

                            🛰️ Models Available

                        </div>


                        <strong style="
                            display:block;
                            margin-top:5px;
                            font-size:18px;
                        ">

                            ${modelCount}/3

                        </strong>


                        <div style="
                            margin-top:3px;
                            font-size:11px;
                            color:#64748b;
                        ">

                            ECMWF / GFS / ICON

                        </div>

                    </div>



                    <!-- REGIONAL CONTEXT -->

                    <div style="
                        padding:14px;
                        border-radius:13px;
                        background:#f8fafc;
                        border:1px solid #e2e8f0;
                    ">

                        <div style="
                            font-size:11px;
                            color:#64748b;
                        ">

                            📍 Regional Context

                        </div>


                        <strong style="
                            display:block;
                            margin-top:5px;
                            font-size:15px;
                            line-height:1.4;
                        ">

                            ${escapeHTML(
                                regionalText
                            )}

                        </strong>

                    </div>


                </div>



                <!-- =====================================
                     EXPLANATION
                     ===================================== -->

                <div style="
                    margin-top:15px;
                    padding:14px;
                    border-radius:13px;
                    background:#f8fafc;
                    color:#475569;
                    font-size:12px;
                    line-height:1.7;
                ">

                    ${escapeHTML(
                        explanation
                    )}

                </div>



                <!-- =====================================
                     HISTORICAL INFO
                     ===================================== -->

                ${
                    regional
                        ? `

                            <div style="
                                margin-top:12px;
                                padding:13px;
                                border-radius:12px;
                                background:#f1f5f9;
                                font-size:11px;
                                line-height:1.7;
                                color:#475569;
                            ">

                                📊

                                <strong>
                                    Historical regional data:
                                </strong>

                                Is data ko current
                                forecast ke context ke
                                liye dikhaya ja raha hai.

                                Historical performance
                                current forecast ki
                                guaranteed accuracy nahi hai.

                            </div>

                          `
                        : ""
                }



                <!-- =====================================
                     IMPORTANT
                     ===================================== -->

                <div style="
                    margin-top:12px;
                    padding:12px;
                    border-radius:11px;
                    background:#fff7ed;
                    border:1px solid #fed7aa;
                    color:#7c2d12;
                    font-size:11px;
                    line-height:1.6;
                ">

                    ⚠️

                    <strong>
                        Important:
                    </strong>

                    Confidence Index forecast accuracy
                    ya rain probability nahi hai.

                    Ye mainly current weather models ke
                    agreement aur available model data
                    completeness ko represent karta hai.

                    Historical accuracy alag verification
                    system mein measure hoti hai.

                </div>


            </div>

        `;


        lastRenderedLocation =
            locationName;


        console.log(
            ENGINE_NAME,
            "Rendered:",
            locationName,
            {
                score:
                    confidence.score,

                level:
                    confidence.level,

                consistency:
                    consistencyScore,

                modelCompleteness:
                    completenessScore,

                regional:
                    regionalContext
            }
        );

    }


    // =====================================================
    // RUN
    // =====================================================

    function run() {

        setTimeout(
            render,
            250
        );

    }


    // =====================================================
    // EVENTS
    // =====================================================

    window.addEventListener(
        "rrp:weather-updated",
        () => {

            run();

        }
    );


    window.addEventListener(
        "rrp:prediction-updated",
        () => {

            run();

        }
    );


    window.addEventListener(
        "load",
        () => {

            setTimeout(
                run,
                3500
            );


            setTimeout(
                run,
                7000
            );

        }
    );


    // =====================================================
    // PUBLIC API
    // =====================================================

    window.RRP_FORECAST_CONFIDENCE = {

        run,

        render,

        getLastLocation:
            () =>
                lastRenderedLocation

    };


    console.log(
        ENGINE_NAME,
        "Forecast Confidence Engine ready."
    );


})();
