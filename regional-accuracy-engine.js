(function () {
  "use strict";

  /*
    Rajasthan Rain Predictor
    Regional Accuracy Engine V1

    Purpose:
    - Build location-wise verification statistics
    - Works with automatic-verification-engine.js
    - Tracks every location separately
    - ECMWF / GFS / ICON separately
    - Uses verified forecast records only

    Reference:
    ERA5 / Open-Meteo reanalysis

    IMPORTANT:
    This does NOT claim independent IMD/rain-gauge accuracy.
  */


  const VERIFICATION_KEY =
    "rrp_automatic_verification_v2";


  const MODEL_NAMES = [
    "ECMWF",
    "GFS",
    "ICON"
  ];


  const RAIN_THRESHOLD_MM = 0.1;


  function log(...args) {

    console.log(
      "[RRP Regional Accuracy]",
      ...args
    );

  }


  function getRecords() {

    try {

      const raw =
        localStorage.getItem(
          VERIFICATION_KEY
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
        "Regional accuracy records error:",
        error
      );


      return [];

    }

  }


  function number(value) {

    const n =
      Number(value);


    return Number.isFinite(n)
      ? n
      : null;

  }


  function getLocationKey(record) {

    const lat =
      number(
        record.latitude
      );


    const lon =
      number(
        record.longitude
      );


    const name =
      String(
        record.locationName ||
        "Unknown Location"
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


  function getLocationName(record) {

    return String(
      record.locationName ||
      "Unknown Location"
    ).trim();

  }


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
      function (record) {

        const forecast =
          number(
            record.forecastRainMm
          );


        const actual =
          number(
            record.actualRainMm
          );


        if (
          forecast === null ||
          actual === null
        ) {

          return;

        }


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


    /*
      Count only records that contain
      valid rainfall numbers.
    */

    const validRecords =
      records.filter(
        function (record) {

          return (
            number(
              record.forecastRainMm
            ) !== null &&
            number(
              record.actualRainMm
            ) !== null
          );

        }
      );


    if (!validRecords.length) {

      return {

        samples: 0,

        mae: null,

        rmse: null,

        bias: null,

        rainAccuracy: null,

        brierScore: null

      };

    }


    return {

      samples:
        validRecords.length,


      mae:
        absoluteError /
        validRecords.length,


      rmse:
        Math.sqrt(
          squaredError /
          validRecords.length
        ),


      bias:
        biasTotal /
        validRecords.length,


      rainAccuracy:
        (
          correctRain /
          validRecords.length
        ) * 100,


      brierScore:
        brierSamples
          ? brierTotal /
            brierSamples
          : null

    };

  }


  function buildDatabase(
    records
  ) {

    const locations = {};


    records.forEach(
      function (record) {

        const model =
          String(
            record.model ||
            ""
          ).toUpperCase();


        if (
          !MODEL_NAMES.includes(
            model
          )
        ) {

          return;

        }


        const key =
          getLocationKey(
            record
          );


        if (
          !locations[key]
        ) {

          locations[key] = {

            key,

            name:
              getLocationName(
                record
              ),

            latitude:
              number(
                record.latitude
              ),

            longitude:
              number(
                record.longitude
              ),

            models: {

              ECMWF: [],

              GFS: [],

              ICON: []

            }

          };

        }


        locations[key]
          .models[model]
          .push(record);

      }
    );


    return Object.values(
      locations
    );

  }


  function getSelectedLocation() {

    try {

      if (
        window.RRP_APP &&
        typeof
          window.RRP_APP
            .getCurrentLocation ===
          "function"
      ) {

        const location =
          window.RRP_APP
            .getCurrentLocation();


        if (
          location &&
          number(
            location.latitude
          ) !== null &&
          number(
            location.longitude
          ) !== null
        ) {

          return {

            name:
              location.name ||
              "Selected Location",

            latitude:
              number(
                location.latitude
              ),

            longitude:
              number(
                location.longitude
              )

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


  function findSelectedLocation(
    locations,
    selected
  ) {

    if (!selected) {
      return null;
    }


    const selectedLat =
      number(
        selected.latitude
      );


    const selectedLon =
      number(
        selected.longitude
      );


    if (
      selectedLat === null ||
      selectedLon === null
    ) {

      return null;

    }


    let exact =
      locations.find(
        function (location) {

          return (
            location.latitude !== null &&
            location.longitude !== null &&
            Math.abs(
              location.latitude -
              selectedLat
            ) < 0.01 &&
            Math.abs(
              location.longitude -
              selectedLon
            ) < 0.01
          );

        }
      );


    if (exact) {
      return exact;
    }


    const selectedName =
      String(
        selected.name ||
        ""
      )
        .trim()
        .toLowerCase();


    if (!selectedName) {
      return null;
    }


    exact =
      locations.find(
        function (location) {

          return (
            location.name
              .toLowerCase() ===
            selectedName
          );

        }
      );


    return exact || null;

  }


  function formatMetric(
    value,
    decimals,
    suffix
  ) {

    if (
      value === null ||
      value === undefined ||
      !Number.isFinite(
        Number(value)
      )
    ) {

      return "—";

    }


    return (
      Number(value)
        .toFixed(decimals) +
      (suffix || "")
    );

  }


  function renderModelCard(
    model,
    records
  ) {

    const metrics =
      calculateMetrics(
        records
      );


    return `

      <div style="
        padding:14px;
        background:white;
        border-radius:12px;
        border:1px solid #e5e7eb;
      ">

        <h4 style="
          margin:0 0 12px;
        ">
          🛰️ ${model}
        </h4>


        <div style="
          display:grid;
          grid-template-columns:
          repeat(2,minmax(0,1fr));
          gap:10px;
          font-size:13px;
        ">


          <div>
            <strong>
              ${metrics.samples}
            </strong>
            <br>
            <small>
              Samples
            </small>
          </div>


          <div>
            <strong>
              ${
                formatMetric(
                  metrics.rainAccuracy,
                  1,
                  "%"
                )
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
                formatMetric(
                  metrics.mae,
                  3,
                  " mm"
                )
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
                formatMetric(
                  metrics.rmse,
                  3,
                  " mm"
                )
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
                formatMetric(
                  metrics.bias,
                  3,
                  " mm"
                )
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
                formatMetric(
                  metrics.brierScore,
                  4,
                  ""
                )
              }
            </strong>
            <br>
            <small>
              Brier
            </small>
          </div>


        </div>

      </div>

    `;

  }


  function render() {

    const records =
      getRecords();


    const locations =
      buildDatabase(
        records
      );


    const selected =
      getSelectedLocation();


    const selectedLocation =
      findSelectedLocation(
        locations,
        selected
      );


    let container =
      document.getElementById(
        "regionalAccuracy"
      );


    if (!container) {

      container =
        document.createElement(
          "section"
        );


      container.id =
        "regionalAccuracy";


      container.style.margin =
        "24px 0";


      const historical =
        document.getElementById(
          "historicalAccuracy"
        );


      if (historical) {

        historical.parentNode.insertBefore(
          container,
          historical
        );

      } else {

        document.body.appendChild(
          container
        );

      }

    }


    /*
      No data yet
    */

    if (!records.length) {

      container.innerHTML = `

        <div style="
          padding:20px;
          background:#f4f7fb;
          border-radius:14px;
        ">

          <h3>
            📍 Rajasthan Regional Accuracy
          </h3>

          <p>
            Abhi automatic verification
            records available nahi hain.
          </p>

          <p style="
            font-size:13px;
            color:#666;
          ">
            Future forecast dates complete hone
            ke baad location-wise statistics
            automatically appear honge.
          </p>

        </div>

      `;

      return;

    }


    /*
      Selected location panel
    */

    let selectedHTML = "";


    if (selectedLocation) {

      selectedHTML = `

        <div style="
          margin-top:18px;
          padding:16px;
          background:white;
          border-radius:14px;
          border:1px solid #e5e7eb;
        ">

          <h3 style="
            margin:0 0 14px;
          ">
            📍 Selected Location
          </h3>


          <p>
            <strong>
              ${selectedLocation.name}
            </strong>
          </p>


          <div style="
            display:grid;
            gap:12px;
          ">


            ${renderModelCard(
              "ECMWF",
              selectedLocation.models.ECMWF
            )}


            ${renderModelCard(
              "GFS",
              selectedLocation.models.GFS
            )}


            ${renderModelCard(
              "ICON",
              selectedLocation.models.ICON
            )}

          </div>

        </div>

      `;

    } else {

      selectedHTML = `

        <div style="
          margin-top:18px;
          padding:16px;
          background:white;
          border-radius:14px;
          border:1px solid #e5e7eb;
        ">

          📍 Selected location ke liye
          verified records abhi available nahi hain.

        </div>

      `;

    }


    /*
      Location list
    */

    const locationCards =
      locations
        .sort(
          function (a, b) {

            return a.name
              .localeCompare(
                b.name
              );

          }
        )
        .map(
          function (location) {

            const total =
              MODEL_NAMES.reduce(
                function (
                  sum,
                  model
                ) {

                  return (
                    sum +
                    location
                      .models[model]
                      .length
                  );

                },
                0
              );


            return `

              <div style="
                padding:14px;
                background:white;
                border-radius:12px;
                border:1px solid #e5e7eb;
              ">

                <strong>
                  📍 ${location.name}
                </strong>


                <div style="
                  margin-top:8px;
                  font-size:12px;
                  color:#666;
                ">

                  Verified records:
                  <strong>
                    ${total}
                  </strong>

                </div>


                <div style="
                  margin-top:8px;
                  font-size:12px;
                ">

                  ECMWF:
                  ${location.models.ECMWF.length}

                  &nbsp; | &nbsp;

                  GFS:
                  ${location.models.GFS.length}

                  &nbsp; | &nbsp;

                  ICON:
                  ${location.models.ICON.length}

                </div>

              </div>

            `;

          }
        )
        .join("");


    container.innerHTML = `

      <div style="
        padding:20px;
        background:#f4f7fb;
        border-radius:14px;
      ">


        <h2 style="
          margin-top:0;
        ">
          📍 Rajasthan Regional Accuracy
        </h2>


        <p>
          Verified forecast records ko
          location-wise track kiya ja raha hai.
        </p>


        <div style="
          display:grid;
          grid-template-columns:
          repeat(auto-fit,minmax(150px,1fr));
          gap:10px;
          margin:16px 0;
        ">


          <div style="
            padding:14px;
            background:white;
            border-radius:10px;
          ">

            <strong>
              ${locations.length}
            </strong>

            <br>

            <small>
              Locations
            </small>

          </div>


          <div style="
            padding:14px;
            background:white;
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


        </div>


        ${selectedHTML}


        <div style="
          margin-top:18px;
        ">

          <h3>
            🗺️ Verified Locations
          </h3>


          <div style="
            display:grid;
            gap:10px;
          ">

            ${locationCards}

          </div>

        </div>


        <div style="
          margin-top:18px;
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

          Model statistics descriptive hain;
          kisi model ko automatic winner nahi
          maana ja raha hai.

        </div>


      </div>

    `;

  }


  function getDatabase() {

    return buildDatabase(
      getRecords()
    );

  }


  function getSelectedMetrics() {

    const records =
      getRecords();


    const locations =
      buildDatabase(
        records
      );


    const selected =
      getSelectedLocation();


    const location =
      findSelectedLocation(
        locations,
        selected
      );


    if (!location) {
      return null;
    }


    const result = {};


    MODEL_NAMES.forEach(
      function (model) {

        result[model] =
          calculateMetrics(
            location.models[model]
          );

      }
    );


    return {

      location: {
        name:
          location.name,

        latitude:
          location.latitude,

        longitude:
          location.longitude
      },

      models:
        result

    };

  }


  function init() {

    render();

    log(
      "Regional Accuracy Engine V1 loaded."
    );

  }


  window.RRP_REGIONAL_ACCURACY = {

    run:
      render,

    getDatabase,

    getSelectedMetrics

  };


  document.addEventListener(
    "DOMContentLoaded",
    function () {

      setTimeout(
        init,
        4500
      );

    }
  );


  window.addEventListener(
    "rrp:weather-updated",
    function () {

      setTimeout(
        render,
        3000
      );

    }
  );


})();
