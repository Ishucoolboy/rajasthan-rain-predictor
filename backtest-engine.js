/* =========================================================
   Rajasthan Rain Predictor
   Historical Backtest Engine
   ---------------------------------------------------------
   Purpose:
   - Compare historical ECMWF / GFS / ICON forecasts
   - Against ERA5 historical precipitation reference
   - Evaluate fixed forecast lead times
   - Store results locally
   - NEVER claim this as independent rain-gauge accuracy
   ========================================================= */

(function () {
  "use strict";

  const STORAGE_KEY = "rrp_backtest_results_v1";

  const MODELS = [
    {
      id: "ecmwf_ifs025",
      name: "ECMWF",
      short: "ECMWF"
    },
    {
      id: "gfs_seamless",
      name: "GFS",
      short: "GFS"
    },
    {
      id: "icon_seamless",
      name: "ICON",
      short: "ICON"
    }
  ];

  const LEADS = [1, 2, 3];

  let state = {
    running: false,
    latitude: null,
    longitude: null,
    locationName: "Selected Location",
    days: 14,
    leadDay: 1,
    results: []
  };

  /* ---------------------------------------------------------
     Helpers
     --------------------------------------------------------- */

  function number(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function round(value, digits = 2) {
    const p = Math.pow(10, digits);
    return Math.round(value * p) / p;
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDate(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");

    return `${y}-${m}-${d}`;
  }

  function getDateDaysAgo(days) {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - days);

    return formatDate(d);
  }

  function average(values) {
    const valid = values.filter(Number.isFinite);

    if (!valid.length) return null;

    return valid.reduce((sum, value) => sum + value, 0) / valid.length;
  }

  function rmse(errors) {
    const valid = errors.filter(Number.isFinite);

    if (!valid.length) return null;

    const meanSquare =
      valid.reduce((sum, value) => sum + value * value, 0) /
      valid.length;

    return Math.sqrt(meanSquare);
  }

  /* ---------------------------------------------------------
     Storage
     --------------------------------------------------------- */

  function loadSavedResults() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        state.results = [];
        return;
      }

      const parsed = JSON.parse(raw);

      state.results = Array.isArray(parsed)
        ? parsed
        : [];
    } catch (error) {
      console.warn("Backtest storage read failed:", error);
      state.results = [];
    }
  }

  function saveResults() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(state.results)
      );
    } catch (error) {
      console.warn("Backtest storage save failed:", error);
    }
  }

  /* ---------------------------------------------------------
     Location detection
     --------------------------------------------------------- */

  function getCurrentLocation() {
    let latitude = null;
    let longitude = null;
    let name = "Selected Location";

    /*
      Try common structures used by the main app.
    */

    const candidates = [];

    if (window.latestWeatherData) {
      candidates.push(window.latestWeatherData);
    }

    if (window.RRP_APP) {
      candidates.push(window.RRP_APP);
      candidates.push(window.RRP_APP.latestWeatherData);
      candidates.push(window.RRP_APP.currentWeather);
      candidates.push(window.RRP_APP.location);
    }

    if (window.RRP_PREDICTION_ENGINE) {
      try {
        const prediction =
          window.RRP_PREDICTION_ENGINE.getLatest();

        if (prediction) {
          candidates.push(prediction);
        }
      } catch (error) {
        // Ignore.
      }
    }

    for (const item of candidates) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const lat =
        item.latitude ??
        item.lat ??
        item.location?.latitude ??
        item.location?.lat;

      const lon =
        item.longitude ??
        item.lon ??
        item.lng ??
        item.location?.longitude ??
        item.location?.lon ??
        item.location?.lng;

      if (
        Number.isFinite(Number(lat)) &&
        Number.isFinite(Number(lon))
      ) {
        latitude = Number(lat);
        longitude = Number(lon);

        name =
          item.locationName ??
          item.name ??
          item.location?.name ??
          item.city ??
          name;

        break;
      }
    }

    /*
      Also try map center if Leaflet map is available.
    */

    if (
      latitude === null &&
      window.rainMap &&
      typeof window.rainMap.getCenter === "function"
    ) {
      try {
        const center = window.rainMap.getCenter();

        if (center) {
          latitude = Number(center.lat);
          longitude = Number(center.lng);
        }
      } catch (error) {
        // Ignore.
      }
    }

    if (
      latitude === null ||
      longitude === null ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return null;
    }

    return {
      latitude,
      longitude,
      name
    };
  }

  /* ---------------------------------------------------------
     API
     --------------------------------------------------------- */

  async function fetchJSON(url) {
    const response = await fetch(url, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(
        `API request failed: ${response.status}`
      );
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(
        data.reason || "API returned an error"
      );
    }

    return data;
  }

  /*
    Previous Runs API:
    precipitation_previous_day1 =
    forecast made approximately 1 day before valid time.

    precipitation_previous_day2 =
    forecast made approximately 2 days before valid time.

    precipitation_previous_day3 =
    forecast made approximately 3 days before valid time.
  */

  async function fetchModelBacktest(
    model,
    latitude,
    longitude,
    startDate,
    endDate,
    leadDay
  ) {
    const variable =
      `precipitation_previous_day${leadDay}`;

    const url =
      "https://previous-runs-api.open-meteo.com/v1/forecast" +
      `?latitude=${encodeURIComponent(latitude)}` +
      `&longitude=${encodeURIComponent(longitude)}` +
      `&start_date=${encodeURIComponent(startDate)}` +
      `&end_date=${encodeURIComponent(endDate)}` +
      `&hourly=${encodeURIComponent(variable)}` +
      `&models=${encodeURIComponent(model.id)}` +
      `&timezone=UTC` +
      `&precipitation_unit=mm`;

    return fetchJSON(url);
  }

  /*
    ERA5 reference precipitation.

    IMPORTANT:
    This is a reanalysis reference, NOT an independent
    local rain-gauge observation.
  */

  async function fetchReference(
    latitude,
    longitude,
    startDate,
    endDate
  ) {
    const url =
      "https://archive-api.open-meteo.com/v1/era5" +
      `?latitude=${encodeURIComponent(latitude)}` +
      `&longitude=${encodeURIComponent(longitude)}` +
      `&start_date=${encodeURIComponent(startDate)}` +
      `&end_date=${encodeURIComponent(endDate)}` +
      `&hourly=precipitation` +
      `&timezone=UTC` +
      `&precipitation_unit=mm`;

    return fetchJSON(url);
  }

  /* ---------------------------------------------------------
     Time-series conversion
     --------------------------------------------------------- */

  function toMap(times, values) {
    const map = new Map();

    if (!Array.isArray(times) || !Array.isArray(values)) {
      return map;
    }

    const count = Math.min(
      times.length,
      values.length
    );

    for (let i = 0; i < count; i++) {
      const time = times[i];
      const value = Number(values[i]);

      if (!time || !Number.isFinite(value)) {
        continue;
      }

      map.set(time, value);
    }

    return map;
  }

  /* ---------------------------------------------------------
     Metrics
     --------------------------------------------------------- */

  function calculateMetrics(
    forecastMap,
    referenceMap
  ) {
    const absoluteErrors = [];
    const signedErrors = [];
    const squaredErrors = [];

    let rainHits = 0;
    let rainCorrect = 0;

    let pairs = 0;

    /*
      Threshold used only for a simple rain/no-rain
      verification metric.

      0.1 mm/h is treated as measurable precipitation.
    */

    const RAIN_THRESHOLD = 0.1;

    for (const [time, forecastValue] of forecastMap.entries()) {
      if (!referenceMap.has(time)) {
        continue;
      }

      const referenceValue =
        number(referenceMap.get(time), 0);

      const forecast =
        Math.max(0, number(forecastValue, 0));

      const actual =
        Math.max(0, referenceValue);

      const error = forecast - actual;

      absoluteErrors.push(Math.abs(error));
      signedErrors.push(error);
      squaredErrors.push(error * error);

      const forecastRain =
        forecast >= RAIN_THRESHOLD;

      const actualRain =
        actual >= RAIN_THRESHOLD;

      if (forecastRain === actualRain) {
        rainCorrect++;
      }

      if (actualRain) {
        rainHits++;
      }

      pairs++;
    }

    if (!pairs) {
      return {
        pairs: 0,
        mae: null,
        rmse: null,
        bias: null,
        rainAccuracy: null,
        referenceRainHours: 0
      };
    }

    return {
      pairs,

      mae: round(
        average(absoluteErrors),
        3
      ),

      rmse: round(
        rmse(squaredErrors.map(x => Math.sqrt(x * x))),
        3
      ),

      bias: round(
        average(signedErrors),
        3
      ),

      rainAccuracy: round(
        (rainCorrect / pairs) * 100,
        1
      ),

      referenceRainHours: rainHits
    };
  }

  /* ---------------------------------------------------------
     UI
     --------------------------------------------------------- */

  function getContainer() {
    let container =
      document.getElementById(
        "historicalBacktest"
      );

    if (container) {
      return container;
    }

    const accuracySection =
      document.querySelector(
        ".accuracy-section"
      ) ||
      document.getElementById(
        "accuracy"
      );

    if (!accuracySection) {
      return null;
    }

    container =
      document.createElement("div");

    container.id =
      "historicalBacktest";

    container.style.marginTop =
      "24px";

    accuracySection.appendChild(
      container
    );

    return container;
  }

  function renderBaseUI() {
    const container = getContainer();

    if (!container) {
      return;
    }

    container.innerHTML = `
      <div style="
        background:rgba(255,255,255,0.06);
        border:1px solid rgba(255,255,255,0.12);
        border-radius:18px;
        padding:20px;
        margin-top:20px;
      ">

        <div style="
          font-size:22px;
          font-weight:700;
          margin-bottom:8px;
        ">
          📈 Historical Forecast Backtest
        </div>

        <div style="
          font-size:13px;
          line-height:1.6;
          opacity:.8;
          margin-bottom:18px;
        ">
          Historical ECMWF, GFS aur ICON forecasts ko
          ERA5 reanalysis reference ke against compare
          kiya jayega.
          <br>
          <strong>
            Note: Ye rain-gauge accuracy nahi hai.
          </strong>
        </div>

        <div style="
          display:grid;
          grid-template-columns:
            repeat(auto-fit,minmax(160px,1fr));
          gap:12px;
          margin-bottom:16px;
        ">

          <label style="display:block;">
            <span style="
              display:block;
              font-size:12px;
              margin-bottom:6px;
              opacity:.75;
            ">
              Test Period
            </span>

            <select
              id="backtestDays"
              style="
                width:100%;
                padding:10px;
                border-radius:10px;
                border:1px solid rgba(255,255,255,.18);
                background:rgba(0,0,0,.25);
                color:inherit;
              "
            >
              <option value="7">Last 7 Days</option>
              <option value="14" selected>
                Last 14 Days
              </option>
              <option value="21">Last 21 Days</option>
              <option value="30">Last 30 Days</option>
            </select>
          </label>

          <label style="display:block;">
            <span style="
              display:block;
              font-size:12px;
              margin-bottom:6px;
              opacity:.75;
            ">
              Forecast Lead
            </span>

            <select
              id="backtestLead"
              style="
                width:100%;
                padding:10px;
                border-radius:10px;
                border:1px solid rgba(255,255,255,.18);
                background:rgba(0,0,0,.25);
                color:inherit;
              "
            >
              <option value="1">
                1 Day Ahead
              </option>

              <option value="2">
                2 Days Ahead
              </option>

              <option value="3">
                3 Days Ahead
              </option>
            </select>
          </label>

        </div>

        <button
          id="runBacktestBtn"
          type="button"
          style="
            width:100%;
            padding:13px 16px;
            border:0;
            border-radius:12px;
            cursor:pointer;
            font-size:15px;
            font-weight:700;
          "
        >
          ▶ Run Historical Backtest
        </button>

        <div
          id="backtestStatus"
          style="
            margin-top:14px;
            font-size:13px;
            line-height:1.6;
            opacity:.85;
          "
        >
          Ready.
        </div>

        <div
          id="backtestResults"
          style="margin-top:18px;"
        ></div>

      </div>
    `;

    const daysSelect =
      document.getElementById(
        "backtestDays"
      );

    const leadSelect =
      document.getElementById(
        "backtestLead"
      );

    const button =
      document.getElementById(
        "runBacktestBtn"
      );

    if (daysSelect) {
      daysSelect.value =
        String(state.days);

      daysSelect.addEventListener(
        "change",
        function () {
          state.days =
            clamp(
              Number(this.value),
              7,
              30
            );
        }
      );
    }

    if (leadSelect) {
      leadSelect.value =
        String(state.leadDay);

      leadSelect.addEventListener(
        "change",
        function () {
          state.leadDay =
            clamp(
              Number(this.value),
              1,
              3
            );
        }
      );
    }

    if (button) {
      button.addEventListener(
        "click",
        runBacktest
      );
    }
  }

  function setStatus(message) {
    const element =
      document.getElementById(
        "backtestStatus"
      );

    if (element) {
      element.innerHTML = message;
    }
  }

  function renderResults(results) {
    const container =
      document.getElementById(
        "backtestResults"
      );

    if (!container) {
      return;
    }

    if (!results.length) {
      container.innerHTML = `
        <div style="
          padding:15px;
          border-radius:12px;
          background:rgba(255,255,255,.04);
        ">
          No verified backtest result available.
        </div>
      `;

      return;
    }

    container.innerHTML = `
      <div style="
        overflow-x:auto;
      ">
        <table style="
          width:100%;
          border-collapse:collapse;
          font-size:13px;
        ">
          <thead>
            <tr>
              <th style="padding:10px;text-align:left;">
                Model
              </th>

              <th style="padding:10px;text-align:left;">
                Lead
              </th>

              <th style="padding:10px;text-align:left;">
                MAE
              </th>

              <th style="padding:10px;text-align:left;">
                RMSE
              </th>

              <th style="padding:10px;text-align:left;">
                Bias
              </th>

              <th style="padding:10px;text-align:left;">
                Rain/No-Rain
              </th>

              <th style="padding:10px;text-align:left;">
                Samples
              </th>
            </tr>
          </thead>

          <tbody>
            ${results.map(function (item) {
              return `
                <tr>
                  <td style="
                    padding:10px;
                    border-top:1px solid rgba(255,255,255,.08);
                  ">
                    ${escapeHTML(item.model)}
                  </td>

                  <td style="
                    padding:10px;
                    border-top:1px solid rgba(255,255,255,.08);
                  ">
                    D+${item.leadDay}
                  </td>

                  <td style="
                    padding:10px;
                    border-top:1px solid rgba(255,255,255,.08);
                  ">
                    ${item.mae === null
                      ? "--"
                      : item.mae + " mm"}
                  </td>

                  <td style="
                    padding:10px;
                    border-top:1px solid rgba(255,255,255,.08);
                  ">
                    ${item.rmse === null
                      ? "--"
                      : item.rmse + " mm"}
                  </td>

                  <td style="
                    padding:10px;
                    border-top:1px solid rgba(255,255,255,.08);
                  ">
                    ${item.bias === null
                      ? "--"
                      : item.bias + " mm"}
                  </td>

                  <td style="
                    padding:10px;
                    border-top:1px solid rgba(255,255,255,.08);
                  ">
                    ${item.rainAccuracy === null
                      ? "--"
                      : item.rainAccuracy + "%"}
                  </td>

                  <td style="
                    padding:10px;
                    border-top:1px solid rgba(255,255,255,.08);
                  ">
                    ${item.pairs}
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>

      <div style="
        margin-top:14px;
        padding:12px;
        border-radius:10px;
        font-size:12px;
        line-height:1.6;
        opacity:.75;
      ">
        MAE/RMSE/Bias rainfall error ko mm mein show karte hain.
        Rain/No-Rain percentage sirf measurable rainfall
        threshold ke basis par calculated hai.
        Ye result ERA5 reanalysis reference ke against hai,
        independent local rain-gauge verification nahi.
      </div>
    `;
  }

  /* ---------------------------------------------------------
     Main Backtest
     --------------------------------------------------------- */

  async function runBacktest() {
    if (state.running) {
      return;
    }

    const location =
      getCurrentLocation();

    if (!location) {
      setStatus(`
        ❌ Current location nahi mil rahi.
        Pehle website par koi village/city search karo,
        phir backtest run karo.
      `);

      return;
    }

    state.latitude =
      location.latitude;

    state.longitude =
      location.longitude;

    state.locationName =
      location.name ||
      "Selected Location";

    const daysSelect =
      document.getElementById(
        "backtestDays"
      );

    const leadSelect =
      document.getElementById(
        "backtestLead"
      );

    if (daysSelect) {
      state.days =
        clamp(
          Number(daysSelect.value),
          7,
          30
        );
    }

    if (leadSelect) {
      state.leadDay =
        clamp(
          Number(leadSelect.value),
          1,
          3
        );
    }

    state.running = true;

    const button =
      document.getElementById(
        "runBacktestBtn"
      );

    if (button) {
      button.disabled = true;
      button.textContent =
        "⏳ Running Backtest...";
    }

    setStatus(`
      📍 ${escapeHTML(state.locationName)}
      <br>
      Historical data fetch ho raha hai...
      <br>
      ECMWF + GFS + ICON + ERA5
    `);

    try {
      const endDate =
        getDateDaysAgo(1);

      const startDate =
        getDateDaysAgo(
          state.days + 1
        );

      /*
        Reference data is fetched only once.
      */

      const reference =
        await fetchReference(
          state.latitude,
          state.longitude,
          startDate,
          endDate
        );

      if (
        !reference.hourly ||
        !Array.isArray(
          reference.hourly.time
        )
      ) {
        throw new Error(
          "ERA5 reference data unavailable."
        );
      }

      const referenceMap =
        toMap(
          reference.hourly.time,
          reference.hourly.precipitation
        );

      const results = [];

      for (const model of MODELS) {
        setStatus(`
          📍 ${escapeHTML(state.locationName)}
          <br>
          Processing <strong>${model.name}</strong>...
        `);

        try {
          const forecast =
            await fetchModelBacktest(
              model,
              state.latitude,
              state.longitude,
              startDate,
              endDate,
              state.leadDay
            );

          const variable =
            `precipitation_previous_day${state.leadDay}`;

          if (
            !forecast.hourly ||
            !Array.isArray(
              forecast.hourly.time
            ) ||
            !Array.isArray(
              forecast.hourly[variable]
            )
          ) {
            throw new Error(
              `${model.name} historical forecast unavailable`
            );
          }

          const forecastMap =
            toMap(
              forecast.hourly.time,
              forecast.hourly[variable]
            );

          const metrics =
            calculateMetrics(
              forecastMap,
              referenceMap
            );

          results.push({
            model: model.name,
            modelId: model.id,
            leadDay: state.leadDay,
            startDate,
            endDate,
            locationName:
              state.locationName,
            latitude:
              state.latitude,
            longitude:
              state.longitude,
            mae: metrics.mae,
            rmse: metrics.rmse,
            bias: metrics.bias,
            rainAccuracy:
              metrics.rainAccuracy,
            pairs:
              metrics.pairs,
            referenceRainHours:
              metrics.referenceRainHours,
            generatedAt:
              new Date().toISOString(),
            reference:
              "ERA5 reanalysis"
          });

        } catch (modelError) {
          console.warn(
            `${model.name} backtest failed:`,
            modelError
          );

          results.push({
            model: model.name,
            modelId: model.id,
            leadDay: state.leadDay,
            startDate,
            endDate,
            locationName:
              state.locationName,
            latitude:
              state.latitude,
            longitude:
              state.longitude,
            mae: null,
            rmse: null,
            bias: null,
            rainAccuracy: null,
            pairs: 0,
            referenceRainHours: 0,
            error:
              modelError.message,
            generatedAt:
              new Date().toISOString(),
            reference:
              "ERA5 reanalysis"
          });
        }
      }

      /*
        Keep last 100 runs.
      */

      state.results = [
        ...results,
        ...state.results
      ].slice(0, 100);

      saveResults();

      renderResults(results);

      const successful =
        results.filter(
          item => item.pairs > 0
        ).length;

      setStatus(`
        ✅ Backtest complete.
        <br>
        Location:
        <strong>
          ${escapeHTML(state.locationName)}
        </strong>
        <br>
        Period:
        ${startDate} → ${endDate}
        <br>
        Lead:
        D+${state.leadDay}
        <br>
        ${successful}/3 models successfully evaluated.
      `);

    } catch (error) {
      console.error(
        "Historical backtest failed:",
        error
      );

      setStatus(`
        ❌ Backtest failed:
        ${escapeHTML(error.message)}
        <br><br>
        Browser console mein exact API error check
        kiya ja sakta hai.
      `);

    } finally {
      state.running = false;

      const button =
        document.getElementById(
          "runBacktestBtn"
        );

      if (button) {
        button.disabled = false;
        button.textContent =
          "▶ Run Historical Backtest";
      }
    }
  }

  /* ---------------------------------------------------------
     Public API
     --------------------------------------------------------- */

  window.RRP_BACKTEST = {
    run: runBacktest,

    getResults: function () {
      return state.results.slice();
    },

    getLocation: function () {
      return {
        latitude:
          state.latitude,
        longitude:
          state.longitude,
        name:
          state.locationName
      };
    },

    clearResults: function () {
      state.results = [];
      saveResults();
      renderResults([]);
    }
  };

  /* ---------------------------------------------------------
     Initialize
     --------------------------------------------------------- */

  function initialize() {
    loadSavedResults();
    renderBaseUI();
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
