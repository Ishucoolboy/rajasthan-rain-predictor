(function () {
  "use strict";

  /*
    Rajasthan Rain Predictor
    Regional Accuracy Engine V3

    Reads:
    regional-accuracy-database.json

    Shows:
    - Rajasthan monitoring locations
    - ECMWF / GFS / ICON
    - Day 1-7 historical metrics
    - Selected location metrics
    - Number of monitored locations

    Reference:
    ERA5 / Open-Meteo reanalysis

    IMPORTANT:
    This is not independent IMD/rain-gauge accuracy.
  */


  const DATABASE_URL =
    "regional-accuracy-database.json";


  const MODEL_NAMES = [
    "ECMWF",
    "GFS",
    "ICON"
  ];


  let database = null;

  let loading = false;


  // ==========================================================
  // LOGGING
  // ==========================================================

  function log(...args) {

    console.log(
      "[RRP Regional Accuracy V3]",
      ...args
    );

  }


  function warn(...args) {

    console.warn(
      "[RRP Regional Accuracy V3]",
      ...args
    );

  }


  // ==========================================================
  // HELPERS
  // ==========================================================

  function number(value) {

    const n = Number(value);

    return Number.isFinite(n)
      ? n
      : null;

  }


  function escapeHTML(value) {

    return String(
      value ?? ""
    )
      .replace(
        /&/g,
        "&amp;"
      )
      .replace(
        /</g,
        "&lt;"
      )
      .replace(
        />/g,
        "&gt;"
      )
      .replace(
        /"/g,
        "&quot;"
      )
      .replace(
        /'/g,
        "&#039;"
      );

  }


  function formatMetric(
    value,
    decimals = 2,
    suffix = ""
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
      Number(value).toFixed(
        decimals
      ) +
      suffix
    );

  }


  // ==========================================================
  // LOAD DATABASE
  // ==========================================================

  async function loadDatabase() {

    if (loading) {

      return database;

    }


    loading = true;


    try {

      const separator =
        DATABASE_URL.includes("?")
          ? "&"
          : "?";


      const url =
        DATABASE_URL +
        separator +
        "v=" +
        Date.now();


      log(
        "Loading regional database:",
        url
      );


      const response =
        await fetch(
          url,
          {
            cache: "no-store"
          }
        );


      if (!response.ok) {

        throw new Error(
          "Regional database HTTP " +
          response.status
        );

      }


      const data =
        await response.json();


      if (
        !data ||
        !Array.isArray(
          data.locations
        )
      ) {

        throw new Error(
          "Invalid regional database format."
        );

      }


      database = data;


      log(
        "Regional database loaded:",
        data.locations.length,
        "locations"
      );


      return database;

    } catch (error) {

      warn(
        "Regional database unavailable:",
        error
      );


      database = null;


      return null;

    } finally {

      loading = false;

    }

  }


  // ==========================================================
  // SELECTED LOCATION
  // ==========================================================

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

      warn(
        "Could not get selected location:",
        error
      );

    }


    return null;

  }


  // ==========================================================
  // FIND SELECTED LOCATION
  // ==========================================================

  function findSelectedLocation(
    locations,
    selected
  ) {

    if (
      !selected ||
      !Array.isArray(
        locations
      )
    ) {

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


    /*
      First try coordinate matching.
    */

    let match =
      locations.find(
        function (location) {

          const lat =
            number(
              location.location?.latitude
            );


          const lon =
            number(
              location.location?.longitude
            );


          if (
            lat === null ||
            lon === null
          ) {

            return false;

          }


          return (
            Math.abs(
              lat -
              selectedLat
            ) < 0.05 &&
            Math.abs(
              lon -
              selectedLon
            ) < 0.05
          );

        }
      );


    if (match) {

      return match;

    }


    /*
      Then try name matching.
    */

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


    match =
      locations.find(
        function (location) {

          const name =
            String(
              location.location?.name ||
              ""
            )
              .trim()
              .toLowerCase();


          return (
            name ===
            selectedName
          );

        }
      );


    return match || null;

  }


  // ==========================================================
  // MODEL HELPERS
  // ==========================================================

  function getModel(
    location,
    modelName
  ) {

    if (
      !location ||
      !Array.isArray(
        location.models
      )
    ) {

      return null;

    }


    return (
      location.models.find(
        function (model) {

          return (
            String(
              model.name ||
              ""
            ).toUpperCase() ===
            modelName
          );

        }
      ) ||
      null
    );

  }


  function getLeads(
    model
  ) {

    if (
      !model ||
      !Array.isArray(
        model.leads
      )
    ) {

      return [];

    }


    return model.leads;

  }


  // ==========================================================
  // MODEL SUMMARY
  // ==========================================================

  function calculateModelSummary(
    model
  ) {

    const leads =
      getLeads(
        model
      );


    const valid =
      leads.filter(
        function (lead) {

          return (
            lead &&
            lead.metrics &&
            number(
              lead.metrics.mae_mm
            ) !== null
          );

        }
      );


    if (!valid.length) {

      return {

        samples: 0,

        mae: null,

        rmse: null,

        bias: null,

        rainAccuracy: null

      };

    }


    let totalSamples = 0;

    let maeWeighted = 0;

    let rmseWeighted = 0;

    let biasWeighted = 0;

    let accuracyWeighted = 0;


    valid.forEach(
      function (lead) {

        const metrics =
          lead.metrics;


        const samples =
          number(
            metrics.samples
          ) || 0;


        totalSamples +=
          samples;


        if (
          number(
            metrics.mae_mm
          ) !== null
        ) {

          maeWeighted +=
            metrics.mae_mm *
            samples;

        }


        if (
          number(
            metrics.rmse_mm
          ) !== null
        ) {

          rmseWeighted +=
            metrics.rmse_mm *
            samples;

        }


        if (
          number(
            metrics.bias_mm
          ) !== null
        ) {

          biasWeighted +=
            metrics.bias_mm *
            samples;

        }


        if (
          number(
            metrics.rain_accuracy_percent
          ) !== null
        ) {

          accuracyWeighted +=
            metrics.rain_accuracy_percent *
            samples;

        }

      }
    );


    if (
      totalSamples <= 0
    ) {

      return {

        samples: 0,

        mae: null,

        rmse: null,

        bias: null,

        rainAccuracy: null

      };

    }


    return {

      samples:
        totalSamples,

      mae:
        maeWeighted /
        totalSamples,

      rmse:
        rmseWeighted /
        totalSamples,

      bias:
        biasWeighted /
        totalSamples,

      rainAccuracy:
        accuracyWeighted /
        totalSamples

    };

  }


  // ==========================================================
  // MODEL CARD
  // ==========================================================

  function renderModelCard(
    modelName,
    model
  ) {

    const summary =
      calculateModelSummary(
        model
      );


    return `

      <div style="
        padding:16px;
        background:white;
        border-radius:14px;
        border:1px solid #e5e7eb;
      ">

        <h3 style="
          margin:0 0 14px;
        ">
          🛰️ ${modelName}
        </h3>


        <div style="
          display:grid;
          grid-template-columns:
          repeat(2,minmax(0,1fr));
          gap:12px;
          font-size:13px;
        ">


          <div>
            <strong>
              ${summary.samples}
            </strong>

            <br>

            <small>
              Samples
            </small>
          </div>


          <div>
            <strong>
              ${formatMetric(
                summary.rainAccuracy,
                1,
                "%"
              )}
            </strong>

            <br>

            <small>
              Rain Accuracy
            </small>
          </div>


          <div>
            <strong>
              ${formatMetric(
                summary.mae,
                3,
                " mm"
              )}
            </strong>

            <br>

            <small>
              MAE
            </small>
          </div>


          <div>
            <strong>
              ${formatMetric(
                summary.rmse,
                3,
                " mm"
              )}
            </strong>

            <br>

            <small>
              RMSE
            </small>
          </div>


          <div>
            <strong>
              ${formatMetric(
                summary.bias,
                3,
                " mm"
              )}
            </strong>

            <br>

            <small>
              Bias
            </small>
          </div>


        </div>

      </div>

    `;

  }


  // ==========================================================
  // LEAD-TIME TABLE
  // ==========================================================

  function renderLeadTable(
    model
  ) {

    const leads =
      getLeads(
        model
      );


    if (!leads.length) {

      return `
        <p style="
          font-size:13px;
          color:#666;
        ">
          Historical lead-time data
          available nahi hai.
        </p>
      `;

    }


    let rows = "";


    leads.forEach(
      function (lead) {

        const metrics =
          lead.metrics ||
          {};


        rows += `

          <tr>

            <td style="padding:9px;">
              Day ${lead.lead_day}
            </td>

            <td style="padding:9px;">
              ${metrics.samples ?? "—"}
            </td>

            <td style="padding:9px;">
              ${formatMetric(
                metrics.mae_mm,
                3,
                " mm"
              )}
            </td>

            <td style="padding:9px;">
              ${formatMetric(
                metrics.rmse_mm,
                3,
                " mm"
              )}
            </td>

            <td style="padding:9px;">
              ${formatMetric(
                metrics.bias_mm,
                3,
                " mm"
              )}
            </td>

            <td style="padding:9px;">
              ${formatMetric(
                metrics.rain_accuracy_percent,
                1,
                "%"
              )}
            </td>

          </tr>

        `;

      }
    );


    return `

      <div style="
        overflow-x:auto;
        margin-top:12px;
      ">

        <table style="
          width:100%;
          border-collapse:collapse;
          font-size:12px;
        ">

          <thead>

            <tr>

              <th style="padding:9px;">
                Lead
              </th>

              <th style="padding:9px;">
                Samples
              </th>

              <th style="padding:9px;">
                MAE
              </th>

              <th style="padding:9px;">
                RMSE
              </th>

              <th style="padding:9px;">
                Bias
              </th>

              <th style="padding:9px;">
                Rain Accuracy
              </th>

            </tr>

          </thead>

          <tbody>

            ${rows}

          </tbody>

        </table>

      </div>

    `;

  }


  // ==========================================================
  // SELECTED LOCATION
  // ==========================================================

  function renderSelectedLocation(
    locations
  ) {

    const selected =
      getSelectedLocation();


    const location =
      findSelectedLocation(
        locations,
        selected
      );


    if (!location) {

      return `

        <div style="
          margin-top:18px;
          padding:16px;
          background:white;
          border-radius:14px;
          border:1px solid #e5e7eb;
        ">

          📍 Selected location ke liye
          regional historical data abhi
          available nahi hai.

        </div>

      `;

    }


    let cards = "";


    MODEL_NAMES.forEach(
      function (modelName) {

        const model =
          getModel(
            location,
            modelName
          );


        cards +=
          renderModelCard(
            modelName,
            model
          );

      }
    );


    let tables = "";


    MODEL_NAMES.forEach(
      function (modelName) {

        const model =
          getModel(
            location,
            modelName
          );


        if (!model) {
          return;
        }


        tables += `

          <div style="
            margin-top:16px;
            padding:14px;
            background:white;
            border-radius:14px;
            border:1px solid #e5e7eb;
          ">

            <h4 style="
              margin:0 0 10px;
            ">
              🛰️ ${modelName} — Day 1–7
            </h4>

            ${renderLeadTable(
              model
            )}

          </div>

        `;

      }
    );


    return `

      <div style="
        margin-top:18px;
      ">

        <div style="
          padding:16px;
          background:white;
          border-radius:14px;
          border:1px solid #e5e7eb;
        ">

          <h3 style="
            margin:0 0 8px;
          ">
            📍 ${escapeHTML(
              location.location?.name ||
              "Selected Location"
            )}
          </h3>


          <p style="
            margin:0 0 16px;
            font-size:12px;
            color:#666;
          ">

            Historical regional
            verification data

          </p>


          <div style="
            display:grid;
            grid-template-columns:
            repeat(auto-fit,minmax(160px,1fr));
            gap:12px;
          ">

            ${cards}

          </div>

        </div>


        ${tables}

      </div>

    `;

  }


  // ==========================================================
  // ALL LOCATIONS
  // ==========================================================

  function renderLocationList(
    locations
  ) {

    if (!locations.length) {

      return `
        <p>
          Monitoring locations ka data
          abhi available nahi hai.
        </p>
      `;

    }


    const sorted =
      [...locations].sort(
        function (a, b) {

          return String(
            a.location?.name ||
            ""
          ).localeCompare(
            String(
              b.location?.name ||
              ""
            )
          );

        }
      );


    return sorted
      .map(
        function (location) {

          const name =
            location.location?.name ||
            "Unknown";


          const models =
            Array.isArray(
              location.models
            )
              ? location.models
              : [];


          const totalSamples =
            models.reduce(
              function (
                total,
                model
              ) {

                return (
                  total +
                  getLeads(
                    model
                  ).reduce(
                    function (
                      sum,
                      lead
                    ) {

                      return (
                        sum +
                        (
                          number(
                            lead.metrics?.samples
                          ) ||
                          0
                        )
                      );

                    },
                    0
                  )
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
                📍 ${escapeHTML(name)}
              </strong>


              <div style="
                margin-top:7px;
                font-size:12px;
                color:#666;
              ">

                ${totalSamples}
                lead-time samples

              </div>


              <div style="
                margin-top:7px;
                font-size:12px;
              ">

                ECMWF:
                ${getLeads(
                  getModel(
                    location,
                    "ECMWF"
                  )
                ).length}

                &nbsp; | &nbsp;

                GFS:
                ${getLeads(
                  getModel(
                    location,
                    "GFS"
                  )
                ).length}

                &nbsp; | &nbsp;

                ICON:
                ${getLeads(
                  getModel(
                    location,
                    "ICON"
                  )
                ).length}

              </div>

            </div>

          `;

        }
      )
      .join("");

  }


  // ==========================================================
  // RENDER
  // ==========================================================

  function render() {

    const container =
      document.getElementById(
        "regionalAccuracy"
      );


    if (!container) {

      return;

    }


    if (!database) {

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
            Regional accuracy database
            abhi load nahi hui.
          </p>


          <p style="
            font-size:13px;
            color:#666;
          ">

            GitHub Actions ka first
            regional collection complete
            hone ke baad yahan data appear hoga.

          </p>

        </div>

      `;

      return;

    }


    const locations =
      Array.isArray(
        database.locations
      )
        ? database.locations
        : [];


    const generatedAt =
      database.generated_at ||
      "Not available";


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

          Rajasthan ke monitoring
          locations ka historical
          forecast verification database.

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
              Monitored Locations
            </small>

          </div>


          <div style="
            padding:14px;
            background:white;
            border-radius:10px;
          ">

            <strong>
              3
            </strong>

            <br>

            <small>
              Weather Models
            </small>

          </div>


          <div style="
            padding:14px;
            background:white;
            border-radius:10px;
          ">

            <strong>
              1–7
            </strong>

            <br>

            <small>
              Lead Days
            </small>

          </div>


        </div>


        ${renderSelectedLocation(
          locations
        )}


        <div style="
          margin-top:20px;
        ">

          <h3>
            🗺️ Monitored Locations
          </h3>


          <div style="
            display:grid;
            gap:10px;
          ">

            ${renderLocationList(
              locations
            )}

          </div>

        </div>


        <div style="
          margin-top:18px;
          padding:14px;
          border-radius:12px;
          background:rgba(255,193,7,.10);
          border:1px solid rgba(255,193,7,.20);
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

          <br><br>

          Last database update:
          <strong>
            ${escapeHTML(
              generatedAt
            )}
          </strong>

        </div>


      </div>

    `;

  }


  // ==========================================================
  // PUBLIC API
  // ==========================================================

  async function run() {

    await loadDatabase();

    render();

    return database;

  }


  function getDatabase() {

    return database;

  }


  function getSelectedMetrics() {

    if (!database) {

      return null;

    }


    const location =
      findSelectedLocation(
        database.locations || [],
        getSelectedLocation()
      );


    if (!location) {

      return null;

    }


    const result = {};


    MODEL_NAMES.forEach(
      function (modelName) {

        result[modelName] =
          calculateModelSummary(
            getModel(
              location,
              modelName
            )
          );

      }
    );


    return {

      location:
        location.location,

      models:
        result

    };

  }


  // ==========================================================
  // INITIALISE
  // ==========================================================

  async function init() {

    log(
      "Regional Accuracy Engine V3 loading..."
    );


    await run();


    log(
      "Regional Accuracy Engine V3 ready."
    );

  }


  window.RRP_REGIONAL_ACCURACY = {

    run,

    getDatabase,

    getSelectedMetrics

  };


  document.addEventListener(
    "DOMContentLoaded",
    function () {

      setTimeout(
        init,
        2500
      );

    }
  );


  window.addEventListener(
    "rrp:weather-updated",
    function () {

      setTimeout(
        run,
        2500
      );

    }
  );


})();
