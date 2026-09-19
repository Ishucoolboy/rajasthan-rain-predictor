/* =========================================================
   RAJASTHAN RAIN PREDICTOR
   MULTI-MODEL PREDICTION ENGINE V3
   ========================================================= */

(() => {

    "use strict";


    /* =====================================================
       CONFIG
       ===================================================== */

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


    /* =====================================================
       HELPERS
       ===================================================== */

    function number(value) {

        const n = Number(value);

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
                    !Number.isFinite(
                        parsed
                    )
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


    /* =====================================================
       FETCH MODEL
       ===================================================== */

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


        /* =================================================
           CURRENT
           ================================================= */

        const currentRain =
            number(
                (
                    hourly
                        .precipitation ||
                    []
                )[currentIndex]
            );


        const currentProbability =
            number(
                (
                    hourly
                        .precipitation_probability ||
                    []
                )[currentIndex]
            );


        /* =================================================
           NEXT 24 HOURS
           ================================================= */

        const next24Rain =
            (
                hourly
                    .precipitation ||
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
                hourly
                    .precipitation_probability ||
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


        /* =================================================
           NEXT 3 DAYS
           ================================================= */

        const next3DayRain =
            (
                daily
                    .precipitation_sum ||
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


        /* =================================================
           THUNDERSTORM
           ================================================= */

        const codes =
            (
                hourly
                    .weather_code ||
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


    /* =====================================================
       RAIN RISK
       ===================================================== */

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


    /* =====================================================
       MODEL AGREEMENT
       ===================================================== */

    function getModelAgreement(
        values
    ) {

        if (
            values.length < 2
        ) {

            return "Insufficient model data";

        }


        const minimum =
            Math.min(
                ...values
            );


        const maximum =
            Math.max(
                ...values
            );


        const mean =
            average(values);


        if (
            mean === 0
        ) {

            return "Models mostly dry";

        }


        const spread =
            (
                (maximum - minimum) /
                mean
            ) * 100;


        if (
            spread <= 25
        ) {

            return "Strong model agreement";

        }


        if (
            spread <= 60
        ) {

            return "Moderate model agreement";

        }


        return "Models disagree";

    }


    /* =====================================================
       GET CONTAINER
       ===================================================== */

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


    /* =====================================================
       LOADING UI
       ===================================================== */

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


    /* =====================================================
       REGIONAL ACCURACY CONTEXT
       ===================================================== */

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
                "[RRP Prediction V3] Regional accuracy context unavailable:",
                error
            );


            return null;

        }

    }


    /* =====================================================
       FORMAT REGIONAL METRIC
       ===================================================== */

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


    /* =====================================================
       RENDER REGIONAL CONTEXT
       ===================================================== */

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


        const matchType =
            regional.matchType;


        let title =
            "📍 Regional Accuracy Context";


        let description =
            "";


        if (
            matchType ===
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
                    Number.isFinite(
                        distance
                    )
                        ? `
                            (${distance.toFixed(1)} km)
                          `
                        : ""
                }

            `;

        } else if (
            matchType ===
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
                    Number.isFinite(
                        distance
                    )
                        ? `
                            (${distance.toFixed(1)} km away)
                          `
                        : ""
                }

                <br><br>

                Ye metrics searched location ke
                liye <strong>regional proxy</strong>
                hain, exact village accuracy nahi.

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
                    Number.isFinite(
                        distance
                    )
                        ? `
                            (${distance.toFixed(1)} km away)
                          `
                        : ""
                }

                <br><br>

                Distance zyada hone ke karan
                is historical data ko exact
                local accuracy nahi maana jana chahiye.

            `;

        }


        let cards =
            "";


        [
            "ECMWF",
            "GFS",
            "ICON"
        ].forEach(
            function (modelName) {

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

                    ${title}

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
                        : `
                            <div style="
                                margin-top:12px;
                                font-size:12px;
                            ">
                                Model verification data
                                unavailable.
                            </div>
                          `
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

                    Ye forecast ko interpret karne ke
                    liye historical context hain.

                </div>

            </div>

        `;

    }


    /* =====================================================
       RENDER PREDICTION
       ===================================================== */

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

                    Model data is
                    temporarily unavailable.

                </p>

            `;

            return;

        }


        /* =================================================
           COMBINED VALUES
           ================================================= */

        const combinedProbability =
            average(
                validModels.map(
                    model =>
                        model.peakProbability
                )
            );


        const combinedRain =
            average(
                validModels.map(
                    model =>
                        model.next24Rain
                )
            );


        const combined3DayRain =
            average(
                validModels.map(
                    model =>
                        model.next3DayRain
                )
            );


        const thunderstorm =
            validModels.some(
                model =>
                    model.thunderstorm
            );


        const modelAgreement =
            getModelAgreement(
                validModels.map(
                    model =>
                        model.next24Rain
                )
            );


        const rainRisk =
            getRainRisk(
                combinedProbability,
                combinedRain
            );


        /* =================================================
           MODEL ROWS
           ================================================= */

        const rows =
            validModels.map(
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


        /* =================================================
           REGIONAL CONTEXT
           ================================================= */

        const regionalContext =
            renderRegionalContext();


        /* =================================================
           MAIN UI
           ================================================= */

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


            <div style="
                display:grid;
                grid-template-columns:
                    repeat(4,minmax(0,1fr));
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
                        Next 24h Rain
                    </small>

                    <div style="
                        font-size:25px;
                        font-weight:700;
                    ">

                        ${combinedRain.toFixed(1)}
                        mm

                    </div>

                </div>


                <div style="
                    padding:16px;
                    border-radius:14px;
                    background:#fff7ed;
                ">

                    <small>
                        Next 3 Days
                    </small>

                    <div style="
                        font-size:25px;
                        font-weight:700;
                    ">

                        ${combined3DayRain.toFixed(1)}
                        mm

                    </div>

                </div>


                <div style="
                    padding:16px;
                    border-radius:14px;
                    background:#f8fafc;
                ">

                    <small>
                        Rain Signal
                    </small>

                    <div style="
                        font-size:18px;
                        font-weight:700;
                        margin-top:4px;
                    ">

                        ${escapeHTML(
                            rainRisk
                        )}

                    </div>

                </div>


            </div>


            <div style="
                display:grid;
                grid-template-columns:
                    repeat(2,minmax(0,1fr));
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

                    ${escapeHTML(
                        modelAgreement
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

                    ${
                        thunderstorm
                            ? "Possible"
                            : "Not indicated"
                    }

                </div>


            </div>


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


            ${regionalContext}


            <p style="
                margin-top:14px;
                color:#64748b;
                font-size:12px;
                line-height:1.5;
            ">

                Model-consensus probability is a
                forecast signal from ECMWF, GFS and ICON.
                It is not a measured accuracy percentage.

                Historical accuracy requires comparison
                with independent observations or an
                explicitly defined reference dataset.

            </p>

        `;


        latestPrediction = {

            location,

            probability:
                combinedProbability,

            rainfall:
                combinedRain,

            threeDayRain:
                combined3DayRain,

            modelAgreement,

            rainRisk,

            thunderstorm,

            models:
                validModels

        };

    }


    /* =====================================================
       RUN ENGINE
       ===================================================== */

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


        loading = true;


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
                                        "[RRP Prediction V3]",
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


    /* =====================================================
       PUBLIC API
       ===================================================== */

    window.RRP_PREDICTION_ENGINE = {

        run,

        getLatest: () =>
            latestPrediction

    };


    /* =====================================================
       WEATHER UPDATE EVENT
       ===================================================== */

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


    /* =====================================================
       REGIONAL ACCURACY MAY LOAD AFTER PREDICTION
       ===================================================== */

    /*
      Regional Accuracy Engine index.html me
      prediction engine ke baad load hota hai.

      Isliye prediction complete hone ke baad
      thoda wait karke UI ko regional context ke
      saath refresh karte hain.
    */

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
                4000
            );

        }
    );


})();
