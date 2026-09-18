(function () {
  "use strict";

  /*
    Rajasthan Rain Predictor
    Automatic Forecast vs Actual Verification Engine V2

    Workflow:

    Forecast saved
          ↓
    Forecast date becomes past
          ↓
    Historical rainfall fetched
          ↓
    Forecast vs reference compared
          ↓
    ECMWF / GFS / ICON metrics updated

    Reference:
    ERA5 / Open-Meteo reanalysis

    NOTE:
    This is NOT independent IMD/rain-gauge accuracy.
  */

  const STORAGE_KEY =
    "rrp_automatic_verification_v2";

  const SNAPSHOT_KEY =
    "rrp_forecast_snapshots_v1";

  const RAIN_THRESHOLD_MM = 0.1;

  const MODEL_NAMES = [
    "ECMWF",
    "GFS",
    "ICON"
  ];

  let running = false;

  let lastRunTime = 0;

  const RUN_COOLDOWN_MS =
    60000;


  function log(...args) {
    console.log(
      "[RRP Automatic Verification V2]",
      ...args
    );
  }


  function getSnapshots() {

    try {

      const raw =
        localStorage.getItem(
          SNAPSHOT_KEY
        );

      if (!raw) {
        return [];
      }

      const data =
        JSON.parse(raw);

      return Array.isArray(data)
        ? data
        : [];

    } catch (error) {

      console.error(
        "Snapshot read error:",
        error
      );

      return [];

    }

  }


  function getRecords() {

    try {

      const raw =
        localStorage.getItem(
          STORAGE_KEY
        );

      if (!raw) {
        return [];
      }

      const data =
        JSON.parse(raw);

      return Array.isArray(data)
        ? data
        : [];

    } catch (error) {

      console.error(
        "Verification records read error:",
        error
      );

      return [];

    }

  }


  function saveRecords(records) {

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(records)
    );

  }


  function number(value) {

    const n =
      Number(value);

    return Number.isFinite(n)
      ? n
      : null;

  }


  function getModel(snapshot) {

    const model =
      String(
        snapshot.model ||
        snapshot.modelName ||
        ""
      ).toUpperCase();

    const modelId =
      String(
        snapshot.modelId ||
        ""
      ).toLowerCase();


    if (
      model.includes("ECMWF") ||
      modelId.includes("ecmwf")
    ) {
      return "ECMWF";
    }


    if (
      model.includes("GFS") ||
      modelId.includes("gfs")
    ) {
      return "GFS";
    }


    if (
      model.includes("ICON") ||
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


    for (
      const value of candidates
    ) {

      const n =
        number(value);

      if (n !== null) {
        return n;
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


    for (
      const value of candidates
    ) {

      const n =
        number(value);

      if (
        n !== null &&
        n >= 0 &&
        n <= 100
      ) {

        return n;

      }

    }


    return null;

  }


  function getLocationKey(snapshot) {

    const lat =
      number(
        snapshot.latitude
      );

    const lon =
      number(
        snapshot.longitude
      );


    const name =
      String(
        snapshot.locationName ||
        snapshot.location ||
        "Unknown"
      ).trim();


    if (
      lat !== null &&
      lon !== null
    ) {

      return (
        name +
        "|" +
        lat.toFixed(2) +
        "|" +
        lon.toFixed(2)
      );

    }


    return name;

  }


  function isPastDate(dateString) {

    if (!dateString) {
      return false;
    }


    const today =
      new Date()
        .toISOString()
        .slice(0, 10);


    return (
      dateString < today
    );

  }


  async function fetchReferenceRainfall(
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
      "Reference request:",
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
          number(
            data.daily
              .precipitation_sum[index]
          );


        if (
          rainfall !== null
        ) {

          result[date] =
            rainfall;

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
          Number(
            record.forecastRainMm
          );

        const actual =
          Number(
            record.actualRainMm
          );


        const error =
          forecast - actual;


        absoluteError +=
          Math.abs(error);


        squaredError +=
          error * error;


        biasTotal +=
          error;


        const forecastRain =
          forecast >=
          RAIN_THRESHOLD_MM;


        const actualRain =
          actual >=
          RAIN_THRESHOLD_MM;


        if (
          forecastRain ===
          actualRain
        ) {

          correctRain++;

        }


        const probability =
          number(
            record.forecastProbability
          );


        if (
          probability !== null
        ) {

          const p =
            probability / 100;

          const outcome =
            actualRain
              ? 1
              : 0;


          brierTotal +=
            Math.pow(
              p - outcome,
              2
            );


          brierSamples++;

        }

      }
    );


    return {

      samples:
        records.length,

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
        (
          correctRain /
          records.length
        ) * 100,

      brierScore:
        brierSamples
          ? brierTotal /
            brierSamples
          : null

    };

  }


  function getMetricsByModel(
    records
  ) {

    const result = {};


    MODEL_NAMES.forEach(
      (model) => {

        const modelRecords =
          records.filter(
            record =>
              record.model ===
              model
          );


        result[model] =
          calculateMetrics(
            modelRecords
          );

      }
    );


    return result;

  }


  function renderDashboard(
    records,
    pendingCount,
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


    const metrics =
      getMetricsByModel(
        records
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

        <div style="
          display:grid;
          grid-template-columns:
            repeat(auto-fit,minmax(140px,1fr));
          gap:10px;
          margin:16px 0;
        ">

          <div style="
            background:white;
            padding:14px;
            border-radius:10px;
          ">
            <strong>
              ${records.length}
            </strong>
            <br>
            <small>
              Verified Records
            </small>
          </div>


          <div style="
            background:white;
            padding:14px;
            border-radius:10px;
          ">
            <strong>
              ${pendingCount}
            </strong>
            <br>
            <small>
              Pending Forecasts
            </small>
          </div>

        </div>

    `;


    MODEL_NAMES.forEach(
      (model) => {

        const m =
          metrics[model];


        html += `

          <div style="
            margin-top:15px;
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
                repeat(auto-fit,minmax(100px,1fr));
              gap:10px;
            ">

              <div>
                <strong>
                  ${m.samples}
                </strong>
                <br>
                <small>
                  Samples
                </small>
              </div>


              <div>
                <strong>
                  ${
                    m.mae === null
                      ? "—"
                      : m.mae.toFixed(3) +
                        " mm"
                  }
                </strong>
                <br>
                <small>
                  MAE
                </small>
              </div>


              <div>
                <strong>
                  ${
                    m.rmse === null
                      ? "—"
                      : m.rmse.toFixed(3) +
                        " mm"
                  }
                </strong>
                <br>
                <small>
                  RMSE
                </small>
              </div>


              <div>
                <strong>
                  ${
                    m.bias === null
                      ? "—"
                      : m.bias.toFixed(3) +
                        " mm"
                  }
                </strong>
                <br>
                <small>
                  Bias
                </small>
              </div>


              <div>
                <strong>
                  ${
                    m.rainAccuracy === null
                      ? "—"
                      : m.rainAccuracy.toFixed(1) +
                        "%"
                  }
                </strong>
                <br>
                <small>
                  Rain Accuracy
                </small>
              </div>


              <div>
                <strong>
                  ${
                    m.brierScore === null
                      ? "—"
                      : m.brierScore.toFixed(4)
                  }
                </strong>
                <br>
                <small>
                  Brier Score
                </small>
              </div>

            </div>

          </div>

        `;

      }
    );


    html += `

        <div style="
          margin-top:15px;
          padding:14px;
          border-radius:12px;
          background:rgba(255,193,7,.10);
          font-size:12px;
          line-height:1.7;
        ">

          ⚠️ Reference:
          <strong>
            ERA5 / Open-Meteo reanalysis
          </strong>.

          Ye independent
          <strong>
            IMD/rain-gauge accuracy
          </strong>
          nahi hai.

        </div>

      </div>

    `;


    container.innerHTML =
      html;

  }


  async function run(
    force = false
  ) {

    const now =
      Date.now();


    if (running) {

      log(
        "Verification already running. Skipping."
      );

      return;

    }


    if (
      !force &&
      now - lastRunTime <
      RUN_COOLDOWN_MS
    ) {

      log(
        "Cooldown active. Skipping duplicate run."
      );

      return;

    }


    running = true;

    lastRunTime =
      now;


    log(
      "================================="
    );

    log(
      "AUTOMATIC VERIFICATION V2 START"
    );

    log(
      "================================="
    );


    try {

      const snapshots =
        getSnapshots();


      log(
        "Forecast snapshots:",
        snapshots.length
      );


      const pastSnapshots =
        snapshots.filter(
          snapshot =>
            snapshot.validDate &&
            isPastDate(
              snapshot.validDate
            )
        );


      log(
        "Past snapshots:",
        pastSnapshots.length
      );


      let records =
        getRecords();


      /*
        If there are no completed
        forecast dates yet, this is
        completely normal.
      */

      if (
        pastSnapshots.length === 0
      ) {

        renderDashboard(
          records,
          snapshots.length,
          "⏳ Abhi koi completed forecast date nahi hai. Forecast dates pass hone ke baad automatic verification start hoga."
        );


        log(
          "No past forecasts yet."
        );


        return {

          processed: 0,

          newRecords: 0,

          totalRecords:
            records.length,

          pending:
            snapshots.length

        };

      }


      const existingKeys =
        new Set(
          records.map(
            record =>
              record.verificationKey
          )
        );


      /*
        Group snapshots by location.
      */

      const groups = {};


      pastSnapshots.forEach(
        snapshot => {

          const lat =
            number(
              snapshot.latitude
            );

          const lon =
            number(
              snapshot.longitude
            );


          const model =
            getModel(
              snapshot
            );


          if (
            lat === null ||
            lon === null ||
            !model
          ) {

            return;

          }


          const key =
            `${lat.toFixed(4)}|${lon.toFixed(4)}`;


          if (!groups[key]) {

            groups[key] = {

              latitude: lat,

              longitude: lon,

              snapshots: [],

              dates: new Set()

            };

          }


          groups[key]
            .snapshots
            .push(
              snapshot
            );


          groups[key]
            .dates
            .add(
              snapshot.validDate
            );

        }
      );


      let newRecords = 0;


      for (
        const key of
        Object.keys(groups)
      ) {

        const group =
          groups[key];


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


        let actual;


        try {

          actual =
            await fetchReferenceRainfall(
              group.latitude,
              group.longitude,
              startDate,
              endDate
            );

        } catch (error) {

          console.error(
            "Reference rainfall failed:",
            error
          );

          continue;

        }


        group.snapshots.forEach(
          snapshot => {

            const model =
              getModel(
                snapshot
              );


            const forecast =
              getForecastRain(
                snapshot
              );


            const probability =
              getForecastProbability(
                snapshot
              );


            const actualRain =
              number(
                actual[
                  snapshot.validDate
                ]
              );


            if (
              !model ||
              forecast === null ||
              actualRain === null
            ) {

              return;

            }


            const verificationKey = [

              snapshot.validDate,

              getLocationKey(
                snapshot
              ),

              model,

              snapshot.modelId ||
              ""

            ].join("|");


            if (
              existingKeys.has(
                verificationKey
              )
            ) {

              return;

            }


            records.push({

              verificationKey,

              verifiedAt:
                new Date()
                  .toISOString(),

              validDate:
                snapshot.validDate,

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
                actualRain,

              forecastProbability:
                probability,

              forecastRain:
                forecast >=
                RAIN_THRESHOLD_MM,

              actualRain:
                actualRain >=
                RAIN_THRESHOLD_MM,

              reference:
                "ERA5 / Open-Meteo reanalysis",

              source:
                "automatic-verification-v2"

            });


            existingKeys.add(
              verificationKey
            );


            newRecords++;

          }
        );

      }


      records.sort(
        (a, b) =>
          String(
            b.validDate
          ).localeCompare(
            String(
              a.validDate
            )
          )
      );


      saveRecords(
        records
      );


      renderDashboard(
        records,
        snapshots.length -
          pastSnapshots.length,
        `✅ Verification complete. New records: ${newRecords}.`
      );


      log(
        "New records:",
        newRecords
      );


      log(
        "Total verified records:",
        records.length
      );


      log(
        "Pending forecasts:",
        snapshots.length -
          pastSnapshots.length
      );


      log(
        "================================="
      );

      log(
        "AUTOMATIC VERIFICATION V2 COMPLETE"
      );

      log(
        "================================="
      );


      return {

        processed:
          pastSnapshots.length,

        newRecords,

        totalRecords:
          records.length,

        pending:
          snapshots.length -
          pastSnapshots.length

      };

    } finally {

      running = false;

    }

  }


  function getAll() {

    return getRecords();

  }


  function getMetrics() {

    return getMetricsByModel(
      getRecords()
    );

  }


  function clear() {

    localStorage.removeItem(
      STORAGE_KEY
    );


    log(
      "Automatic verification data cleared."
    );

  }


  /*
    PUBLIC API
  */

  window.RRP_AUTOMATIC_VERIFICATION = {

    run,

    getAll,

    getMetrics,

    clear

  };


  /*
    INITIAL LOAD
  */

  document.addEventListener(
    "DOMContentLoaded",
    function () {

      setTimeout(
        function () {

          run()
            .catch(
              error => {

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
    WEATHER UPDATE

    Cooldown prevents multiple
    duplicate API calls.
  */

  window.addEventListener(
    "rrp:weather-updated",
    function () {

      setTimeout(
        function () {

          run()
            .catch(
              error => {

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
    "Automatic Verification Engine V2 loaded."
  );

})();
