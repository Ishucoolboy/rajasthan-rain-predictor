/* =========================================================
   Rajasthan Rain Predictor
   Model-wise Actual Forecast Verification Engine
   ---------------------------------------------------------
   Purpose:
   - Match saved forecast snapshots with actual rainfall
   - Calculate ECMWF / GFS / ICON separately
   - Calculate MAE / RMSE / Bias
   - Calculate Rain / No-Rain accuracy
   - Calculate Brier Score for rain probability
   - Never invent accuracy
   ========================================================= */

(function () {
  "use strict";

  const OBSERVATION_KEY =
    "rrp_actual_observations_v1";

  const SNAPSHOT_KEY =
    "rrp_forecast_snapshots_v1";

  const RESULT_KEY =
    "rrp_verified_accuracy_v2";

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
        "Verification storage error:",
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
        "Verification save error:",
        error
      );

    }
  }


  function escapeHTML(value) {

    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  }


  /* =======================================================
     LOCATION MATCH
     ======================================================= */

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
     FIND OBSERVATION
     ======================================================= */

  function findObservation(
    forecast,
    observations
  ) {

    const forecastDate =
      forecast.validDate ||
      forecast.date;


    if (!forecastDate) {
      return null;
    }


    /*
      First:
      exact date + coordinates
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
      Fallback:
      date + location name
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
     GET MODEL NAME
     ======================================================= */

  function getModelName(
    forecast
  ) {

    if (
      forecast.model
    ) {

      return String(
        forecast.model
      ).toUpperCase();

    }


    if (
      forecast.modelId
    ) {

      const id =
        String(
          forecast.modelId
        ).toLowerCase();


      if (
        id.includes("ecmwf")
      ) {
        return "ECMWF";
      }


      if (
        id.includes("gfs")
      ) {
        return "GFS";
      }


      if (
        id.includes("icon")
      ) {
        return "ICON";
      }

    }


    return "UNKNOWN";

  }


  /* =======================================================
     FORECAST RAIN
     ======================================================= */

  function getForecastRain(
    forecast
  ) {

    const candidates = [

      forecast.forecastRainMm,

      forecast.forecastRainOnlyMm,

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
     FORECAST PROBABILITY
     ======================================================= */

  function getProbability(
    forecast
  ) {

    const candidates = [

      forecast.rainProbability,

      forecast.precipitationProbability,

      forecast.probability

    ];


    for (
      const value of candidates
    ) {

      const n =
        number(value);

      if (n !== null) {

        return Math.min(
          100,
          Math.max(
            0,
            n
          )
        );

      }

    }


    return null;

  }


  /* =======================================================
     CREATE EMPTY MODEL METRICS
     ======================================================= */

  function emptyMetrics() {

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


  /* =======================================================
     CALCULATE MODEL METRICS
     ======================================================= */

  function calculateMetrics(
    records
  ) {

    if (
      !records.length
    ) {

      return emptyMetrics();

    }


    const absoluteErrors = [];

    const squaredErrors = [];

    const signedErrors = [];

    const brierErrors = [];


    let hits = 0;

    let misses = 0;

    let falseAlarms = 0;

    let correctNoRain = 0;


    records.forEach(
      function (item) {

        const predicted =
          number(
            item.predictedRainMm
          );

        const actual =
          number(
            item.actualRainMm
          );


        if (
          predicted !== null &&
          actual !== null
        ) {

          const error =
            predicted - actual;


          absoluteErrors.push(
            Math.abs(error)
          );


          squaredErrors.push(
            error * error
          );


          signedErrors.push(
            error
          );


          const predictedRain =
            predicted >=
            RAIN_THRESHOLD;


          const actualRain =
            actual >=
            RAIN_THRESHOLD;


          if (
            predictedRain &&
            actualRain
          ) {

            hits++;

          } else if (
            !predictedRain &&
            actualRain
          ) {

            misses++;

          } else if (
            predictedRain &&
            !actualRain
          ) {

            falseAlarms++;

          } else {

            correctNoRain++;

          }

        }


        /*
          Brier Score

          Probability:
          0 to 1

          Observation:
          1 = rain
          0 = no rain
        */

        const probability =
          number(
            item.rainProbability
          );


        if (
          probability !== null &&
          actual !== null
        ) {

          const p =
            probability / 100;

          const observation =
            actual >=
            RAIN_THRESHOLD
              ? 1
              : 0;


          const brier =
            Math.pow(
              p - observation,
              2
            );


          brierErrors.push(
            brier
          );

        }

      }
    );


    const samples =
      records.length;


    const mae =
      absoluteErrors.length
        ? absoluteErrors.reduce(
            (sum, value) =>
              sum + value,
            0
          ) /
          absoluteErrors.length
        : null;


    const rmse =
      squaredErrors.length
        ? Math.sqrt(
            squaredErrors.reduce(
              (sum, value) =>
                sum + value,
              0
            ) /
            squaredErrors.length
          )
        : null;


    const bias =
      signedErrors.length
        ? signedErrors.reduce(
            (sum, value) =>
              sum + value,
            0
          ) /
          signedErrors.length
        : null;


    const classificationSamples =
      hits +
      misses +
      falseAlarms +
      correctNoRain;


    const rainAccuracy =
      classificationSamples
        ? (
            (
              hits +
              correctNoRain
            ) /
            classificationSamples
          ) *
          100
        : null;


    const brierScore =
      brierErrors.length
        ? brierErrors.reduce(
            (sum, value) =>
              sum + value,
            0
          ) /
          brierErrors.length
        : null;


    return {

      samples,

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

      brierScore:
        round(
          brierScore,
          4
        ),

      hits,

      misses,

      falseAlarms,

      correctNoRain

    };

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


    const modelRecords = {};


    const allMatched = [];


    /*
      Process every saved forecast.
    */

    snapshots.forEach(
      function (forecast) {

        const observation =
          findObservation(
            forecast,
            observations
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


        const model =
          getModelName(
            forecast
          );


        const probability =
          getProbability(
            forecast
          );


        const error =
          predicted -
          actual;


        const record = {

          forecastId:
            forecast.id ||
            null,

          forecastCreatedAt:
            forecast.forecastCreatedAt ||
            null,

          validDate:
            forecast.validDate ||
            null,

          model,

          modelId:
            forecast.modelId ||
            null,

          locationName:
            forecast.locationName ||
            observation.locationName ||
            null,

          latitude:
            number(
              forecast.latitude
            ),

          longitude:
            number(
              forecast.longitude
            ),

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

          rainProbability:
            probability !== null
              ? round(
                  probability,
                  1
                )
              : null,

          errorMm:
            round(
              error,
              2
            ),

          absoluteErrorMm:
            round(
              Math.abs(error),
              2
            ),

          source:
            observation.source ||
            "Unknown",

          verifiedAt:
            new Date()
              .toISOString()

        };


        allMatched.push(
          record
        );


        if (
          !modelRecords[model]
        ) {

          modelRecords[model] =
            [];

        }


        modelRecords[model].push(
          record
        );

      }
    );


    const models = {};


    Object.keys(
      modelRecords
    ).forEach(
      function (model) {

        models[model] =
          calculateMetrics(
            modelRecords[model]
          );

      }
    );


    /*
      Overall metrics
    */

    const overall =
      calculateMetrics(
        allMatched
      );


    const result = {

      calculatedAt:
        new Date()
          .toISOString(),

      totalSnapshots:
        snapshots.length,

      totalObservations:
        observations.length,

      matchedRecords:
        allMatched.length,

      models,

      overall,

      matched:
        allMatched

    };


    saveJSON(
      RESULT_KEY,
      result
    );


    return result;

  }


  /* =======================================================
     GET CONTAINER
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


  /* =======================================================
     MODEL CARD
     ======================================================= */

  function modelCard(
    name,
    metrics
  ) {

    return `

      <div style="
        padding:18px;
        border-radius:16px;
        background:rgba(255,255,255,.06);
        border:1px solid rgba(255,255,255,.12);
      ">

        <h4 style="
          margin:0 0 12px;
          font-size:18px;
        ">
          ${escapeHTML(name)}
        </h4>


        <div style="
          display:grid;
          grid-template-columns:
          repeat(2,minmax(0,1fr));
          gap:10px;
        ">


          <div style="
            padding:11px;
            border-radius:10px;
            background:rgba(0,0,0,.18);
          ">

            <div style="
              font-size:11px;
              opacity:.65;
            ">
              Samples
            </div>

            <strong>
              ${metrics.samples}
            </strong>

          </div>


          <div style="
            padding:11px;
            border-radius:10px;
            background:rgba(0,0,0,.18);
          ">

            <div style="
              font-size:11px;
              opacity:.65;
            ">
              Rain Accuracy
            </div>

            <strong>
              ${
                metrics.rainAccuracy === null
                  ? "—"
                  : metrics.rainAccuracy + "%"
              }
            </strong>

          </div>


          <div style="
            padding:11px;
            border-radius:10px;
            background:rgba(0,0,0,.18);
          ">

            <div style="
              font-size:11px;
              opacity:.65;
            ">
              MAE
            </div>

            <strong>
              ${
                metrics.mae === null
                  ? "—"
                  : metrics.mae + " mm"
              }
            </strong>

          </div>


          <div style="
            padding:11px;
            border-radius:10px;
            background:rgba(0,0,0,.18);
          ">

            <div style="
              font-size:11px;
              opacity:.65;
            ">
              RMSE
            </div>

            <strong>
              ${
                metrics.rmse === null
                  ? "—"
                  : metrics.rmse + " mm"
              }
            </strong>

          </div>


          <div style="
            padding:11px;
            border-radius:10px;
            background:rgba(0,0,0,.18);
          ">

            <div style="
              font-size:11px;
              opacity:.65;
            ">
              Bias
            </div>

            <strong>
              ${
                metrics.bias === null
                  ? "—"
                  : metrics.bias + " mm"
              }
            </strong>

          </div>


          <div style="
            padding:11px;
            border-radius:10px;
            background:rgba(0,0,0,.18);
          ">

            <div style="
              font-size:11px;
              opacity:.65;
            ">
              Brier Score
            </div>

            <strong>
              ${
                metrics.brierScore === null
                  ? "—"
                  : metrics.brierScore
              }
            </strong>

          </div>

        </div>


        <div style="
          margin-top:12px;
          font-size:12px;
          line-height:1.8;
          opacity:.8;
        ">

          🌧️ Hits:
          <strong>${metrics.hits}</strong>

          &nbsp; · &nbsp;

          ❌ Misses:
          <strong>${metrics.misses}</strong>

          &nbsp; · &nbsp;

          ⚠️ False:
          <strong>${metrics.falseAlarms}</strong>

          &nbsp; · &nbsp;

          ☀️ Correct:
          <strong>${metrics.correctNoRain}</strong>

        </div>

      </div>

    `;

  }


  /* =======================================================
     RENDER
     ======================================================= */

  function render() {

    const container =
      getContainer();


    if (!container) {
      return;
    }


    const result =
      calculate();


    const models =
      result.models || {};


    if (
      !result.matchedRecords
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
            🎯 Verified Model Accuracy
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

            Forecast snapshots already save ho rahe hain.

            Actual rainfall observation available
            hone ke baad ECMWF, GFS aur ICON ki
            measured accuracy yahan calculate hogi.

          </p>

        </div>

      `;

      return;

    }


    const modelNames =
      [
        "ECMWF",
        "GFS",
        "ICON"
      ];


    const availableModels =
      modelNames.filter(
        name =>
          models[name]
      );


    const cards =
      availableModels
        .map(
          name =>
            modelCard(
              name,
              models[name]
            )
        )
        .join("");


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
          🎯 Verified Model Accuracy
        </h3>


        <p style="
          margin:0 0 18px;
          font-size:12px;
          opacity:.7;
        ">

          ${result.matchedRecords}
          forecast/observation matches

        </p>


        <div style="
          display:grid;
          grid-template-columns:
          repeat(auto-fit,minmax(250px,1fr));
          gap:12px;
        ">

          ${cards}

        </div>


        <div style="
          margin-top:20px;
          padding:16px;
          border-radius:14px;
          background:rgba(255,255,255,.04);
        ">

          <h4 style="
            margin:0 0 12px;
          ">
            📊 Overall Verification
          </h4>


          <div style="
            display:grid;
            grid-template-columns:
            repeat(auto-fit,minmax(130px,1fr));
            gap:10px;
          ">


            <div>
              Samples:
              <strong>
                ${result.overall.samples}
              </strong>
            </div>


            <div>
              Accuracy:
              <strong>
                ${
                  result.overall.rainAccuracy === null
                    ? "—"
                    : result.overall.rainAccuracy + "%"
                }
              </strong>
            </div>


            <div>
              MAE:
              <strong>
                ${
                  result.overall.mae === null
                    ? "—"
                    : result.overall.mae + " mm"
                }
              </strong>
            </div>


            <div>
              RMSE:
              <strong>
                ${
                  result.overall.rmse === null
                    ? "—"
                    : result.overall.rmse + " mm"
                }
              </strong>
            </div>


            <div>
              Bias:
              <strong>
                ${
                  result.overall.bias === null
                    ? "—"
                    : result.overall.bias + " mm"
                }
              </strong>
            </div>

          </div>

        </div>


        <div style="
          margin-top:18px;
          overflow-x:auto;
        ">

          <h4 style="
            margin:0 0 10px;
          ">
            📋 Matched Records
          </h4>


          <table style="
            width:100%;
            border-collapse:collapse;
            font-size:12px;
          ">

            <thead>

              <tr>

                <th style="
                  padding:8px;
                  text-align:left;
                ">
                  Date
                </th>

                <th style="
                  padding:8px;
                  text-align:left;
                ">
                  Model
                </th>

                <th style="
                  padding:8px;
                  text-align:left;
                ">
                  Forecast
                </th>

                <th style="
                  padding:8px;
                  text-align:left;
                ">
                  Actual
                </th>

                <th style="
                  padding:8px;
                  text-align:left;
                ">
                  Probability
                </th>

                <th style="
                  padding:8px;
                  text-align:left;
                ">
                  Error
                </th>

              </tr>

            </thead>


            <tbody>

              ${
                result.matched
                  .slice(0, 50)
                  .map(
                    function (item) {

                      return `

                        <tr>

                          <td style="
                            padding:8px;
                            border-top:
                            1px solid
                            rgba(255,255,255,.08);
                          ">
                            ${escapeHTML(
                              item.validDate
                            )}
                          </td>


                          <td style="
                            padding:8px;
                            border-top:
                            1px solid
                            rgba(255,255,255,.08);
                          ">
                            ${escapeHTML(
                              item.model
                            )}
                          </td>


                          <td style="
                            padding:8px;
                            border-top:
                            1px solid
                            rgba(255,255,255,.08);
                          ">
                            ${item.predictedRainMm}
                            mm
                          </td>


                          <td style="
                            padding:8px;
                            border-top:
                            1px solid
                            rgba(255,255,255,.08);
                          ">
                            ${item.actualRainMm}
                            mm
                          </td>


                          <td style="
                            padding:8px;
                            border-top:
                            1px solid
                            rgba(255,255,255,.08);
                          ">
                            ${
                              item.rainProbability === null
                                ? "—"
                                : item.rainProbability + "%"
                            }
                          </td>


                          <td style="
                            padding:8px;
                            border-top:
                            1px solid
                            rgba(255,255,255,.08);
                          ">
                            ${item.errorMm}
                            mm
                          </td>

                        </tr>

                      `;

                    }
                  )
                  .join("")
              }

            </tbody>

          </table>

        </div>


        <div style="
          margin-top:18px;
          padding:13px;
          border-radius:10px;
          font-size:12px;
          line-height:1.7;
          opacity:.75;
        ">

          📌 Ye measured verification hai.

          <br>

          Accuracy tabhi calculate hogi jab
          forecast ke corresponding date/location
          ka actual rainfall observation available ho.

          <br>

          Website kisi fixed 95% accuracy ko
          assume nahi karti.

        </div>

      </div>

    `;


    /*
      Update main counters
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
        result.overall.rainAccuracy === null
          ? "—"
          : `${result.overall.rainAccuracy}%`;

    }


    if (dataPoints) {

      dataPoints.textContent =
        String(
          result.matchedRecords
        );

    }


    if (historicalRecords) {

      historicalRecords.textContent =
        String(
          result.matchedRecords
        );

    }

  }


  /* =======================================================
     PUBLIC API
     ======================================================= */

  window.RRP_VERIFICATION = {

    calculate,

    render,

    getResults:
      function () {

        try {

          const raw =
            localStorage.getItem(
              RESULT_KEY
            );

          return raw
            ? JSON.parse(raw)
            : null;

        } catch (error) {

          return null;

        }

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
