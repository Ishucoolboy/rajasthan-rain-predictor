/* =========================================================
   Rajasthan Rain Predictor
   Actual Forecast Verification Engine
   ---------------------------------------------------------
   Purpose:
   - Match saved forecast snapshots with actual rainfall
   - Calculate measured forecast performance
   - No invented accuracy
   - Uses only saved observations
   ========================================================= */

(function () {
  "use strict";

  const OBSERVATION_KEY =
    "rrp_actual_observations_v1";

  const SNAPSHOT_KEY =
    "rrp_forecast_snapshots_v1";

  const RESULT_KEY =
    "rrp_verified_accuracy_v1";

  const RAIN_THRESHOLD = 0.1;


  /* =======================================================
     HELPERS
     ======================================================= */

  function number(value, fallback = null) {
    const n = Number(value);

    return Number.isFinite(n)
      ? n
      : fallback;
  }


  function round(value, digits = 2) {
    if (!Number.isFinite(Number(value))) {
      return null;
    }

    const multiplier =
      Math.pow(10, digits);

    return (
      Math.round(
        Number(value) * multiplier
      ) / multiplier
    );
  }


  function loadJSON(key) {

    try {

      const raw =
        localStorage.getItem(key);

      if (!raw) {
        return [];
      }

      const data =
        JSON.parse(raw);

      return Array.isArray(data)
        ? data
        : [];

    } catch (error) {

      console.warn(
        "Accuracy storage error:",
        error
      );

      return [];
    }
  }


  function saveJSON(key, data) {

    try {

      localStorage.setItem(
        key,
        JSON.stringify(data)
      );

    } catch (error) {

      console.warn(
        "Accuracy save error:",
        error
      );
    }
  }


  function getDate(value) {

    if (!value) {
      return null;
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return null;
    }

    return date;
  }


  function sameLocation(
    forecast,
    observation
  ) {

    const fLat =
      number(
        forecast.latitude
      );

    const fLon =
      number(
        forecast.longitude
      );

    const oLat =
      number(
        observation.latitude
      );

    const oLon =
      number(
        observation.longitude
      );


    if (
      fLat === null ||
      fLon === null ||
      oLat === null ||
      oLon === null
    ) {

      return false;
    }


    /*
      Approximately 1 km tolerance.
    */

    return (
      Math.abs(
        fLat - oLat
      ) < 0.01 &&

      Math.abs(
        fLon - oLon
      ) < 0.01
    );
  }


  /* =======================================================
     FIND ACTUAL OBSERVATION
     ======================================================= */

  function findObservation(
    forecast
  ) {

    const observations =
      loadJSON(
        OBSERVATION_KEY
      );


    const forecastDate =
      forecast.validDate ||
      forecast.date;


    if (!forecastDate) {
      return null;
    }


    /*
      First try exact location + date.
    */

    let matches =
      observations.filter(
        function (item) {

          return (
            item.date ===
              forecastDate &&

            sameLocation(
              forecast,
              item
            )
          );

        }
      );


    /*
      If exact coordinates aren't available,
      use location name as fallback.
    */

    if (!matches.length) {

      matches =
        observations.filter(
          function (item) {

            return (
              item.date ===
                forecastDate &&

              item.locationName ===
                forecast.locationName
            );

          }
        );
    }


    if (!matches.length) {
      return null;
    }


    return matches[0];
  }


  /* =======================================================
     EXTRACT FORECAST RAIN
     ======================================================= */

  function getForecastRain(
    forecast
  ) {

    /*
      Supported possible field names from
      current / future forecast snapshots.
    */

    const candidates = [

      forecast.forecastRainMm,

      forecast.predictedRainMm,

      forecast.rainfall,

      forecast.precipitation,

      forecast.rain,

      forecast.rain_mm

    ];


    for (
      const value of candidates
    ) {

      const n =
        number(value);

      if (n !== null) {
        return Math.max(
          0,
          n
        );
      }

    }


    return null;
  }


  /* =======================================================
     CALCULATE VERIFICATION
     ======================================================= */

  function calculate() {

    const snapshots =
      loadJSON(
        SNAPSHOT_KEY
      );


    const observations =
      loadJSON(
        OBSERVATION_KEY
      );


    if (
      !snapshots.length ||
      !observations.length
    ) {

      return {
        matched: [],
        metrics: {
          samples: 0,
          mae: null,
          rmse: null,
          bias: null,
          rainAccuracy: null,
          hits: 0,
          misses: 0,
          falseAlarms: 0,
          correctNoRain: 0
        }
      };
    }


    const matched = [];


    snapshots.forEach(
      function (forecast) {

        const observation =
          findObservation(
            forecast
          );


        if (!observation) {
          return;
        }


        const predicted =
          getForecastRain(
            forecast
          );


        const actual =
          number(
            observation.rainfall_mm
          );


        if (
          predicted === null ||
          actual === null
        ) {

          return;
        }


        const error =
          predicted -
          actual;


        const absoluteError =
          Math.abs(
            error
          );


        const predictedRain =
          predicted >=
          RAIN_THRESHOLD;


        const actualRain =
          actual >=
          RAIN_THRESHOLD;


        matched.push({

          forecastId:
            forecast.id ||
            null,

          observationId:
            observation.id ||
            null,

          date:
            observation.date,

          locationName:
            observation.locationName,

          latitude:
            observation.latitude,

          longitude:
            observation.longitude,

          predictedRainMm:
            round(
              predicted,
              2
            ),

          actualRainMm:
            round(
              actual,
              2
            ),

          errorMm:
            round(
              error,
              2
            ),

          absoluteErrorMm:
            round(
              absoluteError,
              2
            ),

          predictedRain,

          actualRain,

          correct:
            predictedRain ===
            actualRain,

          source:
            observation.source ||
            "Unknown",

          verifiedAt:
            new Date()
              .toISOString()

        });

      }
    );


    /*
      Metrics
    */

    if (!matched.length) {

      return {

        matched: [],

        metrics: {
          samples: 0,
          mae: null,
          rmse: null,
          bias: null,
          rainAccuracy: null,
          hits: 0,
          misses: 0,
          falseAlarms: 0,
          correctNoRain: 0
        }

      };
    }


    const absoluteErrors =
      matched.map(
        item =>
          item.absoluteErrorMm
      );


    const signedErrors =
      matched.map(
        item =>
          item.errorMm
      );


    const squaredErrors =
      matched.map(
        item =>
          item.errorMm *
          item.errorMm
      );


    const mae =
      absoluteErrors.reduce(
        (sum, value) =>
          sum + value,
        0
      ) /
      matched.length;


    const bias =
      signedErrors.reduce(
        (sum, value) =>
          sum + value,
        0
      ) /
      matched.length;


    const rmse =
      Math.sqrt(
        squaredErrors.reduce(
          (sum, value) =>
            sum + value,
          0
        ) /
        matched.length
      );


    let hits = 0;
    let misses = 0;
    let falseAlarms = 0;
    let correctNoRain = 0;


    matched.forEach(
      function (item) {

        if (
          item.predictedRain &&
          item.actualRain
        ) {

          hits++;

        } else if (
          !item.predictedRain &&
          item.actualRain
        ) {

          misses++;

        } else if (
          item.predictedRain &&
          !item.actualRain
        ) {

          falseAlarms++;

        } else {

          correctNoRain++;

        }

      }
    );


    const rainAccuracy =
      (
        (
          hits +
          correctNoRain
        ) /
        matched.length
      ) *
      100;


    const result = {

      samples:
        matched.length,

      mae:
        round(
          mae,
          3
        ),

      rmse:
        round(
          rmse,
          3
        ),

      bias:
        round(
          bias,
          3
        ),

      rainAccuracy:
        round(
          rainAccuracy,
          1
        ),

      hits,

      misses,

      falseAlarms,

      correctNoRain,

      calculatedAt:
        new Date()
          .toISOString()

    };


    return {
      matched,
      metrics:
        result
    };
  }


  /* =======================================================
     RENDER
     ======================================================= */

  function getContainer() {

    let container =
      document.getElementById(
        "verifiedAccuracyDashboard"
      );


    if (container) {
      return container;
    }


    const accuracy =
      document.getElementById(
        "accuracy"
      );


    if (!accuracy) {
      return null;
    }


    container =
      document.createElement(
        "div"
      );


    container.id =
      "verifiedAccuracyDashboard";


    container.style.marginTop =
      "20px";


    accuracy.appendChild(
      container
    );


    return container;
  }


  function render() {

    const container =
      getContainer();


    if (!container) {
      return;
    }


    const result =
      calculate();


    const metrics =
      result.metrics;


    if (
      !metrics.samples
    ) {

      container.innerHTML = `

        <div style="
          padding:20px;
          border-radius:18px;
          background:rgba(255,255,255,.06);
          border:1px solid rgba(255,255,255,.12);
        ">

          <h3 style="
            margin:0 0 8px;
          ">
            🎯 Verified Forecast Accuracy
          </h3>

          <p style="
            margin:0;
            font-size:13px;
            line-height:1.7;
            opacity:.75;
          ">

            Abhi forecast aur actual rainfall
            ke matching records available nahi hain.

            <br><br>

            Pehle actual rainfall observations
            save karo. Matching forecast milne ke
            baad yahan measured accuracy calculate hogi.

          </p>

        </div>

      `;

      return;
    }


    container.innerHTML = `

      <div style="
        padding:20px;
        border-radius:18px;
        background:rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.12);
      ">

        <h3 style="
          margin:0 0 6px;
        ">
          🎯 Verified Forecast Accuracy
        </h3>


        <p style="
          margin:0 0 20px;
          font-size:12px;
          opacity:.7;
        ">

          ${metrics.samples}
          matched forecast/observation records

        </p>


        <div style="
          display:grid;
          grid-template-columns:
          repeat(auto-fit,minmax(150px,1fr));
          gap:12px;
        ">


          <div style="
            padding:15px;
            border-radius:12px;
            background:rgba(0,0,0,.18);
          ">

            <div style="
              font-size:12px;
              opacity:.7;
            ">
              Rain/No-Rain
            </div>

            <strong style="
              font-size:24px;
            ">
              ${metrics.rainAccuracy}%
            </strong>

          </div>


          <div style="
            padding:15px;
            border-radius:12px;
            background:rgba(0,0,0,.18);
          ">

            <div style="
              font-size:12px;
              opacity:.7;
            ">
              MAE
            </div>

            <strong style="
              font-size:24px;
            ">
              ${metrics.mae}
              mm
            </strong>

          </div>


          <div style="
            padding:15px;
            border-radius:12px;
            background:rgba(0,0,0,.18);
          ">

            <div style="
              font-size:12px;
              opacity:.7;
            ">
              RMSE
            </div>

            <strong style="
              font-size:24px;
            ">
              ${metrics.rmse}
              mm
            </strong>

          </div>


          <div style="
            padding:15px;
            border-radius:12px;
            background:rgba(0,0,0,.18);
          ">

            <div style="
              font-size:12px;
              opacity:.7;
            ">
              Bias
            </div>

            <strong style="
              font-size:24px;
            ">
              ${metrics.bias}
              mm
            </strong>

          </div>

        </div>


        <div style="
          margin-top:20px;
          display:grid;
          grid-template-columns:
          repeat(auto-fit,minmax(130px,1fr));
          gap:10px;
        ">


          <div style="
            padding:12px;
            border-radius:10px;
            background:rgba(255,255,255,.04);
          ">

            🌧️ Hits:
            <strong>
              ${metrics.hits}
            </strong>

          </div>


          <div style="
            padding:12px;
            border-radius:10px;
            background:rgba(255,255,255,.04);
          ">

            ❌ Misses:
            <strong>
              ${metrics.misses}
            </strong>

          </div>


          <div style="
            padding:12px;
            border-radius:10px;
            background:rgba(255,255,255,.04);
          ">

            ⚠️ False Alarms:
            <strong>
              ${metrics.falseAlarms}
            </strong>

          </div>


          <div style="
            padding:12px;
            border-radius:10px;
            background:rgba(255,255,255,.04);
          ">

            ☀️ Correct No Rain:
            <strong>
              ${metrics.correctNoRain}
            </strong>

          </div>

        </div>


        <div style="
          margin-top:20px;
          overflow-x:auto;
        ">

          <table style="
            width:100%;
            border-collapse:collapse;
            font-size:12px;
          ">

            <thead>

              <tr>

                <th style="
                  padding:9px;
                  text-align:left;
                ">
                  Date
                </th>

                <th style="
                  padding:9px;
                  text-align:left;
                ">
                  Forecast
                </th>

                <th style="
                  padding:9px;
                  text-align:left;
                ">
                  Actual
                </th>

                <th style="
                  padding:9px;
                  text-align:left;
                ">
                  Error
                </th>

                <th style="
                  padding:9px;
                  text-align:left;
                ">
                  Result
                </th>

              </tr>

            </thead>


            <tbody>

              ${result.matched
                .slice(0, 30)
                .map(
                  function (item) {

                    return `

                      <tr>

                        <td style="
                          padding:9px;
                          border-top:
                          1px solid
                          rgba(255,255,255,.08);
                        ">
                          ${escapeHTML(
                            item.date
                          )}
                        </td>


                        <td style="
                          padding:9px;
                          border-top:
                          1px solid
                          rgba(255,255,255,.08);
                        ">
                          ${item.predictedRainMm}
                          mm
                        </td>


                        <td style="
                          padding:9px;
                          border-top:
                          1px solid
                          rgba(255,255,255,.08);
                        ">
                          ${item.actualRainMm}
                          mm
                        </td>


                        <td style="
                          padding:9px;
                          border-top:
                          1px solid
                          rgba(255,255,255,.08);
                        ">
                          ${item.errorMm}
                          mm
                        </td>


                        <td style="
                          padding:9px;
                          border-top:
                          1px solid
                          rgba(255,255,255,.08);
                        ">
                          ${
                            item.correct
                              ? "✅ Correct"
                              : "❌ Incorrect"
                          }
                        </td>

                      </tr>

                    `;

                  }
                )
                .join("")}

            </tbody>

          </table>

        </div>


        <div style="
          margin-top:16px;
          padding:13px;
          border-radius:10px;
          font-size:12px;
          line-height:1.7;
          opacity:.75;
        ">

          📌 Accuracy yahan sirf un records se
          calculate hoti hai jahan forecast aur
          actual observation dono available hain.

          <br>

          Ye measured result hai; website
          automatically 95% ya koi fixed accuracy
          assume nahi karti.

        </div>

      </div>

    `;


    /*
      Update main accuracy counters if available.
    */

    const accuracyPercent =
      document.getElementById(
        "accuracyPercent"
      );

    const dataPoints =
      document.getElementById(
        "dataPoints"
      );

    const historicalRecords =
      document.getElementById(
        "historicalRecords"
      );


    if (accuracyPercent) {

      accuracyPercent.textContent =
        `${metrics.rainAccuracy}%`;

    }


    if (dataPoints) {

      dataPoints.textContent =
        String(
          metrics.samples
        );

    }


    if (historicalRecords) {

      historicalRecords.textContent =
        String(
          metrics.samples
        );

    }


    saveJSON(
      RESULT_KEY,
      {
        metrics,
        matched:
          result.matched
      }
    );
  }


  /* =======================================================
     PUBLIC API
     ======================================================= */

  window.RRP_VERIFICATION = {

    calculate,

    render,

    getResults:
      function () {

        return loadJSON(
          RESULT_KEY
        );

      },

    getObservations:
      function () {

        return loadJSON(
          OBSERVATION_KEY
        );

      },

    getForecastSnapshots:
      function () {

        return loadJSON(
          SNAPSHOT_KEY
        );

      }

  };


  /* =======================================================
     EVENTS
     ======================================================= */

  window.addEventListener(
    "rrp:observation-saved",
    function () {

      setTimeout(
        render,
        100
      );

    }
  );


  window.addEventListener(
    "rrp:weather-updated",
    function () {

      setTimeout(
        render,
        300
      );

    }
  );


  /* =======================================================
     INIT
     ======================================================= */

  function initialize() {

    render();

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
