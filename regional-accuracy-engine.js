(function () {
  "use strict";

  /*
    ==========================================================
    RAJASTHAN RAIN PREDICTOR
    REGIONAL ACCURACY ENGINE V4
    ==========================================================

    Features:

    - Rajasthan regional accuracy database
    - ECMWF / GFS / ICON
    - Day 1-7 historical metrics
    - Exact monitoring-location matching
    - Nearest monitoring-location fallback
    - Distance calculation
    - Selected village/city support
    - 41 Rajasthan monitoring locations
    - Automatic refresh after location search

    IMPORTANT:

    Regional accuracy is calculated against
    ERA5 / Open-Meteo reanalysis.

    It is NOT independent IMD/rain-gauge accuracy.

    If the searched village is not itself a monitoring
    location, the nearest monitoring location is shown
    as a regional proxy.
  */


  // ==========================================================
  // DATABASE
  // ==========================================================

  const DATABASE_URL =
    "regional-accuracy-database.json";


  // ==========================================================
  // MODELS
  // ==========================================================

  const MODEL_NAMES = [
    "ECMWF",
    "GFS",
    "ICON"
  ];


  // ==========================================================
  // MATCH SETTINGS
  // ==========================================================

  /*
    Exact coordinate matching tolerance.

    If searched location is within this distance
    from a monitoring location, it can be treated
    as an exact regional match.

    Otherwise nearest-location proxy is used.
  */

  const EXACT_MATCH_DISTANCE_KM = 5;


  /*
    Maximum distance for nearest regional proxy.

    Rajasthan-wide project ke liye 200 km tak
    nearest monitoring location useful regional
    reference ho sakti hai.

    Agar isse zyada distance ho to system
    regional proxy ko unavailable batayega.
  */

  const MAX_PROXY_DISTANCE_KM = 200;


  // ==========================================================
  // STATE
  // ==========================================================

  let database = null;

  let loading = false;


  // ==========================================================
  // LOGGING
  // ==========================================================

  function log(...args) {

    console.log(
      "[RRP Regional Accuracy V4]",
      ...args
    );

  }


  function warn(...args) {

    console.warn(
      "[RRP Regional Accuracy V4]",
      ...args
    );

  }


  // ==========================================================
  // NUMBER HELPER
  // ==========================================================

  function number(value) {

    const n =
      Number(value);

    return Number.isFinite(n)
      ? n
      : null;

  }


  // ==========================================================
  // HTML ESCAPE
  // ==========================================================

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


  // ==========================================================
  // FORMAT METRIC
  // ==========================================================

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
  // HAVERSINE DISTANCE
  // ==========================================================

  function distanceKm(
    lat1,
    lon1,
    lat2,
    lon2
  ) {

    const aLat =
      number(lat1);

    const aLon =
      number(lon1);

    const bLat =
      number(lat2);

    const bLon =
      number(lon2);


    if (
      aLat === null ||
      aLon === null ||
      bLat === null ||
      bLon === null
    ) {

      return null;

    }


    const earthRadiusKm =
      6371;


    const toRadians =
      function (degrees) {

        return (
          degrees *
          Math.PI /
          180
        );

      };


    const dLat =
      toRadians(
        bLat - aLat
      );


    const dLon =
      toRadians(
        bLon - aLon
      );


    const lat1Rad =
      toRadians(
        aLat
      );


    const lat2Rad =
      toRadians(
        bLat
      );


    const a =
      Math.sin(
        dLat / 2
      ) *
      Math.sin(
        dLat / 2
      ) +
      Math.cos(
        lat1Rad
      ) *
      Math.cos(
        lat2Rad
      ) *
      Math.sin(
        dLon / 2
      ) *
      Math.sin(
        dLon / 2
      );


    const c =
      2 *
      Math.atan2(
        Math.sqrt(a),
        Math.sqrt(
          1 - a
        )
      );


    return (
      earthRadiusKm *
      c
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


      database =
        data;


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


      database =
        null;


      return null;

    } finally {

      loading =
        false;

    }

  }


  // ==========================================================
  // SELECTED LOCATION FROM APP
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
  // FIND EXACT LOCATION
  // ==========================================================

  function findExactLocation(
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
      First coordinate-based matching.
    */

    let bestMatch =
      null;

    let bestDistance =
      Infinity;


    locations.forEach(
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

          return;

        }


        const distance =
          distanceKm(
            selectedLat,
            selectedLon,
            lat,
            lon
          );


        if (
          distance !== null &&
          distance < bestDistance
        ) {

          bestDistance =
            distance;

          bestMatch =
            location;

        }

      }
    );


    if (
      bestMatch &&
      bestDistance <=
        EXACT_MATCH_DISTANCE_KM
    ) {

      return {

        location:
          bestMatch,

        distanceKm:
          bestDistance,

        matchType:
          "exact"

      };

    }


    /*
      Name-based matching.

      This is useful if coordinates have
      slight differences but names are identical.
    */

    const selectedName =
      String(
        selected.name ||
        ""
      )
        .trim()
        .toLowerCase();


    if (selectedName) {

      const nameMatch =
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


      if (nameMatch) {

        const lat =
          number(
            nameMatch.location?.latitude
          );


        const lon =
          number(
            nameMatch.location?.longitude
          );


        const distance =
          distanceKm(
            selectedLat,
            selectedLon,
            lat,
            lon
          );


        return {

          location:
            nameMatch,

          distanceKm:
            distance,

          matchType:
            "exact"

        };

      }

    }


    return null;

  }


  // ==========================================================
  // FIND NEAREST LOCATION
  // ==========================================================

  function findNearestLocation(
    locations,
    selected
  ) {

    if (
      !selected ||
      !Array.isArray(
        locations
      ) ||
      !locations.length
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


    let nearest =
      null;

    let nearestDistance =
      Infinity;


    locations.forEach(
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

          return;

        }


        const distance =
          distanceKm(
            selectedLat,
            selectedLon,
            lat,
            lon
          );


        if (
          distance !== null &&
          distance <
            nearestDistance
        ) {

          nearestDistance =
            distance;

          nearest =
            location;

        }

      }
    );


    if (!nearest) {

      return null;

    }


    return {

      location:
        nearest,

      distanceKm:
        nearestDistance,

      matchType:
        "nearest"

    };

  }


  // ==========================================================
  // RESOLVE REGIONAL LOCATION
  // ==========================================================

  function resolveRegionalLocation(
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


    /*
      1. Exact match.
    */

    const exact =
      findExactLocation(
        locations,
        selected
      );


    if (exact) {

      log(
        "Exact regional match:",
        exact.location.location?.name,
        "|",
        exact.distanceKm?.toFixed(1),
        "km"
      );


      return exact;

    }


    /*
      2. Nearest monitoring location.
    */

    const nearest =
      findNearestLocation(
        locations,
        selected
      );


    if (!nearest) {

      return null;

    }


    if (
      nearest.distanceKm >
      MAX_PROXY_DISTANCE_KM
    ) {

      warn(
        "Nearest monitoring location is too far:",
        nearest.location.location?.name,
        nearest.distanceKm?.toFixed(1),
        "km"
      );


      return {

        ...nearest,

        matchType:
          "too_far"

      };

    }


    log(
      "Nearest regional proxy:",
      nearest.location.location?.name,
      "|",
      nearest.distanceKm?.toFixed(1),
      "km"
    );


    return nearest;

  }


  // ==========================================================
  // MODEL FINDER
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


  // ==========================================================
  // GET LEADS
  // ==========================================================

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


    let totalSamples =
      0;


    let maeWeighted =
      0;


    let rmseWeighted =
      0;


    let biasWeighted =
      0;


    let accuracyWeighted =
      0;


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
  // LEAD TABLE
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


    let rows =
      "";


    leads.forEach(
      function (lead) {

        const metrics =
          lead.metrics ||
          {};


        rows += `

          <tr>

            <td style="
              padding:9px;
            ">
              Day ${lead.lead_day}
            </td>


            <td style="
              padding:9px;
            ">
              ${metrics.samples ?? "—"}
            </td>


            <td style="
              padding:9px;
            ">
              ${formatMetric(
                metrics.mae_mm,
                3,
                " mm"
              )}
            </td>


            <td style="
              padding:9px;
            ">
              ${formatMetric(
                metrics.rmse_mm,
                3,
                " mm"
              )}
            </td>


            <td style="
              padding:9px;
            ">
              ${formatMetric(
                metrics.bias_mm,
                3,
                " mm"
              )}
            </td>


            <td style="
              padding:9px;
            ">
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

              <th style="
                padding:9px;
              ">
                Lead
              </th>


              <th style="
                padding:9px;
              ">
                Samples
              </th>


              <th style="
                padding:9px;
              ">
                MAE
              </th>


              <th style="
                padding:9px;
              ">
                RMSE
              </th>


              <th style="
                padding:9px;
              ">
                Bias
              </th>


              <th style="
                padding:9px;
              ">
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
  // SELECTED LOCATION HEADER
  // ==========================================================

  function renderSelectedLocationHeader(
    selected,
    resolved
  ) {

    if (
      !selected ||
      !resolved
    ) {

      return "";

    }


    const regional =
      resolved.location;


    const regionalName =
      regional.location?.name ||
      "Regional Location";


    const distance =
      number(
        resolved.distanceKm
      );


    /*
      Exact match.
    */

    if (
      resolved.matchType ===
      "exact"
    ) {

      return `

        <div style="
          margin-top:18px;
          padding:16px;
          background:white;
          border-radius:14px;
          border:1px solid #e5e7eb;
        ">

          <div style="
            font-size:12px;
            color:#16a34a;
            font-weight:700;
            margin-bottom:7px;
          ">

            ✅ Exact Regional Monitoring Match

          </div>


          <h3 style="
            margin:0 0 7px;
          ">

            📍 ${escapeHTML(
              selected.name
            )}

          </h3>


          <p style="
            margin:0;
            font-size:12px;
            color:#666;
          ">

            Historical accuracy data:
            <strong>
              ${escapeHTML(
                regionalName
              )}
            </strong>

            ${
              distance !== null
                ? " (" +
                  distance.toFixed(1) +
                  " km)"
                : ""
            }

          </p>

        </div>

      `;

    }


    /*
      Too far.
    */

    if (
      resolved.matchType ===
      "too_far"
    ) {

      return `

        <div style="
          margin-top:18px;
          padding:16px;
          background:white;
          border-radius:14px;
          border:1px solid #e5e7eb;
        ">

          <div style="
            font-size:12px;
            color:#b45309;
            font-weight:700;
            margin-bottom:7px;
          ">

            ⚠️ Regional Data Distance Warning

          </div>


          <h3 style="
            margin:0 0 7px;
          ">

            📍 ${escapeHTML(
              selected.name
            )}

          </h3>


          <p style="
            margin:0;
            font-size:12px;
            color:#666;
            line-height:1.6;
          ">

            Nearest monitoring location:

            <strong>
              ${escapeHTML(
                regionalName
              )}
            </strong>

            ${
              distance !== null
                ? " — " +
                  distance.toFixed(1) +
                  " km away."
                : ""
            }

            <br><br>

            Ye distance regional proxy ke liye
            kaafi zyada hai, isliye is location ke
            liye regional accuracy ko exact village
            accuracy nahi maana jana chahiye.

          </p>

        </div>

      `;

    }


    /*
      Nearest proxy.
    */

    return `

      <div style="
        margin-top:18px;
        padding:16px;
        background:white;
        border-radius:14px;
        border:1px solid #e5e7eb;
      ">

        <div style="
          font-size:12px;
          color:#2563eb;
          font-weight:700;
          margin-bottom:7px;
        ">

          📌 Nearest Regional Monitoring Location

        </div>


        <h3 style="
          margin:0 0 7px;
        ">

          📍 ${escapeHTML(
            selected.name
          )}

        </h3>


        <p style="
          margin:0;
          font-size:12px;
          color:#666;
          line-height:1.6;
        ">

          Is searched location ke liye nearest
          monitoring location:

          <strong>
            ${escapeHTML(
              regionalName
            )}
          </strong>

          ${
            distance !== null
              ? " — " +
                distance.toFixed(1) +
                " km away."
              : ""
          }

          <br><br>

          Neeche dikhaye gaye historical metrics
          <strong>
            ${escapeHTML(
              regionalName
            )}
          </strong>
          ke hain aur searched village/city ke
          liye <strong>regional proxy</strong> ke
          roop me use ho rahe hain.

        </p>

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


    if (!selected) {

      return `

        <div style="
          margin-top:18px;
          padding:16px;
          background:white;
          border-radius:14px;
          border:1px solid #e5e7eb;
        ">

          📍 Selected location available nahi hai.

        </div>

      `;

    }


    const resolved =
      resolveRegionalLocation(
        locations,
        selected
      );


    if (!resolved) {

      return `

        <div style="
          margin-top:18px;
          padding:16px;
          background:white;
          border-radius:14px;
          border:1px solid #e5e7eb;
        ">

          📍 Selected location ke liye
          regional historical data available nahi hai.

        </div>

      `;

    }


    const regionalLocation =
      resolved.location;


    /*
      If nearest is too far,
      show warning but do not present
      the data as exact.
    */

    const header =
      renderSelectedLocationHeader(
        selected,
        resolved
      );


    let cards =
      "";


    MODEL_NAMES.forEach(
      function (modelName) {

        const model =
          getModel(
            regionalLocation,
            modelName
          );


        cards +=
          renderModelCard(
            modelName,
            model
          );

      }
    );


    let tables =
      "";


    MODEL_NAMES.forEach(
      function (modelName) {

        const model =
          getModel(
            regionalLocation,
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

      ${header}


      <div style="
        margin-top:16px;
      ">

        <div style="
          padding:16px;
          background:white;
          border-radius:14px;
          border:1px solid #e5e7eb;
        ">

          <h3 style="
            margin:0 0 14px;
          ">

            📊 Historical Regional Accuracy

          </h3>


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
      [
        ...locations
      ].sort(
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
                📍 ${escapeHTML(
                  name
                )}
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

            GitHub Actions ka regional
            collection complete hone ke baad
            yahan data appear hoga.

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


    const selected =
      getSelectedLocation();


    const resolved =
      selected
        ? resolveRegionalLocation(
            locations,
            selected
          )
        : null;


    let matchInfo =
      "";


    if (
      resolved &&
      resolved.distanceKm !== null
    ) {

      if (
        resolved.matchType ===
        "exact"
      ) {

        matchInfo = `

          <div style="
            margin-top:10px;
            font-size:12px;
            color:#16a34a;
          ">

            ✅ Selected location has
            regional monitoring data.

          </div>

        `;

      } else if (
        resolved.matchType ===
        "nearest"
      ) {

        matchInfo = `

          <div style="
            margin-top:10px;
            font-size:12px;
            color:#2563eb;
          ">

            📌 Nearest monitoring location:
            <strong>
              ${escapeHTML(
                resolved.location.location?.name ||
                "Unknown"
              )}
            </strong>

            —
            ${resolved.distanceKm.toFixed(1)}
            km

          </div>

        `;

      }

    }


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


        ${matchInfo}


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

          Agar searched village/city
          monitoring list me nahi hai,
          to nearest monitoring location
          ka data regional proxy ke roop me
          use kiya jaata hai.

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


  // ==========================================================
  // GET DATABASE
  // ==========================================================

  function getDatabase() {

    return database;

  }


  // ==========================================================
  // GET SELECTED METRICS
  // ==========================================================

  function getSelectedMetrics() {

    if (!database) {

      return null;

    }


    const selected =
      getSelectedLocation();


    if (!selected) {

      return null;

    }


    const resolved =
      resolveRegionalLocation(
        database.locations || [],
        selected
      );


    if (!resolved) {

      return null;

    }


    const location =
      resolved.location;


    const result =
      {};


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

      selectedLocation:
        selected,

      regionalLocation:
        location.location,

      distanceKm:
        resolved.distanceKm,

      matchType:
        resolved.matchType,

      models:
        result

    };

  }


  // ==========================================================
  // INITIALISE
  // ==========================================================

  async function init() {

    log(
      "Regional Accuracy Engine V4 loading..."
    );


    await run();


    log(
      "Regional Accuracy Engine V4 ready."
    );

  }


  // ==========================================================
  // PUBLIC GLOBAL OBJECT
  // ==========================================================

  window.RRP_REGIONAL_ACCURACY = {

    run,

    getDatabase,

    getSelectedMetrics,

    findNearestLocation:

      function () {

        if (!database) {

          return null;

        }


        return findNearestLocation(
          database.locations || [],
          getSelectedLocation()
        );

      }

  };


  // ==========================================================
  // DOM READY
  // ==========================================================

  document.addEventListener(
    "DOMContentLoaded",
    function () {

      setTimeout(
        init,
        2500
      );

    }
  );


  // ==========================================================
  // WEATHER UPDATE
  // ==========================================================

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
