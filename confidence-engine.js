/* =========================================================
   RAJASTHAN RAIN PREDICTOR
   FORECAST CONFIDENCE ENGINE V1
   ========================================================= */

(() => {

    "use strict";


    // =====================================================
    // CONFIG
    // =====================================================

    const ENGINE_NAME =
        "[RRP Forecast Confidence V1]";


    let lastRenderedLocation = null;


    // =====================================================
    // HELPERS
    // =====================================================

    function number(value) {

        const n =
            Number(value);

        return Number.isFinite(n)
            ? n
            : null;

    }


    function escapeHTML(value) {

        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

    }


    function average(values) {

        const valid =
            values
                .map(number)
                .filter(
                    value =>
                        value !== null
                );


        if (!valid.length) {

            return null;

        }


        return valid.reduce(
            (sum, value) =>
                sum + value,
            0
        ) / valid.length;

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


    // =====================================================
    // GET PREDICTION
    // =====================================================

    function getPrediction() {

        try {

            if (
                !window.RRP_PREDICTION_ENGINE ||
                typeof
                window.RRP_PREDICTION_ENGINE
                    .getLatest !==
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
    // GET REGIONAL DATA
    // =====================================================

    function getRegionalData() {

        try {

            if (
                !window.RRP_REGIONAL_ACCURACY ||
                typeof
                window.RRP_REGIONAL_ACCURACY
                    .getSelectedMetrics !==
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
    // GET AUTOMATIC VERIFICATION
    // =====================================================

    function getAutomaticVerification() {

        try {

            if (
                !window.RRP_AUTOMATIC_VERIFICATION ||
                typeof
                window.RRP_AUTOMATIC_VERIFICATION
                    .getMetrics !==
                "function"
            ) {

                return null;

            }


            return window
                .RRP_AUTOMATIC_VERIFICATION
                .getMetrics();

        } catch (error) {

            console.warn(
                ENGINE_NAME,
                "Automatic verification unavailable:",
                error
            );


            return null;

        }

    }


    // =====================================================
    // FIND MODEL METRIC
    // =====================================================

    function findModelMetric(
        regional,
        modelName
    ) {

        if (!regional) {

            return null;

        }


        const models =
            regional.models ||
            regional.modelMetrics ||
            {};


        return (
            models[modelName] ||
            models[
                modelName.toLowerCase()
            ] ||
            null
        );

    }


    // =====================================================
    // REGIONAL SCORE
    // =====================================================

    function getRegionalScore(
        regional,
        modelNames
    ) {

        if (!regional) {

            return null;

        }


        const scores = [];


        modelNames.forEach(
            modelName => {

                const metric =
                    findModelMetric(
                        regional,
                        modelName
                    );


                if (!metric) {

                    return;

                }


                const accuracy =
                    number(
                        metric.rainAccuracy ??
                        metric.rain_accuracy_percent ??
                        metric.rainAccuracyPercent
                    );


                if (
                    accuracy !== null
                ) {

                    scores.push(
                        clamp(
                            accuracy,
                            0,
                            100
                        )
                    );

                }

            }
        );


        if (!scores.length) {

            return null;

        }


        return average(
            scores
        );

    }


    // =====================================================
    // VERIFICATION SCORE
    // =====================================================

    function getVerificationScore(
        verification
    ) {

        if (!verification) {

            return null;

        }


        const candidates = [

            verification.rainAccuracy,

            verification.rain_accuracy_percent,

            verification.overallRainAccuracy,

            verification.overall?.rainAccuracy,

            verification.metrics?.rainAccuracy,

            verification.metrics?.rain_accuracy_percent,

            verification.accuracy

        ];


        for (
            const candidate
            of candidates
        ) {

            const value =
                number(candidate);


            if (
                value !== null
            ) {

                return clamp(
                    value,
                    0,
                    100
                );

            }

        }


        return null;

    }


    // =====================================================
    // MODEL CONSISTENCY SCORE
    // =====================================================

    function getConsistencyScore(
        prediction
    ) {

        if (!prediction) {

            return null;

        }


        const consistency =
            prediction
                .forecastConsistency;


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
    // OVERALL CONFIDENCE
    // =====================================================

    function calculateConfidence(
        consistencyScore,
        regionalScore,
        verificationScore
    ) {

        const values = [];


        if (
            consistencyScore !== null
        ) {

            values.push({
                value:
                    consistencyScore,

                weight:
                    0.50
            });

        }


        if (
            regionalScore !== null
        ) {

            values.push({
                value:
                    regionalScore,

                weight:
                    0.30
            });

        }


        if (
            verificationScore !== null
        ) {

            values.push({
                value:
                    verificationScore,

                weight:
                    0.20
            });

        }


        if (!values.length) {

            return {

                score:
                    null,

                level:
                    "Limited data"

            };

        }


        let weightedTotal =
            0;


        let totalWeight =
            0;


        values.forEach(
            item => {

                weightedTotal +=
                    item.value *
                    item.weight;

                totalWeight +=
                    item.weight;

            }
        );


        const score =
            weightedTotal /
            totalWeight;


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

                Math.round(
                    score
                ),

            level

        };

    }


    // =====================================================
    // EXPLANATION
    // =====================================================

    function buildExplanation(
        prediction,
        consistencyScore,
        regionalScore,
        verificationScore
    ) {

        const parts = [];


        if (
            consistencyScore !== null
        ) {

            if (
                consistencyScore >= 80
            ) {

                parts.push(
                    "ECMWF, GFS aur ICON ke rainfall signals kaafi close hain."

                );

            } else if (
                consistencyScore >= 60
            ) {

                parts.push(
                    "Weather models mein moderate difference hai."
                );

            } else {

                parts.push(
                    "Weather models ke rainfall estimates mein significant difference hai."
                );

            }

        }


        if (
            regionalScore !== null
        ) {

            parts.push(
                "Selected region ke historical model performance ko bhi context mein liya gaya hai."
            );

        }


        if (
            verificationScore !== null
        ) {

            parts.push(
                "Past automatic verification data available hai."
            );

        }


        if (!parts.length) {

            parts.push(
                "Abhi sufficient historical verification data available nahi hai; confidence mainly current model agreement par depend karega."
            );

        }


        return parts.join(
            " "
        );

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


        const verification =
            getAutomaticVerification();


        const consistencyScore =
            getConsistencyScore(
                prediction
            );


        const regionalScore =
            getRegionalScore(
                regional,
                [
                    "ECMWF",
                    "GFS",
                    "ICON"
                ]
            );


        const verificationScore =
            getVerificationScore(
                verification
            );


        const confidence =
            calculateConfidence(
                consistencyScore,
                regionalScore,
                verificationScore
            );


        const explanation =
            buildExplanation(
                prediction,
                consistencyScore,
                regionalScore,
                verificationScore
            );


        const container =
            getContainer();


        if (!container) {

            return;

        }


        let confidenceTitle =
            "Forecast Confidence";


        if (
            confidence.level ===
            "High"
        ) {

            confidenceTitle =
                "High Forecast Confidence";

        } else if (
            confidence.level ===
            "Moderate"
        ) {

            confidenceTitle =
                "Moderate Forecast Confidence";

        } else if (
            confidence.level ===
            "Low"
        ) {

            confidenceTitle =
                "Low Forecast Confidence";

        } else {

            confidenceTitle =
                "Forecast Confidence — Limited Data";

        }


        const scoreText =
            confidence.score !== null
                ? `${confidence.score}/100`
                : "—";


        const locationName =
            prediction
                .location
                ?.name ||
            "Selected Location";


        container.innerHTML = `

            <div style="
                background:#ffffff;
                border:1px solid #e2e8f0;
                border-radius:18px;
                padding:20px;
                box-shadow:0 5px 20px rgba(15,23,42,.06);
            ">


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

                            ${confidenceTitle}

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
                     INPUT FACTORS
                     ===================================== -->

                <div style="
                    display:grid;
                    grid-template-columns:
                        repeat(auto-fit,minmax(170px,1fr));
                    gap:10px;
                    margin-top:18px;
                ">


                    <div style="
                        padding:13px;
                        border-radius:13px;
                        background:#f8fafc;
                        border:1px solid #e2e8f0;
                    ">

                        <div style="
                            font-size:11px;
                            color:#64748b;
                        ">

                            🤖 Model Consistency

                        </div>


                        <strong style="
                            display:block;
                            margin-top:5px;
                            font-size:18px;
                        ">

                            ${
                                consistencyScore !== null
                                    ? Math.round(
                                        consistencyScore
                                      ) + "%"
                                    : "—"
                            }

                        </strong>


                    </div>



                    <div style="
                        padding:13px;
                        border-radius:13px;
                        background:#f8fafc;
                        border:1px solid #e2e8f0;
                    ">

                        <div style="
                            font-size:11px;
                            color:#64748b;
                        ">

                            📍 Regional History

                        </div>


                        <strong style="
                            display:block;
                            margin-top:5px;
                            font-size:18px;
                        ">

                            ${
                                regionalScore !== null
                                    ? Math.round(
                                        regionalScore
                                      ) + "%"
                                    : "—"
                            }

                        </strong>


                    </div>



                    <div style="
                        padding:13px;
                        border-radius:13px;
                        background:#f8fafc;
                        border:1px solid #e2e8f0;
                    ">

                        <div style="
                            font-size:11px;
                            color:#64748b;
                        ">

                            🔎 Past Verification

                        </div>


                        <strong style="
                            display:block;
                            margin-top:5px;
                            font-size:18px;
                        ">

                            ${
                                verificationScore !== null
                                    ? Math.round(
                                        verificationScore
                                      ) + "%"
                                    : "—"
                            }

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

                    Confidence Index koi guaranteed
                    accuracy percentage nahi hai.

                    Ye current model agreement,
                    available regional historical
                    performance aur available
                    verification information ko
                    combine karta hai.

                    Jahan historical data unavailable
                    ho, wahan us factor ko calculation
                    se automatically exclude kiya jata hai.

                </div>


            </div>

        `;


        lastRenderedLocation =
            locationName;


        console.log(
            ENGINE_NAME,
            "Rendered:",
            locationName,
            confidence
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
    // WEATHER UPDATE
    // =====================================================

    window.addEventListener(
        "rrp:weather-updated",
        () => {

            run();

        }
    );


    // =====================================================
    // CUSTOM EVENTS
    // =====================================================

    window.addEventListener(
        "rrp:prediction-updated",
        () => {

            run();

        }
    );


    // =====================================================
    // PAGE LOAD
    // =====================================================

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
