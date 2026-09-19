/* =========================================================
   RAJASTHAN RAIN PREDICTOR
   MULTI-MODEL PREDICTION ENGINE V6
   ========================================================= */

(() => {

    "use strict";


    // =====================================================
    // CONFIG
    // =====================================================

    const API =
        "https://api.open-meteo.com/v1/forecast";


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


    let latestPrediction = null;

    let loading = false;


    // =====================================================
    // HELPERS
    // =====================================================

    function number(value) {

        const n = Number(value);

        return Number.isFinite(n)
            ? n
            : 0;

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

        if (!values.length) {

            return 0;

        }


        return values.reduce(
            (sum, value) =>
                sum + value,
            0
        ) / values.length;

    }


    function findCurrentHour(times) {

        if (
            !Array.isArray(times) ||
            !times.length
        ) {

            return 0;

        }


        const now =
            Date.now();


        let bestIndex = 0;

        let bestDifference =
            Infinity;


        times.forEach(
            (time, index) => {

                const parsed =
                    new Date(time)
                        .getTime();


                if (
                    !Number.isFinite(parsed)
                ) {

                    return;

                }


                const difference =
                    Math.abs(
                        parsed - now
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


    // =====================================================
    // FETCH MODEL
    // =====================================================

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
                    "precipitation,precipitation_probability,weather_code",

                daily:
                    "precipitation_sum,precipitation_probability_max",

                forecast_days:
                    "3",

                timezone:
                    "auto",

                models:
                    model.id

            });


        const response =
            await fetch(
                API +
                "?" +
                params.toString()
            );


        if (!response.ok) {

            throw new Error(
                model.name +
                " model request failed: HTTP " +
                response.status
            );

        }


        const data =
            await response.json();


        const hourly =
            data.hourly || {};


        const daily =
            data.daily || {};


        const currentIndex =
            findCurrentHour(
                hourly.time || []
            );


        // =================================================
        // CURRENT
        // =================================================

        const currentRain =
            number(
                (
                    hourly.precipitation ||
                    []
                )[currentIndex]
            );


        const currentProbability =
            number(
                (
                    hourly.precipitation_probability ||
                    []
                )[currentIndex]
            );


        // =================================================
        // NEXT 24 HOURS
        // =================================================

        const next24Rain =
            (
                hourly.precipitation ||
                []
            )
            .slice(
                currentIndex,
                currentIndex + 24
            )
            .reduce(
                (sum, value) =>
                    sum + number(value),
                0
            );


        const next24Probability =
            (
                hourly.precipitation_probability ||
                []
            )
            .slice(
                currentIndex,
                currentIndex + 24
            )
            .map(number);


        const peakProbability =
            next24Probability.length
                ? Math.max(
                    ...next24Probability
                )
                : 0;


        // =================================================
        // NEXT 3 DAYS
        // =================================================

        const next3DayRain =
            (
                daily.precipitation_sum ||
                []
            )
            .slice(
                0,
                3
            )
            .reduce(
                (sum, value) =>
                    sum + number(value),
                0
            );


        // =================================================
        // THUNDERSTORM
        // =================================================

        const codes =
            (
                hourly.weather_code ||
                []
            )
            .slice(
                currentIndex,
                currentIndex + 24
            )
            .map(number);


        const thunderstorm =
            codes.some(
                code =>
                    code === 95 ||
                    code === 96 ||
                    code === 99
            );


        return {

            name:
                model.name,

            modelId:
                model.id,

            currentRain,

            currentProbability,

            next24Rain,

            peakProbability,

            next3DayRain,

            thunderstorm,

            success:
                true

        };

    }


    // =====================================================
    // RAIN RISK
    // =====================================================

    function getRainRisk(
        probability,
        rainfall
    ) {

        if (
            probability >= 80 ||
            rainfall >= 20
        ) {

            return "High Rain Signal";

        }


        if (
            probability >= 50 ||
            rainfall >= 5
        ) {

            return "Moderate Rain Signal";

        }


        if (
            probability >= 25 ||
            rainfall > 0
        ) {

            return "Low Rain Signal";

        }


        return "Low Rain Signal";

    }


    // =====================================================
    // MODEL AGREEMENT
    // =====================================================

    function getModelAgreement(
        values
    ) {

        if (
            values.length < 2
        ) {

            return {

                label:
                    "Insufficient model data",

                level:
                    "unknown",

                spread:
                    null

            };

        }


        const minimum =
            Math.min(...values);


        const maximum =
            Math.max(...values);


        const mean =
            average(values);


        if (
            mean === 0
        ) {

            return {

                label:
                    "Models mostly dry",

                level:
                    "high",

                spread:
                    0

            };

        }


        const spread =
            (
                (maximum - minimum) /
                mean
            ) * 100;


        if (
            spread <= 25
        ) {

            return {

                label:
                    "Strong model agreement",

                level:
                    "high",

                spread

            };

        }


        if (
            spread <= 60
        ) {

            return {

                label:
                    "Moderate model agreement",

                level:
                    "moderate",

                spread

            };

        }


        return {

            label:
                "Models disagree",

            level:
                "low",

            spread

        };

    }


    // =====================================================
    // FORECAST CONSISTENCY
    // =====================================================

    function getForecastConsistency(
        values
    ) {

        if (
            values.length < 2
        ) {

            return {

                label:
                    "Insufficient data",

                level:
                    "unknown",

                score:
                    null,

                spread:
                    null

            };

        }


        const minimum =
            Math.min(...values);


        const maximum =
            Math.max(...values);


        const mean =
            average(values);


        // IMPORTANT:
        // All models dry = spread 0
        // This prevents undefined.toFixed()
        if (
            mean === 0
        ) {

            return {

                label:
                    "Very consistent dry signal",

                level:
                    "high",

                score:
                    100,

                spread:
                    0

            };

        }


        const spread =
            (
                (maximum - minimum) /
                mean
            ) * 100;


        let score;


        if (
            spread <= 10
        ) {

            score = 95;

        } else if (
            spread <= 25
        ) {

            score = 85;

        } else if (
            spread <= 40
        ) {

            score = 70;

        } else if (
            spread <= 60
        ) {

            score = 55;

        } else if (
            spread <= 100
        ) {

            score = 40;

        } else {

            score = 25;

        }


        let label;


        if (
            score >= 85
        ) {

            label =
                "High consistency";

        } else if (
            score >= 55
        ) {

            label =
                "Moderate consistency";

        } else {

            label =
                "Low consistency";

        }


        return {

            label,

            level:
                score >= 85
                    ? "high"
                    : score >= 55
                        ? "moderate"
                        : "low",

            score,

            spread

        };

    }


    // =====================================================
    // CONFIDENCE EXPLANATION
    // =====================================================

    function getConfidenceExplanation(
        consistency,
        modelAgreement,
        minimumRain,
        maximumRain
    ) {

        const spread =
            Number.isFinite(
                Number(
                    consistency?.spread
                )
            )
                ? Number(
                    consistency.spread
                )
                : 0;


        if (
            consistency.level ===
            "high"
        ) {

            if (
                maximumRain === 0
            ) {

                return `

                    ECMWF, GFS aur ICON
                    teeno models rainfall ka
                    very low / dry signal de rahe hain.

                    <br><br>

                    Model spread:

                    <strong>
                        ${spread.toFixed(1)}%
                    </strong>

                `;

            }


            return `

                ECMWF, GFS aur ICON ke
                rainfall signals kaafi close hain.

                Model spread:

                <strong>
                    ${spread.toFixed(1)}%
                </strong>

            `;

        }


        if (
            consistency.level ===
            "moderate"
        ) {

            return `

                Models ke rainfall estimates
                mein noticeable difference hai.

                <br><br>

                Range:

                <strong>
                    ${minimumRain.toFixed(1)}
                    –
                    ${maximumRain.toFixed(1)}
                    mm
                </strong>

            `;

        }


        return `

            ECMWF, GFS aur ICON ke forecasts
            mein significant difference hai.

            <br><br>

            Range:

            <strong>
                ${minimumRain.toFixed(1)}
                –
                ${maximumRain.toFixed(1)}
                mm
            </strong>

            <br><br>

            Is situation mein forecast uncertainty
            relatively higher hai.

        `;

    }


    // =====================================================
    // CONTAINER
    // =====================================================

    function getContainer() {

        let container =
            document.getElementById(
                "predictionEngine"
            );


        if (container) {

            return container;

        }


        container =
            document.createElement(
                "section"
            );


        container.id =
            "predictionEngine";


        container.style.marginTop =
            "28px";


        container.style.background =
            "white";


        container.style.padding =
            "22px";


        container.style.borderRadius =
            "18px";


        container.style.boxShadow =
            "0 5px 20px rgba(15,23,42,0.06)";


        const target =
            document.querySelector(
                ".model-section"
            ) ||
            document.querySelector(
                ".map-section"
            ) ||
            document.querySelector(
                "main"
            );


        if (target) {

            target.parentNode.insertBefore(
                container,
                target
            );

        }


        return container;

    }


    // =====================================================
    // LOADING
    // =====================================================

    function showLoading() {

        const container =
            getContainer();


        container.innerHTML = `

            <h2>
                🎯 Combined Rain Prediction
            </h2>

            <p style="
                color:#64748b;
                margin-top:6px;
            ">

                Comparing ECMWF,
                GFS and ICON...

            </p>

        `;

    }


    // =====================================================
    // REGIONAL CONTEXT
    // =====================================================

    function getRegionalContext() {

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
                "[RRP Prediction V6] Regional context unavailable:",
                error
            );


            return null;

        }

    }


    // =====================================================
    // REGIONAL METRIC
    // =====================================================

    function regionalMetric(
        value,
        suffix = ""
    ) {

        const n =
            Number(value);


        if (
            !Number.isFinite(n)
        ) {

            return "—";

        }


        return (
            n.toFixed(2) +
            suffix
        );

    }


    // =====================================================
    // REGIONAL UI
    // =====================================================

    function renderRegionalContext() {

        const regional =
            getRegionalContext();


        if (!regional) {

            return `

                <div style="
                    margin-top:18px;
                    padding:15px;
                    border-radius:14px;
                    background:#f8fafc;
                    border:1px solid #e2e8f0;
                    font-size:12px;
                    line-height:1.6;
                ">

                    📍

                    <strong>
                        Regional Accuracy Context
                    </strong>

                    <br>

                    Regional historical data
                    is currently unavailable
                    for this selected location.

                </div>

            `;

        }


        const selectedName =
            regional
                .selectedLocation
                ?.name ||
            "Selected Location";


        const regionalName =
            regional
                .regionalLocation
                ?.name ||
            "Regional Location";


        const distance =
            Number(
                regional.distanceKm
            );


        let description =
            "";


        if (
            regional.matchType ===
            "exact"
        ) {

            description = `

                Historical verification is
                available for the selected
                monitoring location.

                <br>

                Monitoring point:

                <strong>
                    ${escapeHTML(
                        regionalName
                    )}
                </strong>

                ${
                    Number.isFinite(distance)
                        ? `(${distance.toFixed(1)} km)`
                        : ""
                }

            `;

        } else if (
            regional.matchType ===
            "nearest"
        ) {

            description = `

                Selected location:

                <strong>
                    ${escapeHTML(
                        selectedName
                    )}
                </strong>

                <br>

                Nearest monitoring point:

                <strong>
                    ${escapeHTML(
                        regionalName
                    )}
                </strong>

                ${
                    Number.isFinite(distance)
                        ? `(${distance.toFixed(1)} km away)`
                        : ""
                }

                <br><br>

                Ye historical metrics searched
                location ke liye

                <strong>
                    regional proxy
                </strong>

                hain.

            `;

        } else {

            description = `

                Nearest monitoring location:

                <strong>
                    ${escapeHTML(
                        regionalName
                    )}
                </strong>

                ${
                    Number.isFinite(distance)
                        ? `(${distance.toFixed(1)} km away)`
                        : ""
                }

                <br><br>

                Distance zyada hone ke karan
                ye data exact local accuracy
                nahi maana jana chahiye.

            `;

        }


        let cards = "";


        [
            "ECMWF",
            "GFS",
            "ICON"
        ].forEach(
            modelName => {

                const model =
                    regional.models?.[
                        modelName
                    ];


                if (!model) {

                    return;

                }


                cards += `

                    <div style="
                        padding:14px;
                        border-radius:12px;
                        background:white;
                        border:1px solid #e2e8f0;
                    ">

                        <strong>
                            🛰️ ${modelName}
                        </strong>

                        <div style="
                            margin-top:9px;
                            font-size:12px;
                            line-height:1.8;
                        ">

                            Samples:

                            <strong>
                                ${
                                    model.samples ??
                                    "—"
                                }
                            </strong>

                            <br>

                            MAE:

                            <strong>
                                ${regionalMetric(
                                    model.mae,
                                    " mm"
                                )}
                            </strong>

                            <br>

                            RMSE:

                            <strong>
                                ${regionalMetric(
                                    model.rmse,
                                    " mm"
                                )}
                            </strong>

                            <br>

                            Bias:

                            <strong>
                                ${regionalMetric(
                                    model.bias,
                                    " mm"
                                )}
                            </strong>

                            <br>

                            Rain Accuracy:

                            <strong>
                                ${regionalMetric(
                                    model.rainAccuracy,
                                    "%"
                                )}
                            </strong>

                        </div>

                    </div>

                `;

            }
        );


        return `

            <div style="
                margin-top:18px;
                padding:16px;
                border-radius:15px;
                background:#f8fafc;
                border:1px solid #e2e8f0;
            ">

                <h3 style="
                    margin:0 0 8px;
                ">

                    📍 Regional Accuracy Context

                </h3>


                <div style="
                    font-size:12px;
                    color:#475569;
                    line-height:1.7;
                ">

                    ${description}

                </div>


                ${
                    cards
                        ? `
                            <div style="
                                display:grid;
                                grid-template-columns:
                                repeat(auto-fit,minmax(170px,1fr));
                                gap:10px;
                                margin-top:14px;
                            ">

                                ${cards}

                            </div>
                          `
                        : ""
                }


                <div style="
                    margin-top:14px;
                    padding:10px 12px;
                    border-radius:10px;
                    background:#fff7ed;
                    border:1px solid #fed7aa;
                    font-size:11px;
                    line-height:1.6;
                ">

                    ⚠️ Historical regional metrics
                    current forecast probability ko
                    directly modify nahi karte.

                    Ye sirf historical context hain.

                </div>

            </div>

        `;

    }


    // =====================================================
    // RENDER
    // =====================================================

    function renderPrediction(
        location,
        models
    ) {

        const container =
            getContainer();


        const validModels =
            models.filter(
                model =>
                    model.success
            );


        if (
            !validModels.length
        ) {

            container.innerHTML = `

                <h2>
                    🎯 Combined Rain Prediction
                </h2>

                <p style="
                    color:#64748b;
                ">

                    Model data is temporarily
                    unavailable.

                </p>

            `;

            return;

        }


        // =================================================
        // VALUES
        // =================================================

        const rainValues =
            validModels.map(
                model =>
                    model.next24Rain
            );


        const probabilityValues =
            validModels.map(
                model =>
                    model.peakProbability
            );


        const threeDayValues =
            validModels.map(
                model =>
                    model.next3DayRain
            );


        const combinedProbability =
            average(
                probabilityValues
            );


        const combinedRain =
            average(
                rainValues
            );


        const combined3DayRain =
            average(
                threeDayValues
            );


        const minimumRain =
            Math.min(
                ...rainValues
            );


        const maximumRain =
            Math.max(
                ...rainValues
            );


        const minimum3DayRain =
            Math.min(
                ...threeDayValues
            );


        const maximum3DayRain =
            Math.max(
                ...threeDayValues
            );


        // =================================================
        // SIGNALS
        // =================================================

        const agreement =
            getModelAgreement(
                rainValues
            );


        const consistency =
            getForecastConsistency(
                rainValues
            );


        const rainRisk =
            getRainRisk(
                combinedProbability,
                combinedRain
            );


        const thunderstorm =
            validModels.some(
                model =>
                    model.thunderstorm
            );


        // =================================================
        // CONFIDENCE EXPLANATION
        // =================================================

        const confidenceExplanation =
            getConfidenceExplanation(
                consistency,
                agreement,
                minimumRain,
                maximumRain
            );


        // =================================================
        // MODEL ROWS
        // =================================================

        const rows =
            validModels
                .map(
                    model => `

                        <div style="
                            display:grid;
                            grid-template-columns:
                                90px 1fr 1fr 1fr;
                            gap:8px;
                            padding:9px 0;
                            border-bottom:
                                1px solid #e2e8f0;
                            font-size:13px;
                            align-items:center;
                        ">

                            <strong>
                                ${escapeHTML(
                                    model.name
                                )}
                            </strong>

                            <span>
                                ${model.next24Rain.toFixed(1)}
                                mm
                            </span>

                            <span>
                                ${Math.round(
                                    model.peakProbability
                                )}%
                            </span>

                            <span>
                                ${model.next3DayRain.toFixed(1)}
                                mm
                            </span>

                        </div>

                    `
                )
                .join("");


        // =================================================
        // REGIONAL
        // =================================================

        const regionalContext =
            renderRegionalContext();


        // =================================================
        // CONSISTENCY DESCRIPTION
        // =================================================

        let consistencyDescription =
            "";


        if (
            consistency.level ===
            "high"
        ) {

            consistencyDescription =
                "Models are relatively close.";

        } else if (
            consistency.level ===
            "moderate"
        ) {

            consistencyDescription =
                "Models show some disagreement.";

        } else {

            consistencyDescription =
                "Models show significant spread.";

        }


        // =================================================
        // SCORE TEXT
        // =================================================

        const consistencyScoreText =
            consistency.score !== null &&
            consistency.score !== undefined
                ? Math.round(
                    consistency.score
                ) +
                "/100 consistency"
                : "Insufficient data";


        // =================================================
        // MAIN UI
        // =================================================

        container.innerHTML = `

            <h2>
                🎯 Combined Rain Prediction
            </h2>


            <p style="
                color:#64748b;
                margin-top:5px;
                margin-bottom:16px;
            ">

                Multi-model rainfall signal for

                <strong>
                    ${escapeHTML(
                        location.name
                    )}
                </strong>

            </p>


            <!-- =========================================
                 MAIN METRICS
                 ========================================= -->

            <div style="
                display:grid;
                grid-template-columns:
                    repeat(auto-fit,minmax(150px,1fr));
                gap:12px;
                margin-bottom:18px;
            ">


                <div style="
                    padding:16px;
                    border-radius:14px;
                    background:#eff6ff;
                ">

                    <small>
                        Rain Probability
                    </small>

                    <div style="
                        font-size:25px;
                        font-weight:700;
                        margin-top:5px;
                    ">

                        ${Math.round(
                            combinedProbability
                        )}%

                    </div>

                </div>


                <div style="
                    padding:16px;
                    border-radius:14px;
                    background:#f0fdf4;
                ">

                    <small>
                        Average 24h Rain
                    </small>

                    <div style="
                        font-size:25px;
                        font-weight:700;
                        margin-top:5px;
                    ">

                        ${combinedRain.toFixed(1)}
                        mm

                    </div>

                </div>


                <div style="
                    padding:16px;
                    border-radius:14px;
                    background:#fefce8;
                ">

                    <small>
                        Model Rain Range
                    </small>

                    <div style="
                        font-size:22px;
                        font-weight:700;
                        margin-top:5px;
                    ">

                        ${minimumRain.toFixed(1)}
                        –
                        ${maximumRain.toFixed(1)}
                        mm

                    </div>

                    <div style="
                        font-size:10px;
                        margin-top:4px;
                        color:#64748b;
                    ">

                        Next 24 hours

                    </div>

                </div>


                <div style="
                    padding:16px;
                    border-radius:14px;
                    background:#fff7ed;
                ">

                    <small>
                        3-Day Average
                    </small>

                    <div style="
                        font-size:25px;
                        font-weight:700;
                        margin-top:5px;
                    ">

                        ${combined3DayRain.toFixed(1)}
                        mm

                    </div>

                </div>


            </div>


            <!-- =========================================
                 FORECAST CONSISTENCY
                 ========================================= -->

            <div style="
                margin-bottom:18px;
                padding:18px;
                border-radius:16px;
                border:1px solid #e2e8f0;
                background:#f8fafc;
            ">


                <div style="
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    gap:12px;
                    flex-wrap:wrap;
                ">

                    <div>

                        <div style="
                            font-size:11px;
                            color:#64748b;
                            text-transform:uppercase;
                            letter-spacing:.05em;
                        ">

                            Forecast Consistency

                        </div>


                        <div style="
                            font-size:21px;
                            font-weight:700;
                            margin-top:4px;
                        ">

                            ${escapeHTML(
                                consistency.label
                            )}

                        </div>

                    </div>


                    <div style="
                        padding:8px 12px;
                        border-radius:999px;
                        background:white;
                        border:1px solid #e2e8f0;
                        font-size:12px;
                        font-weight:700;
                    ">

                        ${consistencyScoreText}

                    </div>

                </div>


                <div style="
                    margin-top:12px;
                    font-size:12px;
                    color:#475569;
                    line-height:1.7;
                ">

                    ${confidenceExplanation}

                    <br><br>

                    ${consistencyDescription}

                </div>


                <div style="
                    margin-top:12px;
                    padding:10px 12px;
                    border-radius:10px;
                    background:#fff7ed;
                    border:1px solid #fed7aa;
                    font-size:11px;
                    line-height:1.6;
                ">

                    ⚠️

                    <strong>
                        Important:
                    </strong>

                    Ye consistency score
                    <strong>
                        forecast accuracy
                    </strong>
                    nahi hai.

                    Ye sirf ECMWF, GFS aur ICON
                    ke current forecasts ke
                    beech agreement ko describe karta hai.

                </div>

            </div>


            <!-- =========================================
                 3 DAY RANGE
                 ========================================= -->

            <div style="
                padding:14px;
                border-radius:13px;
                background:#f8fafc;
                border:1px solid #e2e8f0;
                margin-bottom:16px;
                font-size:13px;
                line-height:1.6;
            ">

                📊

                <strong>
                    3-Day Model Range:
                </strong>

                ${minimum3DayRain.toFixed(1)}
                –
                ${maximum3DayRain.toFixed(1)}
                mm

                <br>

                <span style="
                    font-size:11px;
                    color:#64748b;
                ">

                    ECMWF, GFS aur ICON ke
                    3-day rainfall estimates ka
                    minimum–maximum range.

                </span>

            </div>


            <!-- =========================================
                 SIGNALS
                 ========================================= -->

            <div style="
                display:grid;
                grid-template-columns:
                    repeat(auto-fit,minmax(190px,1fr));
                gap:12px;
                margin-bottom:18px;
            ">


                <div style="
                    padding:14px;
                    border-radius:12px;
                    background:#f8fafc;
                ">

                    🤖

                    <strong>
                        Model Agreement:
                    </strong>

                    <br>

                    ${escapeHTML(
                        agreement.label
                    )}

                </div>


                <div style="
                    padding:14px;
                    border-radius:12px;
                    background:#f8fafc;
                ">

                    🌧️

                    <strong>
                        Rain Signal:
                    </strong>

                    <br>

                    ${escapeHTML(
                        rainRisk
                    )}

                </div>


                <div style="
                    padding:14px;
                    border-radius:12px;
                    background:#f8fafc;
                ">

                    ⛈️

                    <strong>
                        Thunderstorm:
                    </strong>

                    <br>

                    ${
                        thunderstorm
                            ? "Possible"
                            : "Not indicated"
                    }

                </div>


            </div>


            <!-- =========================================
                 MODEL TABLE
                 ========================================= -->

            <div style="
                overflow-x:auto;
            ">

                <div style="
                    min-width:600px;
                ">


                    <div style="
                        display:grid;
                        grid-template-columns:
                            90px 1fr 1fr 1fr;
                        gap:8px;
                        padding:8px 0;
                        font-size:12px;
                        font-weight:700;
                    ">

                        <span>
                            Model
                        </span>

                        <span>
                            24h Rain
                        </span>

                        <span>
                            Peak Probability
                        </span>

                        <span>
                            3-Day Rain
                        </span>

                    </div>


                    ${rows}


                </div>

            </div>


            <!-- =========================================
                 REGIONAL ACCURACY
                 ========================================= -->

            ${regionalContext}


            <!-- =========================================
                 EXPLANATION
                 ========================================= -->

            <div style="
                margin-top:14px;
                padding:13px;
                border-radius:12px;
                background:#f8fafc;
                font-size:11px;
                color:#64748b;
                line-height:1.7;
            ">

                ℹ️

                <strong>
                    Consistency:
                </strong>

                ECMWF, GFS aur ICON ke
                rainfall forecasts ke beech
                agreement/spread.

                <br>

                <strong>
                    Rain Probability:
                </strong>

                Weather-model forecast signal.

                <br>

                <strong>
                    Historical Accuracy:
                </strong>

                Separate verification system ke
                through measured reference data ke
                against calculate hoti hai.

            </div>

        `;


        // =================================================
        // SAVE RESULT
        // =================================================

        latestPrediction = {

            location,

            probability:
                combinedProbability,

            rainfall:
                combinedRain,

            rainfallMin:
                minimumRain,

            rainfallMax:
                maximumRain,

            threeDayRain:
                combined3DayRain,

            threeDayRainMin:
                minimum3DayRain,

            threeDayRainMax:
                maximum3DayRain,

            modelAgreement:
                agreement.label,

            modelAgreementLevel:
                agreement.level,

            modelSpread:
                agreement.spread,

            forecastConsistency:
                consistency,

            rainRisk,

            thunderstorm,

            models:
                validModels

        };

    }


    // =====================================================
    // RUN
    // =====================================================

    async function run(
        location
    ) {

        if (
            loading ||
            !location
        ) {

            return;

        }


        if (
            !Number.isFinite(
                Number(
                    location.latitude
                )
            ) ||
            !Number.isFinite(
                Number(
                    location.longitude
                )
            )
        ) {

            return;

        }


        loading =
            true;


        showLoading();


        try {

            const results =
                await Promise.all(

                    MODELS.map(
                        model =>

                            fetchModel(
                                location,
                                model
                            )

                            .catch(
                                error => {

                                    console.warn(
                                        "[RRP Prediction V6]",
                                        model.name +
                                        " prediction failed:",
                                        error
                                    );


                                    return {

                                        name:
                                            model.name,

                                        modelId:
                                            model.id,

                                        success:
                                            false

                                    };

                                }
                            )

                    )

                );


            renderPrediction(
                location,
                results
            );


        } finally {

            loading =
                false;

        }

    }


    // =====================================================
    // PUBLIC API
    // =====================================================

    window.RRP_PREDICTION_ENGINE = {

        run,

        getLatest:
            () =>
                latestPrediction

    };


    // =====================================================
    // WEATHER UPDATE
    // =====================================================

    window.addEventListener(
        "rrp:weather-updated",
        event => {

            const detail =
                event.detail || {};


            if (
                detail.location
            ) {

                run(
                    detail.location
                );

            }

        }
    );


    // =====================================================
    // REFRESH
    // =====================================================

    window.addEventListener(
        "load",
        function () {

            setTimeout(
                function () {

                    if (
                        latestPrediction
                    ) {

                        renderPrediction(
                            latestPrediction.location,
                            latestPrediction.models
                        );

                    }

                },
                4500
            );

        }
    );


})();
