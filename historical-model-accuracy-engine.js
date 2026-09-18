(function () {
  "use strict";

  /*
    Rajasthan Rain Predictor
    Historical Model Accuracy Engine V5

    Purpose:
    - Test ECMWF / GFS / ICON historical forecast skill
    - 90-day historical evaluation
    - 1 to 7 day fixed lead times
    - Reference = ERA5 / reanalysis
    - No invented accuracy
  */

  const STORAGE_KEY = "rrp_historical_model_accuracy_v5";

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

  function log(...args) {
    console.log("[RRP Historical Accuracy V5]", ...args);
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
    } catch (error) {
      console.error("Location error:", error);
    }

    return null;
  }

  function formatDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function dateMinusDays(date, days) {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() - days);
    return d;
  }

  function calculateMetrics(records) {
    if (!records.length) {
      return {
        samples: 0,
        mae: null,
        rmse: null,
        bias: null,
        rainAccuracy: null
      };
    }

    let absoluteError = 0;
    let squaredError = 0;
    let biasTotal = 0;

    let correctRain = 0;

    records.forEach((record) => {
      const forecast = Number(record.forecast);
      const actual = Number(record.actual);

      const error = forecast - actual;

      absoluteError += Math.abs(error);
      squaredError += error * error;
      biasTotal += error;

      const forecastRain = forecast >= 0.1;
      const actualRain = actual >= 0.1;

      if (forecastRain === actualRain) {
        correctRain++;
      }
    });

    const samples = records.length;

    return {
      samples,
      mae: absoluteError / samples,
      rmse: Math.sqrt(squaredError / samples),
      bias: biasTotal / samples,
      rainAccuracy: (correctRain / samples) * 100
    };
  }

  function renderLoading(message) {
    const container = document.getElementById("accuracy");

    if (!container) return;

    container.innerHTML = `
      <div style="
        padding:20px;
        background:#f4f7fb;
        border-radius:14px;
        margin-top:20px;
      ">
        <h3>🧪 Historical Model Accuracy</h3>
        <p>${message}</p>
      </div>
    `;
  }

  function renderError(message) {
    const container = document.getElementById("accuracy");

    if (!container) return;

    container.innerHTML = `
      <div style="
        padding:20px;
        background:#fff1f1;
        border-radius:14px;
        margin-top:20px;
      ">
        <h3>❌ Historical Accuracy Error</h3>
        <p>${message}</p>
      </div>
    `;
  }

  function renderResults(result) {
    const container = document.getElementById("accuracy");

    if (!container) {
      console.warn("Accuracy container not found.");
      return;
    }

    let html = `
      <div style="
        padding:20px;
        background:#f4f7fb;
        border-radius:14px;
        margin-top:20px;
      ">

        <h3>🧪 Historical Model Accuracy</h3>

        <p>
          <strong>Historical 90-day fixed lead-time evaluation</strong>
        </p>

        <p>
          📍 <strong>Location:</strong>
          ${result.location.name}
        </p>

        <p>
          📅 <strong>Period:</strong>
          ${result.period.start}
          →
          ${result.period.end}
        </p>

        <p>
          📊 <strong>Reference:</strong>
          ERA5 / reanalysis
        </p>

        <p style="
          font-size:13px;
          color:#555;
        ">
          This is a historical model-skill test against ERA5/reanalysis.
          It is not independent rain-gauge or IMD station accuracy.
        </p>
    `;

    result.models.forEach((model) => {
      html += `
        <div style="
          margin-top:25px;
          padding:15px;
          background:white;
          border-radius:12px;
        ">

          <h3>🛰️ ${model.name}</h3>

          <div style="overflow-x:auto;">
            <table style="
              width:100%;
              border-collapse:collapse;
              font-size:14px;
            ">

              <thead>
                <tr>
                  <th style="padding:8px;text-align:left;">Lead</th>
                  <th style="padding:8px;text-align:left;">Samples</th>
                  <th style="padding:8px;text-align:left;">MAE</th>
                  <th style="padding:8px;text-align:left;">RMSE</th>
                  <th style="padding:8px;text-align:left;">Bias</th>
                  <th style="padding:8px;text-align:left;">Rain Accuracy</th>
                </tr>
              </thead>

              <tbody>
      `;

      model.leads.forEach((lead) => {
        html += `
          <tr>
            <td style="padding:8px;border-top:1px solid #eee;">
              Day ${lead.day}
            </td>

            <td style="padding:8px;border-top:1px solid #eee;">
              ${lead.metrics.samples}
            </td>

            <td style="padding:8px;border-top:1px solid #eee;">
              ${
                lead.metrics.mae === null
                  ? "-"
                  : lead.metrics.mae.toFixed(3) + " mm"
              }
            </td>

            <td style="padding:8px;border-top:1px solid #eee;">
              ${
                lead.metrics.rmse === null
                  ? "-"
                  : lead.metrics.rmse.toFixed(3) + " mm"
              }
            </td>

            <td style="padding:8px;border-top:1px solid #eee;">
              ${
                lead.metrics.bias === null
                  ? "-"
                  : lead.metrics.bias.toFixed(3) + " mm"
              }
            </td>

            <td style="padding:8px;border-top:1px solid #eee;">
              ${
                lead.metrics.rainAccuracy === null
                  ? "-"
                  : lead.metrics.rainAccuracy.toFixed(1) + "%"
              }
            </td>
          </tr>
        `;
      });

      html += `
              </tbody>
            </table>
          </div>

        </div>
      `;
    });

    html += `
        <p style="
          margin-top:20px;
          font-size:13px;
          color:#555;
        ">
          ⚠️ Larger samples make the statistics more informative, but
          reanalysis is still a proxy reference. Independent rain-gauge
          observations are required for true local rainfall accuracy.
        </p>

      </div>
    `;

    container.innerHTML = html;
  }

  async function fetchHistoricalReference(
    latitude,
    longitude,
    startDate,
    endDate
  ) {
    const url =
      "https://archive-api.open-meteo.com/v1/archive" +
      `?latitude=${encodeURIComponent(latitude)}` +
      `&longitude=${encodeURIComponent(longitude)}` +
      `&start_date=${startDate}` +
      `&end_date=${endDate}` +
      `&daily=precipitation_sum` +
      `&timezone=auto` +
      `&precipitation_unit=mm`;

    log("Historical reference request:", url);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Historical Weather API HTTP ${response.status}`
      );
    }

    const data = await response.json();

    if (
      !data.daily ||
      !Array.isArray(data.daily.time) ||
      !Array.isArray(data.daily.precipitation_sum)
    ) {
      throw new Error(
        "Historical Weather API returned incomplete daily data."
      );
    }

    const reference = {};

    data.daily.time.forEach((date, index) => {
      const value = Number(data.daily.precipitation_sum[index]);

      reference[date] = Number.isFinite(value) ? value : 0;
    });

    return reference;
  }

  async function fetchPreviousRuns(
    latitude,
    longitude,
    modelId,
    startDate,
    endDate
  ) {
    const variables = [
      "precipitation_previous_day1",
      "precipitation_previous_day2",
      "precipitation_previous_day3",
      "precipitation_previous_day4",
      "precipitation_previous_day5",
      "precipitation_previous_day6",
      "precipitation_previous_day7"
    ].join(",");

    const url =
      "https://previous-runs-api.open-meteo.com/v1/forecast" +
      `?latitude=${encodeURIComponent(latitude)}` +
      `&longitude=${encodeURIComponent(longitude)}` +
      `&start_date=${startDate}` +
      `&end_date=${endDate}` +
      `&daily=${variables}` +
      `&timezone=auto` +
      `&precipitation_unit=mm` +
      `&models=${encodeURIComponent(modelId)}`;

    log(`${modelId} Previous Runs request:`, url);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Previous Runs API HTTP ${response.status} for ${modelId}`
      );
    }

    const data = await response.json();

    if (!data.daily || !Array.isArray(data.daily.time)) {
      throw new Error(
        `Previous Runs API returned incomplete data for ${modelId}.`
      );
    }

    return data.daily;
  }

  function extractLeadValues(daily, day) {
    const key = `precipitation_previous_day${day}`;

    if (!Array.isArray(daily[key])) {
      return [];
    }

    return daily[key];
  }

  async function run() {
    log("=================================");
    log("HISTORICAL ACCURACY V5 START");
    log("=================================");

    const location = getSelectedLocation();

    if (!location) {
      renderError(
        "Please select a valid location first. Latitude/longitude not available."
      );

      throw new Error(
        "No valid selected location."
      );
    }

    log("Location:", location);

    const today = new Date();

    const endDateObj = dateMinusDays(
      today,
      HISTORICAL_DELAY_DAYS
    );

    const startDateObj = dateMinusDays(
      endDateObj,
      TEST_DAYS - 1
    );

    const startDate = formatDate(startDateObj);
    const endDate = formatDate(endDateObj);

    log("Historical period:", startDate, "→", endDate);

    renderLoading(
      `Running ${TEST_DAYS}-day historical model test for ${location.name}...`
    );

    try {
      const reference = await fetchHistoricalReference(
        location.latitude,
        location.longitude,
        startDate,
        endDate
      );

      const modelResults = [];

      for (const model of MODELS) {
        log("---------------------------------");
        log("Testing model:", model.name);
        log("---------------------------------");

        let daily;

        try {
          daily = await fetchPreviousRuns(
            location.latitude,
            location.longitude,
            model.modelId,
            startDate,
            endDate
          );
        } catch (error) {
          console.error(
            `${model.name} Previous Runs failed:`,
            error
          );

          modelResults.push({
            name: model.name,
            modelId: model.modelId,
            leads: []
          });

          continue;
        }

        const leads = [];

        for (let day = 1; day <= 7; day++) {
          const values = extractLeadValues(
            daily,
            day
          );

          const records = [];

          daily.time.forEach((date, index) => {
            const forecastValue = Number(values[index]);
            const actualValue = Number(reference[date]);

            if (
              Number.isFinite(forecastValue) &&
              Number.isFinite(actualValue)
            ) {
              records.push({
                date,
                forecast: forecastValue,
                actual: actualValue
              });
            }
          });

          const metrics = calculateMetrics(records);

          log(
            `${model.name} Day ${day}:`,
            metrics
          );

          leads.push({
            day,
            metrics
          });
        }

        modelResults.push({
          name: model.name,
          modelId: model.modelId,
          leads
        });
      }

      const result = {
        version: "historical-accuracy-v5",
        generatedAt: new Date().toISOString(),

        location: {
          name: location.name,
          latitude: location.latitude,
          longitude: location.longitude
        },

        period: {
          start: startDate,
          end: endDate,
          days: TEST_DAYS
        },

        reference: {
          type: "ERA5 / reanalysis",
          source: "Open-Meteo Historical Weather API"
        },

        models: modelResults
      };

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(result)
      );

      renderResults(result);

      log("=================================");
      log("HISTORICAL ACCURACY V5 COMPLETE");
      log("=================================");

      console.log(result);

      return result;
    } catch (error) {
      console.error(
        "Historical Accuracy V5 failed:",
        error
      );

      renderError(
        error.message ||
        "Historical accuracy test failed."
      );

      throw error;
    }
  }

  function getResults() {
    try {
      const raw = localStorage.getItem(
        STORAGE_KEY
      );

      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.error(
        "Could not read historical accuracy:",
        error
      );

      return null;
    }
  }

  function clear() {
    localStorage.removeItem(
      STORAGE_KEY
    );

    log("Historical V5 data cleared.");
  }

  window.RRP_HISTORICAL_ACCURACY = {
    run,
    getResults,
    clear
  };

  document.addEventListener(
    "DOMContentLoaded",
    function () {
      const existing = getResults();

      if (existing) {
        renderResults(existing);
      }
    }
  );

  log("Historical Model Accuracy Engine V5 loaded.");
})();
