(function () {
    "use strict";

    const STORAGE_KEY = "rrp_historical_model_accuracy_v7";

    const TEST_DAYS = 90;
    const HISTORICAL_DELAY_DAYS = 8;

    const MODELS = [
        {
            name: "ECMWF",
            modelId: "ecmwf_ifs025"
        },
        {
            name: "GFS",
            modelId: "gfs_seamless"
        },
        {
            name: "ICON",
            modelId: "icon_seamless"
        }
    ];

    let latestResult = null;

    function log(...args) {
        console.log("[RRP Historical Accuracy V7]", ...args);
    }

    function error(...args) {
        console.error("[RRP Historical Accuracy V7]", ...args);
    }

    function formatDate(date) {
        return date.toISOString().slice(0, 10);
    }

    function parseDate(dateString) {
        return new Date(dateString + "T00:00:00Z");
    }

    function addDays(date, days) {
        const d = new Date(date);
        d.setUTCDate(d.getUTCDate() + days);
        return d;
    }

    function getDateRange() {
        const today = new Date();

        const endDate = addDays(today, -HISTORICAL_DELAY_DAYS);
        const startDate = addDays(
            endDate,
            -(TEST_DAYS - 1)
        );

        return {
            startDate: formatDate(startDate),
            endDate: formatDate(endDate)
        };
    }

    function getSelectedLocation() {
        try {
            if (
                window.RRP_APP &&
                typeof window.RRP_APP.getCurrentLocation === "function"
            ) {
                const location = window.RRP_APP.getCurrentLocation();

                if (
                    location &&
                    Number.isFinite(Number(location.latitude)) &&
                    Number.isFinite(Number(location.longitude))
                ) {
                    return {
                        name: location.name || "Selected Location",
                        latitude: Number(location.latitude),
                        longitude: Number(location.longitude)
                    };
                }
            }
        } catch (e) {
            error("Could not get selected location:", e);
        }

        return null;
    }

    async function fetchJSON(url) {
        const response = await fetch(url);

        if (!response.ok) {
            let body = "";

            try {
                body = await response.text();
            } catch (e) {
                body = "";
            }

            throw new Error(
                "HTTP " +
                    response.status +
                    " | " +
                    body.slice(0, 500)
            );
        }

        return await response.json();
    }

    // ---------------------------------------------------------
    // ERA5 / Open-Meteo historical reference
    // ---------------------------------------------------------

    async function fetchHistoricalReference(location, startDate, endDate) {
        const params = new URLSearchParams({
            latitude: location.latitude,
            longitude: location.longitude,
            start_date: startDate,
            end_date: endDate,
            daily: "precipitation_sum",
            timezone: "auto",
            precipitation_unit: "mm"
        });

        const url =
            "https://archive-api.open-meteo.com/v1/archive?" +
            params.toString();

        log("Historical reference request:", url);

        const data = await fetchJSON(url);

        if (
            !data.daily ||
            !Array.isArray(data.daily.time) ||
            !Array.isArray(data.daily.precipitation_sum)
        ) {
            throw new Error("Historical reference response missing daily data.");
        }

        const result = {};

        for (let i = 0; i < data.daily.time.length; i++) {
            const date = data.daily.time[i];
            const rain = Number(data.daily.precipitation_sum[i]);

            result[date] = Number.isFinite(rain) ? rain : 0;
        }

        return result;
    }

    // ---------------------------------------------------------
    // Previous Runs
    // IMPORTANT:
    // precipitation_previous_day1..7 are HOURLY variables.
    // ---------------------------------------------------------

    async function fetchPreviousRuns(
        location,
        startDate,
        endDate,
        modelId
    ) {
        const previousVariables = [];

        for (let day = 1; day <= 7; day++) {
            previousVariables.push(
                "precipitation_previous_day" + day
            );
        }

        const params = new URLSearchParams({
            latitude: location.latitude,
            longitude: location.longitude,
            start_date: startDate,
            end_date: endDate,
            hourly: previousVariables.join(","),
            models: modelId,
            timezone: "auto",
            precipitation_unit: "mm"
        });

        const url =
            "https://previous-runs-api.open-meteo.com/v1/forecast?" +
            params.toString();

        log(modelId + " Previous Runs request:", url);

        const data = await fetchJSON(url);

        if (!data.hourly || !Array.isArray(data.hourly.time)) {
            throw new Error(
                "Previous Runs response missing hourly data."
            );
        }

        return data;
    }

    // ---------------------------------------------------------
    // Convert hourly previous-run precipitation to daily total
    // ---------------------------------------------------------

    function aggregateHourlyToDaily(hourly, variableName) {
        const result = {};

        if (!hourly || !Array.isArray(hourly.time)) {
            return result;
        }

        const values = hourly[variableName];

        if (!Array.isArray(values)) {
            return result;
        }

        for (let i = 0; i < hourly.time.length; i++) {
            const timestamp = hourly.time[i];

            if (!timestamp) {
                continue;
            }

            const date = String(timestamp).slice(0, 10);

            const value = Number(values[i]);

            if (!Number.isFinite(value)) {
                continue;
            }

            if (!result[date]) {
                result[date] = 0;
            }

            result[date] += value;
        }

        return result;
    }

    // ---------------------------------------------------------
    // Metrics
    // ---------------------------------------------------------

    function calculateMetrics(pairs) {
        if (!pairs.length) {
            return {
                samples: 0,
                mae: null,
                rmse: null,
                bias: null,
                rainAccuracy: null,
                brierScore: null,
                hits: 0,
                misses: 0,
                falseAlarms: 0,
                correctNoRain: 0
            };
        }

        let absoluteError = 0;
        let squaredError = 0;
        let signedError = 0;

        let hits = 0;
        let misses = 0;
        let falseAlarms = 0;
        let correctNoRain = 0;

        for (const pair of pairs) {
            const forecast = Number(pair.forecastRainMm);
            const actual = Number(pair.actualRainMm);

            const errorValue = forecast - actual;

            absoluteError += Math.abs(errorValue);
            squaredError += errorValue * errorValue;
            signedError += errorValue;

            const forecastRain = forecast >= 0.1;
            const actualRain = actual >= 0.1;

            if (forecastRain && actualRain) {
                hits++;
            } else if (!forecastRain && actualRain) {
                misses++;
            } else if (forecastRain && !actualRain) {
                falseAlarms++;
            } else {
                correctNoRain++;
            }
        }

        const samples = pairs.length;

        return {
            samples,
            mae: absoluteError / samples,
            rmse: Math.sqrt(squaredError / samples),
            bias: signedError / samples,
            rainAccuracy:
                (hits + correctNoRain) / samples,
            brierScore: null,
            hits,
            misses,
            falseAlarms,
            correctNoRain
        };
    }

    // ---------------------------------------------------------
    // Run one model
    // ---------------------------------------------------------

    async function testModel(
        location,
        startDate,
        endDate,
        reference
    ) {
        const modelResults = [];

        for (const model of MODELS) {
            log("Testing model:", model.name);

            try {
                const previousRuns = await fetchPreviousRuns(
                    location,
                    startDate,
                    endDate,
                    model.modelId
                );

                const dailyForecasts = {};

                for (let day = 1; day <= 7; day++) {
                    const variable =
                        "precipitation_previous_day" + day;

                    dailyForecasts[day] =
                        aggregateHourlyToDaily(
                            previousRuns.hourly,
                            variable
                        );
                }

                const leadMetrics = [];

                for (let lead = 1; lead <= 7; lead++) {
                    const pairs = [];

                    const forecastByDate =
                        dailyForecasts[lead];

                    for (const date of Object.keys(reference)) {
                        if (
                            !forecastByDate ||
                            !Object.prototype.hasOwnProperty.call(
                                forecastByDate,
                                date
                            )
                        ) {
                            continue;
                        }

                        const actualRain = Number(
                            reference[date]
                        );

                        const forecastRain = Number(
                            forecastByDate[date]
                        );

                        if (
                            !Number.isFinite(actualRain) ||
                            !Number.isFinite(forecastRain)
                        ) {
                            continue;
                        }

                        pairs.push({
                            date,
                            forecastRainMm: forecastRain,
                            actualRainMm: actualRain
                        });
                    }

                    const metrics =
                        calculateMetrics(pairs);

                    leadMetrics.push({
                        leadDay: lead,
                        ...metrics
                    });

                    log(
                        model.name +
                            " Day " +
                            lead +
                            ": " +
                            pairs.length +
                            " samples"
                    );
                }

                modelResults.push({
                    name: model.name,
                    modelId: model.modelId,
                    success: true,
                    leadMetrics
                });

            } catch (e) {
                error(
                    model.name +
                        " Previous Runs failed:",
                    e
                );

                modelResults.push({
                    name: model.name,
                    modelId: model.modelId,
                    success: false,
                    error: String(e),
                    leadMetrics: []
                });
            }
        }

        return modelResults;
    }

    // ---------------------------------------------------------
    // Render
    // ---------------------------------------------------------

    function render(result) {
        const container =
            document.getElementById(
                "historicalAccuracyResults"
            );

        if (!container) {
            return;
        }

        if (!result) {
            container.innerHTML =
                "<p>No historical accuracy result available.</p>";
            return;
        }

        let html = "";

        html +=
            '<div style="margin-bottom:16px;">' +
            "<strong>Location:</strong> " +
            escapeHTML(result.location.name) +
            "<br>" +
            "<strong>Period:</strong> " +
            result.startDate +
            " → " +
            result.endDate +
            "<br>" +
            "<strong>Reference:</strong> ERA5 / Open-Meteo reanalysis" +
            "<br>" +
            "<strong>Test Days:</strong> " +
            result.testDays +
            "</div>";

        for (const model of result.models) {
            html +=
                '<div class="historical-model-card" ' +
                'style="margin-bottom:20px;padding:16px;border-radius:12px;background:#fff;">';

            html +=
                "<h3>" +
                escapeHTML(model.name) +
                "</h3>";

            if (!model.success) {
                html +=
                    '<p style="color:#b00020;">' +
                    "Failed: " +
                    escapeHTML(model.error || "Unknown error") +
                    "</p></div>";

                continue;
            }

            html +=
                '<div style="overflow-x:auto;">' +
                '<table style="width:100%;border-collapse:collapse;">' +
                "<thead>" +
                "<tr>" +
                "<th>Lead</th>" +
                "<th>Samples</th>" +
                "<th>MAE</th>" +
                "<th>RMSE</th>" +
                "<th>Bias</th>" +
                "<th>Rain Accuracy</th>" +
                "</tr>" +
                "</thead><tbody>";

            for (const metric of model.leadMetrics) {
                html +=
                    "<tr>" +
                    "<td>Day " +
                    metric.leadDay +
                    "</td>" +
                    "<td>" +
                    metric.samples +
                    "</td>" +
                    "<td>" +
                    formatMetric(metric.mae) +
                    "</td>" +
                    "<td>" +
                    formatMetric(metric.rmse) +
                    "</td>" +
                    "<td>" +
                    formatMetric(metric.bias) +
                    "</td>" +
                    "<td>" +
                    formatPercent(metric.rainAccuracy) +
                    "</td>" +
                    "</tr>";
            }

            html += "</tbody></table></div></div>";
        }

        container.innerHTML = html;
    }

    function escapeHTML(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function formatMetric(value) {
        if (!Number.isFinite(Number(value))) {
            return "—";
        }

        return Number(value).toFixed(2);
    }

    function formatPercent(value) {
        if (!Number.isFinite(Number(value))) {
            return "—";
        }

        return (
            Number(value) * 100
        ).toFixed(1) + "%";
    }

    // ---------------------------------------------------------
    // MAIN
    // ---------------------------------------------------------

    async function run() {
        const location = getSelectedLocation();

        if (!location) {
            throw new Error(
                "Please select a location first."
            );
        }

        const range = getDateRange();

        log("================================================");
        log("HISTORICAL ACCURACY V7 START");
        log("Location:", location);
        log("Period:", range.startDate, "→", range.endDate);
        log("================================================");

        const reference =
            await fetchHistoricalReference(
                location,
                range.startDate,
                range.endDate
            );

        log(
            "Historical reference days:",
            Object.keys(reference).length
        );

        const models =
            await testModel(
                location,
                range.startDate,
                range.endDate,
                reference
            );

        const result = {
            version: "historical-accuracy-v7",
            generatedAt: new Date().toISOString(),
            location,
            startDate: range.startDate,
            endDate: range.endDate,
            testDays: TEST_DAYS,
            historicalDelayDays:
                HISTORICAL_DELAY_DAYS,
            reference: {
                name: "ERA5 / Open-Meteo reanalysis",
                type: "reanalysis"
            },
            models
        };

        latestResult = result;

        try {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(result)
            );

            // Keep a compatibility copy for existing UI
            localStorage.setItem(
                "rrp_historical_model_accuracy_v5",
                JSON.stringify(result)
            );
        } catch (e) {
            error(
                "Could not save historical result:",
                e
            );
        }

        render(result);

        log("================================================");
        log("HISTORICAL ACCURACY V7 COMPLETE");
        log(result);
        log("================================================");

        return result;
    }

    function getResults() {
        if (latestResult) {
            return latestResult;
        }

        try {
            const saved =
                localStorage.getItem(
                    STORAGE_KEY
                );

            if (saved) {
                latestResult =
                    JSON.parse(saved);

                return latestResult;
            }
        } catch (e) {
            error(
                "Could not load saved result:",
                e
            );
        }

        return null;
    }

    function clear() {
        localStorage.removeItem(
            STORAGE_KEY
        );

        localStorage.removeItem(
            "rrp_historical_model_accuracy_v5"
        );

        latestResult = null;

        render(null);

        log("Historical accuracy results cleared.");
    }

    window.RRP_HISTORICAL_ACCURACY = {
        run,
        getResults,
        clear
    };

    log("Historical Model Accuracy V7 loaded.");
})();
