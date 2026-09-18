/* =========================================================
   Rajasthan Rain Predictor
   Historical Model Accuracy Engine V2
   ---------------------------------------------------------
   Purpose:
   - Evaluate historical ECMWF / GFS / ICON forecasts
   - Compare fixed lead-time forecasts with ERA5 reference
   - Test Day 1 to Day 7
   - No invented accuracy
   ========================================================= */

(function () {
  "use strict";

  const RESULT_KEY =
    "rrp_historical_model_accuracy_v2";

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

  const LEAD_DAYS = [
    1, 2, 3, 4, 5, 6, 7
  ];

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


  function round(value, digits = 3) {
    const n = Number(value);

    if (!Number.isFinite(n)) {
      return null;
    }

    const multiplier =
      Math.pow(10, digits);

    return (
      Math.round(n * multiplier) /
      multiplier
    );
  }


  function saveJSON(key, value) {
    try {
      localStorage.setItem(
        key,
        JSON.stringify(value)
      );
    } catch (error) {
      console.warn(
        "Historical accuracy save error:",
        error
      );
    }
  }


  function loadJSON(key) {
    try {
      const raw =
        localStorage.getItem(key);

      if (!raw) {
        return null;
      }

      return JSON.parse(raw);

    } catch (error) {
      return null;
    }
  }


  function dateString(date) {
    return date
      .toISOString()
      .slice(0, 10);
  }


  function getLocation() {

    if (window.latestWeatherData) {

      const data =
        window.latestWeatherData;

      const latitude =
        number(
          data.latitude ??
          data.lat ??
          data.location?.latitude ??
          data.location?.lat
        );

      const longitude =
        number(
          data.longitude ??
          data.lon ??
          data.lng ??
          data.location?.longitude ??
          data.location?.lon ??
          data.location?.lng
        );

      const name =
        data.locationName ??
        data.name ??
        data.location?.name ??
        "Selected Location";

      if (
        latitude !== null &&
        longitude !== null
      ) {
        return {
          latitude,
          longitude,
          name
        };
      }
    }


    if (window.RRP_BACKTEST) {

      const location =
        window.RRP_BACKTEST.getLocation();

      if (location) {
        return location;
      }
    }


    return null;
  }


  /* =======================================================
     FETCH ERA5 HISTORICAL REFERENCE
     ======================================================= */

  async function fetchHistoricalActual(
    latitude,
    longitude,
    startDate,
    endDate
  ) {

    const params = new URLSearchParams();

    params.set(
      "latitude",
      latitude
    );

    params.set(
      "longitude",
      longitude
    );

    params.set(
      "start_date",
      startDate
    );

    params.set(
      "end_date",
      endDate
    );

    params.set(
      "daily",
      "precipitation_sum"
    );

    params.set(
      "timezone",
      "auto"
    );

    params.set(
      "precipitation_unit",
      "mm"
    );

    params.set(
      "models",
      "era5"
    );

    const url =
      "https://archive-api.open-meteo.com/v1/archive?" +
      params.toString();


    console.log(
      "ERA5 historical request:",
      url
    );


    const response =
      await fetch(url);


    if (!response.ok) {

      let reason =
        "HTTP " +
        response.status;

      try {

        const errorData =
          await response.json();

        if (errorData.reason) {
          reason =
            errorData.reason;
        }

      } catch (error) {
        /* Ignore JSON parsing error */
      }


      throw new Error(
        "ERA5 Historical Weather API " +
        reason
      );
    }


    return response.json();
  }


  /* =======================================================
     CREATE ACTUAL DAILY MAP
     ======================================================= */

  function createActualMap(api) {

    const map = {};

    if (
      !api ||
      !api.daily ||
      !Array.isArray(
        api.daily.time
      )
    ) {
      return map;
    }


    const rain =
      api.daily.precipitation_sum ||
      [];


    api.daily.time.forEach(
      function (date, index) {

        const value =
          number(
            rain[index]
          );

        if (value !== null) {

          map[date] =
            value;
        }
      }
    );


    return map;
  }


  /* =======================================================
     FETCH PREVIOUS MODEL RUN
     ======================================================= */

  async function fetchPreviousRun(
    modelId,
    leadDays,
    latitude,
    longitude,
    startDate,
    endDate
  ) {

    const leadVariable =
      "precipitation_previous_day" +
      leadDays;


    const params =
      new URLSearchParams();

    params.set(
      "latitude",
      latitude
    );

    params.set(
      "longitude",
      longitude
    );

    params.set(
      "start_date",
      startDate
    );

    params.set(
      "end_date",
      endDate
    );

    params.set(
      "hourly",
      leadVariable
    );

    params.set(
      "timezone",
      "auto"
    );

    params.set(
      "precipitation_unit",
      "mm"
    );

    params.set(
      "models",
      modelId
    );


    const url =
      "https://previous-runs-api.open-meteo.com/v1/forecast?" +
      params.toString();


    console.log(
      "Previous Runs request:",
      modelId,
      leadVariable,
      url
    );


    const response =
      await fetch(url);


    if (!response.ok) {

      let reason =
        "HTTP " +
        response.status;

      try {

        const errorData =
          await response.json();

        if (errorData.reason) {
          reason =
            errorData.reason;
        }

      } catch (error) {
        /* Ignore JSON parsing error */
      }


      throw new Error(
        "Previous Runs API " +
        reason
      );
    }


    return response.json();
  }


  /* =======================================================
     DAILY FORECAST FROM PREVIOUS RUN
     ======================================================= */

  function createDailyForecastMap(
    api,
    leadDays
  ) {

    const result = {};

    if (
      !api ||
      !api.hourly ||
      !Array.isArray(
        api.hourly.time
      )
    ) {
      return result;
    }


    const leadVariable =
      "precipitation_previous_day" +
      leadDays;


    const times =
      api.hourly.time || [];

    const values =
      api.hourly[
        leadVariable
      ] || [];


    times.forEach(
      function (time, index) {

        const date =
          String(time)
            .slice(0, 10);

        const value =
          number(
            values[index]
          );


        if (value === null) {
          return;
        }


        if (
          !Object.prototype.hasOwnProperty.call(
            result,
            date
          )
        ) {
          result[date] = 0;
        }


        result[date] +=
          value;
      }
    );


    Object.keys(result).forEach(
      function (date) {

        result[date] =
          round(
            result[date],
            2
          );
      }
    );


    return result;
  }


  /* =======================================================
     METRICS
     ======================================================= */

  function calculateMetrics(
    records
  ) {

    if (!records.length) {

      return {
        samples: 0,
        mae: null,
        rmse: null,
        bias: null,
        rainAccuracy: null,
        hits: 0,
        misses: 0,
        falseAlarms: 0,
        correctNoRain: 0
      };
    }


    let absoluteError = 0;

    let squaredError = 0;

    let bias = 0;

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
          predicted === null ||
          actual === null
        ) {
          return;
        }


        const error =
          predicted - actual;


        absoluteError +=
          Math.abs(error);


        squaredError +=
          error * error;


        bias +=
          error;


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
    );


    const samples =
      records.length;


    const mae =
      absoluteError /
      samples;


    const rmse =
      Math.sqrt(
        squaredError /
        samples
      );


    const averageBias =
      bias /
      samples;


    const classificationTotal =
      hits +
      misses +
      falseAlarms +
      correctNoRain;


    const rainAccuracy =
      classificationTotal > 0
        ? (
            (
              hits +
              correctNoRain
            ) /
            classificationTotal
          ) * 100
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
          averageBias,
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

      correctNoRain
    };
  }


  /* =======================================================
     RUN HISTORICAL TEST
     ======================================================= */

  async function run(
    options = {}
  ) {

    const location =
      getLocation();


    if (!location) {

      throw new Error(
        "Pehle website par location search karo."
      );
    }


    const days =
      Math.min(
        7,
        Math.max(
          1,
          Number(
            options.days || 7
          )
        )
      );


    /*
      ERA5 has a data delay.
      We deliberately test older dates.
    */

    const end =
      new Date();


    end.setUTCDate(
      end.getUTCDate() -
      8
    );


    const start =
      new Date(end);


    start.setUTCDate(
      start.getUTCDate() -
      days +
      1
    );


    const startDate =
      dateString(start);

    const endDate =
      dateString(end);


    console.log(
      "======================================"
    );

    console.log(
      "Historical Model Accuracy V2"
    );

    console.log(
      "Location:",
      location
    );

    console.log(
      "Period:",
      startDate,
      "to",
      endDate
    );

    console.log(
      "======================================"
    );


    /* =====================================================
       STEP 1
       FETCH ERA5 ACTUAL
       ===================================================== */

    let actualAPI;

    try {

      actualAPI =
        await fetchHistoricalActual(
          location.latitude,
          location.longitude,
          startDate,
          endDate
        );

    } catch (error) {

      console.error(
        "ERA5 reference failed:",
        error
      );

      throw error;
    }


    const actualMap =
      createActualMap(
        actualAPI
      );


    console.log(
      "ERA5 actual rainfall:",
      actualMap
    );


    /* =====================================================
       RESULT OBJECT
       ===================================================== */

    const result = {

      version:
        "historical-accuracy-v2",

      generatedAt:
        new Date()
          .toISOString(),

      location,

      period: {
        startDate,
        endDate,
        days
      },

      reference:
        "Open-Meteo ERA5 reanalysis reference",

      referenceType:
        "reanalysis-not-rain-gauge",

      models: {},

      allRecords: []
    };


    /* =====================================================
       STEP 2
       MODEL TEST
       ===================================================== */

    for (
      const model of MODELS
    ) {

      result.models[
        model.name
      ] = {};


      for (
        const leadDays of LEAD_DAYS
      ) {

        if (
          leadDays > days
        ) {
          continue;
        }


        console.log(
          "Testing:",
          model.name,
          "Day",
          leadDays
        );


        let api;


        try {

          api =
            await fetchPreviousRun(
              model.id,
              leadDays,
              location.latitude,
              location.longitude,
              startDate,
              endDate
            );

        } catch (error) {

          console.warn(
            model.name,
            "Day",
            leadDays,
            "failed:",
            error
          );

          result.models[
            model.name
          ][
            "day" + leadDays
          ] = {
            samples: 0,
            mae: null,
            rmse: null,
            bias: null,
            rainAccuracy: null,
            hits: 0,
            misses: 0,
            falseAlarms: 0,
            correctNoRain: 0,
            error:
              error.message
          };

          continue;
        }


        const dailyForecasts =
          createDailyForecastMap(
            api,
            leadDays
          );


        const records = [];


        Object.keys(
          dailyForecasts
        ).forEach(
          function (validDate) {

            const actual =
              number(
                actualMap[
                  validDate
                ]
              );


            if (
              actual === null
            ) {
              return;
            }


            const predicted =
              number(
                dailyForecasts[
                  validDate
                ]
              );


            if (
              predicted === null
            ) {
              return;
            }


            const record = {

              date:
                validDate,

              model:
                model.name,

              modelId:
                model.id,

              leadDays,

              predictedRainMm:
                predicted,

              actualRainMm:
                actual
            };


            records.push(
              record
            );


            result.allRecords.push(
              record
            );
          }
        );


        result.models[
          model.name
        ][
          "day" + leadDays
        ] =
          calculateMetrics(
            records
          );


        console.log(
          model.name,
          "Day",
          leadDays,
          result.models[
            model.name
          ][
            "day" + leadDays
          ]
        );
      }
    }


    /* =====================================================
       SAVE
       ===================================================== */

    saveJSON(
      RESULT_KEY,
      result
    );


    console.log(
      "Historical accuracy result saved:",
      result
    );


    return result;
  }


  /* =======================================================
     PUBLIC API
     ======================================================= */

  window.RRP_HISTORICAL_ACCURACY = {

    run,

    getResults:
      function () {

        return loadJSON(
          RESULT_KEY
        );
      },

    clear:
      function () {

        localStorage.removeItem(
          RESULT_KEY
        );
      }
  };


  console.log(
    "RRP Historical Model Accuracy Engine V2 loaded."
  );

})();
