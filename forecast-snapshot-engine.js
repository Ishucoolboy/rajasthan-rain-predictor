/* =========================================================
   Rajasthan Rain Predictor
   Forecast Snapshot Engine
   ---------------------------------------------------------
   Purpose:
   - Save standardized forecast snapshots
   - Preserve location + forecast date
   - Store predicted rainfall
   - Keep model information
   - Used later by verification engine
   ========================================================= */

(function () {
  "use strict";

  const STORAGE_KEY =
    "rrp_forecast_snapshots_v1";

  const MAX_RECORDS = 1000;


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
        "Forecast snapshot read error:",
        error
      );

      return [];
    }
  }


  function save(data) {

    try {

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(data)
      );

    } catch (error) {

      console.warn(
        "Forecast snapshot save error:",
        error
      );
    }
  }


  function dateOnly(value) {

    if (!value) {
      return null;
    }

    const match =
      String(value).match(
        /^(\d{4}-\d{2}-\d{2})/
      );

    return match
      ? match[1]
      : null;
  }


  /* =======================================================
     LOCATION
     ======================================================= */

  function getLocation() {

    let latitude = null;
    let longitude = null;
    let name =
      "Selected Location";


    /*
      Main application data
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
      RRP_APP fallback
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
      Backtest engine fallback
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
     SNAPSHOT CREATION
     ======================================================= */

  function createSnapshot(data) {

    if (
      !data ||
      typeof data !==
      "object"
    ) {

      return null;
    }


    const location =
      getLocation();


    if (
      location.latitude ===
        null ||
      location.longitude ===
        null
    ) {

      return null;
    }


    /*
      Forecast date
    */

    const forecastDate =
      dateOnly(
        data.validDate ??
        data.date ??
        data.forecastDate ??
        data.time
      );


    if (!forecastDate) {
      return null;
    }


    /*
      Rainfall value
    */

    const predictedRain =
      number(
        data.forecastRainMm ??
        data.predictedRainMm ??
        data.rainfall ??
        data.precipitation ??
        data.rain_mm ??
        data.rain
      );


    if (
      predictedRain ===
      null
    ) {

      return null;
    }


    return {

      id:
        `${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 9)}`,

      forecastCreatedAt:
        new Date()
          .toISOString(),

      validDate:
        forecastDate,

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
        data.model ??
        "Combined",

      modelId:
        data.modelId ??
        null,

      forecastRainMm:
        round(
          Math.max(
            0,
            predictedRain
          ),
          2
        ),

      rainProbability:
        number(
          data.rainProbability ??
          data.precipitationProbability
        ),

      thunderstorm:
        Boolean(
          data.thunderstorm
        ),

      source:
        data.source ??
        "Rajasthan Rain Predictor",

      version:
        "snapshot-v1"

    };
  }


  /* =======================================================
     SAVE SNAPSHOT
     ======================================================= */

  function saveSnapshot(data) {

    const snapshot =
      createSnapshot(
        data
      );


    if (!snapshot) {

      console.warn(
        "Could not create forecast snapshot.",
        data
      );

      return null;
    }


    const records =
      load();


    /*
      Avoid duplicate snapshot.

      Same:
      location + date + model
    */

    const filtered =
      records.filter(
        function (item) {

          const sameLocation =
            Math.abs(
              number(
                item.latitude,
                999
              ) -
              snapshot.latitude
            ) < 0.01
            &&
            Math.abs(
              number(
                item.longitude,
                999
              ) -
              snapshot.longitude
            ) < 0.01;


          const sameDate =
            item.validDate ===
            snapshot.validDate;


          const sameModel =
            (
              item.modelId ||
              item.model
            ) ===
            (
              snapshot.modelId ||
              snapshot.model
            );


          return !(
            sameLocation &&
            sameDate &&
            sameModel
          );

        }
      );


    filtered.unshift(
      snapshot
    );


    /*
      Keep storage under control.
    */

    const finalRecords =
      filtered.slice(
        0,
        MAX_RECORDS
      );


    save(
      finalRecords
    );


    /*
      Notify verification engine.
    */

    window.dispatchEvent(
      new CustomEvent(
        "rrp:forecast-snapshot-saved",
        {
          detail:
            snapshot
        }
      )
    );


    return snapshot;
  }


  /* =======================================================
     SAVE CURRENT FORECAST
     ======================================================= */

  function saveCurrentForecast() {

    /*
      Try prediction engine first.
    */

    if (
      window.RRP_PREDICTION_ENGINE
    ) {

      try {

        const prediction =
          window.RRP_PREDICTION_ENGINE
            .getLatest();


        if (prediction) {

          /*
            If engine returns an array,
            save each model.
          */

          if (
            Array.isArray(
              prediction.models
            )
          ) {

            prediction.models.forEach(
              function (model) {

                saveSnapshot({

                  validDate:
                    prediction.validDate ??
                    prediction.date,

                  locationName:
                    prediction.locationName,

                  latitude:
                    prediction.latitude,

                  longitude:
                    prediction.longitude,

                  model:
                    model.name ??
                    model.model ??
                    "Unknown",

                  modelId:
                    model.id ??
                    model.modelId ??
                    null,

                  forecastRainMm:
                    model.rainfall ??
                    model.rainMm ??
                    model.precipitation ??
                    model.forecastRainMm,

                  rainProbability:
                    model.rainProbability ??
                    model.precipitationProbability,

                  thunderstorm:
                    model.thunderstorm,

                  source:
                    "Prediction Engine"

                });

              }
            );

            return;
          }


          /*
            Save combined prediction
          */

          saveSnapshot({

            validDate:
              prediction.validDate ??
              prediction.date,

            latitude:
              prediction.latitude,

            longitude:
              prediction.longitude,

            model:
              "Combined",

            modelId:
              "combined",

            forecastRainMm:
              prediction.rainfall ??
              prediction.rainMm ??
              prediction.precipitation ??
              prediction.forecastRainMm,

            rainProbability:
              prediction.rainProbability ??
              prediction.precipitationProbability,

            thunderstorm:
              prediction.thunderstorm,

            source:
              "Prediction Engine"

          });

        }

      } catch (error) {

        console.warn(
          "Prediction engine snapshot failed:",
          error
        );

      }

    }

  }


  /* =======================================================
     PUBLIC API
     ======================================================= */

  window.RRP_SNAPSHOT = {

    save:
      saveSnapshot,

    saveCurrent:
      saveCurrentForecast,

    getAll:
      load,

    clear:
      function () {

        localStorage.removeItem(
          STORAGE_KEY
        );

      },

    count:
      function () {

        return load().length;

      }

  };


  /* =======================================================
     EVENTS
     ======================================================= */

  window.addEventListener(
    "rrp:weather-updated",
    function () {

      /*
        Wait for prediction engine
        to finish rendering.
      */

      setTimeout(
        saveCurrentForecast,
        1500
      );

    }
  );


  /* =======================================================
     INIT
     ======================================================= */

  function initialize() {

    /*
      Do not automatically create
      fake or incomplete records.

      Only save when valid forecast data
      becomes available.
    */

    setTimeout(
      saveCurrentForecast,
      2000
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
