/* =========================================================
   Rajasthan Rain Predictor
   Forecast Snapshot Engine v2
   ---------------------------------------------------------
   Saves daily forecast snapshots for:
   ECMWF / GFS / ICON

   These snapshots are later matched against
   actual rainfall observations.
   ========================================================= */

(function () {

  "use strict";


  const STORAGE_KEY =
    "rrp_forecast_snapshots_v1";


  const MAX_RECORDS =
    1500;


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


  /* =======================================================
     HELPERS
     ======================================================= */

  function number(
    value,
    fallback = null
  ) {

    const n =
      Number(value);

    return Number.isFinite(n)
      ? n
      : fallback;

  }


  function round(
    value,
    digits = 2
  ) {

    const n =
      number(value);

    if (n === null) {
      return null;
    }

    const multiplier =
      Math.pow(
        10,
        digits
      );

    return (
      Math.round(
        n * multiplier
      ) / multiplier
    );

  }


  function load() {

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

      console.warn(
        "Snapshot read error:",
        error
      );

      return [];

    }

  }


  function save(
    records
  ) {

    try {

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(
          records
        )
      );

    } catch (error) {

      console.warn(
        "Snapshot save error:",
        error
      );

    }

  }


  /* =======================================================
     LOCATION
     ======================================================= */

  function getLocation() {

    let latitude =
      null;

    let longitude =
      null;

    let name =
      "Selected Location";


    /*
      Main application.
    */

    if (
      window.latestWeatherData
    ) {

      const data =
        window.latestWeatherData;


      latitude =
        data.latitude ??
        data.lat ??
        data.location?.latitude ??
        data.location?.lat;


      longitude =
        data.longitude ??
        data.lon ??
        data.lng ??
        data.location?.longitude ??
        data.location?.lon ??
        data.location?.lng;


      name =
        data.locationName ??
        data.name ??
        data.location?.name ??
        name;

    }


    /*
      RRP_APP fallback.
    */

    if (
      (
        latitude === null ||
        longitude === null
      ) &&
      window.RRP_APP
    ) {

      const candidates = [

        window.RRP_APP,

        window.RRP_APP.location,

        window.RRP_APP.currentWeather,

        window.RRP_APP.latestWeatherData

      ];


      for (
        const item of candidates
      ) {

        if (
          !item ||
          typeof item !==
          "object"
        ) {

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
          Number.isFinite(
            Number(lat)
          ) &&
          Number.isFinite(
            Number(lon)
          )
        ) {

          latitude =
            Number(lat);

          longitude =
            Number(lon);


          name =
            item.locationName ??
            item.name ??
            item.location?.name ??
            name;


          break;

        }

      }

    }


    /*
      Backtest fallback.
    */

    if (
      (
        latitude === null ||
        longitude === null
      ) &&
      window.RRP_BACKTEST
    ) {

      try {

        const location =
          window.RRP_BACKTEST
            .getLocation();


        if (location) {

          latitude =
            location.latitude;

          longitude =
            location.longitude;

          name =
            location.name ||
            name;

        }

      } catch (error) {

        // Ignore.

      }

    }


    return {

      latitude:
        number(latitude),

      longitude:
        number(longitude),

      name

    };

  }


  /* =======================================================
     FETCH MODEL FORECAST
     ======================================================= */

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

        daily:
          [
            "precipitation_sum",
            "rain_sum",
            "precipitation_probability_max",
            "weather_code"
          ].join(","),

        forecast_days:
          "4",

        timezone:
          "auto",

        models:
          model.id,

        precipitation_unit:
          "mm"

      });


    const response =
      await fetch(
        API +
        "?" +
        params.toString(),
        {
          cache:
            "no-store"
        }
      );


    if (!response.ok) {

      throw new Error(
        `${model.name} API error: ${response.status}`
      );

    }


    const data =
      await response.json();


    if (
      !data.daily ||
      !Array.isArray(
        data.daily.time
      )
    ) {

      throw new Error(
        `${model.name} daily forecast unavailable`
      );

    }


    return data;

  }


  /* =======================================================
     SAVE MODEL DAILY FORECASTS
     ======================================================= */

  async function saveModelForecast(
    location,
    model
  ) {

    const data =
      await fetchModel(
        location,
        model
      );


    const dates =
      data.daily.time || [];


    const rainfall =
      data.daily.precipitation_sum || [];


    const rainSum =
      data.daily.rain_sum || [];


    const probability =
      data.daily
        .precipitation_probability_max || [];


    const weatherCode =
      data.daily.weather_code || [];


    const records =
      load();


    const newRecords = [];


    for (
      let i = 0;
      i < dates.length;
      i++
    ) {

      const validDate =
        dates[i];


      if (!validDate) {
        continue;
      }


      const precipitation =
        Math.max(
          0,
          number(
            rainfall[i],
            0
          )
        );


      const rain =
        Math.max(
          0,
          number(
            rainSum[i],
            precipitation
          )
        );


      const rainProbability =
        number(
          probability[i],
          0
        );


      const record = {

        id:
          `${Date.now()}_${model.id}_${i}_${Math.random()
            .toString(36)
            .slice(2, 8)}`,

        forecastCreatedAt:
          new Date()
            .toISOString(),

        validDate,

        locationName:
          location.name,

        latitude:
          round(
            location.latitude,
            5
          ),

        longitude:
          round(
            location.longitude,
            5
          ),

        model:
          model.name,

        modelId:
          model.id,

        forecastRainMm:
          round(
            precipitation,
            2
          ),

        forecastRainOnlyMm:
          round(
            rain,
            2
          ),

        rainProbability:
          round(
            rainProbability,
            1
          ),

        weatherCode:
          number(
            weatherCode[i]
          ),

        source:
          "Open-Meteo forecast",

        version:
          "snapshot-v2"

      };


      newRecords.push(
        record
      );

    }


    /*
      Remove duplicate records for the same:
      location + valid date + model

      The newest forecast replaces
      the older forecast for that same
      location/date/model.
    */

    let combined =
      [
        ...newRecords,
        ...records
      ];


    const seen =
      new Set();


    combined =
      combined.filter(
        function (item) {

          const key =

            [
              round(
                item.latitude,
                2
              ),

              round(
                item.longitude,
                2
              ),

              item.validDate,

              item.modelId

            ].join("|");


          if (
            seen.has(key)
          ) {

            return false;

          }


          seen.add(key);

          return true;

        }
      );


    combined =
      combined.slice(
        0,
        MAX_RECORDS
      );


    save(
      combined
    );


    return newRecords;

  }


  /* =======================================================
     SAVE ALL MODELS
     ======================================================= */

  async function saveCurrentForecast() {

    const location =
      getLocation();


    if (
      location.latitude ===
        null ||
      location.longitude ===
        null
    ) {

      console.warn(
        "Snapshot engine: location unavailable."
      );

      return [];

    }


    const allRecords = [];


    for (
      const model of MODELS
    ) {

      try {

        const records =
          await saveModelForecast(
            location,
            model
          );


        allRecords.push(
          ...records
        );


        console.log(
          `✅ ${model.name}: ${records.length} daily snapshots saved.`
        );


      } catch (error) {

        console.warn(
          `❌ ${model.name} snapshot failed:`,
          error
        );

      }

    }


    /*
      Notify other engines.
    */

    window.dispatchEvent(
      new CustomEvent(
        "rrp:forecast-snapshots-updated",
        {
          detail: {
            location,
            records:
              allRecords
          }
        }
      )
    );


    return allRecords;

  }


  /* =======================================================
     PUBLIC API
     ======================================================= */

  window.RRP_SNAPSHOT = {

    save:
      saveCurrentForecast,

    saveCurrent:
      saveCurrentForecast,

    getAll:
      load,

    count:
      function () {

        return load().length;

      },

    clear:
      function () {

        localStorage.removeItem(
          STORAGE_KEY
        );

      }

  };


  /* =======================================================
     WEATHER UPDATE EVENT
     ======================================================= */

  window.addEventListener(
    "rrp:weather-updated",
    function () {

      /*
        Wait for location/weather
        processing to finish.
      */

      setTimeout(
        function () {

          saveCurrentForecast();

        },
        1500
      );

    }
  );


  /* =======================================================
     INITIALIZATION
     ======================================================= */

  function initialize() {

    /*
      Save model-wise daily forecasts
      after page load.
    */

    setTimeout(
      function () {

        saveCurrentForecast();

      },
      2500
    );

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
