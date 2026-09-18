/* =========================================================
   Rajasthan Rain Predictor
   Historical Model Accuracy Engine
   ---------------------------------------------------------
   Purpose:
   - Evaluate historical ECMWF / GFS / ICON forecasts
   - Compare previous model runs with historical weather
   - Test fixed lead times
   - No invented accuracy
   ========================================================= */

(function () {
  "use strict";

  const RESULT_KEY =
    "rrp_historical_model_accuracy_v1";

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

  const LEAD_DAYS = [1, 2, 3, 4, 5, 6, 7];

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


  function saveJSON(
    key,
    value
  ) {

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


  function loadJSON(
    key
  ) {

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


  function dateString(
    date
  ) {

    return (
      date
        .toISOString()
        .slice(0, 10)
    );

  }


  function subtractDays(
    date,
    days
  ) {

    const d =
      new Date(date);

    d.setUTCDate(
      d.getUTCDate() -
      days
    );

    return d;

  }


  /* =======================================================
     GET CURRENT LOCATION
     ======================================================= */

  function getLocation() {

    if (
      window.latestWeatherData
    ) {

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


    if (
      window.RRP_BACKTEST
    ) {

      const location =
        window.RRP_BACKTEST
          .getLocation();


      if (location) {
        return location;
      }

    }


    return null;

  }


  /* =======================================================
     FETCH PREVIOUS RUNS
     ======================================================= */

  async function fetchPreviousRuns(
    modelId,
    latitude,
    longitude,
    startDate,
    endDate
  ) {

    const url =
      "https://previous-runs-api.open-meteo.com/v1/forecast" +
      "?latitude=" +
      encodeURIComponent(latitude) +
      "&longitude=" +
      encodeURIComponent(longitude) +
      "&start_date=" +
      encodeURIComponent(startDate) +
      "&end_date=" +
      encodeURIComponent(endDate) +
      "&hourly=" +
      encodeURIComponent(
        "precipitation"
      ) +
      "&timezone=auto" +
      "&precipitation_unit=mm" +
      "&models=" +
      encodeURIComponent(modelId);


    const response =
      await fetch(url);


    if (!response.ok) {

      throw new Error(
        "Previous Runs API HTTP " +
        response.status
      );

    }


    return response.json();

  }


  /* =======================================================
     FETCH HISTORICAL ACTUAL
     -------------------------------------------------------
     IMPORTANT:
     This is reanalysis reference data,
     NOT a rain-gauge measurement.
     ======================================================= */

  async function fetchHistoricalActual(
    latitude,
    longitude,
    startDate,
    endDate
  ) {

    const url =
      "https://archive-api.open-meteo.com/v1/archive" +
      "?latitude=" +
      encodeURIComponent(latitude) +
      "&longitude=" +
      encodeURIComponent(longitude) +
      "&start_date=" +
      encodeURIComponent(startDate) +
      "&end_date=" +
      encodeURIComponent(endDate) +
      "&daily=" +
      encodeURIComponent(
        "precipitation_sum,rain_sum"
      ) +
      "&timezone=auto" +
      "&precipitation_unit=mm";


    const response =
      await fetch(url);


    if (!response.ok) {

      throw new Error(
        "Historical Weather API HTTP " +
        response.status
      );

    }


    return response.json();

  }


  /* =======================================================
     DAILY SUM
     ======================================================= */

  function dailyRainFromHourly(
    api,
    targetDate
  ) {

    if (
      !api ||
      !api.hourly ||
      !Array.isArray(
        api.hourly.time
      ) ||
      !Array.isArray(
        api.hourly.precipitation
      )
    ) {

      return null;

    }


    let total = 0;

    let found = false;


    api.hourly.time.forEach(
      function (
        time,
        index
      ) {

        if (
          String(time)
            .slice(0, 10) ===
          targetDate
        ) {

          const value =
            number(
              api.hourly
                .precipitation[index]
            );


          if (value !== null) {

            total += value;

            found = true;

          }

        }

      }
    );


    return found
      ? round(total, 2)
      : null;

  }


  /* =======================================================
     HISTORICAL ACTUAL MAP
     ======================================================= */

  function createActualMap(
    api
  ) {

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
      api.daily.rain_sum ||
      api.daily.precipitation_sum ||
      [];


    api.daily.time.forEach(
      function (
        date,
        index
      ) {

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
     MODEL METRICS
     ======================================================= */

  function calculateMetrics(
    records
  ) {

    if (
      !records.length
    ) {

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
          predicted -
          actual;


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
      classificationTotal
        ? (
            (
              hits +
              correctNoRain
            ) /
            classificationTotal
          ) *
          100
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
            options.days ||
            7
          )
        )
      );


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
      "Historical accuracy test:",
      location.name,
      startDate,
      endDate
    );


    const actualAPI =
      await fetchHistoricalActual(
        location.latitude,
        location.longitude,
        startDate,
        endDate
      );


    const actualMap =
      createActualMap(
        actualAPI
      );


    const result = {

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
        "Open-Meteo ERA5/reanalysis reference",

      models: {},

      allRecords: []

    };


    /*
      Test every model.
    */

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
          leadDays >
          days
        ) {

          continue;

        }


        /*
          Fetch previous-run archive.
        */

        let api;


        try {

          api =
            await fetchPreviousRuns(
              model.id,
              location.latitude,
              location.longitude,
              startDate,
              endDate
            );

        } catch (error) {

          console.warn(
            model.name,
            "lead",
            leadDays,
            error
          );

          continue;

        }


        /*
          Previous Runs API stores
          fixed lead-time forecast values.
        */

        const records = [];


        if (
          !api ||
          !api.hourly
        ) {

          continue;

        }


        const times =
          api.hourly.time || [];


        const precipitation =
          api.hourly.precipitation || [];


        /*
          Try to locate lead-time
          variable.
        */

        const leadKey =
          "precipitation_previous_day" +
          leadDays;


        const leadValues =
          api.hourly[
            leadKey
          ];


        if (
          !Array.isArray(
            leadValues
          )
        ) {

          console.warn(
            "Lead-time variable unavailable:",
            model.name,
            leadKey
          );

          continue;

        }


        /*
          Aggregate each valid date.
        */

        const dailyForecasts = {};


        times.forEach(
          function (
            time,
            index
          ) {

            const date =
              String(time)
                .slice(0, 10);


            const value =
              number(
                leadValues[index]
              );


            if (
              value === null
            ) {

              return;

            }


            if (
              !dailyForecasts[date]
            ) {

              dailyForecasts[date] =
                0;

            }


            dailyForecasts[date] +=
              value;

          }
        );


        Object.keys(
          dailyForecasts
        ).forEach(
          function (
            validDate
          ) {

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
              round(
                dailyForecasts[
                  validDate
                ],
                2
              );


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
          "day" +
          leadDays
        ] =
          calculateMetrics(
            records
          );

      }

    }


    saveJSON(
      RESULT_KEY,
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
    "RRP Historical Model Accuracy Engine loaded."
  );

})();
