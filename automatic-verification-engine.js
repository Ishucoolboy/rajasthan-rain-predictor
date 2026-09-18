(function () {
  "use strict";

  /*
    Rajasthan Rain Predictor
    Automatic Forecast vs Actual Verification Engine V1

    What this engine does:
    1. Reads saved forecast snapshots.
    2. Finds forecast dates that are already in the past.
    3. Fetches ERA5/reanalysis rainfall for those dates.
    4. Compares ECMWF / GFS / ICON separately.
    5. Calculates:
       - MAE
       - RMSE
       - Bias
       - Rain Accuracy
       - Brier Score
    6. Saves verified records locally.
    7. Builds an automatic verification dashboard.

    IMPORTANT:
    ERA5/reanalysis is used as an automatic reference proxy.
    It is NOT independent rain-gauge / IMD station accuracy.
  */

  const STORAGE_KEY = "rrp_automatic_verification_v1";
  const SNAPSHOT_KEY = "rrp_forecast_snapshots_v1";

  const MODEL_NAMES = ["ECMWF", "GFS", "ICON"];

  const RAIN_THRESHOLD_MM = 0.1;

  function log(...args) {
    console.log("[RRP Automatic Verification]", ...args);
  }

  function getSnapshots() {
    try {
      const raw = localStorage.getItem(SNAPSHOT_KEY);

      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);

      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error(
        "Could not read forecast snapshots:",
        error
      );

      return [];
    }
  }

  function getVerifiedRecords() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);

      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error(
        "Could not read automatic verification records:",
        error
      );

      return [];
    }
  }

  function saveVerifiedRecords(records) {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(records)
    );
  }

  function normalizeNumber(value) {
    const number = Number(value);

    return Number.isFinite(number)
      ? number
      : null;
  }

  function normalizeModel(snapshot) {
    const modelText = String(
      snapshot.model ||
      snapshot.modelName ||
      ""
    ).toUpperCase();

    const modelId = String(
      snapshot.modelId ||
      ""
    ).toLowerCase();

    if (
      modelText.includes("ECMWF") ||
      modelId.includes("ecmwf")
    ) {
      return "ECMWF";
    }

    if (
      modelText.includes("GFS") ||
      modelId.includes("gfs")
    ) {
      return "GFS";
    }

    if (
      modelText.includes("ICON") ||
      modelId.includes("icon")
    ) {
      return "ICON";
    }

    return null;
  }

  function getForecastRain(snapshot) {
    const candidates = [
      snapshot.forecastRainMm,
      snapshot.forecastRainOnlyMm,
      snapshot.rainfall,
      snapshot.rainAmount,
      snapshot.precipitation
    ];

    for (const value of candidates) {
      const number = normalizeNumber(value);

      if (number !== null) {
        return number;
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
      const number = normalizeNumber(value);

      if (
        number !== null &&
        number >= 0 &&
        number <= 100
      ) {
        return number;
      }
    }

    return null;
  }

  function getLocationKey(snapshot) {
    const name = String(
      snapshot.locationName ||
      snapshot.location ||
      "Unknown"
    ).trim();

    const lat = normalizeNumber(
      snapshot.latitude
    );

    const lon = normalizeNumber(
      snapshot.longitude
    );

    if (
      lat !== null &&
      lon !== null
    ) {
      return `${name}|${lat.toFixed(2)}|${lon.toFixed(2)}`;
    }

    return name;
  }

  function getSelectedLocation() {
    try {
      if (
        window.RRP_APP &&
        typeof window.RRP_APP.getCurrentLocation === "function"
      ) {
        const location =
          window.RRP_APP.getCurrentLocation();

        if (
          location &&
          Number.isFinite(
            Number(location.latitude)
          ) &&
          Number.isFinite(
            Number(location.longitude)
          )
        ) {
          return {
            name:
              location.name ||
              "Selected Location",

            latitude:
              Number(location.latitude),

            longitude:
              Number(location.longitude)
          };
        }
      }
    } catch (error) {
      console.error(
        "Selected location error:",
        error
      );
    }

    return null;
  }

  function formatDate(date) {
    return date
      .toISOString()
      .slice(0, 10);
  }

  function isPastDate(dateString) {
    const today = new Date();

    const todayString =
      formatDate(today);

    return dateString < todayString;
  }

  async function fetchActualRainfall(
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

    log(
      "Fetching reference rainfall:",
      startDate,
      "→",
      endDate
    );

    const response =
      await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Historical API HTTP ${response.status}`
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
      (date, index) => {
        const rainfall =
          Number(
            data.daily
              .precipitation_sum[index]
          );

        if (
          Number.isFinite(rainfall)
        ) {
          result[date] = rainfall;
        }
      }
    );

    return result;
  }

  function calculateMetrics(records) {
    if (!records.length) {
      return {
        samples: 0,
        mae: null,
        rmse: null,
        bias: null,
        rainAccuracy: null,
        brierScore: null
      };
    }

    let absoluteError = 0;
    let squaredError = 0;
    let biasTotal = 0;

    let correctRain = 0;

    let brierTotal = 0;
    let brierSamples = 0;

    records.forEach(
      (record) => {
        const forecast =
          Number(record.forecastRainMm);

        const actual =
          Number(record.actualRainMm);

        const error =
          forecast - actual;

        absoluteError +=
          Math.abs(error);

        squaredError +=
          error * error;

        biasTotal += error;

        const forecastRain =
          forecast >=
          RAIN_THRESHOLD_MM;

        const actualRain =
          actual >=
          RAIN_THRESHOLD_MM;

        if (
          forecastRain === actualRain
        ) {
          correctRain++;
        }

        if (
          record.forecastProbability !==
            null &&
          Number.isFinite(
            Number(
              record.forecastProbability
            )
          )
        ) {
          const probability =
            Number(
              record.forecastProbability
            ) / 100;

          const outcome =
            actualRain ? 1 : 0;

          const brier =
            Math.pow(
              probability - outcome,
              2
            );

          brierTotal += brier;

          brierSamples++;
        }
      }
    );

    return {
      samples: records.length,

      mae:
        absoluteError /
        records.length,

      rmse:
        Math.sqrt(
          squaredError /
          records.length
        ),

      bias:
        biasTotal /
        records.length,

      rainAccuracy:
        (correctRain /
          records.length) *
        100,

      brierScore:
        brierSamples
          ? brierTotal /
            brierSamples
          : null
    };
  }

  function createVerificationKey(
    snapshot,
    actualDate
  ) {
    const model =
      normalizeModel(snapshot);

    const locationKey =
      getLocationKey(snapshot);

    return [
      actualDate,
      locationKey,
      model,
      snapshot.modelId || ""
    ].join("|");
  }

  function groupByModel(records) {
    const groups = {};

    MODEL_NAMES.forEach(
      (model) => {
        groups[model] = [];
      }
    );

    records.forEach(
      (record) => {
        if (
          groups[record.model]
        ) {
          groups[record.model].push(
            record
          );
        }
      }
    );

    return groups;
  }

  function renderDashboard(
    allRecords,
    statusMessage
  ) {
    let container =
      document.getElementById(
        "automaticAccuracy"
      );

    if (!container) {
      container =
        document.createElement(
          "section"
        );

      container.id =
        "automaticAccuracy";

      container.style.margin =
        "24px 0";

      const accuracy =
        document.getElementById(
          "accuracy"
        );

      if (accuracy) {
        accuracy.parentNode.insertBefore(
          container,
          accuracy.nextSibling
        );
      } else {
        document.body.appendChild(
          container
        );
      }
    }

    const groups =
      groupByModel(
        allRecords
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
          ${statusMessage || ""}
        </p>

        <p style="
          font-size:13px;
          color:#555;
        ">
          Reference:
          ERA5 / Open-Meteo historical
          reanalysis.
          This is an automatic reference
          verification, not independent
          IMD/rain-gauge accuracy.
        </p>
    `;

    MODEL_NAMES.forEach(
      (model) => {
        const records =
          groups[model];

        const metrics =
          calculateMetrics(
            records
          );

        html += `
          <div style="
            margin-top:18px;
            padding:15px;
            background:white;
            border-radius:12px;
          ">

            <h3>
              🛰️ ${model}
            </h3>

            <div style="
              display:grid;
              grid-template-columns:
                repeat(auto-fit,minmax(120px,1fr));
              gap:10px;
            ">

              <div>
                <strong>
                  ${metrics.samples}
                </strong>
                <br>
                <small>Samples</small>
              </div>

              <div>
                <strong>
                  ${
                    metrics.mae === null
                      ? "-"
                      : metrics.mae.toFixed(3) +
                        " mm"
                  }
                </strong>
                <br>
                <small>MAE</small>
              </div>

              <div>
                <strong>
                  ${
                    metrics.rmse === null
                      ? "-"
                      : metrics.rmse.toFixed(3) +
                        " mm"
                  }
                </strong>
                <br>
                <small>RMSE</small>
              </div>

              <div>
                <strong>
                  ${
                    metrics.bias === null
                      ? "-"
                      : metrics.bias.toFixed(3) +
                        " mm"
                  }
                </strong>
                <br>
                <small>Bias</small>
              </div>

              <div>
                <strong>
                  ${
                    metrics.rainAccuracy === null
                      ? "-"
                      : metrics.rainAccuracy.toFixed(
                          1
                        ) + "%"
                  }
                </strong>
                <br>
                <small>Rain Accuracy</small>
              </div>

              <div>
                <strong>
                  ${
                    metrics.brierScore === null
                      ? "-"
                      : metrics.brierScore.toFixed(
                          4
                        )
                  }
                </strong>
                <br>
                <small>Brier Score</small>
              </div>

            </div>

          </div>
        `;
      }
    );

    html += `
        <p style="
          margin-top:18px;
          font-size:13px;
          color:#666;
        ">
          Lower MAE/RMSE/Brier generally means
          smaller errors or better probability
          calibration. These statistics are
          descriptive and should be interpreted
          with the reference-data limitation above.
        </p>

      </div>
    `;

    container.innerHTML =
      html;
  }

  async function run() {
    log(
      "================================="
    );

    log(
      "AUTOMATIC VERIFICATION START"
    );

    log(
      "================================="
    );

    const snapshots =
      getSnapshots();

    if (!snapshots.length) {
      renderDashboard(
        [],
        "No forecast snapshots found yet."
      );

      return {
        processed: 0,
        newRecords: 0,
        totalRecords: 0
      };
    }

    log(
      "Forecast snapshots:",
      snapshots.length
    );

    const pastSnapshots =
      snapshots.filter(
        (snapshot) => {
          const date =
            snapshot.validDate;

          return (
            date &&
            isPastDate(date)
          );
        }
      );

    log(
      "Past snapshots:",
      pastSnapshots.length
    );

    if (!pastSnapshots.length) {
      const existing =
        getVerifiedRecords();

      renderDashboard(
        existing,
        "No completed forecast dates are available for verification yet."
      );

      return {
        processed: 0,
        newRecords: 0,
        totalRecords:
          existing.length
      };
    }

    /*
      Group dates so that we make as few
      Historical API requests as possible.
    */

    const groups = {};

    pastSnapshots.forEach(
      (snapshot) => {
        const lat =
          normalizeNumber(
            snapshot.latitude
          );

        const lon =
          normalizeNumber(
            snapshot.longitude
          );

        const date =
          snapshot.validDate;

        const model =
          normalizeModel(
            snapshot
          );

        if (
          lat === null ||
          lon === null ||
          !date ||
          !model
        ) {
          return;
        }

        const locationKey =
          `${lat.toFixed(4)}|${lon.toFixed(4)}`;

        if (!groups[locationKey]) {
          groups[locationKey] = {
            latitude: lat,
            longitude: lon,
            dates: new Set(),
            snapshots: []
          };
        }

        groups[
          locationKey
        ].dates.add(date);

        groups[
          locationKey
        ].snapshots.push(
          snapshot
        );
      }
    );

    let verifiedRecords =
      getVerifiedRecords();

    const existingKeys =
      new Set(
        verifiedRecords.map(
          (record) =>
            record.verificationKey
        )
      );

    let newRecords = 0;

    for (
      const locationKey of
      Object.keys(groups)
    ) {
      const group =
        groups[locationKey];

      const dates =
        Array.from(
          group.dates
        ).sort();

      if (!dates.length) {
        continue;
      }

      const startDate =
        dates[0];

      const endDate =
        dates[dates.length - 1];

      log(
        "Checking location:",
        locationKey
      );

      log(
        "Date range:",
        startDate,
        "→",
        endDate
      );

      let actualRainfall;

      try {
        actualRainfall =
          await fetchActualRainfall(
            group.latitude,
            group.longitude,
            startDate,
            endDate
          );
      } catch (error) {
        console.error(
          "Could not fetch actual rainfall:",
          error
        );

        continue;
      }

      for (
        const snapshot of
        group.snapshots
      ) {
        const date =
          snapshot.validDate;

        const actual =
          normalizeNumber(
            actualRainfall[date]
          );

        const forecast =
          getForecastRain(
            snapshot
          );

        const probability =
          getForecastProbability(
            snapshot
          );

        const model =
          normalizeModel(
            snapshot
          );

        if (
          actual === null ||
          forecast === null ||
          !model
        ) {
          continue;
        }

        const verificationKey =
          createVerificationKey(
            snapshot,
            date
          );

        if (
          existingKeys.has(
            verificationKey
          )
        ) {
          continue;
        }

        const actualRain =
          actual >=
          RAIN_THRESHOLD_MM;

        const forecastRain =
          forecast >=
          RAIN_THRESHOLD_MM;

        const record = {
          verificationKey,

          verifiedAt:
            new Date().toISOString(),

          validDate:
            date,

          locationName:
            snapshot.locationName ||
            "Selected Location",

          latitude:
            group.latitude,

          longitude:
            group.longitude,

          model,

          modelId:
            snapshot.modelId ||
            null,

          forecastRainMm:
            forecast,

          actualRainMm:
            actual,

          forecastProbability:
            probability,

          forecastRain:
            forecastRain,

          actualRain:
            actualRain,

          reference:
            "ERA5 / Open-Meteo reanalysis",

          source:
            "automatic-verification-v1"
        };

        verifiedRecords.push(
          record
        );

        existingKeys.add(
          verificationKey
        );

        newRecords++;

        log(
          "Verified:",
          model,
          date,
          "Forecast:",
          forecast,
          "Actual:",
          actual
        );
      }
    }

    /*
      Keep newest records first.
    */

    verifiedRecords.sort(
      (a, b) => {
        return String(
          b.validDate
        ).localeCompare(
          String(a.validDate)
        );
      }
    );

    saveVerifiedRecords(
      verifiedRecords
    );

    const location =
      getSelectedLocation();

    const locationText =
      location
        ? location.name
        : "saved forecast locations";

    const message =
      `Verification complete for ${locationText}. ` +
      `New records: ${newRecords}. ` +
      `Total verified records: ${verifiedRecords.length}.`;

    renderDashboard(
      verifiedRecords,
      message
    );

    log(
      "================================="
    );

    log(
      "AUTOMATIC VERIFICATION COMPLETE"
    );

    log(
      "New records:",
      newRecords
    );

    log(
      "Total records:",
      verifiedRecords.length
    );

    log(
      "================================="
    );

    return {
      processed:
        pastSnapshots.length,

      newRecords,

      totalRecords:
        verifiedRecords.length
    };
  }

  function getAll() {
    return getVerifiedRecords();
  }

  function getMetrics() {
    const records =
      getVerifiedRecords();

    const groups =
      groupByModel(
        records
      );

    const metrics = {};

    MODEL_NAMES.forEach(
      (model) => {
        metrics[model] =
          calculateMetrics(
            groups[model]
          );
      }
    );

    return metrics;
  }

  function clear() {
    localStorage.removeItem(
      STORAGE_KEY
    );

    renderDashboard(
      [],
      "Automatic verification data cleared."
    );

    log(
      "Automatic verification data cleared."
    );
  }

  /*
    Public API
  */

  window.RRP_AUTOMATIC_VERIFICATION = {
    run,
    getAll,
    getMetrics,
    clear
  };

  /*
    Run automatically after the page
    has loaded.

    Small delay gives forecast snapshot
    engine time to initialise first.
  */

  document.addEventListener(
    "DOMContentLoaded",
    function () {
      setTimeout(
        function () {
          run().catch(
            (error) => {
              console.error(
                "Automatic verification failed:",
                error
              );
            }
          );
        },
        3500
      );
    }
  );

  /*
    Run again whenever weather data
    changes / location changes.
  */

  window.addEventListener(
    "rrp:weather-updated",
    function () {
      setTimeout(
        function () {
          run().catch(
            (error) => {
              console.error(
                "Automatic verification failed:",
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
    "Automatic Verification Engine V1 loaded."
  );
})();
